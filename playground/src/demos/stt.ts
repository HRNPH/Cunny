import { transcribe } from '@cunny-ai/stt'
import { progressCb, say, stageHtml, stats } from '../ui.js'
import sampleWav from '../../assets/jfk.wav'

export function mount(el: HTMLElement) {
  el.innerHTML = `<button id="run">Transcribe sample (11s speech)</button>${stageHtml()}<div id="text" style="margin-top:12px;font-size:15px;line-height:1.6"></div>`
  el.querySelector('#run')!.addEventListener('click', async () => {
    say('loading moonshine-tiny (~30MB first time)…')
    const t0 = performance.now()
    try {
      const { text, durationMs, elapsedMs } = await transcribe(sampleWav, { onProgress: progressCb() })
      ;(document.getElementById('text') as HTMLElement).textContent = text
      say('transcribed', true)
      stats(`audio ${(durationMs / 1000).toFixed(1)}s · inference ${(elapsedMs / 1000).toFixed(1)}s · total ${((performance.now() - t0) / 1000).toFixed(1)}s incl. first load`)
    } catch (e) {
      say(`failed: ${(e as Error).message}`)
    }
  })
}
