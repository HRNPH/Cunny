/**
 * @cunny-ai/detect — find objects in an image and label them with 80 COCO classes.
 *
 * `detect(source, { confidence, classes, maxResults })` returns detections
 * with `label`, `score`, a pixel `box`, and the same box `normalized` to [0,1];
 * `trackObjects(video, cb, { fps })` is the realtime variant over a `<video>`
 * element. The default model is efficientdet-lite0 int8 (4.4MB, Apache-2.0,
 * 80 COCO classes) running on wasm via @cunny-ai/provider-mediapipe with GPU
 * optional; the cpu delegate is the default because on some GPU setups the
 * efficientdet GPU delegate runs but returns zero detections, so acceleration
 * 'auto' is opt in. The model downloads on the first call with progress
 * events, then stays cached in the Cache API.
 *
 * @example
 * ```ts
 * import { detect } from '@cunny-ai/detect'
 *
 * const { detections } = await detect(photo, { classes: ['person'], confidence: 0.4 })
 * detections[0].label      // 'person'
 * detections[0].score      // 0.87
 * detections[0].normalized // same box in [0,1]
 * ```
 */
import { getDefaultEngine, listModels } from '@cunny-ai/core'
import { createObjectDetector } from '@cunny-ai/provider-mediapipe'
import type { ObjectDetector as MpObjectDetector } from '@cunny-ai/provider-mediapipe'

const TASK = 'detect'

/** Anything decodable into an ImageBitmap: file, blob, bitmap, `<img>`, canvas, or URL. */
export type DetectSource = Blob | File | ImageBitmap | HTMLImageElement | HTMLCanvasElement | string

export interface Detection {
  /** COCO class name, e.g. 'person'. */
  label: string
  /** Confidence in [0,1]. */
  score: number
  /** Pixel box in the input image's coordinate space, origin top-left. */
  box: { x: number; y: number; width: number; height: number }
  /** Same box normalized [0,1] — resolution-independent (SDK-wide convention). */
  normalized: { x: number; y: number; width: number; height: number }
}

export interface DetectResult {
  /** Detections that passed the confidence threshold. */
  detections: Detection[]
  /** Input dimensions the pixel boxes refer to. */
  width: number
  /** Input dimensions the pixel boxes refer to. */
  height: number
  /** Inference time (ms), excluding model download/init. */
  elapsedMs: number
}

export interface DetectOptions {
  /** Model id or tier alias. Default = curated default. See models(). */
  model?: string
  /** Minimum confidence to keep a detection. */
  confidence?: number
  /** Max detections returned. */
  maxResults?: number
  /** Restrict to classes, e.g. ['person', 'car']. */
  classes?: string[]
  /**
   * Defaults to 'cpu': on some GPU setups the efficientdet GPU delegate runs
   * without error but returns zero detections, so 'auto' is opt-in here.
   */
  acceleration?: 'auto' | 'cpu' | 'gpu'
  /** Download progress for the first model load. */
  onProgress?: (info: { loaded: number; total: number }) => void
}

/** Available models for this task: id, tier, sizeMB. */
export function models() {
  return listModels(TASK)
}

async function toBitmap(source: DetectSource): Promise<{ bitmap: ImageBitmap; close: boolean }> {
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

type MpDetection = {
  boundingBox?: { originX: number; originY: number; width: number; height: number }
  categories: Array<{ score: number; categoryName?: string; displayName?: string }>
}

function mapDetections(dets: MpDetection[], w: number, h: number, classes?: string[]): Detection[] {
  return dets
    .filter((d) => {
      const label = d.categories[0]?.categoryName ?? d.categories[0]?.displayName ?? ''
      return !classes || classes.includes(label)
    })
    .map((d) => {
      const bb = d.boundingBox ?? { originX: 0, originY: 0, width: 0, height: 0 }
      return {
        label: d.categories[0]?.categoryName ?? d.categories[0]?.displayName ?? 'object',
        score: d.categories[0]?.score ?? 0,
        box: { x: bb.originX, y: bb.originY, width: bb.width, height: bb.height },
        normalized: { x: bb.originX / w, y: bb.originY / h, width: bb.width / w, height: bb.height / h },
      }
    })
}

let detectorPromise: Promise<MpObjectDetector> | undefined

async function getImageDetector(opts: DetectOptions): Promise<MpObjectDetector> {
  detectorPromise ??= (async () => {
    const model = await getDefaultEngine().loadModel(TASK, { model: opts.model, onProgress: opts.onProgress })
    return createObjectDetector(new Uint8Array(model.bytes), {
      acceleration: opts.acceleration ?? 'cpu',
      confidence: opts.confidence,
      maxResults: opts.maxResults,
    })
  })()
  return detectorPromise
}

/** One-shot object detection. */
export async function detect(source: DetectSource, opts: DetectOptions = {}): Promise<DetectResult> {
  const { bitmap, close } = await toBitmap(source)
  try {
    const detector = await getImageDetector(opts)
    const t0 = performance.now()
    const result = detector.detect(bitmap as never) as unknown as { detections: MpDetection[] }
    return {
      detections: mapDetections(result.detections, bitmap.width, bitmap.height, opts.classes),
      width: bitmap.width,
      height: bitmap.height,
      elapsedMs: performance.now() - t0,
    }
  } finally {
    if (close) bitmap.close()
  }
}

/** Realtime detection over a `<video>` element. Returns a stop function. */
export function trackObjects(
  video: HTMLVideoElement,
  cb: (detections: Detection[], elapsedMs: number) => void,
  opts: DetectOptions & { fps?: number } = {},
): () => void {
  let stopped = false
  let lastRun = 0
  const interval = 1000 / (opts.fps ?? 24)
  let detector: Promise<MpObjectDetector> | undefined

  const raf = (now: number) => {
    if (stopped) return
    if (now - lastRun >= interval && video.readyState >= 2) {
      lastRun = now
      detector ??= (async () => {
        const model = await getDefaultEngine().loadModel(TASK, { model: opts.model, onProgress: opts.onProgress })
        return createObjectDetector(new Uint8Array(model.bytes), {
          acceleration: opts.acceleration ?? 'cpu', confidence: opts.confidence,
          maxResults: opts.maxResults, runningMode: 'VIDEO',
        })
      })()
      void detector.then((d) => {
        if (stopped) return
        const t0 = performance.now()
        const result = d.detectForVideo(video, performance.now()) as unknown as { detections: MpDetection[] }
        cb(mapDetections(result.detections, video.videoWidth, video.videoHeight, opts.classes), performance.now() - t0)
      }).catch(() => { /* first frames race model download */ })
    }
    requestAnimationFrame(raf)
  }
  requestAnimationFrame(raf)

  return () => {
    stopped = true
    void detector?.then((d) => d.close())
  }
}
