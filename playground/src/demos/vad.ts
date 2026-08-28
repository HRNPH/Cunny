import { createVAD } from '@cunny-ai/vad'
import { decodeTo16kMono, devWasmPaths, progressCb, say, stats } from '../ui.js'
import sampleWav from '../../assets/jfk.wav'

export function mount(el: HTMLElement) {
  el.innerHTML = `
    <button id="run">Run VAD on sample audio</button>
    <div style="margin:14px 0;max-width:420px">
      <div style="font-size:12px;color:#8b949e;margin-bottom:4px">peak speech probability</div>
      <div style="background:#1a1f26;border-radius:6px;height:16px;overflow:hidden"><div id="meter" style="height:100%;width:0%;background:#4ade80"></div></div>
    </div>
    <div id="segs" style="font:13px ui-monospace,monospace;white-space:pre-wrap"></div><div id="stats"></div>`
  el.querySelector('#run')!.addEventListener('click', async () => {
    devWasmPaths()
    say('decoding sample audio…')
    try {
      const audio = await decodeTo16kMono(sampleWav)
      say(`decoded ${(audio.length / 16000).toFixed(1)}s — creating vad session…`)
      let rms = 0
      for (let i = 0; i < audio.length; i += 97) rms += audio[i] * audio[i]
      rms = Math.sqrt(rms / Math.ceil(audio.length / 97))
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
      say('session ready — feeding audio…')
      // Batch pass: chunked pushes without artificial pacing (this is offline
      // analysis, not realtime streaming).
      const chunk = 16000
      let fed = 0
      const total = Math.ceil(audio.length / chunk)
      for (let i = 0; i < audio.length; i += chunk) {
        vad.push(audio.subarray(i, i + chunk))
        fed++
        say(`feeding… chunk ${fed}/${total}`)
        await new Promise((r) => setTimeout(r, 0))
      }
      await vad.flush()
      vad.close()
      document.getElementById('segs')!.textContent = segs.join('\n') || 'no speech detected'
      say(`done — peak probability ${peak.toFixed(2)}`, true)
      stats(`fed ${(audio.length / 16000).toFixed(1)}s of 16k PCM · vad pass ${((performance.now() - t0) / 1000).toFixed(1)}s · input rms ${rms.toFixed(4)}`)
    } catch (e) {
      say(`failed: ${(e as Error).message}`)
    }
  })
}
