import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { chmod, copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { deepseekPackageManagerCommand } from '../server/deepseek-wechat'

test('macOS qrcode installation uses Corepack instead of global pnpm', () => {
  assert.deepEqual(deepseekPackageManagerCommand('darwin'), {
    command: 'corepack', args: ['pnpm', 'add', 'qrcode', '-w'], shell: false,
  })
  assert.deepEqual(deepseekPackageManagerCommand('win32'), {
    command: 'pnpm.cmd', args: ['add', 'qrcode', '-w'], shell: true,
  })
})

test('macOS launcher prefers Corepack even when a broken pnpm is on PATH', { skip: process.platform !== 'darwin' }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-corepack-'))
  try {
    const home = join(root, '.dsh')
    const source = join(home, 'deepseek-harness')
    const bin = join(root, 'runtime', 'macos', 'bin')
    const cliDependency = join(source, 'apps', 'cli', 'node_modules', '@deepseek-ai', 'dsh-app-boot')
    const bootDependency = join(source, 'packages', 'boot', 'app-boot', 'node_modules', '@deepseek-ai', 'cordis')
    await mkdir(join(source, 'apps', 'cli', 'lib'), { recursive: true })
    await mkdir(join(source, 'packages', 'util', 'http-proxy', 'lib'), { recursive: true })
    await mkdir(join(source, 'packages', 'api', 'job-controller', 'lib'), { recursive: true })
    await mkdir(bin, { recursive: true })
    await writeFile(join(source, 'apps', 'cli', 'lib', 'bin.js'), '')
    await writeFile(join(source, 'pnpm-workspace.yaml'), 'packages: []\n')
    const launcher = join(home, 'launch.command')
    await copyFile(new URL('../../.dsh/launch-deepseek-harness-macos.command', import.meta.url), launcher)
    await writeFile(join(bin, 'pnpm'), '#!/bin/sh\necho "Cannot verify the identity" >&2\nexit 1\n')
    await writeFile(join(bin, 'corepack'), `#!/bin/sh\nprintf '%s\\n' "$*" >> '${join(root, 'command')}'\nmkdir -p '${cliDependency}' '${bootDependency}' '${join(source, 'apps', 'cli', 'lib')}' '${join(source, 'packages', 'util', 'http-proxy', 'lib')}' '${join(source, 'packages', 'api', 'job-controller', 'lib')}'\nprintf '{}' > '${cliDependency}/package.json'\nprintf '{}' > '${bootDependency}/package.json'\ncase "$*" in *'run build'*) printf '{}' > '${join(source, 'apps', 'cli', 'lib', 'profile-boot.js')}' ; printf '{}' > '${join(source, 'packages', 'util', 'http-proxy', 'lib', 'index.js')}' ; printf '{}' > '${join(source, 'packages', 'api', 'job-controller', 'lib', 'client.js')}' ;; esac\n`)
    await writeFile(join(bin, 'node'), '#!/bin/sh\necho harness-started\n')
    for (const name of ['node', 'pnpm', 'corepack']) await chmod(join(bin, name), 0o755)
    const output = execFileSync('/bin/zsh', [launcher], { encoding: 'utf8', timeout: 10000 })
    assert.match(output, /harness-started/)
    const commands = await readFile(join(root, 'command'), 'utf8')
    assert.match(commands, /^pnpm install --frozen-lockfile=false$/m)
    assert.match(commands, /pnpm run build$/m)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
