// Node 평가용 공통 코드: 브라우저와 같은 core 모듈을 sharp + onnxruntime-node로 구동.
import sharp from 'sharp';
import * as ort from 'onnxruntime-node';
import { crop } from '../src/core/image.js';
import { analyzeImage } from '../src/core/pipeline.js';
import { splitPanels } from '../src/core/panels.js';
import { dHash, pHash } from '../src/core/hash.js';
import { preprocess, featurize, hydrate, SIZE, LAYERS } from '../src/core/embed.js';
import { resize, lineArt, flipH } from '../src/core/image.js';

export async function load(input) {
  const { data, info } = await sharp(input).removeAlpha().ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data: new Uint8ClampedArray(data.buffer, data.byteOffset, data.length), width: info.width, height: info.height };
}
export const toPng = (img) => sharp(Buffer.from(img.data.buffer, img.data.byteOffset, img.data.length), { raw: { width: img.width, height: img.height, channels: 4 } }).png().toBuffer();

let session;
const runModel = async (tensor) => {
  session ??= await ort.InferenceSession.create(new URL('../public/models/dinov2s_int8.onnx', import.meta.url).pathname);
  const out = await session.run({ pixel_values: new ort.Tensor('float32', tensor, [1, 3, SIZE, SIZE]) });
  return Object.fromEntries(LAYERS.map((n) => [n, out[n].data]));
};
export const analyze = (img) => analyzeImage(img, runModel);
export { crop, splitPanels };
