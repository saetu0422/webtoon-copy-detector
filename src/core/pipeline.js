// 이미지 한 장 → 컷별 특징. 브라우저 워커와 Node 평가 스크립트가 함께 쓴다.
import { crop, resize, flipH, lineArt, colorStats } from './image.js';
import { splitPanels } from './panels.js';
import { dHash, pHash } from './hash.js';
import { preprocess, featurize, hydrate, NP } from './embed.js';
import { TH } from './search.js';

const lineView = (p) => {
  const k = Math.min(1, 448 / Math.max(p.width, p.height));
  return lineArt(k < 1 ? resize(p, Math.round(p.width * k), Math.round(p.height * k)) : p);
};
const content = (mask) => { let n = 0; for (let p = 0; p < NP; p++) if (mask[p] === 2) n++; return n; };

/** 컷 하나의 특징(해시 + DINOv2 컬러/선화). 내용이 거의 없으면 null. */
export async function featurizePanel(image, runModel, { line = true } = {}) {
  const embed = async (im) => {
    const { tensor, mask } = preprocess(im);
    return hydrate(featurize(await runModel(tensor), mask));
  };
  const f = await embed(image);
  if (content(f.mask) < TH.minContent) return null;
  const fl = flipH(resize(image, 64, 64));
  Object.assign(f, { ph: pHash(image), dh: dHash(image), phF: pHash(fl), dhF: dHash(fl) });
  if (line) { const l = await embed(lineView(image)); f.line = { g: l.g, p12: l.p12, n12: l.n12, mask: l.mask }; }
  return f;
}

/**
 * @param img RGBA 이미지
 * @param runModel (Float32Array 텐서) => Promise<{tokens4,tokens8,tokens12}>
 * @returns 컷 배열. skip이 있으면 비교에서 제외된 컷('text' = 대사·효과 위주, 'blank' = 내용 부족)
 */
export async function analyzeImage(img, runModel, { line = true, onProgress } = {}) {
  const boxes = splitPanels(img);
  const panels = boxes.map((box) => ({ box, image: crop(img, box.x, box.y, box.w, box.h) }));
  const stats = panels.map((p) => colorStats(p.image));
  // 흑백 원고(전체적으로 채도가 없음)는 색 수로 대사 컷을 가릴 수 없으므로 필터를 끈다
  const area = panels.reduce((a, p) => a + p.box.w * p.box.h, 0) || 1;
  const mono = panels.reduce((a, p, i) => a + stats[i].sat * p.box.w * p.box.h, 0) / area < 0.03;
  let done = 0;
  for (const [i, p] of panels.entries()) {
    if (!mono && (stats[i].nColors <= 3 || (stats[i].sat < 0.02 && stats[i].nColors <= 5))) p.skip = 'text';
    else {
      const f = await featurizePanel(p.image, runModel, { line });
      if (f) Object.assign(p, f); else p.skip = 'blank';
    }
    onProgress?.(++done, panels.length);
  }
  return panels;
}
