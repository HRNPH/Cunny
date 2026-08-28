import { defineConfig } from 'vite'

export default defineConfig({
  optimizeDeps: {
    // Runtimes that are dynamically imported inside package dist bundles
    // (provider boundary, architecture.md Rule 4) — vite's scanner can't see
    // those, so declare them to avoid mid-session re-optimization stalls.
    include: [
      '@mediapipe/tasks-vision',
      '@huggingface/transformers',
      'kokoro-js',
    ],
    // ort's loader resolves its wasm glue via import.meta.url-relative dynamic
    // imports; pre-bundling breaks that chain and session creation deadlocks.
    exclude: ['onnxruntime-web'],
  },
})
