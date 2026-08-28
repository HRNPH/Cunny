import { beforeEach, describe, expect, it, vi } from 'vitest'

interface FeatureOutput {
  data: Float32Array
  dims: number[]
}

const hf = vi.hoisted(() => {
  const state = {
    env: { allowLocalModels: true },
    pipelineCalls: [] as Array<{ task: string; repo: string; opts: Record<string, unknown> }>,
    batchCalls: [] as Array<{ texts: string[]; opts: Record<string, unknown> }>,
    pipelineError: null as Error | null,
    impl: async (_texts: string[]): Promise<FeatureOutput> => ({ data: new Float32Array(), dims: [] }),
  }
  return state
})

vi.mock('@huggingface/transformers', () => ({
  env: hf.env,
  pipeline: async (task: string, repo: string, opts: Record<string, unknown>) => {
    hf.pipelineCalls.push({ task, repo, opts })
    if (hf.pipelineError) throw hf.pipelineError
    return (texts: string[], callOpts: Record<string, unknown>) => {
      hf.batchCalls.push({ texts, opts: callOpts })
      return hf.impl(texts)
    }
  },
}))

/** Fresh module instance per test (pipeline cache lives at module scope); core is re-imported in the same registry so instanceof works. */
const load = async () => {
  const mod = await import('./index.js')
  const { ModelNotFoundError } = await import('@cunny-ai/core')
  return { ...mod, ModelNotFoundError }
}

/** Unit vector at angle acos(cos) in 2D — dot of two such "table" vectors gives the raw cosine. */
const vec = (cos: number): number[] => [cos, Math.sqrt(1 - cos * cos)]

/** Embedding table: each text maps to a fixed normalized vector fed back through the fake pipeline. */
const useVectors = (table: Record<string, number[]>) => {
  hf.impl = async (texts) => ({
    data: new Float32Array(texts.flatMap((t) => table[t])),
    dims: [texts.length, table[texts[0]].length],
  })
}

beforeEach(() => {
  vi.resetModules()
  hf.env.allowLocalModels = true
  hf.pipelineCalls.length = 0
  hf.batchCalls.length = 0
  hf.pipelineError = null
  hf.impl = async (texts) => ({ data: new Float32Array(texts.length * 2), dims: [texts.length, 2] })
})

describe('similarity metadata', () => {
  it('lists the bge-small registry entry', async () => {
    const { models } = await load()
    const list = models()
    expect(list.map((m) => m.id)).toEqual(['bge-small'])
    expect(list[0]).toMatchObject({ tier: 'default', provider: 'builtin', license: 'MIT', sizeMB: 24 })
  })
})

describe('similarity pipeline wiring', () => {
  it('creates the feature-extraction pipeline quantized on wasm and disables local models', async () => {
    const { similarity } = await load()
    await similarity('a', 'b')
    expect(hf.pipelineCalls.length).toBe(1)
    expect(hf.pipelineCalls[0].task).toBe('feature-extraction')
    expect(hf.pipelineCalls[0].repo).toBe('Xenova/bge-small-en-v1.5')
    expect(hf.pipelineCalls[0].opts).toMatchObject({ dtype: 'q8', device: 'wasm' })
    expect(hf.env.allowLocalModels).toBe(false)
  })

  it('maps webgpu acceleration to the webgpu device', async () => {
    const { similarity } = await load()
    await similarity('a', 'b', { acceleration: 'webgpu' })
    expect(hf.pipelineCalls[0].opts.device).toBe('webgpu')
  })

  it('defaults to wasm for auto/wasm acceleration', async () => {
    const { similarity } = await load()
    await similarity('a', 'b', { acceleration: 'auto' })
    expect(hf.pipelineCalls[0].opts.device).toBe('wasm')
  })

  it('embeds both texts in a single batch with cls pooling and normalization', async () => {
    const { similarity } = await load()
    await similarity('first', 'second')
    expect(hf.batchCalls).toEqual([
      { texts: ['first', 'second'], opts: { pooling: 'cls', normalize: true } },
    ])
  })

  it('reuses one pipeline across calls', async () => {
    const { similarity, pairwise } = await load()
    await similarity('a', 'b')
    await pairwise(['a', 'b', 'c'])
    expect(hf.pipelineCalls.length).toBe(1)
  })

  it('splits the flat embedding output per text using the trailing dim, defaulting to 384', async () => {
    const { similarity } = await load()
    // No dims reported: dim falls back to 384; two unit vectors at offset 0 → cosine 1.
    const data = new Float32Array(2 * 384)
    data[0] = 1
    data[384] = 1
    hf.impl = async () => ({ data: data.slice(), dims: [] as number[] })
    await expect(similarity('a', 'b')).resolves.toBeCloseTo(1)
  })

  it('forwards download progress events, defaulting loaded to 0', async () => {
    const { similarity } = await load()
    const onProgress = vi.fn()
    await similarity('a', 'b', { onProgress })
    const cb = hf.pipelineCalls[0].opts.progress_callback as (e: Record<string, unknown>) => void
    cb({ status: 'progress', loaded: 10, total: 20, file: 'model.onnx' })
    cb({ status: 'progress', total: 20 })
    cb({ status: 'done', loaded: 1, total: 2 })
    expect(onProgress.mock.calls).toEqual([
      [{ loaded: 10, total: 20, file: 'model.onnx' }],
      [{ loaded: 0, total: 20, file: undefined }],
    ])
  })
})

describe('calibration math (raw cosine → 0…1 score)', () => {
  it('returns 1 for identical texts', async () => {
    const { similarity } = await load()
    useVectors({ a: [1, 0] })
    await expect(similarity('a', 'a')).resolves.toBeCloseTo(1)
  })

  it('maps raw cosine 0.65 to a calibrated 0.5', async () => {
    const { similarity } = await load()
    useVectors({ a: [1, 0], b: vec(0.65) })
    await expect(similarity('a', 'b')).resolves.toBeCloseTo(0.5)
  })

  it('maps the CAL_LO boundary (cos 0.5) to exactly 0', async () => {
    const { similarity } = await load()
    useVectors({ a: [1, 0], b: vec(0.5) })
    await expect(similarity('a', 'b')).resolves.toBeCloseTo(0)
  })

  it('maps a measured paraphrase pair (cos 0.742) into paraphrase territory', async () => {
    const { similarity } = await load()
    useVectors({ a: [1, 0], b: vec(0.742) })
    await expect(similarity('a', 'b')).resolves.toBeCloseTo(0.807, 2)
  })

  it('clamps cosines below CAL_LO (and negatives) to 0', async () => {
    const { similarity } = await load()
    useVectors({ a: [1, 0], low: vec(0.3), neg: [-1, 0] })
    await expect(similarity('a', 'low')).resolves.toBe(0)
    await expect(similarity('a', 'neg')).resolves.toBe(0)
  })
})

describe('pairwise', () => {
  it('returns a symmetric matrix with a unit diagonal', async () => {
    const { pairwise } = await load()
    useVectors({ a: [1, 0], b: vec(0.8), c: [0, 1] })
    const m = await pairwise(['a', 'b', 'c'])
    expect(m.length).toBe(3)
    for (let i = 0; i < 3; i++) {
      expect(m[i][i]).toBeCloseTo(1)
      for (let j = 0; j < 3; j++) expect(m[i][j]).toBeCloseTo(m[j][i])
    }
    // cos(a,b)=0.8 → (0.8−0.5)/0.30 capped at 1; cos(b,c)=0.6 → 0.333…; cos(a,c)=0 → 0.
    expect(m[0][1]).toBeCloseTo(1)
    expect(m[1][2]).toBeCloseTo(0.1 / 0.3)
    expect(m[0][2]).toBe(0)
  })

  it('uses exactly one batched inference for the whole list', async () => {
    const { pairwise } = await load()
    useVectors({ a: [1, 0], b: [0, 1], c: [1, 0] })
    await pairwise(['a', 'b', 'c'])
    expect(hf.batchCalls).toEqual([{ texts: ['a', 'b', 'c'], opts: { pooling: 'cls', normalize: true } }])
  })
})

describe('isParaphrase', () => {
  it('accepts strong matches and rejects middling ones at the default 0.7 threshold', async () => {
    const { isParaphrase } = await load()
    useVectors({ a: [1, 0], strong: vec(0.9), weak: vec(0.65) })
    await expect(isParaphrase('a', 'strong')).resolves.toBe(true) // calibrated 1.0
    await expect(isParaphrase('a', 'weak')).resolves.toBe(false) // calibrated 0.5
  })

  it('honors a custom threshold', async () => {
    const { isParaphrase } = await load()
    useVectors({ a: [1, 0], b: vec(0.65) })
    await expect(isParaphrase('a', 'b', { threshold: 0.4 })).resolves.toBe(true)
    await expect(isParaphrase('a', 'b', { threshold: 0.6 })).resolves.toBe(false)
  })
})

describe('group (union-find over the pairwise matrix)', () => {
  it('clusters near-duplicates and keeps outliers separate', async () => {
    const { group } = await load()
    useVectors({ dup1: [1, 0], dup2: [1, 0], other: [0, 1] })
    const clusters = await group(['dup1', 'dup2', 'other'], { threshold: 0.5 })
    expect(clusters).toEqual([[0, 1], [2]])
  })

  it('merges transitively through a chain even when the ends are below threshold', async () => {
    const { group } = await load()
    // cos(a,b)=0.9 and cos(b,c)≈0.98 pass 0.7; cos(a,c)=0.8 (calibrated 0.556) does not — union-find still joins all three.
    useVectors({ a: [1, 0], b: vec(0.9), c: vec(0.8) })
    const clusters = await group(['a', 'b', 'c'], { threshold: 0.7 })
    expect(clusters).toEqual([[0, 1, 2]])
  })

  it('returns singleton clusters when nothing is similar enough', async () => {
    const { group } = await load()
    useVectors({ a: [1, 0], b: [0, 1] })
    const clusters = await group(['a', 'b'], { threshold: 0.99 })
    expect(clusters).toEqual([[0], [1]])
  })
})

describe('similarity error paths', () => {
  it('rejects unknown models with a typed @cunny-ai error before touching transformers', async () => {
    const { similarity, ModelNotFoundError } = await load()
    const p = similarity('a', 'b', { model: 'nope' })
    await expect(p).rejects.toBeInstanceOf(ModelNotFoundError)
    await expect(p).rejects.toThrow('@cunny-ai:')
    await expect(p).rejects.toMatchObject({ code: 'MODEL_NOT_FOUND' })
    expect(hf.pipelineCalls.length).toBe(0)
  })

  it('surfaces pipeline construction failures', async () => {
    const { similarity } = await load()
    hf.pipelineError = new Error('boom')
    await expect(similarity('a', 'b')).rejects.toThrow('boom')
  })

  it('surfaces inference failures from the pipeline call', async () => {
    const { similarity } = await load()
    hf.impl = async () => {
      throw new Error('inference exploded')
    }
    await expect(similarity('a', 'b')).rejects.toThrow('inference exploded')
  })
})
