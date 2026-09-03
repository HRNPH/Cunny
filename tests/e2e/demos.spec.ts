import { expect, test } from '@playwright/test'

/**
 * Behavioral regression against real models. Each demo reports facts in
 * #status / #stats when it finishes; these tests assert those facts.
 * The suite fails on any uncaught page error.
 */

const HEAVY = !!process.env.E2E_HEAVY

async function hasWebGPU(page: import('@playwright/test').Page): Promise<boolean> {
  return page.evaluate(async () => {
    if (typeof navigator === 'undefined' || !('gpu' in navigator)) return false
    try {
      const a = await (navigator as Navigator & { gpu: { requestAdapter(): Promise<unknown> } }).gpu.requestAdapter()
      return !!a
    } catch {
      return false
    }
  })
}

function demo(page: import('@playwright/test').Page, id: string, autorun = 'run') {
  const errors: string[] = []
  page.on('pageerror', (err) => errors.push(err.message))
  return { errors, go: () => page.goto(`/?autorun=${autorun}#/${id}`) }
}

async function statusBecomes(page: import('@playwright/test').Page, text: string | RegExp, timeout = 120_000) {
  await expect(page.locator('#status')).toContainText(text, { timeout })
}

// One-shot vision tasks. Facts were established during the release smokes.
const oneShot: Array<[string, string | RegExp]> = [
  ['face-detect', '1 face detected'],
  ['bg-remove', 'cutout ready'],
  ['face-mesh', '478 landmarks'],
  ['pose', '1 pose(s)'],
  ['detect', /person/i],
  ['segment', 'segmented'],
]

for (const [id, fact] of oneShot) {
  test(`${id} reports "${fact}"`, async ({ page }) => {
    const d = demo(page, id)
    await d.go()
    await statusBecomes(page, fact)
    expect(d.errors, d.errors.join('\n')).toEqual([])
  })
}

test('ocr reads the invoice line by line with confidence', async ({ page }) => {
  const d = demo(page, 'ocr')
  await d.go()
  await statusBecomes(page, 'line(s) read', 240_000)
  await expect(page.locator('#lines')).toContainText('INVOICE #2041')
  await expect(page.locator('#lines')).toContainText('Total: $42.50')
  await expect(page.locator('#lines')).toContainText(/9\d%/)
  expect(d.errors, d.errors.join('\n')).toEqual([])
})

test('segment finds the person class with real coverage', async ({ page }) => {
  const d = demo(page, 'segment')
  await d.go()
  await statusBecomes(page, 'segmented')
  await expect(page.locator('#stats')).toContainText(/person: \d+\.\d+%/)
  expect(d.errors).toEqual([])
})

test('similarity scores the paraphrase pair into paraphrase territory', async ({ page }) => {
  const d = demo(page, 'embed')
  await d.go()
  await statusBecomes(page, /score 0\.[5-9]/, 180_000)
  expect(d.errors).toEqual([])
})

test('stt transcribes the sample clip', async ({ page }) => {
  const d = demo(page, 'stt')
  await d.go()
  await statusBecomes(page, 'transcribed', 180_000)
  await expect(page.locator('#text')).toContainText(/my fellow Americans/i)
  expect(d.errors).toEqual([])
})

test('vad peaks near 1.00 and cuts speech segments', async ({ page }) => {
  const d = demo(page, 'vad')
  await d.go()
  await statusBecomes(page, /peak probability 0\.[7-9]|peak probability 1\.00/, 180_000)
  await expect(page.locator('#segs')).toContainText('speech segment 1')
  expect(d.errors).toEqual([])
})

test('track holds stable ids through the synthetic stream', async ({ page }) => {
  const d = demo(page, 'track', 'synth')
  await d.go()
  await statusBecomes(page, 'stable id')
  await expect(page.locator('#stats')).toContainText(/ids seen: \d+/)
  expect(d.errors).toEqual([])
})

test('upscale produces the 4x esrgan output', async ({ page }) => {
  const d = demo(page, 'upscale')
  await d.go()
  await statusBecomes(page, '640×800 output', 240_000)
  expect(d.errors).toEqual([])
})

test('denoise processes the noisy clip and reports vad', async ({ page }) => {
  const d = demo(page, 'denoise-audio')
  await d.go()
  await statusBecomes(page, 'denoised', 120_000)
  await expect(page.locator('#status')).toContainText(/vad 0\.\d+/)
  expect(d.errors).toEqual([])
})

test('stt-live finalizes utterances from the synthetic mic', async ({ page }) => {
  const d = demo(page, 'stt-live')
  await d.go()
  await statusBecomes(page, 'listening', 180_000)
  await expect(page.locator('#finals')).toContainText('→', { timeout: 240_000 })
  expect(d.errors).toEqual([])
})

// Heavy first loads (>80MB): kokoro, clip. Depth is moderate but slow to compile.
test.describe('heavy', () => {
  test.skip(!HEAVY, 'heavy suite: set E2E_HEAVY=1')

  test('clip classifies the portrait zero-shot', async ({ page }) => {
  const d = demo(page, 'clip')
    await d.go()
    await statusBecomes(page, /top: a politician/i, 600_000)
    expect(d.errors).toEqual([])
  })

  test('depth produces a heatmap at input resolution', async ({ page }) => {
    test.skip(!(await hasWebGPU(page)), 'requires a webgpu adapter; none in headless chromium')
    const d = demo(page, 'depth')
    await d.go()
    await statusBecomes(page, 'depth map ready', 600_000)
    expect(d.errors).toEqual([])
  })

  test('tts kokoro synthesizes audible-length audio', async ({ page }) => {
    const d = demo(page, 'tts', 'kokoro')
    await d.go()
    await statusBecomes(page, 'done', 600_000)
    await expect(page.locator('#stats')).toContainText(/of audio/)
    expect(d.errors).toEqual([])
  })
})
