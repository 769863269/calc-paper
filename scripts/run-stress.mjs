// 压力测试入口：起预览服务 → 等端口就绪 → 跑 verify-stress.mjs → 收尾。
// 参数原样透传（--rows=400 --sheets=5），因为压力测试的体量本身就是要调的变量。
// 刻意不并进 npm run verify：体量类断言对 CI 机器的性能波动很敏感，
// 混进功能回归会让「功能挂了」和「机器慢」变成一个红灯，谁都判断不了。
import { spawn } from 'node:child_process'
import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'

const PORT = Number(process.env.STRESS_PREVIEW_PORT || 4183)
const URL = `http://127.0.0.1:${PORT}/`
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const VITE_BIN = path.join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js')
const passthrough = process.argv.slice(2).filter((a) => a.startsWith('--'))
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

if (!fs.existsSync(path.join(ROOT, 'dist', 'index.html'))) {
  console.error('找不到 dist/index.html，先跑 npm run build')
  process.exit(1)
}

const server = spawn(process.execPath, [VITE_BIN, 'preview', '--host', '127.0.0.1', '--port', String(PORT), '--strictPort'], {
  cwd: ROOT,
  stdio: ['ignore', 'pipe', 'pipe']
})
let log = ''
server.stdout.on('data', (d) => { log += d })
server.stderr.on('data', (d) => { log += d })
let exited = false
server.on('exit', () => { exited = true })

async function waitReady(timeout = 30000) {
  const t0 = Date.now()
  while (Date.now() - t0 < timeout) {
    if (exited) throw new Error('预览服务启动即退出：\n' + log)
    const r = await fetch(URL).catch(() => null)
    if (r && r.ok) return
    await sleep(200)
  }
  throw new Error(`${timeout}ms 内预览服务未就绪：\n` + log)
}

let code = 1
try {
  await waitReady()
  console.log(`预览服务就绪：${URL}`)
  code = await new Promise((resolve) => {
    const p = spawn(process.execPath, [path.join(ROOT, 'scripts', 'verify-stress.mjs'), URL, ...passthrough], {
      cwd: ROOT,
      stdio: 'inherit'
    })
    p.on('exit', (c) => resolve(c || 0))
  })
} catch (e) {
  console.error(String((e && e.message) || e))
} finally {
  server.kill()
}
process.exit(code)
