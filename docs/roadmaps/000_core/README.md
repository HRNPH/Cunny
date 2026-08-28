# 000, `@cunny-ai/core`

| | |
|---|---|
| Package | `@cunny-ai/core` |
| Phase | 0, Foundation |
| Status | spec |
| Depends on | — |
| Used by | every task package |
| Size | ⚪ no model weights |

## Why first

Every task package needs the same five things and currently every dev hand-rolls them badly: backend selection, model download + cache, worker offloading, session lifecycle, and progress reporting. Core is where the "no config, with escape hatches" promise lives. Nothing else ships until this is stable.

## Scope

**In:**

- Backend detection & selection (WebGPU → WASM SIMD → plain WASM), with `crossOriginIsolated` check for multithreaded WASM
- Model registry: versioned JSON manifest (model id, provider, files, sha256, quantization variants, license, size)
- Download + cache layer: Cache API with IndexedDB fallback, progress events, concurrent-request dedupe
- Worker host: Comlink-based RPC, one shared worker pool, transferable-friendly tensor types
- Session pool: LRU eviction, explicit `.dispose()`, memory budget hints
- Error taxonomy: typed errors (`BackendUnavailableError`, `ModelChecksumError`, `AbortedError`…)
- Tiny event emitter for load/progress/ready lifecycle

**Out:**

- Any task logic (pre/post-processing), lives in task packages
- Any UI, any framework bindings
- Weight hosting infra itself (core only *resolves* URLs; the manifest points at CDN/HF)

## API sketch

```ts
import { createEngine } from '@cunny-ai/core'

const engine = await createEngine({
  backend: 'auto',            // 'auto' | 'webgpu' | 'wasm'
  workers: 1,                 // inference worker count
  modelBase: undefined,        // override manifest origin (self-host)
})

// resolve a model by task id + variant, cached after first download
const model = await engine.loadModel('bg-remove/selfie-seg', {
  variant: 'default',         // 'default' | 'fp16' | 'q8' | 'q4' (per-model)
  onProgress: (p) => setBar(p), // { loaded, total, url }
})

// create an inference session (provider-specific under the hood)
const session = await model.createSession()
const result = await session.run(feeds)

engine.report() // { backend, webgpu: bool, simd: bool, threads: n, cacheSize }
```

## Model manifest format (v2, multi-model per task)

Amended per [`../../architecture.md`](../../architecture.md): the registry maps **task → models → variants**, with tier aliases and provider-package resolution. One source of truth for `models()` metadata, docs tables, and CI size gates.

```jsonc
{
  "tasks": {
    "face-detect": {
      "defaultModel": "blazeface-short",
      "models": {
        "blazeface-short": {
          "provider": "@cunny-ai/provider-mediapipe",  // provider PACKAGE, never a direct runtime dep
          "tiers": ["fast", "balanced"],
          "license": "Apache-2.0",
          "variants": {
            "fp16": { "url": "https://cdn.../selfie.tflite", "sha256": "…", "bytes": 450_000 }
          }
        },
        "scrfd-500m": {
          "provider": "@cunny-ai/provider-onnx",
          "tiers": ["quality"],
          "license": "MIT",
          "variants": { "q8": { "url": "…", "sha256": "…", "bytes": 2_500_000 } }
        }
      }
    }
  }
}
```

`loadModel('face-detect', { model: 'quality' })` resolves tier alias → model → default variant. Model = architecture/weights; variant = precision of those weights. Adapters for non-default models dynamic-import from the task package on first use.

## Provider seam (TaskAdapter)

```ts
interface TaskAdapter<I, O> {
  readonly modelId: string
  prepare(input: I): Promise<TensorFeed[]>
  run(feeds: TensorFeed[]): Promise<TensorFeed[]>
  convert(raw: TensorFeed[], ctx: InputCtx): O  // normalizes to TASK output types
}
```

Core resolves `model → provider package`, verifies availability (optional peer dep installed?), and hands the task a session factory. Missing provider ⇒ typed error with the exact `npm i` command. Runtime wasm resolution + version pinning lives **only** in provider packages, core stays dependency-free.

## Decisions

- **ONNX Runtime Web and MediaPipe runtimes are wrapped by provider packages** (`@cunny-ai/provider-mediapipe`, `@cunny-ai/provider-onnx`); tasks and core never import them. Dedupe boundary: one pin, one 3 to 11MB wasm download per browser, shared across every task.
- **Bundle rule implemented here:** manifest entries may declare `"bundled": true` (≤1MB only), resolved from package assets instead of network.
- **Text tokenizers:** tasks that need them (embed, stt, clip) may internally use transformers.js **inside their adapter code**, same hidden-dependency policy as the spike; the provider seam still applies to model execution.

## Acceptance criteria

- [ ] Backend report correct on Chrome/Safari/Firefox (+ Safari WebGPU absence handled)
- [ ] Second load of any model served from cache, zero network
- [ ] sha256 mismatch → `ModelChecksumError`, cache poisoned-entry evicted
- [ ] Same model requested concurrently (5×) → one download, five subscribers
- [ ] Worker roundtrip < 1ms overhead vs main-thread run
- [ ] Kit: `pnpm test:integration` green on browser matrix via Playwright

## Risks

- ORT Web version churn (WASM binary size + breaking API changes), pin versions, vendor files in registry
- COOP/COEP requirement for multithreaded WASM, detect and degrade to single-thread silently, surface in `report()`
- Safari Cache API quirks with opaque responses, IndexedDB fallback path must be tested early
