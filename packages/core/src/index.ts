/**
 * @cunny-ai/core — model registry, cached lazy loading, engine lifecycle.
 *
 * Every task package builds on this; application code rarely touches it
 * directly. The two things you might use it for:
 *
 * @example
 * ```ts
 * // 1. See what a task offers before downloading anything
 * import { listModels } from '@cunny-ai/core'
 * listModels('face-detect') // [{ id: 'blazeface-short', tier: 'default', sizeMB: 0.5, ... }]
 *
 * // 2. Self-host all weights behind your own CDN
 * import { createEngine } from '@cunny-ai/core'
 * const engine = createEngine({ modelBase: 'https://my-cdn.example.com/models' })
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
