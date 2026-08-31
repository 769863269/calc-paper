/* 计算稿纸 Service Worker：网络优先，离线回退缓存 */
// 缓存名随构建版本变化：注册 URL 携带 ?_v=<buildId>（见 src/main.js，由 vite define 注入）。
// 新版本发布后旧缓存不再匹配，activate 阶段自动清理，用户无需手动清缓存即可拿到新版。
// 相比读取 sw-version.json 文件，直接从自身 URL 取版本可省一次网络请求，且构建期无需写文件。
const params = new URLSearchParams(location.search)
const VER = params.get('_v') || 'v1'
const CACHE = 'calc-paper-' + VER
const CORE = ['./', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png']

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    await caches.open(CACHE).then((c) => c.addAll(CORE))
    await self.skipWaiting()
  })())
})

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return
  // 仅处理同源请求，避免劫持跨域资源
  const url = new URL(e.request.url)
  if (url.origin !== location.origin) return
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        const copy = res.clone()
        caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {})
        return res
      })
      .catch(() => caches.match(e.request))
  )
})
