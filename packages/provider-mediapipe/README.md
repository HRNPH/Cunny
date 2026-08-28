# @cunny-ai/provider-mediapipe

Shared MediaPipe Tasks Vision runtime for `@cunny-ai/*` packages. The only package that pins `@mediapipe/tasks-vision`. The wasm downloads once per browser and is shared by every task that uses this provider.

Self hosting:

```ts
import { setWasmBase } from '@cunny-ai/provider-mediapipe'
setWasmBase('/static/mediapipe/wasm')
```

MIT.
