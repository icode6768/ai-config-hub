import { existsSync } from 'node:fs'
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { spawn } from 'node:child_process'
import { delimiter, dirname, join } from 'node:path'
import { dshHomePath, runtimeBinPath, runtimeNodeVersionsPath, runtimeNpmGlobalPath } from '../src/shared/paths'

const BRIDGE_SOURCE_URL = 'https://raw.githubusercontent.com/twinsant/weixin-clawbot/5d005de8fd15a45e70b963d7be9465b016cd74b7/weixin-clawbot.mjs'
const BRIDGE_FILE_NAME = 'weixin-clawbot.mjs'
const BRIDGE_PATCH_MARKER = 'weixin-clawbot'

function bridgePath(): string {
  return join(dshHomePath(), 'deepseek-harness', BRIDGE_FILE_NAME)
}

function profilePatchPath(): string {
  return join(dshHomePath(), 'profiles', 'web', 'cordis.patch.yml')
}

function bridgePatch(): string {
  return [
    '- insert:',
    '    - id: weixin-clawbot',
    '      name: ../../deepseek-harness/weixin-clawbot.mjs',
    '',
  ].join('\n')
}

function harnessWorkspaceRoot(): string {
  return join(dshHomePath(), 'deepseek-harness')
}

// weixin-clawbot.mjs 顶部静态 `import QRCode from 'qrcode'`，但 harness 的
// node_modules 里可能没有 qrcode（比如重装、或 bridge 文件重新下载时），
// 会导致 dsh web 插件树加载失败、进程退出码 1。这里用 require.resolve 探测，
// 缺了就自动 `pnpm add qrcode -w`（-w 因为 deepseek-harness 是 pnpm workspace
// root，不带 -w 会报 ERR_PNPM_ADDING_TO_ROOT）。
function isQrcodeInstalled(): boolean {
  try {
    const require = createRequire(join(harnessWorkspaceRoot(), 'package.json'))
    require.resolve('qrcode')
    return true
  } catch {
    return false
  }
}

// 与 app-processes.ts 的 runtimePathEntries 保持一致：node.exe 真实目录要排在
// runtime\windows\bin 之前。pnpm.cmd 这类 .cmd shim 会以带引号方式调用 "node"，
// 若命中 runtime\windows\bin\node.cmd 自定位 wrapper 会报 "Node.js not found"。
async function runtimePathEntries(): Promise<string[]> {
  if (process.platform !== 'win32') return [join(runtimeNpmGlobalPath(), 'bin'), runtimeBinPath()]
  const base = runtimeNodeVersionsPath()
  const nodeDirectory = (await readdir(base, { withFileTypes: true }).catch(() => []))
    .filter(entry => entry.isDirectory())
    .map(entry => entry.name)
    .sort()
    .at(-1)
  return [
    ...(nodeDirectory ? [join(base, nodeDirectory)] : []),
    runtimeNpmGlobalPath(),
    runtimeBinPath(),
  ]
}

async function ensureQrcodeInstalled(): Promise<void> {
  if (isQrcodeInstalled()) return
  console.log('[DeepSeek Harness] qrcode 缺失，正在安装到 harness 工作区...')
  const pathEntries = [...await runtimePathEntries(), process.env.PATH ?? process.env.Path ?? ''].filter(Boolean)
  const command = deepseekPackageManagerCommand()
  const packageManagerEnv = process.platform === 'win32'
    ? {
        npm_config_node_linker: 'hoisted',
        npm_config_confirm_modules_purge: 'false',
      }
    : {}
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command.command, command.args, {
      cwd: harnessWorkspaceRoot(),
      env: { ...process.env, ...packageManagerEnv, PATH: pathEntries.join(delimiter) },
      windowsHide: true,
      shell: command.shell,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    child.stdout?.on('data', chunk => process.stdout.write(`[DeepSeek Harness] ${chunk}`))
    child.stderr?.on('data', chunk => process.stderr.write(`[DeepSeek Harness] ${chunk}`))
    child.once('error', reject)
    child.once('exit', code => (code === 0 ? resolve() : reject(new Error(`pnpm add qrcode 失败，退出码 ${code}`))))
  })
  console.log('[DeepSeek Harness] qrcode 已安装')
}

export function deepseekPackageManagerCommand(platform: NodeJS.Platform = process.platform): { command: string; args: string[]; shell: boolean } {
  return {
    command: platform === 'win32' ? 'pnpm.cmd' : 'corepack',
    args: platform === 'win32' ? ['add', 'qrcode', '-w'] : ['pnpm', 'add', 'qrcode', '-w'],
    shell: platform === 'win32',
  }
}

export async function ensureDeepseekWechatBridge(): Promise<boolean> {
  const target = bridgePath()
  try {
    if (!existsSync(target)) {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), 10_000)
      const response = await fetch(BRIDGE_SOURCE_URL, { signal: controller.signal }).finally(() => clearTimeout(timer))
      if (!response.ok) throw new Error(`下载 weixin-clawbot 失败: HTTP ${response.status}`)
      await mkdir(dirname(target), { recursive: true })
      await writeFile(target, await response.text(), 'utf8')
    }

    const patchPath = profilePatchPath()
    const existing = existsSync(patchPath) ? await readFile(patchPath, 'utf8') : ''
    if (!existing.includes(BRIDGE_PATCH_MARKER) || existing.trimEnd().endsWith('[]')) {
      const next = existing.trimEnd().endsWith('[]')
        ? existing.trimEnd().replace(/\[\]\s*$/, bridgePatch())
        : existing.trim()
          ? `${existing.trimEnd()}\n${bridgePatch()}`
          : bridgePatch()
      await mkdir(dirname(patchPath), { recursive: true })
      await writeFile(patchPath, next, 'utf8')
    }

    // weixin-clawbot.mjs 静态依赖 qrcode；缺失会让 dsh web 插件树加载失败并
    // 以退出码 1 结束。bridge 在的前提下自动补齐依赖，避免重装/重下载后再次出现。
    await ensureQrcodeInstalled()
    return true
  } catch (error) {
    console.warn(`[DeepSeek Harness] 微信桥接插件未启用: ${error instanceof Error ? error.message : String(error)}`)
    return false
  }
}
