import { describe, expect, it } from 'vitest'
import { VOC_CLASSES, VOC_PALETTE } from './index.js'

describe('segment constants', () => {
  it('has 21 VOC classes with matching palette entries', () => {
    expect(VOC_CLASSES.length).toBe(21)
    expect(VOC_PALETTE.length).toBe(21)
  })

  it('background is class 0 with black palette', () => {
    expect(VOC_CLASSES[0]).toBe('background')
    expect(VOC_PALETTE[0]).toEqual([0, 0, 0])
  })

  it('palette colors are unique so ids reverse map cleanly', () => {
    const keys = VOC_PALETTE.map(([r, g, b]) => `${r},${g},${b}`)
    expect(new Set(keys).size).toBe(21)
  })

  it('person is present for coverage stats', () => {
    expect(VOC_CLASSES).toContain('person')
  })
})
