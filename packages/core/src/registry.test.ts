import { describe, expect, it } from 'vitest'
import { ModelNotFoundError } from './errors.js'
import { TASKS, listModels, resolveModel } from './registry.js'

describe('resolveModel', () => {
  it('returns the default model when none given', () => {
    const { modelId, entry } = resolveModel('face-detect')
    expect(modelId).toBe(TASKS['face-detect'].defaultModel)
    expect(entry.tiers.length).toBeGreaterThan(0)
  })

  it('resolves an exact model id', () => {
    expect(resolveModel('pose', 'heavy').modelId).toBe('heavy')
  })

  it('resolves tier aliases, preferring the default model when it carries the tier', () => {
    expect(resolveModel('pose', 'fast').modelId).toBe('lite')
    expect(resolveModel('pose', 'quality').modelId).toBe('full') // first model carrying the tier
    expect(resolveModel('face-detect', 'balanced').modelId).toBe('blazeface-short')
  })

  it('throws ModelNotFoundError for unknown models', () => {
    expect(() => resolveModel('face-detect', 'nope')).toThrow(ModelNotFoundError)
    expect(() => resolveModel('no-such-task')).toThrow(/unknown task/)
  })

  it('rejects tier aliases no model carries', () => {
    expect(() => resolveModel('face-detect', 'quality')).toThrow(ModelNotFoundError)
  })
})

describe('registry structure', () => {
  it('every model entry has a provider, license, defaultVariant and at least one variant', () => {
    for (const [taskId, task] of Object.entries(TASKS)) {
      expect(task.defaultModel, `${taskId} defaultModel`).toBeTypeOf('string')
      for (const [modelId, model] of Object.entries(task.models)) {
        expect(model.tiers.length, `${taskId}/${modelId} tiers`).toBeGreaterThan(0)
        expect(model.license, `${taskId}/${modelId} license`).toMatch(/./)
        expect(model.defaultVariant, `${taskId}/${modelId} defaultVariant`).toBeTypeOf('string')
        expect(Object.keys(model.variants).length, `${taskId}/${modelId} variants`).toBeGreaterThan(0)
        expect(model.variants[model.defaultVariant], `${taskId}/${modelId} default variant exists`).toBeDefined()
      }
    }
  })

  it('every non builtin provider points at a published provider package', () => {
    const known = ['@cunny-ai/provider-mediapipe', '@cunny-ai/provider-onnx', 'builtin']
    for (const task of Object.values(TASKS)) {
      for (const model of Object.values(task.models)) {
        expect(known).toContain(model.provider)
      }
    }
  })

  it('listModels reports sizeMB and tier per model', () => {
    const models = listModels('pose')
    expect(models.length).toBe(3)
    expect(models.find((m) => m.id === 'lite')?.tier).toBe('default')
    expect(models.every((m) => typeof m.sizeMB === 'number')).toBe(true)
  })
})
