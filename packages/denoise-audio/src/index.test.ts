import { describe, expect, it } from 'vitest'
import { existsSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { FRAME_SIZE, resample } from './index.js'

describe('FRAME_SIZE', () => {
  it('is rnnoise’s native 480 samples (10ms @ 48kHz)', () => {
    expect(FRAME_SIZE).toBe(480)
  })
})

describe('resample', () => {
  it('is identity when rates match', () => {
    const pcm = Float32Array.from([0.1, 0.2, 0.3])
    expect(resample(pcm, 48000, 48000)).toBe(pcm)
  })

  it('downsamples 48k → 16k preserving length ratio', () => {
    const pcm = new Float32Array(4800)
    for (let i = 0; i < pcm.length; i++) pcm[i] = Math.sin((i / 4800) * Math.PI * 2)
    const out = resample(pcm, 48000, 16000)
    expect(out).toHaveLength(1600)
  })

  it('upsamples 16k → 48k preserving length ratio', () => {
    const out = resample(new Float32Array(1600).fill(0.5), 16000, 48000)
    expect(out).toHaveLength(4800)
    expect(out.every((v) => v === 0.5)).toBe(true)
  })

  it('interpolates linearly between samples', () => {
    const out = resample(Float32Array.from([0, 1]), 2, 4)
    expect([...out]).toEqual([0, 0.5, 1, 1])
  })
})

describe('bundled assets (the bundle-tier proof)', () => {
  const root = new URL('../assets/', import.meta.url)

  it('ships the rnnoise wasm inside the package', () => {
    const wasm = fileURLToPath(new URL('rnnoise.wasm', root))
    expect(existsSync(wasm)).toBe(true)
    expect(statSync(wasm).size).toBeGreaterThan(50_000)
    expect(statSync(wasm).size).toBeLessThan(300_000)
  })

  it('ships the emscripten glue beside it', () => {
    const glue = fileURLToPath(new URL('rnnoise-glue.js', root))
    expect(existsSync(glue)).toBe(true)
    expect(statSync(glue).size).toBeGreaterThan(1000)
  })
})
