import { randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { copyFile, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import JSON5 from 'json5'
import QRCode from 'qrcode'
import { loadGlobalConfig, saveGlobalConfig } from '../src/shared/config'
import type { AppId } from '../src/shared/types'
import { APP_FILE_BINDINGS, rootPath } from '../src/shared/paths'

const QR_API_BASE_URL = 'https://ilinkai.weixin.qq.com'
const QR_BOT_TYPE = '3'
const LOGIN_TTL_MS = 8 * 60_000
const POLL_TIMEOUT_MS = 35_000

type LoginStatus = 'waiting' | 'scanned' | 'need_verifycode' | 'connected' | 'expired' | 'error'

type LoginSession = {
  sessionKey: string
  appId: AppId
  qrcode: string
  qrcodeUrl: string
  qrDataUrl: string
  startedAt: number
  baseUrl: string
  status: LoginStatus
  message: string
  accountId?: string
  userId?: string
  pendingVerifyCode?: string
  polling: boolean
}

type QRResponse = {
  qrcode?: string
  qrcode_img_content?: string
}

type QRStatusResponse = {
  status?: string
  bot_token?: string
  ilink_bot_id?: string
  ilink_user_id?: string
  baseurl?: string
  redirect_host?: string
}

type WeixinAccountFile = {
  token?: string
  baseUrl?: string
  userId?: string
}

type LocalAccount = {
  accountId: string
  token: string
  baseUrl?: string
}

const sessions = new Map<string, LoginSession>()

function purgeSessions(): void {
  const cutoff = Date.now() - LOGIN_TTL_MS
  for (const [key, session] of sessions) {
    if (session.startedAt < cutoff && session.status !== 'connected') sessions.delete(key)
  }
}

function publicSession(session: LoginSession): Record<string, unknown> {
  return {
    sessionKey: session.sessionKey,
    qrDataUrl: session.qrDataUrl,
    qrcodeUrl: session.qrcodeUrl,
    status: session.status,
    message: session.message,
    accountId: session.accountId,
    userId: session.userId,
  }
}

async function fetchJson(url: string, init: RequestInit, timeoutMs: number): Promise<any> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(url, { ...init, signal: controller.signal })
    const text = await response.text()
    if (!response.ok) throw new Error(`微信接口返回 HTTP ${response.status}: ${text.slice(0, 300)}`)
    try {
      return JSON.parse(text) as unknown
    } catch {
      throw new Error(`微信接口返回了无效 JSON: ${text.slice(0, 300)}`)
    }
  } finally {
    clearTimeout(timer)
  }
}

async function getLocalAccounts(): Promise<LocalAccount[]> {
  const indexPath = join(rootPath(), '.openclaw', 'state', 'openclaw-weixin', 'accounts.json')
  if (!existsSync(indexPath)) return []
  try {
    const parsed = JSON.parse(await readFile(indexPath, 'utf8')) as unknown
    if (!Array.isArray(parsed)) return []
    const accounts: LocalAccount[] = []
    for (const accountId of [...parsed].reverse()) {
      if (typeof accountId !== 'string' || accounts.length >= 10) continue
      const accountPath = join(rootPath(), '.openclaw', 'state', 'openclaw-weixin', 'accounts', `${accountId}.json`)
      try {
        const account = JSON.parse(await readFile(accountPath, 'utf8')) as WeixinAccountFile
        if (typeof account.token === 'string' && account.token.trim()) {
          accounts.push({ accountId, token: account.token.trim(), baseUrl: account.baseUrl })
        }
      } catch {
        // Ignore stale or malformed account files and continue with other accounts.
      }
    }
    return accounts
  } catch {
    return []
  }
}

async function getLocalBotTokenList(): Promise<string[]> {
  return (await getLocalAccounts()).map(account => account.token)
}

async function requestQRCode(appId: AppId): Promise<{ qrcode: string; qrcodeUrl: string; qrDataUrl: string }> {
  const isHermes = appId === 'hermes'
  const result = await fetchJson(
    `${QR_API_BASE_URL}/ilink/bot/get_bot_qrcode?bot_type=${QR_BOT_TYPE}`,
    isHermes
      ? {}
      : {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ local_token_list: await getLocalBotTokenList() }),
        },
    12_000,
  ) as QRResponse
  if (!result.qrcode || !result.qrcode_img_content) throw new Error('微信接口未返回有效二维码')
  return {
    qrcode: result.qrcode,
    qrcodeUrl: result.qrcode_img_content,
    qrDataUrl: await QRCode.toDataURL(result.qrcode_img_content, { width: 320, margin: 2 }),
  }
}

async function pollQRCode(session: LoginSession): Promise<void> {
  if (session.polling) return
  session.polling = true
  try {
    while (Date.now() - session.startedAt < LOGIN_TTL_MS) {
      if (session.status === 'need_verifycode' && !session.pendingVerifyCode) return
      const query = new URLSearchParams({ qrcode: session.qrcode })
      if (session.pendingVerifyCode) query.set('verify_code', session.pendingVerifyCode)
      let result: QRStatusResponse
      try {
        result = await fetchJson(`${session.baseUrl}/ilink/bot/get_qrcode_status?${query}`, {}, POLL_TIMEOUT_MS) as QRStatusResponse
      } catch {
        await new Promise(resolve => setTimeout(resolve, 1000))
        continue
      }

      switch (result.status) {
        case 'wait':
          session.status = 'waiting'
          session.message = '请使用手机微信扫描二维码'
          break
        case 'scaned':
          session.status = 'scanned'
          session.message = '已扫码，请在手机微信中确认'
          session.pendingVerifyCode = undefined
          break
        case 'need_verifycode':
          session.status = 'need_verifycode'
          session.message = '请输入手机微信显示的验证码'
          return
        case 'scaned_but_redirect':
          if (result.redirect_host) session.baseUrl = `https://${result.redirect_host}`
          session.status = 'scanned'
          session.message = '已扫码，正在验证'
          break
        case 'expired': {
          const qr = await requestQRCode(session.appId)
          session.qrcode = qr.qrcode
          session.qrcodeUrl = qr.qrcodeUrl
          session.qrDataUrl = qr.qrDataUrl
          session.startedAt = Date.now()
          session.status = 'waiting'
          session.message = '二维码已刷新，请重新扫描'
          break
        }
        case 'binded_redirect':
          if (session.appId !== 'openclaw') {
            const existing = (await getLocalAccounts())[0]
            if (existing) {
              const accountId = session.appId === 'hermes'
                ? denormalizeAccountId(existing.accountId)
                : existing.accountId
              session.accountId = accountId
              await persistConnection(session.appId, {
                accountId,
                token: existing.token,
                baseUrl: existing.baseUrl || session.baseUrl,
              })
            }
          }
          session.status = 'connected'
          session.message = session.appId === 'openclaw'
            ? '此微信已经连接过 OpenClaw'
            : '此微信已连接过，已复用本地微信凭据'
          return
        case 'verify_code_blocked':
          session.status = 'error'
          session.message = '验证码错误次数过多，请重新生成二维码'
          return
        case 'confirmed':
          if (!result.ilink_bot_id || !result.bot_token) {
            session.status = 'error'
            session.message = '登录失败：微信接口未返回账号凭据'
            return
          }
          const rawAccountId = result.ilink_bot_id
          session.accountId = session.appId === 'openclaw'
            ? normalizeAccountId(rawAccountId)
            : rawAccountId
          session.userId = result.ilink_user_id
          await persistConnection(session.appId, {
            accountId: session.accountId,
            token: result.bot_token,
            baseUrl: result.baseurl || session.baseUrl,
            userId: result.ilink_user_id,
          })
          session.status = 'connected'
          session.message = session.appId === 'openclaw'
            ? 'OpenClaw 微信连接已建立'
            : session.appId === 'hermes'
              ? 'Hermes Agent 微信连接已建立，已写入原生 iLink 配置'
              : `${appLabel(session.appId)} 微信凭据已保存；该应用暂无原生微信通道`
          return
        default:
          session.status = 'error'
          session.message = `微信登录返回了未知状态: ${result.status ?? '空'}`
          return
      }
      await new Promise(resolve => setTimeout(resolve, 1000))
    }
    session.status = 'expired'
    session.message = '二维码已过期，请重新开始扫码'
  } finally {
    session.polling = false
  }
}

function normalizeAccountId(accountId: string): string {
  return accountId
    .replace(/@im\.bot$/i, '-im-bot')
    .replace(/@im\.wechat$/i, '-im-wechat')
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
}

function denormalizeAccountId(accountId: string): string {
  if (accountId.endsWith('-im-bot')) return `${accountId.slice(0, -7)}@im.bot`
  if (accountId.endsWith('-im-wechat')) return `${accountId.slice(0, -10)}@im.wechat`
  return accountId
}

function appLabel(appId: AppId): string {
  return {
    openclaw: 'OpenClaw',
    hermes: 'Hermes Agent',
    claude: 'Claude Code',
    codex: 'Codex',
    'deepseek-harness': 'DeepSeek Harness',
  }[appId]
}

async function updateOpenclawConfig(filePath: string, accountId: string): Promise<void> {
  let config: Record<string, any> = {}
  if (existsSync(filePath)) {
    try {
      config = JSON5.parse(await readFile(filePath, 'utf8')) as Record<string, any>
    } catch {
      throw new Error(`OpenClaw 配置文件不是有效 JSON/JSON5，未覆盖: ${filePath}`)
    }
  }
  const channels = config.channels && typeof config.channels === 'object' ? config.channels : {}
  const channel = channels['openclaw-weixin'] && typeof channels['openclaw-weixin'] === 'object'
    ? channels['openclaw-weixin']
    : {}
  const accounts = channel.accounts && typeof channel.accounts === 'object' ? channel.accounts : {}
  config.channels = {
    ...channels,
    'openclaw-weixin': {
      ...channel,
      channelConfigUpdatedAt: new Date().toISOString(),
      accounts: {
        ...accounts,
        [accountId]: { ...(accounts[accountId] ?? {}), enabled: true },
      },
    },
  }
  const plugins = config.plugins && typeof config.plugins === 'object' ? config.plugins : {}
  const allow = Array.isArray(plugins.allow)
    ? plugins.allow.filter((value: unknown): value is string => typeof value === 'string')
    : []
  const entries = plugins.entries && typeof plugins.entries === 'object' ? plugins.entries : {}
  const weixinEntry = entries['openclaw-weixin'] && typeof entries['openclaw-weixin'] === 'object'
    ? entries['openclaw-weixin']
    : {}
  const managedPlugins = ['openclaw-weixin', 'usb-lobster-router']
  config.plugins = {
    ...plugins,
    allow: [...new Set([...allow, ...managedPlugins])],
    entries: {
      ...entries,
      'openclaw-weixin': { ...weixinEntry, enabled: true },
      'usb-lobster-router': {
        ...(entries['usb-lobster-router'] && typeof entries['usb-lobster-router'] === 'object' ? entries['usb-lobster-router'] : {}),
        enabled: true,
      },
    },
  }
  await mkdir(dirname(filePath), { recursive: true })
  await writeFile(filePath, `${JSON5.stringify(config, null, 2)}\n`, 'utf8')
}

async function persistOpenclawConnection(input: { accountId: string; token: string; baseUrl: string; userId?: string }): Promise<void> {
  const stateDir = join(rootPath(), '.openclaw', 'state')
  const accountsDir = join(stateDir, 'openclaw-weixin', 'accounts')
  await mkdir(accountsDir, { recursive: true })
  await writeFile(join(accountsDir, `${input.accountId}.json`), `${JSON.stringify({
    token: input.token,
    savedAt: new Date().toISOString(),
    baseUrl: input.baseUrl,
    ...(input.userId ? { userId: input.userId } : {}),
  }, null, 2)}\n`, 'utf8')

  const indexPath = join(stateDir, 'openclaw-weixin', 'accounts.json')
  let accountIds: string[] = []
  if (existsSync(indexPath)) {
    try {
      const parsed = JSON.parse(await readFile(indexPath, 'utf8')) as unknown
      if (Array.isArray(parsed)) accountIds = parsed.filter((value): value is string => typeof value === 'string')
    } catch {
      accountIds = []
    }
  }
  if (!accountIds.includes(input.accountId)) accountIds.push(input.accountId)
  await writeFile(indexPath, `${JSON.stringify(accountIds, null, 2)}\n`, 'utf8')

  const requestedConfigPath = APP_FILE_BINDINGS.openclaw.path
  const runtimeConfigPath = join(stateDir, 'openclaw.json')
  await updateOpenclawConfig(requestedConfigPath, input.accountId)
  if (runtimeConfigPath !== requestedConfigPath) await updateOpenclawConfig(runtimeConfigPath, input.accountId)

}

/** Rebuild OpenClaw's local WeChat channel after a gateway config repair. */
export async function restoreOpenclawWechatConnection(): Promise<boolean> {
  const wechat = (await loadGlobalConfig()).apps.openclaw.wechat
  if (!wechat.enabled || !wechat.accountId || !wechat.token) return false
  await persistOpenclawConnection({
    accountId: wechat.accountId,
    token: wechat.token,
    baseUrl: wechat.baseUrl,
  })
  return true
}

async function updateDotEnv(filePath: string, values: Record<string, string>): Promise<void> {
  const existing = existsSync(filePath) ? await readFile(filePath, 'utf8') : ''
  const lines = existing.split(/\r?\n/)
  if (lines.length && lines[lines.length - 1] === '') lines.pop()

  for (const [key, value] of Object.entries(values)) {
    const line = `${key}=${value}`
    const index = lines.findIndex(item => new RegExp(`^\\s*${key.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}\\s*=`).test(item))
    if (index >= 0) lines[index] = line
    else lines.push(line)
  }

  await mkdir(dirname(filePath), { recursive: true })
  await writeFile(filePath, `${lines.join('\n')}\n`, 'utf8')
}

export async function persistHermesConnection(
  input: { accountId: string; token: string; baseUrl: string; userId?: string },
  hermesHome = join(rootPath(), '.hermes'),
): Promise<void> {
  if (!input.accountId || /[\\/]/.test(input.accountId)) throw new Error('Hermes 微信账号 ID 无效')
  const accountDir = join(hermesHome, 'weixin', 'accounts')
  await mkdir(accountDir, { recursive: true })
  await writeFile(join(accountDir, `${input.accountId}.json`), `${JSON.stringify({
    token: input.token,
    base_url: input.baseUrl,
    user_id: input.userId ?? '',
    saved_at: new Date().toISOString(),
  }, null, 2)}\n`, 'utf8')

  await updateDotEnv(join(hermesHome, '.env'), {
    WEIXIN_ACCOUNT_ID: input.accountId,
    WEIXIN_TOKEN: input.token,
    WEIXIN_BASE_URL: input.baseUrl,
    WEIXIN_CDN_BASE_URL: 'https://novac2c.cdn.weixin.qq.com/c2c',
    WEIXIN_DM_POLICY: 'pairing',
    WEIXIN_ALLOW_ALL_USERS: 'false',
    WEIXIN_ALLOWED_USERS: '',
    WEIXIN_GROUP_POLICY: 'disabled',
    WEIXIN_GROUP_ALLOWED_USERS: '',
    ...(input.userId ? { WEIXIN_HOME_CHANNEL: input.userId } : {}),
  })
}

export type WechatMigrationResult = {
  backupPath: string
  disabledApps: AppId[]
  removedHermesAccountFiles: number
}

function removeWechatEnvironment(raw: string): string {
  const retained = raw
    .split(/\r?\n/)
    .filter(line => !/^\s*WEIXIN_[A-Z0-9_]*\s*=/.test(line))
    .filter((line, index, lines) => line || index < lines.length - 1)
  return `${retained.join('\n')}\n`
}

/** Keep only OpenClaw as the process that owns WeChat bot credentials. */
export async function migrateLegacyWechatConnections(): Promise<WechatMigrationResult> {
  const root = rootPath()
  const backupPath = join(
    root,
    '.openclaw',
    'state',
    'backups',
    `wechat-single-entry-${new Date().toISOString().replace(/[:.]/g, '-')}`,
  )
  await mkdir(backupPath, { recursive: true })

  const configPath = join(root, 'config.yaml')
  if (existsSync(configPath)) await copyFile(configPath, join(backupPath, 'config.yaml'))

  const hermesHome = join(root, '.hermes')
  const hermesEnvPath = join(hermesHome, '.env')
  if (existsSync(hermesEnvPath)) await copyFile(hermesEnvPath, join(backupPath, 'hermes.env'))

  const hermesAccountsPath = join(hermesHome, 'weixin', 'accounts')
  let removedHermesAccountFiles = 0
  if (existsSync(hermesAccountsPath)) {
    const entries = await readdir(hermesAccountsPath, { withFileTypes: true })
    await mkdir(join(backupPath, 'hermes-weixin-accounts'), { recursive: true })
    for (const entry of entries) {
      if (!entry.isFile()) continue
      await copyFile(join(hermesAccountsPath, entry.name), join(backupPath, 'hermes-weixin-accounts', entry.name))
      await rm(join(hermesAccountsPath, entry.name), { force: true })
      removedHermesAccountFiles += 1
    }
  }

  if (existsSync(hermesEnvPath)) {
    await writeFile(hermesEnvPath, removeWechatEnvironment(await readFile(hermesEnvPath, 'utf8')), 'utf8')
  }

  const config = await loadGlobalConfig()
  const disabledApps: AppId[] = ['hermes', 'claude', 'codex', 'deepseek-harness']
  for (const appId of disabledApps) {
    config.apps[appId].wechat = {
      ...config.apps[appId].wechat,
      enabled: false,
      accountId: '',
      token: '',
    }
  }
  await saveGlobalConfig(config)
  return { backupPath, disabledApps, removedHermesAccountFiles }
}

/** Permanently remove every local WeChat authorization and force a fresh QR bind. */
export async function resetWechatConnections(): Promise<void> {
  const root = rootPath()
  sessions.clear()

  await rm(join(root, '.openclaw', 'state', 'openclaw-weixin'), { recursive: true, force: true })
  const backupsPath = join(root, '.openclaw', 'state', 'backups')
  if (existsSync(backupsPath)) {
    const entries = await readdir(backupsPath, { withFileTypes: true })
    await Promise.all(entries
      .filter(entry => entry.isDirectory() && entry.name.startsWith('wechat-single-entry-'))
      .map(entry => rm(join(backupsPath, entry.name), { recursive: true, force: true })))
  }

  const openclawConfigPath = join(root, '.openclaw', 'state', 'openclaw.json')
  if (existsSync(openclawConfigPath)) {
    const parsed = JSON5.parse(await readFile(openclawConfigPath, 'utf8')) as Record<string, unknown>
    const channels = parsed.channels
    if (channels && typeof channels === 'object' && !Array.isArray(channels)) {
      const nextChannels = { ...(channels as Record<string, unknown>) }
      delete nextChannels['openclaw-weixin']
      if (Object.keys(nextChannels).length) parsed.channels = nextChannels
      else delete parsed.channels
      await writeFile(openclawConfigPath, `${JSON5.stringify(parsed, null, 2)}\n`, 'utf8')
    }
  }

  const hermesHome = join(root, '.hermes')
  await rm(join(hermesHome, 'weixin', 'accounts'), { recursive: true, force: true })
  const hermesEnvPath = join(hermesHome, '.env')
  if (existsSync(hermesEnvPath)) {
    await writeFile(hermesEnvPath, removeWechatEnvironment(await readFile(hermesEnvPath, 'utf8')), 'utf8')
  }

  const config = await loadGlobalConfig()
  for (const appId of ['openclaw', 'hermes', 'claude', 'codex', 'deepseek-harness'] as AppId[]) {
    config.apps[appId].wechat = {
      ...config.apps[appId].wechat,
      enabled: false,
      accountId: '',
      token: '',
    }
  }
  await saveGlobalConfig(config)
}

async function persistConnection(appId: AppId, input: { accountId: string; token: string; baseUrl: string; userId?: string }): Promise<void> {
  if (appId === 'openclaw') await persistOpenclawConnection(input)
  if (appId === 'hermes') await persistHermesConnection(input)

  const config = await loadGlobalConfig()
  config.apps[appId].wechat = {
    ...config.apps[appId].wechat,
    enabled: true,
    accountId: input.accountId,
    token: input.token,
    baseUrl: input.baseUrl,
  }
  await saveGlobalConfig(config)
}

export async function startWechatLogin(appId: AppId): Promise<Record<string, unknown>> {
  if (appId !== 'openclaw') throw new Error('微信扫码仅由 OpenClaw 单入口提供')
  purgeSessions()
  const qr = await requestQRCode(appId)
  const session: LoginSession = {
    sessionKey: randomUUID(),
    appId,
    ...qr,
    startedAt: Date.now(),
    baseUrl: QR_API_BASE_URL,
    status: 'waiting',
    message: '请使用手机微信扫描二维码',
    polling: false,
  }
  sessions.set(session.sessionKey, session)
  void pollQRCode(session)
  return publicSession(session)
}

export function getWechatStatus(sessionKey: string): Record<string, unknown> | null {
  const session = sessions.get(sessionKey)
  return session ? publicSession(session) : null
}

export function submitWechatVerifyCode(sessionKey: string, verifyCode: string): Record<string, unknown> | null {
  const session = sessions.get(sessionKey)
  if (!session || session.status !== 'need_verifycode') return session ? publicSession(session) : null
  session.pendingVerifyCode = verifyCode.trim()
  session.status = 'scanned'
  session.message = '验证码已提交，正在验证'
  void pollQRCode(session)
  return publicSession(session)
}

export const startOpenclawWechatLogin = (): Promise<Record<string, unknown>> => startWechatLogin('openclaw')
export const getOpenclawWechatStatus = (sessionKey: string): Record<string, unknown> | null => getWechatStatus(sessionKey)
export const submitOpenclawWechatVerifyCode = (sessionKey: string, verifyCode: string): Record<string, unknown> | null => submitWechatVerifyCode(sessionKey, verifyCode)
