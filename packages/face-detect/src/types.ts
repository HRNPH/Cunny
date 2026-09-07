/** One detected face. Pixel and normalized [0,1] coordinates, origin top-left. */
export interface Face {
  /** Confidence in [0,1]. */
  score: number
  /** Pixel box in the input image's coordinate space. */
  box: { x: number; y: number; width: number; height: number }
  /** Same box normalized to [0,1] — resolution-independent. */
  normalized: { x: number; y: number; width: number; height: number }
  /** 5 normalized keypoints: left eye, right eye, nose tip, mouth corners. */
  keypoints: Array<{ x: number; y: number }>
}

export interface DetectResult {
  /** Faces found, highest score first. */
  faces: Face[]
  /** Input dimensions the pixel boxes refer to. */
  width: number
  height: number
  /** Inference time (ms), excluding model download/init. */
  elapsedMs: number
}

/** Anything we can run detection on without you writing glue code. */
export type DetectSource =
  | Blob
  | File
  | ImageBitmap
  | HTMLImageElement
  | HTMLCanvasElement
  | OffscreenCanvas
  | string // URL (fetched with CORS)

export interface DetectOptions {
  /** Model id or tier alias ('fast' | 'balanced' | 'quality'). Default = curated default. See models(). */
  model?: string
  /** Minimum confidence to keep a detection. Default 0.5. */
  confidence?: number
  /** Non-max suppression IoU threshold. Default 0.3. */
  suppression?: number
  /** Max faces returned. Default 5. */
  maxFaces?: number
  /** 'auto' tries GPU (WebGL) then falls back to CPU/wasm. Default 'auto'. */
  acceleration?: 'auto' | 'cpu' | 'gpu'
}

export interface FaceDetectorInstance {
  /** One-shot detection on a still image. */
  detect(source: DetectSource): Promise<DetectResult>
  /** VIDEO-mode realtime path over a live `<video>` element. */
  detectVideo(video: HTMLVideoElement, timestampMs?: number): DetectResult
  /** Release the underlying detector. */
  close(): void
}

export interface TrackOptions extends DetectOptions {
  /** Target frames per second for the callback. Default 24. */
  fps?: number
  /** Download/init progress for the first run. */
  onProgress?: (info: { loaded: number; total: number }) => void
}

/** Per-frame callback for trackFaces(): the faces found and the full result. */
export type TrackCallback = (faces: Face[], result: DetectResult) => void
