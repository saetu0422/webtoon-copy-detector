"""판정 흐름 설계도(docs/architecture.svg)를 생성한다. PNG는 이 SVG를 브라우저로 렌더링해 만든다."""
from html import escape

W, H = 1280, 1440
KIND = {  # 채움, 테두리, 꼬리표
    "model": ("#ece5fb", "#6b3fd4", "신경망 모델"),
    "rule": ("#eef1f6", "#7d879c", "규칙 기반 알고리즘"),
    "store": ("#fdf0d5", "#b26a00", "저장소"),
    "out": ("#fde4de", "#c8321a", "판정·출력"),
}
INK, MUTED = "#1c2233", "#5b657c"
o = []

def text(x, y, s, size=15, weight=400, fill=INK, anchor="start"):
    o.append(f'<text x="{x}" y="{y}" font-size="{size}" font-weight="{weight}" fill="{fill}" text-anchor="{anchor}">{escape(s)}</text>')

def box(x, y, w, h, title, lines, kind, tag=None):
    fill, stroke, full = KIND[kind]
    tag = tag or full
    o.append(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="12" fill="{fill}" stroke="{stroke}" stroke-width="1.5"/>')
    text(x + 16, y + 28, title, 16, 700)
    tw = len(tag) * 11 + 16
    o.append(f'<rect x="{x + w - tw - 12}" y="{y + 11}" width="{tw}" height="22" rx="11" fill="#fff" stroke="{stroke}" stroke-width="1"/>')
    text(x + w - 12 - tw / 2, y + 26.5, tag, 11.5, 700, stroke, "middle")
    for i, l in enumerate(lines):
        text(x + 16, y + 54 + i * 21, l, 13.5, 400, MUTED)

def frame(y, h, label, sub=""):
    o.append(f'<rect x="50" y="{y}" width="{W - 100}" height="{h}" rx="16" fill="#ffffff" stroke="#e2ded6" stroke-width="1.5"/>')
    text(72, y + 30, label, 17, 800)
    if sub: text(72 + len(label) * 16 + 14, y + 30, sub, 13.5, 400, MUTED)

def arrow(x1, y1, x2, y2, label="", lx=0, ly=0, dashed=False):
    d = ' stroke-dasharray="6 5"' if dashed else ""
    o.append(f'<line x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}" stroke="{INK}" stroke-width="2" marker-end="url(#a)"{d}/>')
    if label: text((x1 + x2) / 2 + lx, (y1 + y2) / 2 + ly, label, 13, 700, INK)

def path(d, dashed=False):
    da = ' stroke-dasharray="6 5"' if dashed else ""
    o.append(f'<path d="{d}" fill="none" stroke="{INK}" stroke-width="2" marker-end="url(#a)"{da}/>')

X3 = [80, 475, 870]; W3 = 330

# 제목과 범례
text(60, 58, "웹툰 복제 판정 설계도", 28, 800)
text(60, 86, "이미지 한 장이 판정에 이르기까지: 어떤 모델과 알고리즘이 어느 단계를 맡는가", 15, 400, MUTED)
lx = 760
for k in ("model", "rule", "store", "out"):
    fill, stroke, tag = KIND[k]
    o.append(f'<rect x="{lx}" y="42" width="18" height="18" rx="5" fill="{fill}" stroke="{stroke}" stroke-width="1.5"/>')
    text(lx + 25, 56, tag, 13, 400, MUTED); lx += 44 + len(tag) * 12.5

# 입력
for x, t, s in [(80, "원본 이미지", "작가가 갤러리에 등록"), (475, "의심 이미지", "불법 공유본·도용 의심 그림")]:
    o.append(f'<rect x="{x}" y="112" width="{W3}" height="62" rx="12" fill="{INK}"/>')
    text(x + 16, 139, t, 16, 700, "#fff"); text(x + 16, 160, s, 13, 400, "#c9cfde")
    arrow(x + W3 / 2, 174, x + W3 / 2, 204)

# ① 전처리
frame(206, 160, "① 공통 전처리", "원본과 의심 이미지 모두 같은 과정을 거칩니다")
box(X3[0], 252, W3, 96, "이미지 읽기", ["세로로 긴 원고를 띠 단위로 디코딩", "가로 1200px 이하로 축소"], "rule")
box(X3[1], 252, W3, 96, "컷 분리", ["여백 기준 재귀 XY-cut", "길쭉한 컷은 겹치는 창으로 나눔"], "rule")
box(X3[2], 252, W3, 96, "컷 필터", ["색이 2~3개뿐인 대사·자막 컷 제외", "내용이 거의 없는 컷 제외"], "rule")
arrow(X3[0] + W3, 300, X3[1] - 4, 300); arrow(X3[1] + W3, 300, X3[2] - 4, 300)
arrow(640, 366, 640, 398)

# ② 특징 추출
frame(400, 206, "② 컷별 특징 추출", "남은 컷마다 세 가지 특징을 뽑습니다")
box(X3[0], 446, W3, 140, "지각 해시", ["pHash + dHash (각 64bit)", "좌우반전본 해시도 함께 계산", "→ 동일본·재압축본을 즉시 식별"], "rule")
box(X3[1], 446, W3, 140, "DINOv2-small (컬러)", ["컷을 224×224로 넣어 16×16 패치 토큰", "4층 = 질감 · 8, 12층 = 구도", "→ 층별 전역 기술자 + 패치 특징"], "model")
box(X3[2], 446, W3, 140, "선화 변환 + DINOv2-small", ["Sobel로 색을 버리고 윤곽선만 남김", "같은 모델에 다시 입력", "→ 재채색·트레이싱 대응용 특징"], "model")

# 갈림: 저장 / 대조
arrow(X3[0] + W3 / 2, 606, X3[0] + W3 / 2, 652, "원본이면 저장", 12, 2)
box(X3[0], 654, W3, 96, "원본 갤러리 (IndexedDB)", ["컷 썸네일 + 해시 + 특징", "브라우저 밖으로 나가지 않음"], "store")
path(f"M {X3[2] + W3 / 2} 606 V 790")
text(X3[2] + W3 / 2 + 12, 700, "의심 이미지면 대조", 13, 700)
arrow(X3[0] + W3 / 2, 750, X3[0] + W3 / 2, 790, "비교 대상", 12, 4)

# ③ 대조
frame(792, 222, "③ 갤러리 대조", "의심 이미지의 컷 하나하나를 갤러리 전체와 비교합니다")
X4 = [80, 367, 654, 941]; W4 = 259
box(X4[0], 838, W4, 158, "1차 · 해시 비교", ["해밍 거리로 유사도 계산", "0.90 이상이면", "사실상 같은 그림"], "rule", "규칙 기반")
box(X4[1], 838, W4, 158, "2차 · 후보 선별", ["DINOv2 8·12층 전역 기술자", "코사인 유사도 상위 6컷만", "다음 단계로 보냄"], "model", "신경망")
box(X4[2], 838, W4, 158, "3차 · 패치 대응", ["12층 패치끼리 최근접 대응", "RANSAC으로 위치 관계 검증", "(배율·이동·좌우반전)", "→ 구도 점수, 질감 점수, 히트맵"], "rule", "규칙 기반")
box(X4[3], 838, W4, 158, "4차 · 선화 재비교", ["구도 점수가 0.68 미만일 때만", "선화 특징으로 2~3차를 반복", "→ 색이 바뀐 트레이싱 포착"], "model", "신경망")
for i in range(3): arrow(X4[i] + W4, 917, X4[i + 1] - 4, 917, dashed=(i == 2))
arrow(640, 1014, 640, 1046)

# ④ 판정
frame(1048, 160, "④ 판정", "")
box(X3[0], 1094, W3, 96, "컷 판정", ["구도 점수 0.68↑ 가능성 높음 · 0.64↑ 의심", "유형: 동일 · 편집 · 트레이싱 의심"], "out")
box(X3[1], 1094, W3, 96, "이미지 집계", ["컷 하나라도 복제면", "이미지 전체를 복제로 판정"], "out")
box(X3[2], 1094, W3, 96, "결과 화면", ["판정 배지 + 유사도 점수", "원본·의심 컷 나란히 + 히트맵"], "out")
arrow(X3[0] + W3, 1142, X3[1] - 4, 1142); arrow(X3[1] + W3, 1142, X3[2] - 4, 1142)

# ⑤ AI 생성
frame(1240, 160, "⑤ AI 생성 표시 (실험적)", "복제 판정과 별개로, ①에서 나눈 의심 이미지의 컷을 봅니다")
box(X3[0], 1286, W3, 96, "시야 만들기", ["그림이 있는 큰 컷 3개 선택", "전체 축소본 + 원해상도 512 조각"], "rule")
box(X3[1], 1286, W3, 96, "AI-Anime-Image-Detector", ["ViT-B 분류기, 512×512 입력", "시야마다 AI 생성 확률 출력"], "model")
box(X3[2], 1286, W3, 96, "집계 → 배지", ["상위 2개 확률 평균이 0.5 이상이면", "“AI 생성 이미지 · 실험적” 표시"], "out")
arrow(X3[0] + W3, 1334, X3[1] - 4, 1334); arrow(X3[1] + W3, 1334, X3[2] - 4, 1334)
arrow(X3[2] + W3 / 2, 1284, X3[2] + W3 / 2, 1194, dashed=True)

text(60, 1424, "임계값(0.68 / 0.64 / 0.90)은 실제 웹툰 10개 작품으로 보정한 값입니다. 점선은 조건부로만 실행되거나 보조 정보인 흐름입니다.", 13, 400, MUTED)

svg = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}" font-family="Pretendard, 'Apple SD Gothic Neo', 'Noto Sans KR', 'Malgun Gothic', sans-serif">
<defs><marker id="a" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" fill="{INK}"/></marker></defs>
<rect width="{W}" height="{H}" fill="#f4f2ee"/>
{chr(10).join(o)}
</svg>'''
open("docs/architecture.svg", "w", encoding="utf-8").write(svg)
