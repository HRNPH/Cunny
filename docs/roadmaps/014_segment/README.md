# 014, `@cunny-ai/segment`

| | |
|---|---|
| Package | `@cunny-ai/segment` |
| Phase | 2, RAG & vision depth |
| Status | spec |
| Depends on | `@cunny-ai/core` |
| Model | MediaPipe ImageSegmenter + DeepLab v3 (tflite, 21 VOC classes) |
| Weights | 🟢 ~3MB |
| License | Apache-2.0 |

## Why

Pixel-level "what is where": road/person/car/sky for photo editors, accessibility tools, AR. Uses the same MediaPipe wasm already cached by face-mesh/pose, third package on the shared runtime, near-zero marginal download. That compounding effect is the monorepo pitch working as intended.

## Scope

**In:**

- `segment(image, { output: 'ids' | 'colored' | 'both' })`
- Result: `Uint8Array` class-id map, optional colorized `ImageData`, VOC class legend, per-class pixel coverage stats
- Confidence-mask mode (soft edges) as option
- `segmentVideo(video, cb, { fps })` realtime mode (v1.1, only if fixtures prove wasm keeps up; else documented GPU-only)

**Out:**

- Person-only cutout (001 bg-remove), instance-level masks (062), interactive segmentation (v2: click-to-select via mediapipe interactive segmenter)

## API sketch

```ts
import { segment } from '@cunny-ai/segment'

const { ids, legend, coverage } = await segment(photoBlob)
coverage.person // 0.18 → 18% of pixels are person
```

## Decisions

- Output at **input resolution** (mediapipe gives 256×256, we bilinear-upscale the id map and document the smoothing implications)
- `ids` primary (composable), `colored` convenience (demo-facing), same convention as all future segmentation packages
- Class names indexed in one shared `VOC_CLASSES` constant; never magic ints in user code

## Acceptance criteria

- [ ] Golden street-scene fixture: per-class coverage within ±5% of reference
- [ ] Upscaled id map has no class-hallucination at edges beyond 2px (fixture assertion)
- [ ] 1MP image < 150ms WASM worker
- [ ] Zero additional wasm download when face-mesh already cached (verified via network assertion)

## Risks

- Upscaling semantic boundaries for thin structures (poles, wires), documented limitation, confidence-mask mode is the mitigation
