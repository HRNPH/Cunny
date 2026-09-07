/**
 * @cunny-ai/depth — relative depth estimation for a single image.
 *
 * Runs depth-anything-v2-small (Depth Anything V2 family), q8 quantized to about
 * 27MB. `depth(source)` returns a normalized map (0 farthest, 1 nearest) at
 * input resolution, with `toHeatmap()` and `toGrayscale()` rendering it as
 * ImageData and `subjectBox` bounding the nearest decile of pixels. Requires
 * WebGPU, as with @cunny-ai/clip: inference is practical only there, and the
 * wasm path is minutes-scale. The first call downloads the model with progress
 * events, then it is cached.
 *
 * @example
 * ```ts
 * import { depth } from '@cunny-ai/depth'
 *
 * const result = await depth(image)
 * ctx.putImageData(result.toHeatmap(), 0, 0)
 * console.log(result.subjectBox)
 * ```
 */
import { listModels, resolveModel } from '@cunny-ai/core'

const TASK = 'depth'

export type DepthSource = Blob | File | ImageBitmap | HTMLImageElement | HTMLCanvasElement | string

export interface DepthResult {
  /** Normalized depth, 0 = farthest … 1 = nearest. Length = width × height. */
  map: Float32Array
  /** Map width in pixels. */
  width: number
  /** Map height in pixels. */
  height: number
  /** Inference wall time in ms. */
  elapsedMs: number
  /** Bounding box of the nearest subject (top decile of depth), normalized [0,1]. */
  subjectBox: { x: number; y: number; width: number; height: number }
  /** Render as grayscale ImageData. */
  toGrayscale(): ImageData
  /** Render as turbo colormap ImageData. */
  toHeatmap(): ImageData
}

export interface DepthOptions {
  /** Model id override; defaults to the task default. */
  model?: string
  /** Compute backend. WebGPU is required for practical inference speed. */
  acceleration?: 'auto' | 'wasm' | 'webgpu'
  /** Called with download progress during the first model load. */
  onProgress?: (info: { loaded: number; total: number; file?: string }) => void
}

/** Model ids available for this task. */
export function models() {
  return listModels(TASK)
}

type DepthPipeline = (img: ImageBitmap) => Promise<{ predicted_depth: { data: Float32Array; dims: number[] } }>

let pipePromise: Promise<DepthPipeline> | undefined

async function getPipeline(opts: DepthOptions = {}): Promise<DepthPipeline> {
  pipePromise ??= (async () => {
    const { entry } = resolveModel(TASK, opts.model)
    const { pipeline, env } = await import('@huggingface/transformers')
    env.allowLocalModels = false
    return pipeline('depth-estimation', entry.repo!, {
      dtype: 'q8',
      device: opts.acceleration === 'webgpu' ? 'webgpu' : 'wasm',
      progress_callback: (e: { status: string; loaded?: number; total?: number; file?: string }) => {
        if (e.status === 'progress' && opts.onProgress && e.total) {
          opts.onProgress({ loaded: e.loaded ?? 0, total: e.total, file: e.file })
        }
      },
    }) as unknown as DepthPipeline
  })()
  return pipePromise
}

async function toBitmap(source: DepthSource): Promise<{ bitmap: ImageBitmap; close: boolean }> {
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

/** Turbo-ish colormap for heatmaps (blue → green → yellow → red). */
function turbo(t: number): [number, number, number] {
  const clamp01 = (x: number) => Math.min(1, Math.max(0, x))
  const r = clamp01(1.5 - Math.abs(4 * t - 3))
  const g = clamp01(1.5 - Math.abs(4 * t - 2))
  const b = clamp01(1.5 - Math.abs(4 * t - 1))
  return [r * 255, g * 255, b * 255]
}

/** Estimate depth from an image. Output is always at input resolution. */
export async function depth(source: DepthSource, opts: DepthOptions = {}): Promise<DepthResult> {
  const { bitmap, close } = await toBitmap(source)
  try {
    const pipe = await getPipeline(opts)
    const t0 = performance.now()
    const out = await pipe(bitmap)
    const elapsedMs = performance.now() - t0

    // Model output is [1, H', W'] at inference resolution — upsample to input dims.
    const dims = out.predicted_depth.dims
    const srcW = dims.at(-1)!
    const srcH = dims.at(-2)!
    const src = out.predicted_depth.data
    let min = Infinity
    let max = -Infinity
    for (let i = 0; i < src.length; i++) {
      if (src[i] < min) min = src[i]
      if (src[i] > max) max = src[i]
    }
    const range = max - min || 1

    const W = bitmap.width
    const H = bitmap.height
    const map = new Float32Array(W * H)
    for (let y = 0; y < H; y++) {
      const sy = Math.min(srcH - 1, Math.floor((y / H) * srcH))
      for (let x = 0; x < W; x++) {
        const sx = Math.min(srcW - 1, Math.floor((x / W) * srcW))
        map[y * W + x] = (src[sy * srcW + sx] - min) / range
      }
    }

    // subjectBox: bounding box of the top decile (nearest) pixels.
    const sorted = Float32Array.from(map).sort()
    const thresh = sorted[Math.floor(sorted.length * 0.9)]
    let minX = W, minY = H, maxX = 0, maxY = 0
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        if (map[y * W + x] >= thresh) {
          if (x < minX) minX = x
          if (x > maxX) maxX = x
          if (y < minY) minY = y
          if (y > maxY) maxY = y
        }
      }
    }

    return {
      map,
      width: W,
      height: H,
      elapsedMs,
      subjectBox: { x: minX / W, y: minY / H, width: (maxX - minX) / W, height: (maxY - minY) / H },
      toGrayscale() {
        const img = new ImageData(W, H)
        for (let i = 0; i < map.length; i++) {
          const v = map[i] * 255
          img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v
          img.data[i * 4 + 3] = 255
        }
        return img
      },
      toHeatmap() {
        const img = new ImageData(W, H)
        for (let i = 0; i < map.length; i++) {
          const [r, g, b] = turbo(map[i])
          img.data[i * 4] = r
          img.data[i * 4 + 1] = g
          img.data[i * 4 + 2] = b
          img.data[i * 4 + 3] = 255
        }
        return img
      },
    }
  } finally {
    if (close) bitmap.close()
  }
}
