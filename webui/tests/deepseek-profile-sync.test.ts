import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import YAML from 'yaml'
import { defaultLauncherConfig, syncDeepseekHarnessProfiles } from '../src/shared/config'

test('syncs DeepSeek provider settings into web and desktop profiles', async () => {
  const root = await mkdtemp(join(tmpdir(), 'usb-lobster-dsh-profile-'))
  const previousRoot = process.env.USB_LOBSTER_ROOT
  process.env.USB_LOBSTER_ROOT = root
  try {
    const webPath = join(root, '.dsh', 'profiles', 'web', 'cordis.patch.yml')
    const desktopPath = join(root, '.dsh', 'profiles', 'desktop', 'cordis.patch.yml')
    await mkdir(join(root, '.dsh', 'profiles', 'web'), { recursive: true })
    await mkdir(join(root, '.dsh', 'profiles', 'desktop'), { recursive: true })
    await writeFile(webPath, '- id: keep-me\n  config:\n    enabled: true\n', 'utf8')
    await writeFile(desktopPath, '- id: ui-settings-general\n  config:\n    welcomeNoticeVersion: test\n', 'utf8')

    const config = defaultLauncherConfig()
    config.global.api = {
      provider: 'dongchuangai',
      baseUrl: 'https://api.dongchuangai.com/v1',
      apiKey: 'secret-must-not-be-written',
      model: 'gpt-5.6-sol',
    }
    await syncDeepseekHarnessProfiles(config.global.api)
    config.global.api.model = 'gpt-5.6-sol-updated'
    await syncDeepseekHarnessProfiles(config.global.api)

    for (const path of [webPath, desktopPath]) {
      const entries = YAML.parse(await readFile(path, 'utf8')) as Array<Record<string, unknown>>
      assert.equal(entries.some(entry => entry.id === 'keep-me' || entry.id === 'ui-settings-general'), true)
      assert.equal(entries.filter(entry => entry.id === 'llm-pi-ai').length, 1)
      const provider = (((entries.find(entry => entry.id === 'llm-pi-ai')?.config as Record<string, unknown>).providers as Record<string, unknown>).dongchuangai as Record<string, unknown>)
      assert.deepEqual(provider.models, [{ id: 'gpt-5.6-sol-updated', name: 'gpt-5.6-sol-updated' }])
      assert.equal(provider.baseURL, 'https://api.dongchuangai.com/v1')
      assert.equal(provider.apiKeyEnv, 'DONGCHUANGAI_API_KEY')
      const selection = entries.find(entry => entry.id === 'agent-default-model')?.config
      assert.deepEqual(selection, { provider: 'dongchuangai', model: 'gpt-5.6-sol-updated' })
      assert.doesNotMatch(await readFile(path, 'utf8'), /secret-must-not-be-written/)
    }
  } finally {
    if (previousRoot === undefined) delete process.env.USB_LOBSTER_ROOT
    else process.env.USB_LOBSTER_ROOT = previousRoot
    await rm(root, { recursive: true, force: true })
  }
})
