"""화풍(작품) 식별 평가: scripts/style_export.mjs가 내보낸 컷으로 "이 컷은 등록된 작품 중 어느 것인가"를 맞힌다.
사용: python tools/style_eval.py <컷 폴더> [--csd] [--ccip]
- 닫힌 집합: 질의 컷의 작품을 최근접 이웃 다수결(k=5)로 예측한 정확도 (컷 단위 / 청크(이미지) 단위)
- 열린 집합: 작품 하나를 갤러리에서 빼고, 그 작품의 질의가 "등록 안 된 작품"으로 구분되는지 AUROC"""
import sys, os, glob, re, json, numpy as np, torch
from PIL import Image
from transformers import AutoModel, CLIPModel

D = sys.argv[1]
W = os.path.join(os.path.dirname(__file__), "weights")
torch.set_grad_enabled(False)
files = sorted(glob.glob(os.path.join(D, "s*_*.png")))
meta = [re.match(r"s(\d+)_([gq])_c(\d+)_", os.path.basename(f)).groups() for f in files]
series = np.array([int(m[0]) for m in meta]); isq = np.array([m[1] == "q" for m in meta]); chunk = np.array([int(m[2]) for m in meta])
IMNET = ([0.485, 0.456, 0.406], [0.229, 0.224, 0.225]); CLIPN = ([0.4815, 0.4578, 0.4082], [0.2686, 0.2613, 0.2758])

def batches(size, norm, bs=32):
    for i in range(0, len(files), bs):
        ims = [np.asarray(Image.open(f).convert("RGB").resize((size, size), Image.BICUBIC), np.float32) / 255 for f in files[i:i + bs]]
        yield torch.from_numpy(((np.stack(ims) - np.array(norm[0], np.float32)) / np.array(norm[1], np.float32)).transpose(0, 3, 1, 2).copy())

l2 = lambda x: x / (np.linalg.norm(x, axis=1, keepdims=True) + 1e-9)
F = {}

# DINOv2-small: 지금 사이트가 쓰는 모델. 추가 다운로드 없이 뽑을 수 있는 통계들.
dm = AutoModel.from_pretrained(os.path.join(W, "dinov2-small")).eval()
toks = {4: [], 8: [], 12: []}
for x in batches(224, IMNET):
    hs = dm(pixel_values=x, output_hidden_states=True).hidden_states
    for l in toks: toks[l].append(dm.layernorm(hs[l])[:, 1:].numpy())
toks = {l: np.concatenate(v) for l, v in toks.items()}          # [N, 256, 384]
for l in toks:
    c = toks[l][~isq].reshape(-1, 384).mean(0)                    # 등록 컷 기준 중심화
    toks[l] = toks[l] - c
F["DINOv2-small 12층 평균 (내용 위주)"] = l2(toks[12].mean(1))
F["DINOv2-small 4층 평균"] = l2(toks[4].mean(1))
F["DINOv2-small 4층 평균+표준편차"] = l2(np.concatenate([l2(toks[4].mean(1)), l2(toks[4].std(1))], 1))
def gram(t, k=48):
    g = t[~isq].reshape(-1, 384); g = g[np.random.RandomState(0).choice(len(g), 20000, replace=False)]
    _, _, vt = np.linalg.svd(g - g.mean(0), full_matrices=False)
    p = t @ vt[:k].T                                             # [N, 256, k]
    G = np.einsum("npi,npj->nij", p, p) / p.shape[1]
    iu = np.triu_indices(k)
    return l2(G[:, iu[0], iu[1]])
F["DINOv2-small 4층 Gram(48차원)"] = gram(toks[4])
F["DINOv2-small 4+8층 Gram"] = l2(np.concatenate([gram(toks[4]), gram(toks[8])], 1))
F["DINOv2-small 4+8층 Gram + 12층 평균"] = l2(np.concatenate([gram(toks[4]), gram(toks[8]), l2(toks[12].mean(1))], 1))

cm = CLIPModel.from_pretrained(os.path.join(W, "clip")).eval()
def clip_embed(x):
    o = cm.get_image_features(pixel_values=x); return o if torch.is_tensor(o) else o.pooler_output
F["CLIP ViT-B/32"] = l2(torch.cat([clip_embed(x) for x in batches(224, CLIPN)]).numpy())

if "--ccip" in sys.argv:
    import onnxruntime as ort
    s = ort.InferenceSession(os.path.join(W, "ccip/model_feat.onnx")); inp = s.get_inputs()[0]
    size = inp.shape[2] if isinstance(inp.shape[2], int) else 384
    F["CCIP (애니 캐릭터 식별 모델)"] = l2(np.concatenate([s.run(None, {inp.name: x.numpy()})[0] for x in batches(size, CLIPN, 8)]))
if "--csd" in sys.argv:
    import open_clip
    vis = open_clip.create_model("ViT-L-14-quickgelu", pretrained=None).visual
    import numpy.core.multiarray as _ma
    # 체크포인트에 학습 기록용 numpy 스칼라가 들어 있다. 임의 코드 실행 없이 읽도록 해당 자료형만 허용한다.
    with torch.serialization.safe_globals([(_ma.scalar, "numpy.core.multiarray.scalar"), __import__("argparse").Namespace, np.dtype, type(np.dtype("float64")), type(np.dtype("int64"))]):
        sd = torch.load(os.path.join(W, "csd/pytorch_model.bin"), map_location="cpu", weights_only=True)
    sd = sd.get("model_state_dict", sd)
    sd = {k.replace("module.", ""): v for k, v in sd.items()}
    style_proj = sd["last_layer_style"].float()
    vis.proj = None
    print("csd load:", vis.load_state_dict({k[len("backbone."):]: v.float() for k, v in sd.items() if k.startswith("backbone.")}, strict=False), file=sys.stderr)
    vis.eval()
    F["CSD ViT-L (화풍 전용 학습 모델)"] = l2(torch.cat([vis(x) @ style_proj for x in batches(224, CLIPN, 16)]).numpy())

def knn_pred(f, gmask, qmask, k=5):
    S = f[qmask] @ f[gmask].T; gs = series[gmask]
    top = np.argsort(-S, 1)[:, :k]
    votes = np.zeros((S.shape[0], 10))
    for j in range(k): np.add.at(votes, (np.arange(S.shape[0]), gs[top[:, j]]), np.take_along_axis(S, top[:, j:j + 1], 1)[:, 0])
    return votes.argmax(1), np.sort(S, 1)[:, -k:].mean(1), votes

def evaluate(f):
    g, q = ~isq, isq
    pred, conf, votes = knn_pred(f, g, q)
    acc = float((pred == series[q]).mean())
    per = [float((pred[series[q] == s] == s).mean()) for s in range(10)]
    # 청크(이미지) 단위: 같은 청크 컷들의 표를 합산
    keys = sorted(set(zip(series[q], chunk[q]))); ok = 0
    for s, c in keys:
        m = (series[q] == s) & (chunk[q] == c); ok += votes[m].sum(0).argmax() == s
    # 열린 집합: 작품 s를 갤러리에서 제외 → s의 질의(모르는 작품) vs 나머지 질의(아는 작품)의 확신도
    aucs = []
    for s in range(10):
        gm = g & (series != s)
        _, c_all, _ = knn_pred(f, gm, q)
        unk, kn = c_all[series[q] == s], c_all[series[q] != s]
        aucs.append(float((kn[:, None] > unk[None]).mean()))
    return {"panel_acc": acc, "balanced_acc": float(np.mean(per)), "image_acc": ok / len(keys), "open_auc": float(np.mean(aucs)), "n_images": len(keys)}

# 추가 모델 없이: 등록 컷으로 선형 분류기를 학습 (브라우저에서도 가능한 수준의 계산)
try:
    from sklearn.linear_model import LogisticRegression
    X = np.concatenate([l2(toks[4].mean(1)), l2(toks[4].std(1)), l2(toks[8].mean(1)), l2(toks[8].std(1)), l2(toks[12].mean(1))], 1)
    def linear_eval(X):
        g, q = ~isq, isq
        clf = LogisticRegression(C=10, max_iter=2000, class_weight="balanced").fit(X[g], series[g])
        P = clf.predict_proba(X[q]); pred = clf.classes_[P.argmax(1)]
        keys = sorted(set(zip(series[q], chunk[q])))
        ok = sum(clf.classes_[np.log(P[(series[q] == s) & (chunk[q] == c)] + 1e-9).sum(0).argmax()] == s for s, c in keys)
        aucs = []
        for s in range(10):
            gm = g & (series != s)
            c2 = LogisticRegression(C=10, max_iter=2000, class_weight="balanced").fit(X[gm], series[gm])
            conf = c2.predict_proba(X[q]).max(1); unk, kn = conf[series[q] == s], conf[series[q] != s]
            aucs.append(float((kn[:, None] > unk[None]).mean()))
        per = [float((pred[series[q] == s] == s).mean()) for s in range(10)]
        return {"panel_acc": float((pred == series[q]).mean()), "balanced_acc": float(np.mean(per)), "image_acc": ok / len(keys), "open_auc": float(np.mean(aucs)), "n_images": len(keys)}
    LIN = {"DINOv2-small 다층 통계 + 선형 분류기(등록 컷으로 학습)": linear_eval(X)}
    if "CLIP ViT-B/32" in F: LIN["CLIP ViT-B/32 + 선형 분류기"] = linear_eval(F["CLIP ViT-B/32"])
except ImportError:
    LIN = {}

print(f"gallery {int((~isq).sum())} panels, query {int(isq.sum())} panels, 10 series")
print("feature".ljust(44), "컷정확도  작품평균  이미지정확도  미등록구분AUROC")
R = {}
for name, f in F.items():
    r = R[name] = evaluate(f)
    print(name.ljust(44), f"{r['panel_acc']:.3f}    {r['balanced_acc']:.3f}    {r['image_acc']:.3f}        {r['open_auc']:.3f}")
for name, r in LIN.items():
    R[name] = r
    print(name.ljust(44), f"{r['panel_acc']:.3f}    {r['balanced_acc']:.3f}    {r['image_acc']:.3f}        {r['open_auc']:.3f}")
json.dump({"n_gallery": int((~isq).sum()), "n_query": int(isq.sum()), "results": R}, open(os.path.join(D, "style_results.json"), "w"), ensure_ascii=False, indent=1)
