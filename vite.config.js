import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [vue()],
  // 构建期注入唯一版本号：SW 注册 URL 携带 ?_v=<buildId>，缓存名随之变化，
  // 新发布自动失效旧缓存（见 public/sw.js）。
  // 相比构建时写 public/sw-version.json 文件，此方案无文件写入，
  // 规避本机 safe-delete 拦截写操作导致的构建失败，也无需额外网络请求取版本号。
  define: {
    __BUILD_VERSION__: JSON.stringify(Date.now()),
  },
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
