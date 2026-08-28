# 010, `@cunny-ai/vector`

| | |
|---|---|
| Package | `@cunny-ai/vector` |
| Phase | 2, RAG & vision depth |
| Status | spec |
| Depends on | `@cunny-ai/core` |
| Model | none (algorithms), sqlite-vec wasm as optional backend |
| Weights | ⚪ pure-TS backend / ~600KB wasm for sqlite backend |
| License | MIT (own code), Apache-2.0 (sqlite-vec) |

## Why

Embeddings without storage is a demo; embeddings + local vector store is **edge RAG**, "search my notes/files/history, fully offline." This is the package that makes 002 `embed` a product instead of a primitive.

## Scope

**In:**

- `createVectorStore({ dim, backend: 'memory' | 'sqlite' })`
- `add(id, vector, meta?)`, `addMany(...)`, `search(query, { k, filter })`, filter = metadata predicate
- **memory backend:** pure TypeScript typed-array brute force, zero deps, instant, fine to ~50k vectors
- **sqlite backend:** sqlite-vec wasm + OPFS persistence, survives reload, supports SQL-ish metadata filters
- `persist(name)` / `load(name)` (sqlite backend)
- `remove(id)`, `size`, `clear()`
- Cosine / dot / euclidean distance options (cosine default, matches embed's normalized output)

## API sketch

```ts
import { createVectorStore } from '@cunny-ai/vector'
import { embed } from '@cunny-ai/embed'

const store = createVectorStore({ dim: 384 })            // memory backend
for (const doc of docs) store.add(doc.id, (await embed(doc.text))[0], { title: doc.title })
const hits = store.search((await embed('payment dispute'))[0], { k: 5 })
// [{ id, score, meta }]
```

## Decisions

- **Brute force by design:** at 384 dims, 50k vectors scan in <10ms with typed arrays. No HNSW complexity until benchmarks say otherwise, hnswlib-wasm becomes a third backend only if users hit 100k+ scale
- Distance scores normalized to "higher = better" everywhere (cosine similarity), one convention across the SDK
- sqlite-vec wasm loaded lazily only when `backend: 'sqlite'` is chosen, memory backend pulls zero bytes

## Acceptance criteria

- [ ] memory: 10k adds < 300ms; search p95 < 10ms @ 50k × 384d
- [ ] sqlite: store survives full reload via OPFS (fixture test)
- [ ] Filtered search correctness on mixed metadata (unit tests)
- [ ] Deterministic top-k ordering (ties broken by id)

## Risks

- OPFS browser support matrix (Safari quirks), IndexedDB blob fallback path for persistence
- sqlite-vec wasm API churn, pin version, adapter isolated in one file
