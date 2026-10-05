import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { get as httpGet } from 'node:http'
import { execFile as execFileCallback, spawn, type ChildProcess } from 'node:child_process'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { promisify } from 'node:util'
import { APP_IDS, APP_LABELS, type AppId, type AppRuntimeStatus, type LauncherConfig, type RuntimeVersions } from '../src/shared/types'
import { dshHomePath, rootPath, runtimeBinPath, runtimeNodeVersionsPath, runtimeNpmGlobalPath, runtimePythonPath, runtimeScriptsPath } from '../src/shared/paths'
import { detectRuntimeVersions } from '../src/shared/runtime'
import { deepseekHarnessHomePath, deepseekHarnessLauncherPath, deepseekHarnessSourcePath, isDeepseekHarnessWebReady, startDeepseekHarness, stopDeepseekHarness } from './deepseek-harness'

const execFile = promisify(execFileCallback)
const children = new Map<AppId, ChildProcess>()
const phases = new Map<AppId, AppRuntimeStatus['phase']>()
const errors = new Map<AppId, string>()
const DEEPSEEK_HARNESS_REMOTE = 'https://github.com/deepseek-ai/deepseek-harness.git'

type CommandSpec = { command: string; args: string[]; cwd: string; env?: NodeJS.ProcessEnv }

function runtimePathEntries(): string[] {
  const root = rootPath()
  const nodeDirectory = latestRuntimeNodeDirectory()
  // 顺序必须与 activate.cmd 一致：node.exe 真实目录要排在 runtime\windows\bin 之前。
  // npm 生成的 .cmd shim（如 openclaw.cmd）会以带引号方式调用 "node"，
  // 此时若命中 runtime\windows\bin\node.cmd 自定位 wrapper，cmd 会把 %~dp0 误解析成
  // 当前工作目录（而非 wrapper 所在目录），导致 "Node.js not found"。
  // node 目录排最前可让 "node" 直接命中真实 node.exe，绕过该 wrapper。
  const platformPaths = process.platform === 'win32'
    ? [runtimeNpmGlobalPath(), runtimeBinPath()]
    : [join(runtimeNpmGlobalPath(), 'bin'), runtimeBinPath()]
  return [
    ...(nodeDirectory ? [nodeDirectory] : []),
    ...platformPaths,
    join(root, 'runtime', process.platform === 'darwin' ? 'macos' : 'windows', 'npm-global', 'bin'),
    join(root, '.hermes', 'bin'),
  ].filter(Boolean)
}

function runtimeEnv(config?: LauncherConfig): NodeJS.ProcessEnv {
  const pathEntries = [
    ...runtimePathEntries(),
    process.env.PATH ?? process.env.Path ?? '',
  ].filter(Boolean)
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    PATH: pathEntries.join(process.platform === 'win32' ? ';' : ':'),
    COREPACK_ENABLE_STRICT: '0',
    DSH_HOME: dshHomePath(),
    HERMES_HOME: join(rootPath(), '.hermes'),
  }
  delete env.DONGCHUANGAI_KEY
  if (config) {
    env.OPENCLAW_CONFIG_PATH = config.global.launch.openclawConfigPath
    env.OPENCLAW_STATE_DIR = config.global.launch.openclawStateDir
    env.DONGCHUANGAI_API_KEY = config.global.api.apiKey
    env.DEEPSEEK_API_KEY = config.global.api.apiKey
    const hostname = (() => {
      try { return new URL(config.global.api.baseUrl).hostname }
      catch { return '' }
    })()
    if (hostname) {
      const normalizedHostname = hostname.replace(/^api\./i, '')
      const keyEnv = `HERMES_CUSTOM_API_${normalizedHostname.toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '')}_API_KEY`
      env[keyEnv] = config.global.api.apiKey
    }
  }
  return env
}

function latestRuntimeNodeDirectory(): string | null {
  if (process.platform !== 'win32') return null
  const base = runtimeNodeVersionsPath()
  try {
    const version = readdirSync(base, { withFileTypes: true })
      .filter(entry => entry.isDirectory())
      .map(entry => entry.name)
      .sort()
      .at(-1)
    return version ? join(base, version) : null
  } catch {
    return null
  }
}

function firstExisting(paths: string[]): string | null {
  return paths.find(path => existsSync(path)) ?? null
}

function npmCommand(): string {
  const root = rootPath()
  const nodeDirectory = latestRuntimeNodeDirectory()
  return firstExisting([
    nodeDirectory ? join(nodeDirectory, process.platform === 'win32' ? 'npm.cmd' : 'bin/npm') : '',
    process.platform === 'win32' ? 'npm.cmd' : 'npm',
  ]) ?? (process.platform === 'win32' ? 'npm.cmd' : 'npm')
}

function portableNodeCommand(): string | null {
  if (process.platform === 'darwin') return firstExisting([join(runtimeBinPath(), 'node')])
  const nodeDirectory = latestRuntimeNodeDirectory()
  if (!nodeDirectory) return null
  return firstExisting([
    join(nodeDirectory, process.platform === 'win32' ? 'node.exe' : 'bin/node'),
    join(nodeDirectory, process.platform === 'win32' ? 'node.exe' : 'node'),
  ])
}

function pythonCommand(): string {
  if (process.platform !== 'win32') return 'python3'
  const configured = join(runtimePythonPath(), 'default.txt')
  // The portable runtime keeps the selected version in default.txt. If it is
  // absent, the host interpreter is still a valid fallback for Hermes.
  try {
    const version = readFileSync(configured, 'utf8').trim()
    const portable = join(runtimePythonPath(), 'versions', version, 'python.exe')
    if (existsSync(portable)) return portable
  } catch {
    // Fall through to the platform interpreter.
  }
  return process.platform === 'win32' ? 'python.exe' : 'python3'
}

function hermesPythonCommand(): string {
  const root = rootPath()
  const venvPython = join(root, '.hermes', 'hermes-agent', 'venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python')
  return firstExisting([venvPython, pythonCommand()]) ?? pythonCommand()
}

function packageCommand(name: 'openclaw' | 'claude' | 'codex'): string | null {
  if (process.platform !== 'win32') {
    return firstExisting([
      join(runtimeNpmGlobalPath(), 'bin', name),
      join(runtimeNpmGlobalPath(), 'lib', 'node_modules', '.bin', name),
    ]) ?? name
  }
  const extension = process.platform === 'win32' ? '.cmd' : ''
  return firstExisting([
    join(runtimeNpmGlobalPath(), `${name}${extension}`),
    join(runtimeNpmGlobalPath(), 'node_modules', '.bin', `${name}${extension}`),
  ])
}

function hermesCommand(): CommandSpec | null {
  const root = rootPath()
  const source = join(root, '.hermes', 'hermes-agent')
  const launcher = join(root, 'webui', 'scripts', 'launch-hermes.mjs')
  if (existsSync(launcher)) return { command: process.execPath, args: [launcher, 'desktop'], cwd: source }
  const direct = firstExisting([
    join(source, 'venv', process.platform === 'win32' ? 'Scripts/hermes.exe' : 'bin/hermes'),
    join(source, '.venv', process.platform === 'win32' ? 'Scripts/hermes.exe' : 'bin/hermes'),
    join(root, '.hermes', 'bin', process.platform === 'win32' ? 'hermes.exe' : 'hermes'),
    join(root, '.hermes', 'bin', process.platform === 'win32' ? 'hermes-agent.exe' : 'hermes-agent'),
  ])
  if (direct) return { command: direct, args: ['desktop'], cwd: source }
  if (existsSync(join(source, 'pyproject.toml'))) {
    return { command: pythonCommand(), args: ['-m', 'hermes_cli.main', 'desktop'], cwd: source }
  }
  return null
}

function commandFor(appId: AppId, config: LauncherConfig): CommandSpec | null {
  const root = rootPath()
  if (appId === 'openclaw') {
    const node = portableNodeCommand()
    const entrypoint = process.platform === 'darwin'
      ? join(runtimeNpmGlobalPath(), 'lib', 'node_modules', 'openclaw', 'openclaw.mjs')
      : join(runtimeNpmGlobalPath(), 'node_modules', 'openclaw', 'openclaw.mjs')
    if (node && existsSync(entrypoint)) {
      return { command: node, args: [entrypoint, 'gateway', 'run'], cwd: root, env: runtimeEnv(config) }
    }
    const command = packageCommand('openclaw')
    return command ? { command, args: ['gateway', 'run'], cwd: root, env: runtimeEnv(config) } : null
  }
  if ((appId as string) === 'hermes') {
    const command = hermesCommand()
    return command ? { ...command, env: runtimeEnv(config) } : null
  }
  if (appId === 'claude') {
    const command = packageCommand('claude')
    return command ? { command, args: [], cwd: root, env: runtimeEnv(config) } : null
  }
  if (appId === 'codex') {
    const command = packageCommand('codex')
    return command ? { command, args: [], cwd: root, env: runtimeEnv(config) } : null
  }
  const launcher = deepseekHarnessLauncherPath()
  if (!existsSync(launcher)) return null
  return {
    command: process.platform === 'win32' ? launcher : 'zsh',
    args: process.platform === 'win32' ? [] : [launcher],
    cwd: deepseekHarnessHomePath(),
    env: runtimeEnv(config),
  }
}

async function repairOpenclawState(config: LauncherConfig): Promise<void> {
  const database = join(config.global.launch.openclawStateDir, 'state', 'openclaw.sqlite')
  if (!existsSync(database)) return
  const marker = join(config.global.launch.openclawStateDir, '.startup-doctor-version')
  const packagePath = process.platform === 'darwin'
    ? join(runtimeNpmGlobalPath(), 'lib', 'node_modules', 'openclaw', 'package.json')
    : join(runtimeNpmGlobalPath(), 'node_modules', 'openclaw', 'package.json')
  let version = 'unknown'
  try {
    const packageJson = JSON.parse(readFileSync(packagePath, 'utf8')) as { version?: unknown }
    if (typeof packageJson.version === 'string') version = packageJson.version
  } catch {
    // The command itself remains the source of truth if package metadata is unavailable.
  }
  const signature = version
  try {
    if (readFileSync(marker, 'utf8').trim() === signature) return
  } catch {
    // Run the repair when the marker does not exist yet.
  }
  const spec = commandFor('openclaw', config)
  if (!spec) return
  const args = spec.args[0]?.endsWith('.mjs')
    ? [spec.args[0], 'doctor', '--fix']
    : ['doctor', '--fix']
  await runCommand(spec.command, args, spec.cwd, spec.env)
  writeFileSync(marker, `${version}\n`, 'utf8')
}

function kindFor(appId: AppId): AppRuntimeStatus['kind'] {
  if (appId === 'hermes' || appId === 'claude' || appId === 'codex') return 'cli'
  if (appId === 'deepseek-harness') return 'bridge'
  return 'web'
}

function isAlive(child: ChildProcess | undefined): boolean {
  return Boolean(child && child.exitCode === null && child.signalCode === null)
}

function pipeOutput(appId: AppId, child: ChildProcess): void {
  child.stdout?.on('data', chunk => process.stdout.write(`[${APP_LABELS[appId]}] ${chunk}`))
  child.stderr?.on('data', chunk => process.stderr.write(`[${APP_LABELS[appId]}] ${chunk}`))
  child.once('error', error => errors.set(appId, error.message))
  child.once('exit', (code, signal) => {
    children.delete(appId)
    if (code !== 0 && signal === null) errors.set(appId, `进程退出，代码 ${code}`)
    if (phases.get(appId) === 'starting') phases.set(appId, 'error')
  })
}

function spawnSpec(appId: AppId, spec: CommandSpec): ChildProcess {
  const child = spawn(spec.command, spec.args, {
    cwd: spec.cwd,
    env: spec.env ?? runtimeEnv(),
    detached: process.platform !== 'win32',
    shell: process.platform === 'win32' && spec.command.toLowerCase().endsWith('.cmd'),
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  })
  pipeOutput(appId, child)
  children.set(appId, child)
  return child
}

function probeUrl(target: string): Promise<boolean> {
  try {
    const parsed = new URL(target)
    return new Promise(resolve => {
      const request = httpGet({ hostname: parsed.hostname, port: parsed.port || 80, path: parsed.pathname || '/', timeout: 800 }, (response) => {
        response.resume()
        resolve((response.statusCode ?? 500) < 500)
      })
      request.on('timeout', () => { request.destroy(); resolve(false) })
      request.on('error', () => resolve(false))
    })
  } catch {
    return Promise.resolve(false)
  }
}

async function listeningPids(target: string): Promise<number[]> {
  try {
    const port = new URL(target).port
    if (!port) return []
    if (process.platform === 'win32') {
      const result = await execFile('netstat.exe', ['-ano'], { windowsHide: true })
      return result.stdout
        .split(/\r?\n/)
        .filter(line => line.includes(`:${port}`) && /LISTENING\s+\d+/.test(line))
        .map(line => line.trim().split(/\s+/).at(-1) ?? '')
        .map(value => Number(value))
        .filter(value => Number.isInteger(value) && value > 0)
    }
    const result = await execFile('lsof', ['-ti', `:${port}`])
    return result.stdout.split(/\r?\n/).map(value => Number(value.trim())).filter(value => Number.isInteger(value) && value > 0)
  } catch {
    return []
  }
}

function installedFor(appId: AppId, versions: RuntimeVersions): boolean {
  if (appId === 'openclaw') return versions.openclaw.available
  if (appId === 'hermes') return versions.hermes.available || Boolean(hermesCommand())
  if (appId === 'claude') return versions.claude.available
  if (appId === 'codex') return versions.codex.available
  return versions.deepseekHarness.available || existsSync(join(deepseekHarnessSourcePath(), 'package.json'))
}

function phaseMessage(appId: AppId, phase: AppRuntimeStatus['phase'], installed: boolean, webReady: boolean): string {
  if (!installed) return '未安装或未找到启动命令'
  if (phase === 'updating') return '更新中...'
  if (phase === 'starting') return '启动中...'
  if (phase === 'stopping') return '停止中...'
  if (phase === 'error') return errors.get(appId) ?? '启动失败'
  if (webReady) return '网页服务运行中'
  if (kindFor(appId) === 'cli') return 'CLI 已安装，按需打开终端运行'
  return '已停止'
}

export function resolveRuntimePhase(phase: AppRuntimeStatus['phase'] | undefined, webReady: boolean, childRunning = false): AppRuntimeStatus['phase'] {
  return webReady && phase === 'starting' ? 'running' : (phase ?? (webReady || childRunning ? 'running' : 'stopped'))
}

export async function getAppRuntimeStatuses(config: LauncherConfig, suppliedVersions?: RuntimeVersions): Promise<Record<AppId, AppRuntimeStatus>> {
  const versions = suppliedVersions ?? await detectRuntimeVersions()
  const ids = APP_IDS.map(async appId => {
    const webReady = kindFor(appId) !== 'cli' && (appId === 'deepseek-harness'
      ? await isDeepseekHarnessWebReady()
      : await probeUrl(config.global.launch.webUrls[appId]))
    const installed = installedFor(appId, versions)
    const childRunning = isAlive(children.get(appId))
    const phase = resolveRuntimePhase(phases.get(appId), webReady, childRunning)
    // A web service that answers (including its authenticated 401 response)
    // is healthy even if the detached launcher wrapper has already exited.
    // Do not leave a stale child error visible after the service is reachable.
    if (webReady) {
      errors.delete(appId)
      if (phases.get(appId) === 'error' || phases.get(appId) === 'starting') phases.set(appId, 'running')
    }
    if (phase === 'running' && phases.get(appId) === 'starting') phases.set(appId, 'running')
    const version = versions[appId === 'deepseek-harness' ? 'deepseekHarness' : appId].version
    return [appId, {
      appId,
      kind: kindFor(appId),
      phase,
      installed,
      running: webReady || childRunning,
      webReady,
      version,
      message: phaseMessage(appId, phase, installed, webReady),
      ...(childRunning && children.get(appId)?.pid ? { pid: children.get(appId)?.pid } : {}),
      updatedAt: new Date().toISOString(),
    }] as const
  })
  return Object.fromEntries(await Promise.all(ids)) as Record<AppId, AppRuntimeStatus>
}

export async function initializeAppProcesses(): Promise<void> {
  const process = await startDeepseekHarness()
  if (process) children.set('deepseek-harness', process)
}

export async function startApp(appId: AppId, config: LauncherConfig): Promise<void> {
  errors.delete(appId)
  phases.set(appId, 'starting')
  if (appId === 'deepseek-harness') {
    if (await isDeepseekHarnessWebReady()) return
    const process = await startDeepseekHarness()
    if (process) children.set(appId, process)
    return
  }
  if (kindFor(appId) !== 'cli' && await probeUrl(config.global.launch.webUrls[appId])) {
    phases.set(appId, 'running')
    return
  }
  if (appId === 'openclaw') await repairOpenclawState(config)
  // A previous portable-runtime layout can leave a stale gateway process on
  // the configured port. Its HTTP probe returns 503, but OpenClaw still holds
  // the gateway lock and makes the new instance fail with "already running".
  // Reclaim listeners only after the probe failed, then launch the configured
  // instance with the current runtime paths.
  if (kindFor(appId) !== 'cli') {
    const stalePids = await listeningPids(config.global.launch.webUrls[appId])
    for (const pid of stalePids) {
      await terminate({ pid, exitCode: null, signalCode: null, kill: () => true } as unknown as ChildProcess)
    }
  }
  if (isAlive(children.get(appId))) return
  const spec = commandFor(appId, config)
  if (!spec) throw new Error(`${APP_LABELS[appId]} 未找到可用启动命令`)
  if (kindFor(appId) === 'cli') {
    await openAppTerminal(appId, config)
    phases.set(appId, 'stopped')
    return
  }
  spawnSpec(appId, spec)
}

async function terminate(child: ChildProcess): Promise<void> {
  if (!child.pid) return
  if (process.platform === 'win32') {
    await execFile('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true }).catch(() => undefined)
    return
  }
  try { process.kill(-child.pid, 'SIGTERM') } catch { child.kill('SIGTERM') }
}

export async function stopApp(appId: AppId, config?: LauncherConfig): Promise<void> {
  phases.set(appId, 'stopping')
  const child = children.get(appId)
  if (child && isAlive(child)) await terminate(child)
  else {
    if (appId === 'deepseek-harness') stopDeepseekHarness(child ?? null)
    const target = config && kindFor(appId) !== 'cli' ? config.global.launch.webUrls[appId] : ''
    for (const pid of target ? await listeningPids(target) : []) {
      await terminate({ pid, exitCode: null, signalCode: null, kill: () => true } as unknown as ChildProcess)
    }
  }
  children.delete(appId)
  phases.set(appId, 'stopped')
}

export async function restartApp(appId: AppId, config: LauncherConfig): Promise<void> {
  await stopApp(appId, config)
  await startApp(appId, config)
}

async function runCommand(command: string, args: string[], cwd: string, extraEnv: NodeJS.ProcessEnv = {}): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, { cwd, env: { ...runtimeEnv(), ...extraEnv }, shell: process.platform === 'win32' && command.toLowerCase().endsWith('.cmd'), stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true })
    child.stdout?.on('data', chunk => process.stdout.write(`[launcher update] ${chunk}`))
    child.stderr?.on('data', chunk => process.stderr.write(`[launcher update] ${chunk}`))
    child.once('error', reject)
    let stderr = ''
    child.stderr?.on('data', chunk => { stderr += String(chunk) })
    child.once('exit', code => code === 0
      ? resolve()
      : reject(new Error(`${command} 退出，代码 ${code ?? 'unknown'}${stderr.trim() ? `：${stderr.trim()}` : ''}`)))
  })
}

async function updateGitSource(source: string, remote: string): Promise<void> {
  const nestedGit = join(source, '.git')
  if (!existsSync(nestedGit)) {
    await runCommand('git', ['init', '-b', 'main'], source)
  }
  const configuredRemote = await new Promise<string>(resolve => {
    execFile('git', ['-C', source, 'remote', 'get-url', 'origin'], { windowsHide: true })
      .then(result => resolve(result.stdout.trim()))
      .catch(() => resolve(''))
  })
  if (configuredRemote !== remote) {
    if (configuredRemote) await runCommand('git', ['remote', 'set-url', 'origin', remote], source)
    else await runCommand('git', ['remote', 'add', 'origin', remote], source)
  }
  await runCommand('git', ['fetch', '--depth=1', 'origin', 'master'], source)
  await runCommand('git', ['reset', '--hard', 'origin/master'], source)
}

function ensureDeepseekWorkspaceCompatibility(source: string): void {
  const workspaceFile = join(source, 'pnpm-workspace.yaml')
  if (!existsSync(workspaceFile)) return
  const raw = readFileSync(workspaceFile, 'utf8')
  if (raw.includes('native/landlock-run/packages/*')) return
  const marker = '  - native/system/packages/*'
  if (raw.includes(marker)) {
    writeFileSync(workspaceFile, raw.replace(marker, `${marker}\n  - native/landlock-run/packages/*`), 'utf8')
  }
}

export async function updateApp(appId: AppId, config: LauncherConfig): Promise<void> {
  phases.set(appId, 'updating')
  errors.delete(appId)
  try {
    const root = rootPath()
    if (appId === 'openclaw') await runCommand(npmCommand(), ['update', '-g', 'openclaw'], root)
    else if (appId === 'claude') await runCommand(npmCommand(), ['update', '-g', '@anthropic-ai/claude-code'], root)
    else if (appId === 'codex') await runCommand(npmCommand(), ['update', '-g', '@openai/codex'], root)
    else if (appId === 'hermes') {
      const source = join(root, '.hermes', 'hermes-agent')
      if (!existsSync(join(source, '.git'))) throw new Error('Hermes Agent 目录不是 Git 仓库，无法自动更新')
      await runCommand('git', ['pull', '--ff-only'], source)
      await runCommand(hermesPythonCommand(), ['-m', 'pip', 'install', '-e', '.'], source)
    } else {
      const source = deepseekHarnessSourcePath()
      await updateGitSource(source, DEEPSEEK_HARNESS_REMOTE)
      ensureDeepseekWorkspaceCompatibility(source)
      const manager = process.platform === 'win32' ? 'pnpm.cmd' : join(runtimeBinPath(), 'corepack')
      const managerArgs = process.platform === 'win32' ? [] : ['pnpm']
      await runCommand(manager, [...managerArgs, 'install', '--filter', '@deepseek-ai/dsh...', '--no-frozen-lockfile'], source, {
        CI: 'true',
        npm_config_confirm_modules_purge: 'false',
        npm_config_node_linker: 'hoisted',
      })
      await runCommand(manager, [...managerArgs, 'run', 'build'], source)
    }
    phases.set(appId, 'stopped')
  } catch (error) {
    errors.set(appId, error instanceof Error ? error.message : '更新失败')
    phases.set(appId, 'error')
    throw error
  }
}

export function terminalEnvironment(root: string, config?: LauncherConfig): Record<string, string> {
  return {
    DSH_HOME: join(root, '.dsh'),
    HERMES_HOME: join(root, '.hermes'),
    CLAUDE_CONFIG_DIR: join(root, '.claude'),
    CODEX_HOME: join(root, '.codex'),
    OPENCLAW_CONFIG_PATH: join(root, '.openclaw', 'state', 'openclaw.json'),
    OPENCLAW_STATE_DIR: join(root, '.openclaw', 'state'),
    DONGCHUANGAI_API_KEY: config?.global.api.apiKey ?? '',
    DEEPSEEK_API_KEY: config?.global.api.apiKey ?? '',
    ...(config?.global.api.baseUrl ? {
      [`HERMES_CUSTOM_API_${(() => {
        try { return new URL(config.global.api.baseUrl).hostname.replace(/^api\./i, '').toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '') }
        catch { return '' }
      })()}_API_KEY`]: config.global.api.apiKey,
    } : {}),
  }
}

export function terminalArgs(appId: AppId, args: string[]): string[] {
  // The gateway command is only for service startup. An interactive terminal
  // must attach to the existing OpenClaw instance instead of starting another.
  return appId === 'openclaw' ? [] : args
}

export function terminalCommand(appId: AppId, config: LauncherConfig, options: { desktop?: boolean } = {}): string {
  const spec = commandFor(appId, config)
  if (!spec) return 'echo "未找到该应用的启动命令"'
  const root = rootPath()
  const environment = terminalEnvironment(root, config)
  const exports = Object.entries(environment).map(([key, value]) => `export ${key}="${value}"`).join(' && ')
  const activate = join(runtimeScriptsPath('darwin'), 'activate.sh')

  // The Hermes launcher selects Python and reads credentials without shell interpolation.
  if ((appId as string) === 'hermes') {
    const quote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`
    return `${quote(process.execPath)} ${quote(join(root, 'webui', 'scripts', 'launch-hermes.mjs'))}${options.desktop ? ' desktop' : ''}`
  }

  const appCommand = appId === 'openclaw'
    ? 'openclaw'
    : [spec.command, ...terminalArgs(appId, spec.args)].map(part => `"${part.replaceAll('"', '\\"')}"`).join(' ')
  return `cd "${root}" && unset DONGCHUANGAI_KEY && source "${activate}" && ${exports} && ${appCommand}`
}

// Windows：Node 的 spawn 会把含引号的参数序列化成 cmd 不认识的 \" 转义，
// 直接把一长串 && 命令塞给 cmd /k 会拆坏引号。因此把启动逻辑写成一个临时
// .cmd 批处理文件，让新终端窗口直接执行该文件，引号由 cmd 原生解析。
function writeWindowsTerminalBatch(appId: AppId, config: LauncherConfig, options: { desktop?: boolean } = {}): string | null {
  const spec = commandFor(appId, config)
  if (!spec) return null
  const root = rootPath()
  const environment = terminalEnvironment(root, config)
  const lines: string[] = ['@echo off', '']
  // Hermes must run from its own venv so the CLI and desktop dependencies match.
  if (appId === 'hermes') {
    const batchPath = join(tmpdir(), 'usb-lobster-hermes.cmd')
    lines.push(`"${process.execPath}" "${join(root, 'webui', 'scripts', 'launch-hermes.mjs')}"${options.desktop ? ' desktop' : ''}`)
    writeFileSync(batchPath, lines.join('\r\n'), 'utf8')
    return batchPath
  }
  // 先激活便携运行环境（node/python/npm-global 进 PATH），再运行对应的应用。
  const activate = firstExisting([join(runtimeScriptsPath('win32'), 'activate.cmd')])
  if ((appId as string) !== 'hermes' && activate) lines.push(`call "${activate}"`)
  else if ((appId as string) !== 'hermes') lines.push(`set "PATH=${runtimePathEntries().join(';')};%PATH%"`)
  const appCommand = (appId as string) === 'hermes'
    ? `hermes${options.desktop ? ' desktop' : ''}`
    : (appId as string) === 'openclaw'
      ? 'openclaw'
      : `"${spec.command}" ${terminalArgs(appId, spec.args).map(arg => `"${arg}"`).join(' ')}`
  lines.push(
    'set "DONGCHUANGAI_KEY="',
    ...Object.entries(environment).map(([key, value]) => `set "${key}=${value}"`),
    `cd /d "${root}"`,
    appCommand,
    '',
  )
  const batchPath = join(tmpdir(), `usb-lobster-${appId}.cmd`)
  writeFileSync(batchPath, lines.join('\r\n'), 'utf8')
  return batchPath
}

export async function openAppTerminal(appId: AppId, config: LauncherConfig, options: { desktop?: boolean } = {}): Promise<void> {
  if (appId === 'hermes') {
    try {
      await execFile(process.execPath, [join(rootPath(), 'webui', 'scripts', 'launch-hermes.mjs'), ...(options.desktop ? ['desktop'] : []), '--help'], { cwd: rootPath(), env: runtimeEnv(config), timeout: 30000, windowsHide: true })
    } catch (error) {
      const detail = error as Error & { stderr?: string }
      const message = `Hermes 启动检查失败：${detail.stderr?.trim() || detail.message}`
      errors.set(appId, message)
      phases.set(appId, 'error')
      throw new Error(message)
    }
  }
  if (appId === 'openclaw' && !await probeUrl(config.global.launch.webUrls.openclaw)) {
    throw new Error('OpenClaw 实例未运行，请先启动后再打开终端')
  }
  if (appId === 'deepseek-harness' && options.desktop) {
    const source = deepseekHarnessSourcePath()
    const pnpm = process.platform === 'win32' ? join(runtimeNpmGlobalPath(), 'pnpm.cmd') : join(runtimeBinPath(), 'corepack')
    const pnpmArgs = process.platform === 'win32' ? [] : ['pnpm']
    const runtimeFolder = process.platform === 'darwin' ? 'macos' : 'windows'
    const desktopTemp = join(rootPath(), 'runtime', runtimeFolder, 'tmp', 'deepseek-desktop')
    const desktopCache = join(rootPath(), 'runtime', runtimeFolder, 'cache', 'electron')
    mkdirSync(desktopTemp, { recursive: true })
    mkdirSync(desktopCache, { recursive: true })
    const desktopEnv = { ...runtimeEnv(config), DSH_HOME: join(rootPath(), '.dsh'), ELECTRON_CACHE: desktopCache, TEMP: desktopTemp, TMP: desktopTemp }
    if (!existsSync(join(source, 'apps', 'desktop', 'node_modules', 'electron', 'package.json'))
      || !existsSync(join(source, 'apps', 'desktop', 'node_modules', '.bin', 'tsx'))) {
      await runCommand(pnpm, [...pnpmArgs, 'install', '--filter', '@deepseek-ai/dsh-desktop...', '--frozen-lockfile=false'], source, desktopEnv)
    }
    const child = process.platform === 'win32'
      ? spawn('cmd.exe', ['/d', '/c', 'call', pnpm, '--filter', '@deepseek-ai/dsh-desktop', 'start'], { cwd: source, env: desktopEnv, detached: true, stdio: 'ignore', windowsHide: false })
      : spawn(pnpm, [...pnpmArgs, '--filter', '@deepseek-ai/dsh-desktop', 'start'], { cwd: source, env: desktopEnv, detached: true, stdio: 'ignore' })
    child.once('error', error => {
      errors.set(appId, `DeepSeek Harness 桌面端启动失败：${error.message}`)
      phases.set(appId, 'error')
    })
    child.unref()
    return
  }
  if (process.platform === 'win32') {
    const batchPath = writeWindowsTerminalBatch(appId, config, options)
    if (!batchPath) return
    const child = spawn('cmd.exe', ['/d', '/c', 'start', `USB Lobster - ${APP_LABELS[appId]}`, 'cmd.exe', '/d', '/k', batchPath], { detached: true, stdio: 'ignore', windowsHide: false })
    child.unref()
    return
  }
  const command = terminalCommand(appId, config, options)
  const escaped = command.replaceAll('\\', '\\\\').replaceAll('"', '\\"')
  const script = `tell application "Terminal" to do script "${escaped}"\ntell application "Terminal" to activate`
  const child = spawn('osascript', ['-e', script], { detached: true, stdio: 'ignore' })
  child.unref()
}

export async function shutdownAppProcesses(): Promise<void> {
  await Promise.all(APP_IDS.map(async appId => {
    const child = children.get(appId)
    if (child && isAlive(child)) await terminate(child)
  }))
}
