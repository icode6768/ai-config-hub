import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { rootPath } from '../src/shared/paths'
import { dongchuangPlatformUrl } from '../src/shared/dongchuangai'
import type { LauncherConfig } from '../src/shared/types'

const PRESERVED_PATHS = ['config.yaml', '.openclaw', '.claude', '.codex', '.hermes', '.dsh']

export type SoftwareUpdate = {
  version: string
  date: string
  title: string
  changes: string[]
  zipUrl: string
  hash: string
  size: number
}

type ApiResponse = {
  code?: number
  message?: string
  data?: {
    value?: {
      version?: string
      date?: string
      changeLog?: { ch?: { title?: string; content?: unknown[] } }
      zip?: { url?: string; hash?: string; size?: number } | null
    } | null
  }
}

function configIdentifiers(config: LauncherConfig): { appId: number; userId: number } {
  const { app_id: appId, user_id: userId } = config.global.update
  if (!Number.isSafeInteger(appId) || appId <= 0 || !Number.isSafeInteger(userId) || userId < 0) {
    throw new Error('请先在根目录 config.yaml 的 global.update 中填写 app_id 和 user_id')
  }
  return { appId, userId }
}

export function currentSoftwareVersion(): string {
  try {
    const raw = readJson(join(rootPath(), 'webui', 'package.json'))
    return typeof raw.version === 'string' ? raw.version : '0.0.0'
  } catch {
    return '0.0.0'
  }
}

function readJson(path: string): Record<string, unknown> {
  // package.json is local project metadata, not user-supplied input.
  const raw = readFileSync(path, 'utf8')
  return JSON.parse(raw) as Record<string, unknown>
}

export function compareVersions(left: string, right: string): number {
  const parts = (value: string) => value.replace(/^v/i, '').split('.').slice(0, 3).map(part => Number.parseInt(part.replace(/\D.*$/, ''), 10) || 0)
  const a = parts(left)
  const b = parts(right)
  for (let index = 0; index < 3; index += 1) {
    if ((a[index] ?? 0) !== (b[index] ?? 0)) return (a[index] ?? 0) > (b[index] ?? 0) ? 1 : -1
  }
  return 0
}

function apiPlatform(): 'win' | 'macos' {
  return process.platform === 'darwin' ? 'macos' : 'win'
}

export async function checkSoftwareUpdate(config: LauncherConfig): Promise<{ currentVersion: string; update: SoftwareUpdate | null }> {
  const { appId, userId } = configIdentifiers(config)
  const currentVersion = currentSoftwareVersion()
  const query = new URLSearchParams({ version: currentVersion, platform: apiPlatform(), channel: 'stable', app_id: String(appId), user_id: String(userId) })
  const updateUrl = dongchuangPlatformUrl(config.global.api.baseUrl, 'openclaw-updates/manual-check')
  const response = await fetch(`${updateUrl}?${query}`, { signal: AbortSignal.timeout(15000) })
  if (!response.ok) throw new Error(`更新服务返回 ${response.status}`)
  const payload = await response.json() as ApiResponse
  if (payload.code !== 0) throw new Error(payload.message || '读取更新信息失败')
  const value = payload.data?.value
  if (!value?.version || compareVersions(value.version, currentVersion) <= 0) return { currentVersion, update: null }
  const zip = value.zip
  if (!zip?.url || !/^https:\/\//i.test(zip.url)) throw new Error('新版本未提供安全的 ZIP 安装包')
  const content = Array.isArray(value.changeLog?.ch?.content) ? value.changeLog.ch.content.filter((item): item is string => typeof item === 'string') : []
  return {
    currentVersion,
    update: {
      version: value.version,
      date: value.date || '',
      title: value.changeLog?.ch?.title || '',
      changes: content,
      zipUrl: zip.url,
      hash: zip.hash || '',
      size: typeof zip.size === 'number' ? zip.size : 0,
    },
  }
}

function expectedHash(hash: string): string {
  return hash.trim().replace(/^sha256:/i, '').toLowerCase()
}

function platformMarker(): string {
  return process.platform === 'darwin' ? 'start-macos.command' : 'start-windows.bat'
}

function assertCompletePortableArchive(archive: Buffer): void {
  const requiredEntries = ['webui/package.json', platformMarker()]
  const missing = requiredEntries.filter(entry => !archive.includes(Buffer.from(entry, 'utf8')))
  if (missing.length > 0) {
    throw new Error(`更新包不是完整便携版，缺少 ${missing.join('、')}。请在更新服务上传包含项目根目录的完整 ZIP 包`)
  }
}

function psLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`
}

function shQuote(value: string): string {
  // 用单引号包裹并转义内部单引号（POSIX 标准做法）
  return `'${value.replace(/'/g, `'\\''`)}'`
}

function buildPowerShellInstaller(
  root: string,
  zipPath: string,
  staging: string,
  launcher: string,
  errorPath: string,
): string {
  return [
    '$ErrorActionPreference = \'Stop\'',
    `$root = ${psLiteral(root)}`,
    `$zip = ${psLiteral(zipPath)}`,
    `$staging = ${psLiteral(staging)}`,
    `$launcher = ${psLiteral(launcher)}`,
    `$errorPath = ${psLiteral(errorPath)}`,
    `$preserve = @(${PRESERVED_PATHS.map(psLiteral).join(', ')})`,
    'try {',
    '  New-Item -ItemType Directory -Path $staging -Force | Out-Null',
    '  Expand-Archive -LiteralPath $zip -DestinationPath $staging -Force',
    '  $entries = @(Get-ChildItem -LiteralPath $staging -Force)',
    '  $source = if ($entries.Count -eq 1 -and $entries[0].PSIsContainer) { $entries[0].FullName } else { $staging }',
    '  Get-ChildItem -LiteralPath $source -Force | ForEach-Object { if ($preserve -notcontains $_.Name) { Copy-Item -LiteralPath $_.FullName -Destination $root -Recurse -Force } }',
    '  Start-Process -FilePath $launcher -WorkingDirectory $root',
    '} catch {',
    '  $_ | Out-File -LiteralPath $errorPath -Encoding utf8',
    '  exit 1',
    '}',
  ].join('\r\n')
}

function buildMacosInstaller(
  root: string,
  zipPath: string,
  staging: string,
  launcher: string,
  errorPath: string,
): string {
  // PRESERVE 数组的 shell 单引号形式
  const preserveShell = PRESERVED_PATHS.map((entry) => `  ${shQuote(entry)}`).join('\n')
  return [
    '#!/bin/bash',
    'set -euo pipefail',
    '',
    `# auto-generated by webui software-update; do not edit by hand`,
    `ROOT=${shQuote(root)}`,
    `ZIP=${shQuote(zipPath)}`,
    `STAGING=${shQuote(staging)}`,
    `LAUNCHER=${shQuote(launcher)}`,
    `ERROR_LOG=${shQuote(errorPath)}`,
    '',
    'PRESERVED=(',
    preserveShell,
    ')',
    '',
    'log_error() {',
    '  echo "$*" >> "$ERROR_LOG"',
    '  exit 1',
    '}',
    '',
    'trap \'log_error "install-update failed at line $LINENO: $BASH_COMMAND"\' ERR',
    '',
    '# 1) 解压 ZIP 到临时 staging',
    'rm -rf "$STAGING"',
    'mkdir -p "$STAGING"',
    `unzip -q -o "$ZIP" -d "$STAGING" || log_error "unzip failed: $ZIP"`,
    '',
    '# 2) 检测 ZIP 是否包了一层单目录',
    'shopt -s nullglob',
    'STAGING_ENTRIES=("$STAGING"/*)',
    'shopt -u nullglob',
    'if [ "${#STAGING_ENTRIES[@]}" -eq 1 ] && [ -d "${STAGING_ENTRIES[0]}" ]; then',
    '  SRC="${STAGING_ENTRIES[0]}"',
    'else',
    '  SRC="$STAGING"',
    'fi',
    '',
    '# 3) 复制非 PRESERVED 项到 ROOT',
    'for item in "$SRC"/*; do',
    '  name="$(basename "$item")"',
    '  skip=0',
    '  for p in "${PRESERVED[@]}"; do',
    '    if [ "$name" = "$p" ]; then skip=1; break; fi',
    '  done',
    '  if [ "$skip" -eq 0 ]; then',
    '    cp -R "$item" "$ROOT/" || log_error "copy failed: $item -> $ROOT"',
    '  fi',
    'done',
    '',
    '# 4) 解除新复制文件的 macOS 隔离属性（外置/U 盘装新文件时必需）',
    'xattr -rd com.apple.quarantine "$ROOT" 2>/dev/null || true',
    '',
    '# 5) 重启启动器（macOS .command 文件双击 / open 都会用 Terminal.app 打开）',
    'if [ -f "$LAUNCHER" ]; then',
    '  nohup open "$LAUNCHER" >/dev/null 2>&1 &',
    'fi',
    '',
    'exit 0',
    '',
  ].join('\n')
}

export async function prepareSoftwareUpdate(config: LauncherConfig, expectedVersion: string): Promise<void> {
  if (process.platform !== 'win32' && process.platform !== 'darwin') {
    throw new Error('自动安装更新目前仅支持 Windows 与 macOS')
  }
  const result = await checkSoftwareUpdate(config)
  const update = result.update
  if (!update || update.version !== expectedVersion) throw new Error('更新信息已变化，请重新检查更新')

  const updateDir = join(tmpdir(), `usb-lobster-update-${Date.now()}`)
  await mkdir(updateDir, { recursive: true })
  const zipPath = join(updateDir, `${basename(new URL(update.zipUrl).pathname) || 'update.zip'}`)
  const response = await fetch(update.zipUrl, { signal: AbortSignal.timeout(120000) })
  if (!response.ok) throw new Error(`下载更新包失败 (${response.status})`)
  const archive = Buffer.from(await response.arrayBuffer())
  if (update.size > 0 && archive.byteLength !== update.size) throw new Error('下载的更新包大小校验失败')
  const hash = expectedHash(update.hash)
  if (hash && createHash('sha256').update(archive).digest('hex') !== hash) throw new Error('下载的更新包哈希校验失败')
  assertCompletePortableArchive(archive)
  await writeFile(zipPath, archive)

  const root = rootPath()
  const staging = join(updateDir, 'staging')

  if (process.platform === 'win32') {
    const launcher = join(root, 'start-windows.bat')
    if (!existsSync(launcher)) throw new Error('未找到 Windows 启动脚本，无法自动安装')
    const scriptPath = join(updateDir, 'install-update.ps1')
    const errorPath = join(updateDir, 'install-update-error.log')
    const script = buildPowerShellInstaller(root, zipPath, staging, launcher, errorPath)
    // Windows PowerShell 5.1 needs a BOM to read portable paths containing Chinese correctly.
    await writeFile(scriptPath, `﻿${script}`, 'utf8')
    const waiterPath = join(updateDir, 'wait-and-install.ps1')
    const waiter = [
      `$targetPid = ${process.pid}`,
      `$installer = ${psLiteral(scriptPath)}`,
      `$errorPath = ${psLiteral(errorPath)}`,
      'try {',
      '  while (Get-Process -Id $targetPid -ErrorAction SilentlyContinue) { Start-Sleep -Milliseconds 250 }',
      '  & $installer',
      '} catch {',
      '  $_ | Out-File -LiteralPath $errorPath -Encoding utf8',
      '  exit 1',
      '}',
    ].join('\r\n')
    await writeFile(waiterPath, `﻿${waiter}`, 'utf8')
    const child = spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', waiterPath], { detached: true, stdio: 'ignore', windowsHide: true })
    child.unref()
    return
  }

  // macOS path
  const launcher = join(root, 'start-macos.command')
  if (!existsSync(launcher)) throw new Error('未找到 macOS 启动脚本 (start-macos.command)，无法自动安装')
  const scriptPath = join(updateDir, 'install-update.sh')
  const errorPath = join(updateDir, 'install-update-error.log')
  const script = buildMacosInstaller(root, zipPath, staging, launcher, errorPath)
  await writeFile(scriptPath, script, { mode: 0o755 })
  // 等 dev server 退出后再装，避免覆盖运行中文件
  const waiterPath = join(updateDir, 'wait-and-install.sh')
  const waiter = [
    '#!/bin/bash',
    'set -euo pipefail',
    `TARGET_PID=${process.pid}`,
    `INSTALLER=${shQuote(scriptPath)}`,
    `ERROR_LOG=${shQuote(errorPath)}`,
    '',
    '# 轮询等待父进程退出',
    'while kill -0 "$TARGET_PID" 2>/dev/null; do sleep 0.5; done',
    '',
    'bash "$INSTALLER" || {',
    '  echo "install-update failed: see $ERROR_LOG" >> "$ERROR_LOG"',
    '  exit 1',
    '}',
  ].join('\n')
  await writeFile(waiterPath, waiter, { mode: 0o755 })
  // 用 setsid + & 让 waiter 独立成进程组，与父 dev server 解耦
  const child = spawn('bash', [waiterPath], { detached: true, stdio: 'ignore' })
  child.unref()
}