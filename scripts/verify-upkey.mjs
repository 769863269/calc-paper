// 专项回归：底部输入框 ↑ 的三级阶梯（上一个结果 → 上一个公式 → 历史行）。
// 与 verify.mjs 同一套 CDP 骨架，额外补了键盘事件派发（Input.dispatchKeyEvent）。
import { spawn } from 'node:child_process'
import fs from 'node:fs'

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const PORT = 9334
const URL = process.argv[2] || 'http://localhost:4173/'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const results = []
function check(name, ok, detail) {
  results.push({ name, ok, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'} | ${name}${detail ? ' | ' + detail : ''}`)
}

const tmpDir = 'C:/Users/admin/AppData/Local/Temp/calcpaper-up-' + Date.now()
fs.mkdirSync(tmpDir, { recursive: true })

const proc = spawn(EDGE, [
  '--headless=new',
  `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${tmpDir}`,
  '--no-first-run',
  '--disable-gpu',
  '--no-proxy-server',
  '--window-size=1400,900',
  'about:blank'
], { stdio: 'ignore' })

async function waitFor(fn, timeout = 15000, label = 'condition') {
  const t0 = Date.now()
  while (Date.now() - t0 < timeout) {
    try { const v = await fn(); if (v) return v } catch (_) {}
    await sleep(150)
  }
  throw new Error('timeout waiting for ' + label)
}

let ws
let idSeq = 0
const pending = new Map()
const logs = []

try {
  const version = await waitFor(async () => {
    const r = await fetch(`http://127.0.0.1:${PORT}/json/version`).catch(() => null)
    return r && r.ok ? await r.json() : null
  }, 20000, 'edge devtools')
  ws = new WebSocket(version.webSocketDebuggerUrl)
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej })
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data)
    if (msg.id && pending.has(msg.id)) {
      const p = pending.get(msg.id); pending.delete(msg.id)
      if (msg.error) p.reject(new Error(msg.error.message)); else p.resolve(msg.result)
    } else if (msg.method === 'Log.entryAdded') {
      logs.push(msg.params.entry.level + ': ' + msg.params.entry.text)
    } else if (msg.method === 'Runtime.exceptionThrown') {
      logs.push('exception: ' + (msg.params.exceptionDetails.text || '') + ' ' + (msg.params.exceptionDetails.exception?.description || ''))
    } else if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
      logs.push('console.error: ' + msg.params.args.map(a => a.value || a.description || '').join(' '))
    }
  }

  const target = await send('Target.createTarget', { url: 'about:blank' })
  const attach = await send('Target.attachToTarget', { targetId: target.targetId, flatten: true })
  const sessionId = attach.sessionId
  const sendS = (method, params = {}) => {
    const id = ++idSeq
    ws.send(JSON.stringify({ id, method, params, sessionId }))
    return new Promise((resolve, reject) => pending.set(id, { resolve, reject }))
  }
  function send(method, params = {}) {
    const id = ++idSeq
    ws.send(JSON.stringify({ id, method, params }))
    return new Promise((resolve, reject) => pending.set(id, { resolve, reject }))
  }
  const evalS = async (expr) => {
    const r = await sendS('Runtime.evaluate', { expression: `(function(){${expr}})()`, returnByValue: true, awaitPromise: true })
    if (r.exceptionDetails) throw new Error('eval error: ' + JSON.stringify(r.exceptionDetails).slice(0, 400))
    return r.result.value
  }
  const clickS = async (sel, idx = 0) => {
    const box = await evalS(`
      const els = document.querySelectorAll(${JSON.stringify(sel)});
      const el = els[${idx}];
      if (!el) return null;
      el.scrollIntoView({block:'center'});
      const r = el.getBoundingClientRect();
      return { x: r.left + r.width/2, y: r.top + r.height/2 };
    `)
    if (!box) throw new Error('selector not found: ' + sel + ' #' + idx)
    await sendS('Input.dispatchMouseEvent', { type: 'mouseMoved', x: box.x, y: box.y, button: 'none', clickCount: 0 })
    await sendS('Input.dispatchMouseEvent', { type: 'mousePressed', x: box.x, y: box.y, button: 'left', clickCount: 1 })
    await sleep(30)
    await sendS('Input.dispatchMouseEvent', { type: 'mouseReleased', x: box.x, y: box.y, button: 'left', clickCount: 1 })
    await sleep(150)
  }
  const KEYS = {
    ArrowUp: { code: 'ArrowUp', vk: 38 },
    ArrowDown: { code: 'ArrowDown', vk: 40 },
    Escape: { code: 'Escape', vk: 27 },
    Enter: { code: 'Enter', vk: 13 }
  }
  const press = async (key) => {
    const k = KEYS[key]
    await sendS('Input.dispatchKeyEvent', { type: 'rawKeyDown', windowsVirtualKeyCode: k.vk, nativeVirtualKeyCode: k.vk, key, code: k.code })
    await sendS('Input.dispatchKeyEvent', { type: 'keyUp', windowsVirtualKeyCode: k.vk, nativeVirtualKeyCode: k.vk, key, code: k.code })
    await sleep(180)
  }
  const insertText = async (t) => {
    await sendS('Input.insertText', { text: t })
    await sleep(120)
  }
  const boxValue = () => evalS(`const el=document.querySelector('.quick-input'); return el ? el.value : null`)
  const activeInfo = () => evalS(`
    const a = document.activeElement
    if (!a) return { cls: '', lIdx: -1 }
    const row = a.closest ? a.closest('.calc-row') : null
    return { cls: a.className || '', lIdx: row ? Number(row.dataset.lidx) : -1 }
  `)
  const focusBottom = async () => {
    await clickS('.quick-input')
    await sleep(80)
  }
  const resetBox = async () => {
    // 清空底部框并退出阶梯：Esc 是官方出口，这里也顺带验证它
    await focusBottom()
    await evalS(`const el=document.querySelector('.quick-input'); const s=Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype,'value').set; s.call(el,''); el.dispatchEvent(new Event('input',{bubbles:true})); return true`)
    await sleep(120)
  }

  await sendS('Runtime.enable')
  await sendS('Log.enable')
  await sendS('Page.enable')
  await sendS('Page.navigate', { url: URL })
  await waitFor(async () => evalS(`return !!document.querySelector('.app-card')`), 15000, 'app mount')

  // 载入示例：末行 min(1650, 1942) → 结果 1650（界面显示带千分位 1,650）
  await clickS('.guide-card .modal-btn.primary')
  await waitFor(async () => evalS(`return document.querySelectorAll('.calc-row').length === 5`), 10000, '5 rows')
  const shown = await evalS(`return (document.querySelectorAll('.calc-row')[4].querySelector('.result-value')||{}).textContent`)
  check('示例末行结果带千分位显示', (shown || '').trim() === '1,650', shown)

  // ---- 第 1 级：上一个结果（原始值，不带千分位） ----
  await focusBottom()
  await press('ArrowUp')
  let v = await boxValue()
  check('↑ 第 1 级填上一个结果', v === '1650', JSON.stringify(v))
  const caret = await evalS(`const el=document.querySelector('.quick-input'); return el.selectionStart === el.value.length && el.value.length>0`)
  check('召回后光标在末尾', caret === true)
  const stillBottom = await activeInfo()
  check('第 1 级焦点仍在底部框', (stillBottom.cls || '').includes('quick-input'), stillBottom.cls)

  // ---- 第 2 级：上一个公式 ----
  await press('ArrowUp')
  v = await boxValue()
  check('↑ 第 2 级填上一个公式', v === 'min(1650, 1942)', JSON.stringify(v))
  check('第 2 级焦点仍在底部框', ((await activeInfo()).cls || '').includes('quick-input'))

  // ---- 第 3 级：跳进历史行编辑 ----
  await press('ArrowUp')
  v = await boxValue()
  const act = await activeInfo()
  check('↑ 第 3 级清空输入框', v === '', JSON.stringify(v))
  check('↑ 第 3 级焦点进入末行公式框', (act.cls || '').includes('expr-input') && act.lIdx === 4, JSON.stringify(act))
  const focusedRow = await evalS(`const r=document.querySelectorAll('.calc-row')[4]; return r.className.includes('focused')`)
  check('跳入的行同时高亮', focusedRow === true)

  // ---- 跳行后回到底部框，阶梯应从第 1 级重新开始 ----
  await focusBottom()
  await press('ArrowUp')
  v = await boxValue()
  check('跳行后 ↑ 重新从结果开始', v === '1650', JSON.stringify(v))

  // ---- Esc 退出阶梯 ----
  await press('Escape')
  v = await boxValue()
  check('Esc 清空并退出阶梯', v === '', JSON.stringify(v))
  await press('ArrowUp')
  v = await boxValue()
  check('Esc 后 ↑ 回到第 1 级', v === '1650', JSON.stringify(v))

  // ---- 用户手打的内容不被结果覆盖，直接按内容命中历史行 ----
  await resetBox()
  await insertText('55+888+999')
  await press('ArrowUp')
  const typedAct = await activeInfo()
  check('手打内容按内容命中历史行（第 0 行）', (typedAct.cls || '').includes('expr-input') && typedAct.lIdx === 0, JSON.stringify(typedAct))

  // ---- 末行是错误行：跳过结果级，直接给公式 ----
  await resetBox()
  await insertText('1/0')
  await press('Enter')
  await waitFor(async () => evalS(`return document.querySelectorAll('.calc-row').length === 6`), 8000, 'row added')
  await focusBottom()
  await press('ArrowUp')
  v = await boxValue()
  check('末行 1/0 得 Infinity 时 ↑ 给公式而非 Infinity', v === '1/0', JSON.stringify(v))

  // ---- 末行是真正的错误行（未定义符号）：同样跳过结果级 ----
  await resetBox()
  await insertText('undef_x+1')
  await press('Enter')
  await waitFor(async () => evalS(`return document.querySelectorAll('.calc-row').length === 7`), 8000, 'row added')
  await focusBottom()
  await press('ArrowUp')
  v = await boxValue()
  check('末行报错时 ↑ 给公式而非「错误」', v === 'undef_x+1', JSON.stringify(v))

  // ---- 末行表达式不完整：半截结果不当作「上一个结果」 ----
  await resetBox()
  await insertText('12+')
  await press('Enter')
  await waitFor(async () => evalS(`return document.querySelectorAll('.calc-row').length === 8`), 8000, 'row added')
  await focusBottom()
  await press('ArrowUp')
  v = await boxValue()
  check('表达式不完整时 ↑ 给公式而非半截值', v === '12+', JSON.stringify(v))

  // ---- 召回后用户改写 → 退出阶梯，不再被阶梯接管 ----
  await resetBox()
  await press('ArrowUp') // 填入 12（partial 被跳过，应为公式 12+ 见上，这里先看实际值）
  const firstRecall = await boxValue()
  await insertText('9')
  await press('ArrowUp')
  const afterEditAct = await activeInfo()
  check('召回后改写再按 ↑ 走选行而非继续阶梯', (afterEditAct.cls || '').includes('expr-input'), JSON.stringify(afterEditAct) + ' first=' + firstRecall)

  // ---- 回归：正常计算没被影响 ----
  await resetBox()
  await insertText('6*7')
  await press('Enter')
  await waitFor(async () => evalS(`return document.querySelectorAll('.calc-row').length === 9`), 8000, 'row added')
  const lastRes = await evalS(`return (document.querySelectorAll('.calc-row')[8].querySelector('.result-value')||{}).textContent`)
  check('回车新增行计算正常 6*7=42', (lastRes || '').trim() === '42', lastRes)

  // ---- 无脚本报错 / CSP 违规 ----
  const bad = logs.filter(l => /exception|console\.error|violat|refused/i.test(l))
  check('无 JS 报错与 CSP 违规', bad.length === 0, bad.slice(0, 3).join(' | '))
} catch (e) {
  check('脚本执行', false, String(e && e.message || e))
} finally {
  try { ws && ws.close() } catch (_) {}
  try { proc.kill() } catch (_) {}
  const fail = results.filter(r => !r.ok).length
  console.log(`\n${results.length - fail}/${results.length} 通过`)
  process.exit(fail ? 1 : 0)
}
