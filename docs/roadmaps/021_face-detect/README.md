# 021, `@cunny-ai/face-detect`

| | |
|---|---|
| Package | `@cunny-ai/face-detect` |
| Phase | 3 (pulled forward as **validation spike**) |
| Status | in-progress |
| Depends on | `@cunny-ai/core` |
| Model | MediaPipe BlazeFace short-range (fp16 tflite) |
| Weights | 🟢 ~450KB |
| License | Apache-2.0 |

## Why this one first (as the spike)

Pulled out of phase order deliberately: it is the smallest credible end-to-end slice, one call, one tiny model, unambiguous visual pass/fail, and it exercises every architectural claim we need to validate: lazy weight loading through the core registry, Cache API persistence with progress events, dynamic-import laziness (SSR-safe), and a one-function DX. If this module feels wrong, the whole plan needs rework before we write 19 more packages.

## Scope

**In (spike):**

- `detect(source)`, still image face detection; accepts Blob/File/ImageBitmap/HTMLImageElement/HTMLCanvasElement/URL string
- `createFaceDetector(opts)`, reusable detector instance (avoid re-init per call)
- `trackFaces(video, cb, opts)`, realtime mode over a `<video>` element via rAF throttling
- Result: per-face `score`, pixel box, normalized box, 5 normalized keypoints (eyes, nose tip, mouth corners)
- Model + wasm resolution through `@cunny-ai/core` engine (cached, progress, overridable base URLs)

**Out (spike, fast-follow):**

- Worker-by-default inference (mediapipe main-thread in v0; runtime hides behind interface so the swap is mechanical)
- sha256 integrity pinning (field exists in manifest, verification TODO)
- Second model (YuNet via `@cunny-ai/provider-onnx`), the multi-model validation: same `detect()` API, `model: 'yunet'` option, per [`../../architecture.md`](../../architecture.md)

## API sketch

```ts
import { detect } from '@cunny-ai/face-detect'

const { faces, elapsedMs } = await detect(fileOrBlobOrUrl)
// faces[0] = { score: 0.93, box: {x,y,width,height} px, normalized: {...}, keypoints: [{x,y}, ...] }

import { trackFaces } from '@cunny-ai/face-detect'
const stop = trackFaces(videoEl, (faces) => draw(faces), { fps: 24 })
```

## Acceptance criteria (spike)

- [x] First call downloads model once; second app load served from Cache API (zero network for model), **verified: cold 3111ms total → warm 14ms total**
- [ ] Progress callback fires during download with byte counts (code path exercised; not explicitly observed mid-download yet)
- [x] Correct boxes on playground sample image, verified visually in Chrome, **verified: 1 face, 92% confidence, box + keypoints aligned**
- [x] `import` of the package triggers zero model/wasm network activity (mediapipe dynamically imported on first `detect()`)
- [ ] Realtime mode ≥ 20fps on 2020 laptop (Video mode), implemented, not yet benchmarked

## Spike results (2026-08-28)

First real browser run, Chrome (IAB), 640×800 image:

| Run | Inference | Total |
|---|---|---|
| Cold (model download + wasm init) | 2404.7 ms | 3111 ms |
| Warm (Cache API hit) | **10.5 ms** | **14 ms** |
