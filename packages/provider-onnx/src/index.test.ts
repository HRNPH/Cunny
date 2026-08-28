import { afterEach, describe, expect, it, vi } from 'vitest'

/** Stand-in for the ort.Tensor constructor: records type/data/dims per instance. */
class FakeTensor {
  constructor(
    readonly type: string,
    readonly data: Float32Array | Int32Array | BigInt64Array,
    readonly dims: number[],
  ) {}
}

function fakeSession() {
  return {
    inputNames: ['input'],
    outputNames: ['output'],
    run: vi.fn(async () => ({ output: { data: new Float32Array([0]) } })),
    release: vi.fn(),
  }
}

/** Typed create() mock so call args are inspectable. */
type CreateMock = ReturnType<typeof makeCreate>
function makeCreate() {
  return vi.fn(async (_data: Uint8Array, _opts: { executionProviders: string[] }) => fakeSession())
}

/** Fresh onnxruntime-web mock: env pinning surface + create/Tensor spies. */
function makeOrt(over?: { create?: CreateMock }) {
  return {
    env: { wasm: { wasmPaths: '' } },
    Tensor: FakeTensor as unknown as new (type: string, data: unknown, dims: number[]) => FakeTensor,
    InferenceSession: { create: over?.create ?? makeCreate() },
  }
}

/** Import a fresh copy of the module (wasmPaths/ortPromise are module state) against a fresh runtime mock. */
async function loadProvider(over?: { create?: CreateMock }) {
  vi.resetModules()
  const ort = makeOrt(over)
  vi.doMock('onnxruntime-web', () => ort)
  const mod = await import('./index.js')
  return { mod, ort }
}

const bytes = (n: number) => {
  const b = new ArrayBuffer(n)
  new Uint8Array(b).fill(7)
  return b
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('getOrt', () => {
  it('resolves the runtime and pins the jsdelivr CDN wasm paths', async () => {
    const { mod, ort } = await loadProvider()
    const runtime = (await mod.getOrt()) as unknown as typeof ort
    expect(runtime.env).toBe(ort.env)
    expect(runtime.Tensor).toBe(ort.Tensor as never)
    expect(ort.env.wasm.wasmPaths).toBe('https://cdn.jsdelivr.net/npm/onnxruntime-web@1.22.0/dist/')
  })

  it('memoizes the dynamic import across calls', async () => {
    const { mod, ort } = await loadProvider()
    const [a, b] = await Promise.all([mod.getOrt(), mod.getOrt()]) as unknown as [typeof ort, typeof ort]
    expect(a).toBe(b)
    expect(a.env).toBe(ort.env)
  })

  it('passes self-hosted wasm paths through before first load', async () => {
    const { mod, ort } = await loadProvider()
    mod.setWasmPaths('/assets/ort-dist/')
    await mod.getOrt()
    expect(ort.env.wasm.wasmPaths).toBe('/assets/ort-dist/')
  })

  it('wraps a failed runtime import in ProviderMissingError', async () => {
    vi.resetModules()
    vi.doMock('onnxruntime-web', () => {
      throw new Error('cannot resolve onnxruntime-web')
    })
    const mod = await import('./index.js')
    await expect(mod.getOrt()).rejects.toMatchObject({
      name: 'CunnyAIError',
      code: 'PROVIDER_MISSING',
    })
  })
})

describe('createSession', () => {
  it('hands the session factory raw bytes as Uint8Array with the requested providers', async () => {
    const create = makeCreate()
    const { mod } = await loadProvider({ create })
    await mod.createSession(bytes(8), { backend: 'wasm' })

    expect(create).toHaveBeenCalledOnce()
    const [data, opts] = create.mock.calls[0]!
    expect(data).toBeInstanceOf(Uint8Array)
    expect(data.length).toBe(8)
    expect(data[3]).toBe(7)
    expect(opts).toEqual({ executionProviders: ['wasm'] })
  })

  it('uses webgpu alone when explicitly requested', async () => {
    const create = makeCreate()
    const { mod } = await loadProvider({ create })
    await mod.createSession(bytes(2), { backend: 'webgpu' })
    expect(create.mock.calls[0]![1]).toEqual({ executionProviders: ['webgpu'] })
  })

  it('auto picks wasm-only when navigator has no gpu adapter', async () => {
    const create = makeCreate()
    const { mod } = await loadProvider({ create })
    await mod.createSession(bytes(2))
    expect(create.mock.calls[0]![1]).toEqual({ executionProviders: ['wasm'] })
  })

  it('auto prefers webgpu with wasm when navigator.gpu exists', async () => {
    vi.stubGlobal('navigator', { gpu: {} })
    const create = makeCreate()
    const { mod } = await loadProvider({ create })
    await mod.createSession(bytes(2))
    expect(create.mock.calls[0]![1]).toEqual({ executionProviders: ['webgpu', 'wasm'] })
  })

  it('auto falls back to wasm when the preferred providers fail', async () => {
    vi.stubGlobal('navigator', { gpu: {} })
    const session = fakeSession()
    const create = vi.fn(async (_data: Uint8Array, opts: { executionProviders: string[] }) => {
      if (opts.executionProviders.includes('webgpu')) throw new Error('webgpu unavailable')
      return session
    })
    const { mod } = await loadProvider({ create })

    const out = await mod.createSession(bytes(4))

    expect(out).toBe(session as never)
    expect(create).toHaveBeenCalledTimes(2)
    expect(create.mock.calls[0][1].executionProviders).toEqual(['webgpu', 'wasm'])
    expect(create.mock.calls[1][1].executionProviders).toEqual(['wasm'])
  })

  it('rethrows without fallback for explicit backends', async () => {
    const err = new Error('webgpu unavailable')
    const create = vi.fn(async () => {
      throw err
    })
    const { mod } = await loadProvider({ create })
    await expect(mod.createSession(bytes(4), { backend: 'webgpu' })).rejects.toBe(err)
    expect(create).toHaveBeenCalledOnce()
  })
})

describe('run and newTensor helpers', () => {
  it('run delegates to session.run and returns its output', async () => {
    const { mod } = await loadProvider()
    const result = { output: { data: new Float32Array([0.5]) } }
    const session = { run: vi.fn(async () => result) } as never as import('onnxruntime-web').InferenceSession
    const feeds = {} as Record<string, import('onnxruntime-web').Tensor>

    await expect(mod.run(session, feeds)).resolves.toBe(result)
    expect((session as unknown as { run: ReturnType<typeof vi.fn> }).run).toHaveBeenCalledWith(feeds)
  })

  it('newTensor maps type, data and dims onto the ort Tensor constructor', async () => {
    const { mod } = await loadProvider()
    const data = new Float32Array([1, 2, 3, 4])
    const t = await mod.newTensor('float32', data, [2, 2])

    expect(t).toBeInstanceOf(FakeTensor)
    expect((t as unknown as FakeTensor).type).toBe('float32')
    expect((t as unknown as FakeTensor).data).toBe(data)
    expect((t as unknown as FakeTensor).dims).toEqual([2, 2])
  })

  it('newTensor supports int64 scalars', async () => {
    const { mod } = await loadProvider()
    const data = BigInt64Array.from([16000n])
    const t = await mod.newTensor('int64', data, [])
    expect((t as unknown as FakeTensor).type).toBe('int64')
    expect((t as unknown as FakeTensor).data).toBe(data)
    expect((t as unknown as FakeTensor).dims).toEqual([])
  })
})
