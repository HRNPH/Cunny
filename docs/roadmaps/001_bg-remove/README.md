# 001, `@cunny-ai/bg-remove`

| | |
|---|---|
| Package | `@cunny-ai/bg-remove` |
| Phase | 1, Launch Nine |
| Status | spec |
| Depends on | `@cunny-ai/core` |
| Model | MediaPipe selfie segmentation (tflite) |
| Weights | 🟢 ~250KB, the best value-per-byte in edge AI |
| License | Apache-2.0 |

## Why first (after core)

250KB of weights, WASM speed, 30fps video. Alternatives are a 40MB u2net, a server round trip, or a custom MediaPipe integration.

## Scope

**In:**

- One-shot image cutout (File / Blob / ImageData / canvas → PNG with alpha)
- Realtime video/stream mode (WebCam or `MediaStream` → mask + composited stream)
- Output modes: `mask` (grayscale ImageData), `cutout` (alpha PNG), `replace` (color/image behind), `blur` (background blur, WebGL-composited)
- Feathering / edge softness control
- Runs in worker by default; composition on main thread via `createImageBitmap`

**Out:**

- Multi-person semantic matting quality (that's 051 `video-matting`, RVM, later)
- Non-person salient object cutout (that's 052 `salient`, u2netp)

## API sketch

```ts
import { removeBackground, cutoutStream } from '@cunny-ai/bg-remove'

// one-shot
const png: Blob = await removeBackground(file, { feather: 2 })

// realtime, returns a processed MediaStream (drop-in for <video>/WebRTC)
const stream = await cutoutStream(webcamStream, {
  background: 'blur',        // 'blur' | 'transparent' | '#hex' | ImageSource
  blurAmount: 12,
  fps: 30,
})
```

## Acceptance criteria

- [ ] First usable frame < 1s after `await` on a 25 Mbps connection (250KB + wasm)
- [ ] 720p @ 30fps on 2020+ laptop, WASM only, no WebGPU
- [ ] Mask-to-composite latency < 5ms/frame on main thread
- [ ] Works Chrome / Firefox / Safari
- [ ] Stream mode survives track ending / re-request of permissions

## Risks / notes

- MediaPipe wasm (~3MB) is the *real* download, not the 250KB model, count it in the size budget honestly, share the wasm across all MediaPipe-based packages via core's cache
- Selfie model is person-centric; document loudly that it is not a general object cutter
