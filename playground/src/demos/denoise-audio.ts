import { denoiseBuffer } from '@cunny-ai/denoise-audio'
import { say, stats } from '../ui.js'
import sampleWav from '../../assets/jfk.wav'

export function mount(el: HTMLElement) {
  el.innerHTML = `
    <button id="run">Denoise sample (speech + white noise)</button>
    <div style="display:flex;gap:12px;max-width:680px;margin-top:8px">
      <canvas id="before" style="flex:1;background:#111418;border-radius:8px;border:1px solid #222831"></canvas>
      <canvas id="after" style="flex:1;background:#111418;border-radius:8px;border:1px solid #222831"></canvas>
    </div>
    <div id="stats"></div>`
  el.querySelector('#run')!.addEventListener('click', async () => {
    say('decoding sample and adding noise…')
    try {
      const arrayBuf = await (await fetch(sampleWav)).arrayBuffer()
      const ctx = new AudioContext()
      const buffer = await ctx.decodeAudioData(arrayBuf)
      await ctx.close()
      const clean = buffer.getChannelData(0)
      const rate = buffer.sampleRate
      // 1kHz calibration tone + speech so the noise floor is visible
      const noisy = new Float32Array(clean.length)
      for (let i = 0; i < clean.length; i++) {
        const noise = (Math.random() * 2 - 1) * 0.15
        noisy[i] = Math.max(-1, Math.min(1, clean[i] + noise))
      }
      say('running rnnoise (bundled wasm, zero download)…')
      const t0 = performance.now()
      const { audio, vad } = await denoiseBuffer(noisy, rate)
      draw(document.getElementById('before') as HTMLCanvasElement, noisy)
      draw(document.getElementById('after') as HTMLCanvasElement, audio)
      const noiseFloor = rms(audio.subarray(0, 16000))
      say(`denoised — vad ${vad.toFixed(2)}`, true)
      stats(`rnnoise pass ${((performance.now() - t0) / 1000).toFixed(1)}s · leading-second rms ${noiseFloor.toFixed(4)} (left = noisy, right = cleaned)`)
    } catch (e) {
      say(`failed: ${(e as Error).message}`)
    }
  })
}

function rms(x: Float32Array): number {
  let s = 0
  for (let i = 0; i < x.length; i++) s += x[i] * x[i]
  return Math.sqrt(s / x.length)
}

function draw(canvas: HTMLCanvasElement, pcm: Float32Array) {
  canvas.width = 330
  canvas.height = 140
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#111418'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.strokeStyle = '#4ade80'
  ctx.beginPath()
  const step = Math.max(1, Math.floor(pcm.length / canvas.width))
  for (let x = 0; x < canvas.width; x++) {
    let peak = 0
    for (let j = 0; j < step; j += 16) peak = Math.max(peak, Math.abs(pcm[x * step + j] ?? 0))
    const h = peak * (canvas.height / 2 - 4)
    ctx.moveTo(x + 0.5, canvas.height / 2 - h)
    ctx.lineTo(x + 0.5, canvas.height / 2 + h)
  }
  ctx.stroke()
}
