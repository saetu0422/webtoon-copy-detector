// 지각 해시: dHash(64bit) + pHash(64bit). 결과는 Uint8Array(8) 두 개.
import { toGray, resize } from './image.js';

function grayResized(img, W, H) {
  return toGray(resize(img, W, H)).data;
}

export function dHash(img) {
  const g = grayResized(img, 9, 8);
  const out = new Uint8Array(8);
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
    if (g[y * 9 + x] > g[y * 9 + x + 1]) out[y] |= 1 << x;
  }
  return out;
}

const N = 32;
const COS = (() => {
  const t = new Float32Array(8 * N);
  for (let u = 0; u < 8; u++) for (let x = 0; x < N; x++) t[u * N + x] = Math.cos(((2 * x + 1) * u * Math.PI) / (2 * N));
  return t;
})();

export function pHash(img) {
  const g = grayResized(img, N, N);
  // 저주파 8x8 DCT 계수
  const tmp = new Float32Array(8 * N);
  for (let u = 0; u < 8; u++) for (let y = 0; y < N; y++) {
    let s = 0;
    for (let x = 0; x < N; x++) s += g[y * N + x] * COS[u * N + x];
    tmp[u * N + y] = s;
  }
  const c = new Float32Array(64);
  for (let v = 0; v < 8; v++) for (let u = 0; u < 8; u++) {
    let s = 0;
    for (let y = 0; y < N; y++) s += tmp[u * N + y] * COS[v * N + y];
    c[v * 8 + u] = s;
  }
  const sorted = Array.from(c.subarray(1)).sort((a, b) => a - b);
  const med = (sorted[31] + sorted[30]) / 2;
  const out = new Uint8Array(8);
  for (let i = 0; i < 64; i++) if (c[i] > med) out[i >> 3] |= 1 << (i & 7);
  return out;
}

const POP = new Uint8Array(256).map((_, i) => { let n = 0; for (let b = i; b; b >>= 1) n += b & 1; return n; });

/** 두 64bit 해시의 유사도 (1 = 동일, 0.5 ≈ 무관). */
export function hashSim(a, b) {
  let d = 0;
  for (let i = 0; i < 8; i++) d += POP[a[i] ^ b[i]];
  return 1 - d / 64;
}
