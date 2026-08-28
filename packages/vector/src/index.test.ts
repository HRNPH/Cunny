import { describe, expect, it } from 'vitest'
import { createVectorStore } from './index.js'

const v = (x: number, y: number, z: number) => new Float32Array([x, y, z])

describe('vector store (memory backend)', () => {
  it('rejects wrong dimensionality', () => {
    const store = createVectorStore({ dim: 3 })
    expect(() => store.add('a', new Float32Array([1, 2]))).toThrow(/dim 3/)
  })

  it('ranks by cosine similarity, higher first', () => {
    const store = createVectorStore({ dim: 3 })
    store.add('far', v(1, 0, 0))
    store.add('near', v(0.9, 0.1, 0))
    store.add('mid', v(0.7, 0.7, 0))
    const hits = store.search(v(1, 0, 0), { k: 2 })
    expect(hits.map((h) => h.id)).toEqual(['far', 'near'])
  })

  it('applies metadata filters', () => {
    const store = createVectorStore<{ kind: string }>({ dim: 3 })
    store.add('a', v(1, 0, 0), { kind: 'doc' })
    store.add('b', v(1, 0, 0), { kind: 'note' })
    const hits = store.search(v(1, 0, 0), { filter: (m) => m.kind === 'note' })
    expect(hits.map((h) => h.id)).toEqual(['b'])
  })

  it('breaks score ties deterministically by id', () => {
    const store = createVectorStore({ dim: 3 })
    store.add('zzz', v(1, 0, 0))
    store.add('aaa', v(1, 0, 0))
    const hits = store.search(v(1, 0, 0))
    expect(hits.map((h) => h.id)).toEqual(['aaa', 'zzz'])
  })

  it('upserts on the same id and removes correctly', () => {
    const store = createVectorStore({ dim: 3 })
    store.add('a', v(1, 0, 0))
    store.add('a', v(0, 1, 0))
    expect(store.size()).toBe(1)
    expect(store.remove('a')).toBe(true)
    expect(store.size()).toBe(0)
    expect(store.remove('a')).toBe(false)
  })

  it('supports euclidean metric (higher = closer)', () => {
    const store = createVectorStore({ dim: 3, metric: 'euclidean' })
    store.add('close', v(1, 0, 0))
    store.add('far', v(5, 0, 0))
    const hits = store.search(v(1, 0, 0))
    expect(hits[0].id).toBe('close')
  })

  it('clear empties the store', () => {
    const store = createVectorStore({ dim: 3 })
    store.add('a', v(1, 0, 0))
    store.clear()
    expect(store.size()).toBe(0)
  })
})
