import { describe, expect, it, vi } from 'vitest'
import {
  createFaceDetector,
  createFaceLandmarker,
  createImageSegmenter,
  createObjectDetector,
  createPoseLandmarker,
  setWasmBase,
} from './index.js'

const h = vi.hoisted(() => {
  const fakeFileset = { wasmLoaderPath: 'fake/vision_wasm_internal.js', wasmBinaryPath: 'fake/vision_wasm_internal.wasm' }
  /** Every (successful or failed) createFromOptions attempt, in order. */
  const created: Array<{ task: string; fileset: unknown; options: Record<string, unknown>; instance: unknown; failed: boolean }> = []
  /** Add a task name here to simulate "GPU delegate unavailable" for it. */
  const failGpu = new Set<string>()
  const makeTask = (task: string) => ({
    createFromOptions: vi.fn(async (fileset: unknown, options: Record<string, any>) => {
      const fail = options.baseOptions.delegate === 'GPU' && failGpu.has(task)
      const instance = { task, options, close: vi.fn() }
      created.push({ task, fileset, options, instance, failed: fail })
      if (fail) throw new Error('WebGL is not available')
      return instance
    }),
  })
  const module = {
    FilesetResolver: { forVisionTasks: vi.fn(async (_base: string) => fakeFileset) },
    FaceDetector: makeTask('FaceDetector'),
    FaceLandmarker: makeTask('FaceLandmarker'),
    PoseLandmarker: makeTask('PoseLandmarker'),
    ImageSegmenter: makeTask('ImageSegmenter'),
    ObjectDetector: makeTask('ObjectDetector'),
  }
  return { fakeFileset, created, failGpu, module }
})

vi.mock('@mediapipe/tasks-vision', () => h.module)

const bytes = new Uint8Array([1, 2, 3, 4])
const callsFor = (task: string) => h.created.filter((c) => c.task === task)
const delegates = (task: string) => callsFor(task).map((c) => (c.options.baseOptions as { delegate: string }).delegate)
const lastOptions = (task: string) => callsFor(task).at(-1)!.options

describe('provider-mediapipe', () => {
  it('resolves the wasm fileset once from the pinned CDN and shares it across factories', async () => {
    const faceDetector = await createFaceDetector(bytes)
    const objectDetector = await createObjectDetector(bytes)

    expect(h.module.FilesetResolver.forVisionTasks).toHaveBeenCalledTimes(1)
    expect(h.module.FilesetResolver.forVisionTasks).toHaveBeenCalledWith(
      'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm',
    )
    const fd = callsFor('FaceDetector')[0]!
    const od = callsFor('ObjectDetector')[0]!
    expect(fd.fileset).toBe(h.fakeFileset) // resolved fileset is what reaches createFromOptions
    expect(od.fileset).toBe(h.fakeFileset)
    expect(faceDetector).toBe(fd.instance)
    expect(objectDetector).toBe(od.instance)
  })

  describe('createFaceDetector', () => {
    it('passes defaults: GPU delegate, IMAGE mode, 0.5 confidence, 0.3 suppression', async () => {
      await createFaceDetector(bytes)
      expect(lastOptions('FaceDetector')).toEqual({
        baseOptions: { modelAssetBuffer: bytes, delegate: 'GPU' },
        runningMode: 'IMAGE',
        minDetectionConfidence: 0.5,
        minSuppressionThreshold: 0.3,
      })
      expect((lastOptions('FaceDetector').baseOptions as { modelAssetBuffer: Uint8Array }).modelAssetBuffer).toBe(bytes)
    })

    it('forwards confidence, suppression, runningMode and cpu delegate', async () => {
      await createFaceDetector(bytes, { confidence: 0.9, suppression: 0.6, runningMode: 'VIDEO', acceleration: 'cpu' })
      expect(lastOptions('FaceDetector')).toEqual({
        baseOptions: { modelAssetBuffer: bytes, delegate: 'CPU' },
        runningMode: 'VIDEO',
        minDetectionConfidence: 0.9,
        minSuppressionThreshold: 0.6,
      })
    })
  })

  describe('createFaceLandmarker', () => {
    it('passes defaults: 1 face, blendshapes and transformation matrices on', async () => {
      await createFaceLandmarker(bytes)
      expect(lastOptions('FaceLandmarker')).toEqual({
        baseOptions: { modelAssetBuffer: bytes, delegate: 'GPU' },
        runningMode: 'IMAGE',
        numFaces: 1,
        outputFaceBlendshapes: true,
        outputFacialTransformationMatrixes: true,
      })
    })

    it('forwards numFaces and turns optional outputs off', async () => {
      await createFaceLandmarker(bytes, {
        numFaces: 4,
        blendshapes: false,
        transformationMatrices: false,
        runningMode: 'VIDEO',
        acceleration: 'gpu',
      })
      expect(lastOptions('FaceLandmarker')).toEqual({
        baseOptions: { modelAssetBuffer: bytes, delegate: 'GPU' },
        runningMode: 'VIDEO',
        numFaces: 4,
        outputFaceBlendshapes: false,
        outputFacialTransformationMatrixes: false,
      })
    })
  })

  describe('createPoseLandmarker', () => {
    it('defaults to one pose in IMAGE mode', async () => {
      await createPoseLandmarker(bytes)
      expect(lastOptions('PoseLandmarker')).toEqual({
        baseOptions: { modelAssetBuffer: bytes, delegate: 'GPU' },
        runningMode: 'IMAGE',
        numPoses: 1,
      })
    })

    it('forwards numPoses and video mode', async () => {
      await createPoseLandmarker(bytes, { numPoses: 2, runningMode: 'VIDEO' })
      expect(lastOptions('PoseLandmarker')).toEqual({
        baseOptions: { modelAssetBuffer: bytes, delegate: 'GPU' },
        runningMode: 'VIDEO',
        numPoses: 2,
      })
    })
  })

  describe('createImageSegmenter', () => {
    it('defaults to category masks only', async () => {
      await createImageSegmenter(bytes)
      expect(lastOptions('ImageSegmenter')).toEqual({
        baseOptions: { modelAssetBuffer: bytes, delegate: 'GPU' },
        runningMode: 'IMAGE',
        outputCategoryMask: true,
        outputConfidenceMasks: false,
      })
    })

    it('forwards mask output toggles', async () => {
      await createImageSegmenter(bytes, { outputCategoryMask: false, outputConfidenceMasks: true, acceleration: 'cpu' })
      expect(lastOptions('ImageSegmenter')).toEqual({
        baseOptions: { modelAssetBuffer: bytes, delegate: 'CPU' },
        runningMode: 'IMAGE',
        outputCategoryMask: false,
        outputConfidenceMasks: true,
      })
    })
  })

  describe('createObjectDetector', () => {
    it('passes defaults: 0.4 score threshold, 10 results, IMAGE mode', async () => {
      await createObjectDetector(bytes)
      expect(lastOptions('ObjectDetector')).toEqual({
        baseOptions: { modelAssetBuffer: bytes, delegate: 'GPU' },
        runningMode: 'IMAGE',
        scoreThreshold: 0.4,
        maxResults: 10,
      })
    })

    it('forwards confidence and maxResults', async () => {
      await createObjectDetector(bytes, { confidence: 0.55, maxResults: 3, runningMode: 'VIDEO' })
      expect(lastOptions('ObjectDetector')).toEqual({
        baseOptions: { modelAssetBuffer: bytes, delegate: 'GPU' },
        runningMode: 'VIDEO',
        scoreThreshold: 0.55,
        maxResults: 3,
      })
    })
  })

  describe('GPU to CPU fallback', () => {
    it("retries CPU when GPU creation throws and acceleration is 'auto'", async () => {
      h.failGpu.add('ObjectDetector')
      try {
        const before = callsFor('ObjectDetector').length
        const instance = await createObjectDetector(bytes, { acceleration: 'auto' })
        const tries = callsFor('ObjectDetector').slice(before)
        expect(tries.map((t) => t.options.baseOptions)).toEqual([
          { modelAssetBuffer: bytes, delegate: 'GPU' },
          { modelAssetBuffer: bytes, delegate: 'CPU' },
        ])
        expect(tries[0]!.failed).toBe(true)
        expect(tries[1]!.failed).toBe(false)
        expect(instance).toBe(tries[1]!.instance) // the CPU instance is what callers get
      } finally {
        h.failGpu.delete('ObjectDetector')
      }
    })

    it("treats omitted acceleration as 'auto' (documented default)", async () => {
      h.failGpu.add('ImageSegmenter')
      try {
        const before = callsFor('ImageSegmenter').length
        await createImageSegmenter(bytes) // no acceleration option at all
        expect(delegates('ImageSegmenter').slice(before)).toEqual(['GPU', 'CPU'])
      } finally {
        h.failGpu.delete('ImageSegmenter')
      }
    })

    it("with acceleration 'cpu' the GPU delegate is never attempted", async () => {
      h.failGpu.add('FaceLandmarker')
      try {
        const before = callsFor('FaceLandmarker').length
        const instance = await createFaceLandmarker(bytes, { acceleration: 'cpu' })
        expect(delegates('FaceLandmarker').slice(before)).toEqual(['CPU'])
        expect(instance).toBe(callsFor('FaceLandmarker').at(-1)!.instance)
      } finally {
        h.failGpu.delete('FaceLandmarker')
      }
    })

    it("with acceleration 'gpu' the original error is rethrown, no CPU retry", async () => {
      h.failGpu.add('FaceLandmarker')
      try {
        const before = callsFor('FaceLandmarker').length
        await expect(createFaceLandmarker(bytes, { acceleration: 'gpu' })).rejects.toThrow('WebGL is not available')
        expect(delegates('FaceLandmarker').slice(before)).toEqual(['GPU'])
      } finally {
        h.failGpu.delete('FaceLandmarker')
      }
    })
  })

  it('setWasmBase re-points fileset resolution and the result is cached again', async () => {
    const callsBefore = h.module.FilesetResolver.forVisionTasks.mock.calls.length
    setWasmBase('/self-hosted/mediapipe/wasm')
    await createPoseLandmarker(bytes)
    await createImageSegmenter(bytes) // shares the re-resolved fileset
    const calls = h.module.FilesetResolver.forVisionTasks.mock.calls
    expect(calls.length).toBe(callsBefore + 1)
    expect(calls.at(-1)![0]).toBe('/self-hosted/mediapipe/wasm')
  })
})
