# Release Standard

How a module ships. One page, applied the same way every time.

## Ship gate

A module may publish when all of these hold:

1. `pnpm build` green
2. `pnpm typecheck` green
3. `pnpm test` green, with unit tests colocated at `packages/<name>/src/*.test.ts`
4. Browser smoke passed: the playground demo runs the real model end to end, result recorded in the module spec (`docs/roadmaps/NNN_<name>/README.md`)
5. README present with a size table (package KB, first load MB)
6. `license`, `publishConfig.access: "public"` set
7. `private: true` removed in the module's commit
8. Version `0.0.1` for a first release

CI enforces 1 to 3 on every push to main. Nothing bypasses CI: publishing happens only in the release workflow.

## Publishing flow

- Push to `main` runs build, typecheck, test, then changesets.
- Any package whose local version is unpublished goes out automatically. First releases need no changeset.
- Changesets creates git tags per published version (workflow grants `permissions: contents: write`).

### Version bumps for published packages

- Patch or minor change: add `.changeset/<slug>.md` declaring the package, bump kind and a one line note. CI opens the Version PR. Merge it, publish runs.
- Never edit the version of a published package by hand. Hand edits are for unpublished packages only.

## Test standard

- Unit tests cover pure logic: registry resolution, caching, math, association, chunking, metadata. They run in node, offline, fast.
- DOM dependent code uses the `// @vitest-environment happy-dom` docblock.
- Unit tests never download model weights and never touch the network. Real model checks happen in the playground demo, per the ship gate.
- Each package owns its tests. Root `pnpm test` runs every package. A package with no tests yet still passes (`--passWithNoTests`) and shows up in the roadmap as `impl (private)`.

## One time setup (done)

- npm org `cunny-ai`, public packages, free tier
- Granular automation token stored as GitHub secret `NPM_ACCESS_KEY`, read and write on the org
- Changesets config ignores `playground`; `updateInternalDependencies: patch`

## Release log

- 2026-08-28: v0.0.1 `@cunny-ai/core`, `@cunny-ai/provider-mediapipe`, `@cunny-ai/face-detect`. v0.0.2 rename pass. v0.0.3 core: report() records builtin loads.
