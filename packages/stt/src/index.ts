/**
 * @cunny-ai/stt — local speech-to-text via Moonshine tiny (27M, ~30MB q8).
 * Accepts audio Files/Blobs/URLs or raw Float32Array PCM; decodes + resamples to 16k mono internally.
 */
import { listModels, resolveModel } from '@cunny-ai/core'

const TASK = 'stt'

export type SttSource = Blob | File | string | Float32Array

export interface TranscribeResult {
  text: string
  /** Input audio duration in ms. */
  durationMs: number
  /** Inference wall time in ms. */
  elapsedMs: number
  chunks?: Array<{ text: string; timestamp: [number, number] }>
}

export interface SttOptions {
  model?: string
  acceleration?: 'auto' | 'wasm' | 'webgpu'
  onProgress?: (info: { loaded: number; total: number; file?: string }) => void
}

export function models() {
  return listModels(TASK)
}

type AsrPipeline = (
  audio: Float32Array,
  opts: { chunk_length_s?: number; stride_length_s?: number; return_timestamps?: boolean },
) => Promise<{ text: string; chunks?: Array<{ text: string; timestamp: [number, number] }> }>

let pipePromise: Promise<AsrPipeline> | undefined

async function getPipeline(opts: SttOptions = {}): Promise<AsrPipeline> {
  pipePromise ??= (async () => {
    const { entry } = resolveModel(TASK, opts.model)
    const { pipeline, env } = await import('@huggingface/transformers')
    env.allowLocalModels = false
    return pipeline('automatic-speech-recognition', entry.repo!, {
      dtype: 'q8',
      device: opts.acceleration === 'webgpu' ? 'webgpu' : 'wasm',
      progress_callback: (e: { status: string; loaded?: number; total?: number; file?: string }) => {
        if (e.status === 'progress' && opts.onProgress && e.total) {
          opts.onProgress({ loaded: e.loaded ?? 0, total: e.total, file: e.file })
        }
      },
    }) as unknown as AsrPipeline
  })()
  return pipePromise
}

/** Decode any audio blob/url to 16kHz mono Float32Array. */
async function decodeTo16kMono(source: SttSource): Promise<Float32Array> {
  if (source instanceof Float32Array) return source
  const blob = typeof source === 'string' ? await (await fetch(source, { mode: 'cors' })).blob() : source
  const ctx = new (window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)({ sampleRate: 16_000 })
  try {
    const buf = await ctx.decodeAudioData(await blob.arrayBuffer())
    if (buf.numberOfChannels === 1) return buf.getChannelData(0).slice()
    const left = buf.getChannelData(0)
    const right = buf.getChannelData(1)
    const mono = new Float32Array(left.length)
    for (let i = 0; i < left.length; i++) mono[i] = (left[i] + right[i]) / 2
    return mono
  } finally {
    void ctx.close()
  }
}

/** Transcribe an audio file/blob/URL (or raw 16k PCM). */
export async function transcribe(source: SttSource, opts: SttOptions = {}): Promise<TranscribeResult> {
  const audio = await decodeTo16kMono(source)
  const pipe = await getPipeline(opts)
  const t0 = performance.now()
  const out = await pipe(audio, { chunk_length_s: 10, stride_length_s: 1 })
  return {
    text: out.text.trim(),
    durationMs: (audio.length / 16_000) * 1000,
    elapsedMs: performance.now() - t0,
    chunks: out.chunks?.map((c) => ({ text: c.text, timestamp: c.timestamp })),
  }
}
