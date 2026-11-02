// 导出验证：真实点击导出菜单，等文件落盘，再读 PNG 头 / 读 toast 文案
// 目的是证明「长算式折行」和「PDF 分页」在浏览器里真的生效，而不是只在代码里看起来对。
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const PORT = 9334
const URL = 'http://localhost:4173/'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const results = []
const check = (n, ok, d) => { results.push({ n, ok, d }); console.log(`${ok ? 'PASS' : 'FAIL'} | ${n}${d ? ' | ' + d : ''}`) }

const stamp = Date.now()
const profile = 'C:/Users/admin/AppData/Local/Temp/calcpaper-dl-' + stamp
const dlDir = path.join(profile, 'downloads')
fs.mkdirSync(dlDir, { recursive: true })

function pngSize(file) {
  const b = fs.readFileSync(file)
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) }
}

const proc = spawn(EDGE, [
  '--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`,
  '--no-first-run', '--disable-gpu', '--no-proxy-server', '--window-size=1400,900', 'about:blank'
], { stdio: 'ignore' })

let ws, idSeq = 0
const pending = new Map()

async function waitFor(fn, timeout = 20000, label = 'cond') {
  const t0 = Date.now()
  while (Date.now() - t0 < timeout) {
    try { const v = await fn(); if (v) return v } catch (_) {}
    await sleep(150)
  }
  throw new Error('timeout: ' + label)
}

try {
  const version = await waitFor(async () => {
    const r = await fetch(`http://127.0.0.1:${PORT}/json/version`).catch(() => null)
    return r && r.ok ? await r.json() : null
  }, 20000, 'devtools')
  ws = new WebSocket(version.webSocketDebuggerUrl)
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej })
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data)
    if (m.id && pending.has(m.id)) {
      const p = pending.get(m.id); pending.delete(m.id)
      if (m.error) p.reject(new Error(m.error.message)); else p.resolve(m.result)
    }
  }
  const raw = (method, params = {}, sessionId) => {
    const id = ++idSeq
    ws.send(JSON.stringify({ id, method, params, sessionId }))
    return new Promise((res, rej) => pending.set(id, { resolve: res, reject: rej }))
  }

  const target = await raw('Target.createTarget', { url: 'about:blank' })
  const { sessionId } = await raw('Target.attachToTarget', { targetId: target.targetId, flatten: true })
  const send = (m, p) => raw(m, p, sessionId)
  const evalS = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: `(function(){${expr}})()`, returnByValue: true, awaitPromise: true })
    if (r.exceptionDetails) throw new Error('eval: ' + JSON.stringify(r.exceptionDetails).slice(0, 300))
    return r.result.value
  }
  const clickS = async (sel, idx = 0) => {
    const box = await evalS(`
      const el = document.querySelectorAll(${JSON.stringify(sel)})[${idx}];
      if (!el) return null;
      el.scrollIntoView({ block: 'center' });
      const r = el.getBoundingClientRect();
      return { x: r.left + r.width/2, y: r.top + r.height/2 };
    `)
    if (!box) throw new Error('not found: ' + sel + ' #' + idx)
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: box.x, y: box.y, button: 'none', clickCount: 0 })
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: box.x, y: box.y, button: 'left', clickCount: 1 })
    await sleep(30)
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: box.x, y: box.y, button: 'left', clickCount: 1 })
    await sleep(180)
  }

  await send('Runtime.enable')
  await send('Page.enable')
  await send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: dlDir, eventsEnabled: true })

  await send('Page.navigate', { url: URL })
  await waitFor(() => evalS(`return !!document.querySelector('.app-card')`), 20000, 'mount')
  // 清掉旧数据，保证从空稿纸开始
  await evalS(`localStorage.clear(); return true;`)
  await send('Page.navigate', { url: URL })
  await waitFor(() => evalS(`return !!document.querySelector('.app-card')`), 20000, 'remount')
  await sleep(500)

  // 单行短算式 → 导出 PNG，拿到基准高度
  await evalS(`
    const q = document.querySelector('.quick-input');
    q.focus(); q.value = '1+1'; q.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  `)
  await sleep(120)
  await clickS('.quick-btn')
  await sleep(400)

  await clickS('.footer-tools .tool-btn', 8) // 导出按钮
  await sleep(250)
  const menuItems = await evalS(`return [...document.querySelectorAll('.export-menu .exp-item')].map(e => e.textContent.trim())`)
  check('导出菜单有三项', menuItems.length === 3, JSON.stringify(menuItems))

  const filesBefore = () => fs.readdirSync(dlDir).filter(f => !f.endsWith('.crdownload'))
  await clickS('.export-menu .exp-item', 1) // PNG
  const png1 = await waitFor(() => filesBefore().find(f => f.endsWith('.png')), 15000, 'png short').catch(() => null)
  check('导出 PNG 成功落盘', !!png1, png1 || '无文件')
  let shortH = 0
  if (png1) {
    const size = pngSize(path.join(dlDir, png1))
    shortH = size.h
    check('PNG 尺寸合理（720 宽 ×2 缩放）', size.w === 1440, JSON.stringify(size))
  }

  // 删掉上一张，避免同名覆盖导致「没生成新文件」的误判
  if (png1) { try { fs.unlinkSync(path.join(dlDir, png1)) } catch (_) {} }

  // 录入一条 80+ 字符的长算式 → 折行后 canvas 必须变高
  await evalS(`
    const q = document.querySelector('.quick-input');
    q.focus();
    q.value = '11111111+22222222+33333333+44444444+55555555+66666666+77777777+88888888+99999999+10101010+12121212+13131313';
    q.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  `)
  await sleep(120)
  await clickS('.quick-btn')
  await sleep(500)

  await clickS('.footer-tools .tool-btn', 8)
  await sleep(250)
  await clickS('.export-menu .exp-item', 1)
  // 同名文件会覆盖，所以按「高度变大」判定新产物，而不是按文件名
  const png2 = await waitFor(() => {
    const f = filesBefore().find(x => x.endsWith('.png'))
    if (!f) return null
    const sz = pngSize(path.join(dlDir, f))
    return sz.h > shortH + 40 ? f : null
  }, 15000, 'png long').catch(() => null)
  check('长算式导出 PNG 落盘', !!png2, png2 || '目录：' + filesBefore().join(','))
  if (png2 && shortH) {
    const size = pngSize(path.join(dlDir, png2))
    check('长算式折行使画布变高（不再是单行压扁）', size.h > shortH + 40, `短=${shortH}px 长=${size.h}px`)
  }

  // 灌 60 行 → PDF 应该分页
  await evalS(`
    const q = document.querySelector('.quick-input');
    const lines = [];
    for (let i = 1; i <= 60; i++) lines.push(i + '*' + i);
    q.focus(); q.value = lines.join('\\n');
    q.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  `)
  await sleep(150)
  await clickS('.quick-btn')
  await sleep(700)

  const rowCount = await evalS(`return document.querySelectorAll('.calc-row').length`)
  check('批量灌入 60 行', rowCount === 62, String(rowCount))

  await clickS('.footer-tools .tool-btn', 8)
  await sleep(250)
  await clickS('.export-menu .exp-item', 2) // PDF
  const pdf = await waitFor(() => filesBefore().find(f => f.endsWith('.pdf')), 25000, 'pdf').catch(() => null)
  check('导出 PDF 落盘', !!pdf, pdf || '无文件')
  if (pdf) {
    const st = fs.statSync(path.join(dlDir, pdf))
    check('PDF 文件非空', st.size > 2000, st.size + ' bytes')
    const head = fs.readFileSync(path.join(dlDir, pdf)).subarray(0, 8).toString('latin1')
    check('PDF 文件头有效', head.startsWith('%PDF-'), head)
    // 页数：数 /Type /Page（不含 /Pages）
    const txt = fs.readFileSync(path.join(dlDir, pdf)).toString('latin1')
    const pageCount = (txt.match(/\/Type\s*\/Page[^s]/g) || []).length
    check('60 行数据 PDF 分页（>1 页）', pageCount > 1, pageCount + ' 页')
    const toastMsg = await evalS(`return (document.querySelector('.toast-msg')||{}).textContent || ''`)
    check('导出 PDF 提示页数', /共\s*\d+\s*页|已导出 PDF/.test(toastMsg), toastMsg)
  }

  console.log('\n---- 汇总 ----')
  const failed = results.filter(r => !r.ok)
  console.log(`${results.length - failed.length}/${results.length} 通过`)
  if (failed.length) console.log(failed.map(f => ' - ' + f.n + ' => ' + (f.d || '')).join('\n'))
  process.exitCode = failed.length ? 1 : 0
} catch (e) {
  console.error('ERROR:', e && e.message)
  results.forEach(r => console.log(`${r.ok ? 'PASS' : 'FAIL'} | ${r.n} | ${r.d || ''}`))
  process.exitCode = 2
} finally {
  try { ws && ws.close() } catch (_) {}
  try { proc.kill() } catch (_) {}
}
