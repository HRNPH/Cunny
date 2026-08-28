import { classify } from '@cunny-ai/clip'
import { progressCb, say, showSample, stageHtml, stats } from '../ui.js'

const LABELS = ['a politician', 'a selfie', 'a receipt', 'a landscape', 'a pet', 'food', 'a document']

export function mount(el: HTMLElement) {
  el.innerHTML = `<button id="run">Zero-shot classify</button>${stageHtml()}<div class="bars" id="bars"></div>`
  el.querySelector('#run')!.addEventListener('click', async () => {
    const stage = await showSample()
    say('loading (~50MB first time)…')
    const t0 = performance.now()
    const results = await classify(stage.img, LABELS, { onProgress: progressCb() })
    const bars = document.getElementById('bars')!
    bars.innerHTML = ''
    for (const { label, score } of results) {
      const row = document.createElement('div')
      row.className = 'bar-row'
      row.innerHTML = `<div class="label">${label}</div><div class="track"><div class="fill" style="width:${(score * 100).toFixed(1)}%"></div></div><div>${(score * 100).toFixed(1)}%</div>`
      bars.appendChild(row)
    }
    say(`top: ${results[0].label} (${(results[0].score * 100).toFixed(1)}%)`, true)
    stats(`total ${(performance.now() - t0).toFixed(0)} ms · labels: ${LABELS.join(', ')}`)
  })
}
