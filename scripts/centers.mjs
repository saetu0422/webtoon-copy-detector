// 층별 평균 패치 토큰(공통 성분)을 계산해 src/core/centers.js로 저장.
import fs from 'node:fs';
import path from 'node:path';
import * as ort from 'onnxruntime-node';
import { load, crop, splitPanels } from './lib.mjs';
import { preprocess, SIZE, LAYERS, DIM, NP } from '../src/core/embed.js';
const dir = process.argv[2];
const session = await ort.InferenceSession.create('public/models/dinov2s_int8.onnx');
const sum = LAYERS.map(() => new Float64Array(DIM)); let n = 0;
for (const f of fs.readdirSync(dir).filter((f) => f.endsWith('_base.png'))) {
  const img = await load(path.join(dir, f));
  for (const b of splitPanels(img)) {
    const { tensor, mask } = preprocess(crop(img, b.x, b.y, b.w, b.h));
    const out = await session.run({ pixel_values: new ort.Tensor('float32', tensor, [1, 3, SIZE, SIZE]) });
    for (let p = 0; p < NP; p++) if (mask[p] === 2) {
      n++;
      LAYERS.forEach((name, l) => { const t = out[name].data; for (let d = 0; d < DIM; d++) sum[l][d] += t[(p + 1) * DIM + d]; });
    }
  }
}
const b64 = (l) => Buffer.from(new Float32Array(sum[l].map((v) => v / n)).buffer).toString('base64');
fs.writeFileSync('src/core/centers.js', `// 자동 생성 (scripts/centers.mjs): 웹툰 컷 ${n}개 패치의 층별 평균 토큰. 공통 성분 제거용.
const dec = (s) => new Float32Array(Uint8Array.from(atob(s), (c) => c.charCodeAt(0)).buffer);
export const CENTERS = {
${LAYERS.map((name, l) => `  ${name}: dec('${b64(l)}'),`).join('\n')}
};
`);
console.log('patches', n);
