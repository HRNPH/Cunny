/**
 * @cunny-ai/track — SORT + ByteTrack-style two-stage association, pure TypeScript, zero deps.
 * Deterministic, side-effect-free update() — unit-testable without any model (017 spec).
 */

export interface DetBox {
  label?: string
  score: number
  box: { x: number; y: number; width: number; height: number }
}

export interface Track {
  id: number
  label?: string
  score: number
  box: { x: number; y: number; width: number; height: number }
  /** Per-frame pixel velocity estimate. */
  velocity: { x: number; y: number }
  state: 'tentative' | 'confirmed' | 'lost'
  /** Frames since the track was last matched. */
  age: number
  hits: number
}

export interface TrackerOptions {
  /** IoU threshold for association. Default 0.3. */
  iouThreshold?: number
  /** Frames a lost track survives before being dropped. Default 30. */
  maxAge?: number
  /** Matches before a track is confirmed. Default 3. */
  minHits?: number
  /** Score split for ByteTrack's second (low-confidence) stage. Default 0.5. */
  lowScoreThreshold?: number
}

interface InternalTrack extends Track {
  prevBox: { x: number; y: number; width: number; height: number }
  missed: number
}

function iou(a: { x: number; y: number; width: number; height: number }, b: typeof a): number {
  const x1 = Math.max(a.x, b.x)
  const y1 = Math.max(a.y, b.y)
  const x2 = Math.min(a.x + a.width, b.x + b.width)
  const y2 = Math.min(a.y + a.height, b.y + b.height)
  const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1)
  const union = a.width * a.height + b.width * b.height - inter
  return union <= 0 ? 0 : inter / union
}

export interface Tracker {
  /** Feed one frame of detections; get tracks with persistent ids back. */
  update(dets: DetBox[]): Track[]
  /** Drop all tracks. */
  reset(): void
}

/**
 * ```ts
 * const tracker = createTracker()
 * const tracks = tracker.update(detections.map(d => ({ label: d.label, score: d.score, box: d.box })))
 * ```
 */
export function createTracker(opts: TrackerOptions = {}): Tracker {
  const iouThreshold = opts.iouThreshold ?? 0.3
  const maxAge = opts.maxAge ?? 30
  const minHits = opts.minHits ?? 3
  const lowScore = opts.lowScoreThreshold ?? 0.5

  let tracks: InternalTrack[] = []
  let nextId = 1

  /** Greedy IoU matching (sorted by score desc) — class-aware. Returns [matched, unmatchedDets]. */
  const associate = (active: InternalTrack[], dets: DetBox[]): Array<[InternalTrack, DetBox]> => {
    const pairs: Array<[number, number, number]> = [] // [trackIdx, detIdx, iou]
    for (let t = 0; t < active.length; t++) {
      for (let d = 0; d < dets.length; d++) {
        if (active[t].label !== undefined && dets[d].label !== undefined && active[t].label !== dets[d].label) continue
        const v = iou(active[t].box, dets[d].box)
        if (v >= iouThreshold) pairs.push([t, d, v])
      }
    }
    pairs.sort((a, b) => b[2] - a[2])
    const usedT = new Set<number>()
    const usedD = new Set<number>()
    const matched: Array<[InternalTrack, DetBox]> = []
    for (const [t, d] of pairs) {
      if (usedT.has(t) || usedD.has(d)) continue
      usedT.add(t)
      usedD.add(d)
      matched.push([active[t], dets[d]])
    }
    return matched
  }

  const applyMatch = (tr: InternalTrack, det: DetBox): void => {
    tr.velocity = {
      x: det.box.x - tr.prevBox.x,
      y: det.box.y - tr.prevBox.y,
    }
    tr.prevBox = { ...det.box }
    tr.box = { ...det.box }
    tr.score = det.score
    tr.label = det.label
    tr.hits++
    tr.missed = 0
    tr.age++
    tr.state = tr.hits >= minHits ? 'confirmed' : 'tentative'
  }

  return {
    update(dets) {
      // Stage 1: high-confidence dets vs all active tracks.
      const high = dets.filter((d) => d.score >= lowScore)
      const low = dets.filter((d) => d.score < lowScore)
      let active = tracks.filter((t) => t.missed <= maxAge)

      const matched1 = associate(active, high)
      for (const [tr, det] of matched1) applyMatch(tr, det)
      const matchedTracks1 = new Set(matched1.map(([tr]) => tr))

      // Stage 2 (ByteTrack): low-confidence dets vs tracks still unmatched — recovers occluded tracks.
      const stillActive = active.filter((t) => !matchedTracks1.has(t))
      const matched2 = associate(stillActive, low)
      for (const [tr, det] of matched2) applyMatch(tr, det)

      // Age out unmatched tracks.
      const matchedAll = new Set([...matched1, ...matched2].map(([tr]) => tr))
      for (const tr of active) {
        if (!matchedAll.has(tr)) {
          tr.missed++
          tr.age++
          tr.state = tr.missed > 0 ? 'lost' : tr.state
        }
      }

      // Birth new tracks from still-unmatched high-confidence dets.
      const matchedDets = new Set([...matched1, ...matched2].map(([, det]) => det))
      for (const det of high) {
        if (matchedDets.has(det)) continue
        tracks.push({
          id: nextId++,
          label: det.label,
          score: det.score,
          box: { ...det.box },
          prevBox: { ...det.box },
          velocity: { x: 0, y: 0 },
          state: minHits <= 1 ? 'confirmed' : 'tentative',
          hits: 1,
          age: 1,
          missed: 0,
        })
      }

      active = tracks.filter((t) => t.missed <= maxAge)
      tracks = active // drop dead ones
      // Report only tracks matched this frame (SORT semantics); lost-but-alive
      // tracks stay internal and can re-associate within maxAge.
      return active.filter((t) => t.missed === 0).map(({ prevBox: _prev, ...out }) => out)
    },
    reset() {
      tracks = []
      nextId = 1
    },
  }
}
