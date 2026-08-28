# 018, `@cunny-ai/stt-live`

| | |
|---|---|
| Package | `@cunny-ai/stt-live` |
| Phase | 2, RAG & vision depth |
| Status | impl (private, fallback engine) |
| Depends on | `@cunny-ai/core` |
| Model | sherpa-onnx streaming zipformer small, int8 (~50MB) + sherpa wasm runtime (~10–15MB) |
| Weights | 🟠 ~60–65MB all-in |
| License | Apache-2.0 |

## Why

Streaming transcription gives ~300ms partials for live captions and the assistant. Batch STT (006) on VAD chunks gives 1 to 2s. Highest risk module in phase 2, scheduled last, with a fallback.

## Scope

**In:**

- `createStreamSTT({ language: 'en' })` → `{ feed(Float32Array 16k), partial: string, commit(): final text + reset }`
- Streaming partials via the transducer's incremental decode
- AudioWorklet capture helper (mic → 16k frames → worker)
- Endpointing option (speech-boundary detection without 005, since the transducer provides its own)

**Out:**

- The captions orchestration (019, this is the engine, the pipeline is 019), multilingual streaming (v2), diarization (033 composes)

## API sketch

```ts
import { createStreamSTT } from '@cunny-ai/stt-live'

const stt = await createStreamSTT()
micFeed(stt)                       // AudioWorklet plumbing provided
stt.onPartial = (text) => captionEl.textContent = text
stt.onEndpoint = (finalText) => save(finalText)
```

## Decision outcome

The sherpa-onnx wasm gate resolved to **fallback**: VAD-chunked Moonshine re-decode ships as v1 (partials ~2×/s during speech, finals on VAD endpoint). Rationale from the field pass: wasm runtimes inside restricted embedders need single-thread + timeout guards (see provider-onnx), and a 60MB sherpa stack on top is not shippable there yet. The API contract (`feed`/`onPartial`/`onEndpoint`) is engine-agnostic for the zipformer backend.

## Decisions

- **Primary: sherpa-onnx wasm runtime**, the only proven browser streaming transducer path; wasm build pinned + hosted in our registry (their CDN, mirrored)
- **Fallback (if wasm proves unshippable):** VAD-chunked Moonshine re-decode at 1–2s latency, already built in 006/005; ship that as `@cunny-ai/stt-live`'s degraded mode rather than missing the Phase 2 window
- Decision gate at implementation start: build a 1-day spike of the sherpa wasm in a playground before committing the module design

## Acceptance criteria

- [ ] Partial-text latency < 400ms after speech onset (measured via fixture playback)
- [ ] End-to-end accuracy within 5% relative WER of batch 006 on the same fixture set
- [ ] Sustained 30-min stream with no memory growth (transducer state reset hygiene)
- [ ] Total first-load ≤ 70MB (runtime + model), progress events honest

## Risks

- sherpa-onnx wasm bundle size and API stability, the spike decides go/fallback
- Worker + SharedArrayBuffer requirements, if SAB is needed, COOP/COEP docs and graceful degradation to non-SAB path
