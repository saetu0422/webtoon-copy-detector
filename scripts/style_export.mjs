// 화풍 평가용 컷 내보내기: 각 작품(긴 스트립)의 앞 45%를 등록용, 뒤 45%를 질의용으로 나눠 컷 PNG로 저장.
// 사용: node scripts/style_export.mjs <스트립 폴더(*_base.png)> <출력 폴더>
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { load, toPng, crop, splitPanels } from './lib.mjs';
import { colorStats } from '../src/core/image.js';

sharp.cache(false);
const [, , dir, out] = process.argv;
fs.mkdirSync(out, { recursive: true });
const CH = 4000, MAXP = 90;
for (const [si, f] of fs.readdirSync(dir).filter((f) => f.endsWith('_base.png')).sort().entries()) {
  const file = path.join(dir, f), { width, height } = await sharp(file, { limitInputPixels: false }).metadata();
  const n = Math.floor(height / CH), counts = { g: 0, q: 0 };
  for (let k = 0; k < n; k++) {
    const part = k < n * 0.45 ? 'g' : k >= n * 0.55 ? 'q' : null; // 가운데 10%는 버려 장면이 겹치지 않게
    if (!part || counts[part] >= MAXP) continue;
    const img = await load(await sharp(file, { limitInputPixels: false }).extract({ left: 0, top: k * CH, width, height: CH }).png().toBuffer());
    for (const b of splitPanels(img)) {
      if (b.w < 200 || b.h < 150 || counts[part] >= MAXP) continue;
      const p = crop(img, b.x, b.y, b.w, b.h), st = colorStats(p);
      if (st.nColors <= 3 || (st.sat < 0.02 && st.nColors <= 5)) continue;
      fs.writeFileSync(path.join(out, `s${si}_${part}_c${k}_${counts[part]++}.png`), await toPng(p));
    }
  }
  console.error(f, n, 'chunks →', counts);
}
