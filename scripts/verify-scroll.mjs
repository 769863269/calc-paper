// 滚动位置记忆回归：打开时不该永远停在第一行——最后一次在算的那行在最底下。
// 四条主线：
//   1) 首次进入（无记录）且稿纸很长 → 直接停在底部，最后一行在整个可视区内；
//   2) 停在中间 → 刷新后回到同一位置（±12px）；
//   3) 切稿纸 → 各自回到自己记得的位置，互不影响；
//   4) 空稿纸 / 删行变短 → 不会死磕旧像素值（夹回合法区间，不出现「滚不到底」）。
import { spawn } from 'node:child_process'
import { resolveBrowser, browserArgs, tmpProfile } from './browser.mjs'

const PORT = Number(process.env.SCROLL_CDP_PORT || 9345)
const URL = process.argv[2] || 'http://127.0.0.1:4173/'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const results = []
const check = (n, ok, d) => { results.push({ n, ok, d }); console.log(`${ok ? 'PASS' : 'FAIL'} | ${n}${d ? ' | ' + d : ''}`) }

const ROWS = 60
const makeLines = (sheet) => Array.from({ length: ROWS }, (_, i) => ({
  id: `s${sheet}-l${i}`,
  expr: `${i + 1} * 3.5 + ${sheet}`,
  result: '', note: '', time: '', errorMsg: '', partial: false, wasAssign: false
}))
const seed = {
  sheets: [
    { id: 'sheet-a', name: '稿纸A', lines: makeLines(1) },
    { id: 'sheet-b', name: '稿纸B', lines: makeLines(2) }
  ],
  activeSheetIndex: 0,
  theme: 'light',
  paperStyle: 'white',
  decimalPlaces: 3
}

const proc = spawn(resolveBrowser(), browserArgs([
  `--remote-debugging-port=${PORT}`, `--user-data-dir=${tmpProfile('calcpaper-scroll-')}`
]), { stdio: 'ignore' })

let ws, idSeq = 0
const pending = new Map()
const pageErrors = []

async function waitFor(fn, timeout = 20000, label = 'cond') {
  const t0 = Date.now()
  while (Date.now() - t0 < timeout) {
    try { const v = await fn(); if (v) return v } catch (_) {}
    await sleep(60)
  }
  throw new Error('timeout: ' + label)
}

try {
  const version = await waitFor(async () => {
    const r = await fetch(`http://127.0.0.1:${PORT}/json/version`).catch(() => null)
    return r && r.ok ? await r.json() : null
  }, 25000, 'devtools')
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
    const r = await send('Runtime.evaluate', {
      expression: `(function(){${expr}})()`, returnByValue: true, awaitPromise: true
    })
    if (r.exceptionDetails) throw new Error('eval: ' + JSON.stringify(r.exceptionDetails).slice(0, 300))
    return r.result.value
  }

  await send('Runtime.enable')
  await send('Log.enable')
  await send('Page.enable')
  ws.addEventListener('message', (ev) => {
    const m = JSON.parse(ev.data)
    if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') pageErrors.push(m.params.entry.text.slice(0, 160))
  })

  // 造数据只能落在 document-start：旧页 beforeunload 里的 flushSave 会把空稿纸写回去。
  // 注意这里**不能**顺手 removeItem('calc_paper_scroll')——每次导航都会执行，会把
  // 上一步刚存下的滚动位置清掉，于是「刷新回原位」永远量到底部（第一版就栽在这）。
  const inject = await send('Page.addScriptToEvaluateOnNewDocument', {
    source: `try{localStorage.setItem('calc_paper_state', ${JSON.stringify(JSON.stringify(seed))})}catch(e){}`
  })

  const goto = async () => {
    await send('Page.navigate', { url: URL })
    await waitFor(async () => evalS(`
      const rows = document.querySelectorAll('.calc-row');
      return rows.length === ${ROWS} && (rows[0].querySelector('.result-value')?.textContent || '').trim().length > 0;
    `), 25000, 'rows ready')
    await sleep(700) // 让 450ms 的二次校正跑完
  }
  const metrics = () => evalS(`
    const c = document.querySelector('.paper-body');
    const rows = document.querySelectorAll('.calc-row');
    const last = rows[rows.length - 1];
    const cr = c.getBoundingClientRect();
    const lr = last ? last.getBoundingClientRect() : null;
    return {
      top: Math.round(c.scrollTop),
      max: Math.round(c.scrollHeight - c.clientHeight),
      lastFullyVisible: !!lr && lr.top >= cr.top - 1 && lr.bottom <= cr.bottom + 1,
      rows: rows.length,
    };
  `)
  const scrollTo = (ratio) => evalS(`
    const c = document.querySelector('.paper-body');
    const max = c.scrollHeight - c.clientHeight;
    c.scrollTop = Math.round(max * ${ratio});
    return Math.round(c.scrollTop);
  `)

  // ---------- 1) 首次进入：没有记录，长稿纸应直接到底 ----------
  await send('Page.navigate', { url: URL })
  await waitFor(() => evalS(`return !!document.querySelector('.app-card')`), 25000, 'mount')
  await evalS(`localStorage.clear(); return true;`)
  await goto()

  let m = await metrics()
  check('首次进入落在最后一行（不是第一行）', m.lastFullyVisible, `top=${m.top} max=${m.max}`)
  check('首次进入确实滚到底', m.top >= m.max - 4, `${m.top}/${m.max}`)

  // ---------- 2) 停在中间 → 刷新回原位 ----------
  const mid = await scrollTo(0.4)
  await sleep(1600) // 1200ms 滚动记忆落盘
  const savedRaw = await evalS(`return localStorage.getItem('calc_paper_scroll')`)
  const saved = JSON.parse(savedRaw || '{}')
  check('滚动位置写入了本地（按稿纸 id）', typeof saved['sheet-a'] === 'number' && Math.abs(saved['sheet-a'] - mid) <= 2, savedRaw)

  await send('Page.reload')
  await waitFor(async () => evalS(`return document.querySelectorAll('.calc-row').length === ${ROWS}`), 25000, 'reload')
  await sleep(900)
  m = await metrics()
  check('刷新后回到上次的位置（±12px）', Math.abs(m.top - mid) <= 12, `now=${m.top} then=${mid}`)
  check('回到中间时最后一行不在视口内（说明没被强制拉到底）', !m.lastFullyVisible, `top=${m.top} max=${m.max}`)

  // ---------- 3) 滚到底 → 刷新仍在底部 ----------
  await scrollTo(1)
  await sleep(1600)
  await send('Page.reload')
  await waitFor(async () => evalS(`return document.querySelectorAll('.calc-row').length === ${ROWS}`), 25000, 'reload2')
  await sleep(900)
  m = await metrics()
  check('滚到底后刷新仍在底部', m.top >= m.max - 4 && m.lastFullyVisible, `${m.top}/${m.max}`)

  // ---------- 4) 切稿纸：各回各的位置 ----------
  // 先把 A 停在 20% 处，再切到 B（B 无记录 → 落到底部）
  await scrollTo(0.2)
  await sleep(1600)
  const aTop = (await metrics()).top
  const switchTo = (idx) => evalS(`
    const tabs = document.querySelectorAll('.sheet-tab');
    tabs[${idx}].click();
    return true;
  `)
  await switchTo(1)
  await sleep(800)
  let mb = await metrics()
  check('切到新稿纸落在它的底部', mb.top >= mb.max - 4, `top=${mb.top} max=${mb.max}`)

  // B 滚到 50%，再切回 A —— A 应回到刚才的 20%
  await scrollTo(0.5)
  await sleep(1600)
  const bTop = (await metrics()).top
  await switchTo(0)
  await sleep(900)
  m = await metrics()
  check('切回 A 回到 A 记得的位置（±14px）', Math.abs(m.top - aTop) <= 14, `now=${m.top} was=${aTop}`)
  await switchTo(1)
  await sleep(900)
  m = await metrics()
  check('再切回 B 回到 B 记得的位置（±14px）', Math.abs(m.top - bTop) <= 14, `now=${m.top} was=${bTop}`)

  // ---------- 5) 稿纸变短（删了一堆行）后，旧像素值必须被夹回合法区间 ----------
  // 不能直接改 localStorage 里的 calc_paper_scroll 来造这个场景：页面在 beforeunload
  // 会用内存里的 scrollMap 整份覆盖回去，手改的值活不过一次重载（第一版就这么测出假失败）。
  // 真场景是「数据变短 + 位置记录还在」，所以这里下一份 10 行的状态，滚动记录原样保留。
  const shortSeed = {
    sheets: [{ id: 'sheet-a', name: '稿纸A', lines: makeLines(1).slice(0, 10) }],
    activeSheetIndex: 0
  }
  await scrollTo(1)
  await sleep(1600) // 让「在最底部」落盘
  await send('Page.addScriptToEvaluateOnNewDocument', {
    source: `try{localStorage.setItem('calc_paper_state', ${JSON.stringify(JSON.stringify(shortSeed))})}catch(e){}`
  })
  await send('Page.reload')
  await waitFor(async () => evalS(`return document.querySelectorAll('.calc-row').length === 10`), 25000, 'reload3')
  await sleep(900)
  m = await metrics()
  check('稿纸变短后越界记录被夹回底部（不出现空白页）', m.top >= m.max - 4 && m.top <= m.max + 1, `top=${m.top} max=${m.max}`)
  const clampNote = await evalS(`return { rows: document.querySelectorAll('.calc-row').length, max: Math.round(document.querySelector('.paper-body').scrollHeight - document.querySelector('.paper-body').clientHeight) }`)
  check('短稿纸本身不满一屏时停在顶部', clampNote.max < 900 ? m.top <= 1 : true, JSON.stringify(clampNote))

  check('无未捕获错误', pageErrors.length === 0, pageErrors.slice(0, 2).join(' | ') || '0')
  await send('Page.removeScriptToEvaluateOnNewDocument', { identifier: inject.identifier }).catch(() => {})
} catch (e) {
  console.error('\n脚本异常：' + ((e && e.message) || e))
  results.push({ n: '脚本执行完成', ok: false, d: String((e && e.message) || e) })
} finally {
  try { ws && ws.close() } catch (_) {}
  proc.kill()
}

const passed = results.filter((r) => r.ok).length
console.log(`\n${passed}/${results.length} 项通过`)
process.exit(passed === results.length ? 0 : 1)
