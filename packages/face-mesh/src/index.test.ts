import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { models } from './index.js'
import type { FaceMesh } from './index.js'

const engine = vi.hoisted(() => ({ loadModel: vi.fn() }))
const provider = vi.hoisted(() => ({ createFaceLandmarker: vi.fn() }))

vi.mock('@cunny-ai/core', async (importOriginal) => ({
  // keep the real registry-backed listModels (pure metadata), stub the engine
  ...(await importOriginal<typeof import('@cunny-ai/core')>()),
  getDefaultEngine: () => ({ loadModel: engine.loadModel }),
}))

vi.mock('@cunny-ai/provider-mediapipe', () => ({
  createFaceLandmarker: provider.createFaceLandmarker,
}))

const MODEL_BYTES = new Uint8Array([3, 3, 3]).buffer

const landmarker = {
  // MediaPipe's IMAGE/VIDEO detect APIs are synchronous — mocks must return values, not promises
  detect: vi.fn(),
  detectForVideo: vi.fn(),
  close: vi.fn(),
}

engine.loadModel.mockImplementation(
  async (_task: string, opts: { model?: string; onProgress?: (i: { loaded: number; total: number }) => void } = {}) => {
    opts.onProgress?.({ loaded: 2, total: 3 })
    return {
      taskId: 'face-mesh', modelId: opts.model ?? 'face-landmarker', variant: 'fp16',
      bytes: MODEL_BYTES, byteLength: 3, cached: false,
      license: 'Apache-2.0', provider: '@cunny-ai/provider-mediapipe',
    }
  },
)
provider.createFaceLandmarker.mockImplementation(async () => landmarker)

/** Fresh module instance per test — the IMAGE-mode landmarker singleton resets with it. */
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

let lastBitmap: { src: unknown; width: number; height: number; close: ReturnType<typeof vi.fn> }

beforeEach(() => {
  vi.stubGlobal('createImageBitmap', vi.fn(async (src: unknown) => {
    lastBitmap = { src, width: 640, height: 480, close: vi.fn() }
    return lastBitmap
  }))
})
afterEach(() => vi.unstubAllGlobals())

const blob = () => new Blob([new Uint8Array([1])])

describe('models()', () => {
  it('exposes registry metadata for the face landmarker model', () => {
    const list = models()
    expect(list).toHaveLength(1)
    expect(list[0]).toMatchObject({
      id: 'face-landmarker',
      tier: 'default',
      provider: '@cunny-ai/provider-mediapipe',
      license: 'Apache-2.0',
      sizeMB: 3.7,
    })
  })
})

describe('faceMesh()', () => {
  it('maps landmarks, blendshapes and transform matrices', async () => {
    const { faceMesh } = await freshModule()
    const matrix = new Float32Array(Array.from({ length: 16 }, (_, i) => i * 0.5))
    landmarker.detect.mockReturnValue({
      faceLandmarks: [
        [{ x: 0.1, y: 0.2, z: 0.3 }, { x: 0.4, y: 0.5 }], // second point has no z
        [{ x: 0, y: 0, z: 0 }],
      ],
      faceBlendshapes: [
        {
          categories: [
            { categoryName: 'mouthSmileLeft', score: 0.73 },
            { categoryName: undefined, score: 0.4 }, // unnamed categories are dropped
            { score: 0.9 },
          ],
        },
        { categories: [] },
      ],
      facialTransformationMatrixes: [{ data: matrix }],
    })

    const { faces, elapsedMs } = await faceMesh(blob(), { maxFaces: 2 })

    expect(engine.loadModel).toHaveBeenLastCalledWith('face-mesh', { model: undefined, onProgress: undefined })
    expect(provider.createFaceLandmarker).toHaveBeenCalledTimes(1) // first test to build a landmarker
    expect(provider.createFaceLandmarker).toHaveBeenLastCalledWith(new Uint8Array([3, 3, 3]), {
      acceleration: undefined,
      runningMode: 'IMAGE',
      numFaces: 2,
    })
    expect(elapsedMs).toBeGreaterThanOrEqual(0)
    expect(faces).toHaveLength(2)

    expect(faces[0]!.landmarks).toEqual([
      { x: 0.1, y: 0.2, z: 0.3 },
      { x: 0.4, y: 0.5, z: 0 }, // missing z defaults to 0
    ])
    expect(faces[0]!.blendshapes).toEqual({ mouthSmileLeft: 0.73 })
    expect(faces[0]!.transform).toBeInstanceOf(Float32Array)
    expect(faces[0]!.transform!.length).toBe(16)
    expect(Array.from(faces[0]!.transform!)).toEqual(Array.from(matrix))

    expect(faces[1]!.blendshapes).toEqual({})
    expect(faces[1]!.transform).toBeNull() // no matrix for the second face
    expect(lastBitmap.close).toHaveBeenCalledTimes(1) // decoded bitmaps are released
  })

  it('handles a bare result: no blendshapes, no matrices', async () => {
    const { faceMesh } = await freshModule()
    landmarker.detect.mockReturnValue({ faceLandmarks: [[{ x: 0.5, y: 0.5, z: -0.2 }]] })
    const { faces } = await faceMesh(blob())
    expect(faces).toEqual([{ landmarks: [{ x: 0.5, y: 0.5, z: -0.2 }], blendshapes: {}, transform: null }] satisfies FaceMesh[])
  })

  it('reuses the IMAGE singleton but not for custom models', async () => {
    const { faceMesh } = await freshModule()
    landmarker.detect.mockReturnValue({ faceLandmarks: [] })
    await faceMesh(blob())
    const creates = provider.createFaceLandmarker.mock.calls.length
    const loads = engine.loadModel.mock.calls.length

    await faceMesh(blob(), { maxFaces: 4 }) // different opts, still the shared IMAGE landmarker
    expect(provider.createFaceLandmarker.mock.calls.length).toBe(creates)
    expect(engine.loadModel.mock.calls.length).toBe(loads)

    await faceMesh(blob(), { model: 'other' }) // explicit model never reuses the singleton
    expect(provider.createFaceLandmarker.mock.calls.length).toBe(creates + 1)
    expect(engine.loadModel).toHaveBeenLastCalledWith('face-mesh', { model: 'other', onProgress: undefined })
  })

  it('rejects when the model download fails and still releases the bitmap', async () => {
    const { faceMesh } = await freshModule()
    engine.loadModel.mockRejectedValueOnce(new Error('network down'))
    await expect(faceMesh(blob())).rejects.toThrow('network down')
    expect(lastBitmap.close).toHaveBeenCalledTimes(1)
  })
})

describe('trackFaces()', () => {
  it('runs a VIDEO-mode landmarker at the requested fps and stops cleanly', async () => {
    const { trackFaces } = await freshModule()
    const raf = stubRaf()
    const video = { readyState: 2 }
    landmarker.detectForVideo.mockReturnValue({
      faceLandmarks: [[{ x: 0.5, y: 0.5, z: -0.1 }]],
      faceBlendshapes: [{ categories: [{ categoryName: 'jawOpen', score: 0.2 }] }],
      facialTransformationMatrixes: [],
    })
    const seen: Array<[FaceMesh[], number]> = []
    const stop = trackFaces(video as unknown as HTMLVideoElement, (faces, ms) => seen.push([faces, ms]), { fps: 25, maxFaces: 3 })

    raf.tick(40) // 40ms >= 1000/25 — first run
    await flush()
    raf.tick(60) // only 20ms since last run — throttled
    await flush()
    raf.tick(90) // 50ms since last run — second run
    await flush()

    expect(seen).toHaveLength(2)
    expect(seen[0]![0]).toEqual([
      { landmarks: [{ x: 0.5, y: 0.5, z: -0.1 }], blendshapes: { jawOpen: 0.2 }, transform: null }] satisfies FaceMesh[])
    expect(seen[0]![1]).toBeGreaterThanOrEqual(0)
    expect(provider.createFaceLandmarker).toHaveBeenLastCalledWith(new Uint8Array([3, 3, 3]), {
      acceleration: undefined,
      runningMode: 'VIDEO',
      numFaces: 3,
    })
    expect(landmarker.detectForVideo).toHaveBeenCalledWith(video, expect.any(Number))

    const runs = landmarker.detectForVideo.mock.calls.length
    stop()
    await flush()
    raf.tick(400)
    await flush()
    expect(landmarker.detectForVideo.mock.calls.length).toBe(runs) // loop halted
    expect(seen).toHaveLength(2)
    expect(landmarker.close).toHaveBeenCalled() // VIDEO landmarker is released on stop
  })

  it('skips frames until the video has data', async () => {
    const { trackFaces } = await freshModule()
    const raf = stubRaf()
    const video = { readyState: 0 } // no frames yet
    const seen: FaceMesh[][] = []
    const creates = provider.createFaceLandmarker.mock.calls.length
    const stop = trackFaces(video as unknown as HTMLVideoElement, (faces) => seen.push(faces))
    raf.tick(500)
    await flush()
    raf.tick(1000)
    await flush()
    expect(seen).toHaveLength(0)
    expect(provider.createFaceLandmarker.mock.calls.length).toBe(creates) // landmarker not even created
    stop()
  })
})
