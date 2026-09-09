import test from 'node:test'
import assert from 'node:assert/strict'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync, realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const source = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const platform = `${process.platform}-${process.arch}`
const prepared = join(dirname(source), 'webui-apps', platform)

test('isolated runtime reuses dependencies, refreshes sources and preserves shared data', () => {
  assert.ok(existsSync(join(prepared, '.dependencies-hash')), 'Run npm run prepare:portable first')
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'webui portable test-')))
  try {
    const webui = join(root, 'webui')
    const target = join(root, 'webui-apps', platform)
    mkdirSync(join(webui, 'scripts'), { recursive: true })
    mkdirSync(join(webui, 'src'))
    mkdirSync(join(webui, 'server'))
    mkdirSync(target, { recursive: true })
    for (const name of ['package.json', 'package-lock.json', 'tsconfig.json', 'vite.config.ts']) cpSync(join(source, name), join(webui, name))
    cpSync(join(source, 'scripts', 'launch-portable.mjs'), join(webui, 'scripts', 'launch-portable.mjs'))
    symlinkSync(join(prepared, 'node_modules'), join(target, 'node_modules'), 'junction')
    cpSync(join(prepared, '.dependencies-hash'), join(target, '.dependencies-hash'))
    writeFileSync(join(root, 'config.yaml'), 'shared: preserved\n')
    const other = join(root, 'webui-apps', 'other-platform')
    mkdirSync(other)
    writeFileSync(join(other, 'sentinel'), 'untouched')
    writeFileSync(join(webui, 'index.html'), '<html><body><script type="module" src="/src/main.ts"></script></body></html>')
    writeFileSync(join(webui, 'src', 'main.ts'), 'document.body.textContent = "first"')
    writeFileSync(join(webui, 'src', 'obsolete.ts'), 'export const old = true')
    writeFileSync(join(webui, 'server', 'index.ts'), 'console.log(JSON.stringify({root:process.env.USB_LOBSTER_ROOT, runtime:process.env.WEBUI_RUNTIME_DIR}))')
    const launch = (...args) => {
      const result = spawnSync(process.execPath, [join(webui, 'scripts', 'launch-portable.mjs'), ...args], { cwd: tmpdir(), encoding: 'utf8', timeout: 60000 })
      assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`)
      assert.doesNotMatch(result.stdout, /Installing dependencies/)
      return result.stdout
    }
    launch('--prepare')
    assert.ok(existsSync(join(target, 'dist', 'index.html')))
    const firstBuild = statSync(join(target, '.build-hash')).mtimeMs
    launch('--prepare')
    assert.equal(statSync(join(target, '.build-hash')).mtimeMs, firstBuild)
    const lock = join(webui, 'package-lock.json')
    writeFileSync(lock, readFileSync(lock, 'utf8').replace(/\r?\n/g, '\r\n'))
    launch('--prepare')
    assert.equal(statSync(join(target, '.build-hash')).mtimeMs, firstBuild)
    rmSync(join(webui, 'src', 'obsolete.ts'))
    writeFileSync(join(webui, 'src', 'main.ts'), 'document.body.textContent = "updated"')
    launch('--prepare')
    assert.ok(!existsSync(join(target, 'src', 'obsolete.ts')))
    assert.match(readFileSync(join(target, 'src', 'main.ts'), 'utf8'), /updated/)
    const output = launch()
    assert.ok(output.includes(JSON.stringify({ root, runtime: target })))
    assert.equal(readFileSync(join(root, 'config.yaml'), 'utf8'), 'shared: preserved\n')
    assert.equal(readFileSync(join(other, 'sentinel'), 'utf8'), 'untouched')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
