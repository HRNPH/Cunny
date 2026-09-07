/**
 * @cunny-ai/bg-remove — cut the subject out of an image and drop the background.
 *
 * `removeBackground(source)` returns the person-only cutout as a transparent
 * PNG `Blob`; `mask()` returns the raw grayscale mask and `cutoutStream(stream)`
 * runs the same segmentation on a live video stream for realtime background
 * replacement. The default model is the MediaPipe selfie segmentation model
 * (250KB, Apache-2.0), which runs on wasm via @cunny-ai/provider-mediapipe with
 * GPU acceleration optional. It downloads on the first call with progress
 * events, then stays cached in the Cache API.
 *
 * @example
 * ```ts
 * import { removeBackground } from '@cunny-ai/bg-remove'
 *
 * const png = await removeBackground(photo, { feather: 2 }) // transparent PNG Blob
 * const url = URL.createObjectURL(png)                      // ready for an `<img>` src
 * ```
 */
import { getDefaultEngine, listModels } from '@cunny-ai/core'
import { createImageSegmenter } from '@cunny-ai/provider-mediapipe'
import type { ImageSegmenter as MpImageSegmenter } from '@cunny-ai/provider-mediapipe'

const TASK = 'bg-remove'

/** Anything decodable into an ImageBitmap: file, blob, bitmap, `<img>`, canvas, or URL. */
export type BgSource = Blob | File | ImageBitmap | HTMLImageElement | HTMLCanvasElement | string

/** Options for one-shot background removal. */
export interface RemoveOptions {
  /** Edge softness in px. Default 0 (hard cut). */
  feather?: number
  /** Model id or tier alias. Default = curated default. See models(). */
  model?: string
  /** Compute delegate; 'auto' prefers GPU and falls back to wasm. */
  acceleration?: 'auto' | 'cpu' | 'gpu'
  /** Download progress for the first model load. */
  onProgress?: (info: { loaded: number; total: number }) => void
}

export interface MaskResult {
  /** Full-resolution grayscale alpha mask (255 = person). */
  mask: ImageData
  /** Mask width in px (matches the input). */
  width: number
  /** Mask height in px (matches the input). */
  height: number
  /** Inference time (ms), excluding model download/init. */
  elapsedMs: number
}

/** Options for realtime background replacement via cutoutStream(). */
export interface CutoutStreamOptions {
  /** Replacement background: 'transparent', 'blur', a CSS color, or an image/canvas. */
  background: 'transparent' | 'blur' | string | ImageBitmap | HTMLImageElement | HTMLCanvasElement
  /** Blur radius in px when background is 'blur'. Default 12. */
  blurAmount?: number
  /** Target compositor fps. Default 30. */
  fps?: number
  /** Edge softness in px. Default 1. */
  feather?: number
  /** Model id or tier alias. Default = curated default. See models(). */
  model?: string
  /** Download progress for the first model load. */
  onProgress?: (info: { loaded: number; total: number }) => void
}

/** Available models for this task: id, tier, sizeMB. */
export function models() {
  return listModels(TASK)
}

let segmenterPromise: Promise<MpImageSegmenter> | undefined

async function getSegmenter(opts: { model?: string; acceleration?: 'auto' | 'cpu' | 'gpu'; onProgress?: (i: { loaded: number; total: number }) => void } = {}): Promise<MpImageSegmenter> {
  segmenterPromise ??= (async () => {
    const model = await getDefaultEngine().loadModel(TASK, { model: opts.model, onProgress: opts.onProgress })
    return createImageSegmenter(new Uint8Array(model.bytes), { acceleration: opts.acceleration })
  })()
  return segmenterPromise
}

async function toBitmap(source: BgSource): Promise<{ bitmap: ImageBitmap; close: boolean }> {
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

interface SegMask {
  data: Uint8Array
  width: number
  height: number
  personIdx: number
}

function segmentImageSync(segmenter: MpImageSegmenter, src: CanvasImageSource, videoTs?: number): SegMask {
  let out: SegMask | undefined
  const onResult = (result: { categoryMask?: { getAsUint8Array(): Uint8Array; width: number; height: number; close(): void } }) => {
    const cm = result.categoryMask
    if (!cm) throw new Error('@cunny-ai/bg-remove: segmenter returned no category mask')
    try {
      const data = cm.getAsUint8Array()
      const labels = (segmenter as unknown as { getLabels?: () => string[] }).getLabels?.() ?? []
      let personIdx = labels.findIndex((l) => /person|selfie/i.test(l))
      if (personIdx < 0) personIdx = data.length ? (majority(data) === 0 ? 1 : 0) : 1
      out = { data, width: cm.width, height: cm.height, personIdx }
    } finally {
      cm.close()
    }
  }
  if (videoTs !== undefined) {
    ;(segmenter as unknown as { segmentForVideo(s: CanvasImageSource, ts: number, cb: never): void })
      .segmentForVideo(src as never, videoTs, onResult as never)
  } else {
    segmenter.segment(src as never, onResult as never)
  }
  return out!
}

function majority(arr: Uint8Array): number {
  // 256-value histogram, majority bucket — used only when labels are unavailable.
  const hist = new Uint32Array(256)
  for (let i = 0; i < arr.length; i++) hist[arr[i]]++
  let best = 0
  for (let v = 1; v < 256; v++) if (hist[v] > hist[best]) best = v
  return best
}

/** Build a full-size alpha mask (255=person) as ImageData. */
function alphaMask(seg: SegMask, w: number, h: number, feather: number): HTMLCanvasElement {
  const small = document.createElement('canvas')
  small.width = seg.width
  small.height = seg.height
  const sctx = small.getContext('2d')!
  const img = sctx.createImageData(seg.width, seg.height)
  for (let i = 0; i < seg.data.length; i++) {
    const on = seg.data[i] === seg.personIdx ? 255 : 0
    img.data[i * 4] = 255
    img.data[i * 4 + 1] = 255
    img.data[i * 4 + 2] = 255
    img.data[i * 4 + 3] = on
  }
  sctx.putImageData(img, 0, 0)

  const full = document.createElement('canvas')
  full.width = w
  full.height = h
  const fctx = full.getContext('2d')!
  fctx.imageSmoothingEnabled = true
  if (feather > 0) fctx.filter = `blur(${feather}px)`
  fctx.drawImage(small, 0, 0, w, h)
  return full
}

/** Person-only cutout as an alpha PNG. */
export async function removeBackground(source: BgSource, opts: RemoveOptions = {}): Promise<Blob> {
  const { bitmap, close } = await toBitmap(source)
  try {
    const segmenter = await getSegmenter(opts)
    const t0 = performance.now()
    void t0
    const seg = segmentImageSync(segmenter, bitmap)
    const out = document.createElement('canvas')
    out.width = bitmap.width
    out.height = bitmap.height
    const ctx = out.getContext('2d')!
    ctx.drawImage(bitmap, 0, 0)
    ctx.globalCompositeOperation = 'destination-in'
    ctx.drawImage(alphaMask(seg, bitmap.width, bitmap.height, opts.feather ?? 0), 0, 0)
    return await new Promise<Blob>((resolve, reject) =>
      out.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/png'))
  } finally {
    if (close) bitmap.close()
  }
}

/** Full-resolution grayscale mask (255 = person). */
export async function mask(source: BgSource, opts: RemoveOptions = {}): Promise<MaskResult> {
  const { bitmap, close } = await toBitmap(source)
  try {
    const t0 = performance.now()
    const segmenter = await getSegmenter(opts)
    const seg = segmentImageSync(segmenter, bitmap)
    const alpha = alphaMask(seg, bitmap.width, bitmap.height, opts.feather ?? 0)
    const actx = alpha.getContext('2d')!
    const data = actx.getImageData(0, 0, bitmap.width, bitmap.height)
    // keep alpha channel only, as grayscale RGB
    for (let i = 0; i < data.data.length; i += 4) {
      const a = data.data[i + 3]
      data.data[i] = data.data[i + 1] = data.data[i + 2] = a
    }
    return { mask: data, width: bitmap.width, height: bitmap.height, elapsedMs: performance.now() - t0 }
  } finally {
    if (close) bitmap.close()
  }
}

/**
 * Realtime background replacement over a MediaStream (video calls).
 * Returns a new MediaStream: composited canvas video + original audio tracks.
 */
export async function cutoutStream(
  stream: MediaStream,
  opts: CutoutStreamOptions,
): Promise<{ stream: MediaStream; stop: () => void }> {
  const { background, blurAmount = 12, fps = 30, feather = 1 } = opts

  const segmenter = await getSegmenter({ model: opts.model, onProgress: opts.onProgress })
  // VIDEO-mode segmenter needs its own instance; mediapipe setOptions handles the switch.
  await (segmenter as unknown as { setOptions(o: unknown): Promise<void> }).setOptions({ runningMode: 'VIDEO' })

  const video = document.createElement('video')
  video.muted = true
  video.playsInline = true
  video.srcObject = new MediaStream(stream.getVideoTracks())
  await video.play()
  await new Promise<void>((r) => (video.videoWidth ? r() : video.addEventListener('loadedmetadata', () => r())))

  const canvas = document.createElement('canvas')
  canvas.width = video.videoWidth
  canvas.height = video.videoHeight
  const ctx = canvas.getContext('2d')!
  const outStream = canvas.captureStream(fps)
  for (const t of stream.getAudioTracks()) outStream.addTrack(t)

  let bgBitmap: ImageBitmap | null = null
  if (background instanceof ImageBitmap) bgBitmap = background
  else if (background instanceof HTMLImageElement || background instanceof HTMLCanvasElement) {
    bgBitmap = await createImageBitmap(background as CanvasImageSource)
  }

  let stopped = false
  let lastTs = -1

  const drawBackground = () => {
    if (background === 'blur') {
      ctx.filter = `blur(${blurAmount}px)`
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
      ctx.filter = 'none'
    } else if (typeof background === 'string') {
      ctx.fillStyle = background
      ctx.fillRect(0, 0, canvas.width, canvas.height)
    } else if (bgBitmap) {
      ctx.drawImage(bgBitmap, 0, 0, canvas.width, canvas.height)
    } else {
      ctx.clearRect(0, 0, canvas.width, canvas.height)
    }
  }

  const loop = () => {
    if (stopped) return
    requestAnimationFrame(loop)
    const ts = performance.now()
    if (video.readyState < 2 || ts - lastTs < 1000 / fps - 2) return
    lastTs = ts
    const seg = segmentImageSync(segmenter, video, ts)
    // 1. person cutout from the video frame
    ctx.globalCompositeOperation = 'source-over'
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
    ctx.globalCompositeOperation = 'destination-in'
    ctx.drawImage(alphaMask(seg, canvas.width, canvas.height, feather), 0, 0)
    // 2. background BEHIND the person
    ctx.globalCompositeOperation = 'destination-over'
    drawBackground()
    ctx.globalCompositeOperation = 'source-over'
  }
  requestAnimationFrame(loop)

  return {
    stream: outStream,
    stop: () => {
      stopped = true
      for (const t of outStream.getVideoTracks()) t.stop()
    },
  }
}
