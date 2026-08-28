import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cutoutStream, mask, models, removeBackground } from './index.js'

const engine = vi.hoisted(() => ({ loadModel: vi.fn() }))
const provider = vi.hoisted(() => ({ createImageSegmenter: vi.fn() }))

vi.mock('@cunny-ai/core', async (importOriginal) => ({
  // keep the real registry-backed listModels (pure metadata), stub the engine
  ...(await importOriginal<typeof import('@cunny-ai/core')>()),
  getDefaultEngine: () => ({ loadModel: engine.loadModel }),
}))

vi.mock('@cunny-ai/provider-mediapipe', () => ({
  createImageSegmenter: provider.createImageSegmenter,
}))

const MODEL_BYTES = new Uint8Array([7]).buffer

const segmenter = {
  segment: vi.fn(),
  segmentForVideo: vi.fn(),
  setOptions: vi.fn(async () => {}),
  close: vi.fn(),
  getLabels: vi.fn(() => ['background', 'person'] as string[]),
}

engine.loadModel.mockImplementation(
  async (_task: string, opts: { onProgress?: (i: { loaded: number; total: number }) => void } = {}) => {
    opts.onProgress?.({ loaded: 3, total: 7 })
    return {
      taskId: 'bg-remove', modelId: 'selfie-seg', variant: 'fp16',
      bytes: MODEL_BYTES, byteLength: 1, cached: false,
      license: 'Apache-2.0', provider: '@cunny-ai/provider-mediapipe',
    }
  },
)
provider.createImageSegmenter.mockImplementation(async () => segmenter)

// ---- minimal canvas / DOM fakes (tests run in a node environment) ----

class FakeMediaStream {
  tracks: Array<{ kind: string; stop?: () => void }>
  constructor(tracks: Array<{ kind: string; stop?: () => void }> = []) {
    this.tracks = [...tracks]
  }
  getVideoTracks() { return this.tracks.filter((t) => t.kind === 'video') }
  getAudioTracks() { return this.tracks.filter((t) => t.kind === 'audio') }
  addTrack(t: { kind: string }) { this.tracks.push(t) }
}

interface FakeImage { width: number; height: number; data: Uint8ClampedArray }

class FakeContext2D {
  ops: Array<[string, ...unknown[]]> = []
  imageSmoothingEnabled = true
  filter = 'none'
  fillStyle = ''
  globalCompositeOperation = 'source-over'
  private image: FakeImage | null = null
  constructor(readonly canvas: FakeCanvas) {}

  createImageData(width: number, height: number): FakeImage {
    return { width, height, data: new Uint8ClampedArray(width * height * 4) }
  }
  putImageData(img: FakeImage) {
    this.image = img
    this.ops.push(['putImageData', img])
  }
  drawImage(src: unknown) {
    this.ops.push(['drawImage', src, this.globalCompositeOperation, this.filter])
    // simulate drawing a same-size canvas: adopt its current pixels
    if (src instanceof FakeCanvas && src.ctx.image) {
      this.image = { width: src.ctx.image.width, height: src.ctx.image.height, data: new Uint8ClampedArray(src.ctx.image.data) }
    }
  }
  getImageData(_x: number, _y: number, width: number, height: number): FakeImage {
    if (this.image && this.image.width === width && this.image.height === height) {
      return { width, height, data: new Uint8ClampedArray(this.image.data) }
    }
    return { width, height, data: new Uint8ClampedArray(width * height * 4) }
  }
  fillRect(...args: unknown[]) { this.ops.push(['fillRect', this.fillStyle, ...args]) }
  clearRect(...args: unknown[]) { this.ops.push(['clearRect', ...args]) }
}

class FakeCanvas {
  width = 0
  height = 0
  ctx = new FakeContext2D(this)
  toBlobType: string | undefined
  capturedTrack: { kind: string; stop: ReturnType<typeof vi.fn> } | null = null
  capturedFps = 0

  getContext() { return this.ctx }
  toBlob(cb: (b: Blob | null) => void, type?: string) {
    this.toBlobType = type
    cb(new Blob(['fake-png'], { type }))
  }
  captureStream(fps: number) {
    this.capturedFps = fps
    this.capturedTrack = { kind: 'video', stop: vi.fn() }
    return new FakeMediaStream([this.capturedTrack])
  }
}

const makeVideo = (bitmapW: number, bitmapH: number) => {
  const video = {
    muted: false,
    playsInline: false,
    srcObject: null as FakeMediaStream | null,
    readyState: 0,
    videoWidth: 0,
    videoHeight: 0,
    play: vi.fn(),
    addEventListener: vi.fn(),
  }
  video.play.mockImplementation(async () => {
    video.readyState = 4
    video.videoWidth = bitmapW
    video.videoHeight = bitmapH
  })
  return video
}

let bitmapW = 2
let bitmapH = 2
let canvases: FakeCanvas[] = []
let videos: ReturnType<typeof makeVideo>[] = []
let lastBitmap: { src: unknown; width: number; height: number; close: ReturnType<typeof vi.fn> }

function stubRaf() {
  let queue: FrameRequestCallback[] = []
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    queue.push(cb)
    return queue.length
  })
  return {
    tick(now: number) {
      const pending = queue
      queue = []
      for (const cb of pending) cb(now)
    },
  }
}

const flush = () => new Promise<void>((r) => setTimeout(r, 0))

beforeEach(() => {
  bitmapW = 2
  bitmapH = 2
  canvases = []
  videos = []
  vi.stubGlobal('document', {
    createElement: (tag: string) => {
      if (tag === 'video') {
        const v = makeVideo(bitmapW, bitmapH)
        videos.push(v)
        return v
      }
      const c = new FakeCanvas()
      canvases.push(c)
      return c
    },
  })
  // instanceof targets referenced by the source — never matched by our fake sources
  vi.stubGlobal('ImageBitmap', class FakeImageBitmap {})
  vi.stubGlobal('HTMLImageElement', class FakeHTMLImageElement {})
  vi.stubGlobal('HTMLCanvasElement', class FakeHTMLCanvasElement {})
  vi.stubGlobal('MediaStream', FakeMediaStream)
  vi.stubGlobal('createImageBitmap', vi.fn(async (src: unknown) => {
    lastBitmap = { src, width: bitmapW, height: bitmapH, close: vi.fn() }
    return lastBitmap
  }))
})
afterEach(() => vi.unstubAllGlobals())

const blob = () => new Blob([new Uint8Array([1])])

/** Wire segmenter.segment to return a 2x2 category mask; returns the mask's close spy. */
function givenCategoryMask(data: Uint8Array) {
  const closed = vi.fn()
  segmenter.segment.mockImplementation((_src: unknown, cb: (r: unknown) => void) =>
    cb({ categoryMask: { width: 2, height: 2, getAsUint8Array: () => data, close: closed } }))
  return closed
}

function givenVideoMask(data: Uint8Array) {
  segmenter.segmentForVideo.mockImplementation((_src: unknown, _ts: number, cb: (r: unknown) => void) =>
    cb({ categoryMask: { width: 2, height: 2, getAsUint8Array: () => data, close: vi.fn() } }))
}

describe('models()', () => {
  it('exposes registry metadata for the selfie segmentation model', () => {
    const list = models()
    expect(list).toHaveLength(1)
    expect(list[0]).toMatchObject({
      id: 'selfie-seg',
      tier: 'default',
      provider: '@cunny-ai/provider-mediapipe',
      license: 'Apache-2.0',
      sizeMB: 0.3, // ~250KB rounded to one decimal
    })
  })
})

describe('mask()', () => {
  it('produces a grayscale person mask (255 = person) from the category mask', async () => {
    const closed = givenCategoryMask(new Uint8Array([0, 0, 1, 1])) // bottom row is the person
    const onProgress = vi.fn()
    const result = await mask(blob(), { acceleration: 'gpu', onProgress })

    expect(engine.loadModel).toHaveBeenLastCalledWith('bg-remove', { model: undefined, onProgress })
    expect(onProgress).toHaveBeenCalledWith({ loaded: 3, total: 7 }) // progress wired through loadModel
    expect(provider.createImageSegmenter).toHaveBeenLastCalledWith(new Uint8Array([7]), { acceleration: 'gpu' })
    expect(result.width).toBe(2)
    expect(result.height).toBe(2)
    expect(result.elapsedMs).toBeGreaterThanOrEqual(0)
    expect(Array.from(result.mask.data)).toEqual([
      0, 0, 0, 0, 0, 0, 0, 0, // background pixels: fully transparent
      255, 255, 255, 255, 255, 255, 255, 255, // person pixels: opaque white
    ])
    expect(closed).toHaveBeenCalledTimes(1) // the mediapipe mask is always released
    expect(lastBitmap.close).toHaveBeenCalledTimes(1) // decoded bitmaps are released
    expect(canvases[1]!.ctx.filter).toBe('none') // no feather by default
  })

  it('falls back to majority-vote person id when labels carry no person class', async () => {
    segmenter.getLabels.mockReturnValueOnce(['sky', 'grass'])
    givenCategoryMask(new Uint8Array([1, 1, 1, 0])) // majority class is 1 -> background, person = 0
    const result = await mask(blob())
    const alpha = Array.from(result.mask.data).filter((_, i) => i % 4 === 3)
    expect(alpha).toEqual([0, 0, 0, 255]) // only the pixel in the minority (non-background) class is the person
  })

  it('rejects when the segmenter returns no category mask', async () => {
    segmenter.segment.mockImplementation((_s: unknown, cb: (r: unknown) => void) => cb({}))
    await expect(mask(blob())).rejects.toThrow(/no category mask/)
  })

  it('reuses one segmenter and applies feathering as a canvas blur', async () => {
    givenCategoryMask(new Uint8Array([1, 1, 1, 1]))
    const creates = provider.createImageSegmenter.mock.calls.length
    const loads = engine.loadModel.mock.calls.length
    await mask(blob(), { feather: 2 })
    await mask(blob(), { feather: 2 })
    expect(provider.createImageSegmenter.mock.calls.length).toBe(creates) // shared singleton
    expect(engine.loadModel.mock.calls.length).toBe(loads)
    expect(canvases[1]!.ctx.filter).toBe('blur(2px)') // full-size canvas got the blur filter
  })
})

describe('removeBackground()', () => {
  it('composites the person cutout into an alpha PNG', async () => {
    givenCategoryMask(new Uint8Array([0, 1, 1, 1]))
    const out = await removeBackground(blob())

    expect(out).toBeInstanceOf(Blob)
    expect(out.type).toBe('image/png')
    const canvas = canvases[0]! // output canvas is created before the mask canvases
    expect(canvas.width).toBe(2)
    expect(canvas.height).toBe(2)
    const draws = canvas.ctx.ops.filter(([op]) => op === 'drawImage')
    expect(draws).toHaveLength(2)
    expect(draws[0]![1]).toBe(lastBitmap) // the decoded source
    expect(draws[0]![2]).toBe('source-over')
    expect(draws[1]![2]).toBe('destination-in') // mask applied via destination-in
    expect(canvas.toBlobType).toBe('image/png')
    expect(lastBitmap.close).toHaveBeenCalledTimes(1)
  })
})

describe('cutoutStream()', () => {
  it('streams a composited cutout with blurred background and original audio', async () => {
    const raf = stubRaf()
    givenVideoMask(new Uint8Array([0, 1, 1, 1]))
    const input = new FakeMediaStream([{ kind: 'video', stop: vi.fn() }, { kind: 'audio' }])

    const { stream: outStream, stop } = await cutoutStream(input as unknown as MediaStream, {
      background: 'blur',
      blurAmount: 7,
      fps: 30,
      feather: 1,
    })

    expect(segmenter.setOptions).toHaveBeenCalledWith({ runningMode: 'VIDEO' }) // singleton switched to VIDEO
    const video = videos[0]!
    expect(video.srcObject!.getVideoTracks()[0]).toBe(input.getVideoTracks()[0]) // fed from the camera track
    const canvas = canvases.find((c) => c.capturedTrack)!
    expect(canvas.width).toBe(2)
    expect(canvas.height).toBe(2)
    expect(canvas.capturedFps).toBe(30)
    expect(outStream.getAudioTracks()).toEqual([input.getAudioTracks()[0]]) // audio passed through

    raf.tick(50) // loop ts - lastTs is already past the 1000/30 gate
    await flush()
    expect(segmenter.segmentForVideo).toHaveBeenCalledTimes(1)
    expect(segmenter.segmentForVideo).toHaveBeenCalledWith(video, expect.any(Number), expect.any(Function))
    const draws = canvas.ctx.ops.filter(([op]) => op === 'drawImage')
    expect(draws.map((d) => d[2])).toEqual(['source-over', 'destination-in', 'destination-over'])
    expect(draws[2]![1]).toBe(video) // background drawn from the video frame
    expect(draws[2]![3]).toBe('blur(7px)') // with the requested blur
    expect(canvas.ctx.filter).toBe('none') // filter reset afterwards

    const runs = segmenter.segmentForVideo.mock.calls.length
    stop()
    await flush()
    raf.tick(100)
    await flush()
    expect(segmenter.segmentForVideo.mock.calls.length).toBe(runs) // loop halted
    expect(canvas.capturedTrack!.stop).toHaveBeenCalled() // canvas track stopped
  })

  it('paints solid-color and transparent backgrounds behind the person', async () => {
    const raf = stubRaf()
    givenVideoMask(new Uint8Array([1, 1, 1, 1]))

    const first = await cutoutStream(new FakeMediaStream() as unknown as MediaStream, { background: '#00ff00' })
    raf.tick(50)
    await flush()
    const colorCanvas = canvases.find((c) => c.capturedTrack)!
    expect(colorCanvas.ctx.fillStyle).toBe('#00ff00')
    expect(colorCanvas.ctx.ops).toContainEqual(['fillRect', '#00ff00', 0, 0, 2, 2])
    first.stop()

    const before = canvases.length
    const second = await cutoutStream(new FakeMediaStream() as unknown as MediaStream, { background: 'transparent' })
    raf.tick(50)
    await flush()
    const clearCanvas = canvases.slice(before).find((c) => c.capturedTrack)!
    // 'transparent' is a string background: painted as a fully transparent fill
    expect(clearCanvas.ctx.fillStyle).toBe('transparent')
    expect(clearCanvas.ctx.ops).toContainEqual(['fillRect', 'transparent', 0, 0, 2, 2])
    second.stop()
  })
})
