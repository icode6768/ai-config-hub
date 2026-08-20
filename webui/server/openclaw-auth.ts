import { randomBytes } from 'node:crypto'
import { chmod, mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import JSON5 from 'json5'
import type { AppId, LauncherConfig } from '../src/shared/types'
import { APP_FILE_BINDINGS, rootPath } from '../src/shared/paths'
import { readTextIfExists, saveAppFile, syncAppPayload } from '../src/shared/config'

export function openclawGatewayTokenPath(): string {
  return join(rootPath(), '.openclaw', 'state', 'gateway-token')
}

function tokenFromConfig(raw: string): string {
  try {
    const parsed = JSON5.parse(raw) as Record<string, unknown>
    const gateway = parsed.gateway && typeof parsed.gateway === 'object' ? parsed.gateway as Record<string, unknown> : undefined
    const auth = gateway?.auth && typeof gateway.auth === 'object' ? gateway.auth as Record<string, unknown> : undefined
    return typeof auth?.token === 'string' ? auth.token.trim() : ''
  } catch {
    return ''
  }
}

async function writeGatewayToken(token: string): Promise<void> {
  const filePath = openclawGatewayTokenPath()
  await mkdir(join(rootPath(), '.openclaw', 'state'), { recursive: true })
  await writeFile(filePath, `${token}\n`, 'utf8')
  await chmod(filePath, 0o600).catch(() => undefined)
}

let cachedToken: string | null = null

export async function ensureOpenclawGatewayToken(): Promise<string> {
  if (cachedToken) return cachedToken
  const configRaw = await readTextIfExists(APP_FILE_BINDINGS.openclaw.path) ?? ''
  const configToken = tokenFromConfig(configRaw)
  const fileToken = (await readTextIfExists(openclawGatewayTokenPath()) ?? '').trim()
  const envToken = (process.env.OPENCLAW_GATEWAY_TOKEN ?? '').trim()
  const token = configToken || fileToken || envToken || randomBytes(24).toString('hex')
  if (fileToken !== token) await writeGatewayToken(token)
  cachedToken = token
  return token
}

export async function ensureOpenclawGatewayConfig(config: LauncherConfig): Promise<void> {
  const token = await ensureOpenclawGatewayToken()
  const currentRaw = await readTextIfExists(APP_FILE_BINDINGS.openclaw.path) ?? ''
  const port = Number.parseInt(new URL(config.global.launch.webUrls.openclaw).port, 10) || 18789
  const payload = syncAppPayload('openclaw', config, currentRaw, {
    openclawGatewayToken: token,
    openclawGatewayPort: port,
    openclawWorkspace: join(rootPath(), '.openclaw', 'workspace'),
  })
  await saveAppFile('openclaw', payload)
}

export async function buildAppEntryUrl(appId: AppId, target: string): Promise<string> {
  if (appId !== 'openclaw') return target
  const token = await ensureOpenclawGatewayToken()
  const parsed = new URL(target)
  const fragment = new URLSearchParams(parsed.hash.startsWith('#') ? parsed.hash.slice(1) : parsed.hash)
  fragment.set('token', token)
  parsed.hash = fragment.toString()
  return parsed.toString()
}
