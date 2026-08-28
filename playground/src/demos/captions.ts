import { captionStream } from '@cunny-ai/captions'
import { say, stats } from '../ui.js'
import sampleWav from '../../assets/jfk.wav'

export function mount(el: HTMLElement) {
  el.innerHTML = `
    <button id="run">Start captions (synthetic mic)</button>
    <div style="margin:14px 0;max-width:420px">
      <div style="font-size:12px;color:#8b949e;margin-bottom:4px">mic level (vad probability)</div>
      <div style="background:#1a1f26;border-radius:6px;height:14px;overflow:hidden"><div id="meter" style="height:100%;width:0%;background:#4ade80"></div></div>
    </div>
    <div id="caps" style="font:15px/1.7 ui-sans-serif,system-ui;max-width:640px"></div>`
  let stop: (() => void) | undefined
  el.querySelector('#run')!.addEventListener('click', async () => {
    if (stop) { stop(); stop = undefined; say('stopped', true); return }
    say('loading vad + moonshine…')
    try {
      // Feed the sample wav through a MediaStream so the pipeline is exactly
      // what a real mic goes through — no permission prompt needed.
      const blob = await (await fetch(sampleWav)).blob()
      const arrayBuf = await blob.arrayBuffer()
      const ctx = new AudioContext()
      const buffer = await ctx.decodeAudioData(arrayBuf)
      const src = ctx.createBufferSource()
      src.buffer = buffer
      const dest = ctx.createMediaStreamDestination()
      src.connect(dest)
      src.start()
      stop = await captionStream(dest.stream, {
        onProbability: (p) => {
          const meter = document.getElementById('meter') as HTMLElement
          meter.style.width = `${(p * 100).toFixed(0)}%`
        },
        onError: (err) => { stats(`error: ${err.message}`) },
        onCaption: (e) => {
          const caps = document.getElementById('caps')!
          const line = document.createElement('div')
          line.textContent = `${(e.durationMs / 1000).toFixed(1)}s → ${e.text}`
          caps.appendChild(line)
          stats(`captions: ${document.getElementById('caps')!.childElementCount}`)
        },
      })
      say('listening to synthetic mic (11s clip)…', true)
      src.onended = () => { stats('sample audio ended') }
    } catch (e) {
      say(`failed: ${(e as Error).message}`)
    }
  })
}
