/**
 * @cunny-ai/search — semantic search over your own text.
 *
 * A combo package over embed and vector, with orchestration only. chunkText(text)
 * splits input on paragraphs and sentences with size bounds; index(texts) embeds
 * the chunks and stores them; search(query, k) returns the nearest chunks with
 * scores.
 *
 * @example
 * ```ts
 * import { createSearch } from '@cunny-ai/search'
 *
 * const search = createSearch()
 * await search.index(['full text of doc one', 'full text of doc two'])
 * const hits = await search.search('payment terms', { k: 5 })
 * ```
 */
import { embed } from '@cunny-ai/embed'
import { createVectorStore } from '@cunny-ai/vector'

/** One document to index: text plus optional id and meta. */
export interface SearchItem {
  id?: string
  text: string
  meta?: unknown
}

/** One query result: the document id, its score, and a readable snippet. */
export interface SearchHit {
  id: string
  score: number
  /** Readable window around the best-matching chunk. */
  snippet: string
  meta?: unknown
}

/** Chunking bounds and download progress reporting for `createSearch`. */
export interface SearchOptions {
  /** Chunk size in characters (bge 512-token context ≈ 1500 chars; we stay conservative). */
  chunkChars?: number
  /** Characters shared between adjacent chunks. Default 150. */
  overlapChars?: number
  /** Fires while the embedding model downloads. */
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

/** Search handle returned by `createSearch`. */
export interface SearchIndex {
  /** Chunk and embed documents (strings, Files, or items); returns the chunk count. */
  index(items: Array<SearchItem | File | Blob | string>): Promise<number>
  /** Embed the query and return the nearest documents with scores. */
  search(query: string, opts?: { k?: number }): Promise<SearchHit[]>
  /** Number of stored chunks. */
  size(): number
  /** Drop the index. */
  clear(): void
}

/**
 * Create a search index: chunk, embed, and store up front, query later.
 *
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
