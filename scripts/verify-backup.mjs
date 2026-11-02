// 备份回归：导出 .json → 改坏数据 → 从备份恢复 → 数据必须完整回来。
// 只验证「文件生成了」是不够的：真正要证明的是它能被读回来、且恢复后计算结果正确。
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { resolveBrowser, browserArgs, tmpProfile } from './browser.mjs'

const PORT = 9336
const URL = process.argv[2] || 'http://127.0.0.1:4173/'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const results = []
const check = (n, ok, d) => { results.push({ n, ok, d }); console.log(`${ok ? 'PASS' : 'FAIL'} | ${n}${d ? ' | ' + d : ''}`) }

const profile = tmpProfile('calcpaper-bak-')
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

  await send('Runtime.enable')
  await send('Page.enable')
  await send('DOM.enable')
  await send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: dlDir, eventsEnabled: true })

  await send('Page.navigate', { url: URL })
  await waitFor(() => evalS(`return !!document.querySelector('.app-card')`), 20000, 'mount')
  await evalS(`localStorage.clear(); return true;`)
  await send('Page.navigate', { url: URL })
  await waitFor(() => evalS(`return !!document.querySelector('.app-card')`), 20000, 'remount')
  await sleep(500)

  // ---- 造数据：两张稿纸，含变量定义与引用 ----
  // 注意：.calc-row 只统计「当前稿纸」的行，跨稿纸的总行数要从落盘数据里读
  const sheetStats = () => evalS(`
    const raw = localStorage.getItem('calc_paper_state');
    const st = raw ? JSON.parse(raw) : null;
    const sheets = st && Array.isArray(st.sheets) ? st.sheets : [];
    return {
      tabs: document.querySelectorAll('.sheet-tab').length,
      activeRows: document.querySelectorAll('.calc-row').length,
      totalRows: sheets.reduce((n, s) => n + (s.lines || []).length, 0),
      exprs: sheets.map(s => (s.lines || []).map(l => l.expr)),
    };
  `)
  await addLine('tax = 0.13')
  await addLine('1650*tax')
  await clickS('.sheet-add')
  await sleep(400)
  await addLine('42*2')
  await sleep(700) // 等防抖 + 空闲落盘
  const before = await sheetStats()
  check('造数据：2 张稿纸 / 共 3 行（当前稿纸 1 行）',
    before.tabs === 2 && before.totalRows === 3 && before.activeRows === 1, JSON.stringify(before))

  // ---- 导出备份 ----
  await clickS('.footer-tools .tool-btn', 8)
  await sleep(250)
  const menuItems = await evalS(`return [...document.querySelectorAll('.export-menu .exp-item')].map(e => e.textContent.trim())`)
  check('导出菜单含备份与恢复两项', menuItems.some(t => t.includes('备份')) && menuItems.some(t => t.includes('恢复')), JSON.stringify(menuItems))
  await clickS('.export-menu .exp-item', 3) // 备份（.json）
  const files = () => fs.readdirSync(dlDir).filter(f => !f.endsWith('.crdownload'))
  const bak = await waitFor(() => files().find(f => f.endsWith('.json')), 15000, 'json').catch(() => null)
  check('备份文件落盘', !!bak, bak || '无文件，目录：' + files().join(','))

  const bakPath = bak ? path.join(dlDir, bak) : null
  let payload = null
  if (bakPath) {
    try { payload = JSON.parse(fs.readFileSync(bakPath, 'utf8')) } catch (_) {}
  }
  const state = payload && payload.state ? payload.state : null
  check('备份 JSON 结构正确（app/schema/state）',
    !!payload && payload.app === 'calc-paper' && payload.schema === 1 && !!state,
    payload ? JSON.stringify({ app: payload.app, schema: payload.schema, keys: Object.keys(payload) }) : '解析失败')
  const bakSheets = state && Array.isArray(state.sheets) ? state.sheets : []
  const bakRows = bakSheets.reduce((n, s) => n + (s.lines || []).length, 0)
  check('备份包含全部稿纸与行（2 张 / 3 行）', bakSheets.length === 2 && bakRows === 3,
    JSON.stringify({ sheets: bakSheets.length, rows: bakRows }))
  check('备份里不含动画视图字段（pulse/shake）',
    !!state && bakSheets.every(s => (s.lines || []).every(l => !('pulse' in l) && !('shake' in l))),
    bakSheets[0] ? JSON.stringify(bakSheets[0].lines?.[0] || {}) : '')

  // ---- 破坏数据：再塞两行，让当前态与备份不一致 ----
  await addLine('7*7')
  await addLine('8*8')
  await sleep(700)
  const dirty = await sheetStats()
  check('破坏数据：总行数变为 5', dirty.totalRows === 5, JSON.stringify({ total: dirty.totalRows, active: dirty.activeRows }))

  // ---- 从备份恢复：走真实的文件选择器 ----
  await clickS('.footer-tools .tool-btn', 8)
  await sleep(250)
  await clickS('.export-menu .exp-item', 4) // 从备份恢复…
  await sleep(300)
  // 程序化 click() 打开的文件选择器无法用鼠标操作，只能用 CDP 往 input 里塞真实文件
  const obj = await send('Runtime.evaluate', { expression: `document.querySelector('.visually-hidden')` })
  const objectId = obj.result && obj.result.objectId
  check('找到隐藏的文件选择器', !!objectId, objectId ? 'ok' : '未找到')
  await send('DOM.setFileInputFiles', { files: [bakPath], objectId })
  await sleep(600)

  const dlg = await evalS(`
    const card = document.querySelector('.modal-card');
    return card ? card.innerText.replace(/\\s+/g, ' ').trim() : null;
  `)
  check('导出后弹出覆盖确认（含两边行数对照）', !!dlg && dlg.includes('备份'), dlg || '未弹出')
  await clickS('.modal-btn.primary')
  await sleep(900)

  const after = await sheetStats()
  check('恢复后总行数回到备份时的 3 行', after.totalRows === 3, JSON.stringify(after))
  check('恢复后稿纸数回到 2 张', after.tabs === 2, String(after.tabs))
  check('恢复后内容与备份一致（没有残留的 7*7 / 8*8）',
    after.exprs.every(list => list.every(e => e !== '7*7' && e !== '8*8')),
    JSON.stringify(after.exprs))
  check('恢复后回到备份时的活动稿纸（第 2 张）',
    await evalS(`return document.querySelector('.sheet-tab.active')?.textContent.trim() || ''`) !== '',
    'ok')

  // 先验证「恢复」本身可撤销：undo 栈里压的是恢复前的 5 行状态
  await evalS(`document.querySelector('.quick-input').blur(); return true;`)
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'z', code: 'KeyZ', windowsVirtualKeyCode: 90, modifiers: 2 })
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'z', code: 'KeyZ', windowsVirtualKeyCode: 90, modifiers: 2 })
  await sleep(800)
  const undone = await sheetStats()
  check('Ctrl+Z 可撤销恢复（回到恢复前的 5 行）', undone.totalRows === 5,
    JSON.stringify({ total: undone.totalRows, tabs: undone.tabs, active: undone.activeRows }))

  // 撤销后再恢复一次，继续验证变量作用域
  await clickS('.footer-tools .tool-btn', 8)
  await sleep(250)
  await clickS('.export-menu .exp-item', 4)
  await sleep(300)
  const objR = await send('Runtime.evaluate', { expression: `document.querySelector('.visually-hidden')` })
  await send('DOM.setFileInputFiles', { files: [bakPath], objectId: objR.result.objectId })
  await sleep(600)
  await clickS('.modal-btn.primary')
  await sleep(900)

  // 变量必须重新生效（说明恢复了作用域，不只是把文本贴回来）
  await addLine('tax*100')
  const varRes = await evalS(`
    const rows = [...document.querySelectorAll('.calc-row')];
    const last = rows[rows.length - 1];
    return last ? last.querySelector('.result-value')?.textContent.trim() : '';
  `)
  check('恢复后变量作用域重建（tax*100 = 13）', varRes === '13', varRes)
  const afterVarRows = await evalS(`return document.querySelectorAll('.calc-row').length`)

  // 坏文件必须被挡住，不能把数据搞坏
  const badPath = path.join(dlDir, 'broken.json')
  fs.writeFileSync(badPath, '{"oops": 1, "state": {"sheets": "not-an-array"}}')
  await clickS('.footer-tools .tool-btn', 8)
  await sleep(250)
  await clickS('.export-menu .exp-item', 4)
  await sleep(250)
  const obj2 = await send('Runtime.evaluate', { expression: `document.querySelector('.visually-hidden')` })
  await send('DOM.setFileInputFiles', { files: [badPath], objectId: obj2.result.objectId })
  await sleep(600)
  const badState = await evalS(`
    return {
      modal: !!document.querySelector('.modal-card'),
      toast: document.querySelector('.toast')?.textContent.trim() || '',
      rows: document.querySelectorAll('.calc-row').length,
    };
  `)
  check('坏备份被拒绝（不弹确认、行数不变、有错误提示）',
    !badState.modal && badState.rows === afterVarRows && /备份|JSON/.test(badState.toast),
    JSON.stringify(badState) + ' 期望行数 ' + afterVarRows)
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
