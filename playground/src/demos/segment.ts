import { segment, VOC_CLASSES } from '@cunny-ai/segment'
import { progressCb, say, showSample, stageHtml, stats } from '../ui.js'

export function mount(el: HTMLElement) {
  el.innerHTML = `<button id="run">Segment</button>${stageHtml()}`
  el.querySelector('#run')!.addEventListener('click', async () => {
    const stage = await showSample()
    say('loading…')
    const t0 = performance.now()
    const { coverage, elapsedMs, colored } = await segment(stage.img, { onProgress: progressCb() })
    const ctx = stage.overlay.getContext('2d')!
    ctx.putImageData(colored, 0, 0)
    const top = Object.entries(coverage)
      .filter(([c]) => c !== 'background')
      .sort((a, b) => b[1] - a[1])
      .map(([c, v]) => `${c}: ${(v * 100).toFixed(1)}%`)
      .join(' · ')
    say(`segmented — ${Object.keys(coverage).length} classes present`, true)
    stats(`inference ${elapsedMs.toFixed(1)} ms · total ${(performance.now() - t0).toFixed(0)} ms\nclasses: ${top || 'background only'} · legend: ${VOC_CLASSES.length} VOC classes`)
  })
}
