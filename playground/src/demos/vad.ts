import { createVAD } from '@cunny-ai/vad'
import { decodeTo16kMono, progressCb, say, stats } from '../ui.js'
import sampleWav from '../assets/jfk.wav'

export function mount(el: HTMLElement) {
  el.innerHTML = `
    <button id="run">Run VAD on sample audio</button>
    <div style="margin:14px 0;max-width:420px">
      <div style="font-size:12px;color:#8b949e;margin-bottom:4px">peak speech probability</div>
      <div style="background:#1a1f26;border-radius:6px;height:16px;overflow:hidden"><div id="meter" style="height:100%;width:0%;background:#4ade80"></div></div>
    </div>
    <div id="segs" style="font:13px ui-monospace,monospace;white-space:pre-wrap"></div>`
  el.querySelector('#run')!.addEventListener('click', async () => {
    say('loading silero-v5 (~2MB)…')
    try {
      const audio = await decodeTo16kMono(sampleWav)
      const segs: string[] = []
      let peak = 0
      const t0 = performance.now()
      const vad = await createVAD({
        onProgress: progressCb(),
        onProbability: (p) => {
          peak = Math.max(peak, p)
          const meter = document.getElementById('meter') as HTMLElement
          meter.style.width = `${(p * 100).toFixed(0)}%`
        },
        onSegment: (seg, durationMs) => {
          segs.push(`speech segment ${segs.length + 1}: ${(durationMs / 1000).toFixed(2)}s`)
        },
      })
      // Feed in 100ms chunks so the meter animates like a live stream.
      const chunk = 1600
      for (let i = 0; i < audio.length; i += chunk) {
        vad.push(audio.subarray(i, i + chunk))
        await new Promise((r) => setTimeout(r, 100))
      }
      vad.flush()
      vad.close()
      document.getElementById('segs')!.textContent = segs.join('\n') || 'no speech detected'
      say(`done — peak probability ${peak.toFixed(2)}`, true)
      stats(`fed ${(audio.length / 16000).toFixed(1)}s of 16k PCM · vad pass ${((performance.now() - t0) / 1000).toFixed(1)}s`)
    } catch (e) {
      say(`failed: ${(e as Error).message}`)
    }
  })
}
