import { describe, expect, it } from 'vitest'
import { createEngine } from './engine.js'

describe('engine', () => {
  it('rejects unknown tasks', async () => {
    const engine = createEngine()
    await expect(engine.loadModel('nope')).rejects.toThrow(/unknown task/)
  })

  it('passes through builtin provider models without downloading', async () => {
    const engine = createEngine()
    const model = await engine.loadModel('embed', { model: 'minilm-l6' })
    expect(model.modelId).toBe('minilm-l6')
    expect(model.byteLength).toBe(0)
    expect(model.cached).toBe(true)
    expect(model.provider).toBe('builtin')
  })

  it('rejects unknown variants', async () => {
    const engine = createEngine()
    await expect(engine.loadModel('embed', { variant: 'nope' })).rejects.toThrow(/no variant/)
  })

  it('report lists loaded models and the cache backend', async () => {
    const engine = createEngine()
    await engine.loadModel('embed')
    const report = engine.report()
    expect(report.models.length).toBe(1)
    expect(['cache-api', 'none']).toContain(report.cacheBackend)
  })
})
