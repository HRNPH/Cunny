# Getting Started

Install one task package.

```bash
pnpm add @cunny-ai/face-detect
```

```ts
import { detect } from '@cunny-ai/face-detect'

const { faces } = await detect(photo) // Blob | File | URL | ImageBitmap | …

faces[0].score        // 0.92
faces[0].box          // { x, y, width, height } in pixels
faces[0].normalized   // same box in [0,1]
faces[0].keypoints    // eyes, nose tip, mouth corners
```

The model (450KB, Apache-2.0) downloads on the first call, with progress events, and is cached. Later runs skip the download.

## Realtime tracking

```ts
import { trackFaces } from '@cunny-ai/face-detect'

const stop = trackFaces(videoEl, (faces) => draw(faces), { fps: 24 })
stop()
```

## Picking a model

```ts
detect(img)                          // default model
detect(img, { model: 'quality' })    // tier: 'fast' | 'balanced' | 'quality'
detect(img, { model: 'scrfd-500m' }) // exact model id
```

`models()` lists the options with size and license. The result shape is the same for every model. See [architecture](/architecture).

## Self hosting

```ts
import { createEngine } from '@cunny-ai/core'
createEngine({ modelBase: 'https://cdn.mine.com/models' })

import { setWasmBase } from '@cunny-ai/provider-mediapipe'
setWasmBase('/static/mediapipe/wasm')
```

## Next

- [Task catalog](/tasks)
- [Roadmap](/roadmaps/roadmap)
- [API reference](/api/)
