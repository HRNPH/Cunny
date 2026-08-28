# 005, `@cunny-ai/vad`

| | |
|---|---|
| Package | `@cunny-ai/vad` |
| Phase | 1, Launch Nine |
| Status | spec |
| Depends on | `@cunny-ai/core` |
| Model | Silero VAD v5 (ONNX) |
| Weights | 🟢 ~2MB |
| License | MIT |

## Why

2MB, streaming, gates every voice pipeline (STT, wakeword, captions, assistant). Alternatives are `@ricky0123/vad-web` or an old PyTorch snippet. `@cunny-ai/stt-live` and `@cunny-ai/assistant` compose on this.

## Scope

**In:**

- Streaming VAD over `MediaStream` / mic: AudioWorklet capture → worker inference (model never touches main thread)
- Stateful event API with hysteresis: `speechStart`, `speechEnd`, per-frame probability
- Utterance segmentation: `onSegment(audioChunk)` emits complete speech clips (ready to feed 006 `@cunny-ai/stt`)
- Tunables: threshold, min speech/silence duration, sample rate (16k internal, auto-resampled)
- Context reset for long sessions (Silero state vector hygiene, avoids the common memory leak)

**Out:**

- Any transcription (006/018), wake word classification (031), speaker identity (033)

## API sketch

```ts
import { createVAD } from '@cunny-ai/vad'

const vad = await createVAD({ threshold: 0.5 })

const stop = vad.start(micStream, {
  onSpeechStart: () => micPulse(),
  onSegment: async (clip) => {
    const text = await transcribe(clip) // feed to @cunny-ai/stt
  },
  onSpeechEnd: (durationMs) => {},
})
```

## Acceptance criteria

- [ ] Detection latency (voice onset → event) < 60ms end-to-end
- [ ] No drift/degradation over a 30-min continuous session (state reset verified)
- [ ] Works Chrome / Firefox / Safari (AudioWorklet everywhere; Safari fallback path tested)
- [ ] < 3ms main-thread time per second of audio

## Risks

- Silero's ONNX export quirks (LSTM state resets, opset version), pin the exact export in our registry with hashes
- Safari AudioWorklet + worker audio transfer needs a portable path (SharedArrayBuffer-free), design constraint from day one, no COOP/COEP requirement in v1
