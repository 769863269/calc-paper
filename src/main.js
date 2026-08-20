import { createApp } from 'vue'
import App from './App.vue'

createApp(App).mount('#app')

// PWA：生产构建下注册 Service Worker（可安装应用 + 离线可用）
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {})
  })
}
