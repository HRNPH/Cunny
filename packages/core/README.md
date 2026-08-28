# @cunny-ai/core

Model registry, cached loading and engine for `@cunny-ai/*` task packages.

```ts
import { createEngine } from '@cunny-ai/core'

const engine = createEngine()
const model = await engine.loadModel('face-detect', {
  model: 'balanced', // tier alias, exact model id, or default
  onProgress: ({ loaded, total }) => console.log(`${loaded}/${total}`),
})
```

- Registry: task → models → variants, with license and size metadata
- Cache API storage, concurrent download dedupe, progress events
- Typed errors (`ModelNotFoundError`, `ProviderMissingError`)

Task packages use this internally. [API reference](https://github.com/HRNPH/Cunny). MIT.
