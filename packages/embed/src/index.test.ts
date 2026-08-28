import { describe, expect, it } from 'vitest'
import { cosine, topK } from './index.js'

describe('embed helpers (pure math)', () => {
  it('cosine of identical normalized vectors is 1', () => {
    const a = new Float32Array([1, 0, 0])
    expect(cosine(a, new Float32Array([1, 0, 0]))).toBeCloseTo(1)
  })

  it('cosine of orthogonal vectors is 0', () => {
    expect(cosine(new Float32Array([1, 0]), new Float32Array([0, 1]))).toBeCloseTo(0)
  })

  it('cosine of opposite vectors is -1', () => {
    expect(cosine(new Float32Array([1, 0]), new Float32Array([-1, 0]))).toBeCloseTo(-1)
  })

  it('topK ranks and slices', () => {
    const corpus = [
      new Float32Array([0, 1]),
      new Float32Array([1, 0]),
      new Float32Array([0.7, 0.7]),
    ]
    const hits = topK(new Float32Array([1, 0]), corpus, 2)
    expect(hits.map((h) => h.index)).toEqual([1, 2])
    expect(hits[0].score).toBeCloseTo(1)
  })
})
