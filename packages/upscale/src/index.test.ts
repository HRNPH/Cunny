import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { estimate } from './index.js'

/**
 * The provider boundary is mocked (model bytes from memory, fake session) and
 * the browser surface (document/canvas/createImageBitmap/ImageBitmap) stubbed.
 */
const h = vi.hoisted(() => {
  const loadModel = vi.fn()
  const createSession = vi.fn()
  const getOrt = vi.fn()
  const tensors: Array<{ type: string; data: Float32Array; dims: number[] }> = []
  class Tensor {
    type: string
    data: Float32Array
    dims: number[]
    constructor(type: string, data: Float32Array, dims: number[]) {
      this.type = type
      this.data = data
      this.dims = dims
      tensors.push(this)
    }
  }
  return { loadModel, createSession, getOrt, Tensor, tensors }
})

vi.mock('@cunny-ai/core', () => ({
  listModels: () => [{ task: 'upscale', id: 'realesrgan-x4-q8', tier: 'default', sizeMB: 17 }],
  getDefaultEngine: () => ({ loadModel: h.loadModel }),
}))
vi.mock('@cunny-ai/provider-onnx', () => ({
  createSession: h.createSession,
  getOrt: h.getOrt,
}))

/** Session that "upscales" its NCHW input 4x with planes over/full/under range. */
function fakeUpscaleSession() {
  const run = vi.fn(async (feeds: Record<string, { dims: number[] }>) => {
    const input = Object.values(feeds)[0]!
    const [, , inH, inW] = input.dims
    const oH = inH * 4
    const oW = inW * 4
    const plane = oH * oW
    const data = new Float32Array(3 * plane)
    data.fill(1.5, 0, plane) // R over range
    data.fill(0.5, plane, 2 * plane) // G in range
    data.fill(-0.5, 2 * plane) // B under range
    return { 'model.out': { data, dims: [1, 3, oH, oW] } }
  })
  return { inputNames: ['model.in'], outputNames: ['model.out'], run, release: vi.fn() }
}

class FakeImageBitmap {
  closed = false
  constructor(
    readonly src: unknown,
    readonly width: number,
    readonly height: number,
  ) {}
  close() {
    this.closed = true
  }
}

/** document stub: every canvas gets a 2d ctx; input pixels are a fixed RGBA pattern. */
function stubDocument() {
  const canvases: Array<{ width: number; height: number }> = []
  const puts: Array<{ data: Uint8ClampedArray }> = []
  const document = {
    createElement: () => {
      const canvas = { width: 0, height: 0, getContext: () => ctx }
      canvases.push(canvas)
      const ctx = {
        drawImage: vi.fn(),
        // input canvas readback: R=255 G=128 B=0 for every pixel
        getImageData: () => ({
          data: (() => {
            const rgba = new Uint8ClampedArray(canvas.width * canvas.height * 4)
            for (let p = 0; p < canvas.width * canvas.height; p++) {
              rgba[p * 4] = 255
              rgba[p * 4 + 1] = 128
              rgba[p * 4 + 2] = 0
              rgba[p * 4 + 3] = 255
            }
            return rgba
          })(),
        }),
        createImageData: (w: number, hh: number) => ({ width: w, height: hh, data: new Uint8ClampedArray(w * hh * 4) }),
        putImageData: (img: { data: Uint8ClampedArray }) => puts.push(img),
      }
      return canvas
    },
  }
  vi.stubGlobal('document', document)
  return { canvases, puts }
}

/** Fresh module copy — sessionBytes is cached at module scope. */
async function loadU() {
  vi.resetModules()
  return await import('./index.js')
}

const bitmap = (width: number, height: number) => new FakeImageBitmap('direct', width, height) as unknown as ImageBitmap

let createImageBitmap: ReturnType<typeof vi.fn>

beforeEach(() => {
  vi.clearAllMocks()
  h.tensors.length = 0
  h.loadModel.mockResolvedValue({ bytes: new ArrayBuffer(16) })
  h.getOrt.mockResolvedValue({ Tensor: h.Tensor })
  createImageBitmap = vi.fn(
    async (src: { width?: number; height?: number }) =>
      new FakeImageBitmap(src, src.width ?? 0, src.height ?? 0) as unknown as ImageBitmap,
  )
  vi.stubGlobal('ImageBitmap', FakeImageBitmap)
  vi.stubGlobal('createImageBitmap', createImageBitmap)
  vi.stubGlobal('HTMLImageElement', class {}) // instanceof gate falls through to the canvas branch
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('upscale metadata', () => {
    it('lists the real-esrgan registry entries', async () => {
    const mod = await loadU()
    expect(mod.models()).toHaveLength(1)
    expect(mod.models()[0]).toMatchObject({ task: 'upscale', id: 'realesrgan-x4-q8' })
  })
})

describe('estimate', () => {
  it('accepts wasm inputs up to the 0.5MP cap and rejects beyond it', () => {
    expect(estimate(1000, 500)).toEqual({ ok: true, estMs: 2250 }) // exactly 0.5MP
    expect(estimate(700, 700).ok).toBe(true) // 0.49MP
    expect(estimate(708, 708).ok).toBe(false) // 0.501MP
    expect(estimate(708, 708).estMs).toBe(2256) // round(0.501264 * 4500)
  })

  it('lets webgpu handle multi-megapixel inputs at its own rate', () => {
    expect(estimate(2000, 2000, 'webgpu')).toEqual({ ok: true, estMs: 1400 }) // 4MP * 350ms
  })
})

describe('upscale', () => {
  it('maps RGBA to NCHW floats, reconstructs a 4x canvas and returns a bitmap', async () => {
    const { canvases, puts } = stubDocument()
    const session = fakeUpscaleSession()
    h.createSession.mockResolvedValue(session)
    const mod = await loadU()

    const out = (await mod.upscale(bitmap(8, 6))) as unknown as FakeImageBitmap

    // backend auto resolves to wasm without navigator.gpu
    expect(h.createSession).toHaveBeenCalledWith(expect.any(ArrayBuffer), { backend: 'wasm' })

    // input tensor: [1,3,H,W], planes R/G/B scaled to [0,1]
    const feed = h.tensors.at(-1)!
    expect(feed.type).toBe('float32')
    expect(feed.dims).toEqual([1, 3, 6, 8])
    expect(feed.data.length).toBe(3 * 6 * 8)
    expect(Array.from(feed.data.slice(0, 48)).every((v) => v === 1)).toBe(true)
    expect(Array.from(feed.data.slice(48, 96)).every((v) => Math.abs(v - 128 / 255) < 1e-6)).toBe(true)
    expect(Array.from(feed.data.slice(96)).every((v) => v === 0)).toBe(true)

    // output canvas at 4x, pixels clamped R=255 G=128 B=0 A=255
    expect(canvases).toHaveLength(2)
    expect(canvases[1]).toMatchObject({ width: 32, height: 24 })
    expect(puts).toHaveLength(1)
    const px = puts[0]!.data
    expect(px.length).toBe(32 * 24 * 4)
    expect([px[0], px[1], px[2], px[3]]).toEqual([255, 128, 0, 255])
    expect([px[77 * 4], px[77 * 4 + 1], px[77 * 4 + 2], px[77 * 4 + 3]]).toEqual([255, 128, 0, 255])

    // the returned bitmap was created from the output canvas; the source bitmap stays open
    expect(createImageBitmap).toHaveBeenCalledWith(canvases[1])
    expect(out.src).toBe(canvases[1])
    expect(out.closed).toBe(false)
  })

  it('rejects wasm inputs over the cap before loading anything', async () => {
    stubDocument()
    const session = fakeUpscaleSession()
    h.createSession.mockResolvedValue(session)
    const mod = await loadU()

    const src = { width: 800, height: 800 } as HTMLCanvasElement
    await expect(mod.upscale(src, { backend: 'wasm' })).rejects.toThrow(/exceeds the 0\.5MP wasm cap/)

    expect(h.loadModel).not.toHaveBeenCalled()
    expect(h.createSession).not.toHaveBeenCalled()
    expect(session.run).not.toHaveBeenCalled()
    // the decoded bitmap was still closed (canvas sources own their bitmap)
    const decoded = (await createImageBitmap.mock.results[0]!.value) as FakeImageBitmap
    expect(decoded.closed).toBe(true)
  })

  it('auto-selects webgpu when navigator.gpu is available', async () => {
    vi.stubGlobal('navigator', { gpu: {} })
    stubDocument()
    const session = fakeUpscaleSession()
    h.createSession.mockResolvedValue(session)
    const mod = await loadU()

    await mod.upscale(bitmap(800, 800)) // over the wasm cap, fine on webgpu

    expect(h.createSession).toHaveBeenCalledWith(expect.any(ArrayBuffer), { backend: 'webgpu' })
    expect(session.run).toHaveBeenCalledOnce()
  })

  it('passes an explicit webgpu backend through', async () => {
    stubDocument()
    h.createSession.mockResolvedValue(fakeUpscaleSession())
    const mod = await loadU()

    await mod.upscale(bitmap(4, 4), { backend: 'webgpu' })
    expect(h.createSession).toHaveBeenCalledWith(expect.any(ArrayBuffer), { backend: 'webgpu' })
  })

  it('loads the model once and forwards model/onProgress options', async () => {
    stubDocument()
    h.createSession.mockResolvedValue(fakeUpscaleSession())
    const mod = await loadU()
    const onProgress = vi.fn()

    await mod.upscale(bitmap(4, 4), { model: 'realesrgan-x4-plus', onProgress })
    await mod.upscale(bitmap(4, 4), { model: 'realesrgan-x4-plus', onProgress })

    expect(h.loadModel).toHaveBeenCalledOnce()
    expect(h.loadModel).toHaveBeenCalledWith('upscale', { model: 'realesrgan-x4-plus', onProgress })
    expect(h.createSession).toHaveBeenCalledTimes(2)
  })

  it('downloads url sources via fetch before decoding', async () => {
    stubDocument()
    const fetchMock = vi.fn(async () => ({ blob: async () => new Blob(['x']) }))
    vi.stubGlobal('fetch', fetchMock)
    h.createSession.mockResolvedValue(fakeUpscaleSession())
    const mod = await loadU()

    await mod.upscale('https://cdn.example.com/img.png')

    expect(fetchMock).toHaveBeenCalledWith('https://cdn.example.com/img.png', { mode: 'cors' })
    expect(createImageBitmap).toHaveBeenCalledWith(expect.any(Blob))
  })
})
