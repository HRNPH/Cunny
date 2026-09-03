# 019, `@cunny-ai/captions`

| | |
|---|---|
| Package | `@cunny-ai/captions` |
| Phase | 2, RAG & vision depth |
| Status | spec |
| Depends on | `@cunny-ai/vad` (005), `@cunny-ai/stt-live` (018), fallback `@cunny-ai/stt` (006) |
| Model | inherits |
| Weights | 🟡/🟠 inherits |
| License | MIT |

## Why

Mic in, captions out, offline. Pure orchestration over packages already built. Combos should be nearly free to build.

## Scope

**In:**

- `captionStream(micStream | MediaTrack, { onCaption })`
- Events: `{ text, isFinal, startTs, endTs }`, interim updates as partials arrive, finalized on utterance end
- Engine selection: `'live'` (018, default when available) or `'batch'` (VAD + 006 chunked, the always-works fallback, ships first)
- Transcript accumulation helper: `transcript()` → full session text with timestamps
- Auto language routing hook (later 064)

**Out:**

- Translation of captions (072 composes), diarization, recording/UI (playground provides reference UI)

## API sketch

```ts
import { captionStream } from '@cunny-ai/captions'

const stop = captionStream(micStream, {
  onCaption: ({ text, isFinal }) => {
    captionEl.textContent = text
    if (isFinal) commitLine()
  },
})
```

## Decisions

- Ships **batch-mode first** (005 + 006, both Phase 1 packages), live mode flips on when 018 lands; the public API is identical either way (engine option), which is the whole point of the combo layer
- Backpressure rule: if transcription falls behind real-time, drop oldest pending segments and emit a `{ lagWarning }` event, never silently queue unbounded
- Timestamps from VAD boundaries (batch) or transducer endpointing (live), one normalized event shape

## Acceptance criteria

- [ ] Batch mode: caption appears < 1.5s after utterance end (desktop)
- [ ] Live mode (post-018): partials < 400ms, final < 700ms
- [ ] 10-min session: transcript complete, no drift, no memory growth
- [ ] Works Chrome + Firefox + Safari mic pipelines (Safari AudioWorklet path fixture-tested)

## Risks

- Mic permission UX is the real-world blocker (not tech), playground ships a permissions-failure state guide
- Interim/final flicker needs event coalescing, reference implementation tested for visual stability


## Verification

2026-09-03, manual pass by the maintainer in a desktop browser: the vad + stt pipeline produced utterance captions from a live mic. Both component engines were already machine-verified individually (vad: peak 1.00, five segments; stt: word-perfect transcript); this pass covered the MediaStream wiring.
