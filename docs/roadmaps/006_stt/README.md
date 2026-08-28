# 006, `@cunny-ai/stt`

| | |
|---|---|
| Package | `@cunny-ai/stt` |
| Phase | 1, Launch Nine |
| Status | spec |
| Depends on | `@cunny-ai/core` |
| Model | Moonshine tiny (27M), onnx-community ONNX q8 |
| Weights | 🟢 ~30MB |
| License | MIT (verify at registry pin time) |

## Why

Speech-to-text with no API key, no server, no upload, the privacy pitch at its strongest. Moonshine tiny beats Whisper-tiny on accuracy at half the size and 5× the speed, purpose-built for edge. English-only in v1 (multilingual is 040, Whisper).

## Scope

**In:**

- `transcribe(source)`, accepts audio File/Blob (wav/mp3/webm/ogg), Float32Array PCM (any rate, resampled), or a media URL
- Audio decode via `AudioContext`/`OfflineAudioContext` → 16kHz mono internally
- Automatic chunking for audio > 10s (10s windows, sentence-aware merge)
- Result: `{ text, elapsedMs, durationMs, chunks?: [{ text, start, end }] }`
- Progress events during model download

**Out:**

- Streaming/realtime (018 `stt-live`), live captions pipeline (019), word-level timestamps (v1.1), multilingual (040), speaker ID (033)

## API sketch

```ts
import { transcribe } from '@cunny-ai/stt'

const { text, durationMs, elapsedMs } = await transcribe(audioFile)
// "the quick brown fox..." · real-time factor = elapsedMs / durationMs
```

## Decisions

- **Provider:** transformers.js internally (its `automatic-speech-recognition` pipeline handles Moonshine's tokenizer + chunking glue), kept a private implementation detail behind our API, same policy as 002 `embed`. Swappable without a major version.
- **Chunking:** `chunk_length_s: 10, stride_length_s: 1`, tuned so merged text doesn't clip words at boundaries.
- **No VAD gating here**, plain transcription of whatever audio is given; the VAD orchestration lives in 019.

## Acceptance criteria

- [ ] WER < 15% on a fixed 10-clip clean-speech fixture (recorded once, stored in CI)
- [ ] Real-time factor ≤ 1.0 on WASM worker for 16kHz mono (desktop)
- [ ] 60s file transcribes without main-thread jank (worker default)
- [ ] Supports Chrome/Firefox/Safari audio decode paths (Safari codec quirks covered by fixtures)

## Risks

- transformers.js version churn in pipeline behavior, pin, and golden-text test every bump
- Moonshine weight license needs verification before registry pin (MIT expected)
- Safari `OfflineAudioContext` resampling differences, fixture test per browser
