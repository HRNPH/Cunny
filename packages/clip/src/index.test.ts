import { beforeEach, describe, expect, it, vi } from 'vitest'

const hf = vi.hoisted(() => {
  const state = {
    env: { allowLocalModels: true },
    loads: [] as Array<{ kind: string; repo: string; opts?: Record<string, unknown> }>,
    tokenizerInputs: [] as string[][],
    processedBitmaps: [] as unknown[],
    createdBitmaps: [] as Array<{ closed: boolean }>,
    textVecs: {} as Record<string, number[]>,
    defaultTextVec: [1, 0] as number[],
    textModelError: null as Error | null,
    blobVec: [1, 0] as number[],
  }
  return state
})

/** Stands in for ImageBitmap: `instanceof ImageBitmap` in the source hits the stubbed global. */
class FakeBitmap {
  width: number
  height: number
  vec: number[]
  closed = false
  constructor(width = 2, height = 2, vec: number[] = [1, 0]) {
    this.width = width
    this.height = height
    this.vec = vec
  }
  close() {
    this.closed = true
  }
}

vi.stubGlobal('ImageBitmap', FakeBitmap)
vi.stubGlobal('createImageBitmap', async () => {
  const bitmap = new FakeBitmap(2, 2, hf.blobVec)
  hf.createdBitmaps.push(bitmap)
  return bitmap
})

vi.mock('@huggingface/transformers', () => {
  const load = (kind: string) => async (repo: string, opts?: Record<string, unknown>) => {
    hf.loads.push({ kind, repo, opts })
    if (kind === 'tokenizer') {
      return {
        __call: (texts: string[]) => {
          hf.tokenizerInputs.push(texts)
          return { texts }
        },
      }
    }
    if (kind === 'textModel') {
      return {
        __call: async (inputs: { texts: string[] }) => {
          if (hf.textModelError) throw hf.textModelError
          const v = hf.textVecs[inputs.texts[0]] ?? hf.defaultTextVec
          return { text_embeds: { normalize: () => ({ data: new Float32Array(v), dims: [1, v.length] }) } }
        },
      }
    }
    if (kind === 'processor') {
      return {
        __call: async (img: unknown) => {
          hf.processedBitmaps.push(img)
          return { img }
        },
      }
    }
    return {
      __call: async (inputs: { img: { vec: number[] } }) => {
        const v = inputs.img.vec
        return { image_embeds: { normalize: () => ({ data: new Float32Array(v), dims: [1, v.length] }) } }
      },
    }
  }
  return {
    env: hf.env,
    AutoTokenizer: { from_pretrained: load('tokenizer') },
    CLIPTextModelWithProjection: { from_pretrained: load('textModel') },
    AutoProcessor: { from_pretrained: load('processor') },
    CLIPVisionModelWithProjection: { from_pretrained: load('visionModel') },
  }
})

/** Fresh module instance per test (engine cache lives at module scope); core is re-imported in the same registry so instanceof works. */
const load = async () => {
  const mod = await import('./index.js')
  const { ModelNotFoundError } = await import('@cunny-ai/core')
  return { ...mod, ModelNotFoundError }
}

beforeEach(() => {
  vi.resetModules()
  hf.env.allowLocalModels = true
  hf.loads.length = 0
  hf.tokenizerInputs.length = 0
  hf.processedBitmaps.length = 0
  hf.createdBitmaps.length = 0
  hf.textVecs = {}
  hf.textModelError = null
  hf.blobVec = [1, 0]
})

describe('clip metadata', () => {
  it('lists the clip-vit-b32 registry entry', async () => {
    const { models } = await load()
    const list = models()
    expect(list.map((m) => m.id)).toEqual(['clip-vit-b32'])
    expect(list[0]).toMatchObject({ tier: 'default', provider: 'builtin', license: 'MIT', sizeMB: 50 })
  })
})

describe('clip engine wiring', () => {
  it('loads all four engines from the shared repo, quantizing only the models', async () => {
    const { embedText } = await load()
    await embedText('a cat')
    expect(hf.loads.map((l) => l.kind)).toEqual(['tokenizer', 'textModel', 'processor', 'visionModel'])
    for (const l of hf.loads) expect(l.repo).toBe('Xenova/clip-vit-base-patch32')
    expect(hf.env.allowLocalModels).toBe(false)
    const byKind = Object.fromEntries(hf.loads.map((l) => [l.kind, l]))
    expect(byKind.textModel.opts).toMatchObject({ dtype: 'q8' })
    expect(byKind.visionModel.opts).toMatchObject({ dtype: 'q8' })
    expect(byKind.tokenizer.opts).toBeUndefined()
    expect(byKind.processor.opts).toBeUndefined()
    expect(typeof byKind.textModel.opts!.progress_callback).toBe('function')
  })

  it('builds the engines exactly once across calls', async () => {
    const { embedText, embedImage } = await load()
    await embedText('a cat')
    await embedText('a dog')
    await embedImage(new FakeBitmap())
    expect(hf.loads.length).toBe(4)
  })

  it('forwards download progress events from the model loads', async () => {
    const { embedText } = await load()
    const onProgress = vi.fn()
    await embedText('a cat', { onProgress })
    const cb = hf.loads.find((l) => l.kind === 'textModel')!.opts!.progress_callback as (
      e: Record<string, unknown>,
    ) => void
    cb({ status: 'progress', loaded: 12, total: 50, file: 'model.onnx' })
    cb({ status: 'done' })
    expect(onProgress.mock.calls).toEqual([[{ loaded: 12, total: 50, file: 'model.onnx' }]])
  })
})

describe('embedText', () => {
  it('tokenizes the single text and returns the normalized embedding', async () => {
    const { embedText } = await load()
    const out = await embedText('a cat')
    expect(hf.tokenizerInputs).toEqual([['a cat']])
    expect(out).toBeInstanceOf(Float32Array)
    expect(Array.from(out)).toEqual([1, 0])
  })

  it('returns the vector for the exact tokenized input', async () => {
    const { embedText } = await load()
    hf.textVecs['a cat'] = [0, 1]
    expect(Array.from(await embedText('a cat'))).toEqual([0, 1])
  })
})

describe('embedImage', () => {
  it('processes a caller-provided ImageBitmap without closing it', async () => {
    const { embedImage } = await load()
    const bitmap = new FakeBitmap(4, 4, [0.6, 0.8])
    const out = await embedImage(bitmap)
    expect(hf.processedBitmaps).toEqual([bitmap])
    expect(out.length).toBe(2)
    expect(out[0]).toBeCloseTo(0.6)
    expect(out[1]).toBeCloseTo(0.8)
    expect(bitmap.closed).toBe(false)
  })

  it('decodes Blob sources into a bitmap and closes it afterwards', async () => {
    const { embedImage } = await load()
    hf.blobVec = [0, 1]
    const out = await embedImage(new Blob([new Uint8Array([1])]))
    expect(Array.from(out)).toEqual([0, 1])
    expect(hf.createdBitmaps.length).toBe(1)
    expect(hf.createdBitmaps[0].closed).toBe(true)
  })
})

describe('classify (zero-shot)', () => {
  it('applies the default prompt template, softmaxes logits and sorts descending', async () => {
    const { classify } = await load()
    const image = new FakeBitmap(2, 2, [1, 0])
    hf.textVecs['a photo of a receipt'] = [1, 0]
    hf.textVecs['a photo of a meme'] = [0, 1]
    const res = await classify(image, ['a receipt', 'a meme'])
    expect(hf.tokenizerInputs).toEqual([['a photo of a receipt'], ['a photo of a meme']])
    expect(res.map((r) => r.label)).toEqual(['a receipt', 'a meme'])
    expect(res[0].score).toBeCloseTo(1) // cos 1 → logit 100 vs 0, softmax ≈ 1
    expect(res[1].score).toBeCloseTo(0, 5)
    expect(res.reduce((s, r) => s + r.score, 0)).toBeCloseTo(1)
  })

  it('honors a custom prompt template', async () => {
    const { classify } = await load()
    hf.textVecs['a picture of a dog'] = [1, 0]
    const res = await classify(new FakeBitmap(2, 2, [1, 0]), ['a dog', 'a cat'], {
      promptTemplate: 'a picture of {}',
    })
    expect(hf.tokenizerInputs[0]).toEqual(['a picture of a dog'])
    expect(res[0]).toMatchObject({ label: 'a dog' })
  })

  it('ranks by cosine when scores are not saturated', async () => {
    const { classify } = await load()
    const image = new FakeBitmap(2, 2, [1, 0])
    hf.textVecs['a photo of a b'] = [0.6, 0.8]
    hf.textVecs['a photo of a c'] = [0, 1]
    const res = await classify(image, ['a c', 'a b']) // worst label first on purpose
    expect(res.map((r) => r.label)).toEqual(['a b', 'a c'])
    expect(res[0].score).toBeGreaterThan(res[1].score)
  })
})

describe('search', () => {
  it('ranks images by cosine to the text query and caps at k', async () => {
    const { search } = await load()
    hf.textVecs['a dog'] = [1, 0]
    const images = [
      new FakeBitmap(2, 2, [0, 1]), // orthogonal → 0
      new FakeBitmap(2, 2, [1, 0]), // aligned → 1
      new FakeBitmap(2, 2, [0.6, 0.8]), // partial → 0.6
    ]
    const hits = await search('a dog', images)
    expect(hits.map((h) => h.index)).toEqual([1, 2, 0])
    expect(hits[0].score).toBeCloseTo(1)
    expect(hits[1].score).toBeCloseTo(0.6)
    expect(hits[2].score).toBeCloseTo(0)
    expect(hf.processedBitmaps).toEqual(images) // every image embedded, in order

    const top2 = await search('a dog', images, { k: 2 })
    expect(top2.map((h) => h.index)).toEqual([1, 2])
  })

  it('defaults k to at most five images', async () => {
    const { search } = await load()
    const images = Array.from({ length: 7 }, () => new FakeBitmap(2, 2, [1, 0]))
    const hits = await search('a dog', images)
    expect(hits.length).toBe(5)
  })

  it('searches by image query in the same space', async () => {
    const { search } = await load()
    const query = new FakeBitmap(2, 2, [0, 1])
    const hits = await search(query, [new FakeBitmap(2, 2, [1, 0]), new FakeBitmap(2, 2, [0, 1])])
    expect(hits.map((h) => h.index)).toEqual([1, 0])
    expect(hits[0].score).toBeCloseTo(1)
    expect(hf.tokenizerInputs).toEqual([]) // no text side touched
  })
})

describe('clip error paths', () => {
  it('rejects unknown models with a typed @cunny-ai error before loading anything', async () => {
    const { embedText, ModelNotFoundError } = await load()
    const p = embedText('a cat', { model: 'vit-l14' })
    await expect(p).rejects.toBeInstanceOf(ModelNotFoundError)
    await expect(p).rejects.toThrow('@cunny-ai:')
    await expect(p).rejects.toMatchObject({ code: 'MODEL_NOT_FOUND' })
    expect(hf.loads.length).toBe(0)
  })

  it('surfaces text model inference failures', async () => {
    const { embedText } = await load()
    hf.textModelError = new Error('boom')
    await expect(embedText('a cat')).rejects.toThrow('boom')
  })
})
