import { speak, voices } from '@cunny-ai/tts'
import { progressCb, say, stageHtml, stats } from '../ui.js'

export function mount(el: HTMLElement) {
  el.innerHTML = `
    <input type="text" id="text" value="Hello from the browser. This voice is generated locally, with no server involved." />
    <button id="kokoro">Speak (kokoro · ~85MB first load)</button>
    <button id="native" style="background:#374151">Speak (native · 0MB)</button>
    ${stageHtml()}`
  const text = () => (document.getElementById('text') as HTMLInputElement).value
  stats(`voices: ${voices().slice(0, 6).map((v) => v.id).join(', ')} …`)

  el.querySelector('#kokoro')!.addEventListener('click', async () => {
    say('loading kokoro (~85MB first time)…')
    const t0 = performance.now()
    try {
      const u = await speak(text(), { onProgress: progressCb() })
      say(`synthesizing (${u.sampleRate / 1000}kHz) — playing`, true)
      await u.play()
      say('done', true)
      stats(`total ${((performance.now() - t0) / 1000).toFixed(1)}s`)
    } catch (e) {
      say(`kokoro failed: ${(e as Error).message} — try native`, false)
    }
  })

  el.querySelector('#native')!.addEventListener('click', async () => {
    const u = await speak(text(), { engine: 'native' })
    say('speaking (OS voices)', true)
    await u.play()
  })
}
