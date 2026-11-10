// 이미지 단위 종단 평가: 갤러리(각 작품 앞 3개 청크) vs 변형 복제본(양성) / 같은 작품의 다른 페이지(음성).
// 사용: node scripts/e2e.mjs <chunks 폴더>
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { load, toPng, analyze, crop } from './lib.mjs';
import { lineArt } from '../src/core/image.js';
import { searchPanel, aggregate } from '../src/core/search.js';

const dir = process.argv[2];
const all = fs.readdirSync(dir).filter((f) => f.endsWith('_base.png')).sort();
const kOf = (f) => +f.split('_').at(-2);
const gFiles = all.filter((f) => kOf(f) < 3), nFiles = all.filter((f) => kOf(f) >= 3);
const gallery = [];
for (const f of gFiles) for (const p of await analyze(await load(path.join(dir, f)))) gallery.push({ id: gallery.length, file: f, ...p });
console.error('gallery', gFiles.length, 'images,', gallery.length, 'panels');

const viaSharp = async (p, fn) => load(await fn(sharp(await toPng(p))).png().toBuffer());
const T = {
  '재압축+축소': (p) => viaSharp(p, (s) => s.resize({ width: 400 }).jpeg({ quality: 40 })),
  '부분 잘라내기': async (p) => crop(p, 60, 900, p.width - 120, 1700),
  '좌우반전': (p) => viaSharp(p, (s) => s.flop()),
  '색조 변경': (p) => viaSharp(p, (s) => s.modulate({ hue: 90, saturation: 1.3 })),
  '대사 제거': async (p, f) => load(path.join(dir, f.replace('_base', '_cleaned'))),
  '워터마크+여백': async (p) => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${p.width}" height="${p.height}">${[0, 1, 2, 3, 4].map((i) => `<text x="50%" y="${10 + i * 20}%" font-size="90" fill="rgba(255,0,0,0.5)" text-anchor="middle">FREETOON</text>`).join('')}</svg>`;
    return viaSharp(p, (s) => s.composite([{ input: Buffer.from(svg) }]).extend({ left: 60, right: 60, background: '#fff' }));
  },
  '선화 트레이싱(모사)': async (p) => { const l = lineArt(p); for (let i = 0; i < l.data.length; i += 4) { const v = l.data[i] < 170 ? 30 : 255; l.data[i] = l.data[i + 1] = l.data[i + 2] = v; } return l; },
  '재채색 트레이싱(모사)': async (p) => {
    const l = lineArt(p); for (let i = 0; i < l.data.length; i += 4) { const v = l.data[i] < 170 ? 30 : 255; l.data[i] = l.data[i + 1] = l.data[i + 2] = v; }
    const base = await sharp(await toPng(p)).blur(8).modulate({ hue: 140, saturation: 0.7 }).png().toBuffer();
    return load(await sharp(await sharp(base).composite([{ input: await toPng(l), blend: 'multiply' }]).png().toBuffer()).resize({ width: Math.round(p.width * 1.06), height: Math.round(p.height * 0.97), fit: 'fill' }).png().toBuffer());
  },
};
const check = async (img) => {
  const rs = (await analyze(img)).map((q) => searchPanel(q, gallery)).filter((r) => !r.skip);
  return { ...aggregate(rs), rs };
};
const out = {};
for (const [name, fn] of Object.entries(T)) {
  let strong = 0, any = 0, n = 0, pm = 0, pt = 0, types = {};
  for (const f of gFiles.filter((_, i) => i % 2 === 0)) {
    const r = await check(await fn(await load(path.join(dir, f)), f));
    n++; if (r.level === 'strong') strong++; if (r.level !== 'none') any++;
    pm += r.matched; pt += r.total;
    for (const x of r.rs) if (x.type) types[x.type] = (types[x.type] || 0) + 1;
  }
  out[name] = { 이미지_확정: `${strong}/${n}`, 이미지_의심이상: `${any}/${n}`, 컷_일치율: (pm / pt).toFixed(2), 유형: JSON.stringify(types) };
}
{
  let strong = 0, any = 0, n = 0, ps = 0, pw = 0, pt = 0;
  for (const f of nFiles) {
    const r = await check(await load(path.join(dir, f)));
    n++; if (r.level === 'strong') strong++; if (r.level !== 'none') any++;
    ps += r.strong; pw += r.matched - r.strong; pt += r.total;
  }
  out['[음성] 같은 작품 다른 페이지'] = { 이미지_확정: `${strong}/${n}`, 이미지_의심이상: `${any}/${n}`, 컷_일치율: `확정 ${(ps / pt).toFixed(3)} / 의심 ${(pw / pt).toFixed(3)} (컷 ${pt}개)`, 유형: '' };
}
console.table(out);
