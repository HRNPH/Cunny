import { estimate, upscale } from '@cunny-ai/upscale'
import { progressCb, say, stats } from '../ui.js'
import sampleUrl from '../assets/sample.jpg'

export function mount(el: HTMLElement) {
  el.innerHTML = `<button id="run">Upscale 4× (face crop)</button>
    <div id="stage" style="position:relative;max-width:680px;border-radius:12px;overflow:hidden;background:#111418;border:1px solid #222831">
      <canvas id="cmp" style="display:block;width:100%"></canvas>
    </div>
    <div id="stats"></div>`
  el.querySelector('#run')!.addEventListener('click', async () => {
    const canvas = document.getElementById('cmp') as HTMLCanvasElement
    say('cropping a 160×200 face region…')
    // Crop well under the wasm cap; 0.032MP in, 0.512MP out.
    const img = new Image()
    img.src = sampleUrl
    await img.decode()
    const CROP_W = 160
    const CROP_H = 200
    const sx = Math.max(0, Math.round(img.naturalWidth * 0.25))
    const sy = 0
    const crop = document.createElement('canvas')
    crop.width = CROP_W
    crop.height = CROP_H
    crop.getContext('2d')!.drawImage(img, sx, sy, CROP_W, CROP_H, 0, 0, CROP_W, CROP_H)

    const est = estimate(CROP_W, CROP_H, 'wasm')
    if (!est.ok) {
      say('input too large for wasm backend', false)
      return
    }
    say(`loading real-esrgan-x4 fp32 (~67MB first time) · est ${est.estMs}ms on wasm…`)
    const t0 = performance.now()
    try {
      const out = await upscale(crop, { backend: 'wasm', onProgress: progressCb() })
      // Side-by-side: naive pixelated 4x (left) vs esrgan (right).
      canvas.width = out.width * 2
      canvas.height = out.height
      const ctx = canvas.getContext('2d')!
      ctx.imageSmoothingEnabled = false
      ctx.drawImage(crop, 0, 0, out.width, out.height)
      ctx.imageSmoothingEnabled = true
      ctx.drawImage(out, out.width, 0)
      say(`${out.width}×${out.height} output`, true)
      stats(`inference ${((performance.now() - t0) / 1000).toFixed(1)}s · left = nearest-neighbor 4×, right = real-esrgan 4×`)
    } catch (e) {
      say(`failed: ${(e as Error).message}`)
    }
  })
}
