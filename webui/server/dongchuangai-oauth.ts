import { createHash, randomBytes } from 'node:crypto'
import { dongchuangPlatformUrl } from '../src/shared/dongchuangai'

const CLIENT_ID = 'dongchuangai-panel'
const SCOPE = 'openid profile model.completion'
const GRANT_TYPE = 'urn:ietf:params:oauth:grant-type:device_code'

export type DongchuangAIAuthPhase = 'pending' | 'success' | 'error' | 'cancelled'

export interface DongchuangAIAuthStatus {
  sessionKey: string
  phase: DongchuangAIAuthPhase
  userCode?: string
  verificationUri?: string
  message: string
  accountName?: string
  accountPhone?: string
}

export interface DongchuangAIAuthResult {
  apiKey: string
  baseUrl: string
  accountName?: string
  accountPhone?: string
}

interface AuthSession extends DongchuangAIAuthStatus {
  deviceCode: string
  verifier: string
  expiresAt: number
  pollIntervalMs: number
  nextPollAt: number
  platformBaseUrl: string
  modelBaseUrl: string
  result?: DongchuangAIAuthResult
}

const sessions = new Map<string, AuthSession>()

function base64Url(value: Buffer): string {
  return value.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function createPkce(): { verifier: string; challenge: string } {
  const verifier = base64Url(randomBytes(48))
  return { verifier, challenge: base64Url(createHash('sha256').update(verifier).digest()) }
}

function publicStatus(session: AuthSession): DongchuangAIAuthStatus {
  const { deviceCode: _deviceCode, verifier: _verifier, expiresAt: _expiresAt, pollIntervalMs: _pollIntervalMs, nextPollAt: _nextPollAt, result: _result, ...status } = session
  return status
}

async function fetchJson(url: string, init: RequestInit): Promise<{ ok: boolean; status: number; data: Record<string, unknown> }> {
  const response = await fetch(url, init)
  const data = await response.json().catch(() => ({}))
  return { ok: response.ok, status: response.status, data: data && typeof data === 'object' ? data as Record<string, unknown> : {} }
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function profileValue(profile: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = stringValue(profile[key])
    if (value) return value
  }
  return ''
}

export async function startDongchuangAIAuth(modelBaseUrl: string): Promise<DongchuangAIAuthStatus> {
  const platformBaseUrl = dongchuangPlatformUrl(modelBaseUrl, 'oauth2').replace(/\/oauth2$/, '')
  const { verifier, challenge } = createPkce()
  const body = new URLSearchParams({
    client_id: CLIENT_ID,
    scope: SCOPE,
    code_challenge: challenge,
    code_challenge_method: 'S256',
  })
  const response = await fetchJson(`${platformBaseUrl}/oauth2/device/code`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
    body,
  })
  const deviceCode = stringValue(response.data.device_code)
  const userCode = stringValue(response.data.user_code)
  const verificationUri = stringValue(response.data.verification_uri_complete) || stringValue(response.data.verification_uri)
  if (!response.ok || !deviceCode || !userCode || !verificationUri) {
    throw new Error(stringValue(response.data.error_description) || stringValue(response.data.error) || `东创 AI 授权码请求失败 (${response.status})`)
  }
  const expiresIn = Number(response.data.expires_in) || 600
  const pollIntervalMs = Math.max(1000, (Number(response.data.interval) || 3) * 1000)
  const session: AuthSession = {
    sessionKey: randomBytes(24).toString('hex'),
    phase: 'pending',
    userCode,
    verificationUri,
    message: '请在浏览器中完成东创 AI 授权',
    deviceCode,
    verifier,
    expiresAt: Date.now() + expiresIn * 1000,
    pollIntervalMs,
    nextPollAt: Date.now() + pollIntervalMs,
    platformBaseUrl,
    modelBaseUrl,
  }
  sessions.set(session.sessionKey, session)
  return publicStatus(session)
}

export async function getDongchuangAIAuthStatus(sessionKey: string): Promise<{ status: DongchuangAIAuthStatus; result?: DongchuangAIAuthResult }> {
  const session = sessions.get(sessionKey)
  if (!session) throw new Error('授权会话不存在或已过期')
  if (session.phase !== 'pending') return { status: publicStatus(session), result: session.result }
  if (Date.now() >= session.expiresAt) {
    session.phase = 'error'
    session.message = '授权码已过期，请重新登录'
    return { status: publicStatus(session) }
  }
  if (Date.now() < session.nextPollAt) return { status: publicStatus(session) }

  session.nextPollAt = Date.now() + session.pollIntervalMs
  const body = new URLSearchParams({ grant_type: GRANT_TYPE, device_code: session.deviceCode, code_verifier: session.verifier })
  const response = await fetchJson(`${session.platformBaseUrl}/oauth2/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
    body,
  })
  const error = stringValue(response.data.error)
  if (error === 'authorization_pending') return { status: publicStatus(session) }
  if (error === 'slow_down') {
    session.pollIntervalMs = Math.min(session.pollIntervalMs + 5000, 30000)
    return { status: publicStatus(session) }
  }
  if (!response.ok || error) {
    session.phase = 'error'
    session.message = stringValue(response.data.error_description) || error || `东创 AI 授权失败 (${response.status})`
    return { status: publicStatus(session) }
  }
  const accessToken = stringValue(response.data.access_token)
  if (!accessToken) {
    session.phase = 'error'
    session.message = '东创 AI 未返回有效授权令牌'
    return { status: publicStatus(session) }
  }
  const headers = { accept: 'application/json', authorization: `Bearer ${accessToken}` }
  const [profileResponse, keyResponse] = await Promise.all([
    fetchJson(`${session.platformBaseUrl}/oauth2/userinfo`, { headers }),
    fetchJson(`${session.platformBaseUrl}/oauth2/latest-api-key`, { headers }),
  ])
  const apiKey = stringValue(keyResponse.data.api_key)
  if (!keyResponse.ok || !apiKey) {
    session.phase = 'error'
    session.message = stringValue(keyResponse.data.error_description) || stringValue(keyResponse.data.error) || '该东创 AI 账号没有可用 API Key'
    return { status: publicStatus(session) }
  }
  const profileData = profileResponse.data.data && typeof profileResponse.data.data === 'object'
    ? profileResponse.data.data as Record<string, unknown>
    : profileResponse.data
  session.result = {
    apiKey,
    baseUrl: session.modelBaseUrl,
    accountName: profileValue(profileData, ['nickname', 'username', 'name', 'email', 'phone']),
    accountPhone: profileValue(profileData, ['phone', 'phoneNumber', 'phone_number', 'mobile']),
  }
  session.phase = 'success'
  session.message = '东创 AI 授权成功，正在同步应用配置'
  session.accountName = session.result.accountName
  session.accountPhone = session.result.accountPhone
  return { status: publicStatus(session), result: session.result }
}

export function cancelDongchuangAIAuth(sessionKey: string): DongchuangAIAuthStatus {
  const session = sessions.get(sessionKey)
  if (!session) throw new Error('授权会话不存在或已过期')
  session.phase = 'cancelled'
  session.message = '已取消东创 AI 授权'
  return publicStatus(session)
}
