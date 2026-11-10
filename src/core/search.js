// 컷 하나를 갤러리와 비교해 판정을 낸다.
import { hashSim } from './hash.js';
import { globalSim, matchPair } from './match.js';
import { NP } from './embed.js';

// 실제 웹툰 10개 작품의 컷 345개로 보정한 임계값 (scripts/eval.mjs).
// 변형 복제본의 구도 점수 5% 분위 ≈ 0.63, 무관한 컷의 95% 분위 ≈ 0.58.
// 컷 하나는 놓쳐도 이미지 단위 집계에서 다른 컷이 잡아 주므로 오탐을 줄이는 쪽으로 잡았다.
export const TH = { strong: 0.68, weak: 0.64, hashExact: 0.9, minContent: 24, similarScene: 0.75, styleKeep: 0.6 };

export const TYPE_LABEL = {
  exact: '동일 복제',
  edited: '편집 복제',
  trace: '트레이싱·재작화 의심',
};

const contentCount = (mask) => { let n = 0; for (let p = 0; p < NP; p++) if (mask[p] === 2) n++; return n; };

/** 구도 점수 → 0~100 표시 점수 */
export const toScore = (struct) => Math.round(100 / (1 + Math.exp(-(struct - 0.64) / 0.035)));

/**
 * @param q 질의 컷 특징 { ph, dh, phF, dhF, g, p12, p4, n12, n4, mask, line?: { g, p12, n12, mask } }
 * @param gallery 같은 형태의 갤러리 컷 배열 (id 포함)
 */
export function searchPanel(q, gallery, { topK = 6 } = {}) {
  const res = { level: 'none' };
  if (q.skip) return { ...res, skip: q.skip };
  gallery = gallery.filter((c) => !c.skip);
  if (!gallery.length) return res;

  const cands = gallery.map((c) => {
    const hash = Math.max(hashSim(q.ph, c.ph), hashSim(q.dh, c.dh));
    const hashFlip = q.phF ? Math.max(hashSim(q.phF, c.ph), hashSim(q.dhF, c.dh)) : 0;
    const gs = globalSim(q.g, c.g);
    return { c, hash: Math.max(hash, hashFlip), sem: gs.sem, style: gs.style };
  });

  // 1차: 해시가 사실상 같으면 바로 동일 복제
  const pick = new Set(cands.filter((x) => x.hash >= 0.84));
  // 2차: 다층 전역 기술자로 후보 선별
  [...cands].sort((a, b) => b.sem - a.sem).slice(0, topK).forEach((x) => pick.add(x));

  let best = null;
  const consider = (x, m, domain) => {
    if (!m.heat) return;
    if (!best || m.struct > best.m.struct) best = { ...x, m, domain };
  };
  // 3차: 패치 대응 + 기하 검증 (색 도메인)
  for (const x of pick) consider(x, matchPair(q, x.c), 'color');

  // 4차: 색 도메인에서 확신이 없으면 선화 도메인으로 다시 비교 (채색·질감이 바뀐 트레이싱)
  if (q.line && (!best || best.m.struct < TH.strong) && contentCount(q.line.mask) >= TH.minContent) {
    const lc = cands.filter((x) => x.c.line).map((x) => ({ ...x, lsem: globalSim(q.line.g, x.c.line.g).sem }));
    lc.sort((a, b) => b.lsem - a.lsem);
    for (const x of lc.slice(0, topK)) {
      const m = matchPair(q.line, x.c.line);
      if (m.heat && (!best || m.struct > best.m.struct + 0.02)) best = { ...x, m, domain: 'line' };
    }
  }

  const topHash = cands.reduce((a, b) => (b.hash > a.hash ? b : a));
  if (topHash.hash >= TH.hashExact && (!best || best.c !== topHash.c)) {
    const m = matchPair(q, topHash.c);
    best = { ...topHash, m: m.heat ? m : { struct: 1, coverage: 1, covQ: 1, texture: 1, heat: null, heatC: null, T: null }, domain: 'color' };
  }
  if (!best) {
    const top = cands.reduce((a, b) => (b.sem > a.sem ? b : a));
    if (top.sem >= TH.similarScene) res.similar = { id: top.c.id, sem: top.sem };
    return res;
  }

  const { m } = best;
  const exact = best.hash >= TH.hashExact;
  const level = exact || m.struct >= TH.strong ? 'strong' : m.struct >= TH.weak ? 'weak' : 'none';
  if (level === 'none') {
    if (best.sem >= TH.similarScene) res.similar = { id: best.c.id, sem: best.sem };
    return res;
  }
  // 유형 추정. 질감(층 4) 유사도는 크기가 바뀌거나 반전되면 낮아지므로, 배율이 거의 같을 때만 근거로 쓴다.
  const flipped = m.T ? m.T.f < 0 : false;
  const sameScale = !m.T || (m.T.s > 0.9 && m.T.s < 1.1);
  let type = 'edited';
  if (best.domain === 'line') type = 'trace';
  else if (!flipped && sameScale && m.texture < 0.8) type = 'trace';
  else if (exact && !flipped && m.texture >= 0.85) type = 'exact';
  return {
    ...res, level, type,
    id: best.c.id,
    score: exact ? Math.max(99, toScore(m.struct)) : toScore(m.struct),
    signals: { hash: best.hash, struct: m.struct, texture: best.domain === 'line' ? null : m.texture, style: best.style, sem: best.sem, area: m.coverage },
    domain: best.domain, heat: m.heat, heatC: m.heatC, flipped,
  };
}

/** 이미지 단위 집계 — 반증 원칙(LTF): 컷 하나라도 복제면 이미지 전체가 복제. */
export function aggregate(panelResults) {
  const strong = panelResults.filter((r) => r.level === 'strong'), weak = panelResults.filter((r) => r.level === 'weak');
  return {
    level: strong.length ? 'strong' : weak.length ? 'weak' : 'none',
    score: Math.max(0, ...panelResults.map((r) => r.score || 0)),
    matched: strong.length + weak.length, strong: strong.length, total: panelResults.length,
  };
}
