// 브라우저 시험용 변형본 생성: node scripts/make_samples.mjs <chunks> <out>
import sharp from 'sharp'; import path from 'node:path';
import { load, toPng } from './lib.mjs';
import { lineArt } from '../src/core/image.js';
const [, , dir, out] = process.argv;
const src = path.join(dir, '670145_145_1_base.png');
await sharp(src).extract({ left: 40, top: 700, width: 620, height: 1900 }).resize({ width: 420 }).jpeg({ quality: 45 }).toFile(path.join(out, 'suspect_crop_recompress.jpg'));
await sharp(src).flop().modulate({ hue: 60 }).extract({ left: 0, top: 0, width: 690, height: 2400 }).png().toFile(path.join(out, 'suspect_flip_hue.png'));
const p = await load(await sharp(src).extract({ left: 0, top: 1200, width: 690, height: 2000 }).png().toBuffer());
const l = lineArt(p); for (let i = 0; i < l.data.length; i += 4) { const v = l.data[i] < 170 ? 30 : 255; l.data[i] = l.data[i + 1] = l.data[i + 2] = v; }
const base = await sharp(await toPng(p)).blur(8).modulate({ hue: 140, saturation: 0.7 }).png().toBuffer();
await sharp(await sharp(base).composite([{ input: await toPng(l), blend: 'multiply' }]).png().toBuffer()).resize({ width: 730, height: 1940, fit: 'fill' }).png().toFile(path.join(out, 'suspect_trace_recolor.png'));
