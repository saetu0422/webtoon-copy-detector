// 컷 쌍 비교: 전역 유사도 → 패치 대응 → 기하 검증 → 정렬된 패치 유사도 맵.
import { GRID, DIM, NP } from './embed.js';

export function globalSim(a, b) {
  // 층 8, 12 전역 기술자의 평균 코사인 (층 4는 화풍/질감 쪽)
  let s8 = 0, s12 = 0, s4 = 0;
  for (let d = 0; d < DIM; d++) {
    s4 += a[d] * b[d]; s8 += a[DIM + d] * b[DIM + d]; s12 += a[2 * DIM + d] * b[2 * DIM + d];
  }
  return { sem: (s8 + s12) / 2, style: s4 };
}

/** Int8 패치 i, j의 코사인 유사도. */
function cosq(A, nA, i, B, nB, j) {
  let s = 0;
  const a = i * DIM, b = j * DIM;
  for (let d = 0; d < DIM; d++) s += A[a + d] * B[b + d];
  return s / (nA[i] * nB[j] || 1);
}

function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
}

/**
 * q, c: { p12: Int8Array(NP*DIM), n12: Float32Array(NP), p4?, n4?, mask }
 * 변환 모델: x' = f·s·x + tx, y' = s·y + ty  (f=-1이면 좌우반전)
 */
export function matchPair(q, c, { tauNN = 0.35, tauCopy = 0.6, tol = 1.3, iters = 300 } = {}) {
  const qi = [], ci = [];
  for (let p = 0; p < NP; p++) { if (q.mask[p] === 2) qi.push(p); if (c.mask[p] === 2) ci.push(p); }
  const empty = { coverage: 0, struct: 0, texture: 0, overlap: 0, heat: null, heatC: null, T: null, inliers: 0 };
  if (qi.length < 6 || ci.length < 6) return empty;

  // 1) 패치 친화도 행렬에서 q→c 최근접 이웃
  const M = [];
  for (const i of qi) {
    let best = -1, bs = -2;
    for (const j of ci) { const s = cosq(q.p12, q.n12, i, c.p12, c.n12, j); if (s > bs) { bs = s; best = j; } }
    if (bs >= tauNN) M.push([i % GRID, (i / GRID) | 0, best % GRID, (best / GRID) | 0, bs]);
  }
  if (M.length < 4) return empty;

  // 2) RANSAC: 스케일 + 평행이동 (+반전)
  const rand = rng(M.length * 7919 + qi.length);
  let bestT = null, bestIn = 0;
  for (let it = 0; it < iters; it++) {
    const a = M[(rand() * M.length) | 0], b = M[(rand() * M.length) | 0];
    const dqx = b[0] - a[0], dqy = b[1] - a[1], dcx = b[2] - a[2], dcy = b[3] - a[3];
    const dq = Math.hypot(dqx, dqy), dc = Math.hypot(dcx, dcy);
    if (dq < 2 || dc < 1) continue;
    const s = dc / dq;
    if (s < 0.4 || s > 2.5) continue;
    for (const f of [1, -1]) {
      const tx = a[2] - f * s * a[0], ty = a[3] - s * a[1];
      if (Math.abs(f * s * b[0] + tx - b[2]) > tol || Math.abs(s * b[1] + ty - b[3]) > tol) continue;
      let n = 0;
      for (const m of M) if (Math.abs(f * s * m[0] + tx - m[2]) <= tol && Math.abs(s * m[1] + ty - m[3]) <= tol) n++;
      if (n > bestIn) { bestIn = n; bestT = { f, s, tx, ty }; }
    }
  }
  if (!bestT || bestIn < 4) return empty;

  // 최소제곱으로 변환 다듬기
  {
    const { f } = bestT;
    const I = M.filter((m) => Math.abs(f * bestT.s * m[0] + bestT.tx - m[2]) <= tol && Math.abs(bestT.s * m[1] + bestT.ty - m[3]) <= tol);
    let mx = 0, my = 0, cx = 0, cy = 0;
    for (const m of I) { mx += f * m[0]; my += m[1]; cx += m[2]; cy += m[3]; }
    mx /= I.length; my /= I.length; cx /= I.length; cy /= I.length;
    let num = 0, den = 0;
    for (const m of I) {
      num += (f * m[0] - mx) * (m[2] - cx) + (m[1] - my) * (m[3] - cy);
      den += (f * m[0] - mx) ** 2 + (m[1] - my) ** 2;
    }
    if (den > 1e-6 && num / den > 0.35 && num / den < 2.8) {
      const s = num / den;
      bestT = { f, s, tx: cx - s * mx, ty: cy - s * my };
    }
  }

  // 3) 변환으로 정렬한 뒤 패치별 유사도 (구도 층 12 / 질감 층 4)
  const { f, s, tx, ty } = bestT;
  const heat = new Float32Array(NP).fill(-1);
  const hit = new Uint8Array(NP), heatC = new Float32Array(NP).fill(-1);
  let nOver = 0, sum12 = 0, sum4 = 0, nCopy = 0;
  for (const i of qi) {
    const x = i % GRID, y = (i / GRID) | 0;
    const X = Math.round(f * s * x + tx), Y = Math.round(s * y + ty);
    if (X < 0 || Y < 0 || X >= GRID || Y >= GRID) continue;
    let b12 = -2, bj = -1;
    // 양자화 오차를 감안해 3x3 이웃 중 최댓값
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const xx = X + dx, yy = Y + dy;
      if (xx < 0 || yy < 0 || xx >= GRID || yy >= GRID) continue;
      const j = yy * GRID + xx;
      if (c.mask[j] !== 2) continue;
      const v = cosq(q.p12, q.n12, i, c.p12, c.n12, j);
      if (v > b12) { b12 = v; bj = j; }
    }
    if (bj < 0) continue;
    nOver++;
    heat[i] = b12;
    sum12 += b12;
    if (q.p4 && c.p4) sum4 += cosq(q.p4, q.n4, i, c.p4, c.n4, bj);
    if (b12 >= tauCopy) { nCopy++; hit[bj] = 1; heatC[bj] = Math.max(heatC[bj], b12); }
  }
  if (!nOver) return empty;
  let nHit = 0;
  for (const j of ci) nHit += hit[j];
  return {
    coverage: Math.max(nCopy / qi.length, nHit / ci.length), // 복제된 것으로 보이는 면적 비율
    covQ: nCopy / qi.length, covC: nHit / ci.length,
    struct: sum12 / nOver, texture: sum4 / nOver, overlap: nOver / qi.length,
    heat, heatC, T: bestT, inliers: bestIn,
  };
}
