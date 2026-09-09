import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync, cpSync, rmSync, realpathSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync, spawn } from 'node:child_process'

const home = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const source = basename(dirname(home)) === 'webui-apps' ? resolve(home, '..', '..', 'webui') : home
const root = dirname(source)
const target = join(root, 'webui-apps', `${process.platform}-${process.arch}`)
const directories = ['src', 'server', 'public', 'scripts']
const entries = ['package.json', 'package-lock.json', 'index.html', 'tsconfig.json', 'vite.config.ts', ...directories]
const env = { ...process.env, USB_LOBSTER_ROOT: root, WEBUI_RUNTIME_DIR: target }

function digest(files) {
  const hash = createHash('sha256')
  function visit(path, name) {
    if (!existsSync(path)) return
    const children = readdirSync(path, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))
    for (const child of children) {
      if (child.name.startsWith('._') || child.name === '.DS_Store') continue
      const relative = `${name}/${child.name}`
      if (child.isDirectory()) visit(join(path, child.name), relative)
      else if (child.isFile()) hash.update(relative).update('\0').update(readFileSync(join(path, child.name))).update('\0')
    }
  }
  for (const name of files) {
    const path = join(source, name)
    if (!existsSync(path)) continue
    if (directories.includes(name)) visit(path, name)
    else {
      const content = readFileSync(path)
      hash.update(name).update('\0').update(name.endsWith('.json') ? JSON.stringify(JSON.parse(content)) : content).update('\0')
    }
  }
  return hash.digest('hex')
}

function readStamp(name) {
  try { return readFileSync(join(target, name), 'utf8').trim() } catch { return '' }
}

function run(args, options = {}) {
  const result = spawnSync(process.execPath, args, { cwd: target, env, stdio: 'inherit', ...options })
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error(`Command failed (${result.status}): node ${args.join(' ')}`)
}

function npmCli() {
  const bin = dirname(process.execPath)
  const candidates = [
    join(bin, 'node_modules', 'npm', 'bin', 'npm-cli.js'),
    resolve(bin, '..', 'lib', 'node_modules', 'npm', 'bin', 'npm-cli.js'),
    process.env.npm_execpath,
  ]
  const cli = candidates.find(path => path && existsSync(path) && path.endsWith('npm-cli.js'))
  if (!cli) throw new Error('npm-cli.js not found beside the active Node runtime. Activate the portable runtime first.')
  return cli
}

function verifyDependencies() {
  const probe = "require('esbuild').transformSync('const n: number = 1', {loader:'ts'}); await import('vite'); await import('rollup');"
  run(['--import', 'tsx', '--input-type=module', '-e', `import {createRequire} from 'node:module'; const require=createRequire(import.meta.url); ${probe}`], { stdio: 'pipe' })
}

export function prepare() {
  mkdirSync(target, { recursive: true })
  console.log(`[webui] Runtime: ${target}`)
  const sourceHash = digest(entries)
  if (readStamp('.source-hash') !== sourceHash) {
    // Only these generated source paths are replaced; dependencies and user data stay separate.
    for (const name of entries) {
      rmSync(join(target, name), { recursive: true, force: true })
      if (existsSync(join(source, name))) cpSync(join(source, name), join(target, name), {
        recursive: true,
        filter: path => !path.split(/[\\/]/).some(part => part.startsWith('._') || part === '.DS_Store'),
      })
    }
    writeFileSync(join(target, '.source-hash'), sourceHash)
  }
  const dependenciesHash = digest(['package.json', 'package-lock.json'])
  const stamp = `${dependenciesHash}:${process.versions.modules}`
  let ready = readStamp('.dependencies-hash') === stamp
  if (ready) {
    try { verifyDependencies() } catch { ready = false }
  }
  if (!ready) {
    console.log('[webui] Installing dependencies for this platform...')
    rmSync(join(target, '.dependencies-hash'), { force: true })
    run([npmCli(), 'ci', '--include=dev', '--include=optional', '--no-audit', '--no-fund'])
    verifyDependencies()
    writeFileSync(join(target, '.dependencies-hash'), stamp)
  }
  const buildHash = `${sourceHash}:${stamp}`
  if (readStamp('.build-hash') !== buildHash || !existsSync(join(target, 'dist', 'index.html'))) {
    run([join(target, 'node_modules', 'vite', 'bin', 'vite.js'), 'build'])
    writeFileSync(join(target, '.build-hash'), buildHash)
  }
  return target
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    prepare()
    if (!process.argv.includes('--prepare')) {
      const child = spawn(process.execPath, ['--import', 'tsx', 'server/index.ts'], { cwd: target, env, stdio: 'inherit' })
      for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal))
      child.on('error', error => { console.error(error.message); process.exitCode = 1 })
      child.on('exit', (code, signal) => { process.exitCode = code ?? (signal === 'SIGINT' ? 130 : 1) })
    }
  } catch (error) {
    console.error(`[webui] ${error.message}`)
    process.exitCode = 1
  }
}
