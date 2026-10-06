import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import { homedir, platform } from 'node:os'
import { join, posix, win32 } from 'node:path'
import { promisify } from 'node:util'
import { rootPath } from '../src/shared/paths'

const exec = promisify(execFile)
export const WORKBUDDY_URL = 'https://www.workbuddy.cn/?fromSource=gwzcw.17039508.17039508.17039508'

export type WorkBuddyInfo = { platform: string; supported: boolean; installed: boolean; running: boolean; version: string; path?: string; downloadUrl: string; error?: string }

function candidates(): string[] {
  const home = homedir()
  if (platform() === 'win32') return [join(process.env.LOCALAPPDATA ?? join(home, 'AppData', 'Local'), 'WorkBuddy', 'WorkBuddy.exe'), join(process.env.ProgramFiles ?? 'C:\\Program Files', 'WorkBuddy', 'WorkBuddy.exe')]
  if (platform() === 'darwin') return ['/Applications/WorkBuddy.app', join(home, 'Applications', 'WorkBuddy.app')]
  return []
}

type InstalledRecord = { path?: string; version?: string }

async function installedRecord(): Promise<InstalledRecord> {
  const direct = candidates().find(existsSync)
  if (direct) return { path: direct }
  if (platform() !== 'win32') return {}
  try {
    const roots = ['HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall', 'HKLM\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall', 'HKLM\\Software\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall']
    for (const root of roots) {
      const { stdout } = await exec('reg.exe', ['query', root, '/s'], { windowsHide: true })
      const blocks = stdout.split(/\r?\n\r?\n/)
      for (const block of blocks) {
        if (!/DisplayName\s+REG_SZ\s+WorkBuddy/i.test(block)) continue
        const value = (name: string) => block.match(new RegExp(`${name}\\s+REG_SZ\\s+(.+)`, 'i'))?.[1]?.trim()
        const iconPath = value('DisplayIcon')?.replace(/,\d+$/, '')
        const installLocation = value('InstallLocation')
        const path = [iconPath, installLocation ? join(installLocation, 'WorkBuddy.exe') : undefined].find(candidate => candidate && existsSync(candidate))
        return { path, version: value('DisplayVersion') }
      }
    }
  } catch { /* registry lookup is best effort */ }
  return {}
}

export async function resolveWorkBuddyDownload(): Promise<{ url: string; platform: string; architecture: string }> {
  const response = await fetch(WORKBUDDY_URL)
  const html = response.ok ? await response.text() : ''
  const matches = [...html.matchAll(/https?:[^"'\s<>]+\.(?:exe|dmg|pkg)(?:\?[^"'\s<>]*)?/gi)].map(match => match[0])
  const wanted = platform() === 'darwin' ? matches.find(url => /dmg|pkg/i.test(url)) : matches.find(url => /exe/i.test(url))
  return { url: wanted ?? WORKBUDDY_URL, platform: platform(), architecture: process.arch }
}

export async function getWorkBuddyInfo(): Promise<WorkBuddyInfo> {
  const resolved = await resolveWorkBuddyDownload().catch(() => ({ url: WORKBUDDY_URL, platform: platform(), architecture: process.arch }))
  const record = await installedRecord()
  let running = false
  if (platform() === 'win32') running = await exec('tasklist.exe', ['/FI', 'IMAGENAME eq WorkBuddy.exe'], { windowsHide: true }).then(result => /WorkBuddy\.exe/i.test(result.stdout)).catch(() => false)
  return { ...resolved, downloadUrl: resolved.url, supported: ['win32', 'darwin'].includes(platform()), installed: Boolean(record.path || record.version), running, version: record.version ?? (record.path ? '已安装' : '未安装'), path: record.path }
}

export async function openWorkBuddy(): Promise<void> {
  const path = (await installedRecord()).path
  if (!path) throw new Error('WorkBuddy 尚未安装')
  if (platform() === 'win32') await exec('cmd.exe', ['/c', 'start', '', path], { windowsHide: true })
  else await exec('open', [path])
}

export async function openWorkBuddyInstaller(): Promise<{ url: string }> {
  const { url } = await resolveWorkBuddyDownload()
  if (platform() === 'win32') await exec('cmd.exe', ['/c', 'start', '', url], { windowsHide: true })
  else await exec('open', [url])
  return { url }
}

export async function uninstallWorkBuddy(): Promise<void> {
  const path = (await installedRecord()).path
  if (!path) throw new Error('WorkBuddy 尚未安装')
  if (platform() === 'darwin') { await rm(path, { recursive: true, force: true }); return }
  await exec('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', `Remove-Item -LiteralPath '${path.replace(/'/g, "''")}' -Recurse -Force`], { windowsHide: true })
}

export function workBuddySkillsCandidates(currentPlatform: NodeJS.Platform = platform(), home = currentPlatform === 'win32' ? process.env.USERPROFILE || homedir() : homedir()): string[] {
  const path = currentPlatform === 'win32' ? win32 : posix
  return [path.join(home, '.workbuddy', 'skills')]
}

export const workBuddyStatePath = () => join(rootPath(), '.codex', 'workbuddy.json')
