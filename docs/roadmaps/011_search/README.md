# 011, `@cunny-ai/search`

| | |
|---|---|
| Package | `@cunny-ai/search` |
| Phase | 2, RAG & vision depth |
| Status | spec |
| Depends on | `@cunny-ai/embed` (002), `@cunny-ai/vector` (010), `@cunny-ai/chunk` logic (067, inlined until then) |
| Model | inherits embed's (bge-small q8) |
| Weights | 🟢 ~23MB (embed's) |
| License | MIT |

## Why

The consumer-facing face of edge RAG: `index(myStuff)` → `search('what did I say about X')`. The demo that makes non-devs understand what this SDK is for. Every competitor version of this touches a server.

## Scope

**In:**

- `createSearch({ name? })` → `{ index(items), search(query, { k }), size, clear }`
- Items: strings, `{ text, id, meta }`, or File/Blob **of plain text / md / json** (decode + chunk)
- Chunking: token-window with overlap (defaults tuned for bge's 512-token context)
- Results: `{ id, score, snippet, meta }`, snippet with highlighted match window
- Optional persistence via vector store's sqlite backend (`{ name }`)

**Out:**

- PDF/DOCX parsing (example shows pdf.js integration; parsing libs stay userland), re-ranking (069), images (013 clip)

## API sketch

```ts
import { createSearch } from '@cunny-ai/search'

const search = createSearch()
await search.index(noteFiles)                       // File[] of .md/.txt
const hits = await search.search('quarterly payment terms')
// [{ id, score: 0.78, snippet: "…payment terms are net-45…", meta }]
```

## Decisions

- Chunk size 256 tokens, overlap 32, tuned against bge-small's sweet spot; exposed as options
- Single download story: first `index()` or `search()` pulls embed's model once, progress events surface verbatim
- This package contains no ML code, it is pure orchestration, which is exactly the TanStack move (own the ergonomics layer)

## Acceptance criteria

- [ ] E2E fixture: 100-doc corpus, 20 queries, expected doc in top-3 for ≥ 85% of queries
- [ ] Snippets are human-readable windows (not mid-word truncation)
- [ ] Incremental `index()` calls append without rebuilding

## Risks

- Chunking quality dominates perceived quality, fixture queries adversarial (paraphrases rather than keyword matches)
