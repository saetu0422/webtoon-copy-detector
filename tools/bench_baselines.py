"""컷 단위 비교 평가(2/2): scripts/bench.mjs가 내보낸 컷으로 기준 모델을 돌리고 지표를 계산한다.
사용: python tools/bench_baselines.py <bench 폴더>
가중치는 tools/weights/ 아래에 있어야 한다 (SSCD: sscd_disc_mixup.torchscript.pt, CLIP ViT-B/32, DINOv2-small/base).
모든 기준 모델은 컷을 정사각으로 그대로 리사이즈해 넣고, 전역 임베딩의 코사인 유사도로 갤러리를 검색한다."""
import json, sys, os, numpy as np, torch
from PIL import Image
from transformers import AutoModel, CLIPModel

D = sys.argv[1]
B = json.load(open(os.path.join(D, "bench.json")))
W = os.path.join(os.path.dirname(__file__), "weights")
G = [f"g_{i}.png" for i in range(B["gallery"])]
Q = [q["file"] for q in B["queries"]]
N = [n["file"] for n in B["negs"]]
truth = np.array([q["truth"] for q in B["queries"]])
torch.set_grad_enabled(False)

def batches(files, size, mean, std):
    for i in range(0, len(files), 32):
        ims = [np.asarray(Image.open(os.path.join(D, f)).convert("RGB").resize((size, size), Image.BICUBIC), np.float32) / 255 for f in files[i:i + 32]]
        x = (np.stack(ims) - np.array(mean, np.float32)) / np.array(std, np.float32)
        yield torch.from_numpy(x.transpose(0, 3, 1, 2).copy())

IMNET = ([0.485, 0.456, 0.406], [0.229, 0.224, 0.225])
CLIPN = ([0.4815, 0.4578, 0.4082], [0.2686, 0.2613, 0.2758])
def embed(fn, files, size, norm):
    e = torch.cat([fn(x) for x in batches(files, size, *norm)]).float()
    return torch.nn.functional.normalize(e, dim=-1).numpy()

def models():
    m = torch.jit.load(os.path.join(W, "sscd/sscd_disc_mixup.torchscript.pt")).eval()
    yield "SSCD ResNet-50 (복제 탐지 전용 학습)", lambda f: embed(m, f, 288, IMNET)
    c = CLIPModel.from_pretrained(os.path.join(W, "clip")).eval()
    def clip_embed(x):
        out = c.get_image_features(pixel_values=x)
        return out if torch.is_tensor(out) else out.pooler_output
    yield "CLIP ViT-B/32", lambda f: embed(clip_embed, f, 224, CLIPN)
    for name, d in [("DINOv2-small CLS", "dinov2-small"), ("DINOv2-base CLS", "dinov2-base")]:
        dm = AutoModel.from_pretrained(os.path.join(W, d)).eval()
        yield name, lambda f, dm=dm: embed(lambda x: dm(pixel_values=x).pooler_output, f, 224, IMNET)

def metrics(pos_score, pos_correct, neg_score, transforms):
    pos_score, pos_correct, neg_score = map(np.asarray, (pos_score, pos_correct, neg_score))
    hit = lambda thr, mask: float(np.mean((pos_score[mask] >= thr) & pos_correct[mask]))
    thr = {p: np.quantile(neg_score, 1 - p / 100, method="higher") for p in (5, 1)}
    allm = np.ones(len(pos_score), bool)
    out = {"top1": float(pos_correct.mean()), "tpr5": hit(thr[5], allm), "tpr1": hit(thr[1], allm),
           "auc": float((pos_score[:, None] > neg_score[None]).mean() + 0.5 * (pos_score[:, None] == neg_score[None]).mean()), "by": {}}
    for t in sorted(set(transforms)):
        m = np.array([x == t for x in transforms])
        out["by"][t] = {"top1": float(pos_correct[m].mean()), "tpr5": hit(thr[5], m)}
    return out

transforms = [q["transform"] for q in B["queries"]]
R = {}
for key, name in [("ours", "본 시스템 (전체 파이프라인)"), ("dino_global", "└ 2차 단계만 (DINOv2-small 다층 전역 기술자)"), ("phash", "└ 1차 단계만 (pHash + dHash)")]:
    R[name] = metrics([q[key][0] for q in B["queries"]], [q[key][1] == q["truth"] for q in B["queries"]], [n[key][0] for n in B["negs"]], transforms)
for name, fn in models():
    g, q, n = fn(G), fn(Q), fn(N)
    sq, sn = q @ g.T, n @ g.T
    R[name] = metrics(sq.max(1), sq.argmax(1) == truth, sn.max(1), transforms)
    print("done", name, file=sys.stderr)
json.dump({"n_gallery": len(G), "n_query": len(Q), "n_neg": len(N), "results": R}, open(os.path.join(D, "results.json"), "w"), ensure_ascii=False, indent=1)
ts = sorted(set(transforms))
print(f"gallery {len(G)}  queries {len(Q)}  negatives {len(N)}")
print("method".ljust(46), "top1  tpr@5  tpr@1  auc  |", " ".join(t[:9].ljust(9) for t in ts))
for name, r in R.items():
    print(name.ljust(46), f"{r['top1']:.3f} {r['tpr5']:.3f} {r['tpr1']:.3f} {r['auc']:.3f} |", " ".join(f"{r['by'][t]['tpr5']:.2f}".ljust(9) for t in ts))
