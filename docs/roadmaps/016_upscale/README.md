# 016, `@cunny-ai/upscale`

| | |
|---|---|
| Package | `@cunny-ai/upscale` |
| Phase | 2, RAG & vision depth |
| Status | spec |
| Depends on | `@cunny-ai/core` |
| Model | Real-ESRGAN x4plus (photo) + anime6v3 (illustration), ONNX q8 |
| Weights | 🟡 ~17MB per variant |
| License | BSD-3-Clause (Real-ESRGAN) |

## Why

4x upscaling of photos, screenshots and art. First package where **tiling and memory limits** matter: a 2048² input upscaled naively OOMs a tab, so core grows tensor memory handling.

## Scope

**In:**

- `upscale(source, { model: 'photo' | 'anime', scale: 4, tileSize: 512 })` → `ImageBitmap`
- Tiled inference with 16px overlap blending (seam-free)
- Progress events per tile + cancellation via `AbortSignal`
- Honest mode gating: WASM path caps input at 0.5MP with a clear error + suggestion (WebGPU or downscale), WebGPU handles 4MP+
- `estimate(source)` → predicted time/memory before running

**Out:**

- 2× models (registry variants later), video upscaling (v2, frame-pipelining), face restoration chain (043 composes instead)

## API sketch

```ts
import { upscale } from '@cunny-ai/upscale'

const bigger = await upscale(oldPhoto, {
  model: 'photo',
  onProgress: ({ tiles, total }) => setBar(tiles / total),
  signal: abortController.signal,
})
// ImageBitmap, 4× dimensions
```

## Decisions

- Pure ONNX (ORT web direct, no transformers.js here; Real-ESRGAN pre/post is plain pixel math and we own it)
- Overlap blending in float space on the main thread canvas, seams are the classic failure mode, fixture-tested
- `estimate()` before heavy work is a pattern worth establishing for all expensive packages (tts next)

## Acceptance criteria

- [ ] PSNR ≥ 38dB vs reference output on golden image pair (deterministic wasm path)
- [ ] No visible tile seams on a high-contrast fixture (automated: max gradient discontinuity at tile borders below threshold)
- [ ] 512×512 → 2048×2048 < 2s WebGPU / < 10s WASM
- [ ] 4MP input on WebGPU completes without tab OOM (CI memory ceiling fixture)

## Risks

- WebGPU device-loss on weak GPUs, graceful `BackendUnavailableError` with retry guidance
- Real-ESRGAN license is BSD-3 but **model file hosting** must be our registry (some mirrors are ambiguous), pin hashes
