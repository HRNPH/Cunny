/**
 * @cunny-ai/vector — local vector store. Memory backend by design (010 spec):
 * at 384 dims, a 50k brute-force scan costs <10ms with typed arrays. No HNSW until benchmarks say so.
 * Persistence: IndexedDB with structured clone (Float32Array stored natively).
 */

export type Vector = Float32Array

export interface SearchHit<T = unknown> {
  id: string
  score: number
  meta?: T
}

export interface VectorStore<T = unknown> {
  add(id: string, vector: Vector, meta?: T): void
  addMany(items: Array<{ id: string; vector: Vector; meta?: T }>): void
  remove(id: string): boolean
  search(query: Vector, opts?: { k?: number; filter?: (meta: T, id: string) => boolean }): SearchHit<T>[]
  size(): number
  clear(): void
  persist(name: string): Promise<void>
}

export interface CreateStoreOptions {
  dim: number
  /** 'memory' (default). 'sqlite' backend lands with OPFS work — interface is the contract. */
  backend?: 'memory'
  metric?: 'cosine' | 'dot' | 'euclidean'
}

export function createVectorStore<T = unknown>(opts: CreateStoreOptions): VectorStore<T> {
  if (opts.backend && opts.backend !== 'memory') {
    throw new Error(`@cunny-ai/vector: backend "${opts.backend}" not implemented yet (v0 ships memory only)`)
  }
  const dim = opts.dim
  const metric = opts.metric ?? 'cosine'

  const ids: string[] = []
  const metas: Array<T | undefined> = []
  let matrix = new Float32Array(dim * 256)
  let count = 0

  const ensureCapacity = (n: number) => {
    if (n * dim <= matrix.length) return
    let cap = matrix.length
    while (cap < n * dim) cap *= 2
    const next = new Float32Array(cap)
    next.set(matrix.subarray(0, count * dim))
    matrix = next
  }

  const norms: number[] = []
  const recomputeNorm = (i: number) => {
    let s = 0
    const off = i * dim
    for (let d = 0; d < dim; d++) s += matrix[off + d] ** 2
    norms[i] = Math.sqrt(s) || 1
  }

  const score = (i: number, q: Vector, qNorm: number): number => {
    const off = i * dim
    let dot = 0
    for (let d = 0; d < dim; d++) dot += matrix[off + d] * q[d]
    if (metric === 'dot') return dot
    if (metric === 'euclidean') {
      let s = 0
      for (let d = 0; d < dim; d++) s += (matrix[off + d] - q[d]) ** 2
      return -Math.sqrt(s)
    }
    return dot / (norms[i] * qNorm) // cosine
  }

  return {
    add(id, vector, meta) {
      if (vector.length !== dim) throw new Error(`@cunny-ai/vector: expected dim ${dim}, got ${vector.length}`)
      const existing = ids.indexOf(id)
      const i = existing >= 0 ? existing : count
      if (existing < 0) {
        ids.push(id)
        metas.push(meta)
        count++
        ensureCapacity(count)
      } else {
        metas[i] = meta
      }
      matrix.set(vector, i * dim)
      recomputeNorm(i)
    },
    addMany(items) {
      for (const it of items) this.add(it.id, it.vector, it.meta)
    },
    remove(id) {
      const i = ids.indexOf(id)
      if (i < 0) return false
      const last = count - 1
      if (i !== last) {
        matrix.copyWithin(i * dim, last * dim, (last + 1) * dim)
        ids[i] = ids[last]
        metas[i] = metas[last]
        norms[i] = norms[last]
      }
      ids.pop()
      metas.pop()
      norms.pop()
      count--
      return true
    },
    search(query, searchOpts = {}) {
      if (query.length !== dim) throw new Error(`@cunny-ai/vector: expected dim ${dim}, got ${query.length}`)
      const k = searchOpts.k ?? 5
      let qNorm = 1
      if (metric === 'cosine') {
        let s = 0
        for (let d = 0; d < dim; d++) s += query[d] ** 2
        qNorm = Math.sqrt(s) || 1
      }
      const hits: SearchHit<T>[] = []
      for (let i = 0; i < count; i++) {
        const meta = metas[i] as T
        if (searchOpts.filter && !searchOpts.filter(meta, ids[i])) continue
        hits.push({ id: ids[i], score: score(i, query, qNorm), meta })
      }
      hits.sort((a, b) => b.score - a.score || (a.id < b.id ? -1 : 1)) // deterministic ties
      return hits.slice(0, k)
    },
    size: () => count,
    clear() {
      ids.length = 0
      metas.length = 0
      norms.length = 0
      count = 0
      matrix = new Float32Array(dim * 256)
    },
    async persist(name) {
      const db = await openDb()
      await put(db, name, {
        dim,
        metric,
        ids,
        metas,
        vectors: matrix.slice(0, count * dim),
        count,
      })
    },
  }
}

/** Load a persisted store by name (returns undefined when unknown). */
export async function loadVectorStore<T = unknown>(name: string): Promise<VectorStore<T> | undefined> {
  const db = await openDb()
  const rec = await get<Record<string, unknown>>(db, name)
  if (!rec) return undefined
  const dim = rec.dim as number
  const store = createVectorStore<T>({ dim, metric: rec.metric as CreateStoreOptions['metric'] })
  const ids = rec.ids as string[]
  const metas = rec.metas as Array<T | undefined>
  const vectors = rec.vectors as Float32Array
  for (let i = 0; i < ids.length; i++) {
    store.add(ids[i], vectors.subarray(i * dim, (i + 1) * dim), metas[i])
  }
  return store
}

// --- minimal IndexedDB helper (structured clone keeps Float32Array native) ---

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('cunny-ai-vector', 1)
    req.onupgradeneeded = () => req.result.createObjectStore('stores')
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

function put(db: IDBDatabase, key: string, value: unknown): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('stores', 'readwrite')
    tx.objectStore('stores').put(value, key)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

function get<T>(db: IDBDatabase, key: string): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('stores', 'readonly')
    const req = tx.objectStore('stores').get(key)
    req.onsuccess = () => resolve(req.result as T | undefined)
    req.onerror = () => reject(req.error)
  })
}
