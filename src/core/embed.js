// DINOv2 입력 전처리와 출력 토큰 → 컷 특징 변환.
import { resize } from './image.js';
import { CENTERS } from './centers.js';

export const SIZE = 224, GRID = 16, PATCH = 14, DIM = 384, NP = GRID * GRID;
export const LAYERS = ['tokens4', 'tokens8', 'tokens12'];
const MEAN = [0.485, 0.456, 0.406], STD = [0.229, 0.224, 0.225];

/**
 * 컷을 비율 유지(레터박스)로 224x224 텐서로 만든다.
 * @returns {{ tensor: Float32Array, mask: Uint8Array }} mask: 0=패딩, 1=평탄(여백), 2=내용 있음
 */
export function preprocess(panel) {
  const s = Math.min(SIZE / panel.width, SIZE / panel.height);
  const w = Math.max(PATCH, Math.round(panel.width * s)), h = Math.max(PATCH, Math.round(panel.height * s));
  const small = resize(panel, w, h);
  const ox = (SIZE - w) >> 1, oy = (SIZE - h) >> 1;
  const tensor = new Float32Array(3 * SIZE * SIZE); // 패딩 = 0 (정규화 후 평균색)
  const gray = new Float32Array(SIZE * SIZE).fill(-1);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const p = (y * w + x) * 4, o = (y + oy) * SIZE + x + ox;
    const r = small.data[p], g = small.data[p + 1], b = small.data[p + 2];
    tensor[o] = (r / 255 - MEAN[0]) / STD[0];
    tensor[SIZE * SIZE + o] = (g / 255 - MEAN[1]) / STD[1];
    tensor[2 * SIZE * SIZE + o] = (b / 255 - MEAN[2]) / STD[2];
    gray[o] = 0.299 * r + 0.587 * g + 0.114 * b;
  }
  const mask = new Uint8Array(NP);
  for (let i = 0; i < GRID; i++) for (let j = 0; j < GRID; j++) {
    let n = 0, sum = 0, sq = 0;
    for (let y = i * PATCH; y < (i + 1) * PATCH; y++) for (let x = j * PATCH; x < (j + 1) * PATCH; x++) {
      const v = gray[y * SIZE + x];
      if (v >= 0) { n++; sum += v; sq += v * v; }
    }
    if (n < PATCH * PATCH * 0.6) continue;
    const std = Math.sqrt(Math.max(0, sq / n - (sum / n) ** 2));
    mask[i * GRID + j] = std < 5 ? 1 : 2;
  }
  return { tensor, mask };
}

/** 패치 토큰(CLS 제외)을 L2 정규화해 Int8로 양자화. 코사인 유사도는 스케일과 무관하므로 벡터별 스케일을 쓴다. */
function quantizePatches(tokens, mask, center) {
  const out = new Int8Array(NP * DIM);
  for (let p = 0; p < NP; p++) {
    if (!mask[p]) continue;
    const src = (p + 1) * DIM;
    let mx = 1e-9;
    for (let d = 0; d < DIM; d++) mx = Math.max(mx, Math.abs(tokens[src + d] - center[d]));
    const k = 127 / mx;
    for (let d = 0; d < DIM; d++) out[p * DIM + d] = Math.round((tokens[src + d] - center[d]) * k);
  }
  return out;
}

/** Int8 패치 행렬의 패치별 L2 노름 (0이면 빈 패치). */
export function norms(q) {
  const out = new Float32Array(NP);
  for (let p = 0; p < NP; p++) {
    let n = 0;
    for (let d = p * DIM, e = d + DIM; d < e; d++) n += q[d] * q[d];
    out[p] = Math.sqrt(n);
  }
  return out;
}

/** 저장된 특징에 매칭용 노름을 붙인다. */
export function hydrate(f) {
  f.n12 ??= norms(f.p12);
  if (f.p4) f.n4 ??= norms(f.p4);
  return f;
}

/**
 * 모델 출력 → 컷 특징.
 * g: 층별 전역 기술자(내용 패치 평균, L2 정규화) 3x384 — GILA식 다층 전역 표현
 * p4/p12: 패치 토큰 (질감 층 / 구도 층)
 */
export function featurize(outputs, mask) {
  const g = new Float32Array(LAYERS.length * DIM);
  let any = false;
  for (let p = 0; p < NP; p++) if (mask[p] === 2) any = true;
  LAYERS.forEach((name, l) => {
    const t = outputs[name];
    let cnt = 0;
    for (let p = 0; p < NP; p++) {
      if (any ? mask[p] !== 2 : !mask[p]) continue;
      cnt++;
      for (let d = 0; d < DIM; d++) g[l * DIM + d] += t[(p + 1) * DIM + d] - CENTERS[name][d];
    }
    let n = 0;
    for (let d = 0; d < DIM; d++) n += g[l * DIM + d] ** 2;
    n = Math.sqrt(n) || 1;
    for (let d = 0; d < DIM; d++) g[l * DIM + d] /= n;
  });
  return { g, p4: quantizePatches(outputs.tokens4, mask, CENTERS.tokens4), p12: quantizePatches(outputs.tokens12, mask, CENTERS.tokens12), mask };
}
