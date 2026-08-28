import { describe, expect, it } from 'vitest'
import {
  binarize, connectedComponents, ctcDecode, detInput, unclipBox,
  recInput, resizePixels, softmaxTimesteps, sortReadingOrder,
} from './index.js'

describe('binarize', () => {
  it('thresholds the probability map', () => {
    const mask = binarize(Float32Array.from([0.1, 0.5, 0.2999, 0.3]), 0.3)
    expect([...mask]).toEqual([0, 1, 0, 1])
  })
})

describe('connectedComponents', () => {
  const w = 5
  const h = 4
  it('finds one component for a connected blob, dropping specks', () => {
    const mask = new Uint8Array(w * h)
    // a 2×3 blob
    for (let y = 1; y <= 2; y++) for (let x = 1; x <= 3; x++) mask[y * w + x] = 1
    // a single-pixel speck (area 1 < minArea)
    mask[3 * w + 4] = 1
    const boxes = connectedComponents(mask, w, h, 2)
    expect(boxes).toHaveLength(1)
    expect(boxes[0]).toMatchObject({ x: 1, y: 1, width: 3, height: 2 })
  })

  it('splits diagonally separated blobs', () => {
    const mask = new Uint8Array(w * h)
    mask[0] = 1
    mask[2 * w + 3] = 1
    mask[2 * w + 4] = 1
    const boxes = connectedComponents(mask, w, h, 2)
    expect(boxes).toHaveLength(1) // the single pixel is below minArea
    expect(boxes[0]).toMatchObject({ x: 3, y: 2, width: 2, height: 1 })
  })
})

describe('unclipBox', () => {
  it('grows the box by the area ratio offset', () => {
    // 10×10 box: area 100, perimeter 40, offset = 100 * 1.6 / 40 = 4
    expect(unclipBox({ x: 10, y: 10, width: 10, height: 10 }, 1.6)).toEqual({
      x: 6, y: 6, width: 18, height: 18,
    })
  })

  it('clamps at zero', () => {
    expect(unclipBox({ x: 0, y: 0, width: 4, height: 4 }, 2).x).toBe(0)
    expect(unclipBox({ x: 0, y: 0, width: 4, height: 4 }, 2).y).toBe(0)
  })
})

describe('sortReadingOrder', () => {
  it('sorts rows top to bottom, left to right inside a row', () => {
    const items = [
      { id: 'b2', box: { x: 200, y: 0, width: 50, height: 20 } },
      { id: 'a1', box: { x: 0, y: 100, width: 50, height: 20 } },
      { id: 'b1', box: { x: 0, y: 5, width: 50, height: 20 } },
      { id: 'a2', box: { x: 200, y: 102, width: 50, height: 20 } },
    ]
    expect(sortReadingOrder(items).map((i) => i.id)).toEqual(['b1', 'b2', 'a1', 'a2'])
  })
})

describe('ctcDecode', () => {
  it('collapses repeats and drops blank and out-of-mapping classes', () => {
    // T=5, C=4; blank=0, mapping: ['', 'h', 'i', '!']
    const probs = Float32Array.from([
      0.9, 0.1, 0.0, 0.0, // blank
      0.0, 0.9, 0.1, 0.0, // h
      0.0, 0.9, 0.0, 0.1, // h (repeat, collapsed)
      0.1, 0.0, 0.9, 0.0, // i
      0.9, 0.1, 0.0, 0.0, // blank
    ])
    const { text } = ctcDecode(probs, 5, 4, ['', 'h', 'i', '!'], 0)
    expect(text).toBe('hi')
  })

  it('keeps repeated characters separated by a blank', () => {
    const probs = Float32Array.from([
      0.0, 0.9,
      0.9, 0.1,
      0.0, 0.9,
    ])
    const { text } = ctcDecode(probs, 3, 2, ['', 'l'], 0)
    expect(text).toBe('ll')
  })

  it('confidence stays within [0, 1]', () => {
    const probs = Float32Array.from([0.0, 1.0, 0.0, 1.0])
    const { confidence } = ctcDecode(probs, 2, 2, ['', 'x'], 0)
    expect(confidence).toBeGreaterThan(0)
    expect(confidence).toBeLessThanOrEqual(1)
  })
})

describe('softmaxTimesteps', () => {
  it('normalizes each row to sum 1', () => {
    const out = softmaxTimesteps(Float32Array.from([1, 0, 0, 2]), 2, 2)
    expect(out[0] + out[1]).toBeCloseTo(1)
    expect(out[2] + out[3]).toBeCloseTo(1)
    expect(out[3]).toBeGreaterThan(out[2])
  })
})

describe('detInput', () => {
  it('produces NCHW ImageNet-normalized planes', () => {
    // 2×1 all-gray image (128,128,128)
    const px = Uint8ClampedArray.from([128, 128, 128, 255, 128, 128, 128, 255])
    const out = detInput(px, 2, 1)
    expect(out).toHaveLength(6)
    // n = 2 pixels: plane layout is [R0,R1, G0,G1, B0,B1]
    expect(out[0]).toBeCloseTo((128 / 255 - 0.485) / 0.229, 4)
    expect(out[2]).toBeCloseTo((128 / 255 - 0.456) / 0.224, 4)
    expect(out[4]).toBeCloseTo((128 / 255 - 0.406) / 0.225, 4)
  })
})

describe('resizePixels', () => {
  it('scales RGBA to the target size with last-pixel clamping', () => {
    const src = Uint8ClampedArray.from([10, 20, 30, 255, 40, 50, 60, 255])
    const out = resizePixels(src, 2, 1, 4, 2)
    expect(out).toHaveLength(4 * 2 * 4)
    expect([...out.slice(0, 4)]).toEqual([10, 20, 30, 255])
  })
})

describe('recInput', () => {
  it('resizes the crop to 48 rows and proportional width', () => {
    // 100×20 white box inside a 100×50 image
    const img = new Uint8ClampedArray(100 * 50 * 4).fill(255)
    const { input, width, height } = recInput(img, 100, { x: 0, y: 0, width: 100, height: 20 })
    expect(height).toBe(48)
    expect(width).toBe(240)
    expect(input).toHaveLength(3 * width * height)
    // white pixel → (1 - 0.5)/0.5 = 1
    expect(input[0]).toBeCloseTo(1, 5)
  })
})
