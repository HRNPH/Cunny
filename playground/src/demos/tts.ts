import { speak, voices } from '@cunny-ai/tts'
import { progressCb, say, stageHtml, stats } from '../ui.js'

export function mount(el: HTMLElement) {
  el.innerHTML = `
    <input type="text" id="text" value="Hello from the browser. This voice is generated locally, with no server involved." />
    <button id="kokoro">Speak (kokoro · ~85MB first load)</button>
    <button id="native" style="background:#374151">Speak (native · 0MB)</button>
    ${stageHtml()}`
  const text = () => (document.getElementById('text') as HTMLInputElement).value
  stats(`voices: ${voices().slice(0, 6).map((v) => v.id).join(', ')} …`)

  el.querySelector('#kokoro')!.addEventListener('click', async () => {
    say('loading kokoro (~85MB first time)…')
    const t0 = performance.now()
    try {
      const u = await speak(text(), { onProgress: progressCb() })
      drawWave(u.audio, u.sampleRate)
      say(`synthesizing (${u.sampleRate / 1000}kHz) — playing`, true)
      await u.play()
      say('done', true)
      stats(`total ${((performance.now() - t0) / 1000).toFixed(1)}s · ${(u.audio.length / u.sampleRate).toFixed(1)}s of audio`)
    } catch (e) {
      say(`kokoro failed: ${(e as Error).message} — try native`, false)
    }
  })

  el.querySelector('#native')!.addEventListener('click', async () => {
    const u = await speak(text(), { engine: 'native' })
    say('speaking (OS voices)', true)
    await u.play()
  })
}

function drawWave(samples: Float32Array, sampleRate: number) {
  const c = document.getElementById('pov') as HTMLCanvasElement
  const img = document.getElementById('pimg') as HTMLImageElement
  c.width = 680
  c.height = 200
  img.hidden = true
  c.hidden = false
  const ctx = c.getContext('2d')!
  ctx.fillStyle = '#111418'
  ctx.fillRect(0, 0, c.width, c.height)
  ctx.strokeStyle = '#4ade80'
  ctx.lineWidth = 1
  ctx.beginPath()
  const step = Math.max(1, Math.floor(samples.length / c.width))
  for (let x = 0; x < c.width; x++) {
    const v = samples[x * step] ?? 0
    const y = c.height / 2 + v * (c.height / 2 - 4)
    if (x === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  }
  ctx.stroke()
  ctx.fillStyle = '#8b949e'
  ctx.font = '12px ui-monospace,monospace'
  ctx.fillText(`${(samples.length / sampleRate).toFixed(1)}s · ${(sampleRate / 1000).toFixed(0)}kHz`, 8, 16)
}
