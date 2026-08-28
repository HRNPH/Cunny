# Task Catalog

Everything implementable in the browser. Inference only. No training, no server. Each task is one package in the `@cunny-ai/*` scope, published independently from this repo.

Sizes are approximate **quantized (q8/q4) download sizes**, what actually hits the user's network on first use.

- ⚪ 0 MB (classical / native / bundled)
- 🟢 < 10 MB
- 🟡 10–50 MB
- 🟠 50–100 MB (the budget ceiling, anything bigger is out of scope)

**Impact rubric** (how rows are sorted within each group):

- 🟥 **High**, everyday need, no simple off-the-shelf solution exists today; devs currently hand-glue ONNX/MediaPipe to get it. Huge value-per-MB.
- 🟨 **Medium**, real demand, but a painful alternative exists (native API, heavy lib) or the audience is narrower.
- 🟦 **Low**, niche, demo-grade accuracy, ethically fraught, or the platform is about to absorb it.

---

## Vision, Understanding

| Task | Model | Size | Detail | Package | Impact |
|---|---|---|---|---|---|
| Face landmarks + blendshapes | MediaPipe Face Landmarker | 🟢 ~3MB | 478 pts, AR/filters/effects | `@cunny-ai/face-mesh` | 🟥 |
| Object detection | NanoDet / YOLOX-n | 🟢 4–7MB | 80 classes, real-time | `@cunny-ai/detect` | 🟥 |
| Body pose | MediaPipe Pose / MoveNet | 🟢 5–9MB | 33 keypoints, fitness/mocap | `@cunny-ai/pose` | 🟥 |
| Face detection | YuNet / SCRFD | 🟢 1–3MB | Boxes + 5 landmarks; gateway to all face tasks | `@cunny-ai/face-detect` | 🟥 |
| Face recognition | MobileFaceNet | 🟢 5–10MB | 512-d embedding, face login | `@cunny-ai/face-id` | 🟨 |
| Face anti-spoofing | mini-FASNet | 🟢 2–5MB | Liveness, pairs with face-id | `@cunny-ai/face-liveness` | 🟨 |
| Eye state / blink | tiny CNN | 🟢 1–3MB | Drowsiness, attention analytics | `@cunny-ai/eye-state` | 🟨 |
| Hand landmarks | MediaPipe Hands | 🟢 ~3MB | 21 pts × 2 hands | `@cunny-ai/hands` | 🟨 |
| Gesture recognition | MediaPipe Gestures | 🟢 ~3MB | Built-in thumb/peace/fist | `@cunny-ai/gesture` | 🟨 |
| Emotion (face) | HSEmotion | 🟢 5–15MB | ⚠️ demo-grade science, sell carefully | `@cunny-ai/emotion` | 🟨 |
| Gaze estimation | MPIIGaze-style | 🟢 2–10MB | Where the user is looking | `@cunny-ai/gaze` | 🟨 |
| Head pose | 6D-Reps-lite | 🟢 2–8MB | Yaw/pitch/roll | `@cunny-ai/head-pose` | 🟨 |
| Crowd counting | tiny CSRNet | 🟡 10–20MB | Occupancy, queue analytics | `@cunny-ai/crowd-count` | 🟨 |
| Person re-ID | OSNet-mini | 🟡 15–30MB | Same person across cameras | `@cunny-ai/reid` | 🟨 |
| License plate read | YOLO + LPR-net | 🟡 10–15MB | Detect + OCR plate text | `@cunny-ai/alpr` | 🟨 |
| NSFW detection | NudeNet-mini | 🟢 5–20MB | UGC content moderation | `@cunny-ai/nsfw` | 🟨 |
| Weapon / fire / smoke | YOLO fine-tunes | 🟢 ~7MB | Safety monitoring | `@cunny-ai/hazard-detect` | 🟨 |
| Age / gender estimate | small CNNs | 🟢 ~5MB | ⚠️ ethically gray, accuracy meh | `@cunny-ai/face-attr` | 🟦 |
| Deepfake detection | small CNNs | 🟡 20–80MB | ⚠️ honest accuracy ~80% | `@cunny-ai/deepfake` | 🟦 |

## Vision, Segmentation

| Task | Model | Size | Detail | Package | Impact |
|---|---|---|---|---|---|
| Background removal | MediaPipe Selfie Seg | 🟢 **~250KB** | Person cutout | `@cunny-ai/bg-remove` | 🟥 |
| Portrait effects | selfie seg + WebGL | 🟢 ~250KB | Blur/replace for video calls | `@cunny-ai/bg-effects` | 🟥 |
| Salient object cutout | u2netp | 🟢 1–5MB | Auto-cutout any object | `@cunny-ai/salient` | 🟨 |
| Semantic seg | DeepLabV3-MNV2 | 🟢 3–9MB | 21-class pixel labels | `@cunny-ai/segment` | 🟨 |
| Video matting | RVM MobileNetV3 | 🟡 15–30MB | Temporal-stable green screen | `@cunny-ai/video-matting` | 🟨 |
| Instance seg | YOLOX-n-seg | 🟡 7–13MB | Per-object masks | `@cunny-ai/segment-instances` | 🟨 |
| Hair segmentation | MediaPipe interactive | 🟢 ~5MB | Hair recolor try-on | `@cunny-ai/hair-seg` | 🟦 |
| Clothes segmentation | small seg net | 🟢 5–10MB | Try-on building block | `@cunny-ai/clothes-seg` | 🟦 |
| Sky replace | sky-seg small | 🟢 ~2MB | Photo editor staple | `@cunny-ai/sky-replace` | 🟦 |

## Vision, Enhance / Transform

| Task | Model | Size | Detail | Package | Impact |
|---|---|---|---|---|---|
| Photo super-res | Real-ESRGAN x4 | 🟡 ~17MB | Universal 4× upscale | `@cunny-ai/upscale` | 🟥 |
| Depth estimation | Depth Anything v2-s | 🟡 25–30MB | Monocular depth, AR/relight | `@cunny-ai/depth` | 🟨 |
| Colorize B&W | DDColor-small | 🟡 ~30MB | Viral potential | `@cunny-ai/colorize` | 🟨 |
| Face restoration | CodeFormer-lite | 🟠 50–90MB | Fix old/blurry faces | `@cunny-ai/face-restore` | 🟨 |
| Anime upscale | Anime4K (WGSL) | ⚪ ~KBs | Shader-based, instant | `@cunny-ai/upscale-anime` | 🟨 |
| Denoise | NAFNet-small | 🟡 15–40MB | Low-light cleanup | `@cunny-ai/denoise-image` | 🟨 |
| Low-light enhance | small nets | 🟡 10–20MB | Brighten without noise | `@cunny-ai/lowlight` | 🟨 |
| JPEG artifact removal | small NAFNet | 🟡 10–20MB | Screenshot/webp cleanup | `@cunny-ai/dejpeg` | 🟦 |
| Style transfer | fast-neural-style | 🟢 2–10MB | Per-style weights | `@cunny-ai/style` | 🟦 |
| Cartoonize | white-box-cartoonization | 🟢 ~10MB | Photo → cartoon | `@cunny-ai/cartoon` | 🟦 |
| Photo → sketch | Anime2Sketch | 🟢 5–20MB | Line art extraction | `@cunny-ai/sketch` | 🟦 |

## Documents

| Task | Model | Size | Detail | Package | Impact |
|---|---|---|---|---|---|
| OCR (print) | PaddleOCR mobile | 🟡 15–20MB | 80+ langs, det+rec pipeline | `@cunny-ai/ocr` | 🟥 |
| Table extraction | table-structure-rec | 🟡 15–40MB | Table → structured data | `@cunny-ai/table-extract` | 🟨 |
| Handwriting (HTR) | TrOCR-small | 🟠 60–90MB | English handwriting | `@cunny-ai/htr` | 🟨 |
| Doc layout analysis | PubLayNet-mini | 🟢 5–20MB | Tables/figures/headers | `@cunny-ai/doc-layout` | 🟦 |
| Passport MRZ | MRZ-net | 🟢 ~10MB | Travel doc parsing | `@cunny-ai/mrz` | 🟦 |
| Barcode / QR | BarcodeDetector / ZXing | ⚪ 0MB | Native first, ZXing fallback | `@cunny-ai/barcode` | 🟨 |

## Audio, Understanding

| Task | Model | Size | Detail | Package | Impact |
|---|---|---|---|---|---|
| Voice activity (VAD) | Silero VAD | 🟢 **~2MB** | Gates every voice pipeline | `@cunny-ai/vad` | 🟥 |
| STT (English) | Moonshine tiny | 🟢 ~30MB | Beats Whisper-tiny, 5× faster | `@cunny-ai/stt` | 🟥 |
| STT (streaming) | zipformer transducer | 🟡 40–80MB | Live captions, low latency | `@cunny-ai/stt-live` | 🟥 |
| Noise suppression | RNNoise | 🟢 **~50KB** | Classical RNN, call cleanup | `@cunny-ai/denoise-audio` | 🟥 |
| Audio events | YAMNet | 🟢 ~4MB | 521 classes: cry, siren, bark | `@cunny-ai/audio-events` | 🟨 |
| STT (multilingual) | Whisper tiny/base | 🟠 20–80MB | ~100 langs, batch | `@cunny-ai/stt-multi` | 🟨 |
| Wake word | openWakeWord | 🟢 2–10MB | "Hey app" offline trigger | `@cunny-ai/wakeword` | 🟨 |
| Speaker embedding | WeSpeaker-mini | 🟡 30–90MB | "Who is talking" | `@cunny-ai/voice-id` | 🟨 |
| Vocal removal | Spleeter 2-stem | 🟡 ~30MB | Karaoke / stems | `@cunny-ai/vocal-remove` | 🟨 |
| Bird sound ID | BirdNET | 🟡 ~40MB | Hobbyist favorite | `@cunny-ai/bird-id` | 🟨 |
| Noise suppression (DL) | DeepFilterNet3 | 🟡 ~20MB | Higher quality | `@cunny-ai/denoise-audio-pro` | 🟨 |
| Music genre/mood | MusicNN | 🟢 ~10MB | Playlist tagging | `@cunny-ai/music-tag` | 🟦 |
| Speech emotion | small CNN | 🟢 5–20MB | ⚠️ shaky science | `@cunny-ai/speech-emotion` | 🟦 |

## Audio, Synthesis

| Task | Model | Size | Detail | Package | Impact |
|---|---|---|---|---|---|
| TTS (quality) | Kokoro-82M int8 | 🟠 ~85MB | Best quality-per-MB | `@cunny-ai/tts` | 🟥 |
| TTS (light) | Piper voices | 🟡 20–65MB | 30+ voices, lazy per-voice | `@cunny-ai/tts-light` | 🟨 |
| TTS (native) | `speechSynthesis` | ⚪ 0MB | Free OS voices, fallback tier | built into `@cunny-ai/tts` | 🟨 |
| Voice changer | RVC-lite | 🟠 borderline | ⚠️ cloning ethics, skip v1 | `@cunny-ai/voice-convert` | 🟦 |

## Text

| Task | Model | Size | Detail | Package | Impact |
|---|---|---|---|---|---|
| Embeddings | bge-small / MiniLM-L6 | 🟢 15–25MB | Edge-RAG backbone | `@cunny-ai/embed` | 🟥 |
| Vector search | sqlite-vec | ⚪ <1MB | Bundled → local RAG | `@cunny-ai/vector` | 🟥 |
| Semantic search | embed + vector | 🟢 combo | "Search my notes/files" | `@cunny-ai/search` | 🟥 |
| PII / NER detection | bert-mini | 🟡 15–66MB | Local privacy pitch | `@cunny-ai/pii` | 🟨 |
| Similarity / paraphrase | MiniLM-STS | 🟢 ~23MB | Dedupe, matching | `@cunny-ai/similarity` | 🟨 |
| Sentiment | TinyBERT tune | 🟢 ~15MB | Reviews, social | `@cunny-ai/sentiment` | 🟨 |
| Re-ranking | MiniLM cross-enc | 🟢 15–25MB | RAG quality boost | `@cunny-ai/rerank` | 🟨 |
| Text classification | SetFit-mini | 🟢 15–25MB | Custom label sets | `@cunny-ai/classify` | 🟨 |
| Keywords | YAKE | ⚪ 0MB | Classical, instant | `@cunny-ai/keywords` | 🟨 |
| Chunking (RAG infra) | algorithms | ⚪ 0MB | Pairs with embed | `@cunny-ai/chunk` | 🟨 |
| Language detect | fastText LID | 🟢 ~9MB | 176 langs | `@cunny-ai/lang-id` | 🟨 |
| Summarize | flan-t5-small | 🟠 60–80MB | Chrome Summarizer API competes | `@cunny-ai/summarize` | 🟦 |
| Translate | opus-mt per-pair | 🟠 40–80MB | Chrome Translator API competes | `@cunny-ai/translate` | 🟦 |
| Grammar fix | t5-small tune | 🟠 ~60MB | Chrome Writer API competes | `@cunny-ai/grammar` | 🟦 |
| Moderation | small tunes | 🟡 15–60MB | Chat/UGC | `@cunny-ai/moderate` | 🟦 |
| Tokenizer | wasm tokenizers | 🟢 1–2MB | Infra layer | `@cunny-ai/tokenizer` | 🟦 |
| Toy LLM | SmolLM2-135M q4 | 🟠 ~75MB | Honest: toy-grade | `@cunny-ai/llm-mini` | 🟦 |

## Multimodal

| Task | Model | Size | Detail | Package | Impact |
|---|---|---|---|---|---|
| Image↔text search | CLIP ViT-B/32 q4 | 🟠 40–75MB | "Find my sunset photos" | `@cunny-ai/clip` | 🟥 |
| Image dedupe | pHash | ⚪ 0MB | Classical, instant | `@cunny-ai/img-dedupe` | 🟨 |
| Audio embedding | CLAP-small | 🟠 borderline | Sound similarity | `@cunny-ai/clap` | 🟦 |

## Zero-model classical & DSP (⚪, always bundle)

| Task | Model | Size | Detail | Package | Impact |
|---|---|---|---|---|---|
| Barcode / QR | ZXing | ⚪ 0MB | Native-first wrapper | `@cunny-ai/barcode` | 🟨 |
| Pitch tracking | pYIN | ⚪ 0MB | Vocal training apps | `@cunny-ai/pitch` | 🟨 |
| BPM / beat | DSP | ⚪ 0MB | Music apps | `@cunny-ai/bpm` | 🟦 |
| Chord detection | DSP | ⚪ 0MB | Guitar apps | `@cunny-ai/chords` | 🟦 |
| Landmark smoothing | One-Euro filter | ⚪ 0MB | Kills jitter, makes demos feel pro | `@cunny-ai/smooth` | 🟨 |

## Combo packages (compose others, ⚪ runtime logic only)

| Task | Built from | Detail | Package | Impact |
|---|---|---|---|---|
| Multi-object tracking | detect + ByteTrack | Persistent IDs across frames | `@cunny-ai/track` | 🟥 |
| Live captions | vad + stt-live | Mic → text, VAD-gated | `@cunny-ai/captions` | 🟥 |
| Voice assistant loop | wakeword + captions + tts | Full offline voice loop | `@cunny-ai/assistant` | 🟨 |
| Rep counting | pose + heuristics | Fitness apps | `@cunny-ai/rep-count` | 🟨 |
| Fall detection | pose + velocity | Elder care demos | `@cunny-ai/fall-detect` | 🟦 |

## Bring-your-own model (infinite long tail)

One generic runtime, `@cunny-ai/custom`, takes `{ modelUrl, taskType }` and gives any fine-tuned YOLO / YAMNet / small-BERT the same `.load()` / lazy / worker / cache DX. Covers plant disease ID, food recognition, product recognition, parking occupancy, sign language letters, cough detection, and everything else without per-SKU maintenance. **Own the interface.** (Medical uses e.g. ECG: regulated, explicitly out of scope.)

---

## Explicitly OUT of scope (> 100 MB or not client-side)

- Image generation (SD / SDXL), image captioning / VQA (BLIP, Moondream)
- Whisper medium/large, NLLB translation, Demucs separation
- Any LLM people actually want to chat with (1B+ = 500 MB+)
- Model training, fine-tuning, server-side inference
- These may later become an optional "WebGPU tier", never part of the core promise
