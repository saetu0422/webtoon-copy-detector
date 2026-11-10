"""판정 흐름 설계도를 생성한다: docs/architecture.svg (한국어), docs/architecture.en.svg (영어).
PNG는 각 SVG를 브라우저로 렌더링해 만든다."""
from html import escape

W, H = 1280, 1440
INK, MUTED = "#1c2233", "#5b657c"
KIND = {  # 채움, 테두리, (한국어 꼬리표, 영어 꼬리표)
    "model": ("#ece5fb", "#6b3fd4", ("신경망 모델", "Neural model")),
    "rule": ("#eef1f6", "#7d879c", ("규칙 기반 알고리즘", "Rule-based")),
    "store": ("#fdf0d5", "#b26a00", ("저장소", "Storage")),
    "out": ("#fde4de", "#c8321a", ("판정·출력", "Verdict / output")),
}
SHORT = {"model": ("신경망", "Neural"), "rule": ("규칙 기반", "Rule-based")}


def build(lang):
    en = lang == "en"
    t = lambda ko, e: e if en else ko          # 언어 선택
    cw = lambda s, size: len(s) * size * (0.56 if en else 0.95)  # 대략적인 글자 폭
    o = []

    def text(x, y, s, size=15, weight=400, fill=INK, anchor="start"):
        o.append(f'<text x="{x}" y="{y}" font-size="{size}" font-weight="{weight}" fill="{fill}" text-anchor="{anchor}">{escape(s)}</text>')

    def box(x, y, w, h, title, lines, kind, short=False):
        fill, stroke, tags = KIND[kind]
        tag = t(*(SHORT[kind] if short else tags))
        o.append(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="12" fill="{fill}" stroke="{stroke}" stroke-width="1.5"/>')
        text(x + 16, y + 28, title, 16, 700)
        tw = cw(tag, 11.5) + 18
        o.append(f'<rect x="{x + w - tw - 12}" y="{y + 11}" width="{tw}" height="22" rx="11" fill="#fff" stroke="{stroke}" stroke-width="1"/>')
        text(x + w - 12 - tw / 2, y + 26.5, tag, 11.5, 700, stroke, "middle")
        for i, l in enumerate(lines):
            text(x + 16, y + 54 + i * 21, l, 13.5, 400, MUTED)

    def frame(y, h, label, sub=""):
        o.append(f'<rect x="50" y="{y}" width="{W - 100}" height="{h}" rx="16" fill="#ffffff" stroke="#e2ded6" stroke-width="1.5"/>')
        text(72, y + 30, label, 17, 800)
        if sub: text(72 + cw(label, 17) + 22, y + 30, sub, 13.5, 400, MUTED)

    def arrow(x1, y1, x2, y2, label="", lx=0, ly=0, dashed=False):
        d = ' stroke-dasharray="6 5"' if dashed else ""
        o.append(f'<line x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}" stroke="{INK}" stroke-width="2" marker-end="url(#a)"{d}/>')
        if label: text((x1 + x2) / 2 + lx, (y1 + y2) / 2 + ly, label, 13, 700, INK)

    X3 = [80, 475, 870]; W3 = 330

    # 제목과 범례
    text(60, 58, t("웹툰 복제 판정 설계도", "Webtoon copy detection pipeline"), 28, 800)
    text(60, 86, t("이미지 한 장이 판정에 이르기까지: 어떤 모델과 알고리즘이 어느 단계를 맡는가",
                   "From one image to a verdict: which model or algorithm handles each stage"), 15, 400, MUTED)
    lx = 700 if en else 760
    for k in ("model", "rule", "store", "out"):
        fill, stroke, tags = KIND[k]
        o.append(f'<rect x="{lx}" y="42" width="18" height="18" rx="5" fill="{fill}" stroke="{stroke}" stroke-width="1.5"/>')
        text(lx + 25, 56, t(*tags), 13, 400, MUTED); lx += 44 + cw(t(*tags), 13)

    # 입력
    for x, title, sub in [(80, t("원본 이미지", "Original image"), t("작가가 갤러리에 등록", "Registered in the gallery by the artist")),
                          (475, t("의심 이미지", "Suspect image"), t("불법 공유본·도용 의심 그림", "A pirated copy or suspected plagiarism"))]:
        o.append(f'<rect x="{x}" y="112" width="{W3}" height="62" rx="12" fill="{INK}"/>')
        text(x + 16, 139, title, 16, 700, "#fff"); text(x + 16, 160, sub, 13, 400, "#c9cfde")
        arrow(x + W3 / 2, 174, x + W3 / 2, 204)

    # ① 전처리
    frame(206, 160, t("① 공통 전처리", "① Shared preprocessing"), t("원본과 의심 이미지 모두 같은 과정을 거칩니다", "Originals and suspects go through the same steps"))
    box(X3[0], 252, W3, 96, t("이미지 읽기", "Read image"), [t("세로로 긴 원고를 띠 단위로 디코딩", "Decode tall strips band by band"), t("가로 1200px 이하로 축소", "Downscale to at most 1200 px wide")], "rule")
    box(X3[1], 252, W3, 96, t("컷 분리", "Split panels"), [t("여백 기준 재귀 XY-cut", "Recursive XY-cut on the gutters"), t("길쭉한 컷은 겹치는 창으로 나눔", "Long panels become overlapping windows")], "rule")
    box(X3[2], 252, W3, 96, t("컷 필터", "Filter panels"), [t("색이 2~3개뿐인 대사·자막 컷 제외", "Drop text-only panels (2-3 colors)"), t("내용이 거의 없는 컷 제외", "Drop nearly empty panels")], "rule")
    arrow(X3[0] + W3, 300, X3[1] - 4, 300); arrow(X3[1] + W3, 300, X3[2] - 4, 300)
    arrow(640, 366, 640, 398)

    # ② 특징 추출
    frame(400, 206, t("② 컷별 특징 추출", "② Features per panel"), t("남은 컷마다 세 가지 특징을 뽑습니다", "Three kinds of features for every remaining panel"))
    box(X3[0], 446, W3, 140, t("지각 해시", "Perceptual hashes"), [t("pHash + dHash (각 64bit)", "pHash + dHash (64 bits each)"), t("좌우반전본 해시도 함께 계산", "Also hashed after a horizontal flip"), t("→ 동일본·재압축본을 즉시 식별", "→ spots identical / recompressed copies")], "rule")
    box(X3[1], 446, W3, 140, t("DINOv2-small (컬러)", "DINOv2-small (color)"), [t("컷을 224×224로 넣어 16×16 패치 토큰", "224×224 input → 16×16 patch tokens"), t("4층 = 질감 · 8, 12층 = 구도", "Layer 4 = texture · 8, 12 = composition"), t("→ 층별 전역 기술자 + 패치 특징", "→ per-layer descriptors + patch features")], "model")
    box(X3[2], 446, W3, 140, t("선화 변환 + DINOv2-small", "Line art + DINOv2-small"), [t("Sobel로 색을 버리고 윤곽선만 남김", "Sobel keeps outlines, drops color"), t("같은 모델에 다시 입력", "Fed to the same model again"), t("→ 재채색·트레이싱 대응용 특징", "→ features for recolored / traced art")], "model")

    # 갈림: 저장 / 대조
    arrow(X3[0] + W3 / 2, 606, X3[0] + W3 / 2, 652, t("원본이면 저장", "If original: store"), 12, 2)
    box(X3[0], 654, W3, 96, t("원본 갤러리 (IndexedDB)", "Gallery (IndexedDB)"), [t("컷 썸네일 + 해시 + 특징", "Panel thumbnails + hashes + features"), t("브라우저 밖으로 나가지 않음", "Never leaves the browser")], "store")
    o.append(f'<path d="M {X3[2] + W3 / 2} 606 V 790" fill="none" stroke="{INK}" stroke-width="2" marker-end="url(#a)"/>')
    text(X3[2] + W3 / 2 + 12, 700, t("의심 이미지면 대조", "If suspect: compare"), 13, 700)
    arrow(X3[0] + W3 / 2, 750, X3[0] + W3 / 2, 790, t("비교 대상", "Compared against"), 12, 4)

    # ③ 대조
    frame(792, 222, t("③ 갤러리 대조", "③ Compare with gallery"), t("의심 이미지의 컷 하나하나를 갤러리 전체와 비교합니다", "Each suspect panel is checked against the whole gallery"))
    X4 = [80, 367, 654, 941]; W4 = 259
    box(X4[0], 838, W4, 158, t("1차 · 해시 비교", "1 · Hash check"), [t("해밍 거리로 유사도 계산", "Similarity from Hamming distance"), t("0.90 이상이면", "0.90 or higher means"), t("사실상 같은 그림", "practically the same picture")], "rule", True)
    box(X4[1], 838, W4, 158, t("2차 · 후보 선별", "2 · Shortlist"), [t("DINOv2 8·12층 전역 기술자", "DINOv2 layer 8, 12 descriptors"), t("코사인 유사도 상위 6컷만", "Top 6 panels by cosine similarity"), t("다음 단계로 보냄", "go on to the next step")], "model", True)
    box(X4[2], 838, W4, 158, t("3차 · 패치 대응", "3 · Patch match"), [t("12층 패치끼리 최근접 대응", "Nearest layer-12 patch matches"), t("RANSAC으로 위치 관계 검증", "RANSAC checks the geometry"), t("(배율·이동·좌우반전)", "(scale, shift, flip)"), t("→ 구도 점수, 질감 점수, 히트맵", "→ structure, texture, heatmap")], "rule", True)
    box(X4[3], 838, W4, 158, t("4차 · 선화 재비교", "4 · Line-art retry"), [t("구도 점수가 0.68 미만일 때만", "Only if structure score < 0.68"), t("선화 특징으로 2~3차를 반복", "Repeat steps 2-3 on line art"), t("→ 색이 바뀐 트레이싱 포착", "→ catches recolored tracing")], "model", True)
    for i in range(3): arrow(X4[i] + W4, 917, X4[i + 1] - 4, 917, dashed=(i == 2))
    arrow(640, 1014, 640, 1046)

    # ④ 판정
    frame(1048, 160, t("④ 판정", "④ Verdict"))
    box(X3[0], 1094, W3, 96, t("컷 판정", "Panel verdict"), [t("구도 점수 0.68↑ 가능성 높음 · 0.64↑ 의심", "Structure ≥ 0.68 likely · ≥ 0.64 suspected"), t("유형: 동일 · 편집 · 트레이싱 의심", "Type: identical · edited · traced?")], "out")
    box(X3[1], 1094, W3, 96, t("이미지 집계", "Image verdict"), [t("컷 하나라도 복제면", "If any one panel is a copy,"), t("이미지 전체를 복제로 판정", "the whole image counts as a copy")], "out")
    box(X3[2], 1094, W3, 96, t("결과 화면", "Result view"), [t("판정 배지 + 유사도 점수", "Verdict badge + similarity score"), t("원본·의심 컷 나란히 + 히트맵", "Panels side by side + heatmap")], "out")
    arrow(X3[0] + W3, 1142, X3[1] - 4, 1142); arrow(X3[1] + W3, 1142, X3[2] - 4, 1142)

    # ⑤ AI 생성
    frame(1240, 160, t("⑤ AI 생성 표시 (실험적)", "⑤ AI-generated flag (experimental)"), t("복제 판정과 별개로, ①에서 나눈 의심 이미지의 컷을 봅니다", "Separate from copy detection; uses the suspect panels from ①"))
    box(X3[0], 1286, W3, 96, t("시야 만들기", "Build views"), [t("그림이 있는 큰 컷 3개 선택", "Pick the 3 largest drawn panels"), t("전체 축소본 + 원해상도 512 조각", "Whole panel + native 512 px crop")], "rule")
    box(X3[1], 1286, W3, 96, "AI-Anime-Image-Detector", [t("ViT-B 분류기, 512×512 입력", "ViT-B classifier, 512×512 input"), t("시야마다 AI 생성 확률 출력", "AI probability for each view")], "model", en)
    box(X3[2], 1286, W3, 96, t("집계 → 배지", "Aggregate → badge"), [t("상위 2개 확률 평균이 0.5 이상이면", "If the top-2 mean is 0.5 or higher,"), t("“AI 생성 이미지 · 실험적” 표시", "show “AI-generated · experimental”")], "out")
    arrow(X3[0] + W3, 1334, X3[1] - 4, 1334); arrow(X3[1] + W3, 1334, X3[2] - 4, 1334)
    arrow(X3[2] + W3 / 2, 1284, X3[2] + W3 / 2, 1194, dashed=True)

    text(60, 1424, t("임계값(0.68 / 0.64 / 0.90)은 실제 웹툰 10개 작품으로 보정한 값입니다. 점선은 조건부로만 실행되거나 보조 정보인 흐름입니다.",
                     "Thresholds (0.68 / 0.64 / 0.90) were fitted on 10 real webtoon series. Dashed arrows are conditional or supplementary flows."), 13, 400, MUTED)

    font = "'Inter', 'Helvetica Neue', Arial, sans-serif" if en else "Pretendard, 'Apple SD Gothic Neo', 'Noto Sans KR', 'Malgun Gothic', sans-serif"
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}" font-family="{font}">
<defs><marker id="a" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" fill="{INK}"/></marker></defs>
<rect width="{W}" height="{H}" fill="#f4f2ee"/>
{chr(10).join(o)}
</svg>'''


for lang, name in (("ko", "docs/architecture.svg"), ("en", "docs/architecture.en.svg")):
    open(name, "w", encoding="utf-8").write(build(lang))
