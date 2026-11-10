"""AI 생성 탐지 모델 검증: 실제 웹툰 컷(사람 작화) vs NijiJourney 생성 이미지."""
import glob, sys, time, numpy as np, onnxruntime as ort
from PIL import Image
Image.MAX_IMAGE_PIXELS = None
so = ort.SessionOptions(); so.intra_op_num_threads = 4
sess = {k: ort.InferenceSession(p, so) for k, p in [("int8", "public/models/anime_ai_detector_int8.onnx"), ("fp32", "tools/weights/aidet/model.onnx")][: (2 if "--fp32" in sys.argv else 1)]}
def prep(im):
    a = np.asarray(im.convert("RGB").resize((512, 512), Image.BILINEAR), np.float32) / 255
    return ((a - 0.5) / 0.5).transpose(2, 0, 1)[None]
def views(im):
    w, h = im.size; v = []
    s = min(w, h); v.append(im.crop(((w - s) // 2, (h - s) // 2, (w + s) // 2, (h + s) // 2)))  # 전체(중앙 정사각)
    if s >= 512:
        for fx, fy in [(0.5, 0.5), (0, 0), (1, 1)]:
            x, y = int((w - 512) * fx), int((h - 512) * fy); v.append(im.crop((x, y, x + 512, y + 512)))
    return v
def prob(k, im):
    out = []
    for v in views(im):
        l = sess[k].run(None, {"pixel_values": prep(v)})[0][0]; e = np.exp(l - l.max()); out.append(float(e[1] / e.sum()))
    return out
real = []
for f in sorted(glob.glob("/home/user/wcd-testdata/chunks/*_base.png"))[::3]:
    im = Image.open(f).convert("RGB")
    for y in (300, 2200): real.append(im.crop((0, y, im.width, y + 800)))
ai = [Image.open(f) for f in sorted(glob.glob("/home/user/wcd-testdata/ai/*.png"))]
for k in sess:
    t = time.time(); R = [prob(k, im) for im in real]; A = [prob(k, im) for im in ai]; dt = (time.time() - t) / sum(map(len, R + A))
    for name, agg in [("whole", lambda p: p[0]), ("mean", np.mean), ("top2mean", lambda p: np.mean(sorted(p)[-2:])), ("max", max)]:
        r = np.array([agg(p) for p in R]); a = np.array([agg(p) for p in A])
        print(f"{k} {name:9s} real>0.5: {np.mean(r>0.5):.2f} real>0.9: {np.mean(r>0.9):.2f} | ai>0.5: {np.mean(a>0.5):.2f} ai>0.9: {np.mean(a>0.9):.2f}  n={len(r)},{len(a)}")
    print(k, f"{dt:.2f}s/view")
