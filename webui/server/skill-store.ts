import { cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { join, basename, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { execFile as execFileCallback } from 'node:child_process'
import { promisify } from 'node:util'
import YAML from 'yaml'
import { rootPath } from '../src/shared/paths'
import { dongchuangPlatformUrl } from '../src/shared/dongchuangai'
import type { LauncherConfig } from '../src/shared/types'

const execFile = promisify(execFileCallback)
const statePath = () => join(rootPath(), '.codex', 'skill-state.yaml')

export type SkillTarget = 'claude' | 'codex' | 'deepseekHarness' | 'hermes' | 'openclaw'
export type SkillTargets = Record<SkillTarget, boolean>

export function appSkillDirectories(): Record<SkillTarget, string> {
  const root = rootPath()
  return {
    claude: join(root, '.claude', 'skills'),
    codex: join(root, '.codex', 'skills'),
    deepseekHarness: join(root, '.dsh', 'deepseek-harness', '.agents', 'skills'),
    hermes: join(root, '.hermes', 'skills'),
    openclaw: join(root, '.openclaw', 'skills'),
  }
}

export type SkillRecord = {
  id: string
  name: string
  description: string
  license?: string
  source: string
  version: string
  updatedAt?: string
  tags: string[]
  url?: string
  installed: boolean
  enabled: boolean
  targets: SkillTargets
}

export type SkillMarketplace = {
  skills: SkillRecord[]
  tags: Array<{ id: string; categoryId: number; label: string }>
  page: number
  per_page: number
  total: number
  total_pages: number
}

export function parseSkillDocument(raw: string): { name: string; description: string; license?: string } {
  const match = raw.match(/^---\s*\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/)
  const frontmatter = match ? YAML.parse(match[1]) as Record<string, unknown> : {}
  return {
    name: typeof frontmatter.name === 'string' ? frontmatter.name : '',
    description: typeof frontmatter.description === 'string' ? frontmatter.description : '',
    license: typeof frontmatter.license === 'string' ? frontmatter.license : undefined,
  }
}

function safeSkillId(id: string): boolean {
  return /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(id) && id !== '.' && id !== '..'
}

async function readState(): Promise<Record<string, boolean>> {
  try {
    const parsed = YAML.parse(await readFile(statePath(), 'utf8')) as { enabled?: Record<string, boolean> } | null
    return parsed?.enabled && typeof parsed.enabled === 'object' ? parsed.enabled : {}
  } catch {
    return {}
  }
}

async function writeState(enabled: Record<string, boolean>): Promise<void> {
  await writeFile(statePath(), YAML.stringify({ enabled }, { indent: 2 }), 'utf8')
}

async function skillFiles(directory: string): Promise<string[]> {
  const found: string[] = []
  const entries = await readdir(directory, { withFileTypes: true }).catch(() => [])
  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name === '.git') continue
    const path = join(directory, entry.name)
    if (entry.isDirectory()) found.push(...await skillFiles(path))
    else if (entry.isFile() && entry.name.toLowerCase() === 'skill.md') found.push(path)
  }
  return found
}

function emptyTargets(): SkillTargets {
  return { claude: false, codex: false, deepseekHarness: false, hermes: false, openclaw: false }
}

function marketplaceRecord(raw: Record<string, unknown>, installed: boolean, enabled: boolean, targets = emptyTargets()): SkillRecord {
  const description = raw.description && typeof raw.description === 'object'
    ? (raw.description as Record<string, unknown>).zh ?? (raw.description as Record<string, unknown>).en
    : raw.description
  const source = raw.source && typeof raw.source === 'object'
    ? (raw.source as Record<string, unknown>).from ?? (raw.source as Record<string, unknown>).author
    : undefined
  const tags = Array.isArray(raw.tags) ? raw.tags.filter((tag): tag is string => typeof tag === 'string') : []
  return {
    id: typeof raw.id === 'string' ? raw.id : typeof raw.name === 'string' ? raw.name : '',
    name: typeof raw.name === 'string' ? raw.name : typeof raw.id === 'string' ? raw.id : '',
    description: typeof description === 'string' ? description : '',
    source: typeof source === 'string' ? source : 'Github',
    version: typeof raw.version === 'string' ? raw.version : '1.0.0',
    tags,
    url: typeof raw.url === 'string' ? raw.url : undefined,
    installed,
    enabled,
    targets,
  }
}

export async function listInstalledSkills(): Promise<SkillRecord[]> {
  const enabledState = await readState()
  // 以 .openclaw/skills 作为「已安装」的权威来源：用户手动放入该目录的技能即视为已安装。
  const openclawIds = new Set<string>()
  for (const file of await skillFiles(appSkillDirectories().openclaw)) {
    openclawIds.add(basename(resolve(file, '..')))
  }
  const merged = new Map<string, SkillRecord>()
  for (const [target, directory] of Object.entries(appSkillDirectories()) as Array<[SkillTarget, string]>) {
    const files = await skillFiles(directory)
    for (const file of files) {
      const id = basename(resolve(file, '..'))
      if (!openclawIds.has(id)) continue
      const raw = await readFile(file, 'utf8').catch(() => '')
      const metadata = parseSkillDocument(raw)
      const previous = merged.get(id)
      const targets = previous?.targets ?? emptyTargets()
      targets[target] = true
      merged.set(id, previous ?? {
        id,
        name: metadata.name || id,
        description: metadata.description,
        license: metadata.license,
        source: id.startsWith('.') ? '系统' : '本地',
        version: '已安装',
        tags: [],
        installed: true,
        enabled: enabledState[id] !== false,
        targets,
      })
    }
  }
  return [...merged.values()].sort((a, b) => a.name.localeCompare(b.name))
}

export async function fetchMarketplace(config: LauncherConfig, params = new URLSearchParams()): Promise<SkillMarketplace> {
  const marketplaceUrl = new URL(dongchuangPlatformUrl(config.global.api.baseUrl, 'skill-store/marketplace'))
  const positiveInteger = (value: string | null, fallback: number) => {
    const parsed = Number(value)
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback
  }
  marketplaceUrl.searchParams.set('page', String(positiveInteger(params.get('page'), 1)))
  marketplaceUrl.searchParams.set('per_page', String(Math.min(positiveInteger(params.get('per_page'), 50), 100)))
  const categoryId = positiveInteger(params.get('category_id'), 0)
  if (categoryId) marketplaceUrl.searchParams.set('category_id', String(categoryId))
  const search = params.get('search')?.trim()
  if (search) marketplaceUrl.searchParams.set('search', search)
  const response = await fetch(marketplaceUrl)
  if (!response.ok) throw new Error(`技能市场请求失败：${response.status}`)
  const payload = await response.json() as { code?: number; data?: { value?: { marketplace?: unknown[]; page: number; per_page: number; total: number; total_pages: number } } }
  const value = payload.data?.value
  if (payload.code !== 200 || !value || !Array.isArray(value.marketplace)) throw new Error('技能市场返回数据无效')
  const categoriesResponse = await fetch(dongchuangPlatformUrl(config.global.api.baseUrl, 'skill-store/categories'))
  if (!categoriesResponse.ok) throw new Error(`技能分类请求失败：${categoriesResponse.status}`)
  const categories = await categoriesResponse.json() as { status?: number; data?: { categories?: Array<{ id: number; code: string; name: string }> } }
  if (categories.status !== 1 || !Array.isArray(categories.data?.categories)) throw new Error('技能分类返回数据无效')
  const installed = new Map((await listInstalledSkills()).map(skill => [skill.id, skill]))
  const rawSkills = payload.data?.value?.marketplace ?? []
  const skills = rawSkills
    .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object'))
    .map(raw => {
      const current = installed.get(String(raw.id ?? raw.name))
      return marketplaceRecord(raw, Boolean(current), current?.enabled ?? false, current?.targets)
    })
  const tags = categories.data.categories
    .filter(tag => Number.isSafeInteger(tag.id) && tag.id > 0 && tag.code && tag.code !== 'all')
    .map(tag => ({ id: tag.code, categoryId: tag.id, label: tag.name || tag.code }))
  return { skills, tags, page: value.page, per_page: value.per_page, total: value.total, total_pages: value.total_pages }
}

export async function setSkillEnabled(id: string, enabled: boolean): Promise<SkillRecord[]> {
  if (!safeSkillId(id)) throw new Error('技能 ID 无效')
  const state = await readState()
  state[id] = enabled
  await writeState(state)
  return listInstalledSkills()
}

export async function installSkill(id: string, url: string): Promise<SkillRecord[]> {
  if (!safeSkillId(id)) throw new Error('技能 ID 无效')
  if (!url.startsWith('https://')) throw new Error('技能下载地址必须使用 HTTPS')
  const response = await fetch(url)
  if (!response.ok) throw new Error(`技能下载失败：${response.status}`)
  const archive = Buffer.from(await response.arrayBuffer())
  if (archive.length > 100 * 1024 * 1024) throw new Error('技能压缩包超过 100MB')
  const temp = await mkdtemp(join(tmpdir(), 'usb-lobster-skill-'))
  const archivePath = join(temp, `${id}.zip`)
  try {
    await writeFile(archivePath, archive)
    await execFile(process.platform === 'win32' ? 'tar.exe' : 'tar', ['-xf', archivePath, '-C', temp])
    const files = await skillFiles(temp)
    if (!files.length) throw new Error('压缩包中未找到 SKILL.md')
    const skillFile = files[0]
    const source = resolve(skillFile, '..')
    const directories = appSkillDirectories()
    const backups = new Map<SkillTarget, string>()
    try {
      for (const [target, directory] of Object.entries(directories) as Array<[SkillTarget, string]>) {
        await mkdir(directory, { recursive: true })
        const destination = join(directory, id)
        const backup = join(temp, `backup-${target}`)
        if (await readFile(join(destination, 'SKILL.md'), 'utf8').catch(() => null) !== null) {
          await cp(destination, backup, { recursive: true })
          backups.set(target, backup)
        }
        await rm(destination, { recursive: true, force: true })
        await cp(source, destination, { recursive: true })
      }
    } catch (error) {
      for (const [target, directory] of Object.entries(directories) as Array<[SkillTarget, string]>) {
        const destination = join(directory, id)
        await rm(destination, { recursive: true, force: true })
        const backup = backups.get(target)
        if (backup) await cp(backup, destination, { recursive: true })
      }
      throw error
    }
    const state = await readState()
    state[id] = true
    await writeState(state)
    return listInstalledSkills()
  } finally {
    await rm(temp, { recursive: true, force: true })
  }
}

export async function uninstallSkill(id: string): Promise<SkillRecord[]> {
  if (!safeSkillId(id)) throw new Error('技能 ID 无效')
  for (const directory of Object.values(appSkillDirectories())) {
    const target = join(directory, id)
    if (!resolve(target).startsWith(resolve(directory) + '\\') && !resolve(target).startsWith(resolve(directory) + '/')) {
      throw new Error('技能卸载路径无效')
    }
    await rm(target, { recursive: true, force: true })
  }
  const state = await readState()
  delete state[id]
  await writeState(state)
  return listInstalledSkills()
}

export async function syncSkill(id: string): Promise<SkillRecord[]> {
  if (!safeSkillId(id)) throw new Error('技能 ID 无效')
  const directories = appSkillDirectories()
  const source = join(directories.codex, id)
  if (await readFile(join(source, 'SKILL.md'), 'utf8').catch(() => null) === null) {
    throw new Error('Codex 技能目录不存在，无法同步')
  }
  for (const [target, directory] of Object.entries(directories) as Array<[SkillTarget, string]>) {
    if (target === 'codex') continue
    await mkdir(directory, { recursive: true })
    await rm(join(directory, id), { recursive: true, force: true })
    await cp(source, join(directory, id), { recursive: true })
  }
  return listInstalledSkills()
}
