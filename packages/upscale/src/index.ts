/**
 * @cunny-ai/upscale — 4x image upscaling in the browser.
 *
 * `upscale(source, { backend })` returns an `ImageBitmap` at 4x the input
 * size. The model is Real-ESRGAN x4plus (fp32 export, 67MB, BSD-3-Clause) run
 * through @cunny-ai/provider-onnx on wasm or WebGPU, with the weights
 * downloaded on first call. `estimate(w, h, backend)` predicts run time and
 * enforces the 0.5MP wasm input cap. No public q8 export exists, and tiling
 * is a planned follow up.
 *
 * @example
 * ```ts
 * import { upscale } from '@cunny-ai/upscale'
 *
 * const bitmap = await upscale(file, { backend: 'auto' })
 * const ctx = canvas.getContext('2d')!
 * ctx.drawImage(bitmap, 0, 0) // 4x the input dimensions
 * ```
 */
import { getDefaultEngine, listModels } from '@cunny-ai/core'
import { createSession, getOrt } from '@cunny-ai/provider-onnx'

const TASK = 'upscale'
const SCALE = 4
const WASM_INPUT_CAP_MP = 0.5 // 0.5MP on wasm; webgpu handles 4MP+

/** Input types `upscale` accepts: blob, bitmap, image or canvas element, or a URL string. */
export type UpscaleSource = Blob | File | ImageBitmap | HTMLImageElement | HTMLCanvasElement | string

/** Options for `upscale`. */
export interface UpscaleOptions {
  /** Specific model variant to load. */
  model?: string
  /** Execution backend; 'auto' uses WebGPU when available. */
  backend?: 'auto' | 'wasm' | 'webgpu'
  /** Model download progress. */
  onProgress?: (info: { loaded: number; total: number }) => void
}

/** Model variants registered for this task. */
export function models() {
  return listModels(TASK)
}

async function toBitmap(source: UpscaleSource): Promise<{ bitmap: ImageBitmap; close: boolean }> {
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

/** Predicted time (ms) and whether the current backend can handle this input. */
export function estimate(width: number, height: number, backend: 'wasm' | 'webgpu' = 'wasm'): { ok: boolean; estMs: number } {
  const mp = (width * height) / 1e6
  const perMp = backend === 'webgpu' ? 350 : 4500
  return { ok: backend === 'webgpu' || mp <= WASM_INPUT_CAP_MP, estMs: Math.round(mp * perMp) }
}

let sessionBytes: ArrayBuffer | null = null

/** 4× upscale. Returns an ImageBitmap at 4× the input dimensions. */
export async function upscale(source: UpscaleSource, opts: UpscaleOptions = {}): Promise<ImageBitmap> {
  const { bitmap, close } = await toBitmap(source)
  try {
    const backend = opts.backend ?? 'auto'
    const effBackend: 'wasm' | 'webgpu' =
      backend === 'wasm' ? 'wasm'
      : backend === 'webgpu' ? 'webgpu'
      : typeof navigator !== 'undefined' && 'gpu' in navigator ? 'webgpu' : 'wasm'

    const est = estimate(bitmap.width, bitmap.height, effBackend)
    if (!est.ok) {
      throw new Error(
        `@cunny-ai/upscale: input ${bitmap.width}×${bitmap.height} exceeds the ${WASM_INPUT_CAP_MP}MP wasm cap ` +
        `(est. ${est.estMs}ms). Downscale first or use backend:'webgpu'.`,
      )
    }

    sessionBytes ??= (await getDefaultEngine().loadModel(TASK, { model: opts.model, onProgress: opts.onProgress })).bytes
    const session = await createSession(sessionBytes, { backend: effBackend })
    const ort = await getOrt()

    // RGBA → NCHW float RGB [0,1]
    const W = bitmap.width
    const H = bitmap.height
    const canvas = document.createElement('canvas')
    canvas.width = W
    canvas.height = H
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!
    ctx.drawImage(bitmap, 0, 0)
    const rgba = ctx.getImageData(0, 0, W, H).data
    const input = new Float32Array(3 * W * H)
    for (let i = 0, p = 0; i < rgba.length; i += 4, p++) {
      input[p] = rgba[i] / 255           // R plane
      input[W * H + p] = rgba[i + 1] / 255 // G plane
      input[2 * W * H + p] = rgba[i + 2] / 255 // B plane
    }

    const inName = session.inputNames[0]
    const outName = session.outputNames[0]
    const out = await session.run({
      [inName]: new ort.Tensor('float32', input, [1, 3, H, W]),
    })
    const tensor = out[outName] as unknown as { data: Float32Array; dims: number[] }
    const data = tensor.data
    const dims = tensor.dims
    const oH = dims[2] ?? H * SCALE
    const oW = dims[3] ?? W * SCALE

    // NCHW float → RGBA canvas
    const outCanvas = document.createElement('canvas')
    outCanvas.width = oW
    outCanvas.height = oH
    const octx = outCanvas.getContext('2d')!
    const outImg = octx.createImageData(oW, oH)
    const plane = oW * oH
    for (let p = 0; p < plane; p++) {
      outImg.data[p * 4] = Math.max(0, Math.min(255, data[p] * 255))
      outImg.data[p * 4 + 1] = Math.max(0, Math.min(255, data[plane + p] * 255))
      outImg.data[p * 4 + 2] = Math.max(0, Math.min(255, data[2 * plane + p] * 255))
      outImg.data[p * 4 + 3] = 255
    }
    octx.putImageData(outImg, 0, 0)
    return await createImageBitmap(outCanvas)
  } finally {
    if (close) bitmap.close()
  }
}
