import sampleUrl from '../assets/sample.jpg'

export { sampleUrl }

export function say(msg: string, ok = false) {
  const el = document.getElementById('status')!
  el.innerHTML = ok ? `<span class="ok">${msg}</span>` : msg
}

export function stats(msg: string) {
  document.getElementById('stats')!.textContent = msg
}

export function fmtBytes(n: number) {
  return n >= 1e6 ? `${(n / 1e6).toFixed(2)} MB` : `${(n / 1e3).toFixed(0)} KB`
}

export function progressCb() {
  return ({ loaded, total }: { loaded: number; total: number }) => {
    say(total ? `downloading model… ${fmtBytes(loaded)} / ${fmtBytes(total)}` : `downloading… ${fmtBytes(loaded)}`)
  }
}

/** Insert the standard media stage into a demo container. */
export function stageHtml(checker = false) {
  return `
    <div id="stage"${checker ? ' class="checker"' : ''}>
      <img id="pimg" alt="" hidden />
      <video id="pvid" autoplay playsinline muted hidden></video>
      <canvas id="pov"></canvas>
    </div>
    <div id="stats"></div>`
}

export interface Stage {
  img: HTMLImageElement
  vid: HTMLVideoElement
  overlay: HTMLCanvasElement
}

export function getStage(): Stage {
  return {
    img: document.getElementById('pimg') as HTMLImageElement,
    vid: document.getElementById('pvid') as HTMLVideoElement,
    overlay: document.getElementById('pov') as HTMLCanvasElement,
  }
}

/** Show the bundled sample image and size the overlay canvas to it. */
export async function showSample(): Promise<Stage> {
  const s = getStage()
  s.vid.hidden = true
  s.img.hidden = false
  s.img.src = sampleUrl
  // decode() can stall indefinitely in a throttled webview; the browser still
  // paints the image, so race it and move on.
  await Promise.race([
    s.img.decode().catch(() => {}),
    new Promise((resolve) => {
      if (s.img.complete) resolve(null)
      else setTimeout(() => resolve(null), 1500)
    }),
  ])
  s.overlay.width = s.img.naturalWidth || 640
  s.overlay.height = s.img.naturalHeight || 800
  return s
}

export async function showWebcam(): Promise<Stage> {
  const s = getStage()
  s.img.hidden = true
  s.vid.hidden = false
  const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 960 } })
  s.vid.srcObject = stream
  await s.vid.play()
  s.overlay.width = s.vid.videoWidth
  s.overlay.height = s.vid.videoHeight
  return s
}

export function releaseWebcam() {
  const vid = document.getElementById('pvid') as HTMLVideoElement
  vid.srcObject?.getTracks().forEach((t) => t.stop())
  vid.srcObject = null
}

export function drawOverlay(draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void) {
  const c = document.getElementById('pov') as HTMLCanvasElement
  const ctx = c.getContext('2d')!
  ctx.clearRect(0, 0, c.width, c.height)
  draw(ctx, c.width, c.height)
}

/** Decode any audio url to 16kHz mono Float32Array PCM. */
export async function decodeTo16kMono(url: string): Promise<Float32Array> {
  const blob = await (await fetch(url)).blob()
  const arrayBuf = await blob.arrayBuffer()
  const ctx = new AudioContext()
  const buffer = await ctx.decodeAudioData(arrayBuf)
  await ctx.close()
  if (buffer.sampleRate === 16_000 && buffer.numberOfChannels === 1) {
    return buffer.getChannelData(0).slice()
  }
  const offline = new OfflineAudioContext(1, Math.ceil(buffer.duration * 16_000), 16_000)
  const src = offline.createBufferSource()
  src.buffer = buffer
  src.connect(offline.destination)
  src.start()
  const out = await offline.startRendering()
  return out.getChannelData(0).slice()
}
