/**
 * @cunny-ai/stt-live — streaming speech to text in the browser.
 *
 * `createStreamSTT` returns a session with `feed(Float32Array)` for 16k mono
 * PCM, `flush()`, and callbacks: `onPartial` fires roughly twice a second
 * during ongoing speech, `onEndpoint` delivers the final text per utterance,
 * and `onProbability` mirrors the live VAD probability. v1 is the spec's
 * fallback engine, silero VAD segmentation plus moonshine re-decode, about
 * 32MB total downloaded on first use. The streaming zipformer backend stays
 * planned behind the same API.
 *
 * @example
 * ```ts
 * import { createStreamSTT, micFeed } from '@cunny-ai/stt-live'
 *
 * const stt = await createStreamSTT({ language: 'en' })
 * stt.onPartial = (text) => (caption.textContent = text)
 * stt.onEndpoint = (final) => log(final)
 * const stop = await micFeed(stt)
 * ```
 */
import { createVAD } from '@cunny-ai/vad'
import { transcribe } from '@cunny-ai/stt'
import { listModels } from '@cunny-ai/core'

const TASK = 'stt-live'
const PARTIAL_INTERVAL_MS = 600

/** Options for `createStreamSTT`. */
export interface StreamSttOptions {
  /** BCP-47-ish language tag. v1: 'en'. */
  language?: string
  /** VAD speech probability threshold. Default 0.5. */
  threshold?: number
  /** Specific model variant to load. */
  model?: string
  /** Model download progress. */
  onProgress?: (info: { loaded: number; total: number }) => void
}

/** A streaming transcription session over 16k mono PCM. */
export interface StreamStt {
  /** Feed 16k mono PCM incrementally (any chunk size). */
  feed(audio: Float32Array): void
  /** Flush pending speech as a final utterance (stream end). */
  flush(): Promise<void>
  /** Fires ~2×/s during ongoing speech with the current best guess. */
  onPartial: (text: string) => void
  /** Final text per utterance, once silence confirms the boundary. */
  onEndpoint: (text: string, durationMs: number) => void
  /** Live VAD probability, for meters. */
  onProbability?: (p: number) => void
  /** Stop the session and release the VAD engine. */
  stop(): void
}

/** Model variants registered for this task. */
export function models() {
  return listModels(TASK)
}

/**
 * Create a streaming transcription session. Assign `onPartial` and
 * `onEndpoint`, then feed 16k mono PCM.
 *
 * @example
 * ```ts
 * const stt = await createStreamSTT({ language: 'en' })
 * stt.onPartial = (t) => (caption.textContent = t)
 * stt.onEndpoint = (final) => append(final)
 * micFeed(stt) // or feed your own Float32Array chunks
 * ```
 */
export async function createStreamSTT(opts: StreamSttOptions = {}): Promise<StreamStt> {
  if (opts.language && opts.language !== 'en') {
    throw new Error(`@cunny-ai/stt-live: language "${opts.language}" is not available in v1 (en only)`)
  }

  let speechBuf: Float32Array[] = []
  let speechSamples = 0
  let speechStartedAt = 0
  let partialTimer: ReturnType<typeof setInterval> | undefined
  let stopped = false
  let transcribing = false

  const stt: StreamStt = {
    onPartial: () => {},
    onEndpoint: () => {},
    onProbability: undefined,
    feed(audio) {
      vad.push(audio)
    },
    async flush() {
      await vad.flush()
    },
    stop() {
      stopped = true
      if (partialTimer) clearInterval(partialTimer)
      vad.close()
    },
  }

  const concat = (): Float32Array => {
    const out = new Float32Array(speechSamples)
    let offset = 0
    for (const chunk of speechBuf) {
      out.set(chunk, offset)
      offset += chunk.length
    }
    return out
  }

  /** Re-transcribe the buffered speech for a partial. */
  const refreshPartial = async () => {
    if (stopped || transcribing || speechSamples < 1600) return
    transcribing = true
    try {
      const { text } = await transcribe(concat(), { model: opts.model, onProgress: opts.onProgress })
      if (!stopped && text) stt.onPartial(text.trim())
    } catch {
      /* partials are best-effort */
    } finally {
      transcribing = false
    }
  }

  let inSpeech = false

  const vad = await createVAD({
    threshold: opts.threshold,
    onProgress: opts.onProgress,
    onProbability: (p) => stt.onProbability?.(p),
    onSpeechStart: () => {
      inSpeech = true
      speechBuf = []
      speechSamples = 0
      speechStartedAt = performance.now()
      partialTimer ??= setInterval(() => void refreshPartial(), PARTIAL_INTERVAL_MS)
    },
    onSegment: async (audio, durationMs) => {
      inSpeech = false
      if (partialTimer) { clearInterval(partialTimer); partialTimer = undefined }
      try {
        const { text } = await transcribe(audio, { model: opts.model, onProgress: opts.onProgress })
        const final = text.trim()
        if (final) stt.onEndpoint(final, durationMs || (performance.now() - speechStartedAt))
      } catch (err) {
        console.error('@cunny-ai/stt-live: segment transcription failed', err)
      }
      speechBuf = []
      speechSamples = 0
    },
  })

  // track buffered speech so partials cover exactly the ongoing utterance
  const origPush = stt.feed.bind(stt)
  stt.feed = (audio: Float32Array) => {
    origPush(audio)
    if (!inSpeech) return
    speechBuf.push(audio)
    speechSamples += audio.length
  }

  return stt
}

/**
 * Mic capture helper: 16k mono frames from a MediaStream via an inline
 * AudioWorklet, fed straight into `stt.feed`. Returns a stop function.
 */
export async function micFeed(
  stt: StreamStt,
  stream?: MediaStream,
): Promise<() => void> {
  const mic = stream ?? (await navigator.mediaDevices.getUserMedia({ audio: true }))
  const ctx = new AudioContext({ sampleRate: 16_000 })
  const source = ctx.createMediaStreamSource(mic)
  const workletCode = `
    class FrameTap extends AudioWorkletProcessor {
      process(inputs) {
        const ch = inputs[0]?.[0]
        if (ch && ch.length) this.port.postMessage(new Float32Array(ch))
        return true
      }
    }
    registerProcessor('cunny-ai-frame-tap', FrameTap)
  `
  const url = URL.createObjectURL(new Blob([workletCode], { type: 'text/javascript' }))
  await ctx.audioWorklet.addModule(url)
  URL.revokeObjectURL(url)
  const node = new AudioWorkletNode(ctx, 'cunny-ai-frame-tap')
  node.port.onmessage = (e) => stt.feed(e.data as Float32Array)
  const sink = ctx.createGain()
  sink.gain.value = 0
  source.connect(node).connect(sink).connect(ctx.destination)
  return () => {
    source.disconnect()
    node.disconnect()
    void ctx.close()
    mic.getTracks().forEach((t) => t.stop())
  }
}
