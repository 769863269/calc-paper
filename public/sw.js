/* 计算稿纸 Service Worker：网络优先，离线回退缓存 */
// 缓存名随构建版本变化（见 public/sw-version.json，由 vite 构建时生成）。
// 新版本发布后旧缓存不再匹配，activate 阶段自动清理，用户无需手动清缓存即可拿到新版。
let CACHE = 'calc-paper-v1'
const CORE = ['./', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png']

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    // 读取构建时写入的版本，带时间戳避免命中旧缓存
    try {
      const res = await fetch('./sw-version.json?t=' + Date.now())
      const j = await res.json()
      if (j && j.version) CACHE = 'calc-paper-' + j.version
    } catch (_) { /* 读取失败则退化为默认缓存名 */ }
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

