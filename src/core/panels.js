// 웹툰 컷 분리: 여백(거터)을 기준으로 재귀 XY-cut. 긴 컷은 겹치는 창으로 나눈다.
import { toGray, resize } from './image.js';

const WORK_W = 360;

/** 배경색(밝기) 추정: 좌우 가장자리 열의 최빈 밝기. */
function estimateBg(g, w, h) {
  const hist = new Uint32Array(32);
  for (let y = 0; y < h; y++) {
    hist[g[y * w] >> 3]++; hist[g[y * w + 1] >> 3]++;
    hist[g[y * w + w - 1] >> 3]++; hist[g[y * w + w - 2] >> 3]++;
  }
  let best = 0;
  for (let i = 1; i < 32; i++) if (hist[i] > hist[best]) best = i;
  return best * 8 + 4;
}

function cut(g, W, x0, y0, x1, y1, bg, depth, out, minSize) {
  const w = x1 - x0, h = y1 - y0;
  if (w < minSize || h < minSize) return;
  // 행/열 방향을 번갈아 시도
  for (const horizontal of depth % 2 === 0 ? [true, false] : [false, true]) {
    const n = horizontal ? h : w, m = horizontal ? w : h;
    const blank = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
      let off = 0;
      const limit = Math.max(1, Math.floor(m * 0.012));
      for (let j = 0; j < m && off <= limit; j++) {
        const v = horizontal ? g[(y0 + i) * W + x0 + j] : g[(y0 + j) * W + x0 + i];
        if (Math.abs(v - bg) > 14) off++;
      }
      blank[i] = off <= limit ? 1 : 0;
    }
    const segs = [];
    let s = -1;
    const minGap = 3;
    let gap = minGap; // 시작 가장자리는 여백으로 취급
    for (let i = 0; i <= n; i++) {
      const b = i === n ? 1 : blank[i];
      if (!b) { if (s < 0) s = i; gap = 0; }
      else {
        gap++;
        if (s >= 0 && (gap >= minGap || i === n)) { segs.push([s, i - gap + 1]); s = -1; }
      }
    }
    const big = segs.filter(([a, b]) => b - a >= minSize);
    const trimmed = big.length === 1 && (big[0][0] > 2 || big[0][1] < n - 2);
    if (big.length > 1 || trimmed) {
      for (const [a, b] of big) {
        if (horizontal) cut(g, W, x0, y0 + a, x1, y0 + b, bg, depth + 1, out, minSize);
        else cut(g, W, x0 + a, y0, x0 + b, y1, bg, depth + 1, out, minSize);
      }
      return;
    }
  }
  out.push([x0, y0, x1, y1]);
}

/** 가로세로 비가 큰 영역을 겹치는 창으로 나눈다. */
function windows(x0, y0, x1, y1) {
  const w = x1 - x0, h = y1 - y0, res = [];
  if (h > w * 1.8) {
    const win = Math.round(w * 1.25), n = Math.ceil((h - win) / (win * 0.7)) + 1;
    for (let i = 0; i < n; i++) {
      const y = Math.round(y0 + ((h - win) * i) / Math.max(1, n - 1));
      res.push([x0, y, x1, y + win]);
    }
  } else if (w > h * 3.2) {
    const win = Math.round(h * 1.8), n = Math.ceil((w - win) / (win * 0.7)) + 1;
    for (let i = 0; i < n; i++) {
      const x = Math.round(x0 + ((w - win) * i) / Math.max(1, n - 1));
      res.push([x, y0, x + win, y1]);
    }
  } else res.push([x0, y0, x1, y1]);
  return res;
}

/**
 * @returns {{x:number,y:number,w:number,h:number}[]} 원본 좌표계의 컷 상자 (위→아래 순)
 */
export function splitPanels(img, { maxPanels = 80 } = {}) {
  const scale = Math.min(1, WORK_W / img.width);
  const W = Math.max(8, Math.round(img.width * scale)), H = Math.max(8, Math.round(img.height * scale));
  const g = toGray(scale < 1 ? resize(img, W, H) : img).data;
  const bg = estimateBg(g, W, H);
  const raw = [];
  const minSize = Math.max(24, Math.round(W * 0.17));
  cut(g, W, 0, 0, W, H, bg, 0, raw, minSize);
  if (!raw.length) raw.push([0, 0, W, H]);
  let boxes = raw.flatMap((b) => windows(...b));
  boxes.sort((a, b) => a[1] - b[1] || a[0] - b[0]);
  if (boxes.length > maxPanels) {
    boxes = boxes.map((b) => [b, (b[2] - b[0]) * (b[3] - b[1])]).sort((a, b) => b[1] - a[1])
      .slice(0, maxPanels).map((b) => b[0]).sort((a, b) => a[1] - b[1] || a[0] - b[0]);
  }
  return boxes.map(([x0, y0, x1, y1]) => {
    const x = Math.max(0, Math.floor(x0 / scale)), y = Math.max(0, Math.floor(y0 / scale));
    return {
      x, y,
      w: Math.min(img.width - x, Math.ceil((x1 - x0) / scale)),
      h: Math.min(img.height - y, Math.ceil((y1 - y0) / scale)),
    };
  });
}
