/**
 * @cunny-ai/core — the only shared dependency of every task package.
 *
 * It holds the model registry (task to models to variants, with
 * fast/balanced/quality tier aliases), the Cache API download layer with dedupe
 * and progress events, and the engine: createEngine/getDefaultEngine, loadModel
 * with model/variant/onProgress, and report(). The package is ~2KB of code and
 * zero model bytes; resolveModel and listModels are also exported. setWasmBase
 * on providers pairs with createEngine({ modelBase }) for self hosting.
 *
 * @example
 * ```ts
 * import { createEngine, listModels } from '@cunny-ai/core'
 *
 * listModels('face-detect') // see what a task offers before downloading anything
 * const engine = createEngine({ modelBase: 'https://my-cdn.example.com/models' })
 * const model = await engine.loadModel('face-detect', {
 *   model: 'balanced', // tier alias, an exact model id, or omit for default
 *   onProgress: ({ loaded, total }) => setBar(loaded / total),
 * })
 * engine.report() // { models: [...], cacheBackend: 'cache-api' }
 * ```
 */
export { CunnyAIError, DownloadError, ModelNotFoundError, ProviderMissingError } from './errors.js'
export type {
  Engine, EngineOptions, EngineReport, InputCtx, LoadOptions, LoadedModel,
  ModelEntry, ModelInfo, ModelVariant, ProgressInfo, ProviderKind, TaskAdapter,
  TaskEntry, Tier,
} from './types.js'
export { TASKS, listModels, resolveModel } from './registry.js'
export { createEngine, getDefaultEngine } from './engine.js'
