/**
 * @cunny-ai/clip — zero-shot classification + text↔image search via CLIP ViT-B/32 (quantized).
 * Dual-encoder: `embedText` and `embedImage` land in the same shared space.
 */
import { listModels, resolveModel } from '@cunny-ai/core'

const TASK = 'clip'

export type ImageSource = Blob | File | ImageBitmap | HTMLImageElement | HTMLCanvasElement | string

export interface ClipOptions {
  model?: string
  acceleration?: 'auto' | 'wasm' | 'webgpu'
  onProgress?: (info: { loaded: number; total: number; file?: string }) => void
}

export interface Classification {
  label: string
  score: number
}

export function models() {
  return listModels(TASK)
}

interface ClipEngines {
  tokenizer: { __call: (t: string[]) => unknown }
  textModel: { __call: (inputs: unknown) => Promise<{ text_embeds: { normalize: () => { data: Float32Array; dims: number[] } } }> }
  processor: { __call: (img: ImageBitmap) => Promise<unknown> }
  visionModel: { __call: (inputs: unknown) => Promise<{ image_embeds: { normalize: () => { data: Float32Array; dims: number[] } } }> }
}

let enginesPromise: Promise<ClipEngines> | undefined

async function getEngines(opts: ClipOptions = {}): Promise<ClipEngines> {
  enginesPromise ??= (async () => {
    const { entry } = resolveModel(TASK, opts.model)
    const T = await import('@huggingface/transformers')
    T.env.allowLocalModels = false
    const progress_callback = (e: { status: string; loaded?: number; total?: number; file?: string }) => {
      if (e.status === 'progress' && opts.onProgress && e.total) {
        opts.onProgress({ loaded: e.loaded ?? 0, total: e.total, file: e.file })
      }
    }
    const opts8 = { dtype: 'q8' as const, progress_callback }
    const [tokenizer, textModel, processor, visionModel] = await Promise.all([
      T.AutoTokenizer.from_pretrained(entry.repo!),
      T.CLIPTextModelWithProjection.from_pretrained(entry.repo!, opts8),
      T.AutoProcessor.from_pretrained(entry.repo!),
      T.CLIPVisionModelWithProjection.from_pretrained(entry.repo!, opts8),
    ])
    return {
      tokenizer: tokenizer as unknown as ClipEngines['tokenizer'],
      textModel: textModel as unknown as ClipEngines['textModel'],
      processor: processor as unknown as ClipEngines['processor'],
      visionModel: visionModel as unknown as ClipEngines['visionModel'],
    }
  })()
  return enginesPromise
}

async function toBitmap(source: ImageSource): Promise<{ bitmap: ImageBitmap; close: boolean }> {
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

/** Embed text into CLIP's shared space (normalized). */
export async function embedText(text: string, opts: ClipOptions = {}): Promise<Float32Array> {
  const e = await getEngines(opts)
  const inputs = e.tokenizer.__call([text])
  const out = await e.textModel.__call(inputs)
  return out.text_embeds.normalize().data.slice()
}

/** Embed an image into CLIP's shared space (normalized). */
export async function embedImage(source: ImageSource, opts: ClipOptions = {}): Promise<Float32Array> {
  const { bitmap, close } = await toBitmap(source)
  try {
    const e = await getEngines(opts)
    const inputs = await e.processor.__call(bitmap)
    const out = await e.visionModel.__call(inputs)
    return out.image_embeds.normalize().data.slice()
  } finally {
    if (close) bitmap.close()
  }
}

/**
 * Zero-shot classify an image against caller-provided labels.
 * ```ts
 * await classify(photo, ['a receipt', 'a meme', 'a selfie'])
 * ```
 */
export async function classify(
  source: ImageSource,
  labels: string[],
  opts: ClipOptions & { promptTemplate?: string } = {},
): Promise<Classification[]> {
  const template = opts.promptTemplate ?? 'a photo of {}'
  const imageVec = await embedImage(source, opts)
  const textVecs = await Promise.all(labels.map((l) => embedText(template.replace('{}', l), opts)))

  // logits = 100 · cos(img, txt), softmaxed — the standard CLIP zero-shot recipe.
  const logits = textVecs.map((t) => {
    let cos = 0
    for (let i = 0; i < t.length; i++) cos += t[i] * imageVec[i]
    return 100 * cos
  })
  const max = Math.max(...logits)
  const exps = logits.map((l) => Math.exp(l - max))
  const sum = exps.reduce((a, b) => a + b, 0)
  return labels
    .map((label, i) => ({ label, score: exps[i] / sum }))
    .sort((a, b) => b.score - a.score)
}

/** Search images by text (or by another image). Returns indices ranked by similarity. */
export async function search(
  query: string | ImageSource,
  images: ImageSource[],
  opts: ClipOptions & { k?: number } = {},
): Promise<Array<{ index: number; score: number }>> {
  const q = typeof query === 'string' ? await embedText(query, opts) : await embedImage(query, opts)
  const scored: Array<{ index: number; score: number }> = []
  for (let i = 0; i < images.length; i++) {
    const v = await embedImage(images[i], opts)
    let cos = 0
    for (let j = 0; j < v.length; j++) cos += v[j] * q[j]
    scored.push({ index: i, score: cos })
  }
  return scored.sort((a, b) => b.score - a.score).slice(0, opts.k ?? Math.min(5, images.length))
}
