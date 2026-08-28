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
      'onnxruntime-web',
    ],
  },
})
