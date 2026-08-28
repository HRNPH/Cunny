# 020, `@cunny-ai/denoise-audio`

| | |
|---|---|
| Package | `@cunny-ai/denoise-audio` |
| Phase | 2, RAG & vision depth |
| Status | spec |
| Depends on | `@cunny-ai/core` |
| Model | RNNoise (classical RNN, prebuilt wasm) |
| Weights | ⚪ ~90KB, **bundled into the package** (bundle rule's first real user) |
| License | BSD-2-Clause (verify weights at pin) |

## Why

90KB classical noise suppression, frame based, built for calls. Pilot for the **bundle tier** (assets ≤1MB ship inside the package).

## Scope

**In:**

- `denoiseBuffer(Float32Array 48k)` → cleaned buffer (one-shot: recordings, uploads)
- `denoiseStream(stream)` → processed `MediaStream` (realtime calls) via AudioWorklet with wasm-processed frames
- Latency budget documented: one 10ms frame
- `createDenoiser()` instance form for explicit lifecycle

**Out:**

- Higher-quality DL suppression (038 DeepFilterNet), echo cancellation (browser-native `echoCancellation` constraint, docs point there), music preservation mode (RNNoise is speech-tuned; docs say so)

## API sketch

```ts
import { denoiseStream } from '@cunny-ai/denoise-audio'

const clean = await denoiseStream(webcamStream) // MediaStream, audio track replaced
peerConnection.addTrack(clean.getAudioTracks()[0])
```

## Decisions

- **Bundle the wasm** (~90KB) inside the npm package as an asset, no CDN, no cache, works offline from install. Registry entry marked `bundled: true`; core learns the bundled-asset resolution path here
- Prebuilt wasm sourced from a maintained port (or built once in our CI from the Xiph source and pinned by hash), never a floating third-party CDN
- 48kHz native (rnnoise's design rate); resampling only at the edges, documented

## Acceptance criteria

- [ ] Fixture: noisy-speech clip improves SNR ≥ +6dB (objective harness in CI)
- [ ] Realtime path adds < 15ms latency, no underruns on 30-min session
- [ ] Zero network requests after package install (CI network assertion, the bundle proof)
- [ ] Works Chrome / Firefox / Safari (AudioWorklet + wasm module worker paths)

## Risks

- Sourcing/validating the wasm build is the whole risk; building from source in CI is the clean answer (emscripten pipeline documented even if we vendor the artifact)
- RNNoise speech-bias degrades music, documented limitation with before/after samples
