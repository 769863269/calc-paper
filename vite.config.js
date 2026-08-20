import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [vue()],
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
