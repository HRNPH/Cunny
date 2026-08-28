# 015, `@cunny-ai/depth`

| | |
|---|---|
| Package | `@cunny-ai/depth` |
| Phase | 2, RAG & vision depth |
| Status | spec |
| Depends on | `@cunny-ai/core` |
| Model | Depth Anything v2 small (24.8M), ONNX q8 |
| Weights | 🟡 ~25MB |
| License | Apache-2.0 (verify at pin) |

## Why

Monocular depth in one call powers photo relighting, background bokeh that isn't blur-cheating, 3D-ish parallax, AR occlusion. Currently a research-repo-to-ONNX exercise nobody enjoys. Relative depth (not metric) is honest and sufficient for all those uses.

## Scope

**In:**

- `depth(source)` → `{ map: Float32Array (0–1, higher = nearer), width, height }`
- Output at input aspect (internal 518×518 inference, upsampled)
- Helpers: `toGrayscale()`, `toHeatmap()` → ImageData
- Focus/subject detection convenience: hottest-region bounding box (`subjectBox`)

**Out:**

- Metric depth (v2: metric-depth variants if demanded), video temporal stability (v1.1 smoothing), 3D mesh export (example only)

## API sketch

```ts
import { depth } from '@cunny-ai/depth'

const { map, toHeatmap, subjectBox } = await depth(photoBlob)
canvas.putImageData(await toHeatmap())
subjectBox // { x, y, width, height } of nearest subject, pairs with bg-effects/bokeh
```

## Decisions

- transformers.js internally (`depth-estimation` pipeline proven with this exact model), same private-dep policy
- Normalization convention documented once: **0 = farthest, 1 = nearest**, per-image min/max, consistent with every future depth model we pin
- WebGPU recommended; WASM works at still-image cadence (docs state expected timings)

## Acceptance criteria

- [ ] Ordering sanity fixture: foreground object's mean depth > background's on 10 curated pairs
- [ ] Output deterministic for identical input (no GPU-nondeterminism footguns on the wasm path; gpu path tolerance documented)
- [ ] 1MP input end-to-end < 300ms WebGPU / < 1.5s WASM
- [ ] Map dimensions always equal input dimensions (no silent 518×526 output)

## Risks

- Relative depth mis-expectations ("is it in meters?", no; docs lead with this)
- GPU delegate numerics, fixture tolerance bands instead of exact match on the WebGPU path
