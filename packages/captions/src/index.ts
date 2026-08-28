/**
 * @cunny-ai/captions — L4 combo: mic → VAD segments → STT → caption events.
 * Batch mode (v0): captions finalize per utterance (~1.5s after speech ends).
 * The public event shape is engine-agnostic so 018 stt-live flips in without API changes.
 */
import { transcribe } from '@cunny-ai/stt'
import { startVAD } from '@cunny-ai/vad'

export interface CaptionEvent {
  text: string
  isFinal: boolean
  /** Utterance duration in ms. */
  durationMs: number
  /** Monotonic session offset when the utterance ended. */
  ts: number
}

export interface CaptionHandlers {
  onCaption: (e: CaptionEvent) => void
  /** Live VAD probability — for a mic meter. */
  onProbability?: (p: number) => void
  onError?: (err: Error) => void
}

export interface CaptionsOptions {
  vadThreshold?: number
  onProgress?: (info: { loaded: number; total: number }) => void
}

/**
 * ```ts
 * const stop = await captionStream(micStream, {
 *   onCaption: ({ text, isFinal }) => updateUI(text, isFinal),
 * })
 * ```
 * Backpressure rule (019 spec): transcription falling behind drops oldest pending
 * segments and reports via onError — never queues unbounded.
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
