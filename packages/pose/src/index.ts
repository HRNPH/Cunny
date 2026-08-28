/**
 * @cunny-ai/pose — MediaPipe Pose Landmarker: 33 normalized + world (meters) landmarks.
 * Named landmark constants kill magic-number code in userland.
 */
import { getDefaultEngine, listModels } from '@cunny-ai/core'
import { createPoseLandmarker } from '@cunny-ai/provider-mediapipe'
import type { PoseLandmarker as MpPoseLandmarker } from '@cunny-ai/provider-mediapipe'

const TASK = 'pose'

/** Named landmark indices — mediapipe's 33-keypoint skeleton. */
export const POSE_LANDMARKS = {
  NOSE: 0, LEFT_EYE_INNER: 1, LEFT_EYE: 2, LEFT_EYE_OUTER: 3, RIGHT_EYE_INNER: 4, RIGHT_EYE: 5, RIGHT_EYE_OUTER: 6,
  LEFT_EAR: 7, RIGHT_EAR: 8, MOUTH_LEFT: 9, MOUTH_RIGHT: 10, LEFT_SHOULDER: 11, RIGHT_SHOULDER: 12,
  LEFT_ELBOW: 13, RIGHT_ELBOW: 14, LEFT_WRIST: 15, RIGHT_WRIST: 16, LEFT_PINKY: 17, RIGHT_PINKY: 18,
  LEFT_INDEX: 19, RIGHT_INDEX: 20, LEFT_THUMB: 21, RIGHT_THUMB: 22, LEFT_HIP: 23, RIGHT_HIP: 24,
  LEFT_KNEE: 25, RIGHT_KNEE: 26, LEFT_ANKLE: 27, RIGHT_ANKLE: 28, LEFT_HEEL: 29, RIGHT_HEEL: 30,
  LEFT_FOOT_INDEX: 31, RIGHT_FOOT_INDEX: 32,
} as const

/** Skeleton connections (index pairs) for drawing stick figures. */
export const POSE_CONNECTIONS: Array<[number, number]> = [
  [11, 12], [11, 13], [13, 15], [12, 14], [14, 16], [11, 23], [12, 24], [23, 24],
  [23, 25], [25, 27], [24, 26], [26, 28], [27, 31], [28, 32], [15, 19], [16, 20],
]

export type PoseSource = Blob | File | ImageBitmap | HTMLImageElement | HTMLCanvasElement | string

export interface Landmark { x: number; y: number; z: number; visibility?: number }

export interface Pose {
  /** Normalized [0,1] landmarks, origin top-left. */
  landmarks: Landmark[]
  /** World landmarks in meters, hip-centered — use these for real 3D math. */
  worldLandmarks: Landmark[]
}

export interface PoseOptions {
  /** 'lite' (5.5MB) | 'full' (9MB) | 'heavy' (29MB) | tier alias. Default 'lite'. */
  model?: string
  numPoses?: number
  acceleration?: 'auto' | 'cpu' | 'gpu'
  onProgress?: (info: { loaded: number; total: number }) => void
}

export interface TrackPoseOptions extends PoseOptions {
  fps?: number
}

export function models() {
  return listModels(TASK)
}

let landmarkerPromise: Promise<MpPoseLandmarker> | undefined

async function getLandmarker(opts: PoseOptions = {}, runningMode: 'IMAGE' | 'VIDEO' = 'IMAGE', numPoses = 1): Promise<MpPoseLandmarker> {
  if (runningMode === 'IMAGE' && !opts.model && landmarkerPromise) return landmarkerPromise
  const p = (async () => {
    const model = await getDefaultEngine().loadModel(TASK, { model: opts.model ?? 'lite', onProgress: opts.onProgress })
    return createPoseLandmarker(new Uint8Array(model.bytes), { acceleration: opts.acceleration, runningMode, numPoses })
  })()
  if (runningMode === 'IMAGE' && !opts.model) landmarkerPromise = p
  return p
}

async function toBitmap(source: PoseSource): Promise<{ bitmap: ImageBitmap; close: boolean }> {
  if (typeof source === 'string') {
    const blob = await (await fetch(source, { mode: 'cors' })).blob()
    return { bitmap: await createImageBitmap(blob), close: true }
  }
  if (source instanceof Blob) return { bitmap: await createImageBitmap(source), close: true }
  if (source instanceof ImageBitmap) return { bitmap: source, close: false }
  if (source instanceof HTMLImageElement) {
    if (!source.complete) await source.decode().catch(() => {})
    return { bitmap: await createImageBitmap(source), close: true }
  }
  return { bitmap: await createImageBitmap(source as HTMLCanvasElement), close: true }
}

type MpResult = {
  landmarks: Array<Array<{ x: number; y: number; z: number; visibility?: number }>>
  worldLandmarks: Array<Array<{ x: number; y: number; z: number; visibility?: number }>>
}

const mapPose = (r: MpResult): Pose[] =>
  r.landmarks.map((lms, i) => ({
    landmarks: lms.map((p) => ({ ...p })),
    worldLandmarks: (r.worldLandmarks[i] ?? []).map((p) => ({ ...p })),
  }))

/** One-shot pose estimation from a still image. */
export async function detectPose(source: PoseSource, opts: PoseOptions = {}): Promise<{ poses: Pose[]; elapsedMs: number }> {
  const { bitmap, close } = await toBitmap(source)
  try {
    const landmarker = await getLandmarker(opts, 'IMAGE', opts.numPoses ?? 1)
    const t0 = performance.now()
    const result = landmarker.detect(bitmap) as unknown as MpResult
    return { poses: mapPose(result), elapsedMs: performance.now() - t0 }
  } finally {
    if (close) bitmap.close()
  }
}

/** Realtime pose tracking over a `<video>` element. */
export function trackPose(
  video: HTMLVideoElement,
  cb: (poses: Pose[], elapsedMs: number) => void,
  opts: TrackPoseOptions = {},
): () => void {
  let stopped = false
  let lastRun = 0
  const interval = 1000 / (opts.fps ?? 24)
  let landmarker: Promise<MpPoseLandmarker> | undefined

  const raf = (now: number) => {
    if (stopped) return
    if (now - lastRun >= interval && video.readyState >= 2) {
      lastRun = now
      landmarker ??= getLandmarker(opts, 'VIDEO', opts.numPoses ?? 1)
      void landmarker.then((l) => {
        if (stopped) return
        const t0 = performance.now()
        const result = l.detectForVideo(video, performance.now()) as unknown as MpResult
        cb(mapPose(result), performance.now() - t0)
      }).catch(() => { /* first frames race model download */ })
    }
    requestAnimationFrame(raf)
  }
  requestAnimationFrame(raf)

  return () => {
    stopped = true
    void landmarker?.then((l) => l.close())
  }
}
