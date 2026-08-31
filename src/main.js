import { createApp } from 'vue'
import App from './App.vue'

const app = createApp(App)

/* ---------- 错误上报 ---------- */
// 统一错误上报入口。默认把错误留存到本机 localStorage（键 calc_paper_error_log，
// 最多保留 50 条），并同步到 window.__calcPaperErrors 便于定位问题。
// 需要接入 Sentry / Umami 等服务时，只需在本函数末尾追加一次上报调用，例如：
//   Sentry.captureException(err, { extra: { info, source } })
// 本项目数据仅存本机，不上报任何服务器；接入外部服务前请在 README 隐私说明中补充告知。
const ERROR_LOG_KEY = 'calc_paper_error_log'
const ERROR_LOG_MAX = 50

function readErrorLog() {
  try {
    const raw = localStorage.getItem(ERROR_LOG_KEY)
    const log = raw ? JSON.parse(raw) : []
    return Array.isArray(log) ? log : []
  } catch (_) {
    return [] // 隐私模式 / 数据损坏：返回空，不让日志读取本身报错
  }
}

function reportError(err, info, source) {
  // 控制台保留结构化输出，便于开发期定位
  console.error('[calc-paper] 未捕获错误：', err, info)
  const entry = {
    t: new Date().toISOString(),
    source, // 'vue' | 'unhandledrejection'
    info: info || null,
    message: err instanceof Error ? err.message : String(err),
    stack: err instanceof Error ? err.stack : null,
  }
  try {
    const log = readErrorLog()
    log.push(entry)
    // 超出上限时丢弃最早的，避免占满 localStorage
    const trimmed = log.slice(-ERROR_LOG_MAX)
    localStorage.setItem(ERROR_LOG_KEY, JSON.stringify(trimmed))
    if (typeof window !== 'undefined') window.__calcPaperErrors = trimmed
  } catch (_) {
    // 存储已满 / 被禁用：忽略，绝不让错误处理本身再抛错
  }
}

if (typeof window !== 'undefined') window.__calcPaperErrors = readErrorLog()

// 全局错误边界：捕获组件内未处理的异常，避免局部失败升级为白屏
app.config.errorHandler = (err, instance, info) => {
  reportError(err, info, 'vue')
}

// 兜底：未捕获的 Promise 拒绝（如汇率 fetch 之外的异步异常）
if (typeof window !== 'undefined') {
  window.addEventListener('unhandledrejection', (e) => {
    reportError(e.reason, null, 'unhandledrejection')
  })
}

app.mount('#app')

// PWA：生产构建下注册 Service Worker（可安装应用 + 离线可用）
// URL 携带 ?_v=<buildId>（vite define 注入），使缓存名随版本变化，旧缓存自动失效
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js?v=' + __BUILD_VERSION__).catch(() => {})
  })
}
