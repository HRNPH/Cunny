/**
 * @cunny-ai/denoise-audio — RNNoise noise suppression, fully offline.
 *
 * The wasm (~112KB, BSD-2) and its emscripten glue ship inside the package
 * as assets: zero network requests after install, works from node_modules.
 * RNNoise is speech-tuned: great for calls, it will flatten music.
 *
 * Frame protocol: 480 samples (10ms @ 48kHz) per process call, the model's
 * native cadence; resampling happens only at the API edges.
 */

const WASM_URL = new URL('../assets/rnnoise.wasm', import.meta.url).href
const GLUE_URL = new URL('../assets/rnnoise-glue.js', import.meta.url).href
export const FRAME_SIZE = 480

/* eslint-disable @typescript-eslint/no-explicit-any */
type WasmModule = any

let modulePromise: Promise<WasmModule> | undefined

/** Load the emscripten module (vendored glue + wasm). */
async function getModule(): Promise<WasmModule> {
  modulePromise ??= (async () => {
    const factory = (await import(/* @vite-ignore */ GLUE_URL)).default as (opts?: { locateFile?: (f: string) => string }) => Promise<WasmModule>
    return factory({ locateFile: () => WASM_URL })
  })()
  return modulePromise
}

export interface Denoiser {
  /**
   * Process one 480-sample frame. Returns the cleaned frame plus the
   * model's voice-activity probability for that frame.
   */
  processFrame(frame: Float32Array): { frame: Float32Array; vad: number }
  destroy(): void
}

/** Explicit-lifecycle denoiser (one instance = one RNNoise state). */
export async function createDenoiser(): Promise<Denoiser> {
  const mod = await getModule()
  let ctx = mod._rnnoise_create()
  const inPtr = mod._malloc(FRAME_SIZE * 4)
  const outPtr = mod._malloc(FRAME_SIZE * 4)
  const heap = mod.HEAPF32
  const alive = () => {
    if (!ctx) throw new Error('@cunny-ai/denoise-audio: denoiser destroyed')
  }
  return {
    processFrame(frame) {
      alive()
      if (frame.length !== FRAME_SIZE) {
        throw new Error(`@cunny-ai/denoise-audio: expected ${FRAME_SIZE} samples, got ${frame.length}`)
      }
      heap.set(frame, inPtr >> 2)
      const vad = mod._rnnoise_process_frame(ctx, outPtr, inPtr)
      // slice() copies out of the wasm heap before any grow invalidates views
      return { frame: heap.slice(outPtr >> 2, (outPtr >> 2) + FRAME_SIZE), vad }
    },
    destroy() {
      if (!ctx) return
      mod._rnnoise_destroy(ctx)
      mod._free(inPtr)
      mod._free(outPtr)
      ctx = 0
    },
  }
}

export interface DenoiseResult {
  /** Cleaned PCM at the input sample rate. */
  audio: Float32Array
  /** Mean voice-activity probability across frames. */
  vad: number
}

/**
 * One-shot denoise of a recording. Input is PCM at `sampleRate`; anything
 * other than 48k is linearly resampled around the model, then back.
 */
export async function denoiseBuffer(pcm: Float32Array, sampleRate = 48_000): Promise<DenoiseResult> {
  const denoiser = await createDenoiser()
  try {
    const toModel = sampleRate === 48_000 ? pcm : resample(pcm, sampleRate, 48_000)
    const frames = Math.floor(toModel.length / FRAME_SIZE)
    const out = new Float32Array(frames * FRAME_SIZE)
    let vadSum = 0
    for (let i = 0; i < frames; i++) {
      const { frame, vad } = denoiser.processFrame(toModel.subarray(i * FRAME_SIZE, (i + 1) * FRAME_SIZE))
      out.set(frame, i * FRAME_SIZE)
      vadSum += vad
    }
    return {
      audio: sampleRate === 48_000 ? out : resample(out, 48_000, sampleRate),
      vad: frames ? vadSum / frames : 0,
    }
  } finally {
    denoiser.destroy()
  }
}

/**
 * Realtime path: returns a new MediaStream whose audio track is denoised.
 * The wasm runs inside an AudioWorklet at 48kHz, one 10ms frame per call.
 */
export async function denoiseStream(stream: MediaStream): Promise<MediaStream> {
  const glueText = await (await fetch(GLUE_URL)).text()
  const workletCode = `
${glueText}

class RnnoiseProcessor extends AudioWorkletProcessor {
  constructor() {
    super()
    this.buf = new Float32Array(${FRAME_SIZE})
    this.filled = 0
    this.queue = []
    this.qOffset = 0
    this.ctx = 0
    this.inPtr = 0
    this.outPtr = 0
    this.mod = null
    createRNNWasmModule({ locateFile: () => ${JSON.stringify(WASM_URL)} }).then((m) => {
      this.mod = m
      this.ctx = m._rnnoise_create()
      this.inPtr = m._malloc(${FRAME_SIZE} * 4)
      this.outPtr = m._malloc(${FRAME_SIZE} * 4)
    })
  }
  process(inputs, outputs) {
    const input = inputs[0]?.[0]
    const output = outputs[0]?.[0]
    if (input) {
      for (let i = 0; i < input.length; i++) {
        this.buf[this.filled++] = input[i]
        if (this.filled === ${FRAME_SIZE}) {
          this.filled = 0
          if (this.mod && this.ctx) {
            const heap = this.mod.HEAPF32
            heap.set(this.buf, this.inPtr >> 2)
            this.mod._rnnoise_process_frame(this.ctx, this.outPtr, this.inPtr)
            this.queue.push(Float32Array.from(heap.subarray(this.outPtr >> 2, (this.outPtr >> 2) + ${FRAME_SIZE})))
          }
        }
      }
    }
    if (output) {
      for (let i = 0; i < output.length; i++) {
        const head = this.queue[0]
        if (head) {
          output[i] = head[this.qOffset++] || 0
          if (this.qOffset >= ${FRAME_SIZE}) { this.queue.shift(); this.qOffset = 0 }
        } else {
          output[i] = 0
        }
      }
    }
    return true
  }
}
registerProcessor('cunny-ai-rnnoise', RnnoiseProcessor)
`
  const url = URL.createObjectURL(new Blob([workletCode], { type: 'text/javascript' }))
  const ctx = new AudioContext({ sampleRate: 48_000 })
  try {
    await ctx.audioWorklet.addModule(url)
  } finally {
    URL.revokeObjectURL(url)
  }
  const source = ctx.createMediaStreamSource(stream)
  const node = new AudioWorkletNode(ctx, 'cunny-ai-rnnoise', {
    numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1],
  })
  const dest = ctx.createMediaStreamDestination()
  source.connect(node).connect(dest)
  const out = dest.stream
  const origTracks = stream.getVideoTracks()
  for (const t of origTracks) out.addTrack(t)
  return out
}

/** Linear resample (good enough for speech edges; the model sits at 48k). */
export function resample(pcm: Float32Array, from: number, to: number): Float32Array {
  if (from === to) return pcm
  const ratio = from / to
  const n = Math.floor(pcm.length / ratio)
  const out = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    const pos = i * ratio
    const i0 = Math.floor(pos)
    const frac = pos - i0
    const cur = pcm[i0] ?? 0
    const next = pcm[Math.min(i0 + 1, pcm.length - 1)] ?? cur
    out[i] = cur * (1 - frac) + next * frac
  }
  return out
}
