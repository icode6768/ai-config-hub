import { createServer as createHttpServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { existsSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { join } from 'node:path'
import { createServer as createViteServer } from 'vite'
import { APP_IDS, type AppId, type AppFileState, type LauncherConfig, type RuntimeVersions } from '../src/shared/types'
import { APP_FILE_BINDINGS, dshHomePath, globalConfigPath, rootPath } from '../src/shared/paths'
import { applySharedApi, defaultLauncherConfig, inferSharedApiFromAppFiles, isStepComplete, loadAppFileState, loadGlobalConfig, saveAppFile, saveGlobalConfig, syncAppPayload } from '../src/shared/config'
import { syncRuntimeSystemPath } from '../src/shared/system-path'
import { ensureDshHome } from '../src/shared/dsh'
import { detectRuntimeVersions } from '../src/shared/runtime'
import { ensureDeepseekWechatBridge } from './deepseek-wechat'
import { getWechatStatus, migrateLegacyWechatConnections, resetWechatConnections, restoreOpenclawWechatConnection, startWechatLogin, submitWechatVerifyCode } from './openclaw-wechat'
import { getAppRuntimeStatuses, initializeAppProcesses, openAppTerminal, restartApp, shutdownAppProcesses, startApp, stopApp, updateApp } from './app-processes'
import { cancelDongchuangAIAuth, getDongchuangAIAuthStatus, startDongchuangAIAuth } from './dongchuangai-oauth'
import { buildAppEntryUrl, ensureOpenclawGatewayConfig, ensureOpenclawGatewayToken } from './openclaw-auth'
import { fetchMarketplace, installSkill, listInstalledSkills, setSkillEnabled, syncSkill, uninstallSkill } from './skill-store'
import { checkSoftwareUpdate, prepareSoftwareUpdate } from './software-update'

type Json = Record<string, unknown>

function stopChildProcesses(code: number): void {
  void shutdownAppProcesses().finally(() => process.exit(code))
}

process.once('SIGINT', () => stopChildProcesses(130))
process.once('SIGTERM', () => stopChildProcesses(143))

async function ensureGlobalFile(): Promise<LauncherConfig> {
  if (!existsSync(globalConfigPath())) {
    const defaults = defaultLauncherConfig()
    const inferred = await inferSharedApiFromAppFiles()
    if (inferred) {
      defaults.global.api = {
        ...defaults.global.api,
        ...inferred,
      }
    }
    await saveGlobalConfig(defaults)
    return defaults
  }
  const config = await loadGlobalConfig()
  const inferred = await inferSharedApiFromAppFiles()
  const shouldAdoptInferred = Boolean(
    inferred
    && (
      !config.global.api.apiKey
      || !config.global.api.baseUrl
      || !config.global.api.model
      || (
        config.global.api.baseUrl.includes('/anthropic')
        && inferred.baseUrl
        && inferred.baseUrl.includes('/v1')
      )
    ),
  )
  if (shouldAdoptInferred && inferred) {
    const merged: LauncherConfig = {
      ...config,
      global: {
        ...config.global,
        api: { ...config.global.api, ...inferred },
      },
    }
    await saveGlobalConfig(merged)
    return merged
  }
  return config
}

async function buildAppFiles(): Promise<Record<AppId, AppFileState>> {
  const entries = await Promise.all(APP_IDS.map(async id => [id, await loadAppFileState(id)] as const))
  return Object.fromEntries(entries) as Record<AppId, AppFileState>
}

async function openBrowser(url: string): Promise<void> {
  const platform = process.platform
  if (platform === 'win32') {
    spawn('cmd', ['/c', 'start', '', url], { detached: true, stdio: 'ignore', windowsHide: true }).unref()
    return
  }
  if (platform === 'darwin') {
    spawn('open', [url], { detached: true, stdio: 'ignore' }).unref()
    return
  }
  spawn('xdg-open', [url], { detached: true, stdio: 'ignore' }).unref()
}

async function readJsonBody(req: IncomingMessage): Promise<Json> {
  const chunks: Buffer[] = []
  for await (const chunk of req) chunks.push(Buffer.from(chunk))
  const raw = Buffer.concat(chunks).toString('utf8')
  return raw ? JSON.parse(raw) as Json : {}
}

function sendJson(res: ServerResponse, payload: unknown, status = 200): void {
  res.statusCode = status
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(payload, null, 2))
}

function sendText(res: ServerResponse, payload: string, status = 200): void {
  res.statusCode = status
  res.setHeader('content-type', 'text/plain; charset=utf-8')
  res.end(payload)
}

function nonNegativeInteger(value: string | null, name: string): number {
  if (value === null || !/^\d+$/.test(value)) throw new Error(`${name} 必须是非负整数`)
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed)) throw new Error(`${name} 超出有效范围`)
  return parsed
}

async function main(): Promise<void> {
  await ensureDshHome()
  process.env.DSH_HOME = dshHomePath()
  process.env.HERMES_HOME = join(rootPath(), '.hermes')
  process.env.OPENCLAW_GATEWAY_TOKEN = await ensureOpenclawGatewayToken()
  await ensureDeepseekWechatBridge()
  await initializeAppProcesses()

  const vite = await createViteServer({
    root: process.env.WEBUI_RUNTIME_DIR || join(rootPath(), 'webui'),
    appType: 'spa',
    server: {
      middlewareMode: true,
      host: '127.0.0.1',
      watch: null,
      hmr: false,
      // Vite 7 即使 hmr:false 仍会尝试在默认 HMR 端口 24678 上起 WebSocket
      // 服务器（创建失败只记 EADDRINUSE 错误，不退出）。但 harness 应用
      // （.dsh\deepseek-harness）自己的 Vite 也要绑 24678，launcher 先占住
      // 会让 harness 起不来（"WebSocket server error: Port 24678 is already
      // in use"）。ws:false 让 Vite 直接跳过 WS 服务器创建，彻底让出 24678。
      ws: false,
    },
  })

  let currentConfig = await ensureGlobalFile()
  await ensureOpenclawGatewayConfig(currentConfig)
  await restoreOpenclawWechatConnection()
  let currentFiles = await buildAppFiles()
  const runtimeVersions: RuntimeVersions = await detectRuntimeVersions()

  async function syncGlobalConfig(config: LauncherConfig): Promise<Awaited<ReturnType<typeof syncRuntimeSystemPath>>> {
    currentConfig = applySharedApi(config)
    await saveGlobalConfig(currentConfig)
    const systemPathResult = await syncRuntimeSystemPath(rootPath(), currentConfig.global.launch.persistSystemPath)
    await ensureOpenclawGatewayConfig(currentConfig)
    for (const appId of APP_IDS) {
      if (appId === 'openclaw') continue
      const raw = currentFiles[appId]?.raw ?? ''
      const payload = syncAppPayload(appId, currentConfig, raw)
      if (payload) await saveAppFile(appId, payload)
    }
    currentFiles = await buildAppFiles()
    return systemPathResult
  }

  const server = createHttpServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? '/', 'http://127.0.0.1')
      if (url.pathname === '/api/bootstrap' && req.method === 'GET') {
        currentConfig = await loadGlobalConfig()
        currentFiles = await buildAppFiles()
        const appStatuses = await getAppRuntimeStatuses(currentConfig, runtimeVersions)
        const installedSkills = await listInstalledSkills()
        sendJson(res, {
          config: currentConfig,
          appFiles: currentFiles,
          steps: isStepComplete(currentConfig, currentFiles, installedSkills.length),
          skills: installedSkills,
          platform: process.platform,
          runtime: {
            configExists: existsSync(globalConfigPath()),
            versions: runtimeVersions,
          },
          appStatuses,
        })
        return
      }

      if (url.pathname === '/api/software-update/check' && req.method === 'GET') {
        currentConfig = await loadGlobalConfig()
        const appId = url.searchParams.get('app_id')
        const userId = url.searchParams.get('user_id')
        if (appId !== null || userId !== null) {
          if (appId === null || userId === null) {
            sendJson(res, { error: 'app_id 和 user_id 必须同时提供' }, 400)
            return
          }
          let parsedAppId: number
          let parsedUserId: number
          try {
            parsedAppId = nonNegativeInteger(appId, 'app_id')
            parsedUserId = nonNegativeInteger(userId, 'user_id')
          } catch (error) {
            sendJson(res, { error: error instanceof Error ? error.message : '更新参数无效' }, 400)
            return
          }
          currentConfig = {
            ...currentConfig,
            global: {
              ...currentConfig.global,
              update: {
                app_id: parsedAppId,
                user_id: parsedUserId,
              },
            },
          }
        }
        sendJson(res, { ok: true, ...(await checkSoftwareUpdate(currentConfig)) })
        return
      }

      if (url.pathname === '/api/software-update/install' && req.method === 'POST') {
        const body = await readJsonBody(req)
        const version = typeof body.version === 'string' ? body.version : ''
        if (!version) {
          sendJson(res, { error: '缺少更新版本' }, 400)
          return
        }
        currentConfig = await loadGlobalConfig()
        try {
          await prepareSoftwareUpdate(currentConfig, version)
        } catch (error) {
          sendJson(res, { error: error instanceof Error ? error.message : '准备更新失败' }, 422)
          return
        }
        sendJson(res, { ok: true, message: '更新文件已直接覆盖到 webui，当前进程无需关闭' })
        return
      }

      if (url.pathname === '/api/apps/status' && req.method === 'GET') {
        currentConfig = await loadGlobalConfig()
        sendJson(res, { ok: true, appStatuses: await getAppRuntimeStatuses(currentConfig, runtimeVersions) })
        return
      }

      if (url.pathname === '/api/skills/marketplace' && req.method === 'GET') {
        currentConfig = await loadGlobalConfig()
        sendJson(res, await fetchMarketplace(currentConfig))
        return
      }

      if (url.pathname === '/api/skills/installed' && req.method === 'GET') {
        sendJson(res, { skills: await listInstalledSkills() })
        return
      }

      if (url.pathname === '/api/skills/install' && req.method === 'POST') {
        const body = await readJsonBody(req)
        const id = typeof body.id === 'string' ? body.id : ''
        const skillUrl = typeof body.url === 'string' ? body.url : ''
        const skills = await installSkill(id, skillUrl)
        sendJson(res, { ok: true, skills })
        return
      }

      if (url.pathname === '/api/skills/uninstall' && req.method === 'POST') {
        const body = await readJsonBody(req)
        const id = typeof body.id === 'string' ? body.id : ''
        sendJson(res, { ok: true, skills: await uninstallSkill(id) })
        return
      }

      if (url.pathname === '/api/skills/toggle' && req.method === 'POST') {
        const body = await readJsonBody(req)
        const id = typeof body.id === 'string' ? body.id : ''
        const enabled = body.enabled === true
        sendJson(res, { ok: true, skills: await setSkillEnabled(id, enabled) })
        return
      }

      if (url.pathname === '/api/skills/sync' && req.method === 'POST') {
        const body = await readJsonBody(req)
        const id = typeof body.id === 'string' ? body.id : ''
        sendJson(res, { ok: true, skills: await syncSkill(id) })
        return
      }

      const appAction = url.pathname.match(/^\/api\/apps\/([^/]+)\/(start|stop|restart|update|terminal(?:-desktop)?)$/)
      if (appAction) {
        if (req.method !== 'POST') {
          sendJson(res, { error: '该操作只支持 POST' }, 405)
          return
        }
        const appId = appAction[1] as AppId
        const action = appAction[2]
        if (!(APP_IDS as readonly string[]).includes(appId)) {
          sendJson(res, { error: 'Unknown app' }, 404)
          return
        }
        currentConfig = await loadGlobalConfig()
        if (appId === 'openclaw') {
          await ensureOpenclawGatewayConfig(currentConfig)
          await restoreOpenclawWechatConnection()
        }
        if (action === 'start') await startApp(appId, currentConfig)
        else if (action === 'stop') await stopApp(appId, currentConfig)
        else if (action === 'restart') await restartApp(appId, currentConfig)
        else if (action === 'update') await updateApp(appId, currentConfig)
        else await openAppTerminal(appId, currentConfig, { desktop: action === 'terminal-desktop' })
        sendJson(res, { ok: true, action, appId, appStatuses: await getAppRuntimeStatuses(currentConfig, runtimeVersions) })
        return
      }

      if (url.pathname === '/api/global-config' && req.method === 'POST') {
        const body = await readJsonBody(req)
        const next = body.config as LauncherConfig | undefined
        if (!next) {
          sendJson(res, { error: 'Missing config' }, 400)
          return
        }
        const systemPath = await syncGlobalConfig(next)
        sendJson(res, { ok: true, config: currentConfig, systemPath, steps: isStepComplete(currentConfig, currentFiles, (await listInstalledSkills()).length) })
        return
      }

      if (url.pathname === '/api/dongchuangai-auth/start' && req.method === 'POST') {
        currentConfig = await loadGlobalConfig()
        const auth = await startDongchuangAIAuth(currentConfig.global.api.baseUrl)
        await openBrowser(auth.verificationUri ?? 'https://dongchuangai.com/')
        sendJson(res, { ok: true, auth })
        return
      }

      if (url.pathname === '/api/dongchuangai-auth/status' && req.method === 'GET') {
        const sessionKey = url.searchParams.get('sessionKey') ?? ''
        if (!sessionKey) {
          sendJson(res, { error: '缺少授权会话' }, 400)
          return
        }
        let result
        try {
          result = await getDongchuangAIAuthStatus(sessionKey)
        } catch (error) {
          sendJson(res, { error: error instanceof Error ? error.message : '授权会话不存在或已过期' }, 404)
          return
        }
        if (result.status.phase === 'success' && result.result) {
          const api = currentConfig.global.api
          if (api.authSource !== 'dongchuangai-oauth' || api.apiKey !== result.result.apiKey) {
            await syncGlobalConfig({
              ...currentConfig,
              global: {
                ...currentConfig.global,
                api: {
                  ...api,
                  provider: 'dongchuangai',
                  baseUrl: result.result.baseUrl,
                  apiKey: result.result.apiKey,
                  model: 'gpt-5.5',
                  authSource: 'dongchuangai-oauth',
                  authAccountName: result.result.accountName,
                  authAccountPhone: result.result.accountPhone,
                },
              },
            })
          }
        }
        sendJson(res, { ok: true, auth: result.status })
        return
      }

      if (url.pathname === '/api/dongchuangai-auth/cancel' && req.method === 'POST') {
        const body = await readJsonBody(req)
        const sessionKey = typeof body.sessionKey === 'string' ? body.sessionKey : ''
        sendJson(res, { ok: true, auth: cancelDongchuangAIAuth(sessionKey) })
        return
      }

      if (url.pathname === '/api/dongchuangai-auth/logout' && req.method === 'POST') {
        const api = currentConfig.global.api
        if (api.authSource === 'dongchuangai-oauth') {
          const { authSource: _authSource, authAccountName: _authAccountName, authAccountPhone: _authAccountPhone, ...apiWithoutAuth } = api
          await syncGlobalConfig({
            ...currentConfig,
            global: {
              ...currentConfig.global,
              api: { ...apiWithoutAuth, apiKey: '' },
            },
          })
        }
        sendJson(res, { ok: true })
        return
      }

      if (url.pathname.startsWith('/api/app-config/')) {
        const appId = url.pathname.replace('/api/app-config/', '') as AppId
        if (!(APP_IDS as readonly string[]).includes(appId)) {
          sendJson(res, { error: 'Unknown app' }, 404)
          return
        }
        if (req.method === 'GET') {
          const state = await loadAppFileState(appId)
          sendJson(res, { ok: true, appId, state })
          return
        }
        if (req.method === 'POST') {
          const body = await readJsonBody(req)
          const raw = typeof body.raw === 'string' ? body.raw : ''
          await saveAppFile(appId, raw)
          if (appId === 'openclaw') await ensureOpenclawGatewayConfig(currentConfig)
          currentFiles = await buildAppFiles()
          sendJson(res, { ok: true, appId, state: currentFiles[appId] })
          return
        }
      }

      if (url.pathname.startsWith('/api/app-sync/')) {
        const appId = url.pathname.replace('/api/app-sync/', '') as AppId
        if (!(APP_IDS as readonly string[]).includes(appId)) {
          sendJson(res, { error: 'Unknown app' }, 404)
          return
        }
        if (appId === 'openclaw') {
          await ensureOpenclawGatewayConfig(currentConfig)
        } else {
          const payload = syncAppPayload(appId, currentConfig, currentFiles[appId]?.raw ?? '')
          await saveAppFile(appId, payload)
        }
        currentFiles = await buildAppFiles()
        sendJson(res, { ok: true, appId, state: currentFiles[appId] })
        return
      }

      if (url.pathname === '/api/launch-url' && req.method === 'POST') {
        const body = await readJsonBody(req)
        const appId = typeof body.appId === 'string' ? body.appId as AppId : undefined
        const configuredTarget = appId && (APP_IDS as readonly string[]).includes(appId)
          ? currentConfig.global.launch.webUrls[appId]
          : ''
        const target = configuredTarget || (typeof body.target === 'string' ? body.target : '')
        if (target) {
          await openBrowser(appId ? await buildAppEntryUrl(appId, target) : target)
          sendJson(res, { ok: true })
        } else {
          sendJson(res, { error: 'Missing target' }, 400)
        }
        return
      }

      if (url.pathname === '/api/wechat/single-entry/migrate' && req.method === 'POST') {
        const result = await migrateLegacyWechatConnections()
        currentConfig = await loadGlobalConfig()
        currentFiles = await buildAppFiles()
        sendJson(res, { ok: true, result })
        return
      }

      if (url.pathname === '/api/wechat/single-entry/reset' && req.method === 'POST') {
        await resetWechatConnections()
        currentConfig = await loadGlobalConfig()
        currentFiles = await buildAppFiles()
        sendJson(res, { ok: true })
        return
      }

      const wechatMatch = url.pathname.match(/^\/api\/wechat\/([^/]+)\/(start|status|verify)$/)
      if (wechatMatch) {
        const appId = wechatMatch[1] as AppId
        const action = wechatMatch[2]
        if (appId !== 'openclaw') {
          sendJson(res, { error: '微信扫码仅由 OpenClaw 单入口提供' }, 404)
          return
        }
        if (action === 'start' && req.method === 'POST') {
          const login = await startWechatLogin(appId)
          sendJson(res, { ok: true, login })
          return
        }
        if (action === 'status' && req.method === 'GET') {
          const sessionKey = url.searchParams.get('sessionKey') ?? ''
          const login = getWechatStatus(sessionKey)
          if (!login) {
            sendJson(res, { error: '扫码会话不存在或已过期' }, 404)
            return
          }
          sendJson(res, { ok: true, login })
          return
        }
        if (action === 'verify' && req.method === 'POST') {
          const body = await readJsonBody(req)
          const sessionKey = typeof body.sessionKey === 'string' ? body.sessionKey : ''
          const verifyCode = typeof body.verifyCode === 'string' ? body.verifyCode : ''
          if (!sessionKey || !verifyCode.trim()) {
            sendJson(res, { error: '缺少扫码会话或验证码' }, 400)
            return
          }
          const login = submitWechatVerifyCode(sessionKey, verifyCode)
          if (!login) {
            sendJson(res, { error: '扫码会话不存在或已过期' }, 404)
            return
          }
          sendJson(res, { ok: true, login })
          return
        }
      }

      if (url.pathname === '/api/sync-all' && req.method === 'POST') {
        await ensureOpenclawGatewayConfig(currentConfig)
        for (const appId of APP_IDS) {
          if (appId === 'openclaw') continue
          const payload = syncAppPayload(appId, currentConfig, currentFiles[appId]?.raw ?? '')
          if (payload) await saveAppFile(appId, payload)
        }
        currentFiles = await buildAppFiles()
        sendJson(res, { ok: true, steps: isStepComplete(currentConfig, currentFiles, (await listInstalledSkills()).length) })
        return
      }

      if (url.pathname === '/api/raw-config' && req.method === 'GET') {
        const raw = await (await import('node:fs/promises')).readFile(globalConfigPath(), 'utf8').catch(() => '')
        sendText(res, raw)
        return
      }

      vite.middlewares(req, res, () => {
        res.statusCode = 404
        res.end('Not found')
      })
    } catch (error) {
      sendJson(res, { error: error instanceof Error ? error.message : 'Internal server error' }, 500)
    }
  })

  const port = Number(process.env.PORT ?? 0)
  server.listen(port, '127.0.0.1', async () => {
    const address = server.address()
    if (!address || typeof address === 'string') return
    const url = `http://127.0.0.1:${address.port}`
    console.log(`Launcher ready at ${url}`)
    if (process.env.NO_OPEN_BROWSER !== '1') {
      await openBrowser(url)
    }
  })
}

void main()
