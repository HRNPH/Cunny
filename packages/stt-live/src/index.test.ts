import { describe, expect, it, vi, beforeEach } from 'vitest'

const transcribe = vi.fn()
const createVAD = vi.fn()
const listModels = vi.fn(() => [{ task: 'stt-live', id: 'moonshine-tiny', tier: 'default', provider: 'builtin' }])

vi.mock('@cunny-ai/stt', () => ({ transcribe: (...a: unknown[]) => transcribe(...a) }))
vi.mock('@cunny-ai/vad', () => ({ createVAD: (...a: unknown[]) => createVAD(...a) }))
vi.mock('@cunny-ai/core', () => ({ listModels: () => listModels() }))

import { createStreamSTT, models } from './index.js'

type Handlers = {
  onSpeechStart?: () => void
  onSegment?: (audio: Float32Array, durationMs: number) => void
  onProbability?: (p: number) => void
}

function fakeVad() {
  let handlers: Handlers = {}
  const pushes: Float32Array[] = []
  const flushes = { count: 0 }
  createVAD.mockImplementation(async () => ({
    push: (a: Float32Array) => pushes.push(a),
    flush: async () => { flushes.count++ },
    close: () => {},
    __fire: (h: Handlers) => Object.assign(handlers, h),
  }))
  // expose the handlers the package registered
  createVAD.mockImplementation(async (opts: Handlers) => {
    handlers = opts
    return {
      push: (a: Float32Array) => pushes.push(a),
      flush: async () => { flushes.count++ },
      close: () => {},
    }
  })
  return {
    pushes,
    flushes,
    speechStart: () => handlers.onSpeechStart?.(),
    segment: (audio: Float32Array, ms: number) => handlers.onSegment?.(audio, ms),
    probability: (p: number) => handlers.onProbability?.(p),
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  transcribe.mockReset()
})

describe('models', () => {
  it('lists the registry entry', () => {
    expect(models()[0]).toMatchObject({ id: 'moonshine-tiny' })
  })
})

describe('createStreamSTT', () => {
  it('rejects non-en languages in v1', async () => {
    await expect(createStreamSTT({ language: 'th' })).rejects.toThrow('not available in v1')
  })

  it('forwards feed to the vad and emits finalized text on segment', async () => {
    const vad = fakeVad()
    transcribe.mockResolvedValue({ text: ' hello world ' })
    const stt = await createStreamSTT()
    const endpoints: Array<[string, number]> = []
    stt.onEndpoint = (text, ms) => endpoints.push([text, ms])

    vad.speechStart()
    stt.feed(new Float32Array(1600))
    await vad.segment(new Float32Array(16000), 1000)

    expect(transcribe).toHaveBeenCalledOnce()
    expect(endpoints).toEqual([['hello world', 1000]])
    expect(vad.pushes).toHaveLength(1)
    stt.stop()
  })

  it('skips empty transcripts instead of emitting blank endpoints', async () => {
    const vad = fakeVad()
    transcribe.mockResolvedValue({ text: '   ' })
    const stt = await createStreamSTT()
    const onEndpoint = vi.fn()
    stt.onEndpoint = onEndpoint
    vad.speechStart()
    await vad.segment(new Float32Array(16000), 900)
    expect(onEndpoint).not.toHaveBeenCalled()
    stt.stop()
  })

  it('buffers fed audio only while speech is active', async () => {
    const vad = fakeVad()
    transcribe.mockResolvedValue({ text: 'x' })
    const stt = await createStreamSTT()
    stt.onPartial = () => {}
    // silence before any speech start: partials must not transcribe
    stt.feed(new Float32Array(48000))
    await new Promise((r) => setTimeout(r, 10))
    expect(transcribe).not.toHaveBeenCalled()
    stt.stop()
  })

  it('flush delegates to the vad flush', async () => {
    const vad = fakeVad()
    const stt = await createStreamSTT()
    await stt.flush()
    expect(vad.flushes.count).toBe(1)
    stt.stop()
  })

  it('forwards vad probabilities for meters', async () => {
    const vad = fakeVad()
    const stt = await createStreamSTT()
    const seen: number[] = []
    stt.onProbability = (p) => seen.push(p)
    vad.probability(0.7)
    expect(seen).toEqual([0.7])
    stt.stop()
  })
})
