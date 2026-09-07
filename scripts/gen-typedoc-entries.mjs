// Rewrite typedoc.json entryPoints from packages/*/src/index.ts so the API
// reference can never drift from the packages that exist.
import { readdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const pkgs = readdirSync('packages', { withFileTypes: true })
  .filter((d) => d.isDirectory() && existsSync(join('packages', d.name, 'src', 'index.ts')))
  .map((d) => `packages/${d.name}/src/index.ts`)
  .sort()

const config = JSON.parse(readFileSync('typedoc.json', 'utf8'))
config.entryPoints = pkgs
writeFileSync('typedoc.json', JSON.stringify(config, null, 2) + '\n')

const tsconfig = JSON.parse(readFileSync('tsconfig.typedoc.json', 'utf8'))
tsconfig.include = pkgs.map((e) => e.replace('/index.ts', ''))
writeFileSync('tsconfig.typedoc.json', JSON.stringify(tsconfig, null, 2) + '\n')

console.log(`entryPoints: ${pkgs.length} packages`)
