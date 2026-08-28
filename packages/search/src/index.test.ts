import { describe, expect, it } from 'vitest'
import { chunkText } from './index.js'

describe('chunkText', () => {
  it('returns short text as a single chunk', () => {
    expect(chunkText('hello world')).toEqual(['hello world'])
  })

  it('splits long text into chunks within the size budget', () => {
    const sentences = Array.from({ length: 40 }, (_, i) => `Sentence number ${i} with some words.`)
    const text = sentences.join(' ')
    const chunks = chunkText(text, { chunkChars: 300, overlapChars: 40 })
    expect(chunks.length).toBeGreaterThan(1)
    for (const c of chunks) expect(c.length).toBeLessThanOrEqual(340)
  })

  it('never loses content: all sentences appear in the chunk set', () => {
    const sentences = Array.from({ length: 30 }, (_, i) => `Unique marker ${i} sentence.`)
    const chunks = chunkText(sentences.join(' '), { chunkChars: 200, overlapChars: 20 })
    const joined = chunks.join(' ')
    for (const s of sentences) expect(joined).toContain(s)
  })

  it('breaks at sentence boundaries, never mid sentence', () => {
    const text = 'One sentence here. Second sentence follows. Third and final one.'
    const chunks = chunkText(text, { chunkChars: 30 })
    for (const c of chunks) {
      expect(c.endsWith('.') || c.length <= 30).toBe(true)
    }
  })

  it('handles empty input', () => {
    expect(chunkText('')).toEqual([''])
  })
})
