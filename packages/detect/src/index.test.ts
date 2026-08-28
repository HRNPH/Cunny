import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { models } from './index.js'
import type { Detection } from './index.js'

const engine = vi.hoisted(() => ({ loadModel: vi.fn() }))
const provider = vi.hoisted(() => ({ createObjectDetector: vi.fn() }))

vi.mock('@cunny-ai/core', async (importOriginal) => ({
  // keep the real registry-backed listModels (pure metadata), stub the engine
  ...(await importOriginal<typeof import('@cunny-ai/core')>()),
  getDefaultEngine: () => ({ loadModel: engine.loadModel }),
}))

vi.mock('@cunny-ai/provider-mediapipe', () => ({
  createObjectDetector: provider.createObjectDetector,
}))

const MODEL_BYTES = new Uint8Array([9, 9, 9, 9]).buffer

const detector = {
  // MediaPipe's IMAGE/VIDEO mode detect APIs are synchronous — mocks must return values, not promises
  detect: vi.fn(),
  detectForVideo: vi.fn(),
  close: vi.fn(),
}

engine.loadModel.mockImplementation(
  async (_task: string, opts: { onProgress?: (i: { loaded: number; total: number }) => void } = {}) => {
    opts.onProgress?.({ loaded: 4, total: 8 })
    return {
      taskId: 'detect', modelId: 'efficientdet-lite0', variant: 'int8',
      bytes: MODEL_BYTES, byteLength: 4, cached: false,
      license: 'Apache-2.0', provider: '@cunny-ai/provider-mediapipe',
    }
  },
)
provider.createObjectDetector.mockImplementation(async () => detector)

/** Fresh module instance per test — the detector singleton resets with it. */
async function freshModule() {
  vi.resetModules()
  return import('./index.js')
}

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

let bitmapW = 200
let bitmapH = 100
let lastBitmap: { src: unknown; width: number; height: number; close: ReturnType<typeof vi.fn> }

beforeEach(() => {
  bitmapW = 200
  bitmapH = 100
  vi.stubGlobal('createImageBitmap', vi.fn(async (src: unknown) => {
    lastBitmap = { src, width: bitmapW, height: bitmapH, close: vi.fn() }
    return lastBitmap
  }))
})
afterEach(() => vi.unstubAllGlobals())

const blob = () => new Blob([new Uint8Array([1])])

describe('models()', () => {
  it('exposes registry metadata for the default efficientdet model', () => {
    const list = models()
    expect(list).toHaveLength(1)
    expect(list[0]).toMatchObject({
      id: 'efficientdet-lite0',
      tier: 'default',
      provider: '@cunny-ai/provider-mediapipe',
      license: 'Apache-2.0',
      sizeMB: 4.4,
    })
  })
})

describe('detect()', () => {
  it('loads the model once, creates the detector and maps px + normalized boxes', async () => {
    const { detect } = await freshModule()
    detector.detect.mockReturnValue({
      detections: [
        {
          boundingBox: { originX: 20, originY: 40, width: 60, height: 30 },
          categories: [{ score: 0.87, categoryName: 'person' }],
        },
      ],
    })
    const source = blob()
    const result = await detect(source)

    expect(engine.loadModel).toHaveBeenLastCalledWith('detect', { model: undefined, onProgress: undefined })
    expect(provider.createObjectDetector).toHaveBeenCalledTimes(1) // first test to build a detector
    expect(provider.createObjectDetector).toHaveBeenLastCalledWith(new Uint8Array([9, 9, 9, 9]), {
      acceleration: 'cpu', // detect deliberately defaults to cpu (GPU efficientdet can drop detections)
      confidence: undefined,
      maxResults: undefined,
    })
    expect(lastBitmap.src).toBe(source) // Blob sources decode through createImageBitmap
    expect(result.width).toBe(200)
    expect(result.height).toBe(100)
    expect(result.elapsedMs).toBeGreaterThanOrEqual(0)
    expect(result.detections).toEqual([
      {
        label: 'person',
        score: 0.87,
        box: { x: 20, y: 40, width: 60, height: 30 },
        normalized: { x: 0.1, y: 0.4, width: 0.3, height: 0.3 },
      },
    ])
    expect(lastBitmap.close).toHaveBeenCalledTimes(1) // decoded bitmaps are released
  })

  it('forwards options and filters by class allowlist', async () => {
    const { detect } = await freshModule()
    detector.detect.mockReturnValue({
      detections: [
        { boundingBox: { originX: 0, originY: 0, width: 10, height: 10 }, categories: [{ score: 0.9, categoryName: 'person' }] },
        { boundingBox: { originX: 0, originY: 0, width: 10, height: 10 }, categories: [{ score: 0.8, categoryName: 'car' }] },
      ],
    })
    const onProgress = vi.fn()
    const result = await detect(blob(), { confidence: 0.7, maxResults: 3, acceleration: 'gpu', classes: ['car'], onProgress })

    expect(engine.loadModel).toHaveBeenLastCalledWith('detect', { model: undefined, onProgress })
    expect(onProgress).toHaveBeenCalledWith({ loaded: 4, total: 8 }) // progress wired through loadModel
    expect(provider.createObjectDetector).toHaveBeenLastCalledWith(new Uint8Array([9, 9, 9, 9]), {
      acceleration: 'gpu',
      confidence: 0.7,
      maxResults: 3,
    })
    expect(result.detections.map((d) => d.label)).toEqual(['car'])
  })

  it('survives missing boxes and names: zeros box, displayName then object fallback', async () => {
    const { detect } = await freshModule()
    detector.detect.mockReturnValue({
      detections: [
        { categories: [{ score: 0.5 }] }, // no box, no names
        { categories: [{ score: 0.9, displayName: 'dog' }] }, // no categoryName -> displayName
      ],
    })
    const result = await detect(blob())
    expect(result.detections).toEqual([
      { label: 'object', score: 0.5, box: { x: 0, y: 0, width: 0, height: 0 }, normalized: { x: 0, y: 0, width: 0, height: 0 } },
      { label: 'dog', score: 0.9, box: { x: 0, y: 0, width: 0, height: 0 }, normalized: { x: 0, y: 0, width: 0, height: 0 } },
    ])
  })

  it('reuses one shared detector across one-shot calls', async () => {
    const { detect } = await freshModule()
    detector.detect.mockReturnValue({ detections: [] })
    await detect(blob())
    const loads = engine.loadModel.mock.calls.length
    const creates = provider.createObjectDetector.mock.calls.length
    await detect(blob())
    expect(engine.loadModel.mock.calls.length).toBe(loads)
    expect(provider.createObjectDetector.mock.calls.length).toBe(creates)
  })

  it('rejects when the model download fails and still releases the bitmap', async () => {
    const { detect } = await freshModule()
    engine.loadModel.mockRejectedValueOnce(new Error('network down'))
    await expect(detect(blob())).rejects.toThrow('network down')
    expect(lastBitmap.close).toHaveBeenCalledTimes(1)
  })
})

describe('trackObjects()', () => {
  it('creates a VIDEO-mode detector and normalizes against video dimensions', async () => {
    const { trackObjects } = await freshModule()
    const raf = stubRaf()
    const video = { readyState: 2, videoWidth: 100, videoHeight: 50 }
    detector.detectForVideo.mockReturnValue({
      detections: [
        {
          boundingBox: { originX: 10, originY: 10, width: 20, height: 10 },
          categories: [{ score: 0.9, categoryName: 'car' }],
        },
      ],
    })
    const seen: Array<[Detection[], number]> = []
    const stop = trackObjects(video as unknown as HTMLVideoElement, (dets, ms) => seen.push([dets, ms]), { fps: 10 })

    raf.tick(100) // 100ms since loop start >= 1000/10 — first run
    await flush()
    raf.tick(150) // only 50ms since last run — throttled
    await flush()
    raf.tick(200) // 100ms since last run — second run
    await flush()

    expect(seen).toHaveLength(2)
    expect(seen[0]![0]).toEqual([
      {
        label: 'car',
        score: 0.9,
        box: { x: 10, y: 10, width: 20, height: 10 },
        normalized: { x: 0.1, y: 0.2, width: 0.2, height: 0.2 },
      },
    ])
    expect(seen[0]![1]).toBeGreaterThanOrEqual(0)
    expect(provider.createObjectDetector).toHaveBeenLastCalledWith(new Uint8Array([9, 9, 9, 9]), {
      acceleration: 'cpu',
      confidence: undefined,
      maxResults: undefined,
      runningMode: 'VIDEO',
    })
    expect(detector.detectForVideo).toHaveBeenCalledWith(video, expect.any(Number))

    const runs = detector.detectForVideo.mock.calls.length
    stop()
    await flush()
    raf.tick(400)
    await flush()
    expect(detector.detectForVideo.mock.calls.length).toBe(runs) // loop halted
    expect(seen).toHaveLength(2)
    expect(detector.close).toHaveBeenCalled() // VIDEO detector is released on stop
  })

  it('skips frames until the video has data', async () => {
    const { trackObjects } = await freshModule()
    const raf = stubRaf()
    const video = { readyState: 1, videoWidth: 100, videoHeight: 50 } // no frames yet
    const seen: Detection[][] = []
    const creates = provider.createObjectDetector.mock.calls.length
    const stop = trackObjects(video as unknown as HTMLVideoElement, (dets) => seen.push(dets))
    raf.tick(500)
    await flush()
    raf.tick(1000)
    await flush()
    expect(seen).toHaveLength(0)
    expect(provider.createObjectDetector.mock.calls.length).toBe(creates) // detector not even created
    stop()
  })
})
