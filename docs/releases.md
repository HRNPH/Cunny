# Release & Publishing Plan

How code goes from this monorepo to npm. One repo, many independently-published packages, nobody installs "the framework", they install exactly one task.

**Status: planned. Nothing here is implemented yet, this doc is the approved blueprint.**

---

## Principles

1. **Independent versioning.** `@cunny-ai/face-detect` can ship 0.3.0 while `@cunny-ai/core` sits at 0.1.4. A change to one package never forces a release of another (except core majors, see below).
2. **Changesets.** Every user-visible change gets a changeset in its PR declaring the package + semver bump. Versioning happens in merge-to-main, publishing in CI.
3. **Publish from CI only.** No laptop publishes. The workflow uses `secrets.NPM_TOKEN` (granular, automation-friendly).
4. **Models never ship as package weight** unless `bundled: true` (≤1MB, e.g. 020's rnnoise wasm). Everything else resolves at runtime through the registry.
5. **0.x honesty.** While `0.x`, breaking bumps are cheap and expected; docs state it. 1.0 for a package = its spec's acceptance criteria all green.

## One-time setup (manual, when we start publishing)

- [ ] **Create the npm org `cunny`**, scope `@cunny-ai` is confirmed free (checked 2026-08-28). Create at npmjs.com/org/create, free tier (public packages).
- [ ] **Create npm access token**: granular token, "Read and write" on packages under org `cunny-ai`, **no** 2FA-OTP on it (automation token). Store as GitHub secret `NPM_ACCESS_KEY` in this repo (Settings → Secrets → Actions).
- [ ] **Optional but recommended**: enable npm **trusted publishing** (OIDC) instead of a long-lived token, no secret to leak; requires the workflow to be the only publisher.
- [ ] Add `repository`, `homepage`, `bugs` fields to every package.json (done per-package at first publish prep).

## Toolchain

- `@changesets/cli` at repo root; `changeset` on PRs; the [changesets/action](https://github.com/changesets/action) on main.
- CI quality gates before publish: `pnpm build` + `pnpm typecheck` + package-level smoke tests, `publint` (exports correctness), and a size check (fail if package tarball > 5MB, catches accidental model bundling).

## Workflow (to be added at `.github/workflows/release.yml`)

```yaml
name: release
on:
  push:
    branches: [main]

concurrency: release

jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 24
          cache: pnpm
          registry-url: https://registry.npmjs.org
      - run: pnpm install --frozen-lockfile
      - run: pnpm build && pnpm typecheck
      - run: pnpm -r --filter './packages/*' exec publint || true   # hard-fail after first publish
      - uses: changesets/action@v1
        with:
          publish: pnpm changeset publish
          # Scoped packages default to private on npm, force public:
        env:
          NPM_TOKEN: ${{ secrets.NPM_TOKEN }}
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
```

Notes:
- `changeset publish` handles `--access public` for scoped packages via each package.json's `"publishConfig": { "access": "public" }` (set in every package at first publish prep).
- With no pending changesets, the action does nothing, pushes without changesets never publish.
- The "Version Packages" PR flow (changesets opens a version-bump PR) is the default cadence: merge changesets → merge the version PR → packages publish.

## Core's special rule

`@cunny-ai/core` is the only shared dependency. Policy:
- Task packages declare **`"@cunny-ai/core": "^0.x"` ranged, never `workspace:*`** in their published manifests (workspace protocol is rewritten at publish by pnpm, verify `pnpm publish` packing, or set the field explicitly in a publish prep step).
- A **core major** bumps every task package's minor at minimum (a `changeset`-driven batch PR), tested by CI before publish. Core stays small enough that this is rare.

## Registry (models) versioning

- The model registry ships inside `@cunny-ai/core` but is treated as **data**: every entry has an `id` + `revision`. Bumping a model revision = minor bump of core + a changeset noting which task packages are affected.
- Model URLs are content-hashed in the registry (sha256 pinning per the 000 spec), a model can never silently change under a published package.

## First releases (order)

1. `@cunny-ai/core` 0.1.0 (spike code, hardened: worker host, sha256 verify, error taxonomy, registry v2)
2. `@cunny-ai/provider-mediapipe` 0.1.0 (extracted from the face-detect spike's provider wiring)
3. `@cunny-ai/face-detect` 0.1.0 (already working, publish right after to validate the pipeline end-to-end with a real package)
3. Then per roadmap priority: 001 bg-remove → 002 embed → …

The first release uses the face-detect spike: it has a working browser test and no users yet.

## Checklists

**Per-release (PR):**
- [ ] Changeset present (package + bump + note)
- [ ] CI green: build, typecheck, publint, size gate
- [ ] If model registry touched: hashes pinned, affected packages' smoke tests updated

**Per-package first publish:**
- [ ] README with size table (package KB + first-load MB)
- [ ] `publishConfig.access = "public"`, repository/homepage fields
- [ ] LICENSE file (MIT) + model licenses in registry entry
- [ ] Playground example exists and is linked from README
