import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { ensureDshHome } from '../src/shared/dsh'
import { deepseekHarnessHomePath, deepseekHarnessLauncherPath, deepseekHarnessSourcePath } from '../server/deepseek-harness'

test('merges legacy dsh into .dsh, preserves conflicting data, and is repeatable', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-merge-'))
  const previousRoot = process.env.USB_LOBSTER_ROOT
  process.env.USB_LOBSTER_ROOT = root
  try {
    const home = join(root, '.dsh')
    const legacy = join(root, 'dsh')
    await mkdir(join(home, 'profiles'), { recursive: true })
    await mkdir(join(legacy, 'profiles'), { recursive: true })
    await mkdir(join(legacy, 'deepseek-harness'), { recursive: true })
    await writeFile(join(home, 'settings.yaml'), 'current: true\n')
    await writeFile(join(legacy, 'settings.yaml'), 'legacy: true\n')
    await writeFile(join(home, 'profiles', 'collision'), 'current profile')
    await mkdir(join(legacy, 'profiles', 'collision'))
    await writeFile(join(legacy, 'profiles', 'collision', 'old.txt'), 'old profile')
    await writeFile(join(legacy, '.credentials.yaml'), 'legacy credentials')
    for (const launcher of ['launch-deepseek-harness-windows.bat', 'launch-deepseek-harness-macos.command']) {
      await writeFile(join(legacy, launcher), 'launcher')
    }

    await ensureDshHome()
    assert.equal(existsSync(legacy), false)
    assert.equal(await readFile(join(home, 'settings.yaml'), 'utf8'), 'current: true\n')
    assert.equal(await readFile(join(home, '.credentials.yaml'), 'utf8'), 'legacy credentials')
    const backups = (await readdir(home)).filter(name => name.startsWith('legacy-dsh-'))
    assert.equal(backups.length, 1)
    assert.equal(await readFile(join(home, backups[0], 'settings.yaml'), 'utf8'), 'legacy: true\n')
    assert.equal(await readFile(join(home, backups[0], 'profiles', 'collision', 'old.txt'), 'utf8'), 'old profile')
    for (const platform of ['win32', 'darwin'] as const) {
      assert.equal(deepseekHarnessHomePath(platform), home)
      assert.equal(existsSync(deepseekHarnessLauncherPath(platform)), true)
    }
    assert.equal(deepseekHarnessSourcePath(), join(home, 'deepseek-harness'))
    await ensureDshHome()
    assert.deepEqual((await readdir(home)).filter(name => name.startsWith('legacy-dsh-')), backups)
  } finally {
    if (previousRoot === undefined) delete process.env.USB_LOBSTER_ROOT
    else process.env.USB_LOBSTER_ROOT = previousRoot
    await rm(root, { recursive: true, force: true })
  }
})
