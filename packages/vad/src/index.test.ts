import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createVAD, models, startVAD } from './index.js'

/**
 * The whole provider boundary is mocked: core serves model bytes from memory and
 * provider-onnx hands back a scripted fake session + fake ort.Tensor recorder.
 */
const h = vi.hoisted(() => {
  const loadModel = vi.fn()
  const createSession = vi.fn()
  const getOrt = vi.fn()
  const tensors: Array<{ type: string; data: unknown; dims: number[] }> = []
  class Tensor {
    type: string
    data: unknown
    dims: number[]
    constructor(type: string, data: unknown, dims: number[]) {
      this.type = type
      this.data = data
      this.dims = dims
      tensors.push(this)
    }
  }
  return { loadModel, createSession, getOrt, Tensor, tensors }
})

vi.mock('@cunny-ai/core', () => ({
  listModels: () => [{ task: 'vad', id: 'silero-vad-v5', tier: 'default', sizeMB: 2 }],
  getDefaultEngine: () => ({ loadModel: h.loadModel }),
}))
vi.mock('@cunny-ai/provider-onnx', () => ({
  createSession: h.createSession,
  getOrt: h.getOrt,
}))

type FakeSession = {
  inputNames: string[]
  outputNames: string[]
  run: ReturnType<typeof vi.fn>
  release: ReturnType<typeof vi.fn>
}

/** Session whose model returns scripted speech probabilities; each run emits a unique state fill. */
function fakeSession(probs: number | number[]) {
  const feedsList: Array<Record<string, InstanceType<typeof h.Tensor>>> = []
  let stateVal = 0
  const next = () => (Array.isArray(probs) ? (probs.shift() ?? 0) : probs)
  const session: FakeSession = {
    inputNames: ['input', 'state', 'sr'],
    outputNames: ['output', 'stateN'],
    run: vi.fn(async (feeds: Record<string, InstanceType<typeof h.Tensor>>) => {
      feedsList.push(feeds)
      stateVal++
      return {
        output: { data: Float32Array.of(next()) },
        stateN: { data: new Float32Array(2 * 1 * 128).fill(stateVal) },
      }
    }),
    release: vi.fn(),
  }
  return { session, feedsList }
}

const frames = (n: number, value: number) => new Float32Array(n * 512).fill(value)

beforeEach(() => {
  vi.clearAllMocks()
  h.tensors.length = 0
  h.loadModel.mockResolvedValue({ bytes: new ArrayBuffer(4) })
  h.getOrt.mockResolvedValue({ Tensor: h.Tensor })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('vad metadata', () => {
  it('lists the silero registry entries', () => {
    const list = models()
    expect(list).toHaveLength(1)
    expect(list[0]).toMatchObject({ task: 'vad', id: 'silero-vad-v5', tier: 'default' })
  })
})

describe('frame assembly', () => {
  it('chunks input into 512-sample frames with 64 samples of trailing context', async () => {
    const { session, feedsList } = fakeSession(0)
    h.createSession.mockResolvedValue(session)
    const vad = await createVAD()

    const audio = new Float32Array(1024)
    for (let i = 0; i < audio.length; i++) audio[i] = i
    vad.push(audio)
    await vi.waitFor(() => expect(session.run).toHaveBeenCalledTimes(2))

    const first = feedsList[0]!['input']!
    expect(first.dims).toEqual([1, 576])
    expect(Array.from(first.data as Float32Array).slice(0, 64)).toEqual(new Array(64).fill(0)) // fresh context
    expect(Array.from(first.data as Float32Array).slice(64)).toEqual(Array.from(audio.slice(0, 512)))

    const second = feedsList[1]!['input']!
    expect(second.dims).toEqual([1, 576])
    expect(Array.from(second.data as Float32Array).slice(0, 64)).toEqual(Array.from(audio.slice(448, 512)))
    expect(Array.from(second.data as Float32Array).slice(64)).toEqual(Array.from(audio.slice(512)))
  })

  it('feeds the 16k sample rate as an int64 scalar', async () => {
    const { session, feedsList } = fakeSession(0)
    h.createSession.mockResolvedValue(session)
    const vad = await createVAD()
    vad.push(frames(1, 0))
    await vi.waitFor(() => expect(session.run).toHaveBeenCalledOnce())

    const sr = feedsList[0]!['sr']!
    expect(sr.type).toBe('int64')
    expect(sr.dims).toEqual([])
    expect(sr.data).toBeInstanceOf(BigInt64Array)
    expect((sr.data as BigInt64Array)[0]).toBe(16000n)
  })

  it('carries the emitted state into the next frame and zeroes it every ~30s', async () => {
    const { session, feedsList } = fakeSession(0)
    h.createSession.mockResolvedValue(session)
    const vad = await createVAD()

    const count = 940 // frame 938 crosses the 30s reset boundary (938 * 32ms >= 30_000)
    vad.push(frames(count, 0))
    await vi.waitFor(() => expect(session.run).toHaveBeenCalledTimes(count))

    // run k emits state filled with k+1; the next frame must feed exactly that back
    const at = (i: number) => (feedsList[i]!['state']!.data as Float32Array)[0]
    expect(at(500)).toBe(500)
    // frame index 937 (0-based): sinceReset crossed 30s → state reset to zeros before inference
    expect(Array.from(feedsList[937]!['state']!.data as Float32Array)).toEqual(new Array(256).fill(0))
    // and inference resumes from the state emitted by frame 937
    expect(at(938)).toBe(938)
  })
})

describe('speech events', () => {
  const handlers = () => ({
    onSpeechStart: vi.fn(),
    onSpeechEnd: vi.fn(),
    onSegment: vi.fn(),
    onProbability: vi.fn(),
  })
  const attach = (vad: unknown, hs: ReturnType<typeof handlers>) =>
    (vad as { __setHandlers: (h: typeof hs) => void }).__setHandlers(hs)

  it('emits start/segment/end with the speech clip and hangover tail included', async () => {
    const { session } = fakeSession([0.9, 0.9, 0.9, 0.9, 0.9, ...new Array(10).fill(0.1)])
    h.createSession.mockResolvedValue(session)
    const vad = await createVAD()
    const hs = handlers()
    attach(vad, hs)

    const audio = frames(15, 0)
    audio.fill(0.5, 0, 5 * 512) // speech frames
    audio.fill(0.05, 5 * 512) // silence frames
    vad.push(audio)
    await vi.waitFor(() => expect(session.run).toHaveBeenCalledTimes(15))

    expect(hs.onProbability).toHaveBeenCalledTimes(15)
    expect(hs.onProbability.mock.calls[0][0]).toBeCloseTo(0.9) // float32-rounded by the tensor round trip
    expect(hs.onProbability.mock.calls[5][0]).toBeCloseTo(0.1)

    expect(hs.onSpeechStart).toHaveBeenCalledOnce() // 1 speech frame (32ms) >= default 30ms hangover
    expect(hs.onSpeechEnd).toHaveBeenCalledOnce()
    expect(hs.onSpeechEnd).toHaveBeenCalledWith(384) // 5 speech + 7 silence frames of 32ms

    expect(hs.onSegment).toHaveBeenCalledOnce()
    const [segment, durationMs] = hs.onSegment.mock.calls[0] as [Float32Array, number]
    expect(durationMs).toBe(384)
    expect(segment).toHaveLength(12 * 512) // speech + silence frames kept inside the segment
    expect(segment[0]).toBeCloseTo(0.5)
    expect(segment[5 * 512 - 1]).toBeCloseTo(0.5)
    expect(segment[5 * 512]).toBeCloseTo(0.05)
    expect(segment.at(-1)).toBeCloseTo(0.05)
  })

  it('flush emits the pending segment at stream end and close releases the session', async () => {
    const { session } = fakeSession(0.9)
    h.createSession.mockResolvedValue(session)
    const vad = await createVAD()
    const hs = handlers()
    attach(vad, hs)

    vad.push(frames(3, 0.25))
    await vi.waitFor(() => expect(session.run).toHaveBeenCalledTimes(3))
    expect(hs.onSpeechStart).toHaveBeenCalledOnce()

    await vad.flush()
    expect(hs.onSpeechEnd).toHaveBeenCalledWith(96)
    expect(hs.onSegment).toHaveBeenCalledOnce()
    const [segment, durationMs] = hs.onSegment.mock.calls[0] as [Float32Array, number]
    expect(durationMs).toBe(96)
    expect(segment).toHaveLength(3 * 512)
    expect(segment.every((s) => Math.abs(s - 0.25) < 1e-6)).toBe(true)

    vad.close()
    expect(session.release).toHaveBeenCalledOnce()
  })

  it('keeps frame-misaligned chunk tails inside the segment', async () => {
    const { session } = fakeSession([...new Array(4).fill(0.9), ...new Array(10).fill(0.1)])
    h.createSession.mockResolvedValue(session)
    const vad = await createVAD()
    const hs = handlers()
    attach(vad, hs)

    vad.push(frames(3, 0.5))
    await vi.waitFor(() => expect(session.run).toHaveBeenCalledTimes(3))
    vad.push(new Float32Array(512 + 100).fill(0.5)) // full frame + 100 leftover samples
    await vi.waitFor(() => expect(session.run).toHaveBeenCalledTimes(4))
    vad.push(frames(10, 0))

    await vi.waitFor(() => expect(hs.onSpeechEnd).toHaveBeenCalledOnce())
    const [segment] = hs.onSegment.mock.calls[0] as [Float32Array, number]
    expect(segment).toHaveLength(4 * 512 + 100 + 7 * 512) // frames + leftover tail + hangover
  })
})

describe('options', () => {
  const attach = (vad: unknown) => {
    const hs = { onSpeechStart: vi.fn(), onSpeechEnd: vi.fn(), onSegment: vi.fn() }
    ;(vad as { __setHandlers: (h: typeof hs) => void }).__setHandlers(hs)
    return hs
  }

  it('treats probabilities below a custom threshold as silence', async () => {
    const { session } = fakeSession(0.7)
    h.createSession.mockResolvedValue(session)
    const vad = await createVAD({ threshold: 0.8 })
    const hs = attach(vad)

    vad.push(frames(5, 0))
    await vi.waitFor(() => expect(session.run).toHaveBeenCalledTimes(5))
    await vad.flush()

    expect(hs.onSpeechStart).not.toHaveBeenCalled()
    expect(hs.onSegment).not.toHaveBeenCalled()
  })

  it('requires startHangover worth of speech before firing speechStart', async () => {
    const { session } = fakeSession(0.9)
    h.createSession.mockResolvedValue(session)
    const vad = await createVAD({ startHangover: 100 })
    const hs = attach(vad)

    vad.push(frames(3, 0)) // 3 * 32ms = 96ms < 100ms
    await vi.waitFor(() => expect(session.run).toHaveBeenCalledTimes(3))
    expect(hs.onSpeechStart).not.toHaveBeenCalled()

    vad.push(frames(1, 0)) // 4 * 32ms = 128ms >= 100ms
    await vi.waitFor(() => expect(hs.onSpeechStart).toHaveBeenCalledOnce())
  })

  it('ends speech after a shorter custom endHangover', async () => {
    const { session } = fakeSession([0.9, 0.9, 0.1, 0.1, 0.1])
    h.createSession.mockResolvedValue(session)
    const vad = await createVAD({ endHangover: 64 })
    const hs = attach(vad)

    vad.push(frames(5, 0))
    await vi.waitFor(() => expect(hs.onSpeechEnd).toHaveBeenCalledOnce())

    expect(hs.onSegment).toHaveBeenCalledOnce() // 2 silence frames * 32ms = 64ms
    const [segment, durationMs] = hs.onSegment.mock.calls[0] as [Float32Array, number]
    expect(durationMs).toBe(96) // 2 speech + 1 hangover frame
    expect(segment).toHaveLength(3 * 512)
  })

  it('forwards model choice and progress to the engine', async () => {
    const { session } = fakeSession(0)
    h.createSession.mockResolvedValue(session)
    const onProgress = vi.fn()
    await createVAD({ model: 'silero-vad-v5-onnx', onProgress })

    expect(h.loadModel).toHaveBeenCalledWith('vad', { model: 'silero-vad-v5-onnx', onProgress })
    expect(h.createSession).toHaveBeenCalledWith(expect.any(ArrayBuffer))
  })
})

describe('startVAD wiring', () => {
  function stubAudioGraph() {
    const destination = {}
    const sink = { gain: { value: 1 }, connect: vi.fn(() => destination) }
    const node = {
      port: { onmessage: null as ((e: { data: Float32Array }) => void) | null },
      connect: vi.fn(() => sink),
      disconnect: vi.fn(),
    }
    const source = { connect: vi.fn(() => node), disconnect: vi.fn() }
    const ctx = {
      createMediaStreamSource: vi.fn(() => source),
      audioWorklet: { addModule: vi.fn(async () => {}) },
      createGain: vi.fn(() => sink),
      destination,
      close: vi.fn(async () => {}),
    }
    const createObjectURL = vi.fn((_blob: Blob) => 'blob:vad-worklet')
    const revokeObjectURL = vi.fn()
    vi.stubGlobal('AudioContext', vi.fn(() => ctx))
    vi.stubGlobal('AudioWorkletNode', vi.fn(() => node))
    vi.stubGlobal('URL', class {
      static createObjectURL = createObjectURL
      static revokeObjectURL = revokeObjectURL
    })
    return { ctx, node, source, sink, createObjectURL, revokeObjectURL }
  }

  it('builds the inline worklet graph and forwards frames to the session', async () => {
    const { session } = fakeSession(0.9)
    h.createSession.mockResolvedValue(session)
    const graph = stubAudioGraph()
    const handlers = { onSpeechStart: vi.fn(), onSegment: vi.fn(), onSpeechEnd: vi.fn(), onProbability: vi.fn() }

    const { stop } = await startVAD({} as MediaStream, handlers)

    // inline worklet module registered from a blob URL, then released
    expect(graph.createObjectURL).toHaveBeenCalledOnce()
    const blob = graph.createObjectURL.mock.calls[0][0] as Blob
    expect(await blob.text()).toContain("registerProcessor('cunny-ai-vad-frame'")
    expect(graph.ctx.audioWorklet.addModule).toHaveBeenCalledWith('blob:vad-worklet')
    expect(graph.revokeObjectURL).toHaveBeenCalledWith('blob:vad-worklet')

    // graph wiring: mic -> worklet node -> muted sink -> destination
    expect(graph.ctx.createMediaStreamSource).toHaveBeenCalledOnce()
    expect(graph.source.connect).toHaveBeenCalledWith(graph.node)
    expect(graph.sink.gain.value).toBe(0)
    expect(graph.sink.connect).toHaveBeenCalledWith(graph.ctx.destination)

    // worklet frames reach the model
    expect(graph.node.port.onmessage).toBeTypeOf('function')
    graph.node.port.onmessage!({ data: new Float32Array(512).fill(0.5) })
    await vi.waitFor(() => expect(handlers.onSpeechStart).toHaveBeenCalledOnce())
    expect(session.run).toHaveBeenCalledOnce()

    stop()
    await vi.waitFor(() => expect(handlers.onSegment).toHaveBeenCalledOnce()) // flush emitted the pending segment
    expect(session.release).toHaveBeenCalledOnce()
    expect(graph.ctx.close).toHaveBeenCalled()
    expect(graph.source.disconnect).toHaveBeenCalled()
    expect(graph.node.disconnect).toHaveBeenCalled()
  })
})
