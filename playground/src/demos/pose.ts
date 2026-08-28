import { detectPose, POSE_CONNECTIONS } from '@cunny-ai/pose'
import { drawOverlay, progressCb, say, showSample, stageHtml, stats } from '../ui.js'

export function mount(el: HTMLElement) {
  el.innerHTML = `<button id="run">Detect pose</button>${stageHtml()}`
  el.querySelector('#run')!.addEventListener('click', async () => {
    const stage = await showSample()
    say('loading…')
    const t0 = performance.now()
    const { poses, elapsedMs } = await detectPose(stage.img, { onProgress: progressCb() })
    drawOverlay((ctx, w, h) => {
      ctx.strokeStyle = '#4ade80'
      ctx.lineWidth = Math.max(2, w / 250)
      ctx.fillStyle = '#60a5fa'
      for (const pose of poses) {
        for (const [a, b] of POSE_CONNECTIONS) {
          const pa = pose.landmarks[a]
          const pb = pose.landmarks[b]
          if (!pa || !pb) continue
          ctx.beginPath()
          ctx.moveTo(pa.x * w, pa.y * h)
          ctx.lineTo(pb.x * w, pb.y * h)
          ctx.stroke()
        }
        for (const p of pose.landmarks) {
          ctx.beginPath()
          ctx.arc(p.x * w, p.y * h, Math.max(2.5, w / 200), 0, Math.PI * 2)
          ctx.fill()
        }
      }
    })
    const visible = poses[0]?.landmarks.filter((p) => (p.visibility ?? 1) > 0.5).length ?? 0
    say(`${poses.length} pose(s) · ${visible}/33 visible landmarks (portrait = upper body only)`, true)
    stats(`inference ${elapsedMs.toFixed(1)} ms · total ${(performance.now() - t0).toFixed(0)} ms`)
  })
}
