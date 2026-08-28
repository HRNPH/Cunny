import { detect } from '@cunny-ai/face-detect'
import sampleUrl from '../assets/sample.jpg'

document.getElementById('run')!.addEventListener('click', async () => {
  const out = document.getElementById('out')!
  const img = document.getElementById('img') as HTMLImageElement
  out.textContent = 'loading model…'
  try {
    const t0 = performance.now()
    const { faces, elapsedMs } = await detect(sampleUrl)
    img.hidden = false
    img.src = sampleUrl
    out.textContent = `OK — ${faces.length} face(s), score ${(faces[0]?.score ?? 0).toFixed(2)}, ` +
      `inference ${elapsedMs.toFixed(1)}ms, total ${(performance.now() - t0).toFixed(0)}ms`
  } catch (e) {
    out.textContent = `FAIL — ${(e as Error).message}`
  }
})
