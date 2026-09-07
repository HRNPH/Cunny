/**
 * @cunny-ai/vad — voice activity detection over streaming 16 kHz audio.
 *
 * Runs silero-v5 (2.3MB, MIT) in the browser through @cunny-ai/provider-onnx;
 * the weights download on first use. `createVAD` accepts the handlers
 * `onSpeechStart`, `onSegment` (the complete utterance as 16k PCM, ready for
 * @cunny-ai/stt), `onSpeechEnd`, and `onProbability`, and returns a session
 * with `push(Float32Array)` taking any chunk size, `flush()` which awaits the
 * drain and emits the final segment, and `close()`. Inference runs over 512
 * sample frames at 16 kHz plus 64 samples of context, carried in a (2,1,128)
 * state tensor. For a mic `MediaStream`, `startVAD` wires capture through an
 * AudioWorklet.
 *
 * @example
 * ```ts
 * import { createVAD } from '@cunny-ai/vad'
 *
 * const vad = await createVAD({
 *   onSegment: (audio, durationMs) => console.log('segment', audio.length, durationMs),
 * })
 * vad.push(pcmChunk) // any chunk size, 16k mono
 * await vad.flush()
 * vad.close()
 * ```
 */
import { getDefaultEngine, listModels } from '@cunny-ai/core'
import { createSession, getOrt } from '@cunny-ai/provider-onnx'

const TASK = 'vad'
const SAMPLE_RATE = 16_000
const FRAME = 512
const CONTEXT = 64
const RESET_EVERY_MS = 30_000

/** Tuning and model loading options for `createVAD`. */
export interface VadOptions {
  /** Speech probability threshold. Default 0.5. */
  threshold?: number
  /** Ms of speech before speechStart fires. Default 30. */
  startHangover?: number
  /** Ms of silence before speechEnd fires. Default 250. */
  endHangover?: number
  /** Specific model variant to load. */
  model?: string
  /** Model download progress. */
  onProgress?: (info: { loaded: number; total: number }) => void
}

/** Speech boundary callbacks, passed alongside `VadOptions`. */
export interface VadEventHandlers {
  /** Fires once ongoing speech is confirmed. */
  onSpeechStart?: () => void
  /** Complete speech clip (16k mono PCM) when speech ends. Ready to feed @cunny-ai/stt. */
  onSegment?: (audio: Float32Array, durationMs: number) => void
  /** Fires when trailing silence confirms the utterance end. */
  onSpeechEnd?: (durationMs: number) => void
  /** Per-frame speech probability, for live meters. */
  onProbability?: (p: number) => void
}

/** A streaming VAD session over 16k mono PCM. */
export interface VadSession {
  /** Feed 16k mono PCM incrementally (any chunk size; framed internally). */
  push(audio: Float32Array): void
  /** Flush the pending tail as a final segment (call at stream end). */
  flush(): Promise<void>
  /** Release the underlying ONNX session. */
  close(): void
}

/** Model variants registered for this task. */
export function models() {
  return listModels(TASK)
}

/**
 * Create a streaming VAD session. Feed 16k mono PCM via `push`; complete
 * utterances arrive through `onSegment`.
 */
export async function createVAD(opts: VadOptions & VadEventHandlers = {}): Promise<VadSession> {
  const threshold = opts.threshold ?? 0.5
  const startHang = opts.startHangover ?? 30
  const endHang = opts.endHangover ?? 250
  const pending: VadEventHandlers = opts

  const model = await getDefaultEngine().loadModel(TASK, { model: opts.model, onProgress: opts.onProgress })
  const session = await createSession(model.bytes) // backend auto
  const ort = await getOrt()

  const inputName = session.inputNames[0]
  const stateName = session.inputNames.find((n) => /state/i.test(n)) ?? 'state'
  const srName = session.inputNames.find((n) => /sr|rate/i.test(n)) ?? 'sr'
  const outProb = session.outputNames.find((n) => /output/i.test(n) && !/state/i.test(n)) ?? session.outputNames[0]

  let state = new Float32Array(2 * 1 * 128)
  let context = new Float32Array(CONTEXT)
  let sinceReset = 0

  const resetState = () => {
    state = new Float32Array(2 * 1 * 128)
    context = new Float32Array(CONTEXT)
    sinceReset = 0
  }

  let inSpeech = false
  let speechHang = 0
  let silenceHang = 0
  let speechBuf: number[] = []
  let speechMs = 0



  async function inferFrame(frame: Float32Array): Promise<number> {
    // v5 feeds [context | frame] = 576 samples
    const input = new Float32Array(CONTEXT + frame.length)
    input.set(context)
    input.set(frame, CONTEXT)
    context = frame.slice(Math.max(0, frame.length - CONTEXT))

    const feeds: Record<string, import('onnxruntime-web').Tensor> = {
      [inputName]: new ort.Tensor('float32', input, [1, input.length]),
      [stateName]: new ort.Tensor('float32', state, [2, 1, 128]),
      [srName]: new ort.Tensor('int64', BigInt64Array.from([BigInt(SAMPLE_RATE)]), []),
    }
    const out = await session.run(feeds)
    const outState = Object.entries(out).find(([n]) => /state/i.test(n))
    if (outState) state = Float32Array.from((outState[1] as { data: Float32Array }).data)
    return (out[outProb] as { data: Float32Array }).data[0]
  }

  const frameQueue: Float32Array[] = []
  let draining = false
  let drainPromise: Promise<void> = Promise.resolve()

  const drain = async (): Promise<void> => {
    if (draining) return
    draining = true
    try {
      while (frameQueue.length) {
        const frame = frameQueue.shift()!
        sinceReset += (FRAME / SAMPLE_RATE) * 1000
        if (sinceReset >= RESET_EVERY_MS) resetState()
        const p = await inferFrame(frame)
        pending.onProbability?.(p)
        if (p >= threshold) {
          fireSpeech(frame)
        } else {
          fireSilence(frame)
        }
      }
    } finally {
      draining = false
    }
  }

  const fireSpeech = (frame: Float32Array) => {
    if (!inSpeech) {
      silenceHang = 0 // arm hysteresis: consecutive-speech counter only
      speechHang += (FRAME / SAMPLE_RATE) * 1000
      if (speechHang >= startHang) {
        inSpeech = true
        speechBuf = []
        speechMs = 0
        pending.onSpeechStart?.()
      }
    }
    if (inSpeech) {
      speechBuf.push(...frame) // speech frames belong in the emitted segment
      speechMs += (FRAME / SAMPLE_RATE) * 1000
    }
  }
  const fireSilence = (frame: Float32Array) => {
    if (!inSpeech) {
      speechHang = 0 // arm hysteresis: consecutive-silence counter only
      return
    }
    silenceHang += (FRAME / SAMPLE_RATE) * 1000
    if (silenceHang >= endHang) {
      pending.onSpeechEnd?.(speechMs)
      pending.onSegment?.(Float32Array.from(speechBuf), speechMs)
      inSpeech = false
      speechBuf = []
      speechMs = 0
    } else {
      speechBuf.push(...frame) // keep tail audio inside the segment
      speechMs += (frame.length / SAMPLE_RATE) * 1000
    }
  }

  return {
    push(audio) {
      let offset = 0
      while (offset + FRAME <= audio.length) {
        frameQueue.push(audio.slice(offset, offset + FRAME))
        offset += FRAME
      }
      if (offset < audio.length && inSpeech) speechBuf.push(...audio.slice(offset))
      drainPromise = drain()
    },
    /** Flush the pending tail as a final segment. Awaits queued frames first. */
    async flush(): Promise<void> {
      await drainPromise
      if (inSpeech) {
        pending.onSpeechEnd?.(speechMs)
        pending.onSegment?.(Float32Array.from(speechBuf), speechMs)
        inSpeech = false
        speechBuf = []
        speechMs = 0
      }
    },
    close() {
      session.release()
    },
  } as VadSession
}

/**
 * Run VAD over a live MediaStream (mic). AudioWorklet captures 16k frames;
 * inference runs on the main thread (2MB model, ~0.1ms/frame, worker lands with core v1).
 */
export async function startVAD(stream: MediaStream, handlers: VadEventHandlers, opts: VadOptions = {}): Promise<{ stop: () => void }> {
  const session = await createVAD({ ...opts, ...handlers })

  const ctx = new AudioContext({ sampleRate: SAMPLE_RATE })
  const source = ctx.createMediaStreamSource(stream)

  // Inline AudioWorklet (no extra network asset).
  const workletCode = `
class VADFrame extends AudioWorkletProcessor {
  process(inputs) {
    const ch = inputs[0]?.[0]
    if (ch) this.port.postMessage(Float32Array.from(ch))
    return true
  }
}
registerProcessor('cunny-ai-vad-frame', VADFrame)`
  const url = URL.createObjectURL(new Blob([workletCode], { type: 'application/javascript' }))
  await ctx.audioWorklet.addModule(url)
  URL.revokeObjectURL(url)

  const node = new AudioWorkletNode(ctx, 'cunny-ai-vad-frame')
  node.port.onmessage = (e) => session.push(e.data as Float32Array)
  source.connect(node)
  // No output connection — a sink is required by some browsers.
  const sink = ctx.createGain()
  sink.gain.value = 0
  node.connect(sink).connect(ctx.destination)

  return {
    stop: () => {
      void session.flush().finally(() => {
        session.close()
        source.disconnect()
        node.disconnect()
        void ctx.close()
      })
    },
  }
}
