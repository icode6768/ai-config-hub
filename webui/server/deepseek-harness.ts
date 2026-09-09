import { get as httpGet } from 'node:http'
import { existsSync } from 'node:fs'
import { spawn, type ChildProcess } from 'node:child_process'
import { join } from 'node:path'
import { dshHomePath, rootPath } from '../src/shared/paths'

export const DEEPSEEK_HARNESS_PORT = 3080
let authenticatedLaunchUrl: string | null = null

export function parseDeepseekLaunchUrl(line: string): string | null {
  const match = /dsh web: (http:\/\/[^\s]+)/.exec(line)
  if (!match) return null
  try {
    const url = new URL(match[1])
    return url.origin === deepseekHarnessUrl() && url.searchParams.has('token') ? url.href : null
  } catch {
    return null
  }
}

export function deepseekHarnessEntryUrl(target: string): string {
  return authenticatedLaunchUrl && new URL(target).origin === deepseekHarnessUrl()
    ? authenticatedLaunchUrl : target
}

export function deepseekHarnessUrl(port = DEEPSEEK_HARNESS_PORT): string {
  return `http://127.0.0.1:${port}`
}

function launcherFileName(platform: NodeJS.Platform): string {
  return platform === 'win32' ? 'launch-deepseek-harness-windows.bat' : 'launch-deepseek-harness-macos.command'
}

function deepseekHarnessHomes(): string[] {
  return [dshHomePath(), join(rootPath(), 'dsh')]
}

export function deepseekHarnessHomePath(platform: NodeJS.Platform = process.platform): string {
  const launcher = launcherFileName(platform)
  return deepseekHarnessHomes().find(home => existsSync(join(home, launcher))) ?? dshHomePath()
}

export function deepseekHarnessLauncherPath(platform: NodeJS.Platform = process.platform): string {
  return join(deepseekHarnessHomePath(platform), launcherFileName(platform))
}

export function deepseekHarnessSourcePath(): string {
  const source = deepseekHarnessHomes()
    .map(home => join(home, 'deepseek-harness'))
    .find(path => existsSync(join(path, 'package.json')) || existsSync(join(path, 'apps', 'cli', 'package.json')))
  return source ?? join(dshHomePath(), 'deepseek-harness')
}

export function isDeepseekHarnessWebReady(port = DEEPSEEK_HARNESS_PORT): Promise<boolean> {
  return new Promise(resolve => {
    let settled = false
    const finish = (ready: boolean): void => {
      if (settled) return
      settled = true
      resolve(ready)
    }

    const request = httpGet({ hostname: '127.0.0.1', port, path: '/', timeout: 1000 }, response => {
      response.resume()
      finish((response.statusCode ?? 500) < 500)
    })
    request.on('timeout', () => {
      request.destroy()
      finish(false)
    })
    request.on('error', () => finish(false))
  })
}

function pipeOutput(child: ChildProcess): void {
  let pending = ''
  child.stdout?.setEncoding('utf8')
  child.stdout?.on('data', chunk => {
    pending += chunk
    const lines = pending.split(/\r?\n/)
    pending = lines.pop() ?? ''
    for (const line of lines) {
      authenticatedLaunchUrl = parseDeepseekLaunchUrl(line) ?? authenticatedLaunchUrl
      process.stdout.write(`[DeepSeek Harness] ${line.replace(/([?&]token=)[^\s&)]+/g, '$1[redacted]')}\n`)
    }
    if (pending.length > 65536) pending = ''
  })
  child.stderr?.on('data', chunk => process.stderr.write(`[DeepSeek Harness] ${chunk}`))
  child.on('error', error => console.error(`[DeepSeek Harness] failed to start: ${error.message}`))
  child.on('exit', (code, signal) => {
    authenticatedLaunchUrl = null
    if (code !== 0 && signal === null) console.error(`[DeepSeek Harness] exited with code ${code}`)
  })
}

export async function startDeepseekHarness(): Promise<ChildProcess | null> {
  if (await isDeepseekHarnessWebReady()) {
    console.log(`DeepSeek Harness is already running at ${deepseekHarnessUrl()}`)
    return null
  }

  const launcher = deepseekHarnessLauncherPath()
  if (!existsSync(launcher)) {
    console.warn(`[DeepSeek Harness] launcher not found: ${launcher}`)
    return null
  }

  const home = deepseekHarnessHomePath()
  const env = {
    ...process.env,
    DSH_HOME: home,
    DSH_WEB_PORT: String(DEEPSEEK_HARNESS_PORT),
    DC_PANEL_AUTOSTART: '1',
    ...(process.platform === 'win32' ? {
      // U 盘常用 exFAT，不支持 pnpm 默认创建的 junction；使用普通目录布局。
      npm_config_node_linker: 'hoisted',
      npm_config_confirm_modules_purge: 'false',
    } : {}),
  }
  const child = process.platform === 'win32'
      ? spawn('cmd.exe', ['/d', '/c', 'call', launcher], {
        cwd: home,
        env,
        detached: true,
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
      })
    : spawn('zsh', [launcher], {
        cwd: home,
        env,
        detached: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      })

  pipeOutput(child)
  console.log(`Starting DeepSeek Harness at ${deepseekHarnessUrl()}...`)
  return child
}

export function stopDeepseekHarness(child: ChildProcess | null): void {
  if (!child || child.exitCode !== null || child.signalCode !== null || !child.pid) return

  if (process.platform === 'win32') {
    const killer = spawn('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], {
      stdio: 'ignore',
      windowsHide: true,
    })
    killer.unref()
    return
  }

  try {
    process.kill(-child.pid, 'SIGTERM')
  } catch {
    child.kill('SIGTERM')
  }
}
