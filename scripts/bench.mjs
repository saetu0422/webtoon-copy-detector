// 컷 단위 비교 평가(1/2): 갤러리·질의·음성 컷을 PNG로 내보내고, 본 시스템과 내부 기준선의 점수를 기록한다.
// 사용: node scripts/bench.mjs <chunks 폴더> <출력 폴더>   → 이어서 python tools/bench_baselines.py <출력 폴더>
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { load, toPng, analyze, featurize1, crop } from './lib.mjs';
import { lineArt } from '../src/core/image.js';
import { hashSim } from '../src/core/hash.js';
import { globalSim } from '../src/core/match.js';
import { searchPanel } from '../src/core/search.js';

const [, , dir, out] = process.argv;
fs.mkdirSync(out, { recursive: true });
const all = fs.readdirSync(dir).filter((f) => f.endsWith('_base.png')).sort();
const kOf = (f) => +f.split('_').at(-2);
const save = async (name, img) => fs.writeFileSync(path.join(out, name), await toPng(img));

const gallery = [], negatives = [];
for (const f of all) {
  const img = await load(path.join(dir, f)), clean = await load(path.join(dir, f.replace('_base', '_cleaned')));
  for (const p of await analyze(img)) {
    if (p.skip) continue;
    const rec = { ...p, clean: crop(clean, p.box.x, p.box.y, p.box.w, p.box.h) };
    if (kOf(f) < 3) { rec.id = gallery.length; gallery.push(rec); await save(`g_${rec.id}.png`, p.image); }
    else { negatives.push(rec); await save(`n_${negatives.length - 1}.png`, p.image); }
  }
}
console.error('gallery', gallery.length, 'negatives', negatives.length);

const viaSharp = async (p, fn) => load(await fn(sharp(await toPng(p))).png().toBuffer());
const lines = (p) => { const l = lineArt(p); for (let i = 0; i < l.data.length; i += 4) { const v = l.data[i] < 170 ? 30 : 255; l.data[i] = l.data[i + 1] = l.data[i + 2] = v; } return l; };
const T = {
  jpeg_resize: (p) => viaSharp(p, (s) => s.resize({ width: Math.round(p.width * 0.55) }).jpeg({ quality: 35 })),
  crop_center: async (p) => crop(p, Math.round(p.width * 0.2), Math.round(p.height * 0.15), Math.round(p.width * 0.65), Math.round(p.height * 0.7)),
  crop_corner: async (p) => crop(p, 0, 0, Math.round(p.width * 0.6), Math.round(p.height * 0.6)),
  flip: (p) => viaSharp(p, (s) => s.flop()),
  hue: (p) => viaSharp(p, (s) => s.modulate({ hue: 90, saturation: 1.3, brightness: 1.05 })),
  text_removed: async (p, g) => g.clean,
  watermark: async (p) => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${p.width}" height="${p.height}"><text x="50%" y="50%" font-size="${p.width / 7}" fill="rgba(255,0,0,0.55)" text-anchor="middle" transform="rotate(-20 ${p.width / 2} ${p.height / 2})">FREE TOON</text><rect x="0" y="${p.height * 0.85}" width="${p.width}" height="${p.height * 0.15}" fill="#111"/></svg>`;
    return viaSharp(p, (s) => s.composite([{ input: Buffer.from(svg) }]));
  },
  trace_recolor: async (p) => {
    const base = await sharp(await toPng(p)).blur(8).modulate({ hue: 140, saturation: 0.7 }).png().toBuffer();
    return load(await sharp(await sharp(base).composite([{ input: await toPng(lines(p)), blend: 'multiply' }]).png().toBuffer()).resize({ width: Math.round(p.width * 1.06), height: Math.round(p.height * 0.97), fit: 'fill' }).png().toBuffer());
  },
  trace_line: async (p) => lines(p),
};

const score = (f) => {
  if (!f) return { ours: [0, -1], phash: [0, -1], dino_global: [0, -1] };
  const r = searchPanel(f, gallery);
  let ph = [0, -1], dg = [-1, -1];
  for (const g of gallery) {
    const h = Math.max(hashSim(f.ph, g.ph), hashSim(f.dh, g.dh)); if (h > ph[0]) ph = [h, g.id];
    const s = globalSim(f.g, g.g).sem; if (s > dg[0]) dg = [s, g.id];
  }
  return { ours: r.raw ? [r.raw.struct, r.raw.id] : [0, -1], phash: ph, dino_global: dg };
};
const queries = [];
for (const g of gallery.filter((_, i) => i % 3 === 0)) {
  for (const [name, fn] of Object.entries(T)) {
    const q = await fn(g.image, g);
    const file = `q_${queries.length}.png`;
    await save(file, q);
    queries.push({ file, transform: name, truth: g.id, ...score(await featurize1(q)) });
  }
}
const negs = negatives.map((n, i) => ({ file: `n_${i}.png`, ...score(n) }));
fs.writeFileSync(path.join(out, 'bench.json'), JSON.stringify({ gallery: gallery.length, queries, negs }));
console.error('queries', queries.length);
