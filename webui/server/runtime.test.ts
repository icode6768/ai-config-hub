import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import JSON5 from 'json5'
import { parseVersionOutput, versionFromJson, versionFromToml } from '../src/shared/runtime'
import { defaultLauncherConfig, loadGlobalConfig, saveGlobalConfig, syncAppPayload } from '../src/shared/config'
import { migrateLegacyDshConfig } from '../src/shared/dsh'
import { migrateLegacyWechatConnections, resetWechatConnections, persistHermesConnection, restoreOpenclawWechatConnection } from './openclaw-wechat'
import { buildAppEntryUrl } from './openclaw-auth'
import { appSkillDirectories, parseSkillDocument } from './skill-store'
import { resolveRuntimePhase, terminalArgs, terminalEnvironment } from './app-processes'
import { resolveEditorDraft } from '../src/shared/editor-draft'
import { runtimePlatformDir, runtimeStartEnvPath } from '../src/shared/paths'

assert.equal(parseVersionOutput('node v24.18.0\r\n'), 'v24.18.0')
assert.equal(parseVersionOutput('Python 3.11.9\r\n'), '3.11.9')
assert.equal(versionFromJson('{"version":"2026.7.1-2"}'), '2026.7.1-2')
assert.equal(versionFromToml('version = "0.18.2"'), '0.18.2')
assert.equal(versionFromToml('[project]\nversion = "0.18.2"'), '0.18.2')
assert.equal(defaultLauncherConfig().global.launch.webUrls.hermes, '')
assert.equal(runtimePlatformDir('win32').endsWith('runtime\\windows'), true)
assert.equal(runtimePlatformDir('darwin').endsWith('runtime\\macos'), true)
assert.equal(runtimeStartEnvPath('win32').endsWith('runtime\\windows\\scripts\\start-env.cmd'), true)
assert.equal(runtimeStartEnvPath('darwin').endsWith('runtime\\macos\\scripts\\start-env.sh'), true)

const syncedOpenclaw = JSON.parse(syncAppPayload(
  'openclaw',
  defaultLauncherConfig(),
  JSON.stringify({ gateway: { auth: { password: 'remove-me' }, port: 19999 } }),
  { openclawGatewayToken: 'gateway-token-test', openclawGatewayPort: 18789, openclawWorkspace: 'X:\\portable-lobster\\.openclaw\\workspace' },
)) as { gateway: { mode: string; port: number; auth: { mode: string; token: string; password?: string } }; agents: { defaults: { workspace: string } } }
assert.equal(syncedOpenclaw.gateway.mode, 'local')
assert.equal(syncedOpenclaw.gateway.port, 18789)
assert.equal(syncedOpenclaw.gateway.auth.mode, 'token')
assert.equal(syncedOpenclaw.gateway.auth.token, 'gateway-token-test')
assert.equal(syncedOpenclaw.gateway.auth.password, undefined)
assert.equal(syncedOpenclaw.agents.defaults.workspace, 'X:\\portable-lobster\\.openclaw\\workspace')

const openclawEntry = await buildAppEntryUrl('openclaw', 'http://127.0.0.1:18789/#view=chat')
assert.match(openclawEntry, /#view=chat&token=.+/)
assert.equal(openclawEntry.includes('?token='), false)
assert.equal(await buildAppEntryUrl('hermes', 'http://127.0.0.1:8080/'), 'http://127.0.0.1:8080/')

const skill = parseSkillDocument('---\nname: demo-skill\ndescription: "A demo skill"\nlicense: MIT\n---\n# Demo\n')
assert.equal(skill.name, 'demo-skill')
assert.equal(skill.description, 'A demo skill')
assert.equal(skill.license, 'MIT')
assert.equal(appSkillDirectories().deepseekHarness.endsWith('.dsh\\deepseek-harness\\.agents\\skills'), true)
assert.equal(appSkillDirectories().claude.endsWith('.claude\\skills'), true)
assert.equal(appSkillDirectories().openclaw.endsWith('.openclaw\\skills'), true)
assert.equal(resolveRuntimePhase('starting', true), 'running')
const terminalConfig = defaultLauncherConfig()
terminalConfig.global.api.apiKey = 'test-dongchuangai-key'
const terminalEnv = terminalEnvironment('X:\\portable-lobster', terminalConfig)
assert.equal(terminalEnv.OPENCLAW_CONFIG_PATH, 'X:\\portable-lobster\\.openclaw\\state\\openclaw.json')
assert.equal(terminalEnv.OPENCLAW_STATE_DIR, 'X:\\portable-lobster\\.openclaw\\state')
assert.equal(terminalEnv.CLAUDE_CONFIG_DIR, 'X:\\portable-lobster\\.claude')
assert.equal(terminalEnv.CODEX_HOME, 'X:\\portable-lobster\\.codex')
assert.equal(terminalEnv.DONGCHUANGAI_API_KEY, 'test-dongchuangai-key')
assert.deepEqual(terminalArgs('openclaw', ['gateway', 'run']), [])
assert.deepEqual(terminalArgs('codex', ['exec']), ['exec'])
assert.equal(resolveEditorDraft('{"model":"draft"}', '{"model":"disk"}', false), '{"model":"draft"}')
assert.equal(resolveEditorDraft('{"model":"draft"}', '{"model":"disk"}', true), '{"model":"disk"}')

const testDir = await mkdtemp(join(tmpdir(), 'usb-lobster-dsh-'))
const legacyPath = join(testDir, 'legacy', 'settings.yaml')
const targetPath = join(testDir, 'portable', 'settings.yaml')
await mkdir(join(testDir, 'legacy'), { recursive: true })
await writeFile(legacyPath, 'models:\n  providers: {}\n', 'utf8')
assert.equal(await migrateLegacyDshConfig(targetPath, legacyPath), true)
assert.equal(await readFile(targetPath, 'utf8'), 'models:\n  providers: {}\n')
await writeFile(targetPath, 'portable: true\n', 'utf8')
assert.equal(await migrateLegacyDshConfig(targetPath, legacyPath), false)
assert.equal(await readFile(targetPath, 'utf8'), 'portable: true\n')
await rm(testDir, { recursive: true, force: true })

const hermesDir = await mkdtemp(join(tmpdir(), 'usb-lobster-hermes-'))
await persistHermesConnection({
  accountId: 'demo@im.bot',
  token: 'token-1',
  baseUrl: 'https://ilink.example.test',
  userId: 'wx-user-1',
}, hermesDir)
assert.match(await readFile(join(hermesDir, '.env'), 'utf8'), /WEIXIN_ACCOUNT_ID=demo@im\.bot/)
assert.match(await readFile(join(hermesDir, '.env'), 'utf8'), /WEIXIN_HOME_CHANNEL=wx-user-1/)
assert.equal(JSON.parse(await readFile(join(hermesDir, 'weixin', 'accounts', 'demo@im.bot.json'), 'utf8')).base_url, 'https://ilink.example.test')
await writeFile(join(hermesDir, '.env'), 'KEEP_ME=1\nWEIXIN_TOKEN=old\n', 'utf8')
await persistHermesConnection({ accountId: 'demo@im.bot', token: 'token-2', baseUrl: 'https://ilink.example.test' }, hermesDir)
const hermesEnv = await readFile(join(hermesDir, '.env'), 'utf8')
assert.match(hermesEnv, /KEEP_ME=1/)
assert.match(hermesEnv, /WEIXIN_TOKEN=token-2/)
await rm(hermesDir, { recursive: true, force: true })

const migrationRoot = await mkdtemp(join(tmpdir(), 'usb-lobster-wechat-migration-'))
const previousRoot = process.env.USB_LOBSTER_ROOT
process.env.USB_LOBSTER_ROOT = migrationRoot
try {
  const migrationConfig = defaultLauncherConfig()
  migrationConfig.apps.openclaw.wechat = { ...migrationConfig.apps.openclaw.wechat, enabled: true, accountId: 'openclaw-bot', token: 'openclaw-token' }
  migrationConfig.apps.hermes.wechat = { ...migrationConfig.apps.hermes.wechat, enabled: true, accountId: 'hermes-bot', token: 'hermes-token' }
  migrationConfig.apps.claude.wechat = { ...migrationConfig.apps.claude.wechat, enabled: true, accountId: 'claude-bot', token: 'claude-token' }
  await saveGlobalConfig(migrationConfig)
  assert.equal(await restoreOpenclawWechatConnection(), true)
  const restoredOpenclaw = JSON5.parse(await readFile(join(migrationRoot, '.openclaw', 'state', 'openclaw.json'), 'utf8')) as { channels: Record<string, { accounts: Record<string, { enabled: boolean }> }>; plugins: { allow: string[]; entries: Record<string, { enabled: boolean }> } }
  assert.equal(restoredOpenclaw.channels['openclaw-weixin'].accounts['openclaw-bot'].enabled, true)
  assert.equal(restoredOpenclaw.plugins.allow.includes('openclaw-weixin'), true)
  assert.equal(restoredOpenclaw.plugins.entries['openclaw-weixin'].enabled, true)
  assert.equal(restoredOpenclaw.plugins.allow.includes('usb-lobster-router'), true)
  assert.equal(restoredOpenclaw.plugins.entries['usb-lobster-router'].enabled, true)
  await mkdir(join(migrationRoot, '.hermes', 'weixin', 'accounts'), { recursive: true })
  await writeFile(join(migrationRoot, '.hermes', '.env'), 'KEEP_ME=1\nWEIXIN_TOKEN=old\n', 'utf8')
  await writeFile(join(migrationRoot, '.hermes', 'weixin', 'accounts', 'legacy.json'), '{"token":"old"}\n', 'utf8')
  const migration = await migrateLegacyWechatConnections()
  const migratedConfig = await loadGlobalConfig()
  assert.equal(migratedConfig.apps.openclaw.wechat.token, 'openclaw-token')
  assert.equal(migratedConfig.apps.hermes.wechat.enabled, false)
  assert.equal(migratedConfig.apps.hermes.wechat.token, '')
  assert.equal(migratedConfig.apps.claude.wechat.accountId, '')
  assert.equal(migration.removedHermesAccountFiles, 1)
  assert.match(await readFile(join(migration.backupPath, 'config.yaml'), 'utf8'), /hermes-token/)
  assert.match(await readFile(join(migrationRoot, '.hermes', '.env'), 'utf8'), /KEEP_ME=1/)
  assert.doesNotMatch(await readFile(join(migrationRoot, '.hermes', '.env'), 'utf8'), /WEIXIN_TOKEN/)
  await mkdir(join(migrationRoot, '.openclaw', 'state', 'openclaw-weixin', 'accounts'), { recursive: true })
  await writeFile(join(migrationRoot, '.openclaw', 'state', 'openclaw-weixin', 'accounts', 'bot.json'), '{"token":"openclaw-token"}\n', 'utf8')
  await writeFile(join(migrationRoot, '.openclaw', 'state', 'openclaw-weixin', 'accounts.json'), '["bot"]\n', 'utf8')
  await writeFile(join(migrationRoot, '.openclaw', 'state', 'openclaw.json'), JSON.stringify({ channels: { 'openclaw-weixin': { accounts: { bot: { enabled: true } } } } }), 'utf8')
  await resetWechatConnections()
  const resetConfig = await loadGlobalConfig()
  assert.equal(resetConfig.apps.openclaw.wechat.enabled, false)
  assert.equal(resetConfig.apps.openclaw.wechat.token, '')
  assert.equal(existsSync(join(migrationRoot, '.openclaw', 'state', 'openclaw-weixin')), false)
  assert.equal(JSON.parse(await readFile(join(migrationRoot, '.openclaw', 'state', 'openclaw.json'), 'utf8')).channels, undefined)
} finally {
  if (previousRoot === undefined) delete process.env.USB_LOBSTER_ROOT
  else process.env.USB_LOBSTER_ROOT = previousRoot
  await rm(migrationRoot, { recursive: true, force: true })
}

console.log('runtime version parsing tests passed')
