import { detect } from '@cunny-ai/detect'
import { drawOverlay, progressCb, say, showSample, stageHtml, stats } from '../ui.js'

export function mount(el: HTMLElement) {
  el.innerHTML = `<button id="run">Detect objects</button>${stageHtml()}`
  el.querySelector('#run')!.addEventListener('click', async () => {
    const stage = await showSample()
    say('loading…')
    const t0 = performance.now()
    const { detections, elapsedMs } = await detect(stage.img, { onProgress: progressCb() })
    drawOverlay((ctx, w, h) => {
      ctx.lineWidth = Math.max(2, w / 300)
      ctx.font = `${Math.max(12, w / 45)}px ui-monospace, monospace`
      for (const d of detections) {
        const { x, y, width, height } = d.box
        ctx.strokeStyle = '#f59e0b'
        ctx.strokeRect(x, y, width, height)
        const label = `${d.label} ${(d.score * 100).toFixed(0)}%`
        const tw = ctx.measureText(label).width
        ctx.fillStyle = 'rgba(245,158,11,.9)'
        ctx.fillRect(x, Math.max(0, y - 22), tw + 10, 22)
        ctx.fillStyle = '#0b0d10'
        ctx.fillText(label, x + 5, Math.max(15, y - 6))
      }
    })
    say(`${detections.length} object(s): ${[...new Set(detections.map((d) => d.label))].join(', ') || 'none'}`, true)
    stats(`inference ${elapsedMs.toFixed(1)} ms · total ${(performance.now() - t0).toFixed(0)} ms`)
  })
}
