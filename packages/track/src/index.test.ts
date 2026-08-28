import { describe, expect, it } from 'vitest'
import { createTracker } from './index.js'

const box = (x: number, y: number, s = 50) => ({ x, y, width: s, height: s })

describe('tracker', () => {
  it('confirms tracks after minHits and keeps stable ids during linear motion', () => {
    const tracker = createTracker({ minHits: 2 })
    const states: string[] = []
    let lastId = 0
    for (let f = 0; f < 10; f++) {
      const tracks = tracker.update([{ label: 'person', score: 0.9, box: box(f * 10, 0) }])
      if (tracks.length) {
        states.push(tracks[0].state)
        lastId = tracks[0].id
      }
    }
    expect(states[0]).toBe('tentative')
    expect(states.at(-1)).toBe('confirmed')
    expect(lastId).toBe(1)
  })

  it('keeps the same id when the target moves frame to frame', () => {
    const tracker = createTracker({ minHits: 1 })
    const ids = new Set<number>()
    for (let f = 0; f < 6; f++) {
      const [t] = tracker.update([{ label: 'car', score: 0.9, box: box(0, f * 20) }])
      ids.add(t.id)
    }
    expect(ids.size).toBe(1)
  })

  it('recovers the same id after an occlusion shorter than maxAge', () => {
    const tracker = createTracker({ minHits: 1, maxAge: 5 })
    const [before] = tracker.update([{ label: 'person', score: 0.9, box: box(100, 100) }])
    for (let f = 0; f < 4; f++) tracker.update([]) // occluded, no detections
    const [after] = tracker.update([{ label: 'person', score: 0.9, box: box(110, 100) }])
    expect(after.id).toBe(before.id)
  })

  it('drops tracks after maxAge missed frames', () => {
    const tracker = createTracker({ minHits: 1, maxAge: 3 })
    tracker.update([{ label: 'person', score: 0.9, box: box(0, 0) }])
    for (let f = 0; f < 4; f++) tracker.update([])
    const tracks = tracker.update([{ label: 'person', score: 0.9, box: box(0, 0) }])
    expect(tracks[0].id).toBe(2) // fresh id, old one died
  })

  it('never merges tracks of different labels', () => {
    const tracker = createTracker({ minHits: 1 })
    tracker.update([{ label: 'person', score: 0.9, box: box(0, 0) }])
    // person moved on; a car appears exactly where the person was.
    // The car must NOT associate with the person track despite perfect IoU.
    const tracks = tracker.update([
      { label: 'person', score: 0.9, box: box(2, 0) },
      { label: 'car', score: 0.9, box: box(0, 0) },
    ])
    expect(tracks.length).toBe(2)
    expect(new Set(tracks.map((t) => t.label)).size).toBe(2)
    expect(new Set(tracks.map((t) => t.id)).size).toBe(2)
  })

  it('keeps both ids when two targets cross paths', () => {
    const tracker = createTracker({ minHits: 1 })
    const seen = new Map<number, string>()
    for (let f = 0; f < 8; f++) {
      const t = f * 12
      const tracks = tracker.update([
        { label: 'person', score: 0.9, box: box(t, 0) },      // moving right
        { label: 'person', score: 0.9, box: box(200 - t, 0) }, // moving left
      ])
      for (const tr of tracks) seen.set(tr.id, `${tr.box.x}`)
    }
    // two distinct ids survived the crossing
    expect(seen.size).toBe(2)
  })

  it('associates low score detections in the second stage (ByteTrack)', () => {
    const tracker = createTracker({ minHits: 1, maxAge: 10, lowScoreThreshold: 0.5 })
    const [first] = tracker.update([{ label: 'person', score: 0.9, box: box(50, 50) }])
    // only a weak detection next frame: should still keep the same track
    const [weak] = tracker.update([{ label: 'person', score: 0.3, box: box(52, 50) }])
    expect(weak.id).toBe(first.id)
    expect(weak.score).toBeCloseTo(0.3)
  })

  it('reports velocity and resets cleanly', () => {
    const tracker = createTracker({ minHits: 1 })
    tracker.update([{ label: 'person', score: 0.9, box: box(0, 0) }])
    const [t] = tracker.update([{ label: 'person', score: 0.9, box: box(10, 4) }])
    expect(t.velocity).toEqual({ x: 10, y: 4 })
    tracker.reset()
    expect(tracker.update([])).toEqual([])
  })
})
