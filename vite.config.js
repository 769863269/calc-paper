import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import fs from 'node:fs'
import path from 'node:path'

// 构建时写入 SW 缓存版本文件：每次发布用时间戳生成唯一版本，
// 旧缓存据此自动失效（见 public/sw.js）。避免手动维护版本号漏改导致用户停留在旧版。
function swVersionPlugin() {
  return {
    name: 'sw-version',
    buildStart() {
      const version = new Date().toISOString().replace(/[:.]/g, '-')
      const file = path.resolve(__dirname, 'public/sw-version.json')
      fs.writeFileSync(file, JSON.stringify({ version }), 'utf-8')
    },
  }
}

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [vue(), swVersionPlugin()],
  // 相对路径，方便部署到任意静态托管（GitHub Pages / 子目录 / 本地 file 等）
  base: './',
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
  },
  build: {
    // 关闭自动清空输出目录：本机的 safe-delete 会把 Vite 清空 dist 的删除操作拦截，
    // 导致构建失败。改为直接覆盖写入即可；如需完全干净的产物，手动删除 dist/ 后再 build。
    emptyOutDir: false,
  },
})
