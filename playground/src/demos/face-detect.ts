import { detect } from '@cunny-ai/face-detect'
import { drawOverlay, progressCb, say, showSample, stageHtml, stats } from '../ui.js'

export function mount(el: HTMLElement) {
  el.innerHTML = `<button id="run">Detect faces</button>${stageHtml()}`
  el.querySelector('#run')!.addEventListener('click', async () => {
    const stage = await showSample()
    say('loading…')
    const t0 = performance.now()
    const { faces, elapsedMs } = await detect(stage.img, { onProgress: progressCb() })
    drawOverlay((ctx, w) => {
      ctx.lineWidth = Math.max(2, w / 300)
      ctx.font = `${Math.max(12, w / 45)}px ui-monospace, monospace`
      for (const f of faces) {
        const { x, y, width, height } = f.box
        ctx.strokeStyle = '#4ade80'
        ctx.strokeRect(x, y, width, height)
        const label = `face ${(f.score * 100).toFixed(0)}%`
        const tw = ctx.measureText(label).width
        ctx.fillStyle = 'rgba(74,222,128,.9)'
        ctx.fillRect(x, Math.max(0, y - 22), tw + 10, 22)
        ctx.fillStyle = '#0b0d10'
        ctx.fillText(label, x + 5, Math.max(15, y - 6))
        ctx.fillStyle = '#60a5fa'
        for (const kp of f.keypoints) {
          ctx.beginPath()
          ctx.arc(kp.x * w, kp.y * stage.overlay.height, Math.max(3, w / 220), 0, Math.PI * 2)
          ctx.fill()
        }
      }
    })
    say(`${faces.length} face${faces.length === 1 ? '' : 's'} detected`, true)
    stats(`inference ${elapsedMs.toFixed(1)} ms · total ${(performance.now() - t0).toFixed(0)} ms`)
  })
}
