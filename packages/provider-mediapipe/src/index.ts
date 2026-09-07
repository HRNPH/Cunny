/**
 * @cunny-ai/provider-mediapipe — the MediaPipe runtime boundary.
 *
 * The one place that touches @mediapipe/tasks-vision, pinned at 1.0.1: wasm is
 * fetched from jsdelivr by default, and setWasmBase() points it at a self
 * hosted copy. Factories: createFaceDetector, createFaceLandmarker,
 * createPoseLandmarker, createImageSegmenter, createObjectDetector. Acceleration
 * 'auto' retries cpu after a gpu throw, and an omitted acceleration is auto.
 * MediaPipe type re-exports live here so task packages never pin the runtime.
 *
 * @example
 * ```ts
 * import { createFaceDetector, setWasmBase } from '@cunny-ai/provider-mediapipe'
 *
 * setWasmBase('/static/mediapipe/wasm') // optional: self host the wasm files
 * const detector = await createFaceDetector(modelBytes, { acceleration: 'auto' })
 * ```
 */
export type {
  FaceDetector, FaceLandmarker, ImageSegmenter, ObjectDetector, PoseLandmarker,
} from '@mediapipe/tasks-vision'
import type {
  FaceDetector as MpFaceDetector,
  FaceLandmarker as MpFaceLandmarker,
  ImageSegmenter as MpImageSegmenter,
  ObjectDetector as MpObjectDetector,
  PoseLandmarker as MpPoseLandmarker,
} from '@mediapipe/tasks-vision'

const MEDIAPIPE_VERSION = '1.0.1'
const DEFAULT_WASM_BASE = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MEDIAPIPE_VERSION}/wasm`

let wasmBase: string = DEFAULT_WASM_BASE
/**
 * Self-host: point at your own copy of the tasks-vision `/wasm` directory
 * (copy it from `node_modules/@mediapipe/tasks-vision/wasm`). Applies to every
 * task package sharing this provider.
 *
 * @example
 * ```ts
 * import { setWasmBase } from '@cunny-ai/provider-mediapipe'
 * setWasmBase('/static/mediapipe/wasm')
 * ```
 */
export function setWasmBase(base: string): void {
  wasmBase = base
  filesetPromise = undefined
}

type MediaPipe = typeof import('@mediapipe/tasks-vision')
let mpPromise: Promise<MediaPipe> | undefined
let filesetPromise: Promise<Awaited<ReturnType<MediaPipe['FilesetResolver']['forVisionTasks']>>> | undefined

async function loadRuntimes() {
  mpPromise ??= import('@mediapipe/tasks-vision')
  const mp = await mpPromise
  filesetPromise ??= mp.FilesetResolver.forVisionTasks(wasmBase)
  return { mp, fileset: await filesetPromise }
}

/** Session knobs shared by every factory in this package. */
export interface SessionOptions {
  /** 'auto' tries GPU (WebGL) then falls back to CPU/wasm. Default 'auto'. */
  acceleration?: 'auto' | 'cpu' | 'gpu'
  /** 'IMAGE' for stills, 'VIDEO' for per-frame calls. Default 'IMAGE'. */
  runningMode?: 'IMAGE' | 'VIDEO'
}

async function withFallback<T>(
  acceleration: SessionOptions['acceleration'],
  make: (delegate: 'CPU' | 'GPU') => Promise<T>,
): Promise<T> {
  const accel = acceleration ?? 'auto' // documented default: omitted acceleration behaves like 'auto'
  try {
    return await make(accel === 'cpu' ? 'CPU' : 'GPU')
  } catch (err) {
    if (accel !== 'auto') throw err
    return make('CPU') // GPU delegate unavailable (no WebGL, blocklist) — silently degrade
  }
}

/** Create a MediaPipe FaceDetector from tflite model bytes. */
export async function createFaceDetector(
  model: Uint8Array,
  opts: SessionOptions & { confidence?: number; suppression?: number } = {},
): Promise<MpFaceDetector> {
  const { mp, fileset } = await loadRuntimes()
  return withFallback(opts.acceleration, (delegate) =>
    mp.FaceDetector.createFromOptions(fileset, {
      baseOptions: { modelAssetBuffer: model, delegate },
      runningMode: opts.runningMode ?? 'IMAGE',
      minDetectionConfidence: opts.confidence ?? 0.5,
      minSuppressionThreshold: opts.suppression ?? 0.3,
    }))
}

/** Create a MediaPipe FaceLandmarker (mesh, blendshapes) from model bytes. */
export async function createFaceLandmarker(
  model: Uint8Array,
  opts: SessionOptions & { numFaces?: number; blendshapes?: boolean; transformationMatrices?: boolean } = {},
): Promise<MpFaceLandmarker> {
  const { mp, fileset } = await loadRuntimes()
  return withFallback(opts.acceleration, (delegate) =>
    mp.FaceLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetBuffer: model, delegate },
      runningMode: opts.runningMode ?? 'IMAGE',
      numFaces: opts.numFaces ?? 1,
      outputFaceBlendshapes: opts.blendshapes ?? true,
      outputFacialTransformationMatrixes: opts.transformationMatrices ?? true,
    }))
}

/** Create a MediaPipe PoseLandmarker from model bytes. */
export async function createPoseLandmarker(
  model: Uint8Array,
  opts: SessionOptions & { numPoses?: number } = {},
): Promise<MpPoseLandmarker> {
  const { mp, fileset } = await loadRuntimes()
  return withFallback(opts.acceleration, (delegate) =>
    mp.PoseLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetBuffer: model, delegate },
      runningMode: opts.runningMode ?? 'IMAGE',
      numPoses: opts.numPoses ?? 1,
    }))
}

/** Create a MediaPipe ImageSegmenter from model bytes. */
export async function createImageSegmenter(
  model: Uint8Array,
  opts: SessionOptions & { outputCategoryMask?: boolean; outputConfidenceMasks?: boolean } = {},
): Promise<MpImageSegmenter> {
  const { mp, fileset } = await loadRuntimes()
  return withFallback(opts.acceleration, (delegate) =>
    mp.ImageSegmenter.createFromOptions(fileset, {
      baseOptions: { modelAssetBuffer: model, delegate },
      runningMode: opts.runningMode ?? 'IMAGE',
      outputCategoryMask: opts.outputCategoryMask ?? true,
      outputConfidenceMasks: opts.outputConfidenceMasks ?? false,
    }))
}

/** Create a MediaPipe ObjectDetector from model bytes. */
export async function createObjectDetector(
  model: Uint8Array,
  opts: SessionOptions & { confidence?: number; maxResults?: number } = {},
): Promise<MpObjectDetector> {
  const { mp, fileset } = await loadRuntimes()
  return withFallback(opts.acceleration, (delegate) =>
    mp.ObjectDetector.createFromOptions(fileset, {
      baseOptions: { modelAssetBuffer: model, delegate },
      runningMode: opts.runningMode ?? 'IMAGE',
      scoreThreshold: opts.confidence ?? 0.4,
      maxResults: opts.maxResults ?? 10,
    }))
}
