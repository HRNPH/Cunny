# Roadmap

Implementation priority index. The `NNN_` prefix **is** the priority: modules ship roughly in numeric order. Each module lives in `docs/roadmaps/NNN_<name>/` and gets its spec written **before** implementation starts.

Full task catalog with impact ratings: [`../tasks.md`](../tasks.md)
Layered architecture (multi-model, providers, size budget): [`../architecture.md`](../architecture.md)
Release & npm publishing blueprint: [`../releases.md`](../releases.md)

> **All modules 000–021 are spec'd.** Implementation order = numeric order; each module's spec is the contract, its acceptance criteria are the definition of done.

---

## Principles

1. **Client-side only.** No server, no API keys, no backend. Everything runs in the browser (WASM first, WebGPU optional acceleration).
2. **Inference only.** No training, no fine-tuning, ever.
3. **No setup.** `import { detect } from '@cunny-ai/detect'` works with zero config. Escape hatches for power users.
4. **Lazy by default.** Code splits on import; model weights fetch on first `.load()`/first call, then cached (Cache API + IndexedDB). Never re-downloaded.
5. **Bundle rule.** Models ≤ 1 MB **may** be bundled into the package (e.g. Haar cascades, tiny wasm). Everything else streams from CDN, SRI-pinned and version-locked.
6. **The 100 MB ceiling.** No task package exceeds ~100 MB of weights (quantized). Bigger stuff is out of scope, see tasks.md.
7. **WASM baseline.** Every v1 module must work without WebGPU. WebGPU is a transparent speedup, never a requirement.

## Repo & publishing architecture

- **Single monorepo**, all code lives here (`pnpm` workspaces + `turbo`).
- **Packages publish independently**, each task is a standalone npm package (`@cunny-ai/<task>`), versioned and released on its own cadence via `changesets`. No "install the framework", users install exactly one task.
- **`packages/core` is the only shared dep**, backend detection, model registry, cache, worker host. Task packages depend on it; it never depends on them.
- **Models are not code.** Weights resolve from a versioned JSON manifest (default: our CDN / HF Hub mirror), SRI-hashed, overridable via config. License metadata ships in the manifest.
- **Model license policy:** default models must be Apache-2.0 / MIT / CC-BY. AGPL models (e.g. Ultralytics YOLO) are opt-in, never defaults.

## Status legend

`planned` → `spec` (this doc written) → `in-progress` → `impl (private)` (code complete + building, held private until browser-verified) → `shipped`

**Release log:** 2026-08-28, v0.0.1 shipped: `@cunny-ai/core`, `@cunny-ai/provider-mediapipe`, `@cunny-ai/face-detect` (browser-verified trio). 15 further packages implemented and building clean but private pending verification, flip `private` per package as its acceptance criteria pass. **All modules 000–021 shipped (22 task packages + core + 2 providers, 25 npm packages total).** Clip, depth and captions were verified by a manual maintainer pass in a desktop browser (2026-09-03) after the embedded-webview smoke channel proved unable to compile their large conv models.

---

## Phase 0, Foundation

| # | Package | Task | Size | Status |
|---|---|---|---|---|
| 000 | `@cunny-ai/core` | Engine, registry v2 (multi-model/tiers), cache, TaskAdapter seam | ⚪ | **shipped v0.0.1** |
| P-01 | `@cunny-ai/provider-mediapipe` | Shared mediapipe runtime: version pin, wasm resolution, sessions | ⚪ | **shipped v0.0.1** |
| P-02 | `@cunny-ai/provider-onnx` | Shared onnxruntime-web runtime: wasm, sessions, tensor utils | ⚪ | **shipped v0.0.1** |

*P-numbers mark infrastructure packages. Provider packages are the dedupe boundary, see [`../architecture.md`](../architecture.md). Nothing else ships until core + providers are stable.*

## Phase 1, The Launch Nine (WASM-viable, zero WebGPU dependency)

| # | Package | Task | Size | Status |
|---|---|---|---|---|
| 001 | `@cunny-ai/bg-remove` | Background removal (250KB!) | 🟢 | impl (private) |
| 002 | `@cunny-ai/embed` | Text embeddings (RAG backbone) | 🟢 | impl (private) |
| 003 | `@cunny-ai/face-mesh` | Face landmarks + blendshapes | 🟢 | impl (private) |
| 004 | `@cunny-ai/detect` | Object detection | 🟢 | impl (private) |
| 005 | `@cunny-ai/vad` | Voice activity detection | 🟢 | **shipped v0.0.1** |
| 006 | `@cunny-ai/stt` | Speech-to-text (Moonshine) | 🟢 | impl (private) |
| 007 | `@cunny-ai/pose` | Body pose estimation | 🟢 | impl (private) |
| 008 | `@cunny-ai/ocr` | OCR (PaddleOCR mobile) | 🟡 | **shipped v0.0.1** |
| 009 | `@cunny-ai/tts` | Text-to-speech (Kokoro) | 🟠 | **shipped v0.0.1** |

## Phase 2, RAG & vision depth

| # | Package | Task | Size | Status |
|---|---|---|---|---|
| 010 | `@cunny-ai/vector` | sqlite-vec vector store | ⚪ | **shipped v0.0.1** |
| 011 | `@cunny-ai/search` | Semantic search combo (embed + vector) | 🟢 | **shipped v0.0.1** |
| 012 | `@cunny-ai/similarity` | Paraphrase / STS | 🟢 | impl (private) |
| 013 | `@cunny-ai/clip` | Image↔text search | 🟠 | **shipped v0.0.1** |
| 014 | `@cunny-ai/segment` | Semantic segmentation | 🟢 | impl (private) |
| 015 | `@cunny-ai/depth` | Depth estimation | 🟡 | **shipped v0.0.1** |
| 016 | `@cunny-ai/upscale` | Photo super-resolution | 🟡 | **shipped v0.0.1** |
| 017 | `@cunny-ai/track` | Multi-object tracking (ByteTrack) | ⚪ | **shipped v0.0.1** |
| 018 | `@cunny-ai/stt-live` | Streaming STT (zipformer) | 🟡 | **shipped v0.0.1** (fallback engine) |
| 019 | `@cunny-ai/captions` | Live captions combo (vad + stt-live) | 🟡 | **shipped v0.0.1** |
| 020 | `@cunny-ai/denoise-audio` | Noise suppression (RNNoise) | 🟢 | **shipped v0.0.1** |

## Phase 3, Face & hand suite

| # | Package | Task | Size | Status |
|---|---|---|---|---|
| 021 | `@cunny-ai/face-detect` | Face detection | 🟢 | **shipped v0.0.1** |
| 022 | `@cunny-ai/face-id` | Face recognition | 🟢 | planned |
| 023 | `@cunny-ai/face-liveness` | Anti-spoofing | 🟢 | planned |
| 024 | `@cunny-ai/hands` | Hand landmarks | 🟢 | planned |
| 025 | `@cunny-ai/gesture` | Gesture recognition | 🟢 | planned |
| 026 | `@cunny-ai/eye-state` | Blink / drowsiness | 🟢 | planned |
| 027 | `@cunny-ai/head-pose` | Head pose | 🟢 | planned |
| 028 | `@cunny-ai/gaze` | Gaze estimation | 🟢 | planned |
| 029 | `@cunny-ai/emotion` | Facial emotion | 🟢 | planned |
| 030 | `@cunny-ai/face-attr` | Age / gender | 🟢 | planned |

## Phase 4, Voice suite

| # | Package | Task | Size | Status |
|---|---|---|---|---|
| 031 | `@cunny-ai/wakeword` | Wake word | 🟢 | planned |
| 032 | `@cunny-ai/assistant` | Offline voice loop combo | 🟢 | planned |
| 033 | `@cunny-ai/voice-id` | Speaker embedding | 🟡 | planned |
| 034 | `@cunny-ai/audio-events` | YAMNet audio events | 🟢 | planned |
| 035 | `@cunny-ai/tts-light` | Piper TTS | 🟡 | planned |
| 036 | `@cunny-ai/bird-id` | BirdNET | 🟡 | planned |
| 037 | `@cunny-ai/vocal-remove` | Vocal separation | 🟡 | planned |
| 038 | `@cunny-ai/denoise-audio-pro` | DeepFilterNet3 | 🟡 | planned |
| 039 | `@cunny-ai/speech-emotion` | Speech emotion | 🟢 | planned |
| 040 | `@cunny-ai/stt-multi` | Whisper multilingual | 🟠 | planned |

## Phase 5, Photo suite

| # | Package | Task | Size | Status |
|---|---|---|---|---|
| 041 | `@cunny-ai/img-dedupe` | pHash dedupe | ⚪ | planned |
| 042 | `@cunny-ai/colorize` | Colorize B&W | 🟡 | planned |
| 043 | `@cunny-ai/face-restore` | Face restoration | 🟠 | planned |
| 044 | `@cunny-ai/denoise-image` | Denoise | 🟡 | planned |
| 045 | `@cunny-ai/lowlight` | Low-light enhance | 🟡 | planned |
| 046 | `@cunny-ai/dejpeg` | JPEG artifact removal | 🟡 | planned |
| 047 | `@cunny-ai/style` | Style transfer | 🟢 | planned |
| 048 | `@cunny-ai/cartoon` | Cartoonize | 🟢 | planned |
| 049 | `@cunny-ai/sketch` | Photo → sketch | 🟢 | planned |
| 050 | `@cunny-ai/upscale-anime` | Anime4K shaders | ⚪ | planned |
| 051 | `@cunny-ai/video-matting` | RVM matting | 🟡 | planned |
| 052 | `@cunny-ai/salient` | Salient cutout | 🟢 | planned |
| 053 | `@cunny-ai/bg-effects` | Portrait blur/replace | 🟢 | planned |
| 054 | `@cunny-ai/hair-seg` | Hair segmentation | 🟢 | planned |
| 055 | `@cunny-ai/clothes-seg` | Clothes segmentation | 🟢 | planned |
| 056 | `@cunny-ai/sky-replace` | Sky replace | 🟢 | planned |

## Phase 6, Documents & extras

| # | Package | Task | Size | Status |
|---|---|---|---|---|
| 057 | `@cunny-ai/table-extract` | Table extraction | 🟡 | planned |
| 058 | `@cunny-ai/htr` | Handwriting recognition | 🟠 | planned |
| 059 | `@cunny-ai/doc-layout` | Layout analysis | 🟢 | planned |
| 060 | `@cunny-ai/mrz` | Passport MRZ | 🟢 | planned |
| 061 | `@cunny-ai/barcode` | Barcode/QR (native-first) | ⚪ | planned |
| 062 | `@cunny-ai/segment-instances` | Instance segmentation | 🟡 | planned |

## Phase 7, Text suite

| # | Package | Task | Size | Status |
|---|---|---|---|---|
| 063 | `@cunny-ai/pii` | PII / NER detection | 🟡 | planned |
| 064 | `@cunny-ai/lang-id` | Language detection | 🟢 | planned |
| 065 | `@cunny-ai/sentiment` | Sentiment | 🟢 | planned |
| 066 | `@cunny-ai/classify` | Text classification | 🟢 | planned |
| 067 | `@cunny-ai/keywords` | YAKE keywords | ⚪ | planned |
| 068 | `@cunny-ai/chunk` | RAG chunking | ⚪ | planned |
| 069 | `@cunny-ai/rerank` | Re-ranking | 🟢 | planned |
| 070 | `@cunny-ai/moderate` | Moderation | 🟡 | planned |
| 071 | `@cunny-ai/summarize` | Summarization | 🟠 | planned |
| 072 | `@cunny-ai/translate` | Translation | 🟠 | planned |
| 073 | `@cunny-ai/grammar` | Grammar correction | 🟠 | planned |
| 074 | `@cunny-ai/tokenizer` | Tokenizer infra | 🟢 | planned |
| 075 | `@cunny-ai/llm-mini` | Toy LLM (SmolLM2-135M q4) | 🟠 | planned |

## Phase 8, Niche, combos & long tail

| # | Package | Task | Size | Status |
|---|---|---|---|---|
| 076 | `@cunny-ai/crowd-count` | Crowd counting | 🟡 | planned |
| 077 | `@cunny-ai/reid` | Person re-ID | 🟡 | planned |
| 078 | `@cunny-ai/alpr` | License plates | 🟡 | planned |
| 079 | `@cunny-ai/nsfw` | NSFW detection | 🟢 | planned |
| 080 | `@cunny-ai/hazard-detect` | Weapon/fire/smoke | 🟢 | planned |
| 081 | `@cunny-ai/music-tag` | Genre/mood | 🟢 | planned |
| 082 | `@cunny-ai/pitch` | Pitch tracking | ⚪ | planned |
| 083 | `@cunny-ai/bpm` | Beat detection | ⚪ | planned |
| 084 | `@cunny-ai/chords` | Chord detection | ⚪ | planned |
| 085 | `@cunny-ai/clap` | Audio embeddings | 🟠 | planned |
| 086 | `@cunny-ai/deepfake` | Deepfake detection | 🟡 | planned |
| 087 | `@cunny-ai/voice-convert` | Voice conversion | 🟠 | planned |
| 088 | `@cunny-ai/rep-count` | Rep counting | ⚪ | planned |
| 089 | `@cunny-ai/fall-detect` | Fall detection | ⚪ | planned |
| 090 | `@cunny-ai/smooth` | One-Euro landmark smoothing | ⚪ | planned |
| 091 | `@cunny-ai/custom` | Bring your own model runtime | — | planned |

## Cross-cutting (unnumbered until scoped)

- `@cunny-ai/react`, hooks layer (`useModel`, Suspense-friendly, SSR-safe). Decide after Phase 1 feedback.
- Devtools panel, backend/memory/latency inspector.
- Playground app, every shipped task demoed live.

---

## Definition of Done (every module)

A task package is `shipped` only when:

- [ ] Typed public API, one primary export function or class
- [ ] Runs entirely in a worker by default (main thread stays free)
- [ ] Weights resolve through `@cunny-ai/core` registry (cached, SRI, progress events)
- [ ] Works on WASM without WebGPU (WebGPU path optional and benchmarked)
- [ ] Import is SSR-safe (no `window` at module top level)
- [ ] Unit tests colocated in the package (`src/*.test.ts`), `pnpm test` green
- [ ] Browser smoke in the playground against the real model, recorded in the spec
- [ ] Docs page + playground example
- [ ] Size budget verified and displayed (package + first-load weights)
- [ ] Model license recorded in the manifest; AGPL is opt-in
