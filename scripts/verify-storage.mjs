// 存储失败回归：注入 QuotaExceededError，验证「降级 + 未保存标记 + 备份兜底」真的生效。
// 这类失败在真机上很难复现（要真把 5MB 配额写满），但后果最严重——界面正常、数据全丢，
// 所以用故障注入把这个分支逼出来，比等用户报「我的稿纸不见了」强。
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { resolveBrowser, browserArgs, tmpProfile } from './browser.mjs'

const PORT = 9337
const URL = process.argv[2] || 'http://127.0.0.1:4173/'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const results = []
const check = (n, ok, d) => { results.push({ n, ok, d }); console.log(`${ok ? 'PASS' : 'FAIL'} | ${n}${d ? ' | ' + d : ''}`) }

const profile = tmpProfile('calcpaper-quota-')
const dlDir = path.join(profile, 'downloads')
fs.mkdirSync(dlDir, { recursive: true })

const proc = spawn(resolveBrowser(), browserArgs([
  `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`
]), { stdio: 'ignore' })

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
    await sleep(200)
  }
  const addLine = async (text) => {
    await evalS(`
      const q = document.querySelector('.quick-input');
      q.focus(); q.value = ${JSON.stringify(text)};
      q.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    `)
    await sleep(120)
    await clickS('.quick-btn')
    await sleep(320)
  }
  const files = () => fs.readdirSync(dlDir).filter(f => !f.endsWith('.crdownload'))

  await send('Runtime.enable')
  await send('Page.enable')
  await send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: dlDir, eventsEnabled: true })

  await send('Page.navigate', { url: URL })
  await waitFor(() => evalS(`return !!document.querySelector('.app-card')`), 20000, 'mount')
  await evalS(`localStorage.clear(); return true;`)
  await send('Page.navigate', { url: URL })
  await waitFor(() => evalS(`return !!document.querySelector('.app-card')`), 20000, 'remount')
  await sleep(500)

  await addLine('1+1')
  await sleep(900)
  const normal = await evalS(`
    return { badge: !!document.querySelector('.save-warn'), saved: !!localStorage.getItem('calc_paper_state') };
  `)
  check('正常情况：无未保存标记、数据已落盘', !normal.badge && normal.saved, JSON.stringify(normal))

  // ---- 注入配额写满故障 ----
  await evalS(`
    localStorage.setItem('calc_paper_error_log', JSON.stringify([{ t: 'x', message: 'dummy' }]));
    window.__origSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k, v) {
      if (k === 'calc_paper_state') {
        const err = new DOMException('The quota has been exceeded.', 'QuotaExceededError');
        throw err;
      }
      return window.__origSetItem.call(this, k, v);
    };
    return true;
  `)
  const errLogBefore = await evalS(`return localStorage.getItem('calc_paper_error_log') !== null`)
  check('故障注入：错误日志存在、写入被拦', errLogBefore === true, String(errLogBefore))

  await addLine('2+2')
  await sleep(1500) // 等防抖 + 空闲回调

  const failed = await evalS(`
    return {
      badge: document.querySelector('.save-warn')?.textContent.trim() || '',
      toast: document.querySelector('.toast')?.innerText.replace(/\\s+/g, ' ').trim() || '',
      action: document.querySelector('.toast-action')?.textContent.trim() || '',
      errLog: localStorage.getItem('calc_paper_error_log'),
      // 数据没写进去，旧值仍是上一次成功的那份
      stored: localStorage.getItem('calc_paper_state'),
    };
  `)
  check('失败后出现常驻「未保存」标记', failed.badge.includes('未保存'), JSON.stringify(failed.badge))
  check('失败提示带「导出备份」动作', failed.action.includes('导出备份'), failed.action || '无动作')
  check('降级一：错误日志被删掉腾空间', failed.errLog === null, failed.errLog ? '仍存在' : '已删除')

  // ---- 兜底动作：点提示里的「导出备份」，配额满了也必须能出文件 ----
  await clickS('.toast-action')
  const bak = await waitFor(() => files().find(f => f.endsWith('.json')), 15000, 'backup json').catch(() => null)
  let bakRows = -1
  if (bak) {
    try {
      const p = JSON.parse(fs.readFileSync(path.join(dlDir, bak), 'utf8'))
      bakRows = p.state.sheets.reduce((n, s) => n + s.lines.length, 0)
    } catch (_) {}
  }
  check('配额满时仍能导出备份（含 2 行数据）', !!bak && bakRows === 2, bak ? bak + ' / ' + bakRows + ' 行' : '未生成')

  // ---- 故障解除：下一次保存成功应摘掉标记 ----
  await evalS(`Storage.prototype.setItem = window.__origSetItem; return true;`)
  await addLine('3+3')
  await sleep(1500)
  const recovered = await evalS(`
    return {
      badge: !!document.querySelector('.save-warn'),
      toast: document.querySelector('.toast')?.innerText.replace(/\\s+/g, ' ').trim() || '',
      stored: localStorage.getItem('calc_paper_state'),
    };
  `)
  check('故障解除后标记自动摘除', recovered.badge === false, String(recovered.badge))
  check('恢复提示「已恢复自动保存」', recovered.toast.includes('已恢复'), recovered.toast || '无提示')
  let rowsInStore = -1
  try {
    const st = JSON.parse(recovered.stored || '{}')
    rowsInStore = (st.sheets || []).reduce((n, s) => n + (s.lines || []).length, 0)
  } catch (_) {}
  check('恢复后数据真正落盘（3 行）', rowsInStore === 3, String(rowsInStore))

  // ---- 刷新后数据还在（最终意义所在） ----
  await send('Page.navigate', { url: URL })
  await waitFor(() => evalS(`return !!document.querySelector('.app-card')`), 20000, 'reload')
  await sleep(600)
  const afterReload = await evalS(`return document.querySelectorAll('.calc-row').length`)
  check('刷新后 3 行数据完整还原', afterReload === 3, String(afterReload))
} catch (e) {
  console.error('VERIFY ERROR:', e && e.message)
  results.forEach(r => console.log(`${r.ok ? 'PASS' : 'FAIL'} | ${r.n} | ${r.d || ''}`))
  process.exitCode = 2
} finally {
  console.log('\n---- 汇总 ----')
  const failed = results.filter(r => !r.ok)
  console.log(`${results.length - failed.length}/${results.length} 通过`)
  if (failed.length) console.log('失败项：\n' + failed.map(f => ' - ' + f.n + ' => ' + (f.d || '')).join('\n'))
  if (!process.exitCode) process.exitCode = failed.length ? 1 : 0
  try { ws && ws.close() } catch (_) {}
  try { proc.kill() } catch (_) {}
}
