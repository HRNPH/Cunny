import { createStreamSTT } from '@cunny-ai/stt-live'
import { say, stats } from '../ui.js'
import sampleWav from '../../assets/jfk.wav'

export function mount(el: HTMLElement) {
  el.innerHTML = `
    <button id="run">Stream transcription (synthetic mic)</button>
    <div style="margin:14px 0;max-width:420px">
      <div style="font-size:12px;color:#8b949e;margin-bottom:4px">vad probability</div>
      <div style="background:#1a1f26;border-radius:6px;height:14px;overflow:hidden"><div id="meter" style="height:100%;width:0%;background:#4ade80"></div></div>
    </div>
    <div id="partial" style="font:15px/1.6 ui-sans-serif,system-ui;color:#8b949e;max-width:640px;min-height:28px"></div>
    <div id="finals" style="font:15px/1.7 ui-sans-serif,system-ui;max-width:640px"></div>`
  el.querySelector('#run')!.addEventListener('click', async () => {
    say('loading vad + moonshine…')
    try {
      const stt = await createStreamSTT({ language: 'en' })
      stt.onProbability = (p) => {
        const meter = document.getElementById('meter') as HTMLElement
        meter.style.width = `${(p * 100).toFixed(0)}%`
      }
      stt.onPartial = (text) => {
        ;(document.getElementById('partial') as HTMLElement).textContent = `… ${text}`
      }
      stt.onEndpoint = (text, ms) => {
        ;(document.getElementById('partial') as HTMLElement).textContent = ''
        const line = document.createElement('div')
        line.textContent = `✓ ${(ms / 1000).toFixed(1)}s → ${text}`
        document.getElementById('finals')!.appendChild(line)
      }
      // Synthetic mic: decode the sample wav and feed it through a
      // MediaStream so the pipeline is exactly what a real mic sees.
      const arrayBuf = await (await fetch(sampleWav)).arrayBuffer()
      const ctx = new AudioContext({ sampleRate: 16_000 })
      const buffer = await ctx.decodeAudioData(arrayBuf)
      const src = ctx.createBufferSource()
      src.buffer = buffer
      const dest = ctx.createMediaStreamDestination()
      src.connect(dest)
      src.start()
      // tap frames at 16k straight into the stream stt
      const tap = ctx.createScriptProcessor(4096, 1, 1)
      tap.onaudioprocess = (e) => stt.feed(new Float32Array(e.inputBuffer.getChannelData(0)))
      src.connect(tap)
      const sink = ctx.createGain()
      sink.gain.value = 0
      tap.connect(sink).connect(ctx.destination)
      void dest
      say('listening to synthetic mic (11s clip)…', true)
      src.onended = async () => {
        await stt.flush()
        stt.stop()
        void ctx.close()
        say('done', true)
        stats(`finals: ${document.getElementById('finals')!.childElementCount}`)
      }
    } catch (e) {
      say(`failed: ${(e as Error).message}`)
    }
  })
}
