// 增量重算回归：证明「只重算受影响的行」既算得对、也真的跳过了求值。
// 两条线都要验：
//   1) 正确性——变量级联、同名变量覆盖顺序、删除定义后下游变错误、撤销恢复；
//   2) 有效性——改一个赋值行时，computeLineBody 的执行次数必须远小于行数（否则等于没优化）。
import { spawn } from 'node:child_process'
import { resolveBrowser, browserArgs, tmpProfile } from './browser.mjs'

const PORT = 9338
const URL = process.argv[2] || 'http://127.0.0.1:4173/'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const results = []
const check = (n, ok, d) => { results.push({ n, ok, d }); console.log(`${ok ? 'PASS' : 'FAIL'} | ${n}${d ? ' | ' + d : ''}`) }

const proc = spawn(resolveBrowser(), browserArgs([
  `--remote-debugging-port=${PORT}`, `--user-data-dir=${tmpProfile('calcpaper-inc-')}`
]), { stdio: 'ignore' })

let ws, idSeq = 0
const pending = new Map()
const logs = []

async function waitFor(fn, timeout = 20000, label = 'cond') {
  const t0 = Date.now()
  while (Date.now() - t0 < timeout) {
    try { const v = await fn(); if (v) return v } catch (_) {}
    await sleep(120)
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

  await send('Runtime.enable')
  await send('Log.enable')
  await send('Page.enable')
  ws.addEventListener('message', (ev) => {
    const m = JSON.parse(ev.data)
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
      logs.push('console.error: ' + (m.params.args || []).map(a => a.value || a.description || '').join(' '))
    }
    if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') logs.push('log: ' + m.params.entry.text)
  })

  await send('Page.navigate', { url: URL })
  await waitFor(() => evalS(`return !!document.querySelector('.app-card')`), 20000, 'mount')
  await evalS(`localStorage.clear(); return true;`)
  await send('Page.navigate', { url: URL })
  await waitFor(() => evalS(`return !!document.querySelector('.app-card')`), 20000, 'remount')
  await sleep(500)

  // 一次灌入多行：底部输入框支持粘贴多行
  const seed = async (texts) => {
    await evalS(`
      const q = document.querySelector('.quick-input');
      q.focus();
      q.value = ${JSON.stringify(texts.join('\n'))};
      q.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    `)
    await sleep(150)
    const before = await evalS(`return document.querySelectorAll('.calc-row').length`)
    await evalS(`document.querySelector('.quick-btn').click(); return true;`)
    await waitFor(async () => (await evalS(`return document.querySelectorAll('.calc-row').length`)) > before, 8000, 'seed')
    await sleep(500)
  }

  // 40 行：1 个变量定义 + 1 行依赖它 + 1 个二层变量 + 1 行依赖二层 + 36 行与之无关
  const independent = Array.from({ length: 36 }, (_, i) => `${i + 1}+${i + 1}`)
  await seed(['a = 2', 'a*10', 'b = a+1', 'b*2', ...independent])
  const total = await evalS(`return document.querySelectorAll('.calc-row').length`)
  check('灌入 40 行', total === 40, String(total))

  const readRow = async (idx) => evalS(`
    const r = document.querySelectorAll('.calc-row')[${idx}];
    return {
      expr: r.querySelector('.expr-input').value,
      res: r.querySelector('.result-value')?.textContent.trim() || '',
    };
  `)
  check('初始级联正确（a*10=20 / b*2=6）',
    (await readRow(1)).res === '20' && (await readRow(3)).res === '6',
    JSON.stringify([await readRow(1), await readRow(3)]))

  // ---- 改赋值行：只应重算受影响的行 ----
  const editRow = async (idx, text) => {
    await evalS(`
      const ta = document.querySelectorAll('.calc-row .expr-input')[${idx}];
      ta.focus();
      ta.value = ${JSON.stringify(text)};
      ta.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    `)
    await sleep(600) // 180ms 防抖 + 余量
  }

  await evalS(`window.__calcPaperStats.calls = 0; window.__calcPaperStats.bodies = 0; window.__calcPaperStats.skipped = 0; return true;`)
  await editRow(0, 'a = 5')
  const stats = await evalS(`return { ...window.__calcPaperStats }`)
  check('a=5 后级联已更新（a*10=50 / b*2=12）',
    (await readRow(1)).res === '50' && (await readRow(3)).res === '12',
    JSON.stringify([await readRow(1), await readRow(3)]))
  check('改赋值行触发了全量遍历（calls ≈ 行数）', stats.calls >= 40, JSON.stringify(stats))
  check('但真正求值的行远少于行数（增量生效）', stats.bodies <= 8, JSON.stringify(stats))
  check('绝大多数行走了跳过路径', stats.skipped >= 32, JSON.stringify(stats))

  // ---- 无关行不该被动 ----
  const untouched = await readRow(20)
  check('无关行结果保持不变（17+17=34）', untouched.expr === '17+17' && untouched.res === '34', JSON.stringify(untouched))

  // ---- 同名变量覆盖：后面的定义必须压住前面的 ----
  await seed(['a = 100', 'a*10'])
  const tail = await evalS(`return document.querySelectorAll('.calc-row').length`)
  const shadow1 = await readRow(1)
  const shadow2 = await readRow(tail - 1)
  check('同名变量覆盖：前面的 a*10 仍用 a=5', shadow1.res === '50', JSON.stringify(shadow1))
  check('同名变量覆盖：后面的 a*10 用 a=100', shadow2.res === '1,000', JSON.stringify(shadow2))

  // 改第一个定义，末尾仍应保持 1000（顺序语义不能被缓存破坏）
  await editRow(0, 'a = 7')
  const afterShadow = await evalS(`
    const rows = [...document.querySelectorAll('.calc-row')];
    return {
      first: rows[1].querySelector('.result-value')?.textContent.trim(),
      last: rows[rows.length - 1].querySelector('.result-value')?.textContent.trim(),
      second: rows[2].querySelector('.result-value')?.textContent.trim(),
    };
  `)
  check('改第一个定义后：前段跟着变、后段仍被覆盖',
    afterShadow.first === '70' && afterShadow.last === '1,000',
    JSON.stringify(afterShadow))

  // ---- 自引用赋值不能死循环、且能算出新值 ----
  await seed(['n = 1', 'n = n + 1'])
  const selfRef = await evalS(`
    const rows = [...document.querySelectorAll('.calc-row')];
    const r = rows[rows.length - 1];
    return r.querySelector('.result-value')?.textContent.trim();
  `)
  check('自引用赋值 n = n + 1 正常求值（=2）', selfRef === '2', selfRef)

  // ---- 删除变量定义 → 下游变错误 ----
  const beforeDel = await evalS(`return document.querySelectorAll('.calc-row').length`)
  // 用行尾的 × 删除（比右键菜单少一层定位，意图同样清楚）。删除会先弹确认框。
  await evalS(`
    const r = document.querySelectorAll('.calc-row')[0];
    r.querySelector('.row-actions .row-icon:last-child').click();
    return true;
  `)
  await sleep(400)
  const delDlg = await evalS(`return document.querySelector('.modal-card')?.innerText.replace(/\\s+/g, ' ').trim() || ''`)
  check('删除前弹出确认', /删除|清空/.test(delDlg), delDlg || '未弹出')
  await evalS(`document.querySelector('.modal-btn.primary').click(); return true;`)
  await sleep(700)
  const afterDel = await evalS(`
    const rows = [...document.querySelectorAll('.calc-row')];
    return { n: rows.length, firstRes: rows[0].querySelector('.result-value')?.textContent.trim() || '' };
  `)
  check('删除定义后行数 -1', afterDel.n === beforeDel - 1, JSON.stringify({ beforeDel, afterDel }))
  check('删除后原 a*10 变未定义错误', /未定义|错误/.test(afterDel.firstRes), afterDel.firstRes)

  // ---- 撤销：结果要跟着回来 ----
  await evalS(`document.querySelector('.quick-input').blur(); return true;`)
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'z', code: 'KeyZ', windowsVirtualKeyCode: 90, modifiers: 2 })
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'z', code: 'KeyZ', windowsVirtualKeyCode: 90, modifiers: 2 })
  await sleep(800)
  const afterUndo = await evalS(`
    const rows = [...document.querySelectorAll('.calc-row')];
    return { n: rows.length, first: rows[1]?.querySelector('.result-value')?.textContent.trim() || '' };
  `)
  check('撤销删除后行数恢复、a*10 重新变成 70', afterUndo.n === beforeDel && afterUndo.first === '70',
    JSON.stringify(afterUndo))

  const errors = logs.filter(l => !/favicon|Failed to load resource/i.test(l))
  check('无控制台错误', errors.length === 0, errors.slice(0, 3).join(' || '))
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
