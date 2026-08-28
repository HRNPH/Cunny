/**
 * @cunny-ai/similarity — calibrated text similarity over the same bge-small repo as @cunny-ai/embed.
 * Same HF URLs → same browser cache → zero additional model download when embed is (or was) used.
 *
 * Calibration: bge cosines cluster unrelated ≈ 0.55–0.65, related ≈ 0.7+, paraphrase ≈ 0.85+.
 * We remap linearly: score = clamp((cos − 0.55) / 0.45) so 0.5 means "roughly related".
 */
import { listModels, resolveModel } from '@cunny-ai/core'

const TASK = 'similarity'
const CAL_LO = 0.55
const CAL_HI = 1.0

export interface SimilarityOptions {
  model?: string
  acceleration?: 'auto' | 'wasm' | 'webgpu'
  onProgress?: (info: { loaded: number; total: number; file?: string }) => void
}

type FeaturePipeline = (text: string[], opts: { pooling: 'cls'; normalize: boolean }) => Promise<{ data: Float32Array; dims: number[] }>

let pipePromise: Promise<FeaturePipeline> | undefined

async function getPipeline(opts: SimilarityOptions = {}): Promise<FeaturePipeline> {
  pipePromise ??= (async () => {
    const { entry } = resolveModel(TASK, opts.model)
    const { pipeline, env } = await import('@huggingface/transformers')
    env.allowLocalModels = false
    return pipeline('feature-extraction', entry.repo!, {
      dtype: 'q8',
      device: opts.acceleration === 'webgpu' ? 'webgpu' : 'wasm',
      progress_callback: (e: { status: string; loaded?: number; total?: number; file?: string }) => {
        if (e.status === 'progress' && opts.onProgress && e.total) {
          opts.onProgress({ loaded: e.loaded ?? 0, total: e.total, file: e.file })
        }
      },
    }) as unknown as FeaturePipeline
  })()
  return pipePromise
}

/** Embed a batch exactly once, returning per-text normalized vectors. */
async function embedAll(texts: string[], opts: SimilarityOptions): Promise<Float32Array[]> {
  const pipe = await getPipeline(opts)
  const out = await pipe(texts, { pooling: 'cls', normalize: true })
  const dim = out.dims.at(-1) ?? 384
  return Array.from({ length: texts.length }, (_, i) => out.data.slice(i * dim, (i + 1) * dim))
}

const calibrate = (cos: number) => Math.min(1, Math.max(0, (cos - CAL_LO) / (CAL_HI - CAL_LO)))

const dot = (a: Float32Array, b: Float32Array) => {
  let s = 0
  for (let i = 0; i < a.length; i++) s += a[i] * b[i]
  return s
}

/** Calibrated similarity of two texts, 0 (unrelated) … 1 (paraphrase). */
export async function similarity(a: string, b: string, opts: SimilarityOptions = {}): Promise<number> {
  const [va, vb] = await embedAll([a, b], opts)
  return calibrate(dot(va, vb))
}

/** Full calibrated score matrix for a list of texts (one batched inference per unique text). */
export async function pairwise(texts: string[], opts: SimilarityOptions = {}): Promise<number[][]> {
  const vecs = await embedAll(texts, opts)
  return vecs.map((a) => vecs.map((b) => calibrate(dot(a, b))))
}

/** Paraphrase test with a calibrated threshold. Default 0.65 ≈ raw cosine 0.84. */
export async function isParaphrase(a: string, b: string, opts: SimilarityOptions & { threshold?: number } = {}): Promise<boolean> {
  return (await similarity(a, b, opts)) >= (opts.threshold ?? 0.65)
}

/** Cluster near-duplicates via union-find over the pairwise matrix. */
export async function group(texts: string[], opts: SimilarityOptions & { threshold?: number } = {}): Promise<number[][]> {
  const t = opts.threshold ?? 0.7
  const m = await pairwise(texts, opts)
  const parent = texts.map((_, i) => i)
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])))
  for (let i = 0; i < texts.length; i++) {
    for (let j = i + 1; j < texts.length; j++) {
      if (m[i][j] >= t) parent[find(i)] = find(j)
    }
  }
  const clusters = new Map<number, number[]>()
  for (let i = 0; i < texts.length; i++) {
    const root = find(i)
    if (!clusters.has(root)) clusters.set(root, [])
    clusters.get(root)!.push(i)
  }
  return [...clusters.values()]
}

export function models() {
  return listModels(TASK)
}
