import { beforeEach, describe, expect, it, vi } from 'vitest'

const hf = vi.hoisted(() => {
  const state = {
    env: { allowLocalModels: true },
    pipelineCalls: [] as Array<{ task: string; repo: string; opts: Record<string, unknown> }>,
    asrCalls: [] as Array<{ audio: Float32Array; opts: Record<string, unknown> }>,
    pipelineError: null as Error | null,
    asrError: null as Error | null,
    result: { text: 'hello', chunks: undefined } as {
      text: string
      chunks?: Array<{ text: string; timestamp: [number, number] }>
    },
    decoded: null as null | { numberOfChannels: number; getChannelData: (ch: number) => Float32Array },
    decodedArg: null as ArrayBuffer | null,
    contexts: [] as Array<{ sampleRate: number; closed: boolean }>,
  }
  return state
})

class FakeAudioContext {
  sampleRate: number
  closed = false
  constructor(opts: { sampleRate: number }) {
    this.sampleRate = opts.sampleRate
    hf.contexts.push(this)
  }
  async decodeAudioData(buf: ArrayBuffer) {
    hf.decodedArg = buf
    if (!hf.decoded) throw new Error('no decoded buffer configured')
    return hf.decoded
  }
  close() {
    this.closed = true
  }
}

vi.stubGlobal('window', { AudioContext: FakeAudioContext })

vi.mock('@huggingface/transformers', () => ({
  env: hf.env,
  pipeline: async (task: string, repo: string, opts: Record<string, unknown>) => {
    hf.pipelineCalls.push({ task, repo, opts })
    if (hf.pipelineError) throw hf.pipelineError
    return async (audio: Float32Array, callOpts: Record<string, unknown>) => {
      hf.asrCalls.push({ audio, opts: callOpts })
      if (hf.asrError) throw hf.asrError
      return hf.result
    }
  },
}))

/** Fresh module instance per test (pipeline cache lives at module scope); core is re-imported in the same registry so instanceof works. */
const load = async () => {
  const mod = await import('./index.js')
  const { ModelNotFoundError } = await import('@cunny-ai/core')
  return { ...mod, ModelNotFoundError }
}

beforeEach(() => {
  vi.resetModules()
  hf.env.allowLocalModels = true
  hf.pipelineCalls.length = 0
  hf.asrCalls.length = 0
  hf.pipelineError = null
  hf.asrError = null
  hf.result = { text: 'hello', chunks: undefined }
  hf.decoded = null
  hf.decodedArg = null
  hf.contexts.length = 0
})

describe('stt metadata', () => {
  it('lists the moonshine-tiny registry entry', async () => {
    const { models } = await load()
    const list = models()
    expect(list.map((m) => m.id)).toEqual(['moonshine-tiny'])
    expect(list[0]).toMatchObject({ tier: 'default', provider: 'builtin', sizeMB: 30 })
  })
})

describe('transcribe (raw 16k PCM input)', () => {
  it('trims the transcript and reports duration from the sample count', async () => {
    const { transcribe } = await load()
    hf.result = { text: '  hello world  ' }
    const pcm = new Float32Array(1600) // 100ms @ 16k
    const res = await transcribe(pcm)
    expect(res.text).toBe('hello world')
    expect(res.durationMs).toBeCloseTo(100)
    expect(typeof res.elapsedMs).toBe('number')
    expect(res.elapsedMs).toBeGreaterThanOrEqual(0)
    expect(res.chunks).toBeUndefined()
  })

  it('passes the PCM buffer straight to the ASR pipeline with chunking options', async () => {
    const { transcribe } = await load()
    const pcm = new Float32Array(16)
    await transcribe(pcm)
    expect(hf.asrCalls.length).toBe(1)
    expect(hf.asrCalls[0].audio).toBe(pcm)
    expect(hf.asrCalls[0].opts).toEqual({ chunk_length_s: 10, stride_length_s: 1 })
  })

  it('maps pipeline chunks through untouched', async () => {
    const { transcribe } = await load()
    hf.result = {
      text: 'hey',
      chunks: [
        { text: ' hey ', timestamp: [0, 1] },
        { text: 'you', timestamp: [1, 2] },
      ],
    }
    const res = await transcribe(new Float32Array(16))
    expect(res.chunks).toEqual([
      { text: ' hey ', timestamp: [0, 1] },
      { text: 'you', timestamp: [1, 2] },
    ])
  })
})

describe('stt pipeline wiring', () => {
  it('creates the ASR pipeline quantized on wasm and disables local models', async () => {
    const { transcribe } = await load()
    await transcribe(new Float32Array(16))
    expect(hf.pipelineCalls.length).toBe(1)
    expect(hf.pipelineCalls[0].task).toBe('automatic-speech-recognition')
    expect(hf.pipelineCalls[0].repo).toBe('onnx-community/moonshine-tiny-ONNX')
    expect(hf.pipelineCalls[0].opts).toMatchObject({ dtype: 'q8', device: 'wasm' })
    expect(hf.env.allowLocalModels).toBe(false)
  })

  it('maps webgpu acceleration to the webgpu device', async () => {
    const { transcribe } = await load()
    await transcribe(new Float32Array(16), { acceleration: 'webgpu' })
    expect(hf.pipelineCalls[0].opts.device).toBe('webgpu')
  })

  it('reuses one pipeline across calls', async () => {
    const { transcribe } = await load()
    await transcribe(new Float32Array(16))
    await transcribe(new Float32Array(16))
    expect(hf.pipelineCalls.length).toBe(1)
  })

  it('forwards download progress events, defaulting loaded to 0', async () => {
    const { transcribe } = await load()
    const onProgress = vi.fn()
    await transcribe(new Float32Array(16), { onProgress })
    const cb = hf.pipelineCalls[0].opts.progress_callback as (e: Record<string, unknown>) => void
    cb({ status: 'progress', loaded: 5, total: 30, file: 'model.onnx' })
    cb({ status: 'progress', total: 30 })
    cb({ status: 'initiate' })
    expect(onProgress.mock.calls).toEqual([
      [{ loaded: 5, total: 30, file: 'model.onnx' }],
      [{ loaded: 0, total: 30, file: undefined }],
    ])
  })
})

describe('audio decoding (blob sources)', () => {
  it('decodes mono blobs via a 16kHz AudioContext and closes it afterwards', async () => {
    const { transcribe } = await load()
    const channel = new Float32Array([0.25, -0.5, 1])
    hf.decoded = { numberOfChannels: 1, getChannelData: () => channel }
    const res = await transcribe(new Blob([new Uint8Array([9, 9])]))
    expect(hf.contexts.length).toBe(1)
    expect(hf.contexts[0].sampleRate).toBe(16_000)
    expect(hf.contexts[0].closed).toBe(true)
    expect(hf.decodedArg?.byteLength).toBe(2)
    expect(Array.from(hf.asrCalls[0].audio)).toEqual([0.25, -0.5, 1])
    expect(res.durationMs).toBeCloseTo(0.1875)
  })

  it('downmixes stereo to mono by averaging channels', async () => {
    const { transcribe } = await load()
    const left = new Float32Array([1, 1])
    const right = new Float32Array([0, 0])
    hf.decoded = { numberOfChannels: 2, getChannelData: (ch) => (ch === 0 ? left : right) }
    await transcribe(new Blob([new Uint8Array([0])]))
    expect(Array.from(hf.asrCalls[0].audio)).toEqual([0.5, 0.5])
  })

  it('hands the raw Float32Array to the pipeline without decoding', async () => {
    const { transcribe } = await load()
    const pcm = new Float32Array(4)
    await transcribe(pcm)
    expect(hf.contexts.length).toBe(0)
    expect(hf.asrCalls[0].audio).toBe(pcm)
  })
})

describe('stt error paths', () => {
  it('rejects unknown models with a typed @cunny-ai error before loading transformers', async () => {
    const { transcribe, ModelNotFoundError } = await load()
    const p = transcribe(new Float32Array(16), { model: 'whisper-large' })
    await expect(p).rejects.toBeInstanceOf(ModelNotFoundError)
    await expect(p).rejects.toThrow('@cunny-ai:')
    await expect(p).rejects.toMatchObject({ code: 'MODEL_NOT_FOUND' })
    expect(hf.pipelineCalls.length).toBe(0)
  })

  it('surfaces pipeline construction failures', async () => {
    const { transcribe } = await load()
    hf.pipelineError = new Error('boom')
    await expect(transcribe(new Float32Array(16))).rejects.toThrow('boom')
  })

  it('surfaces inference failures from the pipeline call', async () => {
    const { transcribe } = await load()
    hf.asrError = new Error('inference exploded')
    await expect(transcribe(new Float32Array(16))).rejects.toThrow('inference exploded')
  })

  it('surfaces audio decoding failures for corrupt blobs', async () => {
    const { transcribe } = await load()
    hf.decoded = null // FakeAudioContext.decodeAudioData throws when nothing is staged
    await expect(transcribe(new Blob([new Uint8Array([0])]))).rejects.toThrow('no decoded buffer configured')
    expect(hf.asrCalls.length).toBe(0)
  })
})
