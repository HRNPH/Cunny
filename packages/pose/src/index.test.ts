import { describe, expect, it } from 'vitest'
import { POSE_CONNECTIONS, POSE_LANDMARKS } from './index.js'

const NAMES = Object.values(POSE_LANDMARKS)

describe('pose constants', () => {
  it('has 33 landmarks with unique indices', () => {
    expect(NAMES.length).toBe(33)
    expect(new Set(NAMES).size).toBe(33)
    for (const i of NAMES) expect(i).toBeGreaterThanOrEqual(0)
  })

  it('all connections reference valid landmark indices', () => {
    expect(POSE_CONNECTIONS.length).toBeGreaterThan(0)
    for (const [a, b] of POSE_CONNECTIONS) {
      expect(NAMES).toContain(a)
      expect(NAMES).toContain(b)
      expect(a).not.toBe(b)
    }
  })

  it('key body landmarks exist', () => {
    expect(POSE_LANDMARKS.NOSE).toBe(0)
    expect(POSE_LANDMARKS.LEFT_WRIST).toBeDefined()
    expect(POSE_LANDMARKS.RIGHT_ANKLE).toBeDefined()
  })
})
