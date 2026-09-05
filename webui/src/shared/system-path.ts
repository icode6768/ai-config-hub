import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { execFile as execFileCallback } from 'node:child_process'

const BASH_PROFILE_START = '# USB LOBSTER RUNTIME START'
const BASH_PROFILE_END = '# USB LOBSTER RUNTIME END'

function shQuote(value: string): string {
  return `'${value.replaceAll("'", `'\\''`)}'`
}

function normalizeWindowsEntry(value: string): string {
  return value.trim().replace(/^"|"$/g, '').replaceAll('/', '\\').replace(/[\\]+$/, '').toLowerCase()
}

function normalizeWindowsPathEntries(pathValue: string): string[] {
  return pathValue
    .split(';')
    .map(entry => entry.trim())
    .filter(Boolean)
}

const execFile = promisify(execFileCallback)

export type WindowsPathScope = 'Machine' | 'User'

export type RuntimePathSyncResult = {
  platform: 'win32' | 'darwin' | 'unsupported'
  scope: 'machine' | 'user' | 'machine+user' | 'profile' | 'none'
  message: string
}

export function resolveWindowsPathSyncScopes(enabled: boolean, machineAvailable: boolean): WindowsPathScope[] {
  if (enabled) return [machineAvailable ? 'Machine' : 'User']
  return machineAvailable ? ['Machine', 'User'] : ['User']
}

export function resolveWindowsRuntimePathEntries(root: string): string[] {
  const nodeVersionsDir = join(root, 'runtime', 'windows', 'node', 'versions')
  let nodeVersion = 'v24.18.0'
  try {
    const entries = readdirSync(nodeVersionsDir, { withFileTypes: true })
      .filter(entry => entry.isDirectory())
      .map(entry => entry.name)
      .sort()
    nodeVersion = entries.at(-1) ?? nodeVersion
  } catch {
    // Fall back to the portable default when the runtime tree is incomplete.
  }

  const pythonDefault = join(root, 'runtime', 'windows', 'python', 'default.txt')
  let pythonVersion = '3.11.9'
  try {
    const raw = readFileSync(pythonDefault, 'utf8').trim()
    if (raw) pythonVersion = raw
  } catch {
    const versionsDir = join(root, 'runtime', 'windows', 'python', 'versions')
    try {
      const entries = readdirSync(versionsDir, { withFileTypes: true })
        .filter(entry => entry.isDirectory())
        .map(entry => entry.name)
        .sort()
      pythonVersion = entries.at(-1) ?? pythonVersion
    } catch {
      // Fall back to the portable default when the runtime tree is incomplete.
    }
  }
  return [
    join(root, 'runtime', 'windows', 'bin'),
    join(root, 'runtime', 'windows', 'npm-global'),
    join(root, 'runtime', 'windows', 'node', 'versions', nodeVersion),
    join(root, 'runtime', 'windows', 'python', 'versions', pythonVersion),
    // pip 等 console scripts 在 Windows 上落地到 Scripts\ 目录（PEP 370），
    // 仅把 python/versions/<ver> 加进 PATH 找不到 pip / playwright / uvicorn 等命令。
    join(root, 'runtime', 'windows', 'python', 'versions', pythonVersion, 'Scripts'),
  ]
}

export function applyWindowsPath(existingPath: string, entries: string[], enabled: boolean): string {
  const current = normalizeWindowsPathEntries(existingPath)
  const currentNormalized = new Set(current.map(normalizeWindowsEntry))
  const managedNormalized = new Set(entries.map(normalizeWindowsEntry))
  const preserved = current.filter(entry => !managedNormalized.has(normalizeWindowsEntry(entry)))
  if (!enabled) return preserved.join(';')
  const next: string[] = []
  for (const entry of entries) {
    if (!currentNormalized.has(normalizeWindowsEntry(entry))) next.push(entry)
  }
  return [...next, ...preserved].join(';')
}

export function applyBashProfile(existing: string, runtimeRoot: string, enabled: boolean): string {
  const normalizedRoot = runtimeRoot.replaceAll('\\', '/').replace(/\/$/, '')
  const scriptPath = `${normalizedRoot}/runtime/macos/scripts/activate.sh`
  const block = [
    BASH_PROFILE_START,
    `source ${shQuote(scriptPath)}`,
    BASH_PROFILE_END,
  ].join('\n')
  const normalizedExisting = existing.replace(/\r\n/g, '\n')
  const startIndex = normalizedExisting.indexOf(BASH_PROFILE_START)
  const endIndex = normalizedExisting.indexOf(BASH_PROFILE_END)
  let preserved = normalizedExisting.trimEnd()
  if (startIndex >= 0 && endIndex >= startIndex) {
    const before = normalizedExisting.slice(0, startIndex).trimEnd()
    const after = normalizedExisting.slice(endIndex + BASH_PROFILE_END.length).trimStart()
    preserved = [before, after].filter(Boolean).join('\n').trimEnd()
  }
  if (!enabled) return preserved ? `${preserved}\n` : ''
  return preserved ? `${preserved}\n\n${block}\n` : `${block}\n`
}

async function syncWindowsPathScope(root: string, enabled: boolean, scope: WindowsPathScope): Promise<void> {
  const entries = resolveWindowsRuntimePathEntries(root)
  const script = [
    '$ErrorActionPreference = "Stop"',
    '$entries = @(' + entries.map(entry => `'${entry.replaceAll("'", "''")}'`).join(', ') + ')',
    `$enabled = $${enabled ? 'true' : 'false'}`,
    `$current = [Environment]::GetEnvironmentVariable("Path", "${scope}")`,
    'if ($null -eq $current) { $current = "" }',
    '$parts = @()',
    'if ($current) { $parts = $current -split ";" | Where-Object { $_ -and $_.Trim() } }',
    'function Normalize([string]$value) {',
    "  $value.Trim().Trim('\"').Replace('/', [char]92).TrimEnd([char]92).ToLowerInvariant()",
    '}',
    '$managed = @{}',
    'foreach ($entry in $entries) { $managed[(Normalize $entry)] = $entry }',
    '$preserved = New-Object System.Collections.Generic.List[string]',
    'foreach ($part in $parts) {',
    '  if (-not $managed.ContainsKey((Normalize $part))) { [void]$preserved.Add($part) }',
    '}',
    'if ($enabled) {',
    '  $next = New-Object System.Collections.Generic.List[string]',
    '  foreach ($entry in $entries) {',
    '    if (-not ($parts | Where-Object { (Normalize $_) -eq (Normalize $entry) })) { [void]$next.Add($entry) }',
    '  }',
    '  foreach ($part in $preserved) { [void]$next.Add($part) }',
    '  $value = ($next -join ";")',
    '} else {',
    '  $value = ($preserved -join ";")',
    '}',
    `[Environment]::SetEnvironmentVariable("Path", $value, "${scope}")`,
    '$env:Path = $value',
  ].join('; ')
  await execFile('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', script], { windowsHide: true })
}

export async function syncWindowsSystemPath(root: string, enabled: boolean): Promise<RuntimePathSyncResult> {
  let machineAvailable = false
  try {
    await syncWindowsPathScope(root, enabled, 'Machine')
    machineAvailable = true
  } catch (machineError) {
    if (!enabled) {
      // A non-admin process cannot remove machine PATH entries; still clean the user scope.
      machineAvailable = false
    } else {
      try {
        await syncWindowsPathScope(root, enabled, 'User')
        return {
          platform: 'win32',
          scope: 'user',
          message: '权限不足，已写入当前用户 PATH',
        }
      } catch (userError) {
        throw new Error(`写入 Windows PATH 失败（机器级和用户级均失败）：${userError instanceof Error ? userError.message : String(machineError)}`)
      }
    }
  }

  if (!enabled) {
    await syncWindowsPathScope(root, false, 'User')
    return {
      platform: 'win32',
      scope: machineAvailable ? 'machine+user' : 'user',
      message: machineAvailable ? '已从机器级和用户级 PATH 移除运行时目录' : '已从当前用户 PATH 移除运行时目录',
    }
  }

  return {
    platform: 'win32',
    scope: 'machine',
    message: '已写入机器级 PATH',
  }
}

export async function syncMacSystemPath(root: string, enabled: boolean): Promise<RuntimePathSyncResult> {
  const profilePath = join(homedir(), '.bash_profile')
  const existing = existsSync(profilePath) ? await readFile(profilePath, 'utf8') : ''
  const next = applyBashProfile(existing, root, enabled)
  await writeFile(profilePath, next, 'utf8')
  await execFile('/bin/bash', ['-c', `source ${shQuote(profilePath)}`], { windowsHide: true })
  return {
    platform: 'darwin',
    scope: 'profile',
    message: enabled ? '已写入 ~/.bash_profile 并执行 source' : '已从 ~/.bash_profile 移除运行时配置并执行 source',
  }
}

export async function syncRuntimeSystemPath(root: string, enabled: boolean): Promise<RuntimePathSyncResult> {
  if (process.platform === 'win32') {
    return syncWindowsSystemPath(root, enabled)
  }
  if (process.platform === 'darwin') {
    return syncMacSystemPath(root, enabled)
  }
  return { platform: 'unsupported', scope: 'none', message: '当前平台不支持自动同步系统环境变量' }
}
