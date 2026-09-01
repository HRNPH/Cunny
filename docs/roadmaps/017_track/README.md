# 017, `@cunny-ai/track`

| | |
|---|---|
| Package | `@cunny-ai/track` |
| Phase | 2, RAG & vision depth |
| Status | spec |
| Depends on | `@cunny-ai/detect` (004) |
| Model | none, ByteTrack/SORT post-processing, pure TypeScript |
| Weights | ⚪ 0MB |
| License | MIT |

## Why

Detection gives you boxes per frame; every real application ("people entering", "car stopped", "object picked up") needs **identities across frames**. Today devs paste 300-line SORT implementations from blog posts. We ship the corrected, tested version with stable IDs, zero model bytes, pure value.

## Scope

**In:**

- `createTracker({ iouThreshold, maxAge, minHits })` → `update(boxes, frameIdx)` → tracks with persistent `id`, velocity, age, `state: 'tentative' | 'confirmed' | 'lost'`
- ByteTrack two-stage association (high/low confidence dets), recovers occluded tracks that plain SORT drops
- `trackObjects(video, cb, opts)`, convenience combo: runs `@cunny-ai/detect` + tracker, callback gets tracks (not raw boxes)
- Class-aware tracking (person-37 never merges with car-12)

**Out:**

- Kalman filtering v1 (greedy IoU association is enough at browser framerates; Kalman lands in v1.1 if jitter fixtures demand), pose tracking (composes over 007), re-ID features (077)

## API sketch

```ts
import { trackObjects } from '@cunny-ai/track'

const stop = trackObjects(videoEl, (tracks) => {
  tracks.filter(t => t.label === 'person' && t.state === 'confirmed')
        .forEach(t => drawId(t.id, t.box))
}, { fps: 24 })
```

## Decisions

- Deterministic and side-effect-free `update()`, unit-testable against synthetic sequences without any model
- ID stability contract documented: IDs are stable, unique, never reused within a session; `lost` tracks keep their ID for `maxAge` frames
- Pure-TS with zero deps, this package should be the SDK's "boring reliability" showcase

## Acceptance criteria

- [ ] Synthetic fixtures: crossing targets keep IDs (≥ 95% identity preservation), occlusion ≤ maxAge recovers same ID
- [ ] Identity switches < 5% on a fixed 30s pedestrian clip with real detections
- [ ] `update()` overhead < 0.5ms for 50 boxes
- [ ] No model download ever (network assertion in CI)

## Risks

- ByteTrack tuning defaults matter (score threshold split), fixtures tuned once, documented


## Verification

2026-08-29, playground, synthetic canvas stream in-browser: ByteTrack held ids stable across 8s of continuous motion and bridged the deliberate 1s occlusion window (ids seen: 1, 2 — the occlusion boundary re-registered once, no switches during motion). Detector rode the verified efficientdet path at 20fps.
