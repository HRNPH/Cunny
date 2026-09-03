# 013, `@cunny-ai/clip`

| | |
|---|---|
| Package | `@cunny-ai/clip` |
| Phase | 2, RAG & vision depth |
| Status | spec |
| Depends on | `@cunny-ai/core` |
| Model | TinyCLIP (39M, q8 ~40MB) default · CLIP ViT-B/32 (151M, q4 ~76MB) opt-in |
| Weights | 🟠 40–76MB |
| License | MIT |

## Why

"Search my photos by typing 'sunset beach'" with zero server. The single most demoable consumer feature in the catalog. CLIP's dual-encoder design maps text and images into one space, we wrap the plumbing (two embed paths, normalization, similarity) behind three functions.

## Scope

**In:**

- `embedImage(bitmap | Blob | …)` → normalized vector; `embedText(str)` → same space
- `search(query, images)`, query is text **or** an image (find similar photos)
- `classify(image, labels)`, zero-shot over caller-provided labels, no training
- Image index helpers: batch embed with progress, store via `@cunny-ai/vector` (optional peer dep)
- Preprocessing internalized (224px resize, CLIP normalization, tokenizer)

**Out:**

- Captioning (out of budget, docs say so explicitly), training/fine-tuning (forever out)

## API sketch

```ts
import { classify, search } from '@cunny-ai/clip'

await classify(photoBlob, ['a receipt', 'a meme', 'a selfie', 'a document'])
// [{ label: 'a receipt', score: 0.91 }, …]

await search('sunset over water', photoBitmaps, { k: 10 })
```

## Decisions

- **Default = TinyCLIP q8** (~40MB, solid on everyday labels) to stay comfortably under budget; ViT-B/32 q4 is the quality opt-in at 76MB
- transformers.js internally for tokenizer + both towers (same private-dep policy as embed/stt)
- WebGPU recommended but WASM-functional, image embedding is the expensive side, batch sizes capped on WASM with honest docs

## Acceptance criteria

- [ ] Zero-shot top-1 ≥ 90% on a fixed 30-image everyday-object fixture (curated, everyday objects)
- [ ] Text↔image retrieval: expected image in top-3 for ≥ 80% of 20 fixture queries
- [ ] 100-image batch embed with progress events, no main-thread jank

## Risks

- TinyCLIP weakness on abstract queries, docs include a "what it's bad at" section (honesty > demos that lie)
- q4 quality loss on ViT-B/32, fixture tests run on both variants


## Verification

2026-09-03, manual pass by the maintainer in a desktop browser: zero-shot classification ran against the full clip-vit-base-patch32 q8 pair (89MB first load). Automated smoke in the embedded webview was blocked by the large conv-model wasm compile; desktop browsers compile it fine.
