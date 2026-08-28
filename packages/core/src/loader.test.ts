import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchModel } from './loader.js'

/** Response-like stand in for fetch results and cache entries. */
const resp = (bytes: ArrayBuffer) => ({
  ok: true,
  status: 200,
  statusText: 'OK',
  body: null,
  headers: { get: (name: string) => (name === 'content-length' ? String(bytes.byteLength) : null) },
  arrayBuffer: async () => bytes,
})

function stubWorld(bytes: ArrayBuffer, cacheHit = false) {
  const fetchMock = vi.fn(async () => resp(bytes))
  const puts: string[] = []
  const cache = {
    match: async () => (cacheHit ? resp(bytes) : undefined),
    put: async (url: string) => puts.push(url),
  }
  vi.stubGlobal('fetch', fetchMock)
  vi.stubGlobal('caches', { open: async () => cache })
  return { fetchMock, puts }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('fetchModel', () => {
  it('downloads, reports progress and returns cached false', async () => {
    const bytes = new ArrayBuffer(8)
    const { fetchMock, puts } = stubWorld(bytes)
    const events: Array<{ loaded: number }> = []

    const out = await fetchModel('https://x/m.bin', { onProgress: (p) => events.push({ loaded: p.loaded }) })

    expect(fetchMock).toHaveBeenCalledOnce()
    expect(out.cached).toBe(false)
    expect(new Uint8Array(out.bytes).length).toBe(8)
    expect(puts).toEqual(['https://x/m.bin']) // written to cache
    expect(events.length).toBeGreaterThan(0) // progress fired
  })

  it('serves from cache without network when a hit exists', async () => {
    const bytes = new ArrayBuffer(4)
    const { fetchMock } = stubWorld(bytes, true)
    const out = await fetchModel('https://x/m.bin')
    expect(fetchMock).not.toHaveBeenCalled()
    expect(out.cached).toBe(true)
  })

  it('dedupes concurrent requests into one download', async () => {
    const bytes = new ArrayBuffer(8)
    let calls = 0
    const cache = { match: async () => undefined, put: async () => {} }
    vi.stubGlobal('caches', { open: async () => cache })
    vi.stubGlobal('fetch', async () => {
      calls++
      await new Promise((r) => setTimeout(r, 10))
      return resp(bytes)
    })

    const [a, b, c] = await Promise.all([
      fetchModel('https://x/same.bin'),
      fetchModel('https://x/same.bin'),
      fetchModel('https://x/same.bin'),
    ])
    expect(calls).toBe(1)
    expect(a.bytes.byteLength).toBe(8)
    expect(b.cached).toBe(false)
    expect(c.bytes.byteLength).toBe(8)
  })

  it('degrades to network when caches is unavailable', async () => {
    const bytes = new ArrayBuffer(2)
    const { fetchMock } = stubWorld(bytes)
    vi.stubGlobal('caches', undefined)
    const out = await fetchModel('https://x/m.bin')
    expect(fetchMock).toHaveBeenCalledOnce()
    expect(out.bytes.byteLength).toBe(2)
  })
})
