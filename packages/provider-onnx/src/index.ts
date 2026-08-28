/**
 * @cunny-ai/provider-onnx — the onnxruntime-web runtime boundary (architecture.md Rule 4).
 * Owns: ort version pin, wasm path resolution, backend selection with fallback,
 * session creation from core-loaded bytes.
 */
import { ProviderMissingError } from '@cunny-ai/core'

const ORT_VERSION = '1.22.0'
const DEFAULT_WASM_PATHS = `https://cdn.jsdelivr.net/npm/onnxruntime-web@${ORT_VERSION}/dist/`

let wasmPaths: string = DEFAULT_WASM_PATHS
/** Self-host: point at your own copy of onnxruntime-web/dist. */
export function setWasmPaths(paths: string): void {
  wasmPaths = paths
}

type Ort = typeof import('onnxruntime-web')
let ortPromise: Promise<Ort> | undefined

export async function getOrt(): Promise<Ort> {
  try {
    ortPromise ??= import('onnxruntime-web').then((m) => {
      m.env.wasm.wasmPaths = wasmPaths
      return m
    })
    return await ortPromise
  } catch {
    throw new ProviderMissingError('@cunny-ai/provider-onnx')
  }
}

export type Backend = 'auto' | 'wasm' | 'webgpu'

export async function createSession(
  bytes: ArrayBuffer,
  opts: { backend?: Backend } = {},
): Promise<import('onnxruntime-web').InferenceSession> {
  const ort = await getOrt()
  const backend = opts.backend ?? 'auto'
  const providers =
    backend === 'wasm' ? ['wasm']
    : backend === 'webgpu' ? ['webgpu']
    : typeof navigator !== 'undefined' && 'gpu' in navigator ? ['webgpu', 'wasm']
    : ['wasm']

  try {
    return await ort.InferenceSession.create(new Uint8Array(bytes), { executionProviders: providers })
  } catch (err) {
    if (backend !== 'auto') throw err
    return ort.InferenceSession.create(new Uint8Array(bytes), { executionProviders: ['wasm'] })
  }
}

/** Convenience: run with ort Tensor construction available to callers. */
export async function run(
  session: import('onnxruntime-web').InferenceSession,
  feeds: Record<string, import('onnxruntime-web').Tensor>,
): Promise<import('onnxruntime-web').InferenceSession.OnnxValueMapType> {
  return session.run(feeds)
}

export async function newTensor(
  type: 'float32' | 'int64' | 'int32',
  data: Float32Array | Int32Array | BigInt64Array,
  dims: number[],
): Promise<import('onnxruntime-web').Tensor> {
  const ort = await getOrt()
  return new ort.Tensor(type as never, data as never, dims)
}
