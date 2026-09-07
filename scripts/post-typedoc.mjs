// Post-process typedoc output: flatten the `src` path segment, map README.md
// to index.md so VitePress directory links resolve, and inject each
// package's module TSDoc as the page intro (typedoc only renders module
// comments on single-entry projects, not per-package pages).
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const out = 'docs/api'
if (!existsSync(out)) throw new Error('docs/api missing — run typedoc first')

/** Extract the leading /** ... *\/ block of a package entry and return it as markdown. */
function moduleOverview(pkgName) {
  const entry = `packages/${pkgName}/src/index.ts`
  if (!existsSync(entry)) return null
  const src = readFileSync(entry, 'utf8')
  const m = src.match(/^\/\*\*([\s\S]*?)\*\//)
  if (!m) return null
  const lines = m[1]
    .split('\n')
    .map((l) => l.replace(/^\s*\* ?/, '').trimEnd())
    .filter((l) => l.trim() !== '@example')
  return lines.join('\n').trim()
}

for (const entry of readdirSync(out, { withFileTypes: true })) {
  if (!entry.isDirectory() || entry.name === '_media') continue
  const pkg = join(out, entry.name)
  const src = join(pkg, 'src')
  if (existsSync(src)) {
    const tmp = join(out, `.${entry.name}.tmp`)
    mkdirSync(tmp)
    for (const item of readdirSync(src)) {
      cpSync(join(src, item), join(tmp, item), { recursive: true })
    }
    rmSync(pkg, { recursive: true })
    renameSync(tmp, pkg)
  }
  const readme = join(pkg, 'README.md')
  if (existsSync(readme)) renameSync(readme, join(pkg, 'index.md'))

  const index = join(pkg, 'index.md')
  if (!existsSync(index)) continue
  const overview = moduleOverview(entry.name)
  if (!overview) continue
  const body = readFileSync(index, 'utf8')
  if (body.includes('## Interfaces') || body.includes('## Functions') || body.includes('## Type Aliases') || body.includes('## Variables')) {
    // insert after the page title line
    const lines = body.split('\n')
    const titleAt = lines.findIndex((l) => l.startsWith('# '))
    lines.splice(titleAt + 1, 0, '', overview)
    writeFileSync(index, lines.join('\n'))
  }
}

const root = join(out, 'README.md')
if (existsSync(root)) renameSync(root, join(out, 'index.md'))
console.log('api docs flattened + overviews injected')
