// 순수 JS 이미지 유틸. 이미지는 { data: Uint8ClampedArray|Uint8Array (RGBA), width, height }.

export function toGray(img) {
  const { data, width, height } = img;
  const g = new Float32Array(width * height);
  for (let i = 0, j = 0; j < g.length; i += 4, j++) {
    g[j] = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
  }
  return { data: g, width, height };
}

export function crop(img, x, y, w, h) {
  const out = new Uint8ClampedArray(w * h * 4);
  for (let r = 0; r < h; r++) {
    const s = ((y + r) * img.width + x) * 4;
    out.set(img.data.subarray(s, s + w * 4), r * w * 4);
  }
  return { data: out, width: w, height: h };
}

/** 면적 평균(축소) / 쌍선형(확대) 리사이즈. RGBA → RGBA. */
export function resize(img, W, H) {
  const { data, width: w, height: h } = img;
  const out = new Uint8ClampedArray(W * H * 4);
  const sx = w / W, sy = h / H;
  if (sx >= 1 && sy >= 1) {
    for (let Y = 0; Y < H; Y++) {
      const y0 = Math.floor(Y * sy), y1 = Math.max(y0 + 1, Math.min(h, Math.floor((Y + 1) * sy)));
      for (let X = 0; X < W; X++) {
        const x0 = Math.floor(X * sx), x1 = Math.max(x0 + 1, Math.min(w, Math.floor((X + 1) * sx)));
        let r = 0, g = 0, b = 0, n = 0;
        for (let y = y0; y < y1; y++) {
          let p = (y * w + x0) * 4;
          for (let x = x0; x < x1; x++, p += 4) { r += data[p]; g += data[p + 1]; b += data[p + 2]; n++; }
        }
        const o = (Y * W + X) * 4;
        out[o] = r / n; out[o + 1] = g / n; out[o + 2] = b / n; out[o + 3] = 255;
      }
    }
  } else {
    for (let Y = 0; Y < H; Y++) {
      const fy = Math.min(h - 1, Math.max(0, (Y + 0.5) * sy - 0.5));
      const y0 = Math.floor(fy), y1 = Math.min(h - 1, y0 + 1), wy = fy - y0;
      for (let X = 0; X < W; X++) {
        const fx = Math.min(w - 1, Math.max(0, (X + 0.5) * sx - 0.5));
        const x0 = Math.floor(fx), x1 = Math.min(w - 1, x0 + 1), wx = fx - x0;
        const o = (Y * W + X) * 4;
        for (let c = 0; c < 3; c++) {
          const a = data[(y0 * w + x0) * 4 + c], b = data[(y0 * w + x1) * 4 + c];
          const d = data[(y1 * w + x0) * 4 + c], e = data[(y1 * w + x1) * 4 + c];
          out[o + c] = (a * (1 - wx) + b * wx) * (1 - wy) + (d * (1 - wx) + e * wx) * wy;
        }
        out[o + 3] = 255;
      }
    }
  }
  return { data: out, width: W, height: H };
}

export function flipH(img) {
  const { data, width: w, height: h } = img;
  const out = new Uint8ClampedArray(data.length);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const s = (y * w + x) * 4, d = (y * w + (w - 1 - x)) * 4;
    out[d] = data[s]; out[d + 1] = data[s + 1]; out[d + 2] = data[s + 2]; out[d + 3] = data[s + 3];
  }
  return { data: out, width: w, height: h };
}

/** 선화 표준화: 색·명암을 버리고 윤곽선만 남긴다 (트레이싱 비교용). 흰 바탕에 어두운 선. */
export function lineArt(img) {
  const { width: w, height: h } = img;
  const g0 = toGray(img).data, g = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let s = 0, n = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const yy = y + dy, xx = x + dx;
      if (yy >= 0 && yy < h && xx >= 0 && xx < w) { s += g0[yy * w + xx]; n++; }
    }
    g[y * w + x] = s / n;
  }
  const out = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const xm = Math.max(0, x - 1), xp = Math.min(w - 1, x + 1), ym = Math.max(0, y - 1), yp = Math.min(h - 1, y + 1);
    const gx = g[ym * w + xp] + 2 * g[y * w + xp] + g[yp * w + xp] - g[ym * w + xm] - 2 * g[y * w + xm] - g[yp * w + xm];
    const gy = g[yp * w + xm] + 2 * g[yp * w + x] + g[yp * w + xp] - g[ym * w + xm] - 2 * g[ym * w + x] - g[ym * w + xp];
    const v = 255 - Math.min(255, Math.hypot(gx, gy) * 1.2);
    const o = (y * w + x) * 4;
    out[o] = out[o + 1] = out[o + 2] = v; out[o + 3] = 255;
  }
  return { data: out, width: w, height: h };
}

/**
 * 컷의 색 구성 통계. nColors: 면적 2% 이상을 차지하는 색(3bit/채널 양자화) 수, sat: 채도 있는 픽셀 비율.
 * 말풍선·자막·효과음만 있는 컷은 색이 2~3개뿐이라 복제 근거로 쓰기 어렵다.
 */
export function colorStats(panel) {
  const k = Math.min(1, 96 / Math.max(panel.width, panel.height));
  const s = k < 1 ? resize(panel, Math.max(1, Math.round(panel.width * k)), Math.max(1, Math.round(panel.height * k))) : panel;
  const bins = new Uint32Array(512), n = s.width * s.height;
  let sat = 0;
  for (let i = 0; i < n; i++) {
    const r = s.data[i * 4], g = s.data[i * 4 + 1], b = s.data[i * 4 + 2];
    bins[((r >> 5) << 6) | ((g >> 5) << 3) | (b >> 5)]++;
    if (Math.max(r, g, b) - Math.min(r, g, b) > 40) sat++;
  }
  let nColors = 0;
  for (let i = 0; i < 512; i++) if (bins[i] >= n * 0.02) nColors++;
  return { nColors, sat: sat / n };
}
