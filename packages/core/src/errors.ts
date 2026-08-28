/** Base class for every error thrown by the SDK. `code` is stable for programmatic handling. */
export class CunnyAIError extends Error {
  constructor(message: string, readonly code: string) {
    super(`@cunny-ai: ${message}`)
    this.name = 'CunnyAIError'
  }
}

export class ModelNotFoundError extends CunnyAIError {
  constructor(taskId: string, model: string) {
    super(`task "${taskId}" has no model "${model}". See models() for options.`, 'MODEL_NOT_FOUND')
  }
}

export class ProviderMissingError extends CunnyAIError {
  constructor(pkg: string) {
    super(
      `this model needs the ${pkg} provider, which is not installed. Run:  npm i ${pkg}`,
      'PROVIDER_MISSING',
    )
  }
}

export class DownloadError extends CunnyAIError {
  constructor(url: string, status: number) {
    super(`model download failed (${status}) ${url}`, 'DOWNLOAD_FAILED')
  }
}
