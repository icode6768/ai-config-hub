import { execFile as execFileCallback } from 'node:child_process'
import { existsSync } from 'node:fs'
import { delimiter, join } from 'node:path'
import { promisify } from 'node:util'
import { readFile, readdir } from 'node:fs/promises'
import { parse as parseToml } from '@iarna/toml'
import { rootPath, runtimeBinPath, runtimeNodeVersionsPath, runtimeNpmGlobalPath, runtimePythonPath } from './paths'

const execFile = promisify(execFileCallback)

export interface RuntimeVersion {
  version: string
  available: boolean
}

export interface RuntimeVersions {
  node: RuntimeVersion
  python: RuntimeVersion
  openclaw: RuntimeVersion
  claude: RuntimeVersion
  codex: RuntimeVersion
  hermes: RuntimeVersion
  deepseekHarness: RuntimeVersion
}

const unavailable = (): RuntimeVersion => ({ version: '未找到', available: false })

export function parseVersionOutput(output: string): string {
  const firstLine = output.split(/\r?\n/).map(line => line.trim()).find(Boolean) ?? ''
  const match = firstLine.match(/v?\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?/)
  return match?.[0] ?? firstLine
}

export function versionFromJson(raw: string): string | null {
  try {
    const parsed = JSON.parse(raw) as { version?: unknown }
    return typeof parsed.version === 'string' && parsed.version ? parsed.version : null
  } catch {
    return null
  }
}

export function versionFromToml(raw: string): string | null {
  try {
    const parsed = parseToml(raw) as { version?: unknown; project?: { version?: unknown } }
    const version = parsed.project?.version ?? parsed.version
    return typeof version === 'string' && version ? version : null
  } catch {
    return null
  }
}

async function versionFromCommand(command: string): Promise<RuntimeVersion> {
  try {
    const result = await execFile(command, ['--version'], {
      cwd: rootPath(),
      env: runtimeEnvironment(),
      timeout: 5000,
      windowsHide: true,
    })
    const version = parseVersionOutput(`${result.stdout}\n${result.stderr}`)
    return version ? { version, available: true } : unavailable()
  } catch {
    return unavailable()
  }
}

async function versionFromMetadata(filePath: string, parser: (raw: string) => string | null): Promise<RuntimeVersion> {
  try {
    const version = parser(await readFile(filePath, 'utf8'))
    return version ? { version, available: true } : unavailable()
  } catch {
    return unavailable()
  }
}

function runtimeEnvironment(): NodeJS.ProcessEnv {
  const pathEntries = process.platform === 'win32'
    ? [runtimeBinPath(), runtimeNpmGlobalPath(), runtimeNodeVersionsPath()]
    : [runtimeBinPath(), join(runtimeNpmGlobalPath(), 'bin')]
  const entries = [
    ...pathEntries,
    process.env.PATH ?? process.env.Path ?? '',
  ].filter(Boolean)
  return {
    ...process.env,
    PATH: entries.join(delimiter),
  }
}

async function latestVersionDirectory(relativePath: string): Promise<string | null> {
  try {
    const entries = await readdir(join(rootPath(), relativePath), { withFileTypes: true })
    const versions = entries.filter(entry => entry.isDirectory()).map(entry => entry.name).sort()
    return versions.at(-1) ?? null
  } catch {
    return null
  }
}

async function nodeRuntimeVersion(): Promise<RuntimeVersion> {
  const versionDirectory = process.platform === 'win32' ? await latestVersionDirectory(join('runtime', 'windows', 'node', 'versions')) : null
  if (versionDirectory) {
    const executable = join(runtimeNodeVersionsPath(), versionDirectory, 'node.exe')
    if (existsSync(executable)) return { version: versionDirectory, available: true }
  }
  return versionFromCommand(process.platform === 'win32' ? 'node.exe' : 'node')
}

async function pythonRuntimeVersion(): Promise<RuntimeVersion> {
  if (process.platform !== 'win32') return versionFromCommand('python3')
  try {
    const configuredVersion = (await readFile(join(runtimePythonPath(), 'default.txt'), 'utf8')).trim()
    const executable = join(runtimePythonPath(), 'versions', configuredVersion, 'python.exe')
    if (configuredVersion && existsSync(executable)) return { version: configuredVersion, available: true }
  } catch {
    // Fall back to the host Python when the portable runtime is absent.
  }
  return versionFromCommand(process.platform === 'win32' ? 'python.exe' : 'python3')
}

async function packageVersion(relativePaths: string[], fallbackCommand?: string): Promise<RuntimeVersion> {
  for (const relativePath of relativePaths) {
    const result = await versionFromMetadata(join(rootPath(), relativePath), versionFromJson)
    if (result.available) return result
  }
  return fallbackCommand ? versionFromCommand(fallbackCommand) : unavailable()
}

export async function detectRuntimeVersions(): Promise<RuntimeVersions> {
  const root = rootPath()
  const node = await nodeRuntimeVersion()
  const python = await pythonRuntimeVersion()
  const [openclaw, claude, codex, hermes, deepseekHarness] = await Promise.all([
    packageVersion([
      process.platform === 'win32' ? 'runtime/windows/npm-global/node_modules/openclaw/package.json' : 'runtime/macos/nvm/npm-global/lib/node_modules/openclaw/package.json',
      'node_modules/openclaw/package.json',
    ], process.platform === 'win32' ? join(runtimeNpmGlobalPath(), 'openclaw.cmd') : 'openclaw'),
    packageVersion([
      process.platform === 'win32' ? 'runtime/windows/npm-global/node_modules/@anthropic-ai/claude-code/package.json' : 'runtime/macos/nvm/npm-global/lib/node_modules/@anthropic-ai/claude-code/package.json',
      'node_modules/@anthropic-ai/claude-code/package.json',
    ], process.platform === 'win32' ? join(runtimeNpmGlobalPath(), 'claude.cmd') : 'claude'),
    packageVersion([
      process.platform === 'win32' ? 'runtime/windows/npm-global/node_modules/@openai/codex/package.json' : 'runtime/macos/nvm/npm-global/lib/node_modules/@openai/codex/package.json',
      'node_modules/@openai/codex/package.json',
    ], process.platform === 'win32' ? join(runtimeNpmGlobalPath(), 'codex.cmd') : 'codex'),
    versionFromMetadata(join(root, '.hermes', 'hermes-agent', 'pyproject.toml'), versionFromToml),
    packageVersion([
      '.dsh/deepseek-harness/apps/cli/package.json',
      '.dsh/deepseek-harness/package.json',
      'dsh/deepseek-harness/apps/cli/package.json',
      'dsh/deepseek-harness/package.json',
      'deepseek-harness/deepseek-harness/apps/cli/package.json',
      'deepseek-harness/deepseek-harness/package.json',
    ], process.platform === 'win32' ? join(runtimeNpmGlobalPath(), 'dsh.cmd') : 'dsh'),
  ])
  return { node, python, openclaw, claude, codex, hermes, deepseekHarness }
}

export async function runtimeNodeVersionDirectory(): Promise<string | null> {
  if (process.platform !== 'win32') return null
  return latestVersionDirectory(join('runtime', 'windows', 'node', 'versions'))
}
