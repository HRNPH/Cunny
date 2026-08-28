# 002, `@cunny-ai/embed`

| | |
|---|---|
| Package | `@cunny-ai/embed` |
| Phase | 1, Launch Nine |
| Status | spec |
| Depends on | `@cunny-ai/core` |
| Model | BAAI/bge-small-en-v1.5 (q8), fallback MiniLM-L6-v2 |
| Weights | 🟢 ~23MB (q8) |
| License | MIT |

## Why

The backbone of edge RAG: "search my notes / files / history without a server." Embeddings are the highest-leverage text primitive, every downstream package (`search`, `similarity`, `rerank`, `clip`-for-text) reuses this. Today's alternatives are a 90MB transformers.js pull with manual tokenizer wrangling, or an OpenAI key (server + cost + privacy loss). Local embeddings = the privacy pitch writes itself.

## Scope

**In:**

- `embed(text)` / `embed(texts[])` → normalized `Float32Array` (cosine = dot product)
- Model choice: `bge-small` (default), `minilm-l6` (smaller/faster)
- Query vs passage prefix handling (bge `Represent this sentence…` quirk), done *for* the user
- Batched inference with automatic chunking + progress events
- Utilities: `cosine(a, b)`, `topK(query, corpus)`

**Out:**

- Storage/search (010 `@cunny-ai/vector`), multimodal (013 `clip`), reranking (069)

## API sketch

```ts
import { embed, cosine, topK } from '@cunny-ai/embed'

const [a] = await embed('the cat sat on the mat')
const [b] = await embed(['a feline rested on a rug'])

cosine(a, b) // ~0.8

// simple in-memory search, swap in @cunny-ai/vector for persistent scale
const results = topK(a, corpus)
```

## Decisions

- **Provider:** ONNX Runtime Web + wasm tokenizer. Internally we may ride transformers.js' model+tokenizer glue for v1, but it stays a private implementation detail behind our API, swappable without a major version.
- **Default = bge-small q8** (23MB, best quality/MB). MiniLM opt-in for tighter budgets.

## Acceptance criteria

- [ ] STS sanity: cosine ordering on a fixed 20-pair test set matches reference within tolerance
- [ ] 1,000 short docs embedded < 30s on WASM (worker, batched)
- [ ] Same text → byte-identical embedding across reloads (determinism check)
- [ ] SSR-safe import; lazy model fetch on first call only

## Risks

- Tokenizer wasm adds ~2MB, budget it
- bge query/passage prefix subtlety is a classic silent-quality-bug, covered by the STS test above
