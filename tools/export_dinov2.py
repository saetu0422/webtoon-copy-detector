"""DINOv2-small을 중간 층(4, 8, 12) 토큰까지 내보내는 ONNX로 변환하고 int8 양자화한다.
사용: python tools/export_dinov2.py  (torch, transformers, onnx, onnxruntime 필요)"""
import torch, numpy as np, onnxruntime as ort
from transformers import AutoModel
from onnxruntime.quantization import quantize_dynamic, QuantType

LAYERS = (4, 8, 12)

class Wrap(torch.nn.Module):
    def __init__(self):
        super().__init__()
        self.m = AutoModel.from_pretrained("tools/weights/dinov2-small")  # facebook/dinov2-small
    def forward(self, pixel_values):
        hs = self.m(pixel_values, output_hidden_states=True).hidden_states
        # 모든 층에 최종 LayerNorm을 적용해 스케일을 맞춘다 (get_intermediate_layers 관례)
        return tuple(self.m.layernorm(hs[i]) for i in LAYERS)

w = Wrap().eval()
x = torch.randn(1, 3, 224, 224)
torch.onnx.export(w, (x,), "public/models/dinov2s_fp32.onnx", input_names=["pixel_values"],
                  output_names=[f"tokens{i}" for i in LAYERS], opset_version=17, dynamo=False)
quantize_dynamic("public/models/dinov2s_fp32.onnx", "public/models/dinov2s_int8.onnx",
                 weight_type=QuantType.QUInt8)

a = ort.InferenceSession("public/models/dinov2s_fp32.onnx")
b = ort.InferenceSession("public/models/dinov2s_int8.onnx")
x = np.random.rand(1, 3, 224, 224).astype(np.float32)
with torch.no_grad(): ref = w(torch.from_numpy(x))
for name, r, p, q in zip(LAYERS, ref, a.run(None, {"pixel_values": x}), b.run(None, {"pixel_values": x})):
    cos = lambda u, v: float((u * v).sum(-1).mean() / 1) if False else float(np.mean(
        (u * v).sum(-1) / (np.linalg.norm(u, axis=-1) * np.linalg.norm(v, axis=-1))))
    print(f"layer {name}: torch-vs-fp32 cos={cos(r.numpy(), p):.4f}  fp32-vs-int8 cos={cos(p, q):.4f}")
