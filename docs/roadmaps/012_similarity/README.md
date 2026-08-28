# 012, `@cunny-ai/similarity`

| | |
|---|---|
| Package | `@cunny-ai/similarity` |
| Phase | 2, RAG & vision depth |
| Status | spec |
| Depends on | `@cunny-ai/embed` (002) |
| Model | same as embed (bge-small q8), weights shared via core cache |
| Weights | 🟢 0MB additional (deduped with embed) |
| License | MIT |

## Why

Deduplication, near-duplicate detection, matching, everyday text chores devs currently solve with Levenshtein (wrong tool) or an API. Thin by design: the value is sharing embed's cached weights and exposing calibrated scores instead of raw cosines.

## Scope

**In:**

- `similarity(a, b)` → calibrated 0–1
- `pairwise(texts)` → full score matrix (single batched inference pass per unique text)
- `isParaphrase(a, b, { threshold = 0.75 })`
- `group(texts, { threshold })` → clusters of near-duplicates (union-find over pairwise)

**Out:**

- Cross-encoder reranking (069, different model, higher accuracy, slower), semantic search (011)

## API sketch

```ts
import { similarity, group } from '@cunny-ai/similarity'

await similarity('firefighters battle blaze', 'crew fights building fire') // ~0.75
group(articles, { threshold: 0.8 }) // [[a, d], [b], [c, e, f]]
```

## Decisions

- **Registry-level weight dedupe is the headline feature:** installing both `@cunny-ai/embed` and `@cunny-ai/similarity` costs 23MB once because core's cache keys by URL, and this spec's acceptance test enforces it
- Calibration: raw cosine remapped via a fixed monotonic curve fitted on STS-B so 0.5 means "roughly related", documented with examples

## Acceptance criteria

- [ ] Spearman correlation ≥ 0.80 against a 50-pair STS fixture
- [ ] Weight dedupe verified: embed then similarity → zero additional model network calls
- [ ] 100 texts pairwise in one batched pass (not 10,000 individual embeds)

## Risks

- Calibration curve honesty, docs must show the mapping and its limits rather than imply semantic guarantees
