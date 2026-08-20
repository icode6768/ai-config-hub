import { basename, dirname, join, resolve } from 'node:path'
import type { AppId, FileBinding } from './types'

export function rootPath(): string {
  const configuredRoot = process.env.USB_LOBSTER_ROOT?.trim()
  if (configuredRoot) return resolve(configuredRoot)

  const cwd = process.cwd()
  return basename(cwd).toLowerCase() === 'webui' ? dirname(cwd) : cwd
}

export function globalConfigPath(): string {
  return join(rootPath(), 'config.yaml')
}

export function runtimePlatformDir(platform: NodeJS.Platform = process.platform): string {
  return join(rootPath(), 'runtime', platform === 'darwin' ? 'macos' : 'windows')
}

export function runtimeScriptsPath(platform: NodeJS.Platform = process.platform): string {
  return join(runtimePlatformDir(platform), 'scripts')
}

export function runtimeStartEnvPath(platform: NodeJS.Platform = process.platform): string {
  return join(runtimeScriptsPath(platform), platform === 'darwin' ? 'start-env.sh' : 'start-env.cmd')
}

export function runtimeNodeVersionsPath(platform: NodeJS.Platform = process.platform): string {
  return join(runtimePlatformDir(platform), 'node', 'versions')
}

export function runtimeNpmGlobalPath(platform: NodeJS.Platform = process.platform): string {
  // macOS: npm-global 位于 nvm/ 子树下（NVM 加载时会检查 NPM_CONFIG_PREFIX
  //        是否在 NVM_DIR 内，否则 nvm deactivate，runtime/macos/scripts/activate.sh:35）
  // Windows: 顶层 npm-global
  return platform === 'darwin'
    ? join(runtimePlatformDir(platform), 'nvm', 'npm-global')
    : join(runtimePlatformDir(platform), 'npm-global')
}

export function runtimeBinPath(platform: NodeJS.Platform = process.platform): string {
  return join(runtimePlatformDir(platform), 'bin')
}

export function runtimePythonPath(platform: NodeJS.Platform = process.platform): string {
  return join(runtimePlatformDir(platform), 'python')
}

export function dshHomePath(): string {
  return join(rootPath(), '.dsh')
}

export function dshConfigPath(): string {
  return join(dshHomePath(), 'settings.yaml')
}

export const APP_FILE_BINDINGS: Record<AppId, FileBinding> = {
  openclaw: { path: join(rootPath(), '.openclaw', 'state', 'openclaw.json'), format: 'json' },
  hermes: { path: join(rootPath(), '.hermes', 'config.yaml'), format: 'yaml' },
  claude: { path: join(rootPath(), '.claude', 'settings.json'), format: 'json' },
  codex: { path: join(rootPath(), '.codex', 'config.toml'), format: 'toml' },
  'deepseek-harness': { path: dshConfigPath(), format: 'yaml' },
}
