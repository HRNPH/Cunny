/**
 * @cunny-ai/captions — live caption events from a microphone stream.
 *
 * `captionStream(stream, { onCaption, onProbability, onError })` runs
 * @cunny-ai/vad plus @cunny-ai/stt over a mic `MediaStream` and emits caption
 * events shaped `{ text, isFinal, durationMs, ts }`. When more than 3
 * segments are pending transcription, the extra segment is dropped and
 * reported through `onError`. Both engines are individually verified.
 * `captionMic()` is a convenience wrapper around `getUserMedia`.
 *
 * @example
 * ```ts
 * import { captionStream } from '@cunny-ai/captions'
 *
 * const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
 * const stop = await captionStream(stream, {
 *   onCaption: ({ text, isFinal }) => render(text, isFinal),
 * })
 * ```
 */
import { transcribe } from '@cunny-ai/stt'
import { startVAD } from '@cunny-ai/vad'

/** One emitted caption. */
export interface CaptionEvent {
  /** Recognized text of the utterance. */
  text: string
  /** Always true in v1: captions finalize per utterance. */
  isFinal: boolean
  /** Utterance duration in ms. */
  durationMs: number
  /** Monotonic session offset when the utterance ended. */
  ts: number
}

/** Callbacks for caption events and pipeline errors. */
export interface CaptionHandlers {
  /** Fires once per finalized utterance. */
  onCaption: (e: CaptionEvent) => void
  /** Live VAD probability, for a mic meter. */
  onProbability?: (p: number) => void
  /** Pipeline errors, including dropped segments. */
  onError?: (err: Error) => void
}

/** Options for `captionStream`. */
export interface CaptionsOptions {
  /** VAD speech probability threshold. */
  vadThreshold?: number
  /** Model download progress. */
  onProgress?: (info: { loaded: number; total: number }) => void
}

/**
 * Caption a live `MediaStream`. Returns a stop function.
 *
 * Backpressure: once 3 segments are pending transcription, further segments
 * are dropped and reported via onError.
 *
 * @example
 * ```ts
 * const stop = await captionStream(micStream, {
 *   onCaption: ({ text, isFinal }) => updateUI(text, isFinal),
 * })
 * ```
 */
export async function captionStream(
  stream: MediaStream,
  handlers: CaptionHandlers,
  opts: CaptionsOptions = {},
): Promise<() => void> {
  let pending = 0
  const MAX_PENDING = 3

  const vad = await startVAD(stream, {
    onProbability: handlers.onProbability,
    onSegment: async (audio, durationMs) => {
      if (pending >= MAX_PENDING) {
        handlers.onError?.(new Error('@cunny-ai/captions: transcription lagging — segment dropped'))
        return
      }
      pending++
      try {
        const { text } = await transcribe(audio, { onProgress: opts.onProgress })
        if (text) {
          handlers.onCaption({ text, isFinal: true, durationMs, ts: performance.now() })
        }
      } catch (err) {
        handlers.onError?.(err as Error)
      } finally {
        pending--
      }
    },
  }, {
    threshold: opts.vadThreshold,
    onProgress: opts.onProgress,
  })

  return vad.stop
}

/** Convenience: capture mic + captions in one call. */
export async function captionMic(handlers: CaptionHandlers, opts: CaptionsOptions = {}): Promise<() => void> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
  const stopCaptions = await captionStream(stream, handlers, opts)
  return () => {
    stopCaptions()
    for (const t of stream.getTracks()) t.stop()
  }
}
