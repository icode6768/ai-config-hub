import { cpSync, existsSync, globSync, mkdirSync, readFileSync, readdirSync, realpathSync } from 'node:fs'
import { basename, join, resolve } from 'node:path'

// Materialize built workspace packages for filesystems without symlink support.
const [buildArg, outputArg] = process.argv.slice(2)
if (!buildArg || !outputArg) throw new Error('Usage: node prepare-portable-packages.mjs BUILD_ROOT OUTPUT_ROOT')
const build = resolve(buildArg)
const output = resolve(outputArg)
if (build === output) throw new Error('Build and output directories must differ')
const excluded = new Set(['node_modules', '.git', 'tests', 'snapshots', 'stress-tests'])
const filter = path => !excluded.has(basename(path)) && !basename(path).startsWith('._') && !path.endsWith('.map') && !path.endsWith('.tsbuildinfo')
const manifest = JSON.parse(readFileSync(join(build, 'package.json')))
mkdirSync(output, { recursive: true })
cpSync(join(build, 'package.json'), join(output, 'package.json'))
let count = 0
for (const directory of globSync(manifest.workspaces, { cwd: build })) {
  const source = join(build, directory)
  const file = join(source, 'package.json')
  if (!existsSync(file)) continue
  const pkg = JSON.parse(readFileSync(file))
  if (!pkg.name) continue
  const target = join(output, 'node_modules', pkg.name)
  mkdirSync(target, { recursive: true })
  cpSync(source, target, { recursive: true, dereference: true, filter })
  // Some non-workspace dependencies have package-local versions.
  const localModules = join(source, 'node_modules')
  if (existsSync(localModules)) {
    const names = readdirSync(localModules).flatMap(name => name.startsWith('@')
      ? readdirSync(join(localModules, name)).map(child => `${name}/${child}`) : [name])
    for (const name of names) {
      if (name.startsWith('.') || !existsSync(join(localModules, name, 'package.json'))) continue
      const real = realpathSync(join(localModules, name))
      if (!real.includes('/node_modules/')) continue
      const destination = join(target, 'node_modules', name)
      mkdirSync(destination, { recursive: true })
      cpSync(real, destination, { recursive: true, dereference: true, filter: path => basename(path) !== '.bin' && !basename(path).startsWith('._') })
    }
  }
  for (const artifact of ['lib', 'dist']) {
    if (existsSync(join(source, artifact))) {
      mkdirSync(join(output, directory), { recursive: true })
      cpSync(file, join(output, directory, 'package.json'))
      cpSync(join(source, artifact), join(output, directory, artifact), { recursive: true, filter })
    }
  }
  count++
}
console.log(`Prepared ${count} workspace packages without symbolic links in ${output}`)
