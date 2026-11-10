// 화면 문구(한국어/영어). 긴 안내문은 index.html에 data-lang 블록으로 들어 있다.
const M = {
  ko: {
    title: '웹툰 복제 탐지기',
    preparing: '준비 중…',
    ready: '준비됨 · 기기 안에서만 분석',
    threads: ' · {n}스레드',
    initFail: '초기화 실패: {m}',
    checkDone: '검사 완료',
    ingestDone: '등록 완료',
    ingestSkipped: ' (대사·여백 컷 {n}개 제외)',
    partialFail: '일부 실패 — {m}',
    modelLoad: '{label} 모델 불러오는 중',
    label_copy: '복제 탐지', label_ai: 'AI 생성 탐지',
    analyzing: '{name} 분석 중',
    panels: '{name} 컷 분석 중',
    comparing: '{name} 갤러리와 비교 중',
    aiChecking: '{name} AI 생성 여부 검사 중 (실험적)',
    workMeta: '이미지 {f}장 · 컷 {p}개',
    del: '삭제',
    confirmDelete: '"{name}"을(를) 갤러리에서 삭제할까요? 등록된 컷이 모두 지워집니다.',
    galleryCount: '작품 {w}개 · 컷 {p}개',
    v_strong: '복제 가능성 높음', v_weak: '복제 의심', v_none: '일치하는 원본 없음',
    metaPanels: '컷 {t}개 중 {m}개 일치',
    metaSkipped: '대사·여백 컷 {n}개 제외',
    metaTop: '최고 유사도 {s}',
    metaEmpty: '갤러리가 비어 있어 비교 대상이 없습니다',
    aiFlagged: 'AI 생성 이미지 {p}%',
    aiQuiet: 'AI 생성 신호 낮음 {p}%',
    experimental: '실험적',
    aiFlaggedTip: 'AI 생성 분류기 확률 {p}% (시야 {v}개 집계). 실험적 기능이며 단정 근거가 아닙니다.',
    aiQuietTip: '분류기가 AI 생성으로 보지 않았습니다. 학습에 없던 생성기는 놓칠 수 있습니다.',
    aiFail: 'AI 생성 검사 실패: {m}',
    noneMsg: '갤러리의 어떤 컷과도 복제로 볼 만한 대응이 없습니다.',
    noneSimilar: ' 분위기가 비슷한 컷은 {n}개 있었지만 위치가 맞는 대응 영역이 부족합니다.',
    noneNoGallery: '먼저 원본 갤러리에 원본 이미지를 등록하세요.',
    more: '일치 컷 {n}개 더 보기',
    capQuery: '의심 이미지 · {n}번째 컷',
    capOrig: '원본 · {w} · {f}',
    capDeleted: '원본 (삭제됨)',
    type_exact: '동일 복제', type_edited: '편집 복제', type_trace: '트레이싱·재작화 의심',
    weakSuffix: ' (약한 근거)',
    scoreUnit: '/ 100 유사도',
    s_hash: '해시', s_struct: '구도', s_area: '복제 면적', s_texture: '질감',
    n_line: '색을 뺀 선화 비교에서 일치', n_flip: '좌우반전됨',
    n_ai: '이 컷의 AI 생성 신호 {p}% (실험적)',
    failBadge: '검사 실패',
    E_DECODE: '이미지를 열 수 없습니다 (형식 미지원 또는 크기 초과)',
    E_MODEL: '{label} 모델을 불러오지 못했습니다 ({s})',
    switchTo: 'English',
  },
  en: {
    title: 'Webtoon Copy Detector',
    preparing: 'Getting ready…',
    ready: 'Ready · runs only on this device',
    threads: ' · {n} threads',
    initFail: 'Failed to start: {m}',
    checkDone: 'Check complete',
    ingestDone: 'Added to gallery',
    ingestSkipped: ' ({n} text-only or empty panels skipped)',
    partialFail: 'Some files failed: {m}',
    modelLoad: 'Loading the {label} model',
    label_copy: 'copy-detection', label_ai: 'AI-image detection',
    analyzing: 'Analyzing {name}',
    panels: 'Analyzing panels of {name}',
    comparing: 'Comparing {name} with the gallery',
    aiChecking: 'Checking {name} for AI generation (experimental)',
    workMeta: '{f} images · {p} panels',
    del: 'Delete',
    confirmDelete: 'Delete "{name}" from the gallery? All of its registered panels will be removed.',
    galleryCount: '{w} works · {p} panels',
    v_strong: 'Likely a copy', v_weak: 'Possible copy', v_none: 'No matching original',
    metaPanels: '{m} of {t} panels matched',
    metaSkipped: '{n} text-only or empty panels skipped',
    metaTop: 'top similarity {s}',
    metaEmpty: 'the gallery is empty, so there is nothing to compare against',
    aiFlagged: 'AI-generated image {p}%',
    aiQuiet: 'Low AI signal {p}%',
    experimental: 'experimental',
    aiFlaggedTip: 'The AI-image classifier gave {p}% (aggregated over {v} views). This is experimental and not proof.',
    aiQuietTip: 'The classifier did not see this as AI-generated. It can miss generators it was not trained on.',
    aiFail: 'AI check failed: {m}',
    noneMsg: 'No panel in the gallery corresponds closely enough to count as a copy.',
    noneSimilar: ' {n} panels looked similar overall, but without enough position-consistent matching regions.',
    noneNoGallery: 'Register your original images in the gallery first.',
    more: 'Show {n} more matched panels',
    capQuery: 'Suspect image · panel {n}',
    capOrig: 'Original · {w} · {f}',
    capDeleted: 'Original (deleted)',
    type_exact: 'Identical copy', type_edited: 'Edited copy', type_trace: 'Possible tracing / redraw',
    weakSuffix: ' (weak evidence)',
    scoreUnit: '/ 100 similarity',
    s_hash: 'Hash', s_struct: 'Structure', s_area: 'Copied area', s_texture: 'Texture',
    n_line: 'Matched in the line-art comparison (color removed)', n_flip: 'Horizontally flipped',
    n_ai: 'AI signal for this panel: {p}% (experimental)',
    failBadge: 'Check failed',
    E_DECODE: 'Could not open the image (unsupported format or too large)',
    E_MODEL: 'Could not load the {label} model ({s})',
    switchTo: '한국어',
  },
};

let lang = 'ko';
try {
  const saved = localStorage.getItem('wcd-lang');
  lang = saved === 'ko' || saved === 'en' ? saved : (navigator.language || 'ko').toLowerCase().startsWith('ko') ? 'ko' : 'en';
} catch { /* 저장소 불가 */ }

export const getLang = () => lang;
export function setLang(l) {
  lang = l;
  try { localStorage.setItem('wcd-lang', l); } catch { /* 무시 */ }
}
export function t(key, params = {}) {
  const s = M[lang][key] ?? M.ko[key] ?? key;
  return s.replace(/\{(\w+)\}/g, (_, k) => params[k] ?? '');
}
/** 워커가 보낸 오류 코드를 문장으로. */
export function errorText(msg) {
  if (msg === 'E_DECODE') return t('E_DECODE');
  const m = /^E_MODEL:(\w+):(.*)$/.exec(msg);
  return m ? t('E_MODEL', { label: t('label_' + m[1]), s: m[2] }) : msg;
}
/** 정적 문구 적용: data-i18n(본문), data-i18n-placeholder, data-i18n-title. */
export function applyStatic(root = document) {
  document.documentElement.lang = lang;
  document.title = t('title');
  for (const el of root.querySelectorAll('[data-ko]')) el.textContent = lang === 'en' ? el.dataset.en : el.dataset.ko;
  for (const el of root.querySelectorAll('[data-ko-placeholder]')) el.placeholder = lang === 'en' ? el.dataset.enPlaceholder : el.dataset.koPlaceholder;
  for (const el of root.querySelectorAll('[data-ko-title]')) el.title = lang === 'en' ? el.dataset.enTitle : el.dataset.koTitle;
}
