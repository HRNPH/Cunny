import { ocr } from '@cunny-ai/ocr'
import { progressCb, say, stageHtml, stats } from '../ui.js'

/** A deterministic text-bearing page, drawn on a canvas — no asset needed. */
function textCanvas(): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = 640
  c.height = 400
  const ctx = c.getContext('2d')!
  ctx.fillStyle = '#f8f6f1'
  ctx.fillRect(0, 0, c.width, c.height)
  ctx.fillStyle = '#141414'
  ctx.font = 'bold 30px Georgia, serif'
  ctx.fillText('INVOICE #2041', 40, 60)
  ctx.font = '22px Georgia, serif'
  ctx.fillText('Date: 2026-08-28', 40, 105)
  ctx.fillText('Client: Acme Corporation', 40, 140)
  ctx.fillText('Hosting — 12 months', 60, 200)
  ctx.fillText('Support retainer', 60, 235)
  ctx.font = 'bold 24px Georgia, serif'
  ctx.fillText('Total: $42.50', 380, 330)
  return c
}

export function mount(el: HTMLElement) {
  el.innerHTML = `<button id="run">OCR the canvas below</button>${stageHtml()}<div id="lines" style="font:13px ui-monospace,monospace;white-space:pre-wrap;margin-top:12px"></div>`
  el.querySelector('#run')!.addEventListener('click', async () => {
    const img = document.getElementById('pimg') as HTMLImageElement
    const canvas = document.getElementById('pov') as HTMLCanvasElement
    const source = textCanvas()
    img.hidden = true
    canvas.hidden = false
    canvas.width = source.width
    canvas.height = source.height
    canvas.getContext('2d')!.drawImage(source, 0, 0)
    say('loading paddle-v4 det+rec (~16MB first time)…')
    const t0 = performance.now()
    try {
      const { lines, elapsedMs } = await ocr(source, { onProgress: progressCb() })
      ;(document.getElementById('lines') as HTMLElement).textContent = lines
        .map((l) => `${(l.confidence * 100).toFixed(0)}%  ${l.text}`)
        .join('\n')
      say(`${lines.length} line(s) read`, true)
      stats(`det+rec ${elapsedMs.toFixed(0)} ms · total ${((performance.now() - t0) / 1000).toFixed(1)}s incl. first load`)
    } catch (e) {
      say(`failed: ${(e as Error).message}`)
    }
  })
}
