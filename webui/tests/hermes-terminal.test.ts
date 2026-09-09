import test from 'node:test'
import assert from 'node:assert/strict'
import { defaultLauncherConfig } from '../src/shared/config'
import { terminalCommand } from '../server/app-processes'

test('Hermes terminal command uses the platform launcher without credentials or activation scripts', () => {
  const config = defaultLauncherConfig()
  config.global.api.apiKey = 'test-secret-with-$-and-quotes'
  const command = terminalCommand('hermes', config)
  assert.ok(command.includes('launch-hermes.mjs'))
  assert.ok(!command.includes(config.global.api.apiKey))
  assert.ok(!command.includes('activate'))
  config.global.api.apiKey = ''
  assert.equal(terminalCommand('hermes', config), command)
  assert.ok(terminalCommand('hermes', config, { desktop: true }).endsWith(' desktop'))
})
