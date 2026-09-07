# @cunny-ai

Inference-only AI tasks that run in the browser. One npm package per task, no server, no API keys, no data leaving the device.

## Requirements

- Chrome, Edge, Firefox, or Safari (current and previous major version).
- An ES module environment (Vite, Next.js, Astro, plain `<script type="module">`).
- WASM is the baseline. WebGPU is used when present.

## Install

```bash
pnpm add @cunny-ai/face-detect
```

```ts
import { detect } from '@cunny-ai/face-detect'

const { faces, elapsedMs } = await detect(photo)

faces[0].score       // 0.92
faces[0].box         // { x, y, width, height }, pixels
faces[0].normalized  // same box, [0,1]
faces[0].keypoints   // eyes, nose tip, mouth corners
```

## Packages

Published (v0.0.x):

| Package | Task | Model | First load |
|---|---|---|---|
| `@cunny-ai/face-detect` | Face detection | blazeface-short | 450KB |
| `@cunny-ai/bg-remove` | Background removal | selfie segmentation | 250KB |
| `@cunny-ai/face-mesh` | Face landmarks | face-landmarker | 3MB |
| `@cunny-ai/pose` | Body pose | pose lite | 5.5MB |
| `@cunny-ai/segment` | Semantic segmentation | deeplab-v3 | 3MB |
| `@cunny-ai/detect` | Object detection | efficientdet-lite0 | 4.4MB |
| `@cunny-ai/embed` | Text embeddings | bge-small q8 | 24MB |
| `@cunny-ai/similarity` | Paraphrase scoring | bge-small q8 | 24MB |
| `@cunny-ai/stt` | Speech to text | moonshine-tiny q8 | 30MB |
| `@cunny-ai/vad` | Voice activity | silero-v5 | 2.3MB |
| `@cunny-ai/ocr` | Text recognition | paddle-v4 det+rec | 16MB |
| `@cunny-ai/stt-live` | Streaming transcription | moonshine + silero | 32MB |
| `@cunny-ai/denoise-audio` | Noise suppression | rnnoise (bundled) | 0 |
| `@cunny-ai/core` | Registry, cache, engine | — | 2KB |
| `@cunny-ai/provider-mediapipe` | MediaPipe runtime | — | runtime |
| `@cunny-ai/provider-onnx` | onnxruntime-web runtime | — | runtime |
| `@cunny-ai/tts` | Text to speech | kokoro-82M q8 | 85MB |
| `@cunny-ai/upscale` | 4× image upscale | real-esrgan fp32 | 67MB |
| `@cunny-ai/track` | Multi object tracking | bytetrack | 0 |
| `@cunny-ai/clip` | Image ↔ text classification | clip-vit-b/32 q8 | 90MB, WebGPU required |
| `@cunny-ai/depth` | Depth estimation | depth-anything-v2 q8 | 27MB, WebGPU required |
| `@cunny-ai/captions` | Live captions | silero + moonshine | 32MB |
| `@cunny-ai/vector` | Vector store | pure TS | 0 |
| `@cunny-ai/search` | Semantic search | embed + vector | 24MB |

First load is the model download size. `clip` and `depth` require WebGPU: their convolution graphs compile in practical time only there, the wasm path is minutes-scale. Weights are cached in the Cache API after the first call and are not downloaded again. `embed` and `similarity` share one model repository, so using both downloads it once.

## API conventions

Every vision task accepts `Blob | File | string (URL) | ImageBitmap | HTMLImageElement | HTMLCanvasElement`. Every audio task accepts files, URLs, or `Float32Array` PCM. Boxes are returned in pixels and normalized to `[0,1]`.

Options common to all tasks:

| Option | Type | Default | Description |
|---|---|---|---|
| `model` | `string` | task default | Registry model id, or a tier: `fast`, `balanced`, `quality` |
| `onProgress` | `(info: { loaded, total }) => void` | — | Download progress |
| `acceleration` / `backend` | `'auto' \| 'cpu' \| 'gpu'` | task dependent | Force a backend |

Errors are `Error` instances with a message prefixed `@cunny-ai/<task>:`. They are thrown, never logged.

`models()` on every package lists its registry entries with size and license:

```ts
import { models } from '@cunny-ai/pose'
models() // [{ id: 'lite', tier: 'fast', sizeMB: 5.5, license: 'Apache-2.0' }, …]
```

## Usage by family

Vision, one call:

```ts
import { removeBackground } from '@cunny-ai/bg-remove'
const png: Blob = await removeBackground(imageUrl)

import { segment } from '@cunny-ai/segment'
const { coverage, colored } = await segment(photo) // coverage: { person: 0.53, … }

import { ocr } from '@cunny-ai/ocr'
const { lines } = await ocr(screenshot) // [{ text, box, confidence }]
```

Vision, realtime over a `<video>`:

```ts
import { trackObjects } from '@cunny-ai/detect'
const stop = trackObjects(videoEl, (detections, elapsedMs) => {
  detections.forEach(d => d.label)   // 'person'
}, { fps: 20, confidence: 0.5, classes: ['person'] })
stop()
```

Audio, files and streams:

```ts
import { transcribe } from '@cunny-ai/stt'
const { text } = await transcribe(audioFile) // decode and resample handled internally

import { createVAD } from '@cunny-ai/vad'
const vad = await createVAD({
  threshold: 0.5,
  onSegment: (audio, ms) => transcribe(audio),  // fired per utterance
})
vad.push(pcm16000)   // Float32Array, any chunk size
await vad.flush()

import { denoiseStream } from '@cunny-ai/denoise-audio'
const clean = await denoiseStream(micStream) // MediaStream, wasm bundled, no download
```

Text:

```ts
import { embed, cosine } from '@cunny-ai/embed'
const [a, b] = await embed(['invoice received', 'bill got paid'])
cosine(a, b) // 0.74

import { similarity } from '@cunny-ai/similarity'
await similarity('invoice received', 'bill got paid') // 0.8, calibrated [0,1]
```

## Model selection

Each task resolves weights from a registry. The `model` option takes an exact id or a tier; the default is the balanced entry.

```ts
import { detectPose } from '@cunny-ai/pose'
await detectPose(video, { model: 'lite' })     // exact id
await detectPose(video, { model: 'quality' })  // tier
await detectPose(video)                        // default
```

## Self hosting

```ts
import { createEngine } from '@cunny-ai/core'
createEngine({ modelBase: 'https://cdn.mine.com/models' })

import { setWasmBase } from '@cunny-ai/provider-mediapipe'
setWasmBase('/static/mediapipe/wasm')

import { setWasmPaths } from '@cunny-ai/provider-onnx'
setWasmPaths('/static/onnx/')
```

## Repository

```
packages/     one directory per published package
playground/   demo hub, pnpm dev
docs/         architecture, task catalog, roadmap, release standard
website/      VitePress site, generated API reference
```

- [Getting started](docs/guide/getting-started.md)
- [Architecture](docs/architecture.md)
- [Task catalog](docs/tasks.md)
- [Roadmap](docs/roadmaps/roadmap.md)
- [Contributing](CONTRIBUTING.md)

MIT. Each model's license is recorded in its registry entry and surfaced by `models()`.
