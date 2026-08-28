import { faceMesh } from '@cunny-ai/face-mesh'
import { drawOverlay, progressCb, say, showSample, stageHtml, stats } from '../ui.js'

export function mount(el: HTMLElement) {
  el.innerHTML = `<button id="run">Extract face mesh</button>${stageHtml()}`
  el.querySelector('#run')!.addEventListener('click', async () => {
    const stage = await showSample()
    say('loading…')
    const t0 = performance.now()
    const { faces, elapsedMs } = await faceMesh(stage.img, { onProgress: progressCb() })
    const bs = faces[0]?.blendshapes ?? {}
    const top = Object.entries(bs).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k, v]) => `${k}=${v.toFixed(2)}`).join('  ')
    drawOverlay((ctx, w, h) => {
      ctx.fillStyle = '#4ade80'
      for (const face of faces) {
        for (const p of face.landmarks) {
          ctx.beginPath()
          ctx.arc(p.x * w, p.y * h, Math.max(1.5, w / 350), 0, Math.PI * 2)
          ctx.fill()
        }
      }
    })
    say(`${faces[0]?.landmarks.length ?? 0} landmarks · 52 blendshapes`, true)
    stats(`inference ${elapsedMs.toFixed(1)} ms · top: ${top}`)
  })
}
