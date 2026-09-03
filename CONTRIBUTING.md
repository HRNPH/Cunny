# Contributing

One repo, many small packages. A task ships as `@cunny-ai/<task>`, weighs one model, and works with zero configuration.

## Prerequisites

- Node 20+
- pnpm 10

```bash
pnpm install
pnpm dev        # playground at localhost:5199, one demo per task
pnpm test       # vitest, all packages
pnpm build      # tsup, all packages
pnpm typecheck  # tsc --noEmit, all packages
```

## Repository layout

```
packages/core              registry, cache, engine, errors
packages/provider-*        the only places ML runtimes are pinned
packages/<task>            one public API per task
playground/                demo hub, drives browser verification
docs/                      architecture, tasks, roadmap, release standard
docs/roadmaps/NNN_<name>/  the spec for each module, written before code
website/                   VitePress docs site
.changeset/                release entries
```

## Architecture invariants

Enforced in review. Details in [docs/architecture.md](docs/architecture.md).

1. Task packages never import task packages. Composition happens in combo packages or in user code.
2. Only providers pin runtimes (`@mediapipe/tasks-vision`, `onnxruntime-web`, `@huggingface/transformers`, `kokoro-js`). Tasks reach them through the provider boundary.
3. `packages/core` is the only shared dependency and never depends on a task.
4. No `window` access at module top level. Imports must be SSR safe.

## Adding a task

Work through the checklist in order.

1. **Spec.** `docs/roadmaps/NNN_<name>/README.md`, before any code: why, scope, API sketch, acceptance criteria, model with license and size. Roadmap numbers are the shipping order.
2. **Registry entry.** `packages/core/src/registry.ts`: task id, models, variants, tier aliases, license, byte sizes. Verify each URL with curl before landing. Byte level weights load through a provider; `builtin` means the task adapter loads its own pipeline.
3. **Package.** `packages/<name>/`: typed public API, one primary export, options object, `models()` metadata export, progress events on downloads, errors prefixed `@cunny-ai/<task>:`. Start from an existing task's `package.json` and `tsconfig.json`, with `private: true`.
4. **Unit tests.** Colocated `src/*.test.ts`, green under `pnpm vitest run packages/<name>`.
5. **Playground demo.** `playground/src/demos/<name>.ts` plus a `DEMOS` entry. No camera or mic required: use the bundled sample image, the bundled speech clip, or a synthetic stream (`canvas.captureStream`, `createMediaStreamDestination`). The primary button gets the id `run`, so `?autorun=run#/<demo>` drives the page.
6. **Browser smoke.** Run the demo against the real model with the playground visible. Record the result and timings in the spec.
7. **Release.** `version` to `0.0.0`, `private: false`, `publishConfig.access: "public"`, add a `patch` changeset, one commit per module. CI builds, typechecks, tests, and publishes. Publishing happens only in CI; the npm token exists only as a repository secret.

The full release standard is [docs/releases.md](docs/releases.md).

## Testing rules

- Vitest at the repo root. Tests are colocated; run a subset with `pnpm vitest run <path>`.
- Mock at the provider boundary (`vi.mock`), never inside pure logic. Mapping functions, calibration math, frame assembly, CTC decode, and reading order are all testable without a runtime and are expected to be tested.
- `happy-dom` is available when DOM APIs are required. Prefer fakes.
- A test that needs the network is a bug in the test.

## Behavioral tests

`pnpm e2e` drives the playground in headless Chromium against the real models: every demo runs through `?autorun=run` and the suite asserts the facts each demo reports (detection counts, transcripts, OCR text, upscaled dimensions, stable track ids), failing on any uncaught page error. `pnpm e2e:heavy` adds the >80MB demos (kokoro, clip). clip and depth are gated on a WebGPU adapter, which headless Chromium lacks; they run wherever one exists. CI runs the light suite on push and PR, the heavy set weekly and on demand. A change to a demo's reported facts is a regression: either the code broke, or the status contract changed and the spec plus test change together.

## Known failure modes

Each of these has shipped a bug at least once:

- Registry URLs that were never curled. Placeholder URLs fail only at runtime, in users' browsers.
- GPU paths that succeed and return garbage. `auto` acceleration needs a timeout and a CPU fallback that runs.
- Handlers dropped in constructor plumbing. If an option accepts a callback, a test asserts the callback fires.
- `flush()` racing an async queue. Flush must await the queue.
- `private: true` silently skipping publish. Check the CI log for the publish line.

## Commit format

Conventional commits, one module per commit:

```
feat(ocr): paddle-v4 det + rec pipeline
fix(vad): flush now awaits the frame drain
test(detect): delegate default regression
docs(readme): package table
chore(release): wave 2
```

## Automated agents

An automated AI agent operating without human supervision must state that at the top of the PR description. PRs from undisclosed automated accounts are rejected on detection, and the account is blocked from opening further PRs. Disclosed agent work follows the same spec, test, and smoke gates as any other contribution.

## Open work

`planned` rows in [docs/roadmaps/roadmap.md](docs/roadmaps/roadmap.md): face suite, voice suite, photo suite, text suite. Pick a row and open a spec PR before writing code. Also welcome: accuracy benchmarks for shipped tasks, smaller or better licensed model candidates for the registry, Safari and Firefox smoke results, demo polish.
