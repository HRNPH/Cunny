// Post-process typedoc output: flatten the `src` path segment and map README.md
// to index.md so VitePress directory links resolve.
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, renameSync } from 'node:fs'
import { join } from 'node:path'

const out = 'docs/api'
if (!existsSync(out)) throw new Error('docs/api missing — run typedoc first')

for (const entry of readdirSync(out, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue
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
}

const root = join(out, 'README.md')
if (existsSync(root)) renameSync(root, join(out, 'index.md'))
console.log('api docs flattened')
