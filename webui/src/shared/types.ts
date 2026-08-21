export const APP_IDS = ['openclaw', 'hermes', 'claude', 'codex', 'deepseek-harness'] as const
export type AppId = typeof APP_IDS[number]

export const APP_LABELS: Record<AppId, string> = {
  openclaw: 'OpenClaw',
  hermes: 'Hermes Agent',
  claude: 'Claude Code',
  codex: 'Codex',
  'deepseek-harness': 'DeepSeek Harness',
}

export type ConfigFormat = 'yaml' | 'json' | 'toml'

export interface SharedApiConfig {
  provider: string
  baseUrl: string
  apiKey: string
  model: string
  authSource?: 'dongchuangai-oauth'
  authAccountName?: string
  authAccountPhone?: string
}

export interface LaunchUrls {
  openclaw: string
  hermes: string
  claude: string
  codex: string
  'deepseek-harness': string
}

export interface WechatConfig {
  enabled: boolean
  accountId: string
  token: string
  baseUrl: string
  cdnBaseUrl: string
  dmPolicy: 'open' | 'allowlist' | 'disabled' | 'pairing'
  groupPolicy: 'open' | 'allowlist' | 'disabled'
  allowFrom: string[]
  groupAllowFrom: string[]
  splitMultilineMessages: boolean
}

export interface AppDraft {
  wechat: WechatConfig
}

export interface LauncherConfig {
  version: number
  global: {
    api: SharedApiConfig
    launch: {
      openclawConfigPath: string
      openclawStateDir: string
      webUrls: LaunchUrls
      persistSystemPath: boolean
    }
    update: {
      app_id: number
      user_id: number
    }
  }
  apps: Record<AppId, AppDraft>
}

export interface FileBinding {
  path: string
  format: ConfigFormat
}

export interface AppFileState {
  exists: boolean
  path: string
  format: ConfigFormat
  raw: string
}

export interface RuntimeVersion {
  version: string
  available: boolean
}

export interface RuntimeVersions {
  node: RuntimeVersion
  python: RuntimeVersion
  openclaw: RuntimeVersion
  claude: RuntimeVersion
  codex: RuntimeVersion
  hermes: RuntimeVersion
  deepseekHarness: RuntimeVersion
}

export type AppRuntimeKind = 'web' | 'cli' | 'bridge'
export type AppRuntimePhase = 'running' | 'stopped' | 'starting' | 'stopping' | 'updating' | 'error'

export interface AppRuntimeStatus {
  appId: AppId
  kind: AppRuntimeKind
  phase: AppRuntimePhase
  installed: boolean
  running: boolean
  webReady: boolean
  version: string
  message: string
  pid?: number
  updatedAt: string
}

export interface StepStatus {
  id: string
  title: string
  completed: boolean
  detail: string
}
