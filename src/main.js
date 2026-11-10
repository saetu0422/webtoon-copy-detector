import * as db from './db.js';
import { TYPE_LABEL } from './core/search.js';
import { SIZE, GRID, PATCH } from './core/embed.js';

const $ = (id) => document.getElementById(id);
const worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });

// ── 워커 RPC ─────────────────────────────────────────────
let seq = 0;
const pending = new Map();
worker.onmessage = ({ data }) => {
  if (data.type === 'progress') return showProgress(data);
  const p = pending.get(data.reqId);
  if (!p) return;
  pending.delete(data.reqId);
  data.type === 'done' ? p.resolve(data.result) : p.reject(new Error(data.message));
};
const call = (type, payload = {}) => new Promise((resolve, reject) => {
  const reqId = ++seq;
  pending.set(reqId, { resolve, reject });
  worker.postMessage({ type, reqId, ...payload });
});

// ── 상태 ────────────────────────────────────────────────
const works = new Map();   // id → { id, name, createdAt }
const panels = new Map();  // id → { id, workId, fileName, box, thumb }
let busy = 0;

function setStatus(text, cls = '') {
  $('statusText').textContent = text;
  $('status').className = 'status ' + cls;
}
function showProgress({ text, done, total }) {
  $('progress').hidden = false;
  const big = total > 1e5;
  $('progressBar').style.width = `${total ? Math.min(100, (done / total) * 100) : 0}%`;
  $('progressLabel').textContent = big ? `${text} · ${(done / 1e6).toFixed(1)} / ${(total / 1e6).toFixed(1)} MB` : `${text} · ${done}/${total}`;
}
function setBusy(on) {
  busy += on ? 1 : -1;
  document.body.classList.toggle('busy', busy > 0);
  if (busy <= 0) { busy = 0; $('progress').hidden = true; }
}
const images = (list) => [...list].filter((f) => f.type.startsWith('image/') || /\.(png|jpe?g|webp|gif|bmp|avif)$/i.test(f.name));

function bindDrop(zone, input, onFiles) {
  input.addEventListener('change', () => { if (input.files.length) onFiles(images(input.files)); input.value = ''; });
  for (const ev of ['dragenter', 'dragover']) zone.addEventListener(ev, (e) => { e.preventDefault(); zone.classList.add('over'); });
  for (const ev of ['dragleave', 'drop']) zone.addEventListener(ev, (e) => { e.preventDefault(); zone.classList.remove('over'); });
  zone.addEventListener('drop', (e) => { const f = images(e.dataTransfer.files); if (f.length) onFiles(f); });
}

// ── 갤러리 ──────────────────────────────────────────────
const urls = new Map();
const thumbUrl = (p) => { if (!urls.has(p.id)) urls.set(p.id, URL.createObjectURL(p.thumb)); return urls.get(p.id); };

function renderGallery() {
  const ul = $('works');
  ul.replaceChildren();
  for (const w of works.values()) {
    const ps = [...panels.values()].filter((p) => p.workId === w.id);
    const files = new Set(ps.map((p) => p.fileName)).size;
    const li = document.createElement('li');
    li.className = 'work';
    const top = document.createElement('div'); top.className = 'work-top';
    const b = document.createElement('b'); b.textContent = w.name; b.title = w.name;
    const small = document.createElement('small'); small.textContent = `이미지 ${files}장 · 컷 ${ps.length}개`;
    top.append(b, small);
    const strip = document.createElement('div'); strip.className = 'strip';
    for (const p of ps.slice(0, 6)) { const img = new Image(); img.src = thumbUrl(p); img.alt = ''; img.loading = 'lazy'; strip.append(img); }
    if (ps.length > 6) { const m = document.createElement('span'); m.className = 'more'; m.textContent = `+${ps.length - 6}`; strip.append(m); }
    const act = document.createElement('div'); act.className = 'work-actions';
    const del = document.createElement('button'); del.type = 'button'; del.className = 'ghost'; del.textContent = '삭제';
    del.addEventListener('click', () => removeWork(w));
    act.append(del);
    li.append(top, strip, act);
    ul.append(li);
  }
  $('galleryEmpty').hidden = works.size > 0;
  $('galleryCount').textContent = works.size ? `작품 ${works.size}개 · 컷 ${panels.size}개` : '';
}

async function removeWork(w) {
  if (!confirm(`"${w.name}"을(를) 갤러리에서 삭제할까요? 등록된 컷이 모두 지워집니다.`)) return;
  const ids = await db.deleteWork(w.id);
  await call('removePanels', { ids });
  for (const id of ids) { panels.delete(id); if (urls.has(id)) { URL.revokeObjectURL(urls.get(id)); urls.delete(id); } }
  works.delete(w.id);
  renderGallery();
}

async function addOriginals(files) {
  const name = $('workName').value.trim() || files[0].name.replace(/\.[^.]+$/, '');
  let work = [...works.values()].find((w) => w.name === name);
  setBusy(true);
  try {
    if (!work) { work = { id: crypto.randomUUID(), name, createdAt: Date.now() }; await db.putWork(work); works.set(work.id, work); }
    let skipped = 0, failed = [];
    for (const file of files) {
      try {
        const { records, skipped: s } = await call('ingest', { file, workId: work.id });
        await db.putPanels(records);
        for (const r of records) panels.set(r.id, { id: r.id, workId: r.workId, fileName: r.fileName, box: r.box, thumb: r.thumb });
        skipped += s;
        renderGallery();
      } catch (e) { failed.push(`${file.name}: ${e.message}`); }
    }
    if (![...panels.values()].some((p) => p.workId === work.id)) { await db.deleteWork(work.id); works.delete(work.id); renderGallery(); }
    $('workName').value = '';
    setStatus(failed.length ? `일부 실패 — ${failed[0]}` : `등록 완료${skipped ? ` (대사·여백 컷 ${skipped}개 제외)` : ''}`, failed.length ? 'error' : 'ready');
  } catch (e) {
    setStatus(e.message, 'error');
  } finally { setBusy(false); }
}

// ── 결과 표시 ───────────────────────────────────────────
/** 썸네일 위에 복제 영역 히트맵을 그린다. heat는 16x16 레터박스 격자. */
async function drawPanel(canvas, blob, heat, color) {
  const bmp = await createImageBitmap(blob);
  canvas.width = bmp.width; canvas.height = bmp.height;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(bmp, 0, 0);
  if (!heat) return;
  const s = SIZE / Math.max(bmp.width, bmp.height);
  const w = Math.max(PATCH, Math.round(bmp.width * s)), h = Math.max(PATCH, Math.round(bmp.height * s));
  const ox = (SIZE - w) >> 1, oy = (SIZE - h) >> 1, k = bmp.width / w;
  for (let i = 0; i < GRID; i++) for (let j = 0; j < GRID; j++) {
    const v = heat[i * GRID + j];
    if (v < 0.6) continue;
    ctx.fillStyle = color.replace('A', (0.12 + 0.3 * Math.min(1, (v - 0.6) / 0.35)).toFixed(2));
    ctx.fillRect((j * PATCH - ox) * k, (i * PATCH - oy) * k, PATCH * k + 0.5, PATCH * k + 0.5);
  }
}
const HEAT = 'rgba(255, 70, 30, A)';

function signalRow(label, v) {
  const row = document.createElement('div'); row.className = 'sig';
  const l = document.createElement('span'); l.textContent = label;
  const bar = document.createElement('i'), fill = document.createElement('b');
  fill.style.width = `${Math.max(0, Math.min(1, v)) * 100}%`; bar.append(fill);
  const n = document.createElement('span'); n.textContent = Math.round(Math.max(0, v) * 100);
  row.append(l, bar, n);
  return row;
}

function matchRow(r) {
  const g = panels.get(r.id), work = g && works.get(g.workId);
  const row = document.createElement('div'); row.className = 'match';
  const mk = (cap) => { const f = document.createElement('figure'); f.className = 'fig'; const c = document.createElement('canvas'); const fc = document.createElement('figcaption'); fc.textContent = cap; fc.title = cap; f.append(c, fc); return [f, c]; };
  const [fq, cq] = mk(`의심 이미지 · ${r.index + 1}번째 컷`);
  const [fg, cg] = mk(g ? `원본 · ${work?.name ?? ''} · ${g.fileName}` : '원본 (삭제됨)');
  drawPanel(cq, r.thumb, r.heat, HEAT);
  if (g) drawPanel(cg, g.thumb, r.heatC, HEAT);
  const info = document.createElement('div'); info.className = 'info';
  const type = document.createElement('span'); type.className = 'type ' + (r.level === 'weak' ? 'weak' : '');
  type.textContent = TYPE_LABEL[r.type] + (r.level === 'weak' ? ' (약한 근거)' : '');
  const score = document.createElement('div'); score.className = 'score'; score.textContent = r.score;
  const unit = document.createElement('small'); unit.textContent = '/ 100 유사도'; score.append(unit);
  info.append(type, score, signalRow('해시', (r.signals.hash - 0.5) * 2), signalRow('구도', r.signals.struct), signalRow('복제 면적', r.signals.area));
  if (r.signals.texture != null) info.append(signalRow('질감', r.signals.texture));
  const notes = [];
  if (r.domain === 'line') notes.push('색을 뺀 선화 비교에서 일치');
  if (r.flipped) notes.push('좌우반전됨');
  if (r.aiProb != null && r.aiProb >= 0.5) notes.push(`이 컷의 AI 생성 신호 ${Math.round(r.aiProb * 100)}% (실험적)`);
  if (notes.length) { const n = document.createElement('div'); n.className = 'note'; n.textContent = notes.join(' · '); info.append(n); }
  row.append(fq, fg, info);
  return row;
}

function renderResult(res) {
  const node = $('resultTpl').content.firstElementChild.cloneNode(true);
  const badge = node.querySelector('.badge'), s = res.summary;
  badge.classList.add(s.level);
  badge.textContent = { strong: '복제 가능성 높음', weak: '복제 의심', none: '일치하는 원본 없음' }[s.level];
  node.querySelector('.file').textContent = res.fileName;
  const bits = [`컷 ${s.total}개 중 ${s.matched}개 일치`];
  if (s.skipped) bits.push(`대사·여백 컷 ${s.skipped}개 제외`);
  if (s.level !== 'none') bits.push(`최고 유사도 ${s.score}`);
  if (!res.gallerySize) bits.push('갤러리가 비어 있어 비교 대상이 없습니다');
  node.querySelector('.meta').textContent = bits.join(' · ');

  const ai = node.querySelector('.ai-badge');
  if (res.ai) {
    ai.hidden = false;
    if (res.ai.error) { ai.classList.add('quiet'); ai.textContent = `AI 생성 검사 실패: ${res.ai.error}`; }
    else {
      const pct = Math.round(res.ai.prob * 100);
      if (res.ai.flagged) { ai.textContent = `AI 생성 이미지 ${pct}%`; ai.title = `AI 생성 분류기 확률 ${pct}% (시야 ${res.ai.views}개 집계). 실험적 기능이며 단정 근거가 아닙니다.`; }
      else { ai.classList.add('quiet'); ai.textContent = `AI 생성 신호 낮음 ${pct}%`; ai.title = '분류기가 AI 생성으로 보지 않았습니다. 학습에 없던 생성기는 놓칠 수 있습니다.'; }
      const sup = document.createElement('sup'); sup.textContent = '실험적'; ai.append(sup);
      for (const r of res.panels) if (res.ai.perPanel[r.index] != null) r.aiProb = res.ai.perPanel[r.index];
    }
  }

  const box = node.querySelector('.matches');
  const hits = res.panels.filter((r) => r.level !== 'none').sort((a, b) => b.score - a.score);
  if (!hits.length) {
    const m = document.createElement('div'); m.className = 'none-msg';
    const sim = res.panels.filter((r) => r.similar).length;
    m.textContent = res.gallerySize
      ? `갤러리의 어떤 컷과도 복제로 볼 만한 대응이 없습니다.${sim ? ` 분위기가 비슷한 컷은 ${sim}개 있었지만 위치가 맞는 대응 영역이 부족합니다.` : ''}`
      : '먼저 왼쪽에서 원본 이미지를 등록하세요.';
    box.append(m);
  } else {
    const FIRST = 4;
    hits.slice(0, FIRST).forEach((r) => box.append(matchRow(r)));
    if (hits.length > FIRST) {
      const more = document.createElement('button'); more.type = 'button'; more.className = 'more-btn';
      more.textContent = `일치 컷 ${hits.length - FIRST}개 더 보기`;
      more.addEventListener('click', () => { hits.slice(FIRST).forEach((r) => more.before(matchRow(r))); more.remove(); });
      box.append(more);
    }
  }
  return node;
}

async function checkFiles(files) {
  setBusy(true);
  $('clearResults').hidden = false;
  const ai = $('aiToggle').checked;
  for (const file of files) {
    try {
      const res = await call('check', { file, ai });
      $('results').prepend(renderResult(res));
      setStatus('검사 완료', 'ready');
    } catch (e) {
      const node = $('resultTpl').content.firstElementChild.cloneNode(true);
      node.querySelector('.badge').classList.add('err');
      node.querySelector('.badge').textContent = '검사 실패';
      node.querySelector('.file').textContent = file.name;
      node.querySelector('.meta').textContent = e.message;
      $('results').prepend(node);
    }
  }
  setBusy(false);
}

// ── 시작 ────────────────────────────────────────────────
bindDrop($('galleryDrop'), $('galleryFiles'), addOriginals);
bindDrop($('checkDrop'), $('checkFiles'), checkFiles);
$('addForm').addEventListener('submit', (e) => e.preventDefault());
$('clearResults').addEventListener('click', () => { $('results').replaceChildren(); $('clearResults').hidden = true; });
try { $('aiToggle').checked = localStorage.getItem('wcd-ai') !== '0'; } catch { /* 저장소 불가 */ }
$('aiToggle').addEventListener('change', () => { try { localStorage.setItem('wcd-ai', $('aiToggle').checked ? '1' : '0'); } catch { /* 무시 */ } });

(async () => {
  try {
    const { threads } = await call('init', { base: new URL('.', location.href).href });
    const saved = await db.loadAll();
    for (const w of saved.works) works.set(w.id, w);
    for (const p of saved.panels) panels.set(p.id, { id: p.id, workId: p.workId, fileName: p.fileName, box: p.box, thumb: p.thumb });
    await call('loadGallery', { panels: saved.panels.map(({ thumb, ...rest }) => rest) });
    renderGallery();
    setStatus(`준비됨 · 기기 안에서만 분석${threads > 1 ? ` · ${threads}스레드` : ''}`, 'ready');
  } catch (e) {
    setStatus(`초기화 실패: ${e.message}`, 'error');
  }
})();
