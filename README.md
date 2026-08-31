# 计算稿纸 (CalcPaper) · 网页版

基于 **Vue 3 + Vite + math.js** 的纯前端计算稿纸：多行实时演算、变量记忆、备注、本地持久化。无需 Rust、无需桌面打包，打开网页即用。

当前版本 **0.2.1**（与 `package.json` 一致，界面标题处亦显示该版本号）。

## 功能

- **多行算式 + 实时计算**：每行输入即出结果，语法错误显示红色「错误」，可点 ⓘ 查看原因与修复建议
- **回车新增行**：表达式输入框按回车自动追加一行并聚焦
- **变量支持**：`tax = 0.13` 定义后，下一行可直接用 `1000 * tax`（跨行共享作用域，类似计算器的内存）
- **变量面板**：侧栏集中查看所有已定义变量及其当前值，可一键复制
- **多稿纸标签页**：新建 / 切换 / 重命名（双击标签）/ 删除（标签上的 ×）；行可拖拽排序（左侧 ⋮⋮ 手柄）
- **自定义计算精度**：结果小数位 0–12 位可调，**默认 3 位**；点输入框自动全选、回车即确认并退出
- **撤销 / 重做**：误删 / 误改可撤销（`Ctrl+Z`）也可重做（`Ctrl+Y` 或 `Ctrl+Shift+Z`），双向各保留 50 步快照；工具栏按钮在栈为空时自动置灰
- **本地持久化**：所有算式、稿纸、主题、精度偏好自动存浏览器 `localStorage`，刷新或重开页面后恢复（含变量作用域重建）
- **复制**：单行复制（每行右侧 ⧉，可选结果 / 算式 / 整行）、复制全部（制表符分隔）。结果数字支持**直接拖拽选中后 Ctrl+C**：选中时当前行同步点亮高亮（与选中算式一致），但**不抢输入框焦点、不清空选区**，选区与行高亮互不干扰
- **导出**：Markdown（自动复制 + 下载 `.md`）、**PNG 图片**、**PDF 文档**
- **简易图表**：选中数据一键生成柱状图 / 折线图
- **稿纸样式**：白纸、横格稿纸、方格稿纸、黄色纸、护眼绿，共 5 种
- **暗色主题**：右上角一键切换，偏好持久化
- **实时汇率**：「汇」按钮拉取 USD→CNY 参考汇率（多源自动降级）
- **打字防抖提示**：表达式未写完（末尾是运算符 / 括号不匹配）时不报红，避免闪烁
- **PWA 离线可用**：Service Worker 网络优先 + 离线回退，可安装到桌面 / 主屏

## 环境要求

- Node.js **20.19+ 或 22.12+**（Vite 8 的硬性要求；仅用于本地开发 / 构建，部署后只需静态文件，无需 Node）

## 安装与运行

```bash
cd calc-paper
npm install
npm run dev          # 浏览器打开 http://localhost:1420
npm run test         # 运行单元测试（Vitest）
```

## 构建为静态站点

```bash
npm run build        # 产出 dist/（纯静态文件）
npm run preview      # 本地预览构建产物
```

`dist/` 可直接部署到任意静态托管：GitHub Pages、Vercel、Netlify、Nginx、对象存储……
`vite.config.js` 中 `base` 已设为相对路径 `./`，放到子目录也能正常加载。

**缓存更新机制**：构建时通过 `define` 注入唯一 `__BUILD_VERSION__`，Service Worker 注册 URL 携带 `?_v=<buildId>`，缓存名随之变化。新版本发布后旧缓存自动失效，用户无需手动清缓存。

## 变量用法示例

```
tax = 0.13           → 0.13
1000 * tax           → 130
price = 299
price * (1 - 0.2)    → 239.2
```

支持 math.js 全部语法：`1+2*3`、`(100-20)*0.15`、`pi`、`2^10`、`sqrt(16)`、`sum(1..10)` 等。

## 目录结构

```
calc-paper/
├─ index.html                  # 入口 HTML（含 CSP 配置）
├─ package.json
├─ vite.config.js              # Vite 配置（注入 __BUILD_VERSION__）
├─ CHANGELOG.md
├─ .github/workflows/ci.yml    # CI：安装 → 单测 → 构建 → 上传 dist
├─ public/
│  ├─ sw.js                    # Service Worker（离线缓存）
│  ├─ manifest.webmanifest     # PWA 清单
│  └─ icon-192.png / icon-512.png
└─ src/
   ├─ main.js                  # 应用入口、全局错误边界与上报、SW 注册
   ├─ core.js                  # 计算核心：mathjs 实例 + 纯函数（与 Vue 解耦）
   ├─ core.test.js             # core.js 单元测试
   └─ App.vue                  # 主组件：界面逻辑与样式
```

## 数据说明与隐私

- 所有数据（算式、稿纸、变量、主题、精度偏好）**仅保存在浏览器 `localStorage`（键名 `calc_paper_state`）**，纯本机存储，**不上传任何服务器**。
- 运行期错误日志存于本机 `localStorage`（键名 `calc_paper_error_log`，最多 50 条，超出自动丢弃最早的），同样**不外传**；排查时可在控制台查看 `window.__calcPaperErrors`。如需接入 Sentry 等外部上报服务，在 `src/main.js` 的 `reportError` 末尾追加调用即可。
- 清除该站点的浏览数据即可重置；无痕模式 / 换浏览器不共享数据。
- 「汇」按钮仅向公开汇率源（open.er-api.com / ECB frankfurter.app / exchangerate-api.com）发起只读请求，不携带任何个人数据。
- 导出 / 复制的稿纸内容请自行脱敏。

## 错误处理

- `app.config.errorHandler` 捕获组件内未处理异常，`unhandledrejection` 兜底异步异常，避免局部失败升级为白屏。
- 所有错误统一经 `reportError()`：控制台结构化输出 + 本机日志留存，**错误处理本身永不再抛错**。

## 与原 Tauri 版相比

- 移除了 Tauri 桌面封装，不再需要 Rust 工具链。
- 复制改用浏览器原生 Clipboard API（含 `execCommand` 退化方案，兼容非 HTTPS 环境）。
- 导出改用 `Blob` 直接下载文件（不再依赖桌面文件对话框）。
- 持久化统一走 `localStorage`。
- `npm run tauri dev / build` 等桌面命令已移除。

## 构建注意事项（本机环境）

- 若构建时本机安全策略拦截「清空 dist 目录」导致失败，本项目已通过 `vite.config.js` 的 `build.emptyOutDir: false` 规避（改为直接覆盖写入）。
- 如需完全干净的构建产物，手动删除 `dist/` 后再 `npm run build` 即可。
- Vite 开发缓存如遇写入权限问题，删除 `node_modules/.vite` 后重试（测试可加 `--no-cache`）。
