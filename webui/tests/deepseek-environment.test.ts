import assert from 'node:assert/strict'
import test from 'node:test'
import { defaultLauncherConfig } from '../src/shared/config'
import { terminalEnvironment } from '../server/app-processes'

test('shared provider key is exported for DeepSeek Harness compatibility', () => {
  const config = defaultLauncherConfig()
  config.global.api.baseUrl = 'https://api.dongchuangai.com/v1'
  config.global.api.apiKey = 'custom-key'
  const environment = terminalEnvironment('/tmp/dsh', config)
  assert.equal(environment.DONGCHUANGAI_API_KEY, 'custom-key')
  assert.equal(environment.DEEPSEEK_API_KEY, 'custom-key')
  assert.equal(environment.HERMES_CUSTOM_API_DONGCHUANGAI_COM_API_KEY, 'custom-key')
})

test('official DeepSeek endpoint receives its configured key', () => {
  const config = defaultLauncherConfig()
  config.global.api.baseUrl = 'https://api.deepseek.com/v1'
  config.global.api.apiKey = 'official-key'
  assert.equal(terminalEnvironment('/tmp/dsh', config).DEEPSEEK_API_KEY, 'official-key')
})
