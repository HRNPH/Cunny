/**
 * loader.ts: the Cache API download layer.
 * Cache first, then network with in-flight dedupe and progress events.
 */
import type { ProgressInfo } from './types.js'

const CACHE_NAME = 'cunny-ai-models-v1'

/** In-flight downloads keyed by URL so N concurrent loadModel() calls share one fetch. */
const inflight = new Map<string, Promise<ArrayBuffer>>()

function cacheAvailable(): boolean {
  return typeof caches !== 'undefined'
}

async function readCache(url: string): Promise<ArrayBuffer | undefined> {
  if (!cacheAvailable()) return undefined
  try {
    const cache = await caches.open(CACHE_NAME)
    const hit = await cache.match(url)
    return hit ? await hit.arrayBuffer() : undefined
  } catch {
    // Quota errors, private mode, opaque responses — degrade to network.
    return undefined
  }
}

async function writeCache(url: string, bytes: ArrayBuffer): Promise<void> {
  if (!cacheAvailable()) return
  try {
    const cache = await caches.open(CACHE_NAME)
    await cache.put(url, new Response(bytes.slice(0), {
      // Response bodies can only be consumed once; slice() hands cache its own copy.
      headers: { 'content-type': 'application/octet-stream' },
    }))
  } catch {
    // Best effort — next visit just re-downloads.
  }
}

async function download(
  url: string,
  onProgress?: (info: ProgressInfo) => void,
  signal?: AbortSignal,
): Promise<ArrayBuffer> {
  const res = await fetch(url, { signal, mode: 'cors' })
  if (!res.ok) {
    throw new Error(`@cunny-ai/core: failed to fetch model (${res.status} ${res.statusText}) ${url}`)
  }
  const total = Number(res.headers.get('content-length') ?? 0)
  if (!res.body) {
    const bytes = await res.arrayBuffer()
    onProgress?.({ loaded: bytes.byteLength, total: bytes.byteLength })
    return bytes
  }
  const reader = res.body.getReader()
  const chunks: Uint8Array[] = []
  let loaded = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
    loaded += value.byteLength
    onProgress?.({ loaded, total })
  }
  const out = new Uint8Array(loaded)
  let offset = 0
  for (const chunk of chunks) {
    out.set(chunk, offset)
    offset += chunk.byteLength
  }
  return out.buffer
}

/** Fetch model bytes: cache first, otherwise one shared network download. */
export async function fetchModel(
  url: string,
  opts: { onProgress?: (info: ProgressInfo) => void; signal?: AbortSignal } = {},
): Promise<{ bytes: ArrayBuffer; cached: boolean }> {
  const cached = await readCache(url)
  if (cached) {
    opts.onProgress?.({ loaded: cached.byteLength, total: cached.byteLength })
    return { bytes: cached, cached: true }
  }

  let pending = inflight.get(url)
  if (!pending) {
    pending = download(url, opts.onProgress, opts.signal).finally(() => {
      inflight.delete(url)
    })
    inflight.set(url, pending)
  }
  const bytes = await pending
  await writeCache(url, bytes)
  return { bytes, cached: false }
}
