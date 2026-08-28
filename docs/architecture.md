# Architecture

How the SDK supports several models per task behind a small public API with low bundle size.

> Status: blueprint. Amends the 000–021 specs where they say "registry" or "provider".

---

## The cake

```
┌──────────────────────────────────────────────────────────────┐
│  L4  COMBOS            search · captions · assistant         │  orchestration only
├──────────────────────────────────────────────────────────────┤
│  L3  TASK PACKAGES     face-detect · ocr · tts · …           │  API contract + pre/post
│                        (one npm package per task)              + model adapters
├──────────────────────────────────────────────────────────────┤
│  L2  PROVIDERS         provider-mediapipe · provider-onnx …  │  runtime glue, shared
│                        (published, versioned once)             wasm, shared versions
├──────────────────────────────────────────────────────────────┤
│  L1  CORE              registry · cache · engine · types     │  no deps, no models
└──────────────────────────────────────────────────────────────┘
```

**Star topology:** task packages depend on `@cunny-ai/core` + at most the provider their default model needs. Tasks never depend on each other. Providers never depend on tasks. No diamonds, no version hell.

## Rule 1, One API per task, models are just options

The task package owns the *contract* (input types, output types, function names). Models are interchangeable implementations of that contract. Swapping models never changes the result shape, the model adapter normalizes raw output into the task's types.

```ts
import { detect } from '@cunny-ai/face-detect'

await detect(img)                        // ① default model, zero thought required
await detect(img, { model: 'quality' })  // ② tier alias, "I don't know model names"
await detect(img, { model: 'scrfd-500m' }) // ③ exact model id, "I know exactly what I want"
```

Three levels of user sophistication, one function. Tier aliases (`fast` / `balanced` / `quality`) resolve through the registry per task, so they mean the right thing everywhere:

| You say | face-detect resolves to | ocr resolves to | tts resolves to |
|---|---|---|---|
| `'fast'` | blazeface-short (450KB) | paddleocr-mobile-en | native `speechSynthesis` |
| `'balanced'` *(default)* | blazeface-short | paddleocr-mobile-en | kokoro q8 |
| `'quality'` | scrfd-500m (2.5MB) | paddleocr-server-en* | kokoro fp16 |

Discoverability is first-class: every task exports `models()` → `[{ id, tier, sizeMB, license, speed, notes }]`, so IDE autocomplete and runtime introspection agree.

## Rule 2: Model adapters

A model adapter = pre-processing + post-processing + output normalization for one model, implementing core's `TaskAdapter` interface:

```ts
// in @cunny-ai/core, the seam between L2 and L3
interface TaskAdapter<I, O> {
  readonly modelId: string
  prepare(input: I): Promise<TensorFeed[]>   // model-specific pre
  run(feeds: TensorFeed[]): Promise<TensorFeed[]>  // via provider session
  convert(raw: TensorFeed[], ctx: InputCtx): O    // normalize to TASK types
}
```

Adding a new model to a task = adding one adapter file + one registry entry. **No changes to the public API, no new package, zero bytes added to any existing bundle** (adapters for non-default models load via dynamic import on first use).

## Rule 3, Registry v2: task → models → variants

```jsonc
{
  "tasks": {
    "face-detect": {
      "defaultModel": "blazeface-short",
      "models": {
        "blazeface-short": {
          "provider": "@cunny-ai/provider-mediapipe",
          "tiers": ["fast", "balanced"],
          "license": "Apache-2.0",
          "variants": { "fp16": { "url": "…", "sha256": "…", "bytes": 450_000 } }
        },
        "scrfd-500m": {
          "provider": "@cunny-ai/provider-onnx",
          "tiers": ["quality"],
          "license": "MIT",
          "variants": {
            "q8":  { "url": "…", "sha256": "…", "bytes": 2_500_000 },
            "fp16": { "url": "…", "sha256": "…", "bytes": 5_100_000 }
          }
        }
      }
    }
  }
}
```

Model = *what architecture/weights*. Variant = *what precision of those weights*. Orthogonal to tiers. Every entry carries license + size so `models()` and the docs table are generated from one source of truth.

## Rule 4, Providers are shared, versioned exactly once

The failure mode this prevents: face-detect pins mediapipe 1.0.1, pose pins 1.1.0 → user downloads the 3MB mediapipe wasm **twice** and gets two copies in `node_modules`.

- `@cunny-ai/provider-mediapipe` is the **only** package allowed to declare `@mediapipe/tasks-vision` as a dependency. Same for provider-onnx ↔ onnxruntime-web.
- Provider packages own: runtime version pinning, wasm base URL resolution, session creation, and the shared-runtime cache (core's cache, keyed by wasm URL, one download per browser, forever, across every task).
- Task packages reference providers by **package name in the registry**, never by direct dependency. Non-default providers are `peerDependencies` marked optional, installing `@cunny-ai/face-detect` pulls only what its default model needs (~provider-mediapipe); choosing `scrfd-500m` without provider-onnx installed yields a copy-pasteable install hint, never a silent CDN fetch.

## Rule 5: Size budget (enforced in CI)

| Layer | Ships in npm install | Loads at runtime |
|---|---|---|
| Task package JS | ≤ 15KB gz each (face-detect today: 4.6KB raw) |, |
| Combo package JS | ≤ 30KB gz |, |
| `@cunny-ai/core` | ≤ 25KB gz |, |
| Provider adapter JS | ≤ 50KB gz each, dynamic-imported | 0 bytes until a model needing it runs |
| Provider runtimes (wasm) |, (fetched from pinned CDN or self-host) | ~3MB mediapipe · ~11MB onnx, **downloaded once per browser, shared by every task** |
| Model weights |, | per chosen model only, cached forever |

Hard CI gates: package tarball > 5MB fails; a task package depending on another task package fails; a task package importing a runtime (e.g. `@mediapipe/tasks-vision`) directly fails, providers only.

## The API contract

1. `npm i @cunny-ai/<task>` then call the one obvious function. It works.
2. Swapping models is **one option** (`model:`), never a different import, never different result types.
3. Nothing downloads until first inference: model, wasm, adapter.
4. Second task on the same provider costs **zero additional runtime bytes** (shared wasm cache).
5. Every package reports what it's doing: progress events, size-before-download, `models()` metadata.
6. Mistakes produce copy-pasteable fixes (missing optional provider → exact install command; wasm model → exact docs link), never stack traces into provider internals.

## Anti-goals (equally important)

- **No auto-model-selection magic.** Tier aliases are curated by us, statically. No "AI picks your model" runtime surprise.
- **No plugin marketplace.** The registry is curated in-repo. `@cunny-ai/custom` (091) is the escape hatch for user models, running through the same TaskAdapter seam.
- **No runtime CDN code-loading.** Weights and wasm only, hash-pinned. Code (adapters/providers) always comes from npm, supply-chain hygiene beats convenience.
