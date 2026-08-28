import { removeBackground } from '@cunny-ai/bg-remove'
import { progressCb, say, stageHtml, stats, sampleUrl } from '../ui.js'

export function mount(el: HTMLElement) {
  el.innerHTML = `<button id="run">Remove background</button>${stageHtml(true)}`
  el.querySelector('#run')!.addEventListener('click', async () => {
    const img = document.getElementById('pimg') as HTMLImageElement
    img.hidden = false
    const stage = document.getElementById('stage')!
    stage.classList.add('checker')
    say('loading…')
    const t0 = performance.now()
    const blob = await removeBackground(sampleUrl, { onProgress: progressCb() })
    const url = URL.createObjectURL(blob)
    img.src = url
    await img.decode()
    say(`cutout ready — ${(blob.size / 1024).toFixed(0)} KB PNG`, true)
    stats(`total ${(performance.now() - t0).toFixed(0)} ms · model ~250 KB (cached after first run)`)
  })
}
