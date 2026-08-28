# 004, `@cunny-ai/detect`

| | |
|---|---|
| Package | `@cunny-ai/detect` |
| Phase | 1, Launch Nine |
| Status | spec |
| Depends on | `@cunny-ai/core` |
| Model | NanoDet-Plus / YOLOX-nano (q8 ONNX), **Apache-2.0 defaults**; Ultralytics YOLO opt-in |
| Weights | 🟢 4–7MB |
| License | Apache-2.0 (default models) |

## Why

"Find objects in image/video" is the most-requested vision primitive, and today it means: pick a YOLO fork, convert to ONNX, pick a quantization that doesn't destroy mAP, write letterbox/NMS by hand, debug tensor layouts. We ship the answer in one import.

## Scope

**In:**

- `detect(source, opts)` → boxes with class, score, normalized coords; pixel coords available
- Sources: File/Blob/ImageData/canvas/video element (single frame) + `trackObjects(video, cb)` realtime mode
- Letterbox preprocessing, NMS postprocessing, fully internalized, tested against reference outputs
- 80 COCO classes baked in; class filtering (`classes: ['person', 'car']`)
- WebGPU fast path when available, WASM baseline

**Out:**

- Tracking with persistent IDs (017 `@cunny-ai/track`, composes on this)
- Segmentation masks (062), custom fine-tuned models (091 `@cunny-ai/custom`)

## API sketch

```ts
import { detect, trackObjects } from '@cunny-ai/detect'

const boxes = await detect(file, { scoreThreshold: 0.4, classes: ['person'] })
// [{ class: 'person', score: 0.91, box: { x, y, w, h } /* normalized */ }]

const stop = trackObjects(videoEl, (boxes) => draw(boxes), { fps: 24 })
```

## Decisions

- **License policy bites here:** Ultralytics YOLOv8/v11 are AGPL-3.0, commercial users bounce off it. Default = NanoDet-Plus-m (Apache-2.0, 4MB q8, solid mAP); `model: 'yolo11n'` is documented opt-in for AGPL-compatible apps. Permissive licenses by default.
- Box coords normalized [0,1] with origin top-left, documented once, everywhere, forever (all future vision packages copy this convention).

## Acceptance criteria

- [ ] mAP on a fixed 50-image golden set within 1pt of the reference PyTorch numbers (q8)
- [ ] NMS output matches torchvision `nms` reference on adversarial overlap cases
- [ ] 640px input ≥ 20fps WASM single-thread degraded / ≥ 60fps WebGPU on M1
- [ ] Realtime mode never blocks main thread > 2ms/frame

## Risks

- Quantization sensitivity varies per model, golden-set CI guards every model bump
- WebGPU pre/post-processing on-GPU is a v2 optimization; v1 keeps tensors on CPU between stages (honest perf docs until then)
