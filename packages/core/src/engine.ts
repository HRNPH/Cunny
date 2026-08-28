import { fetchModel } from './loader.js'
import { resolveModel } from './registry.js'
import type {
  Engine, EngineOptions, EngineReport, LoadOptions, LoadedModel,
} from './types.js'

/**
 * Create an engine — the model-loading heart of every `@cunny-ai/*` package.
 *
 * Usually you never call this directly: task packages use the shared default
 * engine. Reach for `createEngine` when you want an isolated loader (e.g. a
 * self-hosted `modelBase`, or separate cache reporting per feature).
 *
 * @example
 * ```ts
 * import { createEngine } from '@cunny-ai/core'
 *
 * const engine = createEngine({ modelBase: 'https://my-cdn.example.com/models' })
 * const model = await engine.loadModel('face-detect', {
 *   model: 'balanced', // tier alias — or an exact model id, or omit for default
 *   onProgress: ({ loaded, total }) => setBar(loaded / total),
 * })
 * engine.report() // { models: [...], cacheBackend: 'cache-api' }
 * ```
 */
export function createEngine(options: EngineOptions = {}): Engine {
  const loaded: Array<{ taskId: string; modelId: string; byteLength: number; cached: boolean }> = []

  return {
    async loadModel(taskId: string, opts: LoadOptions = {}): Promise<LoadedModel> {
      const { modelId, entry } = resolveModel(taskId, opts.model)
      const variantName = opts.variant ?? entry.defaultVariant
      const variant = entry.variants[variantName]
      if (!variant) {
        throw new Error(`@cunny-ai/core: model "${modelId}" has no variant "${variantName}"`)
      }
      if (!variant.url) {
        throw new Error(`@cunny-ai/core: model "${modelId}" has no downloadable weights (native/builtin handled by the task package)`)
      }
      // Builtin (transformers.js) models fetch through their own pipeline; core's loader
      // is for byte-level providers (mediapipe tflite, onnx weights).
      if (entry.provider === 'builtin') {
        const empty = { taskId, modelId, variant: variantName, bytes: new ArrayBuffer(0), byteLength: 0, cached: true, license: entry.license, provider: entry.provider }
        return empty
      }

      const { bytes, cached } = await fetchModel(variant.url, {
        onProgress: opts.onProgress,
        signal: opts.signal,
      })

      // TODO(000 spec): verify variant.sha256 once hashes are pinned in the registry.
      const model: LoadedModel = {
        taskId, modelId, variant: variantName,
        bytes, byteLength: bytes.byteLength, cached,
        license: entry.license, provider: entry.provider,
      }
      loaded.push({ taskId: model.taskId, modelId: model.modelId, byteLength: model.byteLength, cached })
      return model
    },

    report(): EngineReport {
      return {
        models: [...loaded],
        cacheBackend: typeof caches !== 'undefined' ? 'cache-api' : 'none',
      }
    },
  }
}

let defaultEngine: Engine | undefined

/** Shared engine used by task packages' one-shot APIs (detect(), embed(), …). */
export function getDefaultEngine(): Engine {
  defaultEngine ??= createEngine()
  return defaultEngine
}
