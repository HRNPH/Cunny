/**
 * @cunny-ai/search — the consumer face of edge RAG: index(myStuff) → search('…').
 * L4 combo package (architecture.md): orchestration only, zero ML code.
 */
import { embed } from '@cunny-ai/embed'
import { createVectorStore } from '@cunny-ai/vector'

export interface SearchItem {
  id?: string
  text: string
  meta?: unknown
}

export interface SearchHit {
  id: string
  score: number
  /** Readable window around the best-matching chunk. */
  snippet: string
  meta?: unknown
}

export interface SearchOptions {
  /** Chunk size in characters (bge 512-token context ≈ 1500 chars; we stay conservative). */
  chunkChars?: number
  overlapChars?: number
  onProgress?: (info: { loaded: number; total: number; file?: string }) => void
}

const DIM = 384

/** Sentence-aware chunking with overlap — plain text in, windows out. */
export function chunkText(text: string, opts: { chunkChars?: number; overlapChars?: number } = {}): string[] {
  const size = opts.chunkChars ?? 1200
  const overlap = opts.overlapChars ?? 150
  if (text.length <= size) return [text]

  const sentences = text.split(/(?<=[.!?…\n])\s+/)
  const chunks: string[] = []
  let current = ''
  for (const s of sentences) {
    if (current.length + s.length > size && current) {
      chunks.push(current.trim())
      current = current.slice(Math.max(0, current.length - overlap))
    }
    current += (current && !current.endsWith(' ') ? ' ' : '') + s
  }
  if (current.trim()) chunks.push(current.trim())
  return chunks
}

export interface SearchIndex {
  index(items: Array<SearchItem | File | Blob | string>): Promise<number>
  search(query: string, opts?: { k?: number }): Promise<SearchHit[]>
  size(): number
  clear(): void
}

/**
 * ```ts
 * const search = createSearch()
 * await search.index(noteFiles)
 * const hits = await search.search('quarterly payment terms')
 * ```
 */
export function createSearch(opts: SearchOptions = {}): SearchIndex {
  const store = createVectorStore<{ docId: string; snippet: string }>({ dim: DIM })
  let seq = 0

  async function toText(item: SearchItem | File | Blob | string): Promise<SearchItem> {
    if (typeof item === 'string') return { text: item }
    if (item instanceof Blob) {
      const text = await item.text() // plain text / md / json — parsing stays userland (011 spec)
      return { text }
    }
    return item
  }

  return {
    async index(items) {
      const docs: Array<{ id: string; chunks: string[]; meta?: unknown }> = []
      for (const raw of items) {
        const item = await toText(raw)
        const id = item.id ?? `doc-${seq++}`
        docs.push({ id, chunks: chunkText(item.text, opts), meta: item.meta })
      }
      const flat: Array<{ id: string; vector: Float32Array; meta: { docId: string; snippet: string } }> = []
      const allChunks = docs.flatMap((d) => d.chunks.map((c) => ({ docId: d.id, snippet: c, meta: d.meta })))

      const vectors = await embed(allChunks.map((c) => c.snippet), { onProgress: opts.onProgress })
      allChunks.forEach((c, i) => {
        flat.push({
          id: `${c.docId}#${i}`,
          vector: vectors[i],
          meta: { docId: c.docId, snippet: c.snippet },
        })
      })
      store.addMany(flat)
      return flat.length
    },

    async search(query, searchOpts = {}) {
      const [qv] = await embed(query, { forQuery: true, onProgress: opts.onProgress })
      const k = searchOpts.k ?? 5
      // over-fetch chunks so dedupe by doc still yields k results
      const hits = store.search(qv, { k: k * 4 })
      const seen = new Set<string>()
      const out: SearchHit[] = []
      for (const h of hits) {
        if (seen.has(h.meta!.docId)) continue
        seen.add(h.meta!.docId)
        out.push({
          id: h.meta!.docId,
          score: h.score,
          snippet: h.meta!.snippet.slice(0, 240),
          meta: h.meta,
        })
        if (out.length >= k) break
      }
      return out
    },

    size: () => store.size(),
    clear: () => store.clear(),
  }
}
