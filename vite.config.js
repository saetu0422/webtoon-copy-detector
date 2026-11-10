import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

// WASM 글루 코드를 번들에 넣지 않는 빌드를 쓴다. 번들 포함형은 스레드용 하위 워커가 앱 워커 파일을 다시 실행해 멈춘다.
// 런타임 파일은 public/ort/ 에서 직접 불러온다 (onnxruntime-web을 올리면 그 폴더도 같이 갱신할 것).
const ortEntry = fileURLToPath(new URL('./node_modules/onnxruntime-web/dist/ort.wasm.min.mjs', import.meta.url));

// COOP/COEP 헤더가 있으면 WASM 멀티스레드가 켜져 추론이 빨라진다 (없어도 단일 스레드로 동작).
const isolation = { 'Cross-Origin-Opener-Policy': 'same-origin', 'Cross-Origin-Embedder-Policy': 'require-corp' };

export default defineConfig({
  base: './',
  resolve: { alias: { 'onnxruntime-web/wasm': ortEntry } },
  server: { headers: isolation },
  preview: { headers: isolation },
  worker: { format: 'es' },
  build: { target: 'es2022', chunkSizeWarningLimit: 1500 },
  optimizeDeps: { exclude: ['onnxruntime-web'] },
});
