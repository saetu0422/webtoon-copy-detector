// 모든 연산(디코딩, 컷 분리, 추론, 검색)을 메인 스레드 밖에서 수행한다.
import * as ort from 'onnxruntime-web/wasm';
import { resize } from './core/image.js';
import { SIZE, LAYERS, hydrate } from './core/embed.js';
import { analyzeImage } from './core/pipeline.js';
import { searchPanel, aggregate } from './core/search.js';
import { aiViews, aiTensor, aiProb, aiAggregate, AI_SIZE, AI_THRESHOLD } from './core/aidetect.js';

let base = '';
let dino = null, aiSession = null;
const gallery = new Map(); // id → 특징 (노름 포함)

const post = (msg, transfer) => self.postMessage(msg, transfer || []);

async function fetchModel(file, label, reqId) {
  const url = base + 'models/' + file;
  let cache = null, resp = null;
  try { cache = await caches.open('wcd-models-v1'); resp = await cache.match(url); } catch { /* 캐시 불가 환경 */ }
  if (!resp) {
    resp = await fetch(url);
    if (!resp.ok) throw new Error(`${label} 모델을 불러오지 못했습니다 (${resp.status})`);
    if (cache) cache.put(url, resp.clone()).catch(() => {});
  }
  const total = +resp.headers.get('content-length') || 0;
  const reader = resp.body.getReader();
  const chunks = [];
  let got = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value); got += value.length;
    post({ type: 'progress', reqId, text: `${label} 모델 불러오는 중`, done: got, total: total || got });
  }
  const buf = new Uint8Array(got);
  let o = 0;
  for (const c of chunks) { buf.set(c, o); o += c.length; }
  return ort.InferenceSession.create(buf, { executionProviders: ['wasm'], graphOptimizationLevel: 'all' });
}

async function ensureDino(reqId) {
  dino ??= fetchModel('dinov2s_int8.onnx', '복제 탐지', reqId);
  return dino;
}
async function ensureAi(reqId) {
  aiSession ??= fetchModel('anime_ai_detector_int8.onnx', 'AI 생성 탐지', reqId);
  return aiSession;
}

const runDino = async (tensor) => {
  const s = await dino;
  const out = await s.run({ pixel_values: new ort.Tensor('float32', tensor, [1, 3, SIZE, SIZE]) });
  return Object.fromEntries(LAYERS.map((n) => [n, out[n].data]));
};

/** 파일 → RGBA. 세로로 매우 긴 이미지도 띠 단위로 읽는다. */
async function decode(file) {
  let bmp;
  try { bmp = await createImageBitmap(file); } catch { throw new Error('이미지를 열 수 없습니다 (형식 미지원 또는 크기 초과)'); }
  const scale = Math.min(1, 1200 / bmp.width, Math.sqrt(40e6 / (bmp.width * bmp.height)));
  const w = Math.max(1, Math.round(bmp.width * scale)), h = Math.max(1, Math.round(bmp.height * scale));
  const data = new Uint8ClampedArray(w * h * 4);
  const STRIP = 2048;
  for (let y = 0; y < h; y += STRIP) {
    const hh = Math.min(STRIP, h - y);
    const cv = new OffscreenCanvas(w, hh), ctx = cv.getContext('2d', { willReadFrequently: true });
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, hh);
    ctx.drawImage(bmp, 0, y / scale, bmp.width, hh / scale, 0, 0, w, hh);
    data.set(ctx.getImageData(0, 0, w, hh).data, y * w * 4);
  }
  bmp.close();
  return { data, width: w, height: h };
}

async function thumb(image) {
  const k = Math.min(1, 360 / Math.max(image.width, image.height));
  const t = k < 1 ? resize(image, Math.max(1, Math.round(image.width * k)), Math.max(1, Math.round(image.height * k))) : image;
  const cv = new OffscreenCanvas(t.width, t.height);
  cv.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(t.data), t.width, t.height), 0, 0);
  return cv.convertToBlob({ type: 'image/jpeg', quality: 0.82 });
}

const stored = (p) => ({ ph: p.ph, dh: p.dh, g: p.g, p12: p.p12, p4: p.p4, mask: p.mask, line: p.line && { g: p.line.g, p12: p.line.p12, mask: p.line.mask } });
function addToGallery(rec) {
  hydrate(rec);
  if (rec.line) hydrate(rec.line);
  gallery.set(rec.id, rec);
}

const handlers = {
  async init({ base: b }) {
    base = b;
    ort.env.wasm.wasmPaths = base + 'ort/';
    ort.env.wasm.numThreads = self.crossOriginIsolated ? Math.min(4, navigator.hardwareConcurrency || 1) : 1;
    return { threads: ort.env.wasm.numThreads };
  },
  async loadGallery({ panels }) {
    for (const p of panels) addToGallery(p);
    return { count: gallery.size };
  },
  async removePanels({ ids }) {
    for (const id of ids) gallery.delete(id);
    return { count: gallery.size };
  },
  /** 원본 이미지 등록 → 저장할 컷 레코드 */
  async ingest({ file, workId }, reqId) {
    await ensureDino(reqId);
    const img = await decode(file);
    const panels = await analyzeImage(img, runDino, {
      onProgress: (done, total) => post({ type: 'progress', reqId, text: `${file.name} 분석 중`, done, total }),
    });
    const records = [];
    for (const p of panels) {
      if (p.skip) continue;
      const rec = { id: crypto.randomUUID(), workId, fileName: file.name, box: p.box, thumb: await thumb(p.image), ...stored(p) };
      records.push(rec);
      addToGallery({ ...rec });
    }
    return { records, skipped: panels.length - records.length };
  },
  /** 의심 이미지 검사 */
  async check({ file, ai }, reqId) {
    await ensureDino(reqId);
    const img = await decode(file);
    const panels = await analyzeImage(img, runDino, {
      onProgress: (done, total) => post({ type: 'progress', reqId, text: `${file.name} 컷 분석 중`, done, total }),
    });
    const gal = [...gallery.values()];
    const results = [];
    for (const [i, p] of panels.entries()) {
      const r = searchPanel(p, gal);
      results.push({ ...r, index: i, box: p.box, thumb: r.level !== 'none' ? await thumb(p.image) : null });
      if (i % 4 === 0) post({ type: 'progress', reqId, text: `${file.name} 갤러리와 비교 중`, done: i + 1, total: panels.length });
    }
    const summary = aggregate(results.filter((r) => !r.skip));
    summary.skipped = results.filter((r) => r.skip).length;

    let aiResult = null;
    if (ai) {
      try {
        const s = await ensureAi(reqId);
        // 그림 내용이 있는 큰 컷 3개 (없으면 이미지 전체)
        let targets = panels.map((p, i) => ({ p, i })).filter((x) => !x.p.skip).sort((a, b) => b.p.box.w * b.p.box.h - a.p.box.w * a.p.box.h).slice(0, 3);
        if (!targets.length) targets = [{ p: { image: img }, i: -1 }];
        const jobs = targets.flatMap((t) => aiViews(t.p.image, 1).map((v) => ({ v, i: t.i })));
        const probs = [], perPanel = {};
        for (const [k, j] of jobs.entries()) {
          post({ type: 'progress', reqId, text: `${file.name} AI 생성 여부 검사 중 (실험적)`, done: k, total: jobs.length });
          const out = await s.run({ pixel_values: new ort.Tensor('float32', aiTensor(j.v), [1, 3, AI_SIZE, AI_SIZE]) });
          const pr = aiProb(out.logits.data);
          probs.push(pr);
          perPanel[j.i] = Math.max(perPanel[j.i] || 0, pr);
        }
        const prob = aiAggregate(probs);
        aiResult = { prob, flagged: prob >= AI_THRESHOLD, views: probs.length, perPanel };
      } catch (e) {
        aiResult = { error: String(e.message || e) };
      }
    }
    return { fileName: file.name, width: img.width, height: img.height, panels: results, summary, ai: aiResult, gallerySize: gal.length };
  },
};

// 요청을 순서대로 처리
let queue = Promise.resolve();
self.onmessage = ({ data }) => {
  queue = queue.then(async () => {
    try {
      post({ type: 'done', reqId: data.reqId, result: await handlers[data.type](data, data.reqId) });
    } catch (e) {
      post({ type: 'error', reqId: data.reqId, message: String(e?.message || e) });
    }
  });
};
