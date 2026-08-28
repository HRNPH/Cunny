/** Demo hub router — each package gets a lazy-loaded demo module. */

import { say } from './ui.js'

export interface DemoModule {
  title: string
  sub: string
  mount(el: HTMLElement): void
}

const DEMOS: Record<string, { title: string; sub: string; name: string }> = {
  'face-detect': { title: '@cunny-ai/face-detect', sub: 'blazeface-short · ~450KB · Apache-2.0', name: 'face-detect' },
  'bg-remove': { title: '@cunny-ai/bg-remove', sub: 'selfie segmentation · ~250KB', name: 'bg-remove' },
  'face-mesh': { title: '@cunny-ai/face-mesh', sub: '478 landmarks + 52 blendshapes · ~3MB', name: 'face-mesh' },
  pose: { title: '@cunny-ai/pose', sub: '33 landmarks lite · ~5.5MB', name: 'pose' },
  segment: { title: '@cunny-ai/segment', sub: 'deeplab-v3 · 21 classes · ~3MB', name: 'segment' },
  detect: { title: '@cunny-ai/detect', sub: 'efficientdet-lite0 · 80 COCO classes · ~4.4MB', name: 'detect' },
  depth: { title: '@cunny-ai/depth', sub: 'depth-anything-v2-small · ~25MB · heatmap', name: 'depth' },
  clip: { title: '@cunny-ai/clip', sub: 'zero-shot classification · ViT-B/32 q8 · ~50MB', name: 'clip' },
  embed: { title: '@cunny-ai/embed + @cunny-ai/similarity', sub: 'bge-small · ~23MB · edge RAG backbone', name: 'embed' },
  track: { title: '@cunny-ai/track + @cunny-ai/detect', sub: 'ByteTrack ids over detector · no extra model bytes', name: 'track' },
  tts: { title: '@cunny-ai/tts', sub: 'kokoro-82M q8 · ~85MB first load · native fallback = 0MB', name: 'tts' },
  stt: { title: '@cunny-ai/stt', sub: 'moonshine-tiny q8 · ~30MB · 16k mono in, text out', name: 'stt' },
  vad: { title: '@cunny-ai/vad', sub: 'silero-v5 · ~2MB · speech segments from a raw pcm stream', name: 'vad' },
  upscale: { title: '@cunny-ai/upscale', sub: 'real-esrgan-x4 fp32 · ~67MB · pixelated vs esrgan side by side', name: 'upscale' },
  captions: { title: '@cunny-ai/captions', sub: 'vad + stt combo · utterance captions from a (synthetic) mic', name: 'captions' },
  ocr: { title: '@cunny-ai/ocr', sub: 'paddle-v4 det+rec · ~16MB · reads a drawn invoice', name: 'ocr' },
  'stt-live': { title: '@cunny-ai/stt-live', sub: 'streaming stt · vad-chunked moonshine · partials + finals', name: 'stt-live' },
  'denoise-audio': { title: '@cunny-ai/denoise-audio', sub: 'rnnoise · 112KB bundled · zero network after install', name: 'denoise-audio' },
}

/**
 * Raw dynamic import with a runtime-built specifier. @vite-ignore keeps vite's
 * dev preload helper out of the path: its <link modulepreload> bookkeeping never
 * settles inside the embedded webview used for smoke tests, which made every
 * demo module hang on load with no error.
 */
const lazyDemo = (name: string): Promise<{ mount(el: HTMLElement): void }> =>
  import(/* @vite-ignore */ `/src/demos/${name}.ts`)

let cleanup: (() => void) | undefined

async function route(id: string) {
  const def = DEMOS[id] ?? DEMOS['face-detect']
  for (const b of document.querySelectorAll('#nav button')) {
    b.classList.toggle('active', (b as HTMLElement).dataset.id === (DEMOS[id] ? id : 'face-detect'))
  }
  cleanup?.()
  cleanup = undefined
  const content = document.getElementById('content')!
  content.innerHTML = ''
  document.getElementById('demo-title')!.textContent = def.title
  document.getElementById('demo-sub')!.textContent = def.sub
  say('idle')
  try {
    const mod = await lazyDemo(def.name)
    mod.mount(content)
    if (typeof (mod as { cleanup?: () => void }).cleanup === 'function') {
      cleanup = (mod as { cleanup: () => void }).cleanup
    }
    // ?autorun=<buttonId> clicks a demo button from page code — used by the
    // smoke-test automation (input synthesis is unreliable) and shareable
    // auto-run links.
    const autorun = new URLSearchParams(location.search).get('autorun')
    if (autorun) content.querySelector(`#${autorun}`)?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  } catch (err) {
    say(`demo failed to load: ${(err as Error).message}`)
  }
}

// nav
const nav = document.getElementById('nav')!
for (const [id, def] of Object.entries(DEMOS)) {
  const b = document.createElement('button')
  b.textContent = id
  b.dataset.id = id
  b.addEventListener('click', () => { location.hash = `#/${id}` })
  nav.appendChild(b)
}

window.addEventListener('hashchange', () => void route(currentId()))
function currentId() {
  const id = location.hash.replace(/^#\//, '')
  return DEMOS[id] ? id : 'face-detect'
}

void route(currentId())
