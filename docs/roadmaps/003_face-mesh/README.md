# 003, `@cunny-ai/face-mesh`

| | |
|---|---|
| Package | `@cunny-ai/face-mesh` |
| Phase | 1, Launch Nine |
| Status | spec |
| Depends on | `@cunny-ai/core` |
| Model | MediaPipe Face Landmarker (478 pts + 52 blendshapes) |
| Weights | 🟢 ~3MB |
| License | Apache-2.0 |

## Why

The AR/filter/effects economy in one package, Snapchat-style face tracking with zero setup. MediaPipe's own JS DX is callback-heavy, under-documented, and makes everyone write the same webcam-loop + matrix plumbing. Huge dev demand, no pleasant solution, tiny download.

## Scope

**In:**

- One-shot image mode: landmarks + blendshapes + head transform matrix
- Realtime video mode: `trackFaces(video | stream, cb)` at target fps
- Multi-face (up to 4), stable face indices across frames
- Blendshapes (52 ARKit-style coefficients) for avatar puppeteering
- Output in normalized coords *and* pixels; head matrix as ready-to-use 4×4 (column-major, three.js-friendly)

**Out:**

- Smoothing (090 `@cunny-ai/smooth`, but this package exposes raw output so it can consume it)
- Any rendering/avatar rig (user's job; examples show three.js)
- Face recognition/identity (022)

## API sketch

```ts
import { trackFaces, faceLandmarks } from '@cunny-ai/face-mesh'

// realtime
const stop = trackFaces(videoEl, (faces) => {
  faces[0].blendshapes['mouthSmileLeft'] // 0.73
  faces[0].transform                      // Float32Array(16)
}, { fps: 30, maxFaces: 1 })

// one-shot
const { landmarks, blendshapes } = await faceLandmarks(imageOrBlob)
```

## Acceptance criteria

- [ ] 30fps tracking on 2020+ laptop webcam, WASM (GPU delegate optional speedup)
- [ ] Face index stability: same person keeps index across occlusions < 500ms
- [ ] Blendshape values match MediaPipe reference output within 1e-3 on golden frames
- [ ] Examples run in Chrome / Firefox / Safari

## Risks

- MediaPipe Tasks API surface still evolves, pin the version in core's registry
- Safari worker + ImageBitmap plumbing for video frames is finicky; fallback to main-thread inference behind the same API if needed (measure, then decide)
