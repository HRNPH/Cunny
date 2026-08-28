import { getDefaultEngine, listModels } from '@cunny-ai/core'
import { createFaceDetector as createMpDetector } from '@cunny-ai/provider-mediapipe'
import type { FaceDetector as MpFaceDetector } from '@cunny-ai/provider-mediapipe'
import type {
  DetectOptions, DetectResult, DetectSource, Face, FaceDetectorInstance,
} from './types.js'

const TASK = 'face-detect'

export interface CreateOptions extends DetectOptions {
  /** Progress while the model weights download (first time only). */
  onProgress?: (info: { loaded: number; total: number }) => void
  runningMode?: 'IMAGE' | 'VIDEO'
}

export function models() {
  return listModels(TASK)
}

export async function createFaceDetector(opts: CreateOptions = {}): Promise<FaceDetectorInstance> {
  const {
    confidence = 0.5, suppression = 0.3, maxFaces = 5,
    acceleration = 'auto', onProgress, runningMode = 'IMAGE',
  } = opts

  const model = await getDefaultEngine().loadModel(TASK, {
    model: opts.model,
    onProgress,
  })
  const detector = await createMpDetector(new Uint8Array(model.bytes), {
    acceleration, runningMode, confidence, suppression,
  })

  return {
    detect(source: DetectSource): Promise<DetectResult> {
      return detectWith(detector, source, maxFaces)
    },
    detectVideo(video: HTMLVideoElement, timestampMs?: number): DetectResult {
      const t0 = performance.now()
      const result = detector.detectForVideo(video, timestampMs ?? performance.now())
      const faces = limit(mapFaces(result.detections as unknown as MpDetection[], video.videoWidth, video.videoHeight), maxFaces)
      return { faces, width: video.videoWidth, height: video.videoHeight, elapsedMs: performance.now() - t0 }
    },
    close() {
      detector.close()
    },
  }
}

type MpImageSource = Parameters<MpFaceDetector['detect']>[0]

/** Normalize any source into something mediapipe accepts, tracking bitmap ownership. */
async function toImageSource(source: DetectSource): Promise<{
  source: MpImageSource
  bitmap?: ImageBitmap
  width: number
  height: number
}> {
  if (typeof source === 'string') {
    const blob = await (await fetch(source, { mode: 'cors' })).blob()
    return toImageSource(blob)
  }
  if (source instanceof Blob) {
    const bitmap = await createImageBitmap(source)
    return { source: bitmap, bitmap, width: bitmap.width, height: bitmap.height }
  }
  if (source instanceof ImageBitmap) {
    return { source, width: source.width, height: source.height }
  }
  if (source instanceof HTMLImageElement) {
    if (!source.complete) await source.decode().catch(() => {})
    return { source, width: source.naturalWidth, height: source.naturalHeight }
  }
  return { source, width: source.width, height: source.height } // HTMLCanvasElement | OffscreenCanvas
}

type MpDetection = {
  boundingBox?: { originX: number; originY: number; width: number; height: number }
  categories: Array<{ score: number; categoryName?: string }>
  keypoints?: Array<{ x: number; y: number }>
}

function mapFaces(detections: MpDetection[], width: number, height: number): Face[] {
  return detections.map((d) => {
    const bb = d.boundingBox ?? { originX: 0, originY: 0, width: 0, height: 0 }
    return {
      score: d.categories[0]?.score ?? 0,
      box: { x: bb.originX, y: bb.originY, width: bb.width, height: bb.height },
      normalized: {
        x: bb.originX / width, y: bb.originY / height,
        width: bb.width / width, height: bb.height / height,
      },
      keypoints: (d.keypoints ?? []).map((k) => ({ x: k.x, y: k.y })),
    }
  })
}

function limit(faces: Face[], max: number): Face[] {
  return faces.sort((a, b) => b.score - a.score).slice(0, max)
}

async function detectWith(detector: MpFaceDetector, source: DetectSource, maxFaces: number): Promise<DetectResult> {
  const { source: mpSource, bitmap, width, height } = await toImageSource(source)
  try {
    const t0 = performance.now()
    const result = detector.detect(mpSource)
    return {
      faces: limit(mapFaces(result.detections as unknown as MpDetection[], width, height), maxFaces),
      width, height,
      elapsedMs: performance.now() - t0,
    }
  } finally {
    bitmap?.close() // only close bitmaps we created
  }
}

/** Shared IMAGE-mode instance behind the one-shot detect() export. */
let defaultDetector: Promise<FaceDetectorInstance> | undefined

export function getDefaultDetector(opts: CreateOptions = {}): Promise<FaceDetectorInstance> {
  defaultDetector ??= createFaceDetector(opts)
  return defaultDetector
}
