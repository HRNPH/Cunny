import type { CunnyAIError, DownloadError, ModelNotFoundError, ProviderMissingError } from './errors.js'

export type { CunnyAIError, DownloadError, ModelNotFoundError, ProviderMissingError }

/** Quality/perf tier aliases — every task curates what these resolve to. */
export type Tier = 'fast' | 'balanced' | 'quality'

/** Progress reported while a model downloads (never fires for cache hits beyond a single done event). */
export interface ProgressInfo {
  loaded: number
  /** Total bytes when the server sent content-length, otherwise 0 (unknown). */
  total: number
}

export type ProviderKind =
  | '@cunny-ai/provider-mediapipe'
  | '@cunny-ai/provider-onnx'
  | 'builtin' // transformers.js / kokoro-js riding inside task adapter code (architecture.md, Rule 4)

export interface ModelVariant {
  url: string
  sha256?: string
  approxBytes?: number
  /** Asset path within the task package for bundled (≤1MB) models. */
  bundled?: string
}

export interface ModelEntry {
  /** Provider package that can execute this model. */
  provider: ProviderKind
  tiers: Tier[]
  license: string
  defaultVariant: string
  variants: Record<string, ModelVariant>
  /** HF repo id for builtin (transformers.js) models. */
  repo?: string
  notes?: string
}

export interface TaskEntry {
  defaultModel: string
  models: Record<string, ModelEntry>
}

export interface ModelInfo {
  id: string
  tier: Tier | 'default'
  provider: ProviderKind
  license: string
  sizeMB: number
  notes?: string
}

export interface LoadOptions {
  /** Exact model id or tier alias ('fast' | 'balanced' | 'quality'). Default = task default. */
  model?: string
  /** Quantization variant override. Default = model default. */
  variant?: string
  onProgress?: (info: ProgressInfo) => void
  signal?: AbortSignal
  /** Override the manifest's URL for this load (self-hosted weights, tests). */
  urlOverride?: string
}

export interface LoadedModel {
  taskId: string
  modelId: string
  variant: string
  bytes: ArrayBuffer
  byteLength: number
  cached: boolean
  license: string
  provider: ProviderKind
}

export interface EngineOptions {
  /** Replace the origin of all manifest URLs (self-hosted weights). */
  modelBase?: string
}

export interface EngineReport {
  models: Array<{ taskId: string; modelId: string; byteLength: number; cached: boolean }>
  cacheBackend: 'cache-api' | 'none'
}

export interface Engine {
  /** Download (or pull from cache) a model by task id. Concurrent calls for the same URL share one download. */
  loadModel(taskId: string, opts?: LoadOptions): Promise<LoadedModel>
  report(): EngineReport
}

/**
 * The seam between providers (L2) and task packages (L3) — see architecture.md Rule 2.
 * One adapter per model; adapters normalize raw output into the TASK's types.
 */
export interface TaskAdapter<I, O> {
  readonly modelId: string
  prepare(input: I): Promise<unknown>
  run(prepared: unknown): Promise<unknown>
  convert(raw: unknown, ctx: InputCtx): O
}

export interface InputCtx {
  width: number
  height: number
}
