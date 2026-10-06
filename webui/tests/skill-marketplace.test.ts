import assert from 'node:assert/strict'
import { test } from 'node:test'
import { fetchMarketplace } from '../server/skill-store'
import type { LauncherConfig } from '../src/shared/types'

const config = { global: { api: { baseUrl: 'https://api.dongchuangai.com/api/v1' } } } as LauncherConfig

test('marketplace forwards pagination, category IDs and search without filtering secondary categories', async () => {
  const originalFetch = globalThis.fetch
  const urls: URL[] = []
  globalThis.fetch = async input => {
    const url = new URL(String(input))
    urls.push(url)
    return Response.json(url.pathname.endsWith('/categories')
      ? { status: 1, data: { categories: [{ id: 37, code: 'utility', name: 'Productivity' }] } }
      : { code: 200, data: { value: {
        marketplace: [{ id: 'secondary-category-example', category_id: 109, tags: ['rss'] }],
        page: 2, per_page: 2, total: 1172, total_pages: 586,
      } } })
  }
  try {
    const result = await fetchMarketplace(config, new URLSearchParams('page=2&per_page=2&category_id=37&search=feed'))
    assert.equal(urls[0].searchParams.get('category_id'), '37')
    assert.equal(urls[0].searchParams.get('page'), '2')
    assert.equal(urls[0].searchParams.get('per_page'), '2')
    assert.equal(urls[0].searchParams.get('search'), 'feed')
    assert.deepEqual(result.tags, [{ id: 'utility', categoryId: 37, label: 'Productivity' }])
    assert.equal(result.skills[0].id, 'secondary-category-example')
    assert.equal(result.total_pages, 586)

    urls.length = 0
    await fetchMarketplace(config, new URLSearchParams('page=-1&per_page=999&category_id=utility'))
    assert.equal(urls[0].searchParams.get('page'), '1')
    assert.equal(urls[0].searchParams.get('per_page'), '100')
    assert.equal(urls[0].searchParams.has('category_id'), false)
    assert.equal(urls[0].searchParams.has('search'), false)

    globalThis.fetch = async () => Response.json({ code: 500, data: {} })
    await assert.rejects(fetchMarketplace(config), /返回数据无效/)
  } finally {
    globalThis.fetch = originalFetch
  }
})
