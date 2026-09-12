import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'

test('portable packaging keeps manifests alongside built CLI files', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-pack-'))
  try {
    const build = join(root, 'build')
    const output = join(root, 'output')
    await mkdir(join(build, 'apps', 'cli', 'lib'), { recursive: true })
    const rootManifest = JSON.stringify({ private: true, type: 'module', workspaces: ['apps/*'] })
    const cliManifest = JSON.stringify({ name: '@deepseek-ai/dsh', version: '0.1.2', type: 'module' })
    await writeFile(join(build, 'package.json'), rootManifest)
    await writeFile(join(build, 'apps', 'cli', 'package.json'), cliManifest)
    await writeFile(join(build, 'apps', 'cli', 'lib', 'bin.js'), 'export {}')
    execFileSync(process.execPath, [fileURLToPath(new URL('../../.dsh/prepare-portable-packages.mjs', import.meta.url)), build, output])
    assert.equal(await readFile(join(output, 'package.json'), 'utf8'), rootManifest)
    assert.equal(await readFile(join(output, 'apps', 'cli', 'package.json'), 'utf8'), cliManifest)
    assert.equal(await readFile(join(output, 'apps', 'cli', 'lib', 'bin.js'), 'utf8'), 'export {}')
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
