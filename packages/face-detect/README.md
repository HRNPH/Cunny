# @cunny-ai/face-detect

Face detection in the browser. Model: MediaPipe blazeface short range (Apache-2.0, ~450KB) via `@cunny-ai/provider-mediapipe`. Downloads on first use, then cached.

```ts
import { detect } from '@cunny-ai/face-detect'

const { faces } = await detect(file) // Blob | File | URL | ImageBitmap | …
// faces[0] = { score, box (px), normalized ([0,1]), keypoints[5] }

import { trackFaces } from '@cunny-ai/face-detect'
const stop = trackFaces(videoEl, (faces) => draw(faces), { fps: 24 })
```

MIT.
