import React, { useEffect, useMemo, useState } from 'react'
import {
  Activity,
  CheckCircle2,
  Circle,
  Download,
  ExternalLink,
  FlaskConical,
  Link2,
  LifeBuoy,
  LogIn,
  LogOut,
  PlusCircle,
  Power,
  Puzzle,
  Play,
  PackageOpen,
  QrCode,
  RefreshCcw,
  RotateCcw,
  Save,
  Search,
  Square,
  Settings2,
  Store,
  Terminal,
  Trash2,
  UserRound,
  X,
} from 'lucide-react'
import type { AppFileState, AppId, AppRuntimeStatus, LauncherConfig, RuntimeVersion, StepStatus } from '../shared/types'
import { resolveEditorDraft } from '../shared/editor-draft'
import dongchuangaiLogo from '../assets/logo.png'

type Bootstrap = {
  config: LauncherConfig
  appFiles: Record<AppId, AppFileState>
  steps: StepStatus[]
  platform: 'win32' | 'darwin' | 'linux'
  runtime: {
    configExists: boolean
    versions: {
      node: RuntimeVersion
      python: RuntimeVersion
      openclaw: RuntimeVersion
      claude: RuntimeVersion
      codex: RuntimeVersion
      hermes: RuntimeVersion
      deepseekHarness: RuntimeVersion
    }
  }
  appStatuses: Record<AppId, AppRuntimeStatus>
  skills: SkillRecord[]
}

type SkillRecord = {
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
  targets: {
    claude: boolean
    codex: boolean
    deepseekHarness: boolean
    hermes: boolean
    openclaw: boolean
  }
}

type SkillMarketplace = {
  skills: SkillRecord[]
  tags: Array<{ id: string; categoryId: number; label: string }>
  page: number
  per_page: number
  total: number
  total_pages: number
}

type WechatLogin = {
  sessionKey: string
  qrDataUrl?: string
  qrcodeUrl?: string
  status: 'waiting' | 'scanned' | 'need_verifycode' | 'connected' | 'expired' | 'error'
  message: string
  accountId?: string
  userId?: string
}

type DongchuangAIAuth = {
  sessionKey: string
  phase: 'pending' | 'success' | 'error' | 'cancelled'
  userCode?: string
  verificationUri?: string
  message: string
  accountName?: string
  accountPhone?: string
}

type SoftwareUpdate = {
  version: string
  date: string
  title: string
  changes: string[]
  zipUrl: string
  hash: string
  size: number
}

type ProviderPreset = {
  id: string
  name: string
  mark: string
  color: string
  logo?: string
  baseUrl: string
  models: string[]
}

const PROVIDER_PRESETS: ProviderPreset[] = [
  {
    id: 'openai',
    name: 'OpenAI',
    mark: 'O',
    color: '#10a37f',
    baseUrl: 'https://api.openai.com/v1',
    models: [
      'gpt-5.6-sol',
      'gpt-5.6-terra',
      'gpt-5.6-luna',
      'gpt-5.5',
      'gpt-5.4',
      'gpt-5.4-mini',
      'gpt-5.4-nano',
      'gpt-5.3-codex',
      'gpt-5.2-codex',
      'gpt-5.2',
      'gpt-5.1',
      'gpt-5-mini',
    ],
  },
  {
    id: 'anthropic',
    name: 'Anthropic Claude',
    mark: 'C',
    color: '#d97757',
    baseUrl: 'https://api.anthropic.com',
    models: [
      'claude-fable-5',
      'claude-opus-5',
      'claude-sonnet-5',
      'claude-haiku-4-5',
      'claude-haiku-4-5-20251001',
      'claude-sonnet-4-5',
    ],
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    mark: 'DS',
    color: '#4d6bfe',
    baseUrl: 'https://api.deepseek.com',
    models: ['deepseek-v4-pro', 'deepseek-v4-flash'],
  },
  {
    id: 'dashscope',
    name: '通义千问',
    mark: '通',
    color: '#615ced',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    models: [
      'qwen3.8-max',
      'qwen3.7-max',
      'qwen3.7-plus',
      'qwen3.7-flash',
      'qwen3.6-plus',
      'qwen3.6-flash',
      'qwen3-vl-plus',
      'qwen3-vl-flash',
      'qwq-plus',
      'qwen-long-latest',
    ],
  },
  {
    id: 'zhipu',
    name: '智谱 GLM',
    mark: 'GLM',
    color: '#1765f7',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    models: [
      'glm-4.7',
      'glm-4.7-flash',
      'glm-4.6',
      'glm-4.6v',
      'glm-4.5',
      'glm-4.5-air',
      'glm-4.5-flash',
      'glm-4.5-v',
      'glm-4.5-x',
      'glm-4.5-airx',
    ],
  },
  {
    id: 'moonshot',
    name: 'Kimi (Moonshot)',
    mark: 'K',
    color: '#1c1c1c',
    baseUrl: 'https://api.moonshot.cn/v1',
    models: ['kimi-k3', 'kimi-k2.7-code', 'kimi-k2.6'],
  },
  {
    id: 'doubao',
    name: '豆包 (火山引擎)',
    mark: 'D',
    color: '#3370ff',
    baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
    models: [
      'doubao-seed-2-1-pro',
      'doubao-seed-2-1-turbo',
      'doubao-seed-2-1-evolving',
      'doubao-seed-2-0-pro',
      'doubao-seed-2-0-lite',
      'doubao-seed-2-0-mini-260428',
      'doubao-seed-2-0-code',
    ],
  },
  {
    id: 'siliconflow',
    name: '硅基流动',
    mark: 'S',
    color: '#7b5bf2',
    baseUrl: 'https://api.siliconflow.cn/v1',
    models: [
      'deepseek-ai/DeepSeek-V4-Pro',
      'deepseek-ai/DeepSeek-V4-Flash',
      'deepseek-ai/DeepSeek-V3.2',
      'deepseek-ai/DeepSeek-R1',
      'Qwen/Qwen3.6-35B-A3B',
      'Qwen/Qwen3.6-27B',
      'Qwen/Qwen3.5-122B-A10B',
      'Qwen/Qwen3.5-9B',
      'zai-org/GLM-5.2',
      'zai-org/GLM-5.1',
      'zai-org/GLM-4.7',
      'moonshotai/Kimi-K2.6',
    ],
  },
  {
    id: 'dongchuangai',
    name: '东创AI',
    mark: '东',
    color: '#ff6b14',
    logo: dongchuangaiLogo,
    baseUrl: 'https://api.dongchuangai.com/v1',
    models: [
      'gpt-5.6-sol',
      'gpt-5.6-terra',
      'gpt-5.6-luna',
      'gpt-5.5',
      'deepseek-v4-pro',
      'deepseek-v4-flash',
      'qwen3.8-max',
      'qwen3.7-plus',
    ],
  },
  {
    id: 'custom',
    name: '自定义',
    mark: '＋',
    color: '#758093',
    baseUrl: '',
    models: [
      'gpt-5.5',
      'gpt-5.4',
      'gpt-4o',
      'deepseek-v4-pro',
      'deepseek-v4-flash',
      'deepseek-chat',
      'claude-opus-5',
      'claude-sonnet-5',
      'claude-haiku-4-5',
      'qwen3-max',
      'glm-4.6',
      'kimi-k3',
    ],
  },
]

const stepOrder = ['environment', 'api', 'wechat', 'skills', 'done'] as const

function appIds(): AppId[] {
  return ['openclaw', 'hermes', 'claude', 'codex', 'deepseek-harness']
}

function label(id: AppId): string {
  return {
    openclaw: 'OpenClaw',
    hermes: 'Hermes Agent',
    claude: 'Claude Code',
    codex: 'Codex',
    'deepseek-harness': 'DeepSeek Harness',
  }[id]
}

function stepLabel(id: string): string {
  return {
    environment: '检测运行环境',
    api: '配置 API 模型',
    wechat: '配置微信连接',
    skills: '安装技能',
    done: '完成安装',
  }[id] ?? id
}

function emptyWechat() {
  return {
    enabled: false,
    accountId: '',
    token: '',
    baseUrl: 'https://ilinkai.weixin.qq.com',
    cdnBaseUrl: 'https://novac2c.cdn.weixin.qq.com/c2c',
    dmPolicy: 'open',
    groupPolicy: 'disabled',
    allowFrom: [],
    groupAllowFrom: [],
    splitMultilineMessages: false,
  }
}

export default function App(): React.ReactElement {
  const query = new URLSearchParams(window.location.search)
  const initialApp = query.get('app') as AppId | null
  const initialStep = query.get('step')
  const hasInitialStep = initialStep === 'environment' || initialStep === 'api' || initialStep === 'wechat' || initialStep === 'skills' || initialStep === 'done'
  const [bootstrap, setBootstrap] = useState<Bootstrap | null>(null)
  const [activeStep, setActiveStep] = useState<(typeof stepOrder)[number]>(hasInitialStep ? initialStep as (typeof stepOrder)[number] : 'environment')
  const [activeApp, setActiveApp] = useState<AppId>(appIds().includes(initialApp as AppId) ? initialApp as AppId : 'openclaw')
  const [appRawDraft, setAppRawDraft] = useState('')
  const [appRawDirty, setAppRawDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState('')
  const [loadError, setLoadError] = useState('')
  const [wechatLogins, setWechatLogins] = useState<Partial<Record<AppId, WechatLogin>>>({})
  const [wechatLoginBusy, setWechatLoginBusy] = useState<Partial<Record<AppId, boolean>>>({})
  const [wechatVerifyCodes, setWechatVerifyCodes] = useState<Partial<Record<AppId, string>>>({})
  const [wechatMigrationBusy, setWechatMigrationBusy] = useState(false)
  const [appBusy, setAppBusy] = useState<Partial<Record<AppId, boolean>>>({})
  const [skillTab, setSkillTab] = useState<'installed' | 'marketplace'>('marketplace')
  const [skillSearch, setSkillSearch] = useState('')
  const [skillCategory, setSkillCategory] = useState('all')
  const [marketplace, setMarketplace] = useState<SkillMarketplace>({ skills: [], tags: [], page: 1, per_page: 50, total: 0, total_pages: 0 })
  const [marketQuery, setMarketQuery] = useState({ page: 1, categoryId: 0, search: '', revision: 0 })
  const [marketLoading, setMarketLoading] = useState(false)
  const [marketError, setMarketError] = useState('')
  const [skillsBusy, setSkillsBusy] = useState<Partial<Record<string, boolean>>>({})
  const [dongchuangAuth, setDongchuangAuth] = useState<DongchuangAIAuth | null>(null)
  const [dongchuangAuthBusy, setDongchuangAuthBusy] = useState(false)
  const [accountMenuOpen, setAccountMenuOpen] = useState(false)
  const [softwareUpdate, setSoftwareUpdate] = useState<SoftwareUpdate | null>(null)
  const [updateModalOpen, setUpdateModalOpen] = useState(false)
  const [updateBusy, setUpdateBusy] = useState(false)
  const [updateMessage, setUpdateMessage] = useState('')
  const systemPathNodeVersion = bootstrap?.runtime.versions.node.available ? bootstrap.runtime.versions.node.version : 'v24.18.0'
  const systemPathVersion = bootstrap?.runtime.versions.python.available ? bootstrap.runtime.versions.python.version : '3.11.9'
  const systemPathEnabled = Boolean(bootstrap?.config.global.launch.persistSystemPath)
  const systemPathDescription = bootstrap?.platform === 'win32'
    ? `写入 runtime/windows/bin、runtime/windows/npm-global、runtime/windows/node/versions/${systemPathNodeVersion}、runtime/windows/python/versions/${systemPathVersion} 与 runtime/windows/python/versions/${systemPathVersion}/Scripts（pip/playwright/uvicorn 等 console scripts 入口）到系统 PATH`
    : bootstrap?.platform === 'darwin'
      ? '写入 ~/.bash_profile 触发 runtime/macos/scripts/activate.sh；Python 入口由 pyenv shims 接管，无需逐项拼接'
      : '当前平台不支持自动写入系统环境变量'

  async function refresh({ reloadDraft = false }: { reloadDraft?: boolean } = {}): Promise<void> {
    const controller = new AbortController()
    const timeout = window.setTimeout(() => controller.abort(), 10000)
    setLoadError('')
    try {
      const res = await fetch('/api/bootstrap', { signal: controller.signal })
      if (!res.ok) throw new Error(`启动配置接口返回 ${res.status}`)
      const data = await res.json() as Bootstrap
      setBootstrap(data)
      if (!hasInitialStep) {
        const firstOpen = data.steps.find(step => !step.completed)?.id as (typeof stepOrder)[number] | undefined
        setActiveStep(firstOpen ?? 'done')
      }
      const nextRaw = data.appFiles[activeApp]?.raw ?? ''
      setAppRawDraft(previous => resolveEditorDraft(previous, nextRaw, reloadDraft))
      if (reloadDraft) setAppRawDirty(false)
      setStatus('')
    } catch (error) {
      const message = error instanceof DOMException && error.name === 'AbortError'
        ? '读取启动配置超时，请确认本地服务仍在运行'
        : (error instanceof Error ? error.message : '读取启动配置失败')
      setLoadError(message)
      setStatus(message)
    } finally {
      window.clearTimeout(timeout)
    }
  }

  useEffect(() => {
    void refresh({ reloadDraft: true })
  }, [])

  async function checkSoftwareUpdate(showError = false): Promise<void> {
    setUpdateMessage(showError ? '正在检查更新...' : '')
    try {
      const updateConfig = bootstrap?.config.global.update
      const query = updateConfig
        ? `?app_id=${encodeURIComponent(String(updateConfig.app_id))}&user_id=${encodeURIComponent(String(updateConfig.user_id))}`
        : ''
      const response = await fetch(`/api/software-update/check${query}`)
      const body = await response.json() as { update?: SoftwareUpdate | null; error?: string }
      if (!response.ok) throw new Error(body.error || `更新接口返回 ${response.status}`)
      setSoftwareUpdate(body.update ?? null)
      setUpdateMessage(body.update ? '' : '当前已是最新版本')
    } catch (error) {
      if (showError) setUpdateMessage(error instanceof Error ? error.message : '检查更新失败')
    }
  }

  useEffect(() => {
    if (bootstrap) void checkSoftwareUpdate()
  }, [bootstrap?.config.global.update.app_id, bootstrap?.config.global.update.user_id])

  async function installSoftwareUpdate(): Promise<void> {
    if (!softwareUpdate) return
    setUpdateBusy(true)
    setUpdateMessage('正在下载并校验更新包...')
    try {
      const response = await fetch('/api/software-update/install', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ version: softwareUpdate.version }),
      })
      const body = await response.json() as { message?: string; error?: string }
      if (!response.ok) throw new Error(body.error || `更新接口返回 ${response.status}`)
      setUpdateBusy(false)
      setUpdateMessage(body.message ? `更新成功：${body.message}，页面即将刷新...` : '更新成功，页面即将刷新...')
      window.setTimeout(() => window.location.reload(), 1200)
    } catch (error) {
      setUpdateMessage(error instanceof Error ? error.message : '自动安装更新失败')
      setUpdateBusy(false)
    }
  }

  useEffect(() => {
    if (!bootstrap) return
    const timer = window.setInterval(() => {
      void fetch('/api/apps/status')
        .then(response => response.ok
          ? response.json() as Promise<{ appStatuses: Record<AppId, AppRuntimeStatus> }>
          : Promise.reject(new Error(`状态接口返回 ${response.status}`)))
        .then(data => setBootstrap(previous => previous ? { ...previous, appStatuses: data.appStatuses } : previous))
        .catch(() => undefined)
    }, 3000)
    return () => window.clearInterval(timer)
  }, [Boolean(bootstrap)])

  useEffect(() => {
    if (!bootstrap) return
    setAppRawDraft(bootstrap.appFiles[activeApp]?.raw ?? '')
    setAppRawDirty(false)
  }, [activeApp])

  useEffect(() => {
    const activeLogins = (['openclaw'] as AppId[])
      .map(id => [id, wechatLogins[id]] as const)
      .filter((entry): entry is readonly [AppId, WechatLogin] => {
        const login = entry[1]
        if (!login) return false
        return !['connected', 'expired', 'error'].includes(login.status)
      })
    if (!activeLogins.length) return
    const timer = window.setInterval(() => {
      void Promise.all(activeLogins.map(async ([appId, login]) => {
        const response = await fetch(`/api/wechat/${appId}/status?sessionKey=${encodeURIComponent(login.sessionKey)}`)
        if (!response.ok) return
        const body = await response.json() as { login: WechatLogin }
        setWechatLogins(previous => ({ ...previous, [appId]: body.login }))
        if (body.login.status === 'connected') {
          await refresh()
          setStatus(body.login.message)
        }
      })).catch(error => setStatus(error instanceof Error ? error.message : '读取微信连接状态失败'))
    }, 1500)
    return () => window.clearInterval(timer)
  }, [wechatLogins])

  useEffect(() => {
    if (!dongchuangAuth || dongchuangAuth.phase !== 'pending') return
    const timer = window.setInterval(() => {
      void fetch(`/api/dongchuangai-auth/status?sessionKey=${encodeURIComponent(dongchuangAuth.sessionKey)}`)
        .then(response => response.ok ? response.json() as Promise<{ auth: DongchuangAIAuth }> : Promise.reject(new Error(`授权状态接口返回 ${response.status}`)))
        .then(async data => {
          setDongchuangAuth(data.auth)
          if (data.auth.phase === 'success') {
            await refresh()
            setStatus('东创 AI 已授权，API 配置已同步到全部应用')
          }
        })
        .catch(error => setDongchuangAuth(previous => previous ? { ...previous, phase: 'error', message: error instanceof Error ? error.message : '读取授权状态失败' } : previous))
    }, 1500)
    return () => window.clearInterval(timer)
  }, [dongchuangAuth?.sessionKey, dongchuangAuth?.phase])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setMarketQuery(previous => previous.search === skillSearch.trim() ? previous : { ...previous, page: 1, search: skillSearch.trim() })
    }, 300)
    return () => window.clearTimeout(timer)
  }, [skillSearch])

  useEffect(() => {
    if (activeStep !== 'skills' || skillTab !== 'marketplace') return
    const controller = new AbortController()
    const params = new URLSearchParams({ page: String(marketQuery.page), per_page: '50' })
    if (marketQuery.categoryId) params.set('category_id', String(marketQuery.categoryId))
    if (marketQuery.search) params.set('search', marketQuery.search)
    setMarketLoading(true)
    setMarketError('')
    setMarketplace(previous => ({ ...previous, skills: [] }))
    void fetch(`/api/skills/marketplace?${params}`, { signal: controller.signal })
      .then(response => response.ok ? response.json() as Promise<SkillMarketplace> : Promise.reject(new Error(`技能市场返回 ${response.status}`)))
      .then(data => { if (!controller.signal.aborted) setMarketplace(data) })
      .catch(error => { if (!controller.signal.aborted) setMarketError(error instanceof Error ? error.message : '读取技能市场失败') })
      .finally(() => { if (!controller.signal.aborted) setMarketLoading(false) })
    return () => controller.abort()
  }, [activeStep, skillTab, marketQuery])

  function selectSkillCategory(id: string, categoryId = 0): void {
    setSkillCategory(id)
    setMarketQuery(previous => ({ ...previous, categoryId, page: 1, revision: previous.revision + 1 }))
  }

  const stepMap = useMemo(() => {
    const map = new Map<string, StepStatus>()
    bootstrap?.steps.forEach(step => map.set(step.id, step))
    return map
  }, [bootstrap])

  async function saveGlobalConfig(): Promise<void> {
    if (!bootstrap) return
    setSaving(true)
    setStatus('')
    try {
      const response = await fetch('/api/global-config', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ config: bootstrap.config }),
      })
      const body = await response.json() as { error?: string; systemPath?: { message: string } }
      if (!response.ok) throw new Error(body.error ?? '保存全局配置失败')
      await refresh({ reloadDraft: !appRawDirty })
      setStatus(body.systemPath?.message ? `全局配置已保存；${body.systemPath.message}` : '全局配置已保存')
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '保存全局配置失败')
    } finally {
      setSaving(false)
    }
  }

  async function startDongchuangAIAuth(): Promise<void> {
    setDongchuangAuthBusy(true)
    setStatus('')
    try {
      const response = await fetch('/api/dongchuangai-auth/start', { method: 'POST' })
      const body = await response.json() as { auth?: DongchuangAIAuth; error?: string }
      if (!response.ok || !body.auth) throw new Error(body.error ?? '东创 AI 授权启动失败')
      setDongchuangAuth(body.auth)
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '东创 AI 授权启动失败')
    } finally {
      setDongchuangAuthBusy(false)
    }
  }

  async function cancelDongchuangAIAuth(): Promise<void> {
    if (!dongchuangAuth) return
    await fetch('/api/dongchuangai-auth/cancel', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sessionKey: dongchuangAuth.sessionKey }),
    }).catch(() => undefined)
    setDongchuangAuth(null)
  }

  async function logoutDongchuangAI(): Promise<void> {
    setDongchuangAuthBusy(true)
    try {
      const response = await fetch('/api/dongchuangai-auth/logout', { method: 'POST' })
      const body = await response.json() as { error?: string }
      if (!response.ok) throw new Error(body.error ?? '退出登录失败')
      setAccountMenuOpen(false)
      await refresh()
      setStatus('已退出东创 AI 授权并清除已同步的 API Key')
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '退出登录失败')
    } finally {
      setDongchuangAuthBusy(false)
    }
  }

  function selectProvider(preset: ProviderPreset): void {
    if (!bootstrap || preset.id === globalApi.provider) return
    setBootstrap(previous => {
      if (!previous) return previous
      const api = previous.config.global.api
      if (preset.id === 'custom') {
        return { ...previous, config: { ...previous.config, global: { ...previous.config.global, api: { ...api, provider: 'custom' } } } }
      }
      return {
        ...previous,
        config: {
          ...previous.config,
          global: {
            ...previous.config.global,
            api: {
              ...api,
              provider: preset.id,
              baseUrl: preset.baseUrl,
              model: preset.models.includes(api.model) ? api.model : (preset.models[0] ?? ''),
            },
          },
        },
      }
    })
  }

  async function syncApp(appId: AppId): Promise<void> {
    setSaving(true)
    setStatus('')
    try {
      const response = await fetch(`/api/app-sync/${appId}`, { method: 'POST' })
      const body = await response.json() as { state?: AppFileState; error?: string }
      if (!response.ok || !body.state) throw new Error(body.error ?? '同步失败')
      await refresh()
      if (appId === activeApp) {
        setAppRawDraft(body.state.raw)
        setAppRawDirty(false)
      }
      setStatus(`${label(appId)} 已同步`)
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '同步失败')
    } finally {
      setSaving(false)
    }
  }

  async function saveRaw(appId: AppId): Promise<void> {
    setSaving(true)
    setStatus('')
    try {
      const response = await fetch(`/api/app-config/${appId}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ raw: appRawDraft }),
      })
      const body = await response.json() as { state?: AppFileState; error?: string }
      if (!response.ok || !body.state) throw new Error(body.error ?? '保存文件失败')
      await refresh()
      if (appId === activeApp) {
        setAppRawDraft(body.state.raw)
        setAppRawDirty(false)
      }
      setStatus(`${label(appId)} 配置已保存`)
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '保存文件失败')
    } finally {
      setSaving(false)
    }
  }

  async function appAction(appId: AppId, action: 'start' | 'stop' | 'restart' | 'update' | 'terminal' | 'terminal-desktop'): Promise<void> {
    setAppBusy(previous => ({ ...previous, [appId]: true }))
    setStatus('')
    try {
      const response = await fetch(`/api/apps/${appId}/${action}`, { method: 'POST' })
      const body = await response.json() as { appStatuses?: Record<AppId, AppRuntimeStatus>; error?: string }
      if (!response.ok) throw new Error(body.error ?? `${label(appId)} 操作失败`)
      if (body.appStatuses) setBootstrap(previous => previous ? { ...previous, appStatuses: body.appStatuses! } : previous)
      setStatus(actionMessage(appId, action))
    } catch (error) {
      setStatus(error instanceof Error ? error.message : `${label(appId)} 操作失败`)
    } finally {
      setAppBusy(previous => ({ ...previous, [appId]: false }))
    }
  }

  async function skillAction(action: 'install' | 'uninstall' | 'toggle' | 'sync', skill: SkillRecord): Promise<void> {
    setSkillsBusy(previous => ({ ...previous, [skill.id]: true }))
    setStatus('')
    try {
      const response = await fetch(`/api/skills/${action}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: skill.id, url: skill.url, enabled: action === 'toggle' ? !skill.enabled : undefined }),
      })
      const body = await response.json() as { skills?: SkillRecord[]; error?: string }
      if (!response.ok || !body.skills) throw new Error(body.error ?? '技能操作失败')
      setBootstrap(previous => previous ? { ...previous, skills: body.skills! } : previous)
      if (action === 'install' || action === 'sync') {
        const installed = body.skills.find(item => item.id === skill.id)
        setMarketplace(previous => ({ ...previous, skills: previous.skills.map(item => item.id === skill.id ? { ...item, ...installed, installed: true } : item) }))
      }
      setStatus(action === 'install' ? `${skill.name} 已同步到全部应用` : action === 'sync' ? `${skill.name} 已补齐应用目录` : action === 'uninstall' ? `${skill.name} 已卸载` : `${skill.name} 已${skill.enabled ? '停用' : '启用'}`)
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '技能操作失败')
    } finally {
      setSkillsBusy(previous => ({ ...previous, [skill.id]: false }))
    }
  }

  async function startWechat(appId: AppId): Promise<void> {
    setWechatLoginBusy(previous => ({ ...previous, [appId]: true }))
    setWechatVerifyCodes(previous => ({ ...previous, [appId]: '' }))
    setStatus('')
    try {
      const response = await fetch(`/api/wechat/${appId}/start`, { method: 'POST' })
      const body = await response.json() as { login?: WechatLogin; error?: string }
      if (!response.ok || !body.login) throw new Error(body.error ?? '生成微信二维码失败')
      setWechatLogins(previous => ({ ...previous, [appId]: body.login }))
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '生成微信二维码失败')
    } finally {
      setWechatLoginBusy(previous => ({ ...previous, [appId]: false }))
    }
  }

  async function submitWechatVerifyCode(appId: AppId): Promise<void> {
    const login = wechatLogins[appId]
    const verifyCode = wechatVerifyCodes[appId] ?? ''
    if (!login || !verifyCode.trim()) return
    setWechatLoginBusy(previous => ({ ...previous, [appId]: true }))
    try {
      const response = await fetch(`/api/wechat/${appId}/verify`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sessionKey: login.sessionKey, verifyCode }),
      })
      const body = await response.json() as { login?: WechatLogin; error?: string }
      if (!response.ok || !body.login) throw new Error(body.error ?? '提交验证码失败')
      setWechatLogins(previous => ({ ...previous, [appId]: body.login }))
      setWechatVerifyCodes(previous => ({ ...previous, [appId]: '' }))
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '提交验证码失败')
    } finally {
      setWechatLoginBusy(previous => ({ ...previous, [appId]: false }))
    }
  }

  async function migrateLegacyWechatCredentials(): Promise<void> {
    setWechatMigrationBusy(true)
    setStatus('')
    try {
      const response = await fetch('/api/wechat/single-entry/reset', { method: 'POST' })
      const body = await response.json() as { error?: string }
      if (!response.ok) throw new Error(body.error ?? '重置微信连接失败')
      await refresh()
      setWechatLogins({})
      setWechatVerifyCodes({})
      setStatus('微信授权已删除，请重新扫码连接')
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '重置微信连接失败')
    } finally {
      setWechatMigrationBusy(false)
    }
  }

  if (!bootstrap) {
    return (
      <div className="shell">
        <div className="frame loading">
          {loadError ? (
            <>
              <span>{loadError}</span>
              <button type="button" className="primary" onClick={() => void refresh()}>
                <RefreshCcw size={16} /> 重试
              </button>
            </>
          ) : (
            <>
              <Activity className="spin" />
              <span>正在读取启动配置...</span>
            </>
          )}
        </div>
      </div>
    )
  }

  const steps = bootstrap.steps
  const globalApi = bootstrap.config.global.api
  const isDongchuangAIAuthenticated = globalApi.authSource === 'dongchuangai-oauth'
  const accountLabel = globalApi.authAccountName || (globalApi.authAccountPhone ? `****${globalApi.authAccountPhone.slice(-4)}` : '东创 AI 账号')
  const launch = bootstrap.config.global.launch
  const currentPreset = PROVIDER_PRESETS.find(preset => preset.id === globalApi.provider)
  const modelSuggestions = currentPreset?.models.length ? currentPreset.models : []
  const currentFile = bootstrap.appFiles[activeApp]
  const skillItems = skillTab === 'installed' ? bootstrap.skills : marketplace.skills
  const filteredSkills = skillItems.filter(skill => {
    if (skillTab === 'marketplace') return true
    const queryText = skillSearch.trim().toLowerCase()
    const matchesSearch = !queryText || `${skill.name} ${skill.description}`.toLowerCase().includes(queryText)
    const matchesCategory = skillCategory === 'all' || skill.tags.includes(skillCategory)
    return matchesSearch && matchesCategory
  })

  return (
    <div className="shell">
      <aside className="rail">
        <div className="brand">
          <img className="brandLogo" src={dongchuangaiLogo} alt="东创AI" draggable={false} />
          <div className="brandText">
            <div className="brandTitle">聚合工作台</div>
            <div className="brandSub">本地网页引导安装</div>
          </div>
          {softwareUpdate && (
            <button type="button" className="updateNotice" onClick={() => { setUpdateMessage(''); setUpdateModalOpen(true) }}>
              <Download size={15} /> 发现新版本 v{softwareUpdate.version}
            </button>
          )}
        </div>
        <div className="stack">
          {steps.map((step, index) => (
            <button
              key={step.id}
              type="button"
              className={`stepItem ${activeStep === step.id ? 'active' : ''}`}
              onClick={() => setActiveStep(step.id as (typeof stepOrder)[number])}
            >
              <span className="stepIndex">{step.completed ? <CheckCircle2 size={16} /> : index + 1}</span>
              <span className="stepText">
                <strong>{step.title}</strong>
                <small>{step.detail}</small>
              </span>
            </button>
          ))}
        </div>
        <div className="railFooter">
          <div className="railActions">
            {isDongchuangAIAuthenticated ? (
              <div className="accountAction">
                <button type="button" className="railButton" onClick={() => setAccountMenuOpen(previous => !previous)}>
                  <UserRound size={16} /> <span>{accountLabel}</span>
                </button>
                {accountMenuOpen && (
                  <div className="accountMenu">
                    <strong>{accountLabel}</strong>
                    {globalApi.authAccountPhone && <span>****{globalApi.authAccountPhone.slice(-4)}</span>}
                    <button type="button" onClick={() => void logoutDongchuangAI()} disabled={dongchuangAuthBusy}>
                      <LogOut size={15} /> 退出登录
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <button type="button" className="railButton" onClick={() => void startDongchuangAIAuth()} disabled={dongchuangAuthBusy}>
                <LogIn size={16} /> <span>{dongchuangAuthBusy ? '正在发起授权...' : '登录东创 AI'}</span>
              </button>
            )}
            <a className="railButton" href="https://dongchuangai.com/" target="_blank" rel="noreferrer">
              <LifeBuoy size={16} /> <span>技术支持</span><ExternalLink size={13} />
            </a>
          </div>
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <div>
            <h1>{stepLabel(activeStep)}</h1>
            <p>共享 API 默认写入全局 config.yaml，应用文件可单独在线编辑。</p>
          </div>
          <div className="actions">
            <button type="button" className="ghost" onClick={() => void refresh({ reloadDraft: true })}>
              <RefreshCcw size={16} /> 刷新
            </button>
            <button type="button" className="primary" onClick={() => void saveGlobalConfig()} disabled={saving}>
              <Save size={16} /> 保存全局
            </button>
          </div>
        </header>

        <section className="panel">
          {activeStep === 'environment' && (
            <div className="stack">
              <div className="appCard envCard">
                <div className="appHead">
                  <div>
                    <strong>系统环境写入</strong>
                    <span>保存后会按平台同步运行时环境</span>
                  </div>
                  <div className={`chip ${systemPathEnabled ? 'green' : ''}`}>{systemPathEnabled ? '已启用' : '未启用'}</div>
                </div>
                <label className="systemPathRow">
                  <input
                    type="checkbox"
                    checked={systemPathEnabled}
                    disabled={bootstrap?.platform !== 'win32' && bootstrap?.platform !== 'darwin'}
                    onChange={event => setBootstrap(previous => previous ? {
                      ...previous,
                      config: {
                        ...previous.config,
                        global: {
                          ...previous.config.global,
                          launch: {
                            ...previous.config.global.launch,
                            persistSystemPath: event.target.checked,
                          },
                        },
                      },
                    } : previous)}
                  />
                  <span>
                    <strong>写入系统环境变量 PATH</strong>
                    <small>{systemPathDescription}</small>
                  </span>
                </label>
                <div className="hint">
                  勾选后再点击右上角“保存全局”，会把这套运行环境持久化到当前用户或系统环境中。
                </div>
              </div>
              <div className="grid two">
                <VersionCard title="Node.js" version={bootstrap.runtime.versions.node} />
                <VersionCard title="Python" version={bootstrap.runtime.versions.python} />
                <VersionCard title="OpenClaw" version={bootstrap.runtime.versions.openclaw} />
                <VersionCard title="Claude Code" version={bootstrap.runtime.versions.claude} />
                <VersionCard title="Codex" version={bootstrap.runtime.versions.codex} />
                <VersionCard title="Hermes Agent" version={bootstrap.runtime.versions.hermes} />
                <VersionCard title="DeepSeek Harness" version={bootstrap.runtime.versions.deepseekHarness} />
              </div>
            </div>
          )}

          {activeStep === 'api' && (
            <>
              <div className="providerSection">
                <div className="providerHead">
                  <h3>选择模型供应商</h3>
                  <span>选择后自动填充 Base URL 与常用模型，API Key 与 Model 可继续调整</span>
                </div>
                <div className="providerGrid">
                  {PROVIDER_PRESETS.map(preset => (
                    <button
                      key={preset.id}
                      type="button"
                      className={`providerCard ${globalApi.provider === preset.id ? 'active' : ''}`}
                      onClick={() => selectProvider(preset)}
                    >
                      {preset.logo ? (
                        <img className="providerLogo" src={preset.logo} alt={`${preset.name} logo`} draggable={false} />
                      ) : (
                        <span className="providerMark" style={{ color: preset.color }}>{preset.mark}</span>
                      )}
                      <span className="providerName">{preset.name}</span>
                      {globalApi.provider === preset.id && <CheckCircle2 className="providerCheck" size={18} />}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid apiLayout">
                <div className="appCard configCard">
                  <div className="appHead">
                    <div className="configTitle">
                      {currentPreset?.logo ? (
                        <img className="configLogo" src={currentPreset.logo} alt={`${currentPreset.name} logo`} draggable={false} />
                      ) : (
                        <strong>{currentPreset?.name ?? '自定义'}</strong>
                      )}
                      <span>全局 API 配置，保存后同步到全部应用</span>
                    </div>
                    <div className="chip">{globalApi.provider}</div>
                  </div>
                  <div className="form">
                    <Field label="Base URL" value={globalApi.baseUrl} onChange={value => setBootstrap({
                      ...bootstrap,
                      config: {
                        ...bootstrap.config,
                        global: { ...bootstrap.config.global, api: { ...globalApi, baseUrl: value } },
                      },
                    })} />
                    <Field label="API Key" type="password" value={globalApi.apiKey} onChange={value => setBootstrap({
                      ...bootstrap,
                      config: {
                        ...bootstrap.config,
                        global: { ...bootstrap.config.global, api: { ...globalApi, apiKey: value } },
                      },
                    })} />
                    <ModelField label="Model" value={globalApi.model} models={modelSuggestions} onChange={value => setBootstrap({
                      ...bootstrap,
                      config: {
                        ...bootstrap.config,
                        global: { ...bootstrap.config.global, api: { ...globalApi, model: value } },
                      },
                    })} />
                  </div>
                  <div className="hint">
                    保存后会同步到 OpenClaw、Hermes、Claude Code、Codex 和 DeepSeek Harness 的对应配置文件。
                  </div>
                  <div className="appOps">
                    <button type="button" className="primary" onClick={() => void saveGlobalConfig()} disabled={saving}>
                      <Save size={16} /> 保存并同步
                    </button>
                  </div>
                </div>

                <div className="stack">
                  {appIds().map((id) => (
                    <div key={id} className="appCard">
                      <div className="appHead">
                        <div>
                          <strong>{label(id)}</strong>
                          <span>{bootstrap.appFiles[id].path}</span>
                        </div>
                        <div className="chip">{bootstrap.appFiles[id].format.toUpperCase()}</div>
                      </div>
                      <div className="appOps">
                        <button type="button" className="ghost" onClick={() => setActiveApp(id)}>
                          <Settings2 size={16} /> 在线编辑
                        </button>
                        <button type="button" className="ghost" onClick={() => void syncApp(id)}>
                          <Link2 size={16} /> 同步全局 API
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}

          {activeStep === 'wechat' && (() => {
            const wx = bootstrap.config.apps.openclaw.wechat
            const login = wechatLogins.openclaw
            const busy = Boolean(wechatLoginBusy.openclaw)
            const verifyCode = wechatVerifyCodes.openclaw ?? ''
            const routes = [
              ['OpenClaw', '不加前缀直接发送'],
              ['Claude Code', '/claude <任务>'],
              ['Codex', '/codex-run <任务>'],
              ['Hermes Agent', '/hermes <任务>'],
              ['DeepSeek Harness', '微信路由暂未支持'],
            ] as const
            return (
              <div className="grid wechatGrid">
                <div className="appCard">
                  <div className="appHead">
                    <div>
                      <strong>OpenClaw 微信单入口</strong>
                      <span>仅 OpenClaw 保存并使用微信 bot 凭据</span>
                    </div>
                    <div className={`chip ${wx.enabled ? 'green' : ''}`}>{wx.enabled ? '已连接' : '未连接'}</div>
                  </div>
                  <div className="wechatConnect">
                    <button type="button" className="primary" onClick={() => void startWechat('openclaw')} disabled={busy}>
                      <QrCode size={16} /> {busy ? '处理中...' : '扫码连接微信'}
                    </button>
                    {login && (
                      <div className="qrLoginPanel">
                        {login.qrDataUrl && login.status !== 'connected' && <img className="wechatQr" src={login.qrDataUrl} alt="OpenClaw 微信登录二维码" />}
                        <strong>{login.message}</strong>
                        {login.status === 'need_verifycode' && (
                          <div className="qrVerify">
                            <input value={verifyCode} onChange={event => setWechatVerifyCodes(previous => ({ ...previous, openclaw: event.target.value }))} placeholder="输入微信显示的验证码" inputMode="numeric" />
                            <button type="button" className="ghost" onClick={() => void submitWechatVerifyCode('openclaw')} disabled={busy || !verifyCode.trim()}>提交验证码</button>
                          </div>
                        )}
                        {login.qrcodeUrl && login.status !== 'connected' && <a href={login.qrcodeUrl} target="_blank" rel="noreferrer">打开二维码链接</a>}
                      </div>
                    )}
                    <button type="button" className="ghost" onClick={() => void migrateLegacyWechatCredentials()} disabled={wechatMigrationBusy}>
                      {wechatMigrationBusy ? '正在重置...' : '重置微信连接'}
                    </button>
                  </div>
                </div>
                <div className="appCard">
                  <div className="appHead"><div><strong>消息路由</strong><span>每条带前缀的消息均为单次执行</span></div></div>
                  <div className="routeList">
                    {routes.map(([name, command]) => <div key={name}><strong>{name}</strong><code>{command}</code></div>)}
                  </div>
                </div>
              </div>
            )
          })()}

          {activeStep === 'skills' && (
            <div className="skillsPage">
              <p className="skillsIntro">为您的智能体提供预封装且可重复的最佳实践与工具</p>
              <div className="skillToolbar">
                <label className="skillSearch">
                  <Search size={22} />
                  <input value={skillSearch} onChange={event => setSkillSearch(event.target.value)} placeholder="搜索技能" />
                </label>
                <button type="button" className="skillAddButton" onClick={() => setSkillTab('marketplace')}>
                  <PlusCircle size={20} /> 添加
                </button>
              </div>
              <div className="skillTabs">
                <button type="button" className={skillTab === 'installed' ? 'active' : ''} onClick={() => setSkillTab('installed')}>
                  已安装 <span>{bootstrap.skills.length}</span>
                </button>
                <button type="button" className={skillTab === 'marketplace' ? 'active' : ''} onClick={() => setSkillTab('marketplace')}>
                  技能市场
                </button>
              </div>
              <div className="skillCategories">
                <button type="button" className={skillCategory === 'all' ? 'active' : ''} onClick={() => selectSkillCategory('all')}>全部</button>
                {marketplace.tags.map(tag => (
                  <button key={tag.id} type="button" className={skillCategory === tag.id ? 'active' : ''} onClick={() => selectSkillCategory(tag.id, tag.categoryId)}>{tag.label}</button>
                ))}
              </div>
              {skillTab === 'marketplace' && marketError ? (
                <div className="skillEmpty" role="alert">{marketError}<button type="button" onClick={() => setMarketQuery(previous => ({ ...previous, revision: previous.revision + 1 }))}><RefreshCcw size={16} /> 重试</button></div>
              ) : skillTab === 'marketplace' && marketLoading ? (
                <div className="skillEmpty"><Store size={22} /> 正在读取技能市场...</div>
              ) : filteredSkills.length ? (
                <div className="skillGrid">
                  {filteredSkills.map(skill => {
                    const busy = Boolean(skillsBusy[skill.id])
                    return (
                      <article key={skill.id} className="skillCard">
                        <div className="skillCardHead">
                          <div className="skillName"><span className="skillIcon"><Puzzle size={21} /></span><strong>{skill.name}</strong></div>
                          {skillTab === 'marketplace' ? (
                            skill.installed ? (
                              <span className="skillInstalled"><CheckCircle2 size={15} /> 已安装</span>
                            ) : (
                              <button type="button" className="skillInstall" onClick={() => void skillAction('install', skill)} disabled={busy || !skill.url}>
                                <Download size={16} /> 安装
                              </button>
                            )
                          ) : (
                            <div className="skillControls">
                              {!allSkillTargets(skill) && <button type="button" className="syncButton" title="补齐到全部应用" onClick={() => void skillAction('sync', skill)} disabled={busy}><RefreshCcw size={16} /> 补齐</button>}
                              <button type="button" className="iconButton" title="卸载技能" onClick={() => void skillAction('uninstall', skill)} disabled={busy}><Trash2 size={18} /></button>
                              <button type="button" className={`skillToggle ${skill.enabled ? 'on' : ''}`} title={skill.enabled ? '停用技能' : '启用技能'} onClick={() => void skillAction('toggle', skill)} disabled={busy}><Power size={16} /></button>
                            </div>
                          )}
                        </div>
                        <p>{skill.description || '暂无技能说明'}</p>
                        <div className="skillMeta"><span>{skill.source || 'Github'}</span><i>·</i><span>{skill.version || 'v1.0.0'}</span><i>·</i><span>{targetSummary(skill)}</span>{skill.updatedAt && <><i>·</i><span>{skill.updatedAt}</span></>}</div>
                      </article>
                    )
                  })}
                </div>
              ) : (
                <div className="skillEmpty"><Puzzle size={22} /> 没有匹配的技能</div>
              )}
              {skillTab === 'marketplace' && !marketLoading && !marketError && (
                <div className="skillPagination" aria-label="技能市场分页">
                  <span>共 {marketplace.total} 条 · {marketplace.total_pages ? marketplace.page : 0} / {marketplace.total_pages} 页</span>
                  <button type="button" disabled={marketplace.page <= 1} onClick={() => setMarketQuery(previous => ({ ...previous, page: previous.page - 1 }))}>上一页</button>
                  <button type="button" disabled={marketplace.page >= marketplace.total_pages} onClick={() => setMarketQuery(previous => ({ ...previous, page: previous.page + 1 }))}>下一页</button>
                </div>
              )}
            </div>
          )}

          {activeStep === 'done' && (
            <div className="doneLayout">
              <div className="grid doneSummary">
                {steps.map(step => (
                  <div key={step.id} className={`summaryCard ${step.completed ? 'ok' : ''}`}>
                    <div className="summaryTitle">
                      {step.completed ? <CheckCircle2 size={16} /> : <Circle size={16} />}
                      <strong>{step.title}</strong>
                    </div>
                    <span>{step.detail}</span>
                  </div>
                ))}
              </div>

              <div className="entries">
                {appIds().map((id) => {
                  const url = launch.webUrls[id]
                  const runtimeStatus = bootstrap.appStatuses[id]
                  const busy = Boolean(appBusy[id])
                  return (
                    <div key={id} className="entryRow">
                      <div className="entryMain">
                        <strong>{label(id)}</strong>
                        <div className="entryDetails">
                          <span className={`runtimeChip ${runtimeStatus?.running ? 'running' : runtimeStatus?.phase === 'error' ? 'error' : ''}`}>
                            <Activity size={13} /> {runtimeStatusLabel(runtimeStatus)}
                          </span>
                          <span>{runtimeStatus?.version && runtimeStatus.version !== '未找到' ? `版本 ${runtimeStatus.version}` : '版本未知'}</span>
                          <span>{runtimeStatus?.kind === 'cli' ? 'CLI 应用，无网页服务' : runtimeStatus?.pid ? `PID ${runtimeStatus.pid}` : '网页服务'}</span>
                        </div>
                        <span>{runtimeStatus?.kind === 'cli' ? '请通过终端运行交互式命令' : url || '未配置外部入口'}</span>
                      </div>
                      <div className="appOps entryActions">
                        <button type="button" className="ghost" onClick={() => void appAction(id, 'start')} disabled={busy || Boolean(runtimeStatus?.running)}>
                          <Play size={15} /> 启动
                        </button>
                        <button type="button" className="ghost" onClick={() => void appAction(id, 'stop')} disabled={busy || !runtimeStatus?.running}>
                          <Square size={15} /> 停止
                        </button>
                        <button type="button" className="ghost" onClick={() => void appAction(id, 'restart')} disabled={busy}>
                          <RotateCcw size={15} /> 重启
                        </button>
                        <button type="button" className="ghost" onClick={() => void appAction(id, 'update')} disabled={busy}>
                          <Download size={15} /> 更新
                        </button>
                        <button type="button" className="ghost" onClick={() => void appAction(id, 'terminal')} disabled={busy}>
                          <Terminal size={15} /> 打开终端
                        </button>
                        {id === 'hermes' && (
                          <button type="button" className="primary" onClick={() => void appAction(id, 'terminal-desktop')} disabled={busy}>
                            <ExternalLink size={15} /> 打开桌面端
                          </button>
                        )}
                        <button type="button" className="ghost" onClick={() => { setActiveApp(id); setActiveStep('api') }}>
                          <Settings2 size={15} /> 编辑配置
                        </button>
                        {runtimeStatus?.kind !== 'cli' && (
                          <button type="button" className="primary" onClick={() => void fetch('/api/launch-url', {
                            method: 'POST',
                            headers: { 'content-type': 'application/json' },
                            body: JSON.stringify({ appId: id, target: url || `${location.origin}/?app=${id}&step=done` }),
                          })}>
                            <ExternalLink size={15} /> 打开入口
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {activeStep !== 'environment' && activeStep !== 'api' && activeStep !== 'wechat' && activeStep !== 'done' && null}
        </section>

        {activeStep === 'api' && <section className="panel editorPanel">
          <div className="editorHead">
            <div>
              <h2>{label(activeApp)} 配置文件</h2>
              <p>{currentFile.path}</p>
            </div>
            <div className="actions">
              <button type="button" className="ghost" onClick={() => void syncApp(activeApp)}>
                <FlaskConical size={16} /> 同步全局 API
              </button>
              <button type="button" className="primary" onClick={() => void saveRaw(activeApp)} disabled={saving}>
                <Save size={16} /> 保存文件
              </button>
            </div>
          </div>
          <textarea
            className="editor"
            value={appRawDraft}
            onChange={event => {
              setAppRawDraft(event.target.value)
              setAppRawDirty(true)
            }}
            spellCheck={false}
          />
        </section>}

        <footer className="footer">
          <span>{status || '就绪'}</span>
          <span>{stepMap.get(activeStep)?.completed ? '当前步骤已完成' : '当前步骤未完成'}</span>
        </footer>
      </main>
      {dongchuangAuth && (
        <div className="authOverlay" role="dialog" aria-modal="true" aria-labelledby="dongchuang-auth-title">
          <div className="authDialog">
            <div className="authDialogHead">
              <div>
                <h2 id="dongchuang-auth-title">东创 AI 授权</h2>
                <p>{dongchuangAuth.message}</p>
              </div>
              <button type="button" className="iconButton" title="关闭授权窗口" onClick={() => void cancelDongchuangAIAuth()}><X size={18} /></button>
            </div>
            {dongchuangAuth.phase === 'pending' && (
              <div className="authDialogBody">
                <p>浏览器已打开东创 AI 授权页面。完成授权后，此处会自动同步 API 配置。</p>
                <div className="authCode"><span>授权码</span><strong>{dongchuangAuth.userCode}</strong></div>
                {dongchuangAuth.verificationUri && <a href={dongchuangAuth.verificationUri} target="_blank" rel="noreferrer">无法打开浏览器？前往授权页面 <ExternalLink size={14} /></a>}
              </div>
            )}
            {dongchuangAuth.phase === 'success' && <div className="authDialogBody success">授权完成，已同步东创 AI API 设置。</div>}
            {dongchuangAuth.phase === 'error' && <div className="authDialogBody error">{dongchuangAuth.message}</div>}
            <div className="authDialogFooter">
              {dongchuangAuth.phase === 'error' ? (
                <button type="button" className="primary" onClick={() => { setDongchuangAuth(null); void startDongchuangAIAuth() }}>重新授权</button>
              ) : dongchuangAuth.phase === 'success' ? (
                <button type="button" className="primary" onClick={() => setDongchuangAuth(null)}>完成</button>
              ) : (
                <button type="button" className="ghost" onClick={() => void cancelDongchuangAIAuth()}>取消</button>
              )}
            </div>
          </div>
        </div>
      )}
      {updateModalOpen && softwareUpdate && (
        <div className="authOverlay" role="dialog" aria-modal="true" aria-labelledby="software-update-title">
          <div className="authDialog updateDialog">
            <div className="authDialogHead">
              <div>
                <h2 id="software-update-title">发现新版本 v{softwareUpdate.version}</h2>
                <p>{softwareUpdate.title || (softwareUpdate.date ? `发布日期：${softwareUpdate.date}` : '可下载新的软件版本')}</p>
              </div>
              <button type="button" className="iconButton" title="关闭更新窗口" onClick={() => setUpdateModalOpen(false)} disabled={updateBusy}><X size={18} /></button>
            </div>
            <div className="authDialogBody">
              {softwareUpdate.changes.length > 0 && <ul className="updateChanges">{softwareUpdate.changes.map((change, index) => <li key={`${index}-${change}`}>{change}</li>)}</ul>}
              {softwareUpdate.size > 0 && <span className="muted">安装包大小：{(softwareUpdate.size / 1024 / 1024).toFixed(1)} MB</span>}
              {updateMessage && <div className={updateMessage.includes('失败') || updateMessage.includes('请先') ? 'updateMessage error' : 'updateMessage'}>{updateMessage}</div>}
            </div>
            <div className="authDialogFooter updateDialogFooter">
              <button type="button" className="ghost" onClick={() => void checkSoftwareUpdate(true)} disabled={updateBusy}><RefreshCcw size={16} /> 检查更新</button>
              <a className="ghost updateDownload" href={softwareUpdate.zipUrl} target="_blank" rel="noreferrer"><Download size={16} /> 下载更新</a>
              <button type="button" className="primary" onClick={() => void installSoftwareUpdate()} disabled={updateBusy}>
                {updateBusy ? <RefreshCcw className="spin" size={16} /> : <PackageOpen size={16} />} {updateBusy ? '正在准备安装...' : '自动安装更新'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function InfoCard({ icon, title, value }: { icon: React.ReactNode; title: string; value: string }): React.ReactElement {
  return (
    <div className="infoCard">
      <div className="infoIcon">{icon}</div>
      <div>
        <span>{title}</span>
        <strong>{value}</strong>
      </div>
    </div>
  )
}

function VersionCard({ title, version }: { title: string; version: RuntimeVersion }): React.ReactElement {
  return <InfoCard icon={<Activity size={18} />} title={title} value={version.available ? version.version : '未找到'} />
}

function runtimeStatusLabel(status: AppRuntimeStatus | undefined): string {
  if (!status) return '读取中'
  if (!status.installed) return '未安装'
  if (status.phase === 'updating') return '更新中'
  if (status.phase === 'starting') return '启动中'
  if (status.phase === 'stopping') return '停止中'
  if (status.phase === 'error') return '启动失败'
  if (status.running) return '运行中'
  return status.kind === 'cli' ? '已安装' : '已停止'
}

function allSkillTargets(skill: SkillRecord): boolean {
  return Object.values(skill.targets ?? {}).length === 5 && Object.values(skill.targets ?? {}).every(Boolean)
}

function targetSummary(skill: SkillRecord): string {
  const targets = Object.values(skill.targets ?? {})
  if (!skill.installed) return '未安装'
  return `应用 ${targets.filter(Boolean).length}/5`
}

function actionMessage(appId: AppId, action: 'start' | 'stop' | 'restart' | 'update' | 'terminal' | 'terminal-desktop'): string {
  const name = label(appId)
  return {
    start: `${name} 启动命令已执行`,
    stop: `${name} 已停止`,
    restart: `${name} 重启命令已执行`,
    update: `${name} 更新完成`,
    terminal: `${name} 终端已打开`,
    'terminal-desktop': `${name} 桌面端已打开`,
  }[action]
}

function Field({
  label,
  value,
  onChange,
  type = 'text',
  list,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  type?: string
  list?: string[]
}): React.ReactElement {
  const listId = `${label}-list`
  return (
    <label className="field">
      <span>{label}</span>
      <input
        type={type}
        value={value}
        list={list && list.length ? listId : undefined}
        onChange={event => onChange(event.target.value)}
      />
      {list && list.length > 0 && (
        <datalist id={listId}>
          {list.map(item => <option key={item} value={item} />)}
        </datalist>
      )}
    </label>
  )
}

function ModelField({
  label,
  value,
  models,
  onChange,
}: {
  label: string
  value: string
  models: string[]
  onChange: (value: string) => void
}): React.ReactElement {
  const [custom, setCustom] = useState(false)
  const inList = models.includes(value)
  const typing = custom || (!inList && value !== '')
  if (typing) {
    return (
      <label className="field">
        <span>{label}</span>
        <div className="modelRow">
          <input
            type="text"
            value={value}
            list="model-suggest"
            placeholder="输入模型名称…"
            onChange={event => onChange(event.target.value)}
          />
          <button type="button" className="modelCustom" onClick={() => setCustom(false)}>
            列表选择
          </button>
        </div>
        <datalist id="model-suggest">
          {models.map(item => <option key={item} value={item} />)}
        </datalist>
      </label>
    )
  }
  return (
    <label className="field">
      <span>{label}</span>
      <div className="modelRow">
        <select
          value={value}
          onChange={event => onChange(event.target.value)}
        >
          {!inList && value ? <option value={value}>{value}</option> : null}
          {models.map(item => <option key={item} value={item}>{item}</option>)}
        </select>
        <button type="button" className="modelCustom" onClick={() => setCustom(true)}>
          自定义
        </button>
      </div>
    </label>
  )
}
