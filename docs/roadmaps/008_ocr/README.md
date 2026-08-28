# 008, `@cunny-ai/ocr`

| | |
|---|---|
| Package | `@cunny-ai/ocr` |
| Phase | 1, Launch Nine |
| Status | spec |
| Depends on | `@cunny-ai/core` |
| Model | PaddleOCR v4 mobile, det (dbnet ~4.8MB) + per-language rec (CRNN/SVTR ~10MB) + charset dicts |
| Weights | 🟡 ~15MB English, +~10MB per extra language |
| License | Apache-2.0 |

## Why

OCR is the highest-value document task and today's browser options are: Tesseract.js (slow, dated accuracy), cloud APIs (server + cost + privacy), or porting PaddleOCR's det+rec pipeline to ONNX, which takes several weeks. We do it once; every user gets one import.

First pure ONNX pipeline in the SDK, no mediapipe, no transformers.js. Owns its pre and post processing: DB postprocess, CTC decode, reading order layout. Hardest module in phase 1, scheduled last.

## Scope

**In:**

- `ocr(source, { languages: ['en'] })` → `{ lines: [{ text, box, confidence }], elapsedMs }`
- Detection: DBNet mobile @ 960px max side
- Recognition: cropped box → 48px-height normalized → CRNN/SVTR → CTC greedy decode
- Line sorting in reading order (top-to-bottom, column-aware v1.1)
- Lazy per-language recognition models + charset dicts
- Rotation handling for 90°/270° (det box orientation heuristic)

**Out:**

- Handwriting (058), table structure (057), layout analysis (059), PDF parsing (user brings pdf.js, example provided)

## API sketch

```ts
import { ocr } from '@cunny-ai/ocr'

const { lines } = await ocr(screenshotBlob, { languages: ['en'] })
// [{ text: "Total: $42.50", box: {…}, confidence: 0.97 }, …]
```

## Decisions

- **Skip the classifier stage v1** (0°/180° detection via det-box aspect heuristic); add cls model only if fixtures prove it's needed
- Det/rec weights from the onnx-community PaddleOCR exports; charset dict shipped as JSON in the registry (not embedded in package)
- Tesseract.js stays out, different architecture, worse accuracy/size trade; revisit only for exotic scripts

## Acceptance criteria

- [ ] Character accuracy ≥ 90% on a fixed 20-image fixture (receipts, screenshots, scans, signage)
- [ ] DB postprocess matches reference boxes (IoU > 0.85) on golden images
- [ ] English pipeline total download ≤ 20MB; second language adds ≤ 12MB, lazy
- [ ] 1MP screenshot processed < 3s WASM worker

## Risks

- DB decode subtleties (unclip coefficient, minAreaRect on rotated text), golden tests with reference outputs are non-negotiable
- Per-language model sprawl, registry must lazy-load strictly per requested language
- This is the module most likely to reveal "we need a real ONNX provider layer in core", if so, that work lands here and core absorbs it
