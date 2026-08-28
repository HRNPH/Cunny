# 009, `@cunny-ai/tts`

| | |
|---|---|
| Package | `@cunny-ai/tts` |
| Phase | 1, Launch Nine |
| Status | spec |
| Depends on | `@cunny-ai/core` |
| Model | Kokoro-82M int8 ONNX + per-voice speaker tensors |
| Weights | 🟠 ~85MB model + curated voice subset (≤10MB) |
| License | Apache-2.0 |

## Why

The heaviest phase 1 module. Best quality per megabyte among current small TTS models. Native `speechSynthesis` is the fallback tier.

## Scope

**In:**

- `speak(text, { voice, speed })` → `{ play(): Promise<void>, audio, stop() }`
- Sentence-level chunking with incremental playback (first sentence starts while later ones synthesize)
- Curated default voice set (~8 voices); full voice list lazy-fetchable per voice
- `voices()` listing, `downloadVoice(id)` explicit prefetch
- Native fallback tier: `speak(text, { engine: 'native' })` routes to `speechSynthesis` (0MB)
- AudioBuffer + WAV Blob export helpers

**Out:**

- Light tier Piper (035), voice conversion (087), streaming phoneme-level latency (v2), SSML

## API sketch

```ts
import { speak, voices } from '@cunny-ai/tts'

const utter = await speak("Hello from the browser. No server involved.", {
  voice: 'af_heart',   // default
  speed: 1.0,
})
await utter.play()

voices()        // [{ id: 'af_heart', lang: 'en-US', gender: 'female', sizeKB }]
```

## Decisions

- **Voice budget discipline:** Kokoro's full voices blob is ~27MB, over budget when added to the 85MB model. Registry **splits voices into per-voice files** (offline CI tooling) and the package ships a curated default subset; users lazy-fetch any other voice on demand.
- **Phonemization:** English via the phonemizer approach proven by kokoro-js (internal reference implementation); non-English languages require espeak-ng wasm (~3MB, lazy per language, v1.1)
- **WebGPU strongly recommended**, q8 WASM is best-effort (may be slower than realtime on weak machines; docs state it plainly)

## Acceptance criteria

- [ ] First sentence audible < 3s after `speak()` on 25Mbps (model + voice download included)
- [ ] Realtime factor ≥ 1.0 on WebGPU for sustained synthesis (desktop)
- [ ] 500-char text: no dropped/repeated sentences at chunk boundaries
- [ ] Native fallback tier produces audible output with zero download
- [ ] Voice lazy-download: each voice ≤ 1.5MB

## Risks

- Largest download in Phase 1, playground must show progress honestly and offer native tier while downloading
- Phonemizer edge cases (numbers, abbreviations), fixture tests with tricky strings
- int8 quantization artifacts on some voices, voice curation includes a listen-test checklist
