import { beforeEach, describe, expect, it, vi } from 'vitest'

const hf = vi.hoisted(() => {
  const state = {
    env: { allowLocalModels: true },
    pipelineCalls: [] as Array<{ task: string; repo: string; opts: Record<string, unknown> }>,
    pipeArgs: [] as unknown[],
    pipelineError: null as Error | null,
    inferenceError: null as Error | null,
    depth: { data: new Float32Array(), dims: [] as number[] },
    createdBitmaps: [] as Array<{ closed: boolean }>,
  }
  return state
})

/** Stands in for ImageBitmap: `instanceof ImageBitmap` in the source hits the stubbed global. */
class FakeBitmap {
  width: number
  height: number
  closed = false
  constructor(width = 2, height = 2) {
    this.width = width
    this.height = height
  }
  close() {
    this.closed = true
  }
}

/** Stands in for ImageData so toGrayscale()/toHeatmap() can build pixel buffers in node. */
class FakeImageData {
  width: number
  height: number
  data: Uint8ClampedArray
  constructor(width: number, height: number) {
    this.width = width
    this.height = height
    this.data = new Uint8ClampedArray(width * height * 4)
  }
}

vi.stubGlobal('ImageBitmap', FakeBitmap)
vi.stubGlobal('ImageData', FakeImageData)
vi.stubGlobal('createImageBitmap', async () => {
  const bitmap = new FakeBitmap(2, 2)
  hf.createdBitmaps.push(bitmap)
  return bitmap
})

vi.mock('@huggingface/transformers', () => ({
  env: hf.env,
  pipeline: async (task: string, repo: string, opts: Record<string, unknown>) => {
    hf.pipelineCalls.push({ task, repo, opts })
    if (hf.pipelineError) throw hf.pipelineError
    return async (img: unknown) => {
      hf.pipeArgs.push(img)
      if (hf.inferenceError) throw hf.inferenceError
      return { predicted_depth: { data: hf.depth.data, dims: hf.depth.dims } }
    }
  },
}))

/** Fresh module instance per test (pipeline cache lives at module scope); core is re-imported in the same registry so instanceof works. */
const load = async () => {
  const mod = await import('./index.js')
  const { ModelNotFoundError } = await import('@cunny-ai/core')
  return { ...mod, ModelNotFoundError }
}

const setDepth = (dims: number[], data: number[]) => {
  hf.depth = { data: new Float32Array(data), dims }
}

/** Float32-aware map comparison (1/3 and friends are not exact doubles). */
const expectMap = (map: Float32Array, expected: number[]) => {
  expect(map.length).toBe(expected.length)
  for (let i = 0; i < expected.length; i++) expect(map[i]).toBeCloseTo(expected[i], 5)
}

beforeEach(() => {
  vi.resetModules()
  hf.env.allowLocalModels = true
  hf.pipelineCalls.length = 0
  hf.pipeArgs.length = 0
  hf.pipelineError = null
  hf.inferenceError = null
  hf.depth = { data: new Float32Array(), dims: [] }
  hf.createdBitmaps.length = 0
})

describe('depth metadata', () => {
  it('lists the depth-anything-v2-small registry entry', async () => {
    const { models } = await load()
    const list = models()
    expect(list.map((m) => m.id)).toEqual(['depth-anything-v2-small'])
    expect(list[0]).toMatchObject({ tier: 'default', provider: 'builtin', license: 'Apache-2.0', sizeMB: 25 })
  })
})

describe('depth pipeline wiring', () => {
  it('creates the depth-estimation pipeline quantized on wasm and disables local models', async () => {
    const { depth } = await load()
    const bitmap = new FakeBitmap(2, 2)
    setDepth([1, 2, 2], [0, 1, 2, 3])
    await depth(bitmap)
    expect(hf.pipelineCalls.length).toBe(1)
    expect(hf.pipelineCalls[0].task).toBe('depth-estimation')
    expect(hf.pipelineCalls[0].repo).toBe('onnx-community/depth-anything-v2-small')
    expect(hf.pipelineCalls[0].opts).toMatchObject({ dtype: 'q8', device: 'wasm' })
    expect(hf.env.allowLocalModels).toBe(false)
    expect(hf.pipeArgs).toEqual([bitmap])
    expect(bitmap.closed).toBe(false) // caller-owned bitmap is left open
  })

  it('maps webgpu acceleration to the webgpu device', async () => {
    const { depth } = await load()
    setDepth([1, 2, 2], [0, 1, 2, 3])
    await depth(new FakeBitmap(2, 2), { acceleration: 'webgpu' })
    expect(hf.pipelineCalls[0].opts.device).toBe('webgpu')
  })

  it('reuses one pipeline across calls', async () => {
    const { depth } = await load()
    setDepth([1, 2, 2], [0, 1, 2, 3])
    await depth(new FakeBitmap(2, 2))
    await depth(new FakeBitmap(2, 2))
    expect(hf.pipelineCalls.length).toBe(1)
  })

  it('forwards download progress events, defaulting loaded to 0', async () => {
    const { depth } = await load()
    const onProgress = vi.fn()
    setDepth([1, 2, 2], [0, 1, 2, 3])
    await depth(new FakeBitmap(2, 2), { onProgress })
    const cb = hf.pipelineCalls[0].opts.progress_callback as (e: Record<string, unknown>) => void
    cb({ status: 'progress', loaded: 4, total: 25, file: 'model.onnx' })
    cb({ status: 'progress', total: 25 })
    cb({ status: 'ready' })
    expect(onProgress.mock.calls).toEqual([
      [{ loaded: 4, total: 25, file: 'model.onnx' }],
      [{ loaded: 0, total: 25, file: undefined }],
    ])
  })
})

describe('depth map normalization and upsampling', () => {
  it('min-max normalizes model output to 0…1 at input resolution', async () => {
    const { depth } = await load()
    setDepth([1, 2, 2], [0, 1, 2, 3])
    const res = await depth(new FakeBitmap(2, 2))
    expect(res.width).toBe(2)
    expect(res.height).toBe(2)
    expectMap(res.map, [0, 1 / 3, 2 / 3, 1])
    expect(typeof res.elapsedMs).toBe('number')
    expect(res.elapsedMs).toBeGreaterThanOrEqual(0)
  })

  it('normalizes relative to the model range, not absolute values', async () => {
    const { depth } = await load()
    setDepth([1, 2, 2], [10, 20, 30, 40])
    const res = await depth(new FakeBitmap(2, 2))
    expectMap(res.map, [0, 1 / 3, 2 / 3, 1])
  })

  it('upsamples lower-resolution output to input pixels via nearest neighbor', async () => {
    const { depth } = await load()
    setDepth([1, 1, 2], [0, 1]) // single row, two source columns
    const res = await depth(new FakeBitmap(4, 2))
    expect(res.width).toBe(4)
    expect(res.height).toBe(2)
    expectMap(res.map, [0, 0, 1, 1, 0, 0, 1, 1]) // each source column replicated ×2
  })

  it('returns an all-zero map (no NaNs) for a constant-depth image', async () => {
    const { depth } = await load()
    setDepth([1, 2, 2], [5, 5, 5, 5])
    const res = await depth(new FakeBitmap(2, 2))
    expect(Array.from(res.map)).toEqual([0, 0, 0, 0])
  })
})

describe('subjectBox (nearest decile bounding box)', () => {
  it('boxes the nearest region, normalized to the frame', async () => {
    const { depth } = await load()
    const data = new Array(16).fill(0)
    data[2 * 4 + 2] = 1
    data[2 * 4 + 3] = 1
    data[3 * 4 + 2] = 1
    data[3 * 4 + 3] = 1
    setDepth([1, 4, 4], data)
    const res = await depth(new FakeBitmap(4, 4))
    expect(res.subjectBox).toEqual({ x: 0.5, y: 0.5, width: 0.25, height: 0.25 })
  })

  it('covers the whole frame for uniform depth', async () => {
    const { depth } = await load()
    setDepth([1, 4, 4], new Array(16).fill(7))
    const res = await depth(new FakeBitmap(4, 4))
    expect(res.subjectBox).toEqual({ x: 0, y: 0, width: 0.75, height: 0.75 }) // inclusive pixel bbox
  })
})

describe('toGrayscale / toHeatmap rendering', () => {
  it('renders grayscale pixels from the normalized map with full alpha', async () => {
    const { depth } = await load()
    setDepth([1, 2, 2], [0, 1, 2, 3])
    const res = await depth(new FakeBitmap(2, 2))
    const img = res.toGrayscale()
    expect(img.width).toBe(2)
    expect(img.height).toBe(2)
    expect(Array.from(img.data.slice(0, 4))).toEqual([0, 0, 0, 255])
    expect(Array.from(img.data.slice(4, 8))).toEqual([85, 85, 85, 255])
    expect(Array.from(img.data.slice(8, 12))).toEqual([170, 170, 170, 255])
    expect(Array.from(img.data.slice(12, 16))).toEqual([255, 255, 255, 255])
  })

  it('renders a turbo colormap: farthest pixel is blue, nearest is red', async () => {
    const { depth } = await load()
    setDepth([1, 2, 2], [0, 1, 2, 3])
    const res = await depth(new FakeBitmap(2, 2))
    const img = res.toHeatmap()
    // turbo(0) = (0, 0, 127.5), turbo(1) = (127.5, 0, 0); 127.5 clamps to 128.
    expect(Array.from(img.data.slice(0, 4))).toEqual([0, 0, 128, 255])
    expect(Array.from(img.data.slice(12, 16))).toEqual([128, 0, 0, 255])
  })

  it('produces different pixels for grayscale vs heatmap', async () => {
    const { depth } = await load()
    setDepth([1, 2, 2], [0, 1, 2, 3])
    const res = await depth(new FakeBitmap(2, 2))
    expect(Array.from(res.toGrayscale().data)).not.toEqual(Array.from(res.toHeatmap().data))
  })
})

describe('blob sources', () => {
  it('decodes Blob sources into a bitmap and closes it afterwards', async () => {
    const { depth } = await load()
    setDepth([1, 2, 2], [0, 1, 2, 3])
    const res = await depth(new Blob([new Uint8Array([1])]))
    expect(res.width).toBe(2)
    expect(hf.createdBitmaps.length).toBe(1)
    expect(hf.createdBitmaps[0].closed).toBe(true)
  })
})

describe('depth error paths', () => {
  it('rejects unknown models with a typed @cunny-ai error before loading transformers', async () => {
    const { depth, ModelNotFoundError } = await load()
    const p = depth(new FakeBitmap(2, 2), { model: 'midas' })
    await expect(p).rejects.toBeInstanceOf(ModelNotFoundError)
    await expect(p).rejects.toThrow('@cunny-ai:')
    await expect(p).rejects.toMatchObject({ code: 'MODEL_NOT_FOUND' })
    expect(hf.pipelineCalls.length).toBe(0)
  })

  it('surfaces pipeline construction failures', async () => {
    const { depth } = await load()
    hf.pipelineError = new Error('boom')
    await expect(depth(new FakeBitmap(2, 2))).rejects.toThrow('boom')
  })

  it('surfaces inference failures from the pipeline call', async () => {
    const { depth } = await load()
    hf.inferenceError = new Error('inference exploded')
    await expect(depth(new FakeBitmap(2, 2))).rejects.toThrow('inference exploded')
  })
})
