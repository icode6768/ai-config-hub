/** Build Dongchuang AI platform API URLs from the configured model base URL. */
export function dongchuangPlatformUrl(baseUrl: string, path: string): string {
  let origin: URL
  try {
    origin = new URL(baseUrl.startsWith('http://') || baseUrl.startsWith('https://') ? baseUrl : `https://${baseUrl}`)
  } catch {
    throw new Error('config.yaml 中 global.api.baseUrl 不是有效地址')
  }
  return new URL(`/api/v1/${path.replace(/^\/+/, '')}`, origin.origin).toString()
}
