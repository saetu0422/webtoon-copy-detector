// AI 생성 탐지(실험적): 사전학습 분류기를 여러 시야에 적용하고 반증 원칙으로 집계 (FATAS식 테스트 시점 집계).
import { crop, resize } from './image.js';

export const AI_SIZE = 512;
export const AI_THRESHOLD = 0.5;

/** 컷 하나에서 분류기 입력 시야를 만든다: 전체(중앙 정사각 축소) + 원해상도 512 조각. */
export function aiViews(panel, maxNative = 1) {
  const { width: w, height: h } = panel, s = Math.min(w, h), views = [];
  const sq = crop(panel, (w - s) >> 1, (h - s) >> 1, s, s);
  views.push(s === AI_SIZE ? sq : resize(sq, AI_SIZE, AI_SIZE));
  if (s >= AI_SIZE * 1.15) {
    const pos = [[0.5, 0.5], [0, 0], [1, 1]].slice(0, maxNative);
    for (const [fx, fy] of pos) views.push(crop(panel, Math.round((w - AI_SIZE) * fx), Math.round((h - AI_SIZE) * fy), AI_SIZE, AI_SIZE));
  }
  return views;
}

export function aiTensor(view) {
  const n = AI_SIZE * AI_SIZE, t = new Float32Array(3 * n);
  for (let i = 0; i < n; i++) for (let c = 0; c < 3; c++) t[c * n + i] = view.data[i * 4 + c] / 127.5 - 1;
  return t;
}

export function aiProb(logits) {
  const m = Math.max(logits[0], logits[1]);
  const a = Math.exp(logits[0] - m), b = Math.exp(logits[1] - m);
  return b / (a + b); // id2label: 0=real, 1=ai
}

/** 시야별 확률 → 이미지 확률: 상위 2개 평균 (하나의 강한 증거가 전체를 좌우하되 단발 오탐은 완화). */
export function aiAggregate(probs) {
  if (!probs.length) return 0;
  const top = [...probs].sort((a, b) => b - a).slice(0, 2);
  return top.reduce((a, b) => a + b, 0) / top.length;
}
