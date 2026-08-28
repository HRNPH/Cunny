# Getting Started

## Install

```bash
pnpm add @cunny-ai/face-detect
```

```ts
import { detect } from '@cunny-ai/face-detect'

const { faces, elapsedMs } = await detect(photo) // Blob | File | URL | ImageBitmap | …

faces[0].score       // 0.92
faces[0].box         // { x, y, width, height } in pixels
faces[0].normalized  // same box in [0,1]
faces[0].keypoints   // eyes, nose tip, mouth corners
```

The model (450KB, Apache-2.0) downloads on the first call, reports progress through `onProgress`, and is cached in the Cache API. Subsequent calls skip the download.

## Options

```ts
detect(photo, {
  model: 'balanced',                          // tier alias, model id, or omit
  maxResults: 5,
  acceleration: 'cpu',                        // 'auto' | 'cpu' | 'gpu'
  onProgress: ({ loaded, total }) => setBar(loaded / total),
})
```

| Option | Type | Default | Description |
|---|---|---|---|
| `model` | `string` | task default | Model id or tier: `fast`, `balanced`, `quality` |
| `onProgress` | `(info) => void` | — | Download progress |
| `acceleration` | `'auto' \| 'cpu' \| 'gpu'` | task dependent | Backend override |

Task specific options (`maxResults`, `confidence`, `classes`, `threshold`, `fps`, …) are listed in each package's API reference.

## Realtime

```ts
import { trackFaces } from '@cunny-ai/face-detect'

const stop = trackFaces(videoEl, (faces) => draw(faces), { fps: 24 })
stop()
```

## Model selection

```ts
detect(img)                          // default model
detect(img, { model: 'quality' })    // tier
detect(img, { model: 'scrfd-500m' }) // exact model id
```

`models()` lists the registry entries for a task with size and license. The result shape is identical across models of a task. See [architecture](/architecture).

## Self hosting

```ts
import { createEngine } from '@cunny-ai/core'
createEngine({ modelBase: 'https://cdn.mine.com/models' })

import { setWasmBase } from '@cunny-ai/provider-mediapipe'
setWasmBase('/static/mediapipe/wasm')
```

## Errors

All failures throw `Error` with a message prefixed `@cunny-ai/<task>:`. Unknown model ids throw before any download starts.

## Next

- [Task catalog](/tasks)
- [Roadmap](/roadmaps/roadmap)
- [API reference](/api/)
