import { describe, expect, it } from 'vitest'
import { models, voices } from './index.js'

describe('tts metadata', () => {
  it('voices map prefixes to language and gender', () => {
    const list = voices()
    expect(list.length).toBeGreaterThanOrEqual(8)
    for (const v of list) {
      expect(v.id).toMatch(/^[ab][fm]_[a-z]+$/)
      expect(v.lang).toMatch(/^en-(US|GB)$/)
      expect(['female', 'male']).toContain(v.gender)
    }
    expect(voices().find((v) => v.id === 'af_heart')?.lang).toBe('en-US')
    expect(voices().find((v) => v.id === 'bm_george')?.lang).toBe('en-GB')
  })

  it('registry lists kokoro and the native tier', () => {
    const ids = models().map((m) => m.id)
    expect(ids).toContain('kokoro-82m')
    expect(ids).toContain('native')
  })
})
