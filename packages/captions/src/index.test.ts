import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { captionMic, captionStream } from './index.js'

/** Both dependencies are mocked: vad hands back captured handlers, stt scripts transcripts. */
const h = vi.hoisted(() => ({ startVAD: vi.fn(), transcribe: vi.fn() }))

vi.mock('@cunny-ai/vad', () => ({ startVAD: h.startVAD }))
vi.mock('@cunny-ai/stt', () => ({ transcribe: h.transcribe }))

type VadHandlers = {
  onProbability?: (p: number) => void
  onSegment: (audio: Float32Array, durationMs: number) => void | Promise<void>
}

const installed = () => h.startVAD.mock.calls[0]![1] as VadHandlers
const flush = () => new Promise((r) => setTimeout(r, 0))

beforeEach(() => {
  vi.clearAllMocks()
  h.startVAD.mockResolvedValue({ stop: vi.fn() })
  h.transcribe.mockResolvedValue({ text: '', durationMs: 0, elapsedMs: 0 })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('captionStream', () => {
  it('wires vad options and returns its stop function', async () => {
    const onProgress = vi.fn()
    const stream = {} as MediaStream

    const stop = await captionStream(stream, { onCaption: vi.fn() }, { vadThreshold: 0.7, onProgress })

    expect(h.startVAD).toHaveBeenCalledOnce()
    const [streamArg, handlers, opts] = h.startVAD.mock.calls[0] as [MediaStream, VadHandlers, unknown]
    expect(streamArg).toBe(stream)
    expect(handlers).toHaveProperty('onSegment')
    expect(opts).toEqual({ threshold: 0.7, onProgress })
    expect(stop).toBe((await h.startVAD.mock.results[0]!.value).stop)
  })

  it('forwards live vad probabilities for mic meters', async () => {
    const onProbability = vi.fn()
    await captionStream({} as MediaStream, { onCaption: vi.fn(), onProbability })

    installed().onProbability?.(0.42)
    expect(onProbability).toHaveBeenCalledWith(0.42)
  })

  it('transcribes segments into final caption events', async () => {
    h.transcribe.mockResolvedValue({ text: 'hello world', durationMs: 900, elapsedMs: 5 })
    const onCaption = vi.fn()
    await captionStream({} as MediaStream, { onCaption })

    const audio = new Float32Array(16000)
    await installed().onSegment(audio, 900)
    await flush()

    expect(h.transcribe).toHaveBeenCalledOnce()
    expect(h.transcribe).toHaveBeenCalledWith(audio, { onProgress: undefined })
    expect(onCaption).toHaveBeenCalledOnce()
    const event = onCaption.mock.calls[0][0]
    expect(event).toMatchObject({ text: 'hello world', isFinal: true, durationMs: 900 })
    expect(event.ts).toEqual(expect.any(Number))
    expect(event.ts).toBeGreaterThanOrEqual(0)
  })

  it('skips captions when the transcript is empty', async () => {
    h.transcribe.mockResolvedValue({ text: '', durationMs: 0, elapsedMs: 0 })
    const onCaption = vi.fn()
    await captionStream({} as MediaStream, { onCaption })

    await installed().onSegment(new Float32Array(512), 32)
    await flush()

    expect(onCaption).not.toHaveBeenCalled()
  })

  it('surfaces transcription errors and keeps processing later segments', async () => {
    const err = new Error('asr failed')
    h.transcribe.mockRejectedValueOnce(err).mockResolvedValue({ text: 'recovered', durationMs: 0, elapsedMs: 0 })
    const onCaption = vi.fn()
    const onError = vi.fn()
    await captionStream({} as MediaStream, { onCaption, onError })

    await installed().onSegment(new Float32Array(512), 32)
    await flush()
    await installed().onSegment(new Float32Array(512), 32)
    await flush()

    expect(onError).toHaveBeenCalledOnce()
    expect(onError).toHaveBeenCalledWith(err)
    expect(onCaption).toHaveBeenCalledOnce()
    expect(onCaption.mock.calls[0][0].text).toBe('recovered')
  })

  it('drops segments when transcription lags instead of queueing unbounded', async () => {
    let resolve!: (v: { text: string; durationMs: number; elapsedMs: number }) => void
    h.transcribe.mockImplementation(
      () => new Promise((r) => { resolve = r }),
    )
    const onCaption = vi.fn()
    const onError = vi.fn()
    await captionStream({} as MediaStream, { onCaption, onError })

    for (let i = 0; i < 4; i++) void installed().onSegment(new Float32Array(512), 32)
    await flush()

    expect(h.transcribe).toHaveBeenCalledTimes(3) // the 4th was dropped, not queued
    expect(onError).toHaveBeenCalledOnce()
    expect(onError.mock.calls[0][0].message).toMatch(/transcription lagging — segment dropped/)

    resolve({ text: 'first', durationMs: 32, elapsedMs: 0 })
    await flush()
    expect(onCaption).toHaveBeenCalledTimes(1)
  })
})

describe('captionMic', () => {
  it('captures the mic, stops tracks and vad on stop', async () => {
    const stopTrack = vi.fn()
    const stream = { getTracks: () => [{ stop: stopTrack }, { stop: stopTrack }] } as unknown as MediaStream
    const getUserMedia = vi.fn(async () => stream)
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } })

    const stop = await captionMic({ onCaption: vi.fn() })

    expect(getUserMedia).toHaveBeenCalledWith({ audio: true })
    const stopVad = (await h.startVAD.mock.results[0]!.value).stop as ReturnType<typeof vi.fn>

    stop()
    expect(stopVad).toHaveBeenCalledOnce()
    expect(stopTrack).toHaveBeenCalledTimes(2)
  })
})
