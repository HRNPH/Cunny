/**
 * @cunny-ai/embed — local text embeddings (bge-small q8, ~23MB, cached).
 * transformers.js is a private implementation detail (architecture.md Rule 4, builtin policy).
 */
import { listModels, resolveModel } from '@cunny-ai/core'

const TASK = 'embed'
const DIMS: Record<string, number> = { 'bge-small': 384, 'minilm-l6': 384 }
/** bge retrieval query prefix — applied when `forQuery: true`, never for passages. */
const BGE_QUERY_PREFIX = 'Represent this sentence for searching relevant passages: '

export type EmbedInput = string | string[]

export interface EmbedOptions {
  model?: string
  /** Use the retrieval query prefix (bge). Only for search queries, never for indexed docs. */
  forQuery?: boolean
  acceleration?: 'auto' | 'wasm' | 'webgpu'
  onProgress?: (info: { loaded: number; total: number; file?: string }) => void
}

type FeaturePipeline = (text: string[], opts: { pooling: 'cls'; normalize: boolean }) => Promise<{ data: Float32Array; dims: number[] }>

const pipelines = new Map<string, Promise<FeaturePipeline>>()

async function getPipeline(model: string | undefined, opts: EmbedOptions = {}): Promise<{ pipe: FeaturePipeline; modelId: string }> {
  const { modelId, entry } = resolveModel(TASK, model)
  const cached = pipelines.get(modelId)
  if (cached) return { pipe: await cached, modelId }

  const p = (async () => {
    const { pipeline, env } = await import('@huggingface/transformers')
    env.allowLocalModels = false
    const device = opts.acceleration === 'webgpu' ? 'webgpu' : 'wasm'
    return pipeline('feature-extraction', entry.repo!, {
      dtype: 'q8',
      device,
      progress_callback: (e: { status: string; loaded?: number; total?: number; file?: string }) => {
        if (e.status === 'progress' && opts.onProgress && e.total) {
          opts.onProgress({ loaded: e.loaded ?? 0, total: e.total, file: e.file })
        }
      },
    }) as unknown as FeaturePipeline
  })()
  pipelines.set(modelId, p)
  return { pipe: await p, modelId }
}

/**
 * Embed text(s) → normalized vectors (cosine similarity = dot product).
 * ```ts
 * const [v] = await embed('the cat sat on the mat')
 * ```
 */
export async function embed(input: EmbedInput, opts: EmbedOptions = {}): Promise<Float32Array[]> {
  const texts = Array.isArray(input) ? input : [input]
  if (opts.forQuery && texts.length && textUsesBgePrefix(opts.model)) {
    texts[0] = BGE_QUERY_PREFIX + texts[0]
  }
  const { pipe } = await getPipeline(opts.model, opts)
  const out = await pipe(texts, { pooling: 'cls', normalize: true })
  const dim = out.dims.at(-1) ?? DIMS[resolveModel(TASK, opts.model).modelId] ?? 384
  const vectors: Float32Array[] = []
  for (let i = 0; i < texts.length; i++) {
    vectors.push(out.data.slice(i * dim, (i + 1) * dim))
  }
  return vectors
}

function textUsesBgePrefix(model?: string): boolean {
  return resolveModel(TASK, model).modelId.startsWith('bge')
}

/** Cosine similarity of two normalized vectors (dot product). */
export function cosine(a: Float32Array, b: Float32Array): number {
  let s = 0
  for (let i = 0; i < a.length; i++) s += a[i] * b[i]
  return s
}

/** Top-k matches of `query` against `corpus` (array of normalized vectors). */
export function topK(query: Float32Array, corpus: Float32Array[], k = 5): Array<{ index: number; score: number }> {
  return corpus
    .map((v, index) => ({ index, score: cosine(query, v) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, k)
}

export function models() {
  return listModels(TASK)
}
