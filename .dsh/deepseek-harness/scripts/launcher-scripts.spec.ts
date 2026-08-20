import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

describe('desktop launchers', () => {
  it('contains the Windows launcher and shortcut creator contracts', async () => {
    const launcher = await readFile('scripts/launch-dsh-web.ps1', 'utf8')
    const shortcut = await readFile('scripts/create-dsh-shortcut.ps1', 'utf8')

    expect(launcher).toContain('pnpm.cmd')
    expect(launcher).toContain("Invoke-Pnpm @('install', '--frozen-lockfile')")
    expect(launcher).toContain("Invoke-Pnpm @('run', 'build')")
    expect(launcher).toContain('Repair-ManagedProfileFallback')
    expect(launcher).toContain('DSH_HOME')
    expect(launcher).toContain('dsh web:')
    expect(launcher).toContain('Start-Process')
    expect(launcher).toContain('taskkill')
    expect(shortcut).toContain('WScript.Shell')
    expect(shortcut).toContain('DeepSeek Harness Web.lnk')
  })

  it('contains the macOS launcher contracts', async () => {
    const launcher = await readFile('scripts/launch-dsh-web.command', 'utf8')

    expect(launcher).toContain('dsh web')
    expect(launcher).toContain('install --frozen-lockfile')
    expect(launcher).toContain('run build')
    expect(launcher).toContain('profiles/node_modules')
    expect(launcher).toContain('DSH_HOME')
    expect(launcher).toContain('dsh web:')
    expect(launcher).toContain('open "$url"')
    expect(launcher).toContain('kill -- -"$child"')
  })
})
