# 007, `@cunny-ai/pose`

| | |
|---|---|
| Package | `@cunny-ai/pose` |
| Phase | 1, Launch Nine |
| Status | spec |
| Depends on | `@cunny-ai/core` |
| Model | MediaPipe Pose Landmarker, lite (~5.5MB) / full (~9MB) / heavy (~29MB) |
| Weights | 🟢–🟡 by tier |
| License | Apache-2.0 |

## Why

Fitness, rehab, motion capture, dance games, pose is the second-biggest realtime vision vertical after faces. Same MediaPipe-pain story as face-mesh, same fix: one import, webcam loop handled.

## Scope

**In:**

- `detectPose(image)` one-shot; `trackPose(video, cb, { fps })` realtime
- 33 normalized landmarks **plus world landmarks** (meters, hip-centered) for actual 3D measurements
- `model: 'lite' | 'full' | 'heavy'` tier option (registry variants, lazy per tier)
- `numPoses` (default 1) for multi-person
- Per-landmark visibility scores

**Out:**

- Segmentation masks (mediapipe option; v1.1), rep counting heuristics (088), skeletal smoothing (090), rendering/rigging (user's job)

## API sketch

```ts
import { trackPose } from '@cunny-ai/pose'

const stop = trackPose(videoEl, (poses) => {
  const leftHip = poses[0].landmarks[23]   // normalized {x, y, z?}
  const world = poses[0].worldLandmarks    // meters, hip origin
}, { fps: 30, model: 'lite', numPoses: 1 })
```

## Decisions

- Default tier = `lite` (5.5MB, fastest); `heavy` never auto-downloads, explicit opt-in (29MB, WebGPU recommended)
- Landmark indices documented once in types (named constants `POSE_LANDMARKS.LEFT_HIP`), never magic numbers in user code
- Same provider/wasm sharing as face-mesh via core cache, second MediaPipe package validates the shared-wasm story

## Acceptance criteria

- [ ] lite: 30fps webcam tracking on 2020+ laptop, WASM baseline
- [ ] World-landmark plausibility: arm length variance < 10% across a fixed motion clip
- [ ] Landmark output matches mediapipe reference within 1e-3 on golden frames
- [ ] Multi-person (numPoses: 2) index stability on a 2-person fixture

## Risks

- mediapipe Tasks API surface evolution (bit us once already in the face-detect spike, version pin + golden tests are the guard)
- `z` coordinate on normalized landmarks is low-quality; docs must push users to `worldLandmarks` for anything 3D
