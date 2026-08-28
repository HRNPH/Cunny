/**
 * @cunny-ai/tts — Kokoro-82M int8 via kokoro-js (private impl detail, builtin policy),
 * with a `native` tier routing to speechSynthesis (0MB, always available).
 * Sentence-chunked synthesis: the first sentence plays while later ones generate.
 */
import { listModels, resolveModel } from '@cunny-ai/core'

const TASK = 'tts'
const DEFAULT_VOICE = 'af_heart'
const KOKORO_REPO = 'onnx-community/Kokoro-82M-ONNX'

export interface VoiceInfo {
  id: string
  lang: string
  gender: string
}

export interface SpeakOptions {
  /** Kokoro voice id, e.g. 'af_heart' (en female). Default 'af_heart'. */
  voice?: string
  speed?: number
  /** 'auto' | 'kokoro' | 'native'. 'native' = OS voices, zero download. Default 'auto' → kokoro. */
  engine?: 'auto' | 'kokoro' | 'native'
  model?: string
  acceleration?: 'auto' | 'wasm' | 'webgpu'
  onProgress?: (info: { loaded: number; total: number; file?: string }) => void
}

export interface Utterance {
  audio: Float32Array
  sampleRate: number
  play(): Promise<void>
  stop(): void
  toWav(): Blob
}

export function models() {
  return listModels(TASK)
}

/** List Kokoro voices (id, lang, gender). Native voices via speechSynthesis.getVoices(). */
export function voices(): VoiceInfo[] {
  // Kokoro naming: af_/am_ = American female/male, bf_/bm_ = British.
  const ids = [
    'af_heart', 'af_bella', 'af_nicole', 'af_sarah', 'am_michael', 'am_adam',
    'bf_emma', 'bf_isabella', 'bm_george', 'bm_lewis',
  ]
  return ids.map((id) => ({
    id,
    lang: id.startsWith('a') ? 'en-US' : 'en-GB',
    gender: id.includes('f_') ? 'female' : 'male',
  }))
}

interface KokoroEngine {
  generate(text: string, opts: { voice: string; speed: number }): Promise<{ audio: Float32Array; sampling_rate: number }>
}

let enginePromise: Promise<KokoroEngine> | undefined

async function getEngine(opts: SpeakOptions): Promise<KokoroEngine> {
  enginePromise ??= (async () => {
    const { KokoroTTS } = await import('kokoro-js')
    return (await KokoroTTS.from_pretrained(KOKORO_REPO, {
      dtype: 'q8',
      device: opts.acceleration === 'wasm' ? 'wasm' : null,
    })) as unknown as KokoroEngine
  })()
  return enginePromise
}

/** WAV blob from Float32 PCM — used by toWav(). */
function encodeWav(samples: Float32Array, sampleRate: number): Blob {
  const buf = new ArrayBuffer(44 + samples.length * 2)
  const view = new DataView(buf)
  const w = (off: number, s: string) => { for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i)) }
  w(0, 'RIFF')
  view.setUint32(4, 36 + samples.length * 2, true)
  w(8, 'WAVEfmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  w(36, 'data')
  view.setUint32(40, samples.length * 2, true)
  let off = 44
  for (let i = 0; i < samples.length; i++, off += 2) {
    const s = Math.max(-1, Math.min(1, samples[i]))
    view.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7fff, true)
  }
  return new Blob([buf], { type: 'audio/wav' })
}

function playPcm(samples: Float32Array, sampleRate: number): Promise<void> {
  return new Promise((resolve) => {
    const ctx = new AudioContext({ sampleRate })
    const src = ctx.createBufferSource()
    const copy = new Float32Array(samples)
    src.buffer = ctx.createBuffer(1, copy.length, sampleRate)
    src.buffer.copyToChannel(copy, 0)
    src.connect(ctx.destination)
    src.onended = () => { void ctx.close(); resolve() }
    void ctx.resume()
    src.start()
    ;(src as unknown as { __stop?: () => void }).__stop = () => { try { src.stop() } catch { /* already ended */ } }
  })
}

/** Split into sentences for incremental synthesis. */
function sentences(text: string): string[] {
  return text.match(/[^.!?…\n]+[.!?…]*\s*/g)?.map((s) => s.trim()).filter(Boolean) ?? [text]
}

/**
 * Synthesize speech. First sentence starts playing while later sentences generate.
 * ```ts
 * const u = await speak('Hello from the browser. No server involved.')
 * await u.play()
 * ```
 */
export async function speak(text: string, opts: SpeakOptions = {}): Promise<Utterance> {
  const engine: 'kokoro' | 'native' =
    opts.engine === 'native' || opts.model === 'native' ? 'native' : 'kokoro'
  const voice = opts.voice ?? DEFAULT_VOICE
  const speed = opts.speed ?? 1

  if (engine === 'native') {
    const u = new SpeechSynthesisUtterance(text)
    u.rate = speed
    u.pitch = 1
    const match = speechSynthesis.getVoices().find((v) => v.lang.startsWith('en'))
    if (match) u.voice = match
    return {
      audio: new Float32Array(0),
      sampleRate: 0,
      play: () => new Promise<void>((resolve) => {
        u.onend = () => resolve()
        speechSynthesis.speak(u)
      }),
      stop: () => speechSynthesis.cancel(),
      toWav: () => new Blob(),
    }
  }

  const kokoro = await getEngine(opts)
  const parts = sentences(text)
  const chunks: Float32Array[] = []
  let sampleRate = 24000

  // Generate sentence-by-sentence; start playback of the first chunk immediately via play().
  let generatePromise: Promise<void> = (async () => {
    for (const part of parts) {
      const out = await kokoro.generate(part, { voice, speed })
      sampleRate = out.sampling_rate || sampleRate
      chunks.push(out.audio)
    }
  })()

  return {
    get audio() {
      const total = chunks.reduce((n, c) => n + c.length, 0)
      const merged = new Float32Array(total)
      let off = 0
      for (const c of chunks) { merged.set(c, off); off += c.length }
      return merged
    },
    sampleRate,
    async play() {
      let played = 0
      // Sequential playback that waits for generation to keep up.
      for (;;) {
        if (played < chunks.length) {
          await playPcm(chunks[played++], sampleRate)
        } else {
          await Promise.race([generatePromise, new Promise((r) => setTimeout(r, 50))])
          if (played >= chunks.length) break
        }
      }
    },
    stop() {
      /* v0: stop between sentences */
    },
    toWav() {
      const total = chunks.reduce((n, c) => n + c.length, 0)
      const merged = new Float32Array(total)
      let off = 0
      for (const c of chunks) { merged.set(c, off); off += c.length }
      return encodeWav(merged, sampleRate)
    },
  }
}
