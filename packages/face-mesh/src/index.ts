/**
 * @cunny-ai/face-mesh — 478-point face landmarks + blendshapes + head transform (MediaPipe, ~3MB).
 */
import { getDefaultEngine, listModels } from '@cunny-ai/core'
import { createFaceLandmarker } from '@cunny-ai/provider-mediapipe'
import type { FaceLandmarker as MpFaceLandmarker } from '@cunny-ai/provider-mediapipe'

const TASK = 'face-mesh'

export type MeshSource = Blob | File | ImageBitmap | HTMLImageElement | HTMLCanvasElement | string

export interface Landmark { x: number; y: number; z: number }

export interface FaceMesh {
  /** 478 normalized landmarks [0,1], origin top-left. */
  landmarks: Landmark[]
  /** 52 ARKit-style coefficient map, e.g. blendshapes['mouthSmileLeft'] = 0.73. */
  blendshapes: Record<string, number>
  /** 4×4 column-major head transform matrix (three.js-ready). */
  transform: Float32Array | null
}

export interface FaceMeshOptions {
  model?: string
  maxFaces?: number
  acceleration?: 'auto' | 'cpu' | 'gpu'
  onProgress?: (info: { loaded: number; total: number }) => void
}

export interface TrackMeshOptions extends FaceMeshOptions {
  fps?: number
}

export function models() {
  return listModels(TASK)
}

let landmarkerPromise: Promise<MpFaceLandmarker> | undefined

async function getLandmarker(opts: FaceMeshOptions = {}, runningMode: 'IMAGE' | 'VIDEO' = 'IMAGE', numFaces = 1): Promise<MpFaceLandmarker> {
  // First caller wins for IMAGE singleton; VIDEO callers create their own instance.
  if (runningMode === 'IMAGE' && !opts.model && landmarkerPromise) return landmarkerPromise
  const p = (async () => {
    const model = await getDefaultEngine().loadModel(TASK, { model: opts.model, onProgress: opts.onProgress })
    return createFaceLandmarker(new Uint8Array(model.bytes), {
      acceleration: opts.acceleration,
      runningMode,
      numFaces,
    })
  })()
  if (runningMode === 'IMAGE' && !opts.model) landmarkerPromise = p
  return p
}

async function toBitmap(source: MeshSource): Promise<{ bitmap: ImageBitmap; close: boolean }> {
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
  faceLandmarks: Array<Array<{ x: number; y: number; z: number }>>
  faceBlendshapes?: Array<{ categories: Array<{ categoryName?: string; score: number }> }>
  facialTransformationMatrixes?: Array<{ data: Float32Array | number[] }>
}

function mapResult(r: MpResult): FaceMesh[] {
  return r.faceLandmarks.map((lms, i) => {
    const blendshapes: Record<string, number> = {}
    for (const c of r.faceBlendshapes?.[i]?.categories ?? []) {
      if (c.categoryName) blendshapes[c.categoryName] = c.score
    }
    const m = r.facialTransformationMatrixes?.[i]?.data
    return {
      landmarks: lms.map((p) => ({ x: p.x, y: p.y, z: p.z ?? 0 })),
      blendshapes,
      transform: m ? new Float32Array(m) : null,
    }
  })
}

/** One-shot face mesh extraction from a still image. */
export async function faceMesh(source: MeshSource, opts: FaceMeshOptions = {}): Promise<{ faces: FaceMesh[]; elapsedMs: number }> {
  const { bitmap, close } = await toBitmap(source)
  try {
    const landmarker = await getLandmarker(opts, 'IMAGE', opts.maxFaces ?? 1)
    const t0 = performance.now()
    const result = landmarker.detect(bitmap) as unknown as MpResult
    return { faces: mapResult(result), elapsedMs: performance.now() - t0 }
  } finally {
    if (close) bitmap.close()
  }
}

/** Realtime face mesh tracking over a `<video>` element. Returns a stop function. */
export function trackFaces(
  video: HTMLVideoElement,
  cb: (faces: FaceMesh[], elapsedMs: number) => void,
  opts: TrackMeshOptions = {},
): () => void {
  let stopped = false
  let lastRun = 0
  const interval = 1000 / (opts.fps ?? 24)

  let landmarker: Promise<MpFaceLandmarker> | undefined

  const raf = (now: number) => {
    if (stopped) return
    if (now - lastRun >= interval && video.readyState >= 2) {
      lastRun = now
      landmarker ??= getLandmarker(opts, 'VIDEO', opts.maxFaces ?? 1)
      void landmarker.then((l) => {
        if (stopped) return
        const t0 = performance.now()
        const result = l.detectForVideo(video, performance.now()) as unknown as MpResult
        cb(mapResult(result), performance.now() - t0)
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
