# 更新日志

本项目所有变更按发布节点记录。版本号遵循 `主.次.修` 约定。

## [0.2.1] - 选区复制修复

### 缺陷修复
- **结果区选区与当前行高亮争抢焦点**：在结果区拖拽选中文本准备复制时，行点击逻辑会聚焦算式输入框，导致刚选中的文本选区被清空、无法复制。现已解耦「行的视觉选中态」与「输入框实际焦点」——检测到结果区存在文本选区时，仅点亮当前行高亮（`focusedLine`，与选中算式一致）、不调用 `focus()` 抢焦点、保留选区，可直接 `Ctrl+C` 复制；普通点击结果区仍会聚焦算式输入框。

## [0.2.0] - 生产就绪加固

面向「生产上市标准」的系统性审查与修复，覆盖代码质量、安全、容错、可观测性、测试与部署。

### 代码质量与正确性
- 将计算核心（mathjs 实例 + 纯函数）抽到 `src/core.js`，与 Vue 组件解耦，便于单测与复用。
- 清理死代码：`FIELD_SIZING_SUPPORTED`、`rebuildSheetScope`、每稿纸冗余 `vars:{}`；修正 `loadState` 缩进错位。
- `uid()` 优先使用 `crypto.randomUUID`，非安全上下文自动降级。
- 修复 canvas 上下文未判空、定时器（rateTimer / scrollTimers / saveTimer / toastTimer / 各类提示计时器）卸载清理。

### 性能优化
- `onExprInput` 仅在赋值定义行（或上一行曾是赋值行）变更时才做变量作用域全量 diff 与重算，普通算式行跳过昂贵的 `JSON.stringify` 序列化。

### 安全与合规
- `index.html` 增加 CSP：`default-src 'self'`、`style-src 'self' 'unsafe-inline'`、`img-src 'self' data: blob:`、`connect-src 'self' https: ws: wss:`、`object-src 'none'`。
- 变量名白名单校验（字母/下划线开头，排除 `__proto__` / `constructor` / `prototype` 等原型链字段），提交变量时拦截非法名。
- `README.md` 与帮助弹层补充隐私说明：数据仅存本机 `localStorage`，不上传任何服务器。

### 稳定性与容错
- `main.js` 增加全局错误边界 `app.config.errorHandler` 捕获组件未处理异常；补充 `unhandledrejection` 兜底监听。
- 持久化容错：原静默 `catch(e){}` 改为 `console.warn` + 存储失败 toast 提示，避免 localStorage 满时静默丢数据。

### 部署与运维
- Service Worker 缓存名随构建版本（注册 URL 注入 `?_v=<buildId>`，由 vite `define` 注入）动态隔离，新发布自动失效旧缓存；导航网络优先、静态资源缓存优先。
- 新增 `CHANGELOG.md` 与 GitHub Actions CI（push/PR 自动跑单测 + 构建）。

### 测试覆盖
- 引入 Vitest，`npm run test` 覆盖 `src/core.js` 纯函数（格式化、错误解析、变量定义识别、图表输入解析、安全求值等），核心逻辑不再依赖手测。

## [0.1.0] - 初始版本

- 计算稿纸核心：多稿纸、变量作用域、千分位展示、BigNumber 高精度。
- 变量抽屉面板、图表、多主题稿纸、PWA（manifest + service worker + 图标）。
- 导出 PNG / PDF、本地持久化、撤销重做、H5 适配。
