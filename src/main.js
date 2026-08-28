import { createApp } from 'vue'
import App from './App.vue'

const app = createApp(App)

// 全局错误边界：捕获组件内未处理的异常，避免局部失败升级为白屏，并统一上报（可扩展接入 Sentry 等）
app.config.errorHandler = (err, instance, info) => {
  console.error('[calc-paper] 未捕获错误：', err, info)
  // TODO: 生产可接入错误上报服务（如 Sentry / Umami），在此调用 report(err, info)
}

// 兜底：未捕获的 Promise 拒绝（如汇率 fetch 之外的异步异常）
if (typeof window !== 'undefined') {
  window.addEventListener('unhandledrejection', (e) => {
    console.error('[calc-paper] 未处理的 Promise 拒绝：', e.reason)
  })
}

app.mount('#app')

// PWA：生产构建下注册 Service Worker（可安装应用 + 离线可用）
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {})
  })
}
