import { createFaceDetector, getDefaultDetector } from './detector.js'
import type {
  DetectOptions, DetectResult, DetectSource, Face, FaceDetectorInstance,
  TrackCallback, TrackOptions,
} from './types.js'

export type {
  DetectOptions, DetectResult, DetectSource, Face, FaceDetectorInstance,
  TrackCallback, TrackOptions,
} from './types.js'
export { createFaceDetector, models } from './detector.js'

/**
 * One-shot face detection. Downloads the model on first use (~450KB, cached
 * across visits), then runs locally — no server, ever.
 *
 * @example
 * ```ts
 * import { detect } from '@cunny-ai/face-detect'
 *
 * const { faces } = await detect(file) // Blob | File | URL | ImageBitmap | …
 * faces[0].score          // 0.92
 * faces[0].box            // pixel box { x, y, width, height }
 * faces[0].normalized     // same box in [0,1]
 * faces[0].keypoints      // 5 points: eyes, nose tip, mouth corners
 * ```
 *
 * Prefer another model? `models()` lists options; pass `model: 'quality'`
 * (tier alias) or an exact model id — result shape never changes.
 */
export async function detect(
  source: DetectSource,
  opts: DetectOptions & { onProgress?: (info: { loaded: number; total: number }) => void } = {},
): Promise<DetectResult> {
  const { onProgress, ...detectOpts } = opts
  const detector = await getDefaultDetector({ ...detectOpts, onProgress })
  return detector.detect(source)
}

/**
 * Realtime face tracking over a `<video>` element (webcam, file, stream).
 * Runs its own detector instance in VIDEO mode at a throttled fps.
 *
 * @example
 * ```ts
 * import { trackFaces } from '@cunny-ai/face-detect'
 *
 * const stop = trackFaces(videoEl, (faces) => draw(faces), { fps: 24 })
 * // …later
 * stop()
 * ```
 */
export function trackFaces(
  video: HTMLVideoElement,
  cb: TrackCallback,
  opts: TrackOptions = {},
): () => void {
  let stopped = false
  let lastRun = 0
  const interval = 1000 / (opts.fps ?? 24)

  const raf = (now: number) => {
    if (stopped) return
    if (now - lastRun >= interval && video.readyState >= 2) {
      lastRun = now
      void tick()
    }
    requestAnimationFrame(raf)
  }

  let detectorPromise: Promise<FaceDetectorInstance> | undefined
  async function tick() {
    detectorPromise ??= createFaceDetector({ ...opts, runningMode: 'VIDEO' })
    try {
      const detector = await detectorPromise
      const result = detector.detectVideo(video)
      cb(result.faces, result)
    } catch {
      // First frames may race model download; skip until ready.
    }
  }

  requestAnimationFrame(raf)
  return () => {
    stopped = true
    void detectorPromise?.then((d) => d.close())
  }
}
