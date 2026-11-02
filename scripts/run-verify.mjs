// 一条命令跑完三套浏览器回归：起预览服务 → 等端口就绪 → 依次跑脚本 → 收尾。
// 本地用 `npm run verify`，CI 用同一条命令，避免 YAML 里再拼后台进程那套易碎写法。
import { spawn } from 'node:child_process'
import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'

const PORT = Number(process.env.VERIFY_PREVIEW_PORT || 4173)
const URL = `http://127.0.0.1:${PORT}/`
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const VITE_BIN = path.join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js')
const SCRIPTS = ['verify-upkey.mjs', 'verify.mjs', 'verify-export.mjs']
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

if (!fs.existsSync(path.join(ROOT, 'dist', 'index.html'))) {
  console.error('找不到 dist/index.html，先跑 npm run build')
  process.exit(1)
}

const server = spawn(process.execPath, [VITE_BIN, 'preview', '--host', '127.0.0.1', '--port', String(PORT), '--strictPort'], {
  cwd: ROOT,
  stdio: ['ignore', 'pipe', 'pipe']
})
let serverLog = ''
server.stdout.on('data', (d) => { serverLog += d })
server.stderr.on('data', (d) => { serverLog += d })

let serverExited = false
server.on('exit', () => { serverExited = true })

async function waitReady(timeout = 30000) {
  const t0 = Date.now()
  while (Date.now() - t0 < timeout) {
    if (serverExited) throw new Error('预览服务启动即退出：\n' + serverLog)
    try {
      const r = await fetch(URL).catch(() => null)
      if (r && r.ok) return
    } catch (_) {}
    await sleep(200)
  }
  throw new Error(`${timeout}ms 内预览服务未就绪：\n` + serverLog)
}

function runScript(file) {
  return new Promise((resolve) => {
    const p = spawn(process.execPath, [path.join(ROOT, 'scripts', file), URL], { cwd: ROOT, stdio: 'inherit' })
    p.on('exit', (code) => resolve(code || 0))
  })
}

let failed = 0
try {
  await waitReady()
  console.log(`预览服务就绪：${URL}\n`)
  for (const file of SCRIPTS) {
    console.log(`\n===== ${file} =====`)
    const code = await runScript(file)
    if (code !== 0) failed++
  }
} catch (e) {
  console.error(String((e && e.message) || e))
  failed++
} finally {
  server.kill()
}

console.log(`\n${SCRIPTS.length - failed}/${SCRIPTS.length} 个脚本通过`)
process.exit(failed ? 1 : 0)
