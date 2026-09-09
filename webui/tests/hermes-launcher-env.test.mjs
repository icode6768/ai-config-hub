import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, copyFileSync, writeFileSync, rmSync, realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { spawnSync } from 'node:child_process'

test('Hermes child uses the launcher Node even when the inherited PATH has no Node', { skip: process.platform === 'win32' }, () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'hermes-launcher-')))
  try {
    const scripts = join(root, 'webui', 'scripts')
    const venv = join(root, '.hermes', 'venvs', `${process.platform}-${process.arch}`)
    mkdirSync(scripts, { recursive: true })
    mkdirSync(join(root, '.hermes', 'hermes-agent'), { recursive: true })
    mkdirSync(join(venv, 'bin'), { recursive: true })
    copyFileSync(new URL('../scripts/launch-hermes.mjs', import.meta.url), join(scripts, 'launch-hermes.mjs'))
    writeFileSync(join(venv, 'pyvenv.cfg'), 'version = 3.11.9\n')
    // Stand in for Python to inspect the actual spawned child's environment.
    writeFileSync(join(venv, 'bin', 'python'), '#!/bin/sh\nexec node -p "JSON.stringify({node:process.execPath,path:process.env.PATH})"\n', { mode: 0o755 })
    const result = spawnSync(process.execPath, [join(scripts, 'launch-hermes.mjs'), 'desktop'], {
      env: { ...process.env, PATH: '/usr/bin:/bin' }, encoding: 'utf8', timeout: 10000,
    })
    assert.equal(result.status, 0, result.stderr)
    const child = JSON.parse(result.stdout)
    assert.equal(child.node, process.execPath)
    assert.deepEqual(child.path.split(':').slice(0, 2), [join(venv, 'bin'), dirname(process.execPath)])
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
