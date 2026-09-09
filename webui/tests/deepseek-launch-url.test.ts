import test from 'node:test'
import assert from 'node:assert/strict'
import { parseDeepseekLaunchUrl } from '../server/deepseek-harness'

test('accepts the local Harness readiness URL and rejects unrelated output', () => {
  assert.equal(parseDeepseekLaunchUrl('dsh web: http://127.0.0.1:3080/?token=test'), 'http://127.0.0.1:3080/?token=test')
  assert.equal(parseDeepseekLaunchUrl('dsh web: http://example.com:3080/?token=test'), null)
  assert.equal(parseDeepseekLaunchUrl('dsh web: http://127.0.0.1:8787/?token=test'), null)
  assert.equal(parseDeepseekLaunchUrl('dsh web: http://127.0.0.1:3080/'), null)
  assert.equal(parseDeepseekLaunchUrl('dsh web: opening the default browser'), null)
})
