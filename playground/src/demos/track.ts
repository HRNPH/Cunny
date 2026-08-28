import { trackObjects } from '@cunny-ai/detect'
import { createTracker } from '@cunny-ai/track'
import { drawOverlay, progressCb, releaseWebcam, say, showWebcam, stageHtml, stats } from '../ui.js'

export function mount(el: HTMLElement) {
  el.innerHTML = `<button id="run">Track (webcam)</button>${stageHtml()}`
  el.querySelector('#run')!.addEventListener('click', async () => {
    say('requesting camera…')
    const stage = await showWebcam()
    const tracker = createTracker({ minHits: 2 })
    say('loading detector…')
    let frames = 0
    const stop = trackObjects(stage.vid, (detections) => {
      const tracks = tracker.update(detections.map((d) => ({ label: d.label, score: d.score, box: d.box })))
      drawOverlay((ctx, w) => {
        ctx.font = `${Math.max(12, w / 40)}px ui-monospace, monospace`
        ctx.lineWidth = Math.max(2, w / 300)
        for (const t of tracks) {
          const hue = (t.id * 47) % 360
          ctx.strokeStyle = `hsl(${hue} 90% 60%)`
          ctx.strokeRect(t.box.x, t.box.y, t.box.width, t.box.height)
          ctx.fillStyle = `hsl(${hue} 90% 60%)`
          ctx.fillText(`${t.label} #${t.id}`, t.box.x, Math.max(14, t.box.y - 6))
        }
      })
      if (++frames % 60 === 0) stats(`frame ${frames} · ${tracks.length} tracked · ids stay stable through occlusion`)
    }, { fps: 20, onProgress: progressCb() })

    say('tracking — stable ids per object', true)
    const stopAll = () => { stop(); releaseWebcam() }
    el.querySelector('#run')!.textContent = 'Stop'
    el.querySelector('#run')!.addEventListener('click', stopAll, { once: true })
  })
}
