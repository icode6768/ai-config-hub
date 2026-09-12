import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { detectRuntimeVersions } from '../src/shared/runtime'

test('detects a portable Harness without version metadata, but not an empty install', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-detection-'))
  const previousRoot = process.env.USB_LOBSTER_ROOT
  process.env.USB_LOBSTER_ROOT = root
  try {
    const home = join(root, '.dsh')
    const cli = join(home, 'deepseek-harness', 'apps', 'cli')
    await mkdir(join(cli, 'lib'), { recursive: true })
    const launcher = process.platform === 'win32'
      ? 'launch-deepseek-harness-windows.bat' : 'launch-deepseek-harness-macos.command'
    await writeFile(join(home, launcher), 'launcher')
    assert.equal((await detectRuntimeVersions()).deepseekHarness.available, false)
    await writeFile(join(cli, 'lib', 'bin.js'), 'entry')
    assert.deepEqual((await detectRuntimeVersions()).deepseekHarness, { available: true, version: '未知（便携版）' })
    await writeFile(join(cli, 'package.json'), JSON.stringify({ version: '0.1.2' }))
    assert.deepEqual((await detectRuntimeVersions()).deepseekHarness, { available: true, version: '0.1.2' })
  } finally {
    if (previousRoot === undefined) delete process.env.USB_LOBSTER_ROOT
    else process.env.USB_LOBSTER_ROOT = previousRoot
    await rm(root, { recursive: true, force: true })
  }
})
