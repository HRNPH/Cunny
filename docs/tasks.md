# Task Catalog

Tasks implementable in the browser. Inference only, no training, no server. One package per task in the `@cunny-ai` scope.

Sizes are quantized download sizes: ⚪ 0MB, 🟢 <10MB, 🟡 10–50MB, 🟠 50–100MB (ceiling).

Impact: 🟥 no simple solution exists. 🟨 solutions exist but are painful. 🟦 niche or low accuracy.

## Vision

| Task | Model | Size | Detail | Package | Impact |
|---|---|---|---|---|---|
| Face detection | YuNet / SCRFD | 🟢 1–3MB | Boxes + 5 landmarks, base for face tasks | `@cunny-ai/face-detect` | 🟥 |
| Face landmarks + blendshapes | MediaPipe Face Landmarker | 🟢 ~3MB | 478 points, AR filters | `@cunny-ai/face-mesh` | 🟥 |
| Object detection | NanoDet / YOLOX-n | 🟢 4–7MB | 80 classes, realtime | `@cunny-ai/detect` | 🟥 |
| Body pose | MediaPipe Pose / MoveNet | 🟢 5–9MB | 33 keypoints, fitness, mocap | `@cunny-ai/pose` | 🟥 |
| Face recognition | MobileFaceNet | 🟢 5–10MB | 512d embedding, face login | `@cunny-ai/face-id` | 🟨 |
| Face anti-spoofing | mini-FASNet | 🟢 2–5MB | Liveness | `@cunny-ai/face-liveness` | 🟨 |
| Eye state / blink | tiny CNN | 🟢 1–3MB | Drowsiness | `@cunny-ai/eye-state` | 🟨 |
| Hand landmarks | MediaPipe Hands | 🟢 ~3MB | 21 points per hand | `@cunny-ai/hands` | 🟨 |
| Gesture recognition | MediaPipe Gestures | 🟢 ~3MB | Thumb, peace, fist | `@cunny-ai/gesture` | 🟨 |
| Emotion (face) | HSEmotion | 🟢 5–15MB | 8 emotions, weak science | `@cunny-ai/emotion` | 🟨 |
| Gaze estimation | MPIIGaze | 🟢 2–10MB | Look direction | `@cunny-ai/gaze` | 🟨 |
| Head pose | 6D-Reps-lite | 🟢 2–8MB | Yaw, pitch, roll | `@cunny-ai/head-pose` | 🟨 |
| Crowd counting | tiny CSRNet | 🟡 10–20MB | Occupancy | `@cunny-ai/crowd-count` | 🟨 |
| Person re-ID | OSNet-mini | 🟡 15–30MB | Same person across cameras | `@cunny-ai/reid` | 🟨 |
| License plate read | YOLO + LPR-net | 🟡 10–15MB | Detect + OCR | `@cunny-ai/alpr` | 🟨 |
| NSFW detection | NudeNet-mini | 🟢 5–20MB | Content moderation | `@cunny-ai/nsfw` | 🟨 |
| Weapon / fire / smoke | YOLO fine tunes | 🟢 ~7MB | Safety monitoring | `@cunny-ai/hazard-detect` | 🟨 |
| Age / gender | small CNNs | 🟢 ~5MB | Low accuracy, ethical issues | `@cunny-ai/face-attr` | 🟦 |
| Deepfake detection | small CNNs | 🟡 20–80MB | ~80% accuracy | `@cunny-ai/deepfake` | 🟦 |

## Segmentation

| Task | Model | Size | Detail | Package | Impact |
|---|---|---|---|---|---|
| Background removal | MediaPipe Selfie Seg | 🟢 ~250KB | Person cutout | `@cunny-ai/bg-remove` | 🟥 |
| Portrait effects | selfie seg + WebGL | 🟢 ~250KB | Blur, replace for calls | `@cunny-ai/bg-effects` | 🟥 |
| Salient object | u2netp | 🟢 1–5MB | Any object cutout | `@cunny-ai/salient` | 🟨 |
| Semantic seg | DeepLabV3-MNV2 | 🟢 3–9MB | 21 class pixel labels | `@cunny-ai/segment` | 🟥 |
| Video matting | RVM MobileNetV3 | 🟡 15–30MB | Temporal stable | `@cunny-ai/video-matting` | 🟨 |
| Instance seg | YOLOX-n-seg | 🟡 7–13MB | Per object masks | `@cunny-ai/segment-instances` | 🟨 |
| Hair segmentation | MediaPipe interactive | 🟢 ~5MB | Hair recolor | `@cunny-ai/hair-seg` | 🟦 |
| Clothes segmentation | small seg net | 🟢 5–10MB | Try on building block | `@cunny-ai/clothes-seg` | 🟦 |
| Sky replace | sky-seg small | 🟢 ~2MB | Photo editors | `@cunny-ai/sky-replace` | 🟦 |

## Enhancement

| Task | Model | Size | Detail | Package | Impact |
|---|---|---|---|---|---|
| Super resolution | Real-ESRGAN x4 | 🟡 ~17MB | 4x upscale | `@cunny-ai/upscale` | 🟥 |
| Depth estimation | Depth Anything v2-s | 🟡 25–30MB | Relative depth, relighting, AR | `@cunny-ai/depth` | 🟨 |
| Colorize | DDColor-small | 🟡 ~30MB | Black and white to color | `@cunny-ai/colorize` | 🟨 |
| Face restoration | CodeFormer-lite | 🟠 50–90MB | Fix old faces | `@cunny-ai/face-restore` | 🟨 |
| Anime upscale | Anime4K (WGSL) | ⚪ ~KB | Shader based | `@cunny-ai/upscale-anime` | 🟨 |
| Denoise | NAFNet-small | 🟡 15–40MB | Low light cleanup | `@cunny-ai/denoise-image` | 🟨 |
| Low light enhance | small nets | 🟡 10–20MB | Brighten | `@cunny-ai/lowlight` | 🟨 |
| JPEG artifacts | small NAFNet | 🟡 10–20MB | Screenshot cleanup | `@cunny-ai/dejpeg` | 🟦 |
| Style transfer | fast-neural-style | 🟢 2–10MB | Per style weights | `@cunny-ai/style` | 🟦 |
| Cartoonize | white-box | 🟢 ~10MB | Photo to cartoon | `@cunny-ai/cartoon` | 🟦 |
| Photo to sketch | Anime2Sketch | 🟢 5–20MB | Line art | `@cunny-ai/sketch` | 🟦 |

## Documents

| Task | Model | Size | Detail | Package | Impact |
|---|---|---|---|---|---|
| OCR (print) | PaddleOCR mobile | 🟡 15–20MB | 80+ languages | `@cunny-ai/ocr` | 🟥 |
| Table extraction | table-structure-rec | 🟡 15–40MB | Tables to data | `@cunny-ai/table-extract` | 🟨 |
| Handwriting | TrOCR-small | 🟠 60–90MB | English | `@cunny-ai/htr` | 🟨 |
| Layout analysis | PubLayNet-mini | 🟢 5–20MB | Tables, figures, headers | `@cunny-ai/doc-layout` | 🟦 |
| Passport MRZ | MRZ-net | 🟢 ~10MB | Travel docs | `@cunny-ai/mrz` | 🟦 |
| Barcode / QR | BarcodeDetector / ZXing | ⚪ 0MB | Native first | `@cunny-ai/barcode` | 🟨 |

## Audio, understanding

| Task | Model | Size | Detail | Package | Impact |
|---|---|---|---|---|---|
| Voice activity | Silero VAD | 🟢 ~2MB | Gates voice pipelines | `@cunny-ai/vad` | 🟥 |
| STT (English) | Moonshine tiny | 🟢 ~30MB | Beats Whisper tiny, 5x faster | `@cunny-ai/stt` | 🟥 |
| STT (streaming) | zipformer | 🟡 40–80MB | Live captions | `@cunny-ai/stt-live` | 🟥 |
| Noise suppression | RNNoise | 🟢 ~50KB | Calls | `@cunny-ai/denoise-audio` | 🟥 |
| Audio events | YAMNet | 🟢 ~4MB | 521 classes | `@cunny-ai/audio-events` | 🟨 |
| STT (multilingual) | Whisper tiny/base | 🟠 20–80MB | ~100 languages | `@cunny-ai/stt-multi` | 🟨 |
| Wake word | openWakeWord | 🟢 2–10MB | Offline trigger | `@cunny-ai/wakeword` | 🟨 |
| Speaker embedding | WeSpeaker-mini | 🟡 30–90MB | Who is talking | `@cunny-ai/voice-id` | 🟨 |
| Vocal removal | Spleeter 2-stem | 🟡 ~30MB | Karaoke | `@cunny-ai/vocal-remove` | 🟨 |
| Bird sound ID | BirdNET | 🟡 ~40MB | 6k species | `@cunny-ai/bird-id` | 🟨 |
| Noise suppression (DL) | DeepFilterNet3 | 🟡 ~20MB | Higher quality | `@cunny-ai/denoise-audio-pro` | 🟨 |
| Music genre / mood | MusicNN | 🟢 ~10MB | Playlists | `@cunny-ai/music-tag` | 🟦 |
| Speech emotion | small CNN | 🟢 5–20MB | Weak science | `@cunny-ai/speech-emotion` | 🟦 |

## Audio, synthesis

| Task | Model | Size | Detail | Package | Impact |
|---|---|---|---|---|---|
| TTS (quality) | Kokoro-82M int8 | 🟠 ~85MB | Best quality per megabyte | `@cunny-ai/tts` | 🟥 |
| TTS (light) | Piper | 🟡 20–65MB | 30+ voices | `@cunny-ai/tts-light` | 🟨 |
| TTS (native) | speechSynthesis | ⚪ 0MB | OS voices | part of `@cunny-ai/tts` | 🟨 |
| Voice changer | RVC-lite | 🟠 ~90MB | Ethics: skip v1 | `@cunny-ai/voice-convert` | 🟦 |

## Text

| Task | Model | Size | Detail | Package | Impact |
|---|---|---|---|---|---|
| Embeddings | bge-small / MiniLM | 🟢 15–25MB | RAG backbone | `@cunny-ai/embed` | 🟥 |
| Vector search | sqlite-vec | ⚪ <1MB | Local RAG | `@cunny-ai/vector` | 🟥 |
| Semantic search | embed + vector | 🟢 combo | Search notes, files | `@cunny-ai/search` | 🟥 |
| PII / NER | bert-mini | 🟡 15–66MB | Local privacy | `@cunny-ai/pii` | 🟨 |
| Similarity | bge-small | 🟢 shared | Dedup, matching | `@cunny-ai/similarity` | 🟨 |
| Sentiment | TinyBERT | 🟢 ~15MB | Reviews | `@cunny-ai/sentiment` | 🟨 |
| Re-ranking | MiniLM cross encoder | 🟢 15–25MB | RAG quality | `@cunny-ai/rerank` | 🟨 |
| Classification | SetFit-mini | 🟢 15–25MB | Custom labels | `@cunny-ai/classify` | 🟨 |
| Keywords | YAKE | ⚪ 0MB | Classical | `@cunny-ai/keywords` | 🟨 |
| Chunking | algorithms | ⚪ 0MB | Pairs with embed | `@cunny-ai/chunk` | 🟨 |
| Language ID | fastText | 🟢 ~9MB | 176 languages | `@cunny-ai/lang-id` | 🟨 |
| Summarize | flan-t5-small | 🟠 60–80MB | Chrome API competes | `@cunny-ai/summarize` | 🟦 |
| Translate | opus-mt | 🟠 40–80MB | Chrome API competes | `@cunny-ai/translate` | 🟦 |
| Grammar | t5-small tune | 🟠 ~60MB | Chrome API competes | `@cunny-ai/grammar` | 🟦 |
| Moderation | small tunes | 🟡 15–60MB | Chat, UGC | `@cunny-ai/moderate` | 🟦 |
| Tokenizer | wasm tokenizers | 🟢 1–2MB | Infra | `@cunny-ai/tokenizer` | 🟦 |
| Toy LLM | SmolLM2-135M q4 | 🟠 ~75MB | Toy grade | `@cunny-ai/llm-mini` | 🟦 |

## Multimodal

| Task | Model | Size | Detail | Package | Impact |
|---|---|---|---|---|---|
| Image text search | CLIP ViT-B/32 | 🟠 40–75MB | Photo search by text | `@cunny-ai/clip` | 🟥 |
| Image dedupe | pHash | ⚪ 0MB | Classical | `@cunny-ai/img-dedupe` | 🟨 |
| Audio embedding | CLAP-small | 🟠 ~90MB | Sound similarity | `@cunny-ai/clap` | 🟦 |

## Classical, always bundled (⚪)

| Task | Detail | Package |
|---|---|---|
| Barcode / QR | Native API first, ZXing fallback | `@cunny-ai/barcode` |
| Pitch tracking | pYIN, vocal training | `@cunny-ai/pitch` |
| BPM / beat | DSP | `@cunny-ai/bpm` |
| Chords | DSP | `@cunny-ai/chords` |
| Landmark smoothing | One Euro filter | `@cunny-ai/smooth` |

## Combos

| Task | Built from | Package | Impact |
|---|---|---|---|
| Multi object tracking | detect + ByteTrack | `@cunny-ai/track` | 🟥 |
| Live captions | vad + stt-live | `@cunny-ai/captions` | 🟥 |
| Voice assistant | wakeword + captions + tts | `@cunny-ai/assistant` | 🟨 |
| Rep counting | pose + heuristics | `@cunny-ai/rep-count` | 🟨 |
| Fall detection | pose + velocity | `@cunny-ai/fall-detect` | 🟦 |

## Custom models

`@cunny-ai/custom` takes `{ modelUrl, taskType }` and gives any fine tuned YOLO, YAMNet or small BERT the same loading, caching and worker treatment. Covers plant disease ID, food recognition, parking occupancy and similar long tails without per package maintenance. Medical uses are out of scope.

## Out of scope (over 100MB or server side)

Image generation, captioning, VQA, Whisper medium and larger, NLLB, Demucs, chat grade LLMs, all training and fine tuning.
