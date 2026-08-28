import { similarity } from '@cunny-ai/similarity'
import { progressCb, say } from '../ui.js'

export function mount(el: HTMLElement) {
  el.innerHTML = `
    <input type="text" id="a" value="the cat sat on the mat" />
    <input type="text" id="b" value="a feline rested on a rug" />
    <button id="run">Similarity</button>
    <div class="bars" id="bars"></div>`
  el.querySelector('#run')!.addEventListener('click', async () => {
    const a = (document.getElementById('a') as HTMLInputElement).value
    const b = (document.getElementById('b') as HTMLInputElement).value
    say('loading (~23MB first time)…')
    const t0 = performance.now()
    const score = await similarity(a, b, { onProgress: progressCb() })
    const bars = document.getElementById('bars')!
    bars.innerHTML = `
      <div class="bar-row"><div class="label">similar</div><div class="track"><div class="fill" style="width:${(score * 100).toFixed(1)}%;background:#4ade80"></div></div><div>${(score * 100).toFixed(1)}%</div></div>
      <div class="bar-row"><div class="label">0.5 ≈ roughly related · 0.7+ ≈ paraphrase</div></div>`
    say(`calibrated score: ${score.toFixed(3)}`, true)
    say(`score ${score.toFixed(3)} — ${score > 0.7 ? 'paraphrase-grade match' : score > 0.5 ? 'related' : 'unrelated'} (${((performance.now() - t0) / 1000).toFixed(1)}s incl. first load)`, true)
  })
}
