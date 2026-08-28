import { depth } from '@cunny-ai/depth'
import { drawOverlay, progressCb, say, showSample, stageHtml, stats } from '../ui.js'

export function mount(el: HTMLElement) {
  el.innerHTML = `<button id="run">Estimate depth</button>${stageHtml()}`
  el.querySelector('#run')!.addEventListener('click', async () => {
    const stage = await showSample()
    say('loading…')
    const t0 = performance.now()
    const result = await depth(stage.img, { onProgress: progressCb() })
    const heat = result.toHeatmap()
    // dim original image so the heatmap reads clearly
    stage.img.style.opacity = '0.15'
    stage.overlay.getContext('2d')!.putImageData(heat, 0, 0)
    drawOverlayOverlay(stage, result.subjectBox)
    say(`depth map ready — ${result.width}×${result.height}`, true)
    stats(`inference ${result.elapsedMs.toFixed(0)} ms · total ${(performance.now() - t0).toFixed(0)} ms · subject box (nearest decile): x=${result.subjectBox.x.toFixed(2)} y=${result.subjectBox.y.toFixed(2)}`)
  })
}

function drawOverlayOverlay(stage: { overlay: HTMLCanvasElement }, box: { x: number; y: number; width: number; height: number }) {
  const ctx = stage.overlay.getContext('2d')!
  ctx.strokeStyle = '#ffffff'
  ctx.lineWidth = 3
  ctx.setLineDash([10, 6])
  ctx.strokeRect(box.x * stage.overlay.width, box.y * stage.overlay.height, box.width * stage.overlay.width, box.height * stage.overlay.height)
  ctx.setLineDash([])
}
