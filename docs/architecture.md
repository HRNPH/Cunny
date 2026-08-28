# Architecture

How the SDK supports several models per task behind a small public API with low bundle size.

## Layers

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

Star topology: task packages depend on `@cunny-ai/core` plus at most the provider their default model needs. Tasks never depend on each other. Providers never depend on tasks.

## Rule 1: One API per task, models are options

The task package owns the contract: input types, output types, function names. Swapping models never changes the result shape, the adapter normalizes output into the task types.

```ts
import { detect } from '@cunny-ai/face-detect'

await detect(img)                           // default model
await detect(img, { model: 'quality' })     // tier alias
await detect(img, { model: 'scrfd-500m' })  // exact model id
```

Tier aliases (`fast` / `balanced` / `quality`) resolve through the registry per task:

| Tier | face-detect | ocr | tts |
|---|---|---|---|
| `fast` | blazeface-short (450KB) | paddleocr-mobile-en | native speechSynthesis |
| `balanced` (default) | blazeface-short | paddleocr-mobile-en | kokoro q8 |
| `quality` | scrfd-500m (2.5MB) | paddleocr-server-en* | kokoro fp16 |

Every task exports `models()` returning `[{ id, tier, sizeMB, license, notes }]`.

## Rule 2: Model adapters

An adapter is pre-processing, post-processing and normalization for one model, implementing core's `TaskAdapter`:

```ts
interface TaskAdapter<I, O> {
  readonly modelId: string
  prepare(input: I): Promise<TensorFeed[]>
  run(feeds: TensorFeed[]): Promise<TensorFeed[]>
  convert(raw: TensorFeed[], ctx: InputCtx): O
}
```

Adding a model to a task means one adapter file plus one registry entry. The public API stays unchanged, and adapters for non default models load via dynamic import on first use.

## Rule 3: Registry, task → models → variants

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

Model is the architecture and weights. Variant is the precision of those weights. Every entry carries license and size so `models()` and the docs come from one source.

## Rule 4: Providers are shared, versioned once

This prevents: face-detect pins mediapipe 1.0.1, pose pins 1.1.0, the user downloads the 3MB wasm twice.

- `@cunny-ai/provider-mediapipe` is the only package allowed to depend on `@mediapipe/tasks-vision`. Same for provider-onnx and onnxruntime-web.
- Provider packages own runtime version pinning, wasm URL resolution, session creation and the shared runtime cache (core's cache, keyed by wasm URL, one download per browser).
- Task packages reference providers by package name in the registry. Non default providers are optional peer dependencies. A missing provider produces a typed error with the install command.

## Rule 5: Size budget (enforced in CI)

| Layer | npm install | Runtime |
|---|---|---|
| Task package JS | ≤ 15KB gz each | — |
| Combo package JS | ≤ 30KB gz | — |
| `@cunny-ai/core` | ≤ 25KB gz | — |
| Provider adapter JS | ≤ 50KB gz each | 0 bytes until a model needs it |
| Provider runtimes (wasm) | — | ~3MB mediapipe, ~11MB onnx, once per browser |
| Model weights | — | per chosen model, cached |

CI gates: tarball over 5MB fails, a task depending on another task fails, a task importing a runtime directly fails.

## API contract

1. `npm i @cunny-ai/<task>`, call the one function.
2. Swapping models is one option (`model:`), same import, same result types.
3. Nothing downloads until first inference: model, wasm, adapter.
4. A second task on the same provider adds zero runtime bytes.
5. Packages report progress, size before download, and `models()` metadata.
6. Missing providers produce the exact install command.

## Anti-goals

- No automatic model selection. Tiers are curated statically.
- No plugin marketplace. The registry is curated in this repo. `@cunny-ai/custom` (091) handles user models through the same adapter seam.
- No runtime CDN code loading. Weights and wasm only, hash pinned. Code always comes from npm.
