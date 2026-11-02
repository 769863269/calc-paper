// 大稿纸压力测试：回归套件里全是 3~40 行的小数据，真实稿纸能到几百行、多张稿纸。
// 这份脚本只做「测量 + 断言底线」，不追求覆盖功能，目的是把体量拉上去之后
// 暴露四类问题：首屏阻塞、编辑延迟、保存抖动、滚动掉帧，以及增量重算在
// 长级联下是否仍然算得对（跳过求值的复用逻辑最容易在这里静默出错）。
//
// 用法：node scripts/verify-stress.mjs [url] [--rows=200] [--sheets=5]
import { spawn } from 'node:child_process'
import { resolveBrowser, browserArgs, tmpProfile } from './browser.mjs'

const PORT = Number(process.env.STRESS_CDP_PORT || 9341)
const URL = process.argv.find((a) => a.startsWith('http')) || 'http://127.0.0.1:4173/'
const argOf = (name, dflt) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`))
  return hit ? Number(hit.split('=')[1]) : dflt
}
const ROWS = argOf('rows', 200)
const SHEETS = argOf('sheets', 1)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const results = []
const metrics = {}
const check = (n, ok, d) => {
  results.push({ n, ok, d })
  console.log(`${ok ? 'PASS' : 'FAIL'} | ${n}${d ? ' | ' + d : ''}`)
}
const note = (k, v) => { metrics[k] = v; console.log(`  · ${k}: ${v}`) }

// ---------- 造数据：贴近真实用法，而不是 200 行一样的 1+1 ----------
//   0..CHAIN-1     变量链（k0=10, k1=k0+5, …）：改 k0 要级联重算整条链，用来验证复用逻辑没算错
//   其余           四则混合、百分比、round/abs、以及跨行引用
const CHAIN = 40
function makeLines(count, sheetIdx) {
  const lines = []
  for (let i = 0; i < count; i++) {
    let expr
    if (i < CHAIN) expr = i === 0 ? `k0 = 10` : `k${i} = k${i - 1} + 5`
    else if (i % 5 === 0) expr = `(1280.5 + ${i} * 3.25) * 0.13`
    else if (i % 5 === 1) expr = `round(${i}.7 / 3, 2)`
    else if (i % 5 === 2) expr = `abs(-${i} * 1.08) + 0.5`
    else if (i % 5 === 3) expr = `k${(i % CHAIN)} * 2 - ${i % 17}`
    else expr = `${i + 1} / 7 + ${i % 9} * 0.5`
    lines.push({
      id: `s${sheetIdx}-l${i}`,
      expr,
      result: '',
      note: i % 7 === 0 ? `第 ${i + 1} 行备注` : '',
      time: '',
      errorMsg: '',
      partial: false,
      wasAssign: false
    })
  }
  return lines
}
const seedState = {
  sheets: Array.from({ length: SHEETS }, (_, s) => ({
    id: `sheet-${s}`,
    name: `稿纸${s + 1}`,
    lines: makeLines(ROWS, s)
  })),
  activeSheetIndex: 0,
  theme: 'light',
  paperStyle: 'white',
  decimalPlaces: 3
}

// ---------- CDP 脚手架 ----------
const proc = spawn(resolveBrowser(), browserArgs([
  `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${tmpProfile('calcpaper-stress-')}`,
  '--enable-precise-memory-info'
]), { stdio: 'ignore' })

let ws, idSeq = 0
const pending = new Map()
const pageErrors = []

async function waitFor(fn, timeout = 30000, label = 'cond') {
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
      expression: `(function(){${expr}})()`,
      returnByValue: true,
      awaitPromise: true
    })
    if (r.exceptionDetails) {
      throw new Error('eval: ' + JSON.stringify(r.exceptionDetails).slice(0, 400))
    }
    return r.result.value
  }

  await send('Runtime.enable')
  await send('Log.enable')
  await send('Page.enable')
  ws.addEventListener('message', (ev) => {
    const m = JSON.parse(ev.data)
    if (m.method === 'Runtime.exceptionThrown') {
      pageErrors.push('exception: ' + (m.params.exceptionDetails?.exception?.description || '').slice(0, 200))
    }
    if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') {
      pageErrors.push('log: ' + m.params.entry.text.slice(0, 200))
    }
  })

  // ---------- 第 1 段：首屏 ----------
  console.log(`\n===== 首屏：${SHEETS} 张稿纸 × ${ROWS} 行 =====`)
  await send('Page.navigate', { url: URL })
  await waitFor(() => evalS(`return !!document.querySelector('.app-card')`), 25000, 'mount')
  await evalS(`localStorage.clear(); return true;`)

  // 不能「写 localStorage 再导航」：页面 beforeunload 里的 flushSave() 会把当前（空）稿纸
  // 写回去，把刚种的数据覆盖掉——第一版就是这么静默失败的。改成在文档初始化最早期注入：
  // 新文档的 document-start 脚本晚于旧页 beforeunload，写完即被应用读到。
  const inject = await send('Page.addScriptToEvaluateOnNewDocument', {
    source: `try{localStorage.setItem('calc_paper_state', ${JSON.stringify(JSON.stringify(seedState))})}catch(e){}`,
    runImmediately: false
  })

  const t0 = Date.now()
  await send('Page.navigate', { url: URL })
  // 等到最后一行出现、且最后一行有结果——只等行数回来会低估首屏（结果可能是后补的）
  const ready = await waitFor(async () => evalS(`
    const rows = document.querySelectorAll('.calc-row');
    if (rows.length !== ${ROWS}) return false;
    const last = rows[${ROWS - 1}];
    const res = (last.querySelector('.result-value')?.textContent || '').trim();
    return res ? { res, at: performance.now() } : false;
  `), 30000, 'rows ready')
  const bootMs = Date.now() - t0
  // 种完就撤掉注入，避免后续任何一次导航又把数据重置回初始态
  await send('Page.removeScriptToEvaluateOnNewDocument', { identifier: inject.identifier }).catch(() => {})
  note('首屏到可读结果(墙面计时,含CDP往返)', bootMs + 'ms')
  note('首屏末行结果', ready.res)

  const paint = await evalS(`
    const p = {};
    for (const e of performance.getEntriesByType('paint')) p[e.name] = Math.round(e.startTime);
    return p;
  `)
  note('FCP', (paint['first-contentful-paint'] || paint['first-paint'] || 'n/a') + 'ms')
  const dom = await evalS(`
    return {
      nodes: document.querySelectorAll('*').length,
      rows: document.querySelectorAll('.calc-row').length,
      textareas: document.querySelectorAll('textarea').length,
      dense: !!document.querySelector('.calc-list.dense'),
    };
  `)
  note('DOM 节点', dom.nodes)
  note('dense(content-visibility)', dom.dense ? 'on' : 'off')

  check('首屏渲染出全部行', dom.rows === ROWS, String(dom.rows))
  check('长稿纸启用 content-visibility', ROWS > 120 ? dom.dense : true, String(dom.dense))
  check('首屏到可读结果 < 4000ms', bootMs < 4000, bootMs + 'ms')

  // 超长稿纸提示：阈值 500，只在这个量级下才有机会验到真实 DOM（jsdom 只能验逻辑）
  const hint = await evalS(`
    const el = document.querySelector('.split-hint');
    return { exists: !!el, text: (el?.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 90) };
  `)
  if (ROWS > 500) {
    check('>500 行出现「拆纸」提示', hint.exists, hint.text)
    if (hint.exists) {
      // 点「不再提示」：提示消失并落盘（下次进页面不再打扰）
      const dismissed = await evalS(`
        const btn = document.querySelectorAll('.split-hint .modal-btn')[1];
        btn.click();
        return new Promise((res) => {
          const t0 = performance.now();
          const tick = () => {
            if (!document.querySelector('.split-hint')) {
              return res({ gone: true, saved: JSON.parse(localStorage.getItem('calc_paper_split_hint_off') || '[]') });
            }
            if (performance.now() - t0 > 3000) return res({ gone: false, saved: [] });
            requestAnimationFrame(tick);
          };
          tick();
        });
      `)
      check('「不再提示」能关掉并落盘', dismissed.gone && dismissed.saved.length === 1, JSON.stringify(dismissed))
    }
  } else {
    check('≤500 行不出现「拆纸」提示', !hint.exists, String(hint.exists))
  }

  // 长任务观测：输入/滚动/重算只要超过 50ms 就会被记下来，比帧率更能暴露「卡一下」
  await evalS(`
    window.__longTasks = [];
    try {
      new PerformanceObserver((list) => {
        for (const e of list.getEntries()) window.__longTasks.push({ d: Math.round(e.duration), s: Math.round(e.startTime) });
      }).observe({ entryTypes: ['longtask'] });
    } catch (e) {}
    return true;
  `)

  // 时间轴标记：长任务只报一个「815ms」没法定位，配合 performance.mark 才能看出
  // 是哪一步产生的（首屏 / 级联重算 / 保存 / 滚动 / 切稿纸）。
  const mark = (name) => evalS(`performance.mark(${JSON.stringify(name)}); return true;`)

  // ---------- 第 2 段：结果正确性（含 40 层变量级联） ----------
  const readRow = (idx) => evalS(`
    const r = document.querySelectorAll('.calc-row')[${idx}];
    return {
      expr: r.querySelector('.expr-input').value,
      res: (r.querySelector('.result-value')?.textContent || '').trim(),
      err: !!r.querySelector('.row-error, .error-text'),
    };
  `)
  const kLast = await readRow(CHAIN - 1)   // k39 = 10 + 39*5 = 205
  check(`变量链算对（k${CHAIN - 1} = ${10 + (CHAIN - 1) * 5}）`, kLast.res.replace(/,/g, '') === String(10 + (CHAIN - 1) * 5), kLast.res)
  const errCount = await evalS(`
    return [...document.querySelectorAll('.calc-row')].filter(r => r.querySelector('.result-value')?.classList.contains('error')).length;
  `)
  check('初始无错误行', errCount === 0, String(errCount))

  // 编辑首个赋值行，验证 40 层级联全部更新（增量复用最容易在这静默算错）
  const edit = (idx, text) => evalS(`
    const ta = document.querySelectorAll('.calc-row .expr-input')[${idx}];
    ta.focus();
    ta.value = ${JSON.stringify(text)};
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  `)
  // 在页内计时：从「派发 input」到「目标行结果变成期望值」，含 180ms 防抖
  const editLatency = (idx, text, expectIdx, expectVal) => evalS(`
    const ta = document.querySelectorAll('.calc-row .expr-input')[${idx}];
    ta.focus();
    const t0 = performance.now();
    ta.value = ${JSON.stringify(text)};
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    return new Promise((res) => {
      const tick = () => {
        const row = document.querySelectorAll('.calc-row')[${expectIdx}];
        const v = (row?.querySelector('.result-value')?.textContent || '').trim().replace(/,/g, '');
        if (v === ${JSON.stringify(expectVal)}) return res(Math.round(performance.now() - t0));
        if (performance.now() - t0 > 8000) return res(-1);
        requestAnimationFrame(tick);
      };
      tick();
    });
  `)

  await mark('edit-cascade')
  const statsBefore = await evalS(`return { ...window.__calcPaperStats };`)
  const cascadeMs = await editLatency(0, 'k0 = 100', CHAIN - 1, String(100 + (CHAIN - 1) * 5))
  const statsAfter = await evalS(`return { ...window.__calcPaperStats };`)
  const bodies = statsAfter.bodies - statsBefore.bodies
  const calls = statsAfter.calls - statsBefore.calls
  note('改 k0 的级联延迟(输入→末行结果)', cascadeMs + 'ms')
  note(`改 k0 求值次数(bodies=${bodies}, calls=${calls})`, `行数 ${ROWS}`)
  check('40 层级联结果正确', cascadeMs >= 0, 'k39=' + (100 + (CHAIN - 1) * 5))
  check('级联只重算受影响行（bodies ≤ 行数/2）', bodies <= Math.ceil(ROWS / 2), `${bodies}/${ROWS}`)
  check('编辑响应 < 1200ms', cascadeMs > 0 && cascadeMs < 1200, cascadeMs + 'ms')
  await evalS(`
    const ta = document.querySelectorAll('.calc-row .expr-input')[0];
    ta.value = 'k0 = 10';
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  `)
  await sleep(600)

  // ---------- 第 3 段：改一行「无关」算式，应该几乎不重算 ----------
  await mark('edit-single')
  const s3 = await evalS(`return { ...window.__calcPaperStats };`)
  const singleMs = await editLatency(ROWS - 1, `${ROWS} / 7 + 3`, ROWS - 1, (() => {
    const v = ROWS / 7 + 3
    return String(Number(v.toFixed(3)))
  })())
  const s4 = await evalS(`return { ...window.__calcPaperStats };`)
  note('改末行(纯算式)延迟', singleMs + 'ms')
  note('改末行 bodies', s4.bodies - s3.bodies)
  check('改纯算式行只重算它自己（bodies ≤ 2）', s4.bodies - s3.bodies <= 2, String(s4.bodies - s3.bodies))

  // ---------- 第 4 段：底部输入新增一行 ----------
  await mark('add-row')
  const addMs = await evalS(`
    const q = document.querySelector('.quick-input');
    const before = document.querySelectorAll('.calc-row').length;
    q.focus();
    const t0 = performance.now();
    q.value = '12345 * 6.5';
    q.dispatchEvent(new Event('input', { bubbles: true }));
    q.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    return new Promise((res) => {
      const tick = () => {
        const rows = document.querySelectorAll('.calc-row');
        if (rows.length === before + 1) {
          const v = (rows[rows.length - 1].querySelector('.result-value')?.textContent || '').trim();
          if (v) return res({ ms: Math.round(performance.now() - t0), val: v });
        }
        if (performance.now() - t0 > 8000) return res({ ms: -1, val: '' });
        requestAnimationFrame(tick);
      };
      tick();
    });
  `)
  note('新增一行(回车→结果)', addMs.ms + 'ms')
  check('第 201 行新增并算出结果', addMs.ms > 0 && addMs.val.replace(/,/g, '') === '80242.5', `${addMs.ms}ms / ${addMs.val}`)

  // ---------- 第 5 段：保存开销 ----------
  const store = await evalS(`
    const raw = localStorage.getItem('calc_paper_state') || '';
    const t0 = performance.now();
    for (let i = 0; i < 5; i++) localStorage.setItem('calc_paper_state', raw);
    const writeMs = (performance.now() - t0) / 5;
    return { bytes: raw.length, writeMs: Math.round(writeMs * 100) / 100 };
  `)
  note('本地数据体积', (store.bytes / 1024).toFixed(1) + 'KB')
  note('单次 setItem 耗时', store.writeMs + 'ms')

  // 真实保存链路：防抖 400ms + 空闲回调，测到 localStorage 内容真正变化
  await mark('save-wait')
  const saveMs = await evalS(`
    const key = 'calc_paper_state';
    const before = localStorage.getItem(key);
    const ta = document.querySelectorAll('.calc-row .expr-input')[${ROWS - 1}];
    const t0 = performance.now();
    ta.value = '999 * 2';
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    return new Promise((res) => {
      const tick = () => {
        if (localStorage.getItem(key) !== before) return res(Math.round(performance.now() - t0));
        if (performance.now() - t0 > 6000) return res(-1);
        setTimeout(tick, 30);
      };
      tick();
    });
  `)
  note('编辑→落盘(含 400ms 防抖)', saveMs + 'ms')
  check('改动在下一次落盘窗口内写盘（< 3000ms）', saveMs > 0 && saveMs < 3000, saveMs + 'ms')

  // 落盘内容体积随行数线性增长？给出每行平均字节，用于估算配额上限
  const perLine = await evalS(`
    const raw = localStorage.getItem('calc_paper_state') || '';
    return Math.round(raw.length / ${ROWS});
  `)
  note('每行平均字节', perLine + 'B（5MB 配额约可存 ' + Math.round(5 * 1024 * 1024 / perLine) + ' 行）')

  // ---------- 第 6 段：滚动流畅度 ----------
  // 滚动容器是 .paper-body（.calc-list 只是列表本身，高度被内容撑满，永远滚不动）。
  await mark('scroll')
  const scroll = await evalS(`
    const el = document.querySelector('.paper-body');
    if (!el) return { err: 'no .paper-body' };
    const max = Math.max(0, el.scrollHeight - el.clientHeight);
    if (max < 100) return { err: 'not scrollable: scrollH=' + el.scrollHeight + ' clientH=' + el.clientHeight };
    const frames = [];
    let last = performance.now();
    let y = 0;
    return new Promise((res) => {
      const step = () => {
        const now = performance.now();
        frames.push(now - last);
        last = now;
        y = Math.min(max, y + 120);      // 每帧滚 120px，接近一次快速滚轮
        el.scrollTop = y;
        if (y < max) requestAnimationFrame(step);
        else {
          const sorted = frames.slice().sort((a, b) => a - b);
          res({
            frames: frames.length,
            avg: Math.round(frames.reduce((a, b) => a + b, 0) / frames.length),
            p95: Math.round(sorted[Math.floor(sorted.length * 0.95)]),
            max: Math.round(sorted[sorted.length - 1]),
            jank: frames.filter(f => f > 32).length,
            scrollHeight: el.scrollHeight,
            clientHeight: el.clientHeight,
            reached: Math.round(el.scrollTop),
          });
        }
      };
      requestAnimationFrame(step);
    });
  `)
  if (scroll.err) {
    check('找到可滚动容器', false, scroll.err)
  } else {
    note('滚动帧数/平均帧间隔', `${scroll.frames} 帧 / ${scroll.avg}ms`)
    note('滚动 p95 / 最大帧', `${scroll.p95}ms / ${scroll.max}ms`)
    note('掉帧数(>32ms)', `${scroll.jank} / ${scroll.frames}`)
    note('滚动内容高度', `${scroll.scrollHeight}px（视口 ${scroll.clientHeight}px，滚到 ${scroll.reached}px）`)
    check('滚到底部', scroll.reached > 1000, scroll.reached + 'px')
    check('滚动掉帧率 < 20%', scroll.jank / scroll.frames < 0.2, `${scroll.jank}/${scroll.frames}`)
  }
  await evalS(`const el = document.querySelector('.paper-body'); if (el) el.scrollTop = 0; return true;`)

  // ---------- 第 7 段：多稿纸切换（触发跨稿纸全量重算） ----------
  if (SHEETS > 1) {
    await mark('switch-sheet')
    const switchMs = await evalS(`
      const tabs = document.querySelectorAll('.sheet-tab, .tab-item');
      if (tabs.length < 2) return { err: 'tabs=' + tabs.length };
      const t0 = performance.now();
      tabs[1].click();
      return new Promise((res) => {
        const tick = () => {
          const rows = document.querySelectorAll('.calc-row');
          if (rows.length && (rows[0].querySelector('.result-value')?.textContent || '').trim()) {
            return res(Math.round(performance.now() - t0));
          }
          if (performance.now() - t0 > 8000) return res(-1);
          requestAnimationFrame(tick);
        };
        tick();
      });
    `)
    if (typeof switchMs === 'number') {
      note('切换稿纸(全量重算)', switchMs + 'ms')
      check('切换稿纸 < 800ms', switchMs > 0 && switchMs < 800, switchMs + 'ms')
    } else {
      check('切换稿纸', false, JSON.stringify(switchMs))
    }
  }

  // ---------- 第 8 段：长任务与内存 ----------
  const lt = await evalS(`
    const tasks = (window.__longTasks || []).slice().sort((x, y) => x.s - y.s);
    const marks = performance.getEntriesByType('mark').slice().sort((a, b) => a.startTime - b.startTime);
    const owner = (t) => {
      let name = '首屏/初始化';
      for (const m of marks) { if (m.startTime <= t) name = m.name; else break; }
      return name;
    };
    const byStep = {};
    for (const t of tasks) {
      const k = owner(t.s);
      byStep[k] = byStep[k] || { count: 0, max: 0, total: 0 };
      byStep[k].count++; byStep[k].total += t.d; byStep[k].max = Math.max(byStep[k].max, t.d);
    }
    const top = tasks.slice().sort((a, b) => b.d - a.d).slice(0, 5).map(t => t.d + 'ms@' + owner(t.s));
    return { count: tasks.length, max: tasks.reduce((m, t) => Math.max(m, t.d), 0), top, byStep };
  `)
  note('长任务(>50ms)数量', lt.count)
  note('最长任务', lt.max + 'ms')
  if (lt.count) note('Top5 长任务', lt.top.join(' / '))
  for (const [k, v] of Object.entries(lt.byStep || {})) {
    note(`长任务·${k}`, `${v.count} 次 / 最长 ${v.max}ms / 合计 ${v.total}ms`)
  }
  check('单次长任务 < 400ms', lt.max < 400, lt.max + 'ms')

  const mem = await evalS(`
    const m = performance.memory;
    return m ? { heap: Math.round(m.usedJSHeapSize / 1048576 * 10) / 10, limit: Math.round(m.jsHeapSizeLimit / 1048576) } : null;
  `)
  if (mem) note('JS 堆占用', `${mem.heap}MB / ${mem.limit}MB`)
  check('无未捕获异常/错误日志', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | ') || '0')
} catch (e) {
  console.error('\n脚本异常：' + ((e && e.message) || e))
  results.push({ n: '脚本执行完成', ok: false, d: String((e && e.message) || e) })
} finally {
  try { ws && ws.close() } catch (_) {}
  proc.kill()
}

const passed = results.filter((r) => r.ok).length
console.log(`\n${passed}/${results.length} 项通过`)
if (metrics && Object.keys(metrics).length) {
  console.log('\n指标汇总：')
  for (const [k, v] of Object.entries(metrics)) console.log(`  ${k} = ${v}`)
}
process.exit(passed === results.length ? 0 : 1)
