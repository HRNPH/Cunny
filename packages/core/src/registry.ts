import { ModelNotFoundError } from './errors.js'
import type { ModelEntry, ModelInfo, TaskEntry, Tier } from './types.js'

const MP = 'https://storage.googleapis.com/mediapipe-models'

/**
 * Registry v2 — task → models → variants (architecture.md Rule 3).
 * One source of truth for model choice, `models()` metadata, docs and CI size gates.
 * License policy: defaults must be Apache-2.0 / MIT / CC-BY.
 */
export const TASKS: Record<string, TaskEntry> = {
  'face-detect': {
    defaultModel: 'blazeface-short',
    models: {
      'blazeface-short': {
        provider: '@cunny-ai/provider-mediapipe',
        tiers: ['fast', 'balanced'],
        license: 'Apache-2.0',
        defaultVariant: 'fp16',
        variants: {
          fp16: { url: `${MP}/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite`, approxBytes: 450_000 },
        },
      },
      // 'yunet' (provider-onnx, quality) — second model validating multi-model; pending provider-onnx golden tests
    },
  },

  'bg-remove': {
    defaultModel: 'selfie-seg',
    models: {
      'selfie-seg': {
        provider: '@cunny-ai/provider-mediapipe',
        tiers: ['fast', 'balanced'],
        license: 'Apache-2.0',
        defaultVariant: 'fp16',
        variants: {
          fp16: { url: `${MP}/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite`, approxBytes: 250_000 },
        },
      },
    },
  },

  'face-mesh': {
    defaultModel: 'face-landmarker',
    models: {
      'face-landmarker': {
        provider: '@cunny-ai/provider-mediapipe',
        tiers: ['balanced'],
        license: 'Apache-2.0',
        defaultVariant: 'fp16',
        variants: {
          fp16: { url: `${MP}/face_landmarker/face_landmarker/float16/latest/face_landmarker.task`, approxBytes: 3_700_000 },
        },
      },
    },
  },

  pose: {
    defaultModel: 'lite',
    models: {
      lite: {
        provider: '@cunny-ai/provider-mediapipe', tiers: ['fast', 'balanced'], license: 'Apache-2.0', defaultVariant: 'fp16',
        variants: { fp16: { url: `${MP}/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task`, approxBytes: 5_500_000 } },
      },
      full: {
        provider: '@cunny-ai/provider-mediapipe', tiers: ['balanced', 'quality'], license: 'Apache-2.0', defaultVariant: 'fp16',
        variants: { fp16: { url: `${MP}/pose_landmarker/pose_landmarker_full/float16/latest/pose_landmarker_full.task`, approxBytes: 9_000_000 } },
      },
      heavy: {
        provider: '@cunny-ai/provider-mediapipe', tiers: ['quality'], license: 'Apache-2.0', defaultVariant: 'fp16',
        variants: { fp16: { url: `${MP}/pose_landmarker/pose_landmarker_heavy/float16/latest/pose_landmarker_heavy.task`, approxBytes: 29_000_000 } },
      },
    },
  },

  segment: {
    defaultModel: 'deeplab-v3',
    models: {
      'deeplab-v3': {
        provider: '@cunny-ai/provider-mediapipe',
        tiers: ['balanced'],
        license: 'Apache-2.0',
        defaultVariant: 'fp32',
        variants: {
          fp32: { url: `${MP}/image_segmenter/deeplab_v3/float32/latest/deeplab_v3.tflite`, approxBytes: 2_900_000 },
        },
      },
    },
  },

  detect: {
    defaultModel: 'efficientdet-lite0',
    models: {
      'efficientdet-lite0': {
        provider: '@cunny-ai/provider-mediapipe',
        tiers: ['fast', 'balanced'],
        license: 'Apache-2.0',
        defaultVariant: 'int8',
        notes: '80 COCO classes. YOLOX-n (Apache-2.0) planned as quality tier via provider-onnx.',
        variants: {
          int8: { url: `${MP}/object_detector/efficientdet_lite0/int8/latest/efficientdet_lite0.tflite`, approxBytes: 4_400_000 },
        },
      },
    },
  },

  embed: {
    defaultModel: 'bge-small',
    models: {
      'bge-small': {
        provider: 'builtin', tiers: ['balanced', 'quality'], license: 'MIT', defaultVariant: 'q8',
        repo: 'Xenova/bge-small-en-v1.5', notes: '384-dim, EN. Weight dedupe: similarity/search share the same repo → one download.',
        variants: { q8: { url: 'huggingface.co/Xenova/bge-small-en-v1.5 (onnx/model_quantized.onnx)', approxBytes: 24_000_000 } },
      },
      'minilm-l6': {
        provider: 'builtin', tiers: ['fast'], license: 'Apache-2.0', defaultVariant: 'q8',
        repo: 'Xenova/all-MiniLM-L6-v2',
        variants: { q8: { url: 'huggingface.co/Xenova/all-MiniLM-L6-v2 (onnx/model_quantized.onnx)', approxBytes: 23_000_000 } },
      },
    },
  },

  similarity: {
    defaultModel: 'bge-small',
    models: {
      'bge-small': {
        provider: 'builtin', tiers: ['balanced', 'quality'], license: 'MIT', defaultVariant: 'q8',
        repo: 'Xenova/bge-small-en-v1.5', notes: 'Same repo as @cunny-ai/embed — weights shared, zero extra download.',
        variants: { q8: { url: 'huggingface.co/Xenova/bge-small-en-v1.5 (onnx/model_quantized.onnx)', approxBytes: 24_000_000 } },
      },
    },
  },

  stt: {
    defaultModel: 'moonshine-tiny',
    models: {
      'moonshine-tiny': {
        provider: 'builtin', tiers: ['fast', 'balanced'], license: 'MIT (verify at pin)', defaultVariant: 'q8',
        repo: 'onnx-community/moonshine-tiny-ONNX', notes: '27M params, EN. Beats Whisper-tiny at half the size.',
        variants: { q8: { url: 'huggingface.co/onnx-community/moonshine-tiny-ONNX', approxBytes: 30_000_000 } },
      },
    },
  },

  clip: {
    defaultModel: 'clip-vit-b32',
    models: {
      'clip-vit-b32': {
        provider: 'builtin', tiers: ['balanced', 'quality'], license: 'MIT', defaultVariant: 'q8',
        repo: 'Xenova/clip-vit-base-patch32', notes: 'Shared text+image space. Zero-shot classify + search.',
        variants: { q8: { url: 'huggingface.co/Xenova/clip-vit-base-patch32 (quantized)', approxBytes: 50_000_000 } },
      },
    },
  },

  depth: {
    defaultModel: 'depth-anything-v2-small',
    models: {
      'depth-anything-v2-small': {
        provider: 'builtin', tiers: ['balanced'], license: 'Apache-2.0', defaultVariant: 'q8',
        repo: 'onnx-community/depth-anything-v2-small', notes: 'Relative inverse depth (0=far, 1=near after normalize).',
        variants: { q8: { url: 'huggingface.co/onnx-community/depth-anything-v2-small', approxBytes: 25_000_000 } },
      },
    },
  },

  upscale: {
    defaultModel: 'real-esrgan-x4',
    models: {
      'real-esrgan-x4': {
        provider: '@cunny-ai/provider-onnx', tiers: ['quality'], license: 'BSD-3-Clause', defaultVariant: 'q8',
        repo: 'onnx-community/RealESRGAN_x4plus', notes: '4× photo upscale. WebGPU recommended.',
        variants: { q8: { url: 'huggingface.co/onnx-community/RealESRGAN_x4plus', approxBytes: 17_000_000 } },
      },
    },
  },

  vad: {
    defaultModel: 'silero-v5',
    models: {
      'silero-v5': {
        provider: '@cunny-ai/provider-onnx', tiers: ['fast', 'balanced'], license: 'MIT', defaultVariant: 'fp32',
        repo: 'onnx-community/silero-vad', notes: '512-sample frames @16k + 64 context, state (2,1,64).',
        variants: { fp32: { url: 'huggingface.co/onnx-community/silero-vad/resolve/main/silero_vad.onnx', approxBytes: 2_200_000 } },
      },
    },
  },

  tts: {
    defaultModel: 'kokoro-82m',
    models: {
      'kokoro-82m': {
        provider: 'builtin', tiers: ['quality'], license: 'Apache-2.0', defaultVariant: 'q8',
        repo: 'onnx-community/Kokoro-82M-ONNX', notes: '82M params. Voice files lazy per voice.',
        variants: { q8: { url: 'huggingface.co/onnx-community/Kokoro-82M-ONNX', approxBytes: 85_000_000 } },
      },
      native: {
        provider: 'builtin', tiers: ['fast'], license: 'N/A (OS voices)', defaultVariant: 'default',
        notes: 'speechSynthesis — zero download, robot vibes.',
        variants: { default: { url: '', approxBytes: 0 } },
      },
    },
  },
}

export function resolveModel(taskId: string, model?: string): { modelId: string; entry: ModelEntry } {
  const task = TASKS[taskId]
  if (!task) {
    throw new Error(`@cunny-ai/core: unknown task "${taskId}". Known: ${Object.keys(TASKS).join(', ')}`)
  }
  if (!model || model === 'default') {
    return { modelId: task.defaultModel, entry: task.models[task.defaultModel] }
  }
  const exact = task.models[model]
  if (exact) return { modelId: model, entry: exact }
  if (model === 'fast' || model === 'balanced' || model === 'quality') {
    // Default model first when it carries the tier, else first model carrying it.
    const ordered = [task.defaultModel, ...Object.keys(task.models).filter((m) => m !== task.defaultModel)]
    for (const id of ordered) {
      if (task.models[id].tiers.includes(model as Tier)) {
        return { modelId: id, entry: task.models[id] }
      }
    }
  }
  throw new ModelNotFoundError(taskId, model)
}

/** Metadata for task packages' `models()` export — generated from the registry, never hand-written. */
export function listModels(taskId: string): ModelInfo[] {
  const task = TASKS[taskId]
  if (!task) return []
  return Object.entries(task.models).map(([id, m]) => {
    const v = m.variants[m.defaultVariant]
    return {
      id,
      tier: id === task.defaultModel ? 'default' : (m.tiers[0] ?? 'default') as ModelInfo['tier'],
      provider: m.provider,
      license: m.license,
      sizeMB: Math.round(((v?.approxBytes ?? 0) / 100_000)) / 10,
      notes: m.notes,
    }
  })
}
