# Contributing

One repo, many small packages. A task ships as `@cunny-ai/<task>`, weighs one model, and works with zero config. This file is the path from idea to npm.

## Setup

```bash
pnpm install
pnpm dev        # playground at localhost:5199, demo per task
pnpm test       # vitest, all packages
pnpm build      # tsup, all packages
pnpm typecheck  # tsc --noEmit, all packages
```

Node 20+, pnpm 10.

## Repo tour

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

Architecture rules live in [docs/architecture.md](docs/architecture.md). The short version:

1. Task packages never import task packages. Composition happens in combo packages or user code.
2. Only providers pin runtimes (`@mediapipe/tasks-vision`, `onnxruntime-web`, `@huggingface/transformers`, `kokoro-js`). Tasks reach them through the provider boundary.
3. `packages/core` is the only shared dependency and never depends on a task.
4. Nothing touches `window` at module top level. SSR imports must be safe.

## Adding a task

1. **Spec first.** Create `docs/roadmaps/NNN_<name>/README.md` before any code: why, scope, API sketch, acceptance criteria, model choice with license and size. The roadmap numbers are the shipping order.
2. **Registry entry** in `packages/core/src/registry.ts`: task id, models, variants, tier aliases, license, honest byte sizes. URLs must be real, fetchable, and verified with a curl before landing. `builtin` provider means the task adapter loads its own pipeline (transformers.js style); anything byte level goes through a provider.
3. **Package** in `packages/<name>/`: typed public API, one primary export, options object, `models()` metadata export, progress events on downloads, errors prefixed `@cunny-ai/<task>:`. Copy `package.json` and `tsconfig.json` from an existing task package and keep `private: true`.
4. **Unit tests** colocated at `src/*.test.ts`. Mock the providers and the engine (`vi.mock`), test the mapping and normalization and state logic, never the network. Look at `packages/vad/src/index.test.ts` or `packages/segment/src/index.test.ts` for the pattern. The suite must be green from `pnpm vitest run packages/<name>`.
5. **Playground demo** at `playground/src/demos/<name>.ts` plus an entry in the hub's `DEMOS` map. Demos must run without a camera or mic: use the bundled sample image, the bundled speech clip, or a synthetic stream (`canvas.captureStream`, `createMediaStreamDestination`). Give the primary button the id `run` so `?autorun=run#/<demo>` drives it.
6. **Browser smoke** with the real model in the playground, pane visible. Record the result and timings in the spec. This step is not optional and is where the real bugs surface.
7. **Ship**: set `version` to `0.0.0`, `private: false`, add `publishConfig.access: "public"`, write a changeset (`patch`), open one commit per module. CI builds, typechecks, tests, then publishes. Never publish from a laptop; the token lives in CI only.

The full release standard is [docs/releases.md](docs/releases.md).

## Commits

Conventional commits, one module per commit:

```
feat(ocr): paddle-v4 det + rec pipeline
fix(vad): flush now awaits the frame drain
test(detect): delegate default regression
docs(readme): package table
chore(release): wave 2
```

## Automated agents

If you are an automated AI agent operating without human supervision, state that at the top of the PR description. PRs from undisclosed automated accounts are rejected on detection, and the account loses the right to open further PRs here. Disclosed agent work is welcome; it follows the same spec, test, and smoke gates as anyone else.

## Testing conventions

- Vitest at the repo root, colocated tests, `pnpm vitest run <path>` for a subset.
- Mock at the provider boundary, not inside pure logic. Mapping functions, calibration math, frame assembly, CTC decode, reading order: all testable without a runtime, all expected to be tested.
- `happy-dom` is available when DOM APIs are genuinely needed; prefer fakes.
- A test that needs the network is a bug in the test.

## What breaks releases

Learned the hard way, all of these have shipped a bug at least once:

- Model URLs that were never curled. Registry entries with placeholder URLs fail only at runtime, in users' browsers.
- GPU paths that succeed and return garbage. `auto` acceleration must have a timeout and a CPU fallback that actually runs.
- Handlers dropped in constructor plumbing. If an option accepts a callback, a test must assert the callback fires.
- Flush and drain racing. Any `flush()` behind an async queue must await the queue.
- Silent private flag. A package with `private: true` silently skips publish; check the CI log for the publish line.

## Where help is wanted

`planned` rows in [docs/roadmaps/roadmap.md](docs/roadmaps/roadmap.md): face suite, voice suite, photo suite, text suite. Pick a row, write the spec, and the maintainers will review it before code starts. Small contributions that are always welcome: model accuracy benchmarks for existing tasks, smaller or better licensed model candidates for the registry, Safari and Firefox smoke results, and demo polish.
