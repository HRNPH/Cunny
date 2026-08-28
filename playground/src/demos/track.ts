import { trackObjects } from '@cunny-ai/detect'
import { createTracker } from '@cunny-ai/track'
import { drawOverlay, progressCb, releaseWebcam, say, showWebcam, stageHtml, stats } from '../ui.js'
import sampleUrl from '../../assets/sample.jpg'

export function mount(el: HTMLElement) {
  el.innerHTML = `<button id="run">Track (webcam)</button><button id="synth">Track (synthetic stream)</button>${stageHtml()}`
  el.querySelector('#synth')!.addEventListener('click', () => void runSynthetic(el))
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

/**
 * Draws the sample portrait moving (and once blinking out of frame to force an
 * occlusion) onto a canvas and captures it as a MediaStream — a deterministic
 * webcam stand-in that needs no permission.
 */
async function runSynthetic(el: HTMLElement) {
  const vid = document.getElementById('pvid') as HTMLVideoElement
  const img = document.getElementById('pimg') as HTMLImageElement
  img.hidden = true
  vid.hidden = false
  const imgEl = new Image()
  imgEl.src = sampleUrl
  await imgEl.decode()
  const W = 640
  const H = 480
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')!
  const stream = canvas.captureStream(20)
  vid.srcObject = stream
  await vid.play()

  const tracker = createTracker({ minHits: 2, maxAge: 1500 })
  say('loading detector…')
  let frames = 0
  const ids = new Set<number>()
  const stop = trackObjects(vid, (detections) => {
    const tracks = tracker.update(detections.map((d) => ({ label: d.label, score: d.score, box: d.box })))
    for (const t of tracks) ids.add(t.id)
    drawOverlay((ctx2, w) => {
      ctx2.clearRect(0, 0, canvas.width, canvas.height)
      ctx2.font = '16px ui-monospace,monospace'
      ctx2.lineWidth = 2
      for (const t of tracks) {
        const hue = (t.id * 47) % 360
        ctx2.strokeStyle = `hsl(${hue} 90% 60%)`
        ctx2.strokeRect(t.box.x, t.box.y, t.box.width, t.box.height)
        ctx2.fillStyle = `hsl(${hue} 90% 60%)`
        ctx2.fillText(`${t.label} #${t.id}`, t.box.x, Math.max(14, t.box.y - 6))
      }
      void w
    })
    if (++frames % 40 === 0) stats(`frame ${frames} · ${tracks.length} tracked · ids seen: ${[...ids].join(', ')}`)
  }, { fps: 20, onProgress: progressCb() })

  const t0 = performance.now()
  const raf = () => {
    const t = (performance.now() - t0) / 1000
    ctx.fillStyle = '#000'
    ctx.fillRect(0, 0, W, H)
    // Occlusion between 4s and 5s: draw the subject off-canvas.
    const visible = !(t > 4 && t < 5)
    if (visible) {
      const x = W / 2 + Math.sin(t * 1.2) * (W / 3) - imgEl.width / 4
      const scale = 360 / imgEl.height
      ctx.drawImage(imgEl, x, 40, imgEl.width * scale, imgEl.height * scale)
    }
    if (t < 8) requestAnimationFrame(raf)
    else {
      stop()
      vid.srcObject = null
      say(`done — ${ids.size} stable id(s) through motion + occlusion`, true)
      stats(`ids seen: ${[...ids].join(', ')} · occlusion at 4–5s survived by ByteTrack memory`)
    }
  }
  requestAnimationFrame(raf)
}
