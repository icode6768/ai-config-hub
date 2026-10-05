import { existsSync } from 'node:fs'
import { readFile, writeFile, mkdir, rename } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import YAML from 'yaml'
import { parse as parseToml, stringify as stringifyToml } from '@iarna/toml'
import type { AppDraft, AppFileState, AppId, LauncherConfig, SharedApiConfig, StepStatus, WechatConfig } from './types'
import { APP_FILE_BINDINGS, dshProfilePatchPaths, globalConfigPath, runtimeStartEnvPath } from './paths'

const defaultWechat = (): WechatConfig => ({
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
})

export function defaultLauncherConfig(): LauncherConfig {
  return {
    version: 1,
    global: {
      api: {
        provider: 'dongchuangai',
        baseUrl: 'https://api.dongchuangai.com/v1',
        apiKey: '',
        model: 'gpt-5.5',
      },
      launch: {
        openclawConfigPath: APP_FILE_BINDINGS.openclaw.path,
        openclawStateDir: dirname(APP_FILE_BINDINGS.openclaw.path),
        webUrls: {
          openclaw: 'http://127.0.0.1:18789',
          hermes: '',
          claude: 'http://127.0.0.1:8081',
          codex: 'http://127.0.0.1:8082',
          'deepseek-harness': 'http://127.0.0.1:3080',
        },
        persistSystemPath: false,
      },
      update: {
        app_id: 0,
        user_id: 0,
      },
    },
    apps: {
      openclaw: { wechat: defaultWechat() },
      hermes: { wechat: defaultWechat() },
      claude: { wechat: defaultWechat() },
      codex: { wechat: defaultWechat() },
      'deepseek-harness': { wechat: defaultWechat() },
    },
  }
}

function ensureArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string => typeof item === 'string')
}

function normalizeWechat(raw: Partial<WechatConfig> | undefined): WechatConfig {
  const base = defaultWechat()
  if (!raw) return base
  return {
    enabled: Boolean(raw.enabled),
    accountId: typeof raw.accountId === 'string' ? raw.accountId : base.accountId,
    token: typeof raw.token === 'string' ? raw.token : base.token,
    baseUrl: typeof raw.baseUrl === 'string' && raw.baseUrl ? raw.baseUrl : base.baseUrl,
    cdnBaseUrl: typeof raw.cdnBaseUrl === 'string' && raw.cdnBaseUrl ? raw.cdnBaseUrl : base.cdnBaseUrl,
    dmPolicy: raw.dmPolicy === 'allowlist' || raw.dmPolicy === 'disabled' || raw.dmPolicy === 'pairing' ? raw.dmPolicy : 'open',
    groupPolicy: raw.groupPolicy === 'open' || raw.groupPolicy === 'allowlist' ? raw.groupPolicy : 'disabled',
    allowFrom: ensureArray(raw.allowFrom),
    groupAllowFrom: ensureArray(raw.groupAllowFrom),
    splitMultilineMessages: Boolean(raw.splitMultilineMessages),
  }
}

function normalizeAppDraft(raw: unknown): AppDraft {
  const draft = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {}
  return {
    wechat: normalizeWechat(draft.wechat as Partial<WechatConfig> | undefined),
  }
}

function apiFromClaude(raw: string): Partial<SharedApiConfig> | null {
  const parsed = parseJsonFallback(raw)
  const env = parsed.env as Record<string, unknown> | undefined
  const baseUrl = typeof env?.ANTHROPIC_BASE_URL === 'string' ? env.ANTHROPIC_BASE_URL : ''
  const apiKey = typeof env?.ANTHROPIC_API_KEY === 'string' ? env.ANTHROPIC_API_KEY : ''
  const model = typeof env?.ANTHROPIC_MODEL === 'string' ? env.ANTHROPIC_MODEL : (typeof parsed.model === 'string' ? parsed.model : '')
  return baseUrl && apiKey && model ? { provider: 'dongchuangai', baseUrl, apiKey, model } : null
}

function apiFromCodex(raw: string): Partial<SharedApiConfig> | null {
  const parsed = parseTomlFallback(raw)
  const model = typeof parsed.model === 'string' ? parsed.model : ''
  const provider = typeof parsed.model_provider === 'string' ? parsed.model_provider : ''
  const providerConfig = provider && parsed.model_providers && typeof parsed.model_providers === 'object'
    ? (parsed.model_providers as Record<string, unknown>)[provider] as Record<string, unknown> | undefined
    : undefined
  const baseUrl = typeof providerConfig?.base_url === 'string' ? providerConfig.base_url : ''
  const apiKey = typeof providerConfig?.api_key === 'string' ? providerConfig.api_key : ''
  return baseUrl && apiKey && model ? { provider, baseUrl, apiKey, model } : null
}

function apiFromOpenclaw(raw: string): Partial<SharedApiConfig> | null {
  const parsed = parseJsonFallback(raw)
  const providers = parsed.models && typeof parsed.models === 'object'
    ? (parsed.models as Record<string, unknown>).providers as Record<string, unknown> | undefined
    : undefined
  const firstProvider = providers ? Object.values(providers)[0] as Record<string, unknown> | undefined : undefined
  const baseUrl = typeof firstProvider?.baseUrl === 'string'
    ? firstProvider.baseUrl
    : (typeof firstProvider?.baseURL === 'string' ? firstProvider.baseURL : '')
  const apiKey = typeof firstProvider?.apiKey === 'string' ? firstProvider.apiKey : ''
  const primary = parsed.agents && typeof parsed.agents === 'object'
    ? (((parsed.agents as Record<string, unknown>).defaults as Record<string, unknown> | undefined)?.model as Record<string, unknown> | undefined)
    : undefined
  const primaryValue = typeof primary?.primary === 'string' ? primary.primary : ''
  const aliasValue = providers
    ? Object.values(((parsed.agents as Record<string, unknown> | undefined)?.defaults as Record<string, unknown> | undefined)?.models as Record<string, unknown> | undefined ?? {})
        .flatMap(value => (value && typeof value === 'object' ? [value as Record<string, unknown>] : []))
        .find(entry => typeof entry.alias === 'string')?.alias as string | undefined
    : undefined
  const model = aliasValue ?? (primaryValue.includes('/') ? primaryValue.split('/').pop() : primaryValue)
  return baseUrl && apiKey && model ? { provider: 'dongchuangai', baseUrl, apiKey, model } : null
}

function apiFromYaml(raw: string): Partial<SharedApiConfig> | null {
  const parsed = parseYamlFallback(raw)
  const modelSection = parsed.model && typeof parsed.model === 'object' ? parsed.model as Record<string, unknown> : undefined
  const providerEntries = parsed.models && typeof parsed.models === 'object'
    ? ((parsed.models as Record<string, unknown>).providers as Record<string, unknown> | undefined)
    : undefined
  const firstProvider = providerEntries ? Object.values(providerEntries)[0] as Record<string, unknown> | undefined : undefined
  const baseUrl = typeof firstProvider?.baseURL === 'string'
    ? firstProvider.baseURL
    : (typeof firstProvider?.base_url === 'string' ? firstProvider.base_url : '')
  const apiKey = typeof firstProvider?.apiKey === 'string' ? firstProvider.apiKey : ''
  const firstModel = typeof firstProvider?.models === 'object' && Array.isArray(firstProvider.models) && typeof firstProvider.models[0] === 'object'
    ? (firstProvider.models[0] as Record<string, unknown>).id as string | undefined
    : undefined
  const model = typeof modelSection?.default === 'string'
    ? modelSection.default
    : (firstModel ?? '')
  return baseUrl && apiKey && model ? { provider: 'dongchuangai', baseUrl, apiKey, model } : null
}

export async function inferSharedApiFromAppFiles(): Promise<Partial<SharedApiConfig> | null> {
  const candidates = [
    await readTextIfExists(APP_FILE_BINDINGS.openclaw.path).then(raw => raw ? apiFromOpenclaw(raw) : null),
    await readTextIfExists(APP_FILE_BINDINGS.codex.path).then(raw => raw ? apiFromCodex(raw) : null),
    await readTextIfExists(APP_FILE_BINDINGS['deepseek-harness'].path).then(raw => raw ? apiFromYaml(raw) : null),
    await readTextIfExists(APP_FILE_BINDINGS.hermes.path).then(raw => raw ? apiFromYaml(raw) : null),
    await readTextIfExists(APP_FILE_BINDINGS.claude.path).then(raw => raw ? apiFromClaude(raw) : null),
  ].filter((candidate): candidate is Partial<SharedApiConfig> => Boolean(candidate))
  return candidates[0] ?? null
}

export async function readTextIfExists(filePath: string): Promise<string | null> {
  try {
    return await readFile(filePath, 'utf8')
  } catch {
    return null
  }
}

async function ensureParent(filePath: string): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true })
}

async function writeAtomic(filePath: string, raw: string): Promise<void> {
  await ensureParent(filePath)
  const tempPath = `${filePath}.tmp`
  await writeFile(tempPath, raw, 'utf8')
  await rename(tempPath, filePath)
}

export async function loadGlobalConfig(): Promise<LauncherConfig> {
  const raw = await readTextIfExists(globalConfigPath())
  if (!raw) return defaultLauncherConfig()
  const parsed = YAML.parse(raw) as Partial<LauncherConfig> | null
  const defaults = defaultLauncherConfig()
  const api = (parsed?.global?.api ?? {}) as Partial<SharedApiConfig>
  const launch = (parsed?.global?.launch ?? {}) as Partial<LauncherConfig['global']['launch']> & { webUrls?: Partial<LauncherConfig['global']['launch']['webUrls']> }
  const update = (parsed?.global?.update ?? {}) as Partial<LauncherConfig['global']['update']>
  const apps = (parsed?.apps ?? {}) as Partial<Record<AppId, Partial<AppDraft>>>
  return {
    version: typeof parsed?.version === 'number' ? parsed.version : defaults.version,
    global: {
      api: {
        provider: typeof api.provider === 'string' ? api.provider : defaults.global.api.provider,
        baseUrl: typeof api.baseUrl === 'string' ? api.baseUrl : defaults.global.api.baseUrl,
        apiKey: typeof api.apiKey === 'string' ? api.apiKey : defaults.global.api.apiKey,
        model: typeof api.model === 'string' ? api.model : defaults.global.api.model,
        ...(api.authSource === 'dongchuangai-oauth' ? { authSource: api.authSource } : {}),
        ...(typeof api.authAccountName === 'string' ? { authAccountName: api.authAccountName } : {}),
        ...(typeof api.authAccountPhone === 'string' ? { authAccountPhone: api.authAccountPhone } : {}),
      },
      launch: {
        // These paths belong to the current portable root. Ignore stale absolute
        // paths from an older drive location or the former non-state config file.
        openclawConfigPath: defaults.global.launch.openclawConfigPath,
        openclawStateDir: defaults.global.launch.openclawStateDir,
        webUrls: {
          openclaw: typeof launch.webUrls?.openclaw === 'string' ? launch.webUrls.openclaw : defaults.global.launch.webUrls.openclaw,
          hermes: typeof launch.webUrls?.hermes === 'string' ? launch.webUrls.hermes : defaults.global.launch.webUrls.hermes,
          claude: typeof launch.webUrls?.claude === 'string' ? launch.webUrls.claude : defaults.global.launch.webUrls.claude,
          codex: typeof launch.webUrls?.codex === 'string' ? launch.webUrls.codex : defaults.global.launch.webUrls.codex,
          'deepseek-harness': typeof launch.webUrls?.['deepseek-harness'] === 'string' ? launch.webUrls['deepseek-harness'] : defaults.global.launch.webUrls['deepseek-harness'],
        },
        persistSystemPath: typeof launch.persistSystemPath === 'boolean' ? launch.persistSystemPath : defaults.global.launch.persistSystemPath,
      },
      update: {
        app_id: typeof update.app_id === 'number' && Number.isSafeInteger(update.app_id) && update.app_id >= 0 ? update.app_id : defaults.global.update.app_id,
        user_id: typeof update.user_id === 'number' && Number.isSafeInteger(update.user_id) && update.user_id >= 0 ? update.user_id : defaults.global.update.user_id,
      },
    },
    apps: {
      openclaw: normalizeAppDraft(apps.openclaw),
      hermes: normalizeAppDraft(apps.hermes),
      claude: normalizeAppDraft(apps.claude),
      codex: normalizeAppDraft(apps.codex),
      'deepseek-harness': normalizeAppDraft(apps['deepseek-harness']),
    },
  }
}

export async function saveGlobalConfig(config: LauncherConfig): Promise<void> {
  await writeAtomic(globalConfigPath(), YAML.stringify(config, { indent: 2 }))
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

export async function syncDeepseekHarnessProfiles(api: SharedApiConfig): Promise<void> {
  const provider = api.provider.trim() || 'dongchuangai'
  const baseURL = api.baseUrl.trim()
  const model = api.model.trim()
  if (!baseURL || !model) return

  for (const patchPath of dshProfilePatchPaths()) {
    const currentRaw = await readTextIfExists(patchPath)
    const parsed = currentRaw?.trim() ? YAML.parse(currentRaw) : []
    const entries = Array.isArray(parsed) ? parsed : []
    const index = entries.findIndex(entry => isRecord(entry) && entry.id === 'llm-pi-ai')
    const existing = index >= 0 && isRecord(entries[index]) ? entries[index] : {}
    const existingConfig = isRecord(existing.config) ? existing.config : {}
    const existingProviders = isRecord(existingConfig.providers) ? existingConfig.providers : {}
    const existingProvider = isRecord(existingProviders[provider]) ? existingProviders[provider] : {}
    const nextEntry = {
      ...existing,
      id: 'llm-pi-ai',
      config: {
        ...existingConfig,
        providers: {
          ...existingProviders,
          [provider]: {
            ...existingProvider,
            displayName: provider,
            apiKeyEnv: 'DONGCHUANGAI_API_KEY',
            api: 'openai-completions',
            baseURL,
            models: [{ id: model, name: model }],
          },
        },
      },
    }
    if (index >= 0) entries[index] = nextEntry
    else entries.push(nextEntry)

    const defaultModelIndex = entries.findIndex(entry => isRecord(entry) && entry.id === 'agent-default-model')
    const existingDefaultModel = defaultModelIndex >= 0 && isRecord(entries[defaultModelIndex]) ? entries[defaultModelIndex] : {}
    const existingDefaultModelConfig = isRecord(existingDefaultModel.config) ? existingDefaultModel.config : {}
    const nextDefaultModel = {
      ...existingDefaultModel,
      id: 'agent-default-model',
      config: {
        ...existingDefaultModelConfig,
        provider,
        model,
      },
    }
    if (defaultModelIndex >= 0) entries[defaultModelIndex] = nextDefaultModel
    else entries.push(nextDefaultModel)
    await writeAtomic(patchPath, YAML.stringify(entries, { indent: 2 }))
  }
}

export async function loadAppFileState(appId: AppId): Promise<AppFileState> {
  const binding = APP_FILE_BINDINGS[appId]
  const raw = await readTextIfExists(binding.path)
  return {
    exists: raw !== null,
    path: binding.path,
    format: binding.format,
    raw: raw ?? '',
  }
}

export async function saveAppFile(appId: AppId, raw: string): Promise<void> {
  const binding = APP_FILE_BINDINGS[appId]
  if (binding.format === 'json') {
    const parsed = raw.trim() ? JSON.parse(raw) : {}
    await writeAtomic(binding.path, `${JSON.stringify(parsed, null, 2)}\n`)
    return
  }
  if (binding.format === 'toml') {
    const parsed = raw.trim() ? parseToml(raw) : {}
    await writeAtomic(binding.path, `${stringifyToml(parsed)}\n`)
    return
  }
  const parsed = raw.trim() ? YAML.parse(raw) : {}
  await writeAtomic(binding.path, `${YAML.stringify(parsed, { indent: 2 })}`)
}

export function applySharedApi(config: LauncherConfig): LauncherConfig {
  const api = config.global.api
  const next = structuredClone(config)
  void api
  return next
}

function mergePlain(target: Record<string, unknown>, patch: Record<string, unknown>): Record<string, unknown> {
  const next = { ...target }
  for (const [key, value] of Object.entries(patch)) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const child = next[key]
      if (child && typeof child === 'object' && !Array.isArray(child)) {
        next[key] = mergePlain(child as Record<string, unknown>, value as Record<string, unknown>)
      } else {
        next[key] = mergePlain({}, value as Record<string, unknown>)
      }
    } else {
      next[key] = value
    }
  }
  return next
}

function anthropicUrl(baseUrl: string): string {
  const normalized = baseUrl.trim()
  if (!normalized) return normalized
  const v1 = normalized.replace(/\/v1\/?$/, '')
  if (v1 !== normalized) return `${v1}/anthropic`
  return normalized.endsWith('/anthropic') ? normalized : `${normalized.replace(/\/$/, '')}/anthropic`
}

function parseJsonFallback(raw: string): Record<string, unknown> {
  try {
    return raw.trim() ? JSON.parse(raw) as Record<string, unknown> : {}
  } catch {
    return {}
  }
}

function parseYamlFallback(raw: string): Record<string, unknown> {
  try {
    return raw.trim() ? YAML.parse(raw) as Record<string, unknown> : {}
  } catch {
    return {}
  }
}

function parseTomlFallback(raw: string): Record<string, unknown> {
  try {
    return raw.trim() ? parseToml(raw) as Record<string, unknown> : {}
  } catch {
    return {}
  }
}

export interface SyncAppOptions {
  openclawGatewayToken?: string
  openclawGatewayPort?: number
  openclawWorkspace?: string
}

export function syncAppPayload(appId: AppId, config: LauncherConfig, currentRaw = '', options: SyncAppOptions = {}): string {
  const api = config.global.api
  if (appId === 'claude') {
    const base = parseJsonFallback(currentRaw)
    const next = mergePlain(base, {
      env: {
        CLAUDE_CODE_USE_POWERSHELL_TOO: '1',
        ANTHROPIC_BASE_URL: anthropicUrl(api.baseUrl),
        ANTHROPIC_AUTH_TOKEN: api.apiKey,
        ANTHROPIC_API_KEY: api.apiKey,
        ANTHROPIC_MODEL: api.model,
      },
      model: api.model,
      autoUpdatesChannel: 'stable',
      skipDangerousModePermissionPrompt: true,
      theme: 'dark',
    })
    return `${JSON.stringify(next, null, 2)}\n`
  }
  if (appId === 'codex') {
    const base = parseTomlFallback(currentRaw)
    const next = mergePlain(base, {
      model: api.model,
      model_provider: api.provider,
      approval_policy: 'never',
      sandbox_mode: 'danger-full-access',
      personality: 'pragmatic',
      model_providers: {
        [api.provider]: {
          name: api.provider,
          base_url: api.baseUrl,
          wire_api: 'responses',
          env_key: 'DONGCHUANGAI_API_KEY',
          supports_websockets: false,
          requires_openai_auth: false,
        },
      },
    })
    return `${stringifyToml(next as any)}\n`
  }
  if (appId === 'hermes') {
    const base = parseYamlFallback(currentRaw)
    const next = mergePlain(base, {
      model: {
        default: api.model,
        provider: 'custom',
        base_url: api.baseUrl,
      },
    })
    return `${YAML.stringify(next, { indent: 2 })}`
  }
  if (appId === 'openclaw') {
    const base = parseJsonFallback(currentRaw)
    // 自定义模型供应商必须声明 models（缺少时 OpenClaw 网关启动失败）。
    // 保留现有配置中的模型列表，并确保当前全局模型在列。
    const currentProviders = base.models && typeof base.models === 'object'
      ? (base.models as Record<string, unknown>).providers as Record<string, unknown> | undefined
      : undefined
    const existingProvider = currentProviders?.[api.provider] as Record<string, unknown> | undefined
    const existingModels = Array.isArray(existingProvider?.models)
      ? (existingProvider.models as unknown[]).filter((item): item is Record<string, unknown> =>
          Boolean(item && typeof item === 'object') && typeof (item as Record<string, unknown>).id === 'string')
          .map(item => ({ id: item.id as string, name: typeof item.name === 'string' ? item.name : (item.id as string) }))
      : []
    if (api.model && !existingModels.some(item => item.id === api.model)) {
      existingModels.push({ id: api.model, name: api.model })
    }
    const next = mergePlain(base, {
      agents: {
        defaults: {
          ...(options.openclawWorkspace ? { workspace: options.openclawWorkspace } : {}),
          model: {
            primary: `${api.provider}/${api.model}`,
          },
          models: {
            [api.provider]: {
              alias: api.model,
            },
          },
        },
      },
      models: {
        mode: 'merge',
        providers: {
          [api.provider]: {
            baseUrl: api.baseUrl,
            apiKey: api.apiKey,
            api: 'openai-completions',
            models: existingModels,
          },
        },
      },
    })
    if (options.openclawGatewayToken) {
      const existingGateway = next.gateway && typeof next.gateway === 'object'
        ? next.gateway as Record<string, unknown>
        : {}
      const existingAuth = existingGateway.auth && typeof existingGateway.auth === 'object'
        ? existingGateway.auth as Record<string, unknown>
        : {}
      const { password: _password, ...authWithoutPassword } = existingAuth
      next.gateway = {
        ...existingGateway,
        mode: 'local',
        port: options.openclawGatewayPort ?? 18789,
        auth: {
          ...authWithoutPassword,
          mode: 'token',
          token: options.openclawGatewayToken,
        },
      }
    }
    return `${JSON.stringify(next, null, 2)}\n`
  }
  if (appId === 'deepseek-harness') {
    return ''
  }
  return ''
}

export function isStepComplete(config: LauncherConfig, files: Record<AppId, AppFileState>, installedSkillCount = 0): StepStatus[] {
  const apiComplete = Boolean(config.global.api.baseUrl && config.global.api.apiKey && config.global.api.model)
  const openclawWechat = config.apps.openclaw.wechat
  const wechatComplete = Boolean(openclawWechat.enabled || openclawWechat.accountId || openclawWechat.token)
  const environmentComplete = existsSync(runtimeStartEnvPath())
  const skillsComplete = installedSkillCount > 0
  return [
    {
      id: 'environment',
      title: '检测运行环境',
      completed: environmentComplete,
      detail: environmentComplete ? 'runtime 可用' : 'runtime 脚本未找到',
    },
    {
      id: 'api',
      title: '配置 API 模型',
      completed: apiComplete,
      detail: apiComplete ? '全局 API 已配置' : '需要填写全局 API',
    },
    {
      id: 'wechat',
      title: '配置微信连接',
      completed: wechatComplete,
      detail: wechatComplete ? 'OpenClaw 微信单入口已配置' : '连接 OpenClaw 微信单入口',
    },
    {
      id: 'skills',
      title: '安装技能',
      completed: skillsComplete,
      detail: skillsComplete ? `${installedSkillCount} 个技能已就绪` : '选择并安装需要的技能',
    },
    {
      id: 'done',
      title: '完成安装',
      completed: apiComplete && wechatComplete && skillsComplete,
      detail: '网页入口就绪',
    },
  ]
}
