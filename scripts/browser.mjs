// 浏览器定位与环境适配：本机开发（Windows + Edge）与 CI（Ubuntu + Chrome）共用同一套参数，
// 三个验证脚本不再各自硬编码路径。要换浏览器时用环境变量 VERIFY_BROWSER（或 CHROME_PATH）指定即可。
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const CANDIDATES = {
  win32: [
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'
  ],
  darwin: [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'
  ],
  linux: [
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/microsoft-edge',
    '/opt/microsoft/msedge/msedge'
  ]
}

export function resolveBrowser() {
  const fromEnv = process.env.VERIFY_BROWSER || process.env.CHROME_PATH
  if (fromEnv) {
    if (!fs.existsSync(fromEnv)) throw new Error('VERIFY_BROWSER 指向的文件不存在：' + fromEnv)
    return fromEnv
  }
  for (const p of CANDIDATES[process.platform] || []) {
    if (fs.existsSync(p)) return p
  }
  throw new Error(
    '找不到 Chrome / Edge。可装一个，或用 VERIFY_BROWSER=/path/to/chrome 指定可执行文件路径。'
  )
}

// ---------- 临时 profile 回收 ----------
// 每个验证脚本都要新建一个浏览器 profile，单个二十几 MB。历史上每跑一轮 `npm run verify`
// 就留九个且从不删除，累计两百多个目录后把系统盘塞到 0 字节（ENOSPC，连 shell 都写不了临时文件）。
// 这里统一登记，进程退出时同步删除；浏览器还没完全退出导致个别文件删不掉就跳过，
// 下次用新的唯一目录，互不干扰。
const createdProfiles = []
let profilesCleaned = false

export function cleanupProfiles() {
  if (profilesCleaned) return
  profilesCleaned = true
  for (const dir of createdProfiles) {
    try { fs.rmSync(dir, { recursive: true, force: true, maxRetries: 2 }) } catch (_) {}
  }
  createdProfiles.length = 0
}

process.once('exit', cleanupProfiles)
process.once('SIGINT', () => { cleanupProfiles(); process.exit(130) })
process.once('SIGTERM', () => { cleanupProfiles(); process.exit(143) })

// 临时 profile 目录：放系统临时目录下，避免脚本里再写死某个用户的绝对路径。
// prefix 必须有默认值：undefined + 数字会算出 NaN，path.join 直接抛
// ERR_INVALID_ARG_TYPE（一个很容易踩、报错信息又完全看不出根因的坑）。
export function tmpProfile(prefix = 'calcpaper-cdp-') {
  // 用 mkdtempSync 原子创建唯一目录：原实现按 Date.now() 拼名字，
  // 同一毫秒里起两个浏览器会共用同一个 profile，表现为「第二个实例起不来」。
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix))
  createdProfiles.push(dir)
  return dir
}

export function browserArgs(extra = []) {
  const args = []
  // Linux / CI 容器：没有非特权 user namespace、/dev/shm 只有 64MB，缺这两个参数会启动即崩或必现崩溃
  if (process.platform === 'linux') args.push('--no-sandbox', '--disable-dev-shm-usage')
  args.push(
    '--headless=new',
    '--no-first-run',
    '--disable-gpu',
    '--no-proxy-server',
    '--window-size=1400,900',
    ...extra,
    'about:blank'
  )
  return args
}
