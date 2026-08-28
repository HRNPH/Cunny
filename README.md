# @cunny-ai

Browser AI, one npm package per task. Everything runs locally in the browser: no server, no API keys, no data leaving the device.

```bash
pnpm add @cunny-ai/face-detect
```

```ts
import { detect } from '@cunny-ai/face-detect'

const { faces } = await detect(photo) // Blob | File | URL | ImageBitmap | …

faces[0].score       // 0.92
faces[0].box         // { x, y, width, height } in pixels
faces[0].normalized  // same box in [0,1]
```

The model (450KB, Apache-2.0) downloads on the first call with progress events, then lives in the browser cache. Later runs skip the download.

## Packages

| Package | Task | First load | Status |
|---|---|---|---|
| `@cunny-ai/face-detect` | Face detection | ~450KB | npm |
| `@cunny-ai/bg-remove` | Background removal | ~250KB | npm |
| `@cunny-ai/face-mesh` | 478 landmarks + 52 blendshapes | ~3MB | npm |
| `@cunny-ai/pose` | Body pose, 33 landmarks | ~5.5MB | npm |
| `@cunny-ai/segment` | Semantic segmentation, 21 classes | ~3MB | npm |
| `@cunny-ai/detect` | Object detection, 80 COCO classes | ~4.4MB | npm |
| `@cunny-ai/embed` | Text embeddings (RAG backbone) | ~23MB | npm |
| `@cunny-ai/similarity` | Paraphrase / STS scoring | ~23MB | npm |
| `@cunny-ai/stt` | Speech to text (Moonshine tiny) | ~30MB | npm |
| `@cunny-ai/provider-onnx` | onnxruntime-web boundary | runtime only | npm |
| `@cunny-ai/provider-mediapipe` | MediaPipe Tasks boundary | runtime only | npm |
| `@cunny-ai/core` | Registry, cache, engine | ~2KB | npm |
| `@cunny-ai/vad` | Voice activity detection | ~2MB | npm |
| `@cunny-ai/captions` | Live captions (vad + stt) | ~32MB | code complete, browser pass pending |
| `@cunny-ai/stt-live` | Streaming transcription | ~32MB | npm |
| `@cunny-ai/tts` | Text to speech (Kokoro, native fallback) | ~85MB or 0 | code complete, browser pass pending |
| `@cunny-ai/clip` | Image ↔ text zero shot classification | ~50MB | code complete, browser pass pending |
| `@cunny-ai/depth` | Depth estimation | ~27MB | code complete, browser pass pending |
| `@cunny-ai/upscale` | 4× photo upscale (Real-ESRGAN) | ~67MB | code complete, browser pass pending |
| `@cunny-ai/track` | Multi object tracking (ByteTrack) | 0 (rides on detect) | code complete, browser pass pending |
| `@cunny-ai/ocr` | OCR (PaddleOCR v4 det + rec) | ~16MB | npm |
| `@cunny-ai/denoise-audio` | Noise suppression (RNNoise, bundled) | 0 | npm |

A package stays private until it passes the [release standard](docs/releases.md): unit tests plus a browser run against the real model.

## Examples

Background removal, one call:

```ts
import { removeBackground } from '@cunny-ai/bg-remove'

const png = await removeBackground(imageUrl) // Blob, transparent PNG
```

Transcribe audio:

```ts
import { transcribe } from '@cunny-ai/stt'

const { text } = await transcribe(audioFile) // 16k mono handled internally
```

Objects with boxes and labels:

```ts
import { detect } from '@cunny-ai/detect'

const { detections } = await detect(photo, { confidence: 0.5, classes: ['person'] })
```

Every vision package takes `Blob | File | URL | ImageBitmap | HTMLImageElement | HTMLCanvasElement`. Every audio package takes files, URLs, or raw `Float32Array` PCM.

## One API, many models

Each task resolves models from a registry. Pass a model id, a tier (`fast` / `balanced` / `quality`), or nothing for the default:

```ts
await detectPose(video, { model: 'lite' })   // registry id
await detectPose(video, { model: 'quality' }) // tier alias
await detectPose(video)                       // default
```

Providers (`provider-mediapipe`, `provider-onnx`) pin the ML runtimes once, so two tasks that share a runtime download it once.

## Requirements

- Any modern browser (Chrome, Edge, Firefox, Safari). WASM is the baseline, WebGPU is a transparent speedup.
- Serving over http(s) or localhost, like any ES module app.

## Repo layout

- `packages/` — one directory per published package
- `playground/` — live demo hub for every task (`pnpm dev`)
- `docs/` — architecture, task catalog, roadmap, release standard
- `website/` — VitePress docs site with generated API reference

Start with [docs/guide/getting-started.md](docs/guide/getting-started.md), then [docs/architecture.md](docs/architecture.md). To add a task, read [CONTRIBUTING.md](CONTRIBUTING.md).

## Status

v0.0.x. 000 through 021 of the roadmap are implemented; the release order and remaining modules live in [docs/roadmaps/roadmap.md](docs/roadmaps/roadmap.md).

MIT licensed. Model licenses are recorded per registry entry and shown in `models()` output.
