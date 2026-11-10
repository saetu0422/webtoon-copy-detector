# 웹툰 복제 탐지기

원본 웹툰 이미지를 브라우저에 등록해 두고, 의심 이미지를 올리면 컷 단위로 복제·편집·트레이싱 여부를 찾아내는 정적 웹사이트입니다. 모든 분석은 브라우저 안에서 이뤄지며 이미지는 어디에도 전송되지 않습니다.

## 실행

```bash
npm install
```

```bash
npm run dev
```

배포용 빌드는 `npm run build` 후 `dist/` 폴더를 정적 호스팅에 올리면 됩니다. 모델 파일(`public/models/`, 약 108MB)이 함께 올라갑니다.

- 서버가 `Cross-Origin-Opener-Policy: same-origin`, `Cross-Origin-Embedder-Policy: require-corp` 헤더를 주면 WASM 멀티스레드가 켜져 더 빠릅니다. 헤더가 없어도 단일 스레드로 동작합니다.
- `onnxruntime-web` 버전을 올리면 `public/ort/`의 두 파일도 `node_modules/onnxruntime-web/dist/`에서 다시 복사해야 합니다.

## 판정 과정

1. **컷 분리** (`src/core/panels.js`) — 여백 기준 재귀 XY-cut. 색이 2~3개뿐인 말풍선·자막 컷과 내용이 거의 없는 컷은 근거에서 뺍니다.
2. **해시** (`hash.js`) — pHash + dHash, 좌우반전본 포함.
3. **다층 특징 검색** (`embed.js`, `match.js`) — DINOv2-small의 4·8·12층 토큰을 내보내 층별 전역 기술자로 후보를 고릅니다.
4. **패치 대응 + 기하 검증** (`match.js`) — 패치 친화도 최근접 대응 → RANSAC(배율·이동·반전) → 정렬된 패치 유사도 맵. 이 맵이 화면의 히트맵입니다.
5. **선화 재비교** (`pipeline.js`) — 색 도메인에서 확신이 없으면 윤곽선만 남긴 그림끼리 다시 비교합니다.
6. **집계** (`search.js`) — 컷 하나라도 복제면 이미지 전체를 복제로 봅니다.
7. **AI 생성 표시, 실험적** (`aidetect.js`) — 공개 분류기를 큰 컷 3개의 여러 시야에 적용하고 상위 2개 확률을 평균합니다.

참고한 연구: Learning to Falsify (arXiv 2611.04529, 반증 원칙 집계), GILA (arXiv 2611.00017, 다층 표현), CopyNCE (arXiv 2602.17484, 패치 친화도). 이 논문들의 학습 방법을 재현한 것이 아니라, 사전학습 모델 위에 아이디어를 적용한 것입니다.

## 자체 점검 수치

실제 웹툰 10개 작품(각 4000px 청크 3개를 갤러리로, 컷 198개)으로 `node scripts/e2e.mjs <청크 폴더>`를 돌린 결과입니다.

| 경우 | 이미지 단위 "가능성 높음" | 컷 일치율 |
|---|---|---|
| 재압축+축소 / 좌우반전 / 색조 변경 / 대사 제거 | 15/15 | 0.99~1.00 |
| 부분 잘라내기 | 15/15 | 0.79 |
| 워터마크+여백 | 15/15 | 0.95 |
| 재채색 트레이싱(합성 모사) | 15/15 | 0.78 |
| 선화 트레이싱(합성 모사) | 12/15 | 0.55 |
| 같은 작품의 다른 페이지(음성) | 0/28 ("의심" 6/28) | 확정 0.0%, 의심 5.7% |

트레이싱 두 줄은 필터로 만든 모사본이라 손으로 다시 그린 실제 트레이싱의 성능을 뜻하지 않습니다. 임계값(`search.js`의 `TH`)은 이 10개 작품에 맞춘 값이라 화풍이 크게 다른 작품에서는 달라질 수 있습니다.

AI 생성 분류기는 사람이 그린 웹툰 40장 중 0~1장을 AI로 오판했고, NijiJourney 생성 이미지 24장 중 7장만 잡았습니다(`tools/test_aidet.py`).

## 모델과 라이선스

- `dinov2s_int8.onnx` — facebook/dinov2-small (Apache-2.0)을 `tools/export_dinov2.py`로 변환·int8 양자화.
- `anime_ai_detector_int8.onnx` — legekka/AI-Anime-Image-Detector-ViT (Apache-2.0)의 onnx-community 변환본.
- `src/core/centers.js` — `scripts/centers.mjs`가 계산한 층별 평균 토큰.
