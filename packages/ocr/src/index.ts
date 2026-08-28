/**
 * @cunny-ai/ocr — OCR via a pure ONNX pipeline: PaddleOCR v4 mobile.
 * Det (DBNet, ~4.7MB) finds text boxes, rec (CRNN/SVTR, ~10.8MB) reads them,
 * both through @cunny-ai/provider-onnx. No mediapipe, no transformers.js —
 * this package owns its pre/post processing: DB postprocess, CTC decode,
 * reading-order layout.
 *
 * The ch_PP-OCRv4 rec model is Chinese-first but covers ASCII and digits,
 * so `en` requests it too; language-specific rec models land as their own
 * registry entries later.
 */
import { getDefaultEngine, listModels } from '@cunny-ai/core'
import { createSession, getOrt, newTensor } from '@cunny-ai/provider-onnx'
import type { InferenceSession, Tensor } from 'onnxruntime-web'

const TASK = 'ocr'
const DET_MAX_SIDE = 960
const DET_THRESHOLD = 0.3
const UNCLIP_RATIO = 1.6
const MIN_AREA = 8
const REC_HEIGHT = 48
const REC_MAX_WIDTH = 960

export type OcrSource = Blob | File | ImageBitmap | HTMLImageElement | HTMLCanvasElement | string

export interface OcrLine {
  text: string
  /** Pixel box in the input image's coordinate space, origin top-left. */
  box: { x: number; y: number; width: number; height: number }
  confidence: number
}

export interface OcrResult {
  lines: OcrLine[]
  width: number
  height: number
  elapsedMs: number
}

export interface OcrOptions {
  model?: string
  /** v1: ['en'] (and any latin script). Chinese-first rec covers ASCII. */
  languages?: string[]
  /** Detection probability threshold, default 0.3. */
  threshold?: number
  backend?: 'auto' | 'wasm' | 'webgpu'
  onProgress?: (info: { loaded: number; total: number }) => void
}

export function models() {
  return listModels(TASK)
}

// ---------------------------------------------------------------------------
// image helpers

async function toPixels(source: OcrSource): Promise<{ data: Uint8ClampedArray; width: number; height: number }> {
  let bitmap: ImageBitmap
  let close = false
  if (typeof source === 'string') {
    const blob = await (await fetch(source, { mode: 'cors' })).blob()
    bitmap = await createImageBitmap(blob)
    close = true
  } else if (source instanceof Blob) {
    bitmap = await createImageBitmap(source)
    close = true
  } else if (source instanceof HTMLImageElement) {
    if (!source.complete) await source.decode().catch(() => {})
    bitmap = await createImageBitmap(source)
    close = true
  } else {
    bitmap = source as ImageBitmap
  }
  const canvas = document.createElement('canvas')
  canvas.width = bitmap.width
  canvas.height = bitmap.height
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  ctx.drawImage(bitmap as CanvasImageSource, 0, 0)
  const { data, width, height } = ctx.getImageData(0, 0, canvas.width, canvas.height)
  if (close) bitmap.close()
  return { data, width, height }
}

/** Bilinear resize of RGBA pixels to a target size. */
export function resizePixels(
  src: Uint8ClampedArray, sw: number, sh: number, tw: number, th: number,
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(tw * th * 4)
  const xr = sw / tw
  const yr = sh / th
  for (let y = 0; y < th; y++) {
    const sy = Math.min(sh - 1, Math.floor((y + 0.5) * yr))
    for (let x = 0; x < tw; x++) {
      const sx = Math.min(sw - 1, Math.floor((x + 0.5) * xr))
      const si = (sy * sw + sx) * 4
      const di = (y * tw + x) * 4
      out[di] = src[si]
      out[di + 1] = src[si + 1]
      out[di + 2] = src[si + 2]
      out[di + 3] = 255
    }
  }
  return out
}

/** NCHW float input for DBNet: RGB, ImageNet-normalized. */
export function detInput(pixels: Uint8ClampedArray, w: number, h: number): Float32Array {
  const mean = [0.485, 0.456, 0.406]
  const std = [0.229, 0.224, 0.225]
  const n = w * h
  const out = new Float32Array(3 * n)
  for (let i = 0; i < n; i++) {
    out[i] = (pixels[i * 4] / 255 - mean[0]) / std[0]
    out[n + i] = (pixels[i * 4 + 1] / 255 - mean[1]) / std[1]
    out[2 * n + i] = (pixels[i * 4 + 2] / 255 - mean[2]) / std[2]
  }
  return out
}

// ---------------------------------------------------------------------------
// DB postprocess (pure, unit-tested)

export interface Box { x: number; y: number; width: number; height: number }

/** Threshold the probability map into a binary mask. */
export function binarize(prob: Float32Array, threshold: number): Uint8Array {
  const mask = new Uint8Array(prob.length)
  for (let i = 0; i < prob.length; i++) mask[i] = prob[i] > threshold ? 1 : 0
  return mask
}

/** 4-connected components above minArea, as bounding boxes. */
export function connectedComponents(mask: Uint8Array, w: number, h: number, minArea = MIN_AREA): Box[] {
  const seen = new Uint8Array(w * h)
  const boxes: Array<Box & { area: number }> = []
  const stack: number[] = []
  for (let start = 0; start < mask.length; start++) {
    if (!mask[start] || seen[start]) continue
    stack.length = 0
    stack.push(start)
    seen[start] = 1
    let minX = w, minY = h, maxX = 0, maxY = 0, area = 0
    while (stack.length) {
      const i = stack.pop()!
      const x = i % w
      const y = (i / w) | 0
      area++
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      if (y > maxY) maxY = y
      if (x > 0 && mask[i - 1] && !seen[i - 1]) { seen[i - 1] = 1; stack.push(i - 1) }
      if (x < w - 1 && mask[i + 1] && !seen[i + 1]) { seen[i + 1] = 1; stack.push(i + 1) }
      if (y > 0 && mask[i - w] && !seen[i - w]) { seen[i - w] = 1; stack.push(i - w) }
      if (y < h - 1 && mask[i + w] && !seen[i + w]) { seen[i + w] = 1; stack.push(i + w) }
    }
    if (area >= minArea) {
      boxes.push({ x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1, area })
    }
  }
  return boxes
}

/** Vatti-style polygon offset approximated for an axis-aligned box. */
export function unclipBox(box: Box, ratio = UNCLIP_RATIO): Box {
  const { x, y, width, height } = box
  const area = width * height
  const perimeter = 2 * (width + height)
  const offset = perimeter > 0 ? (area * ratio) / perimeter : 0
  return {
    x: Math.max(0, Math.round(x - offset)),
    y: Math.max(0, Math.round(y - offset)),
    width: Math.round(width + 2 * offset),
    height: Math.round(height + 2 * offset),
  }
}

/** Reading order: rows grouped by median line height, left to right inside a row. */
export function sortReadingOrder<T extends { box: Box }>(items: T[]): T[] {
  const sorted = [...items].sort((a, b) => a.box.y - b.box.y)
  const out: T[] = []
  let row: T[] = []
  let rowBottom = -Infinity
  for (const item of sorted) {
    const mid = item.box.y + item.box.height / 2
    if (row.length && mid > rowBottom) {
      out.push(...row.sort((a, b) => a.box.x - b.box.x))
      row = []
    }
    row.push(item)
    rowBottom = Math.max(rowBottom, item.box.y + item.box.height)
  }
  out.push(...row.sort((a, b) => a.box.x - b.box.x))
  return out
}

// ---------------------------------------------------------------------------
// CTC decode (pure, unit-tested)

export interface CtcResult { text: string; confidence: number }

/**
 * Greedy CTC over [T, C] probabilities. `mapping[i]` is the character for
 * class i; `blankIndex` collapses repeats. Classes beyond the mapping are
 * dropped.
 */
export function ctcDecode(
  probs: Float32Array, timesteps: number, classes: number,
  mapping: string[], blankIndex = 0,
): CtcResult {
  let text = ''
  let probSum = 0
  let prev = -1
  for (let t = 0; t < timesteps; t++) {
    let best = 0
    let bestIdx = -1
    const base = t * classes
    for (let c = 0; c < classes; c++) {
      const p = probs[base + c]
      if (p > best) { best = p; bestIdx = c }
    }
    if (bestIdx !== blankIndex && bestIdx !== prev && bestIdx < mapping.length) {
      text += mapping[bestIdx]
    }
    prev = bestIdx
    if (bestIdx !== blankIndex) probSum += best
  }
  const emitted = Math.max(1, text.length)
  // mean per-character confidence, over frames that emitted (rough but honest)
  return { text, confidence: Math.min(1, probSum / (timesteps || 1) * (timesteps / emitted)) }
}

// ---------------------------------------------------------------------------
// rec preprocessing

/** Crop + resize a text box to rec input: height 48, proportional width. */
export function recInput(
  pixels: Uint8ClampedArray, imgW: number, box: Box,
): { input: Float32Array; width: number; height: number } {
  const x = Math.max(0, Math.floor(box.x))
  const y = Math.max(0, Math.floor(box.y))
  const w = Math.max(1, Math.min(imgW - x, Math.ceil(box.width)))
  const h = Math.max(1, Math.ceil(box.height))
  const targetH = REC_HEIGHT
  const targetW = Math.max(8, Math.min(REC_MAX_WIDTH, Math.ceil((w / h) * targetH)))
  // crop rows then nearest-neighbor scale
  const crop = new Uint8ClampedArray(w * h * 4)
  for (let row = 0; row < h; row++) {
    const srcStart = ((y + row) * imgW + x) * 4
    if (srcStart + w * 4 <= pixels.length) {
      crop.set(pixels.subarray(srcStart, srcStart + w * 4), row * w * 4)
    }
  }
  const resized = resizePixels(crop, w, h, targetW, targetH)
  // CHW, (x/255 - 0.5) / 0.5
  const n = targetW * targetH
  const input = new Float32Array(3 * n)
  for (let i = 0; i < n; i++) {
    input[i] = pixels01(resized[i * 4])
    input[n + i] = pixels01(resized[i * 4 + 1])
    input[2 * n + i] = pixels01(resized[i * 4 + 2])
  }
  return { input, width: targetW, height: targetH }
}

const pixels01 = (v: number) => (v / 255 - 0.5) / 0.5

// ---------------------------------------------------------------------------
// sessions

interface OcrSessions {
  det: InferenceSession
  rec: InferenceSession
  mapping: string[]
  dictClasses: number
}

let sessionsPromise: Promise<OcrSessions> | undefined

async function getSessions(opts: OcrOptions): Promise<OcrSessions> {
  sessionsPromise ??= (async () => {
    const engine = getDefaultEngine()
    const detModel = await engine.loadModel(TASK, { model: opts.model, variant: 'det', onProgress: opts.onProgress })
    const recModel = await engine.loadModel(TASK, { model: opts.model, variant: 'rec', onProgress: opts.onProgress })
    const dictModel = await engine.loadModel(TASK, { model: opts.model, variant: 'dict' })
    const dictText = new TextDecoder('utf-8').decode(dictModel.bytes).trim()
    const dictChars = dictText.length ? dictText.split('\n') : []
    // class 0 is blank, dict follows; a trailing space class appears when the
    // export's head has one extra output unit.
    const mapping = ['', ...dictChars]
    return {
      det: await createSession(detModel.bytes, { backend: opts.backend }),
      rec: await createSession(recModel.bytes, { backend: opts.backend }),
      mapping,
      dictClasses: mapping.length,
    }
  })()
  return sessionsPromise
}

/** One-shot OCR. */
export async function ocr(source: OcrSource, opts: OcrOptions = {}): Promise<OcrResult> {
  const { data, width, height } = await toPixels(source)
  const { det, rec, mapping, dictClasses } = await getSessions(opts)
  const ort = await getOrt()
  const t0 = performance.now()

  // --- detection
  const scale = Math.min(1, DET_MAX_SIDE / Math.max(width, height))
  const dw = Math.max(32, Math.round((width * scale) / 32) * 32)
  const dh = Math.max(32, Math.round((height * scale) / 32) * 32)
  const detPixels = resizePixels(data, width, height, dw, dh)
  const detTensor = await newTensor('float32', detInput(detPixels, dw, dh), [1, 3, dh, dw])
  const detOut = await det.run({ [det.inputNames[0]]: detTensor })
  const probMap = (Object.values(detOut)[0] as { data: Float32Array }).data
  const mask = binarize(probMap, opts.threshold ?? DET_THRESHOLD)
  const detBoxes = connectedComponents(mask, dw, dh)
    .map((b) => unclipBox(b))
    .map((b) => ({
      box: {
        x: b.x / scale,
        y: b.y / scale,
        width: b.width / scale,
        height: b.height / scale,
      },
    }))
    .filter(({ box }) => box.height >= 6 && box.width >= 6)

  // --- recognition
  const lines: OcrLine[] = []
  for (const { box } of sortReadingOrder(detBoxes)) {
    const { input, width: rw, height: rh } = recInput(data, width, box)
    const recTensor = await newTensor('float32', input, [1, 3, rh, rw])
    const feeds: Record<string, Tensor> = { [rec.inputNames[0]]: recTensor }
    if (rec.inputNames.length > 1) {
      // some exports take the sequence lengths as a second input
      feeds[rec.inputNames[1]] = await newTensor('int64', BigInt64Array.from([BigInt(Math.ceil(rw / 8))]), [])
    }
    const recOut = await rec.run(feeds)
    const logits = Object.values(recOut)[0] as unknown as { data: Float32Array; dims: number[] }
    const classes = logits.dims[2] ?? dictClasses
    const timesteps = logits.dims[1] ?? (logits.data.length / classes)
    // softmax per timestep, then greedy CTC
    const probs = softmaxTimesteps(logits.data, timesteps, classes)
    const effectiveMapping = classes === mapping.length + 1 ? [...mapping, ' '] : mapping
    const { text, confidence } = ctcDecode(probs, timesteps, classes, effectiveMapping)
    if (text.trim()) lines.push({ text, box, confidence })
  }

  return { lines, width, height, elapsedMs: performance.now() - t0 }
}

/** Row-wise softmax over [T, C] logits. */
export function softmaxTimesteps(logits: Float32Array, timesteps: number, classes: number): Float32Array {
  const out = new Float32Array(logits.length)
  for (let t = 0; t < timesteps; t++) {
    const base = t * classes
    let max = -Infinity
    for (let c = 0; c < classes; c++) max = Math.max(max, logits[base + c])
    let sum = 0
    for (let c = 0; c < classes; c++) {
      const e = Math.exp(logits[base + c] - max)
      out[base + c] = e
      sum += e
    }
    for (let c = 0; c < classes; c++) out[base + c] /= sum || 1
  }
  return out
}
