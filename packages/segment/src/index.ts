/**
 * @cunny-ai/segment — label every pixel of an image with a semantic class.
 *
 * `segment(source)` returns `coverage`, the fraction of pixels per class name
 * (e.g. `{ person: 0.53 }`), and `colored`, a palette-colored `ImageData` at
 * input resolution ready for canvas compositing; `VOC_CLASSES` lists the 21
 * class names. The model is deeplab-v3 (3MB, Apache-2.0) over the 21 VOC
 * classes, running on wasm via @cunny-ai/provider-mediapipe with GPU
 * acceleration optional. It downloads on the first call with progress events,
 * then stays cached in the Cache API.
 *
 * @example
 * ```ts
 * import { segment } from '@cunny-ai/segment'
 *
 * const { coverage, colored } = await segment(photo)
 * coverage.person                 // 0.53 of all pixels
 * ctx.putImageData(colored, 0, 0) // colorized overlay at input resolution
 * ```
 */
import { getDefaultEngine, listModels } from '@cunny-ai/core'
import { createImageSegmenter } from '@cunny-ai/provider-mediapipe'
import type { ImageSegmenter as MpImageSegmenter } from '@cunny-ai/provider-mediapipe'

const TASK = 'segment'

/** PASCAL-VOC 21 classes, DeepLab order. */
export const VOC_CLASSES = [
  'background', 'aeroplane', 'bicycle', 'bird', 'boat', 'bottle', 'bus', 'car', 'cat',
  'chair', 'cow', 'diningtable', 'dog', 'horse', 'motorbike', 'person', 'pottedplant',
  'sheep', 'sofa', 'train', 'tvmonitor',
] as const

/** Classic VOC palette (background black, person maroon-ish red). */
export const VOC_PALETTE: Array<[number, number, number]> = [
  [0, 0, 0], [128, 0, 0], [0, 128, 0], [128, 128, 0], [0, 0, 128], [128, 0, 128], [0, 128, 128],
  [128, 128, 128], [64, 0, 0], [192, 0, 0], [64, 128, 0], [192, 128, 0], [64, 0, 128], [192, 0, 128],
  [64, 128, 128], [192, 128, 128], [0, 64, 0], [128, 64, 0], [0, 192, 0], [128, 192, 0], [0, 64, 128],
]

/** Anything decodable into an ImageBitmap: file, blob, bitmap, `<img>`, canvas, or URL. */
export type SegmentSource = Blob | File | ImageBitmap | HTMLImageElement | HTMLCanvasElement | string

export interface SegmentResult {
  /** Per-pixel class ids at INPUT resolution (Uint8, length = width*height). */
  ids: Uint8Array
  /** Colorized overlay (same resolution) ready for canvas putImageData. */
  colored: ImageData
  /** Fraction of pixels per class (keyed by class name). */
  coverage: Record<string, number>
  /** Output width in px (matches the input). */
  width: number
  /** Output height in px (matches the input). */
  height: number
  /** Inference time (ms), excluding model download/init. */
  elapsedMs: number
}

export interface SegmentOptions {
  /** Model id or tier alias. Default = curated default. See models(). */
  model?: string
  /** Compute delegate; 'auto' prefers GPU and falls back to wasm. */
  acceleration?: 'auto' | 'cpu' | 'gpu'
  /** Download progress for the first model load. */
  onProgress?: (info: { loaded: number; total: number }) => void
}

/** Available models for this task: id, tier, sizeMB. */
export function models() {
  return listModels(TASK)
}

let segmenterPromise: Promise<MpImageSegmenter> | undefined

async function getSegmenter(opts: SegmentOptions = {}): Promise<MpImageSegmenter> {
  segmenterPromise ??= (async () => {
    const model = await getDefaultEngine().loadModel(TASK, { model: opts.model, onProgress: opts.onProgress })
    return createImageSegmenter(new Uint8Array(model.bytes), { acceleration: opts.acceleration })
  })()
  return segmenterPromise
}

async function toBitmap(source: SegmentSource): Promise<{ bitmap: ImageBitmap; close: boolean }> {
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

/** Semantic segmentation at input resolution. */
export async function segment(source: SegmentSource, opts: SegmentOptions = {}): Promise<SegmentResult> {
  const { bitmap, close } = await toBitmap(source)
  try {
    const segmenter = await getSegmenter(opts)
    const t0 = performance.now()
    let maskData: Uint8Array | undefined
    let mw = 0
    let mh = 0
    segmenter.segment(bitmap as never, (result) => {
      const cm = result.categoryMask
      if (!cm) throw new Error('@cunny-ai/segment: no category mask returned')
      try {
        maskData = cm.getAsUint8Array()
        mw = cm.width
        mh = cm.height
      } finally {
        cm.close()
      }
    })

    // Paint the mask with palette colors at model resolution, then nearest-neighbor
    // upscale to input resolution (smoothing OFF keeps class purity — no hallucinated blends).
    const small = document.createElement('canvas')
    small.width = mw
    small.height = mh
    const sctx = small.getContext('2d', { willReadFrequently: true })!
    const smallImg = sctx.createImageData(mw, mh)
    for (let i = 0; i < maskData!.length; i++) {
      const [r, g, b] = VOC_PALETTE[maskData![i]] ?? [255, 0, 255]
      smallImg.data[i * 4] = r
      smallImg.data[i * 4 + 1] = g
      smallImg.data[i * 4 + 2] = b
      smallImg.data[i * 4 + 3] = 255
    }
    sctx.putImageData(smallImg, 0, 0)

    const full = document.createElement('canvas')
    full.width = bitmap.width
    full.height = bitmap.height
    const fctx = full.getContext('2d', { willReadFrequently: true })!
    fctx.imageSmoothingEnabled = false
    fctx.drawImage(small, 0, 0, full.width, full.height)
    const colored = fctx.getImageData(0, 0, full.width, full.height)

    // Reverse palette → ids at full resolution + coverage stats.
    const key = (r: number, g: number, b: number) => (r << 16) | (g << 8) | b
    const paletteKeys = VOC_PALETTE.map(([r, g, b]) => key(r, g, b))
    const idOf = new Map(paletteKeys.map((k, i) => [k, i]))
    const ids = new Uint8Array(full.width * full.height)
    const counts = new Uint32Array(VOC_CLASSES.length)
    const d = colored.data
    for (let i = 0; i < ids.length; i++) {
      const id = idOf.get(key(d[i * 4], d[i * 4 + 1], d[i * 4 + 2])) ?? 0
      ids[i] = id
      counts[id]++
    }
    const coverage: Record<string, number> = {}
    for (let c = 0; c < counts.length; c++) {
      if (counts[c] > 0) coverage[VOC_CLASSES[c]] = Math.round((counts[c] / ids.length) * 1000) / 1000
    }

    return { ids, colored, coverage, width: full.width, height: full.height, elapsedMs: performance.now() - t0 }
  } finally {
    if (close) bitmap.close()
  }
}
