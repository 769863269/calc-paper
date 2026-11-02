// 第九套回归：覆盖「读代码才发现、之前没有任何断言」的功能模块。
// 前面七套测的是计算、召回、导出、备份、存储、增量重算、a11y、滚动记忆；
// 这一套专门盯那些没人写测试、坏了也不会有人发现的地方——
// 悬停变量提示、变量面板改值、复制错误行、导出前结算、坏备份容错、
// 新建/重命名的撤销、图表负值、Esc 关闭菜单、本地数据损坏后的自救。
// 用法：npm run build && start preview && node scripts/verify-audit.mjs http://127.0.0.1:4173/
import { spawn } from 'node:child_process'
import { resolveBrowser, browserArgs, tmpProfile } from './browser.mjs'

const PORT = Number(process.env.AUDIT_CDP_PORT || 9361)
const URL = process.argv[2] || 'http://127.0.0.1:4173/'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const results = []
const check = (n, ok, d) => { results.push({ n, ok, d }); console.log(`${ok ? 'PASS' : 'FAIL'} | ${n}${d !== undefined ? ' | ' + d : ''}`) }
const note = (n, d) => { results.push({ n, ok: true, d, info: true }); console.log(`INFO | ${n} | ${d}`) }

const L = (id, expr, nt = '') => ({ id, expr, result: '', note: nt, time: '', errorMsg: '', partial: false, wasAssign: false })
// 两张稿纸各定义一次 tax：变量面板改值会「合并同名定义」，正好用来测撤销。
// 第三行是必然报错的算式，用来测「复制结果」与错误浮层。
const seed = {
  sheets: [
    { id: 'sheet-a', name: '稿纸A', lines: [L('a0', 'tax = 0.13', '税率'), L('a1', '1000*tax'), L('a2', 'foo + 1', '错误行')] },
    { id: 'sheet-b', name: '稿纸B', lines: [L('b0', 'tax = 0.5', '第二处定义'), L('b1', '2000*tax')] }
  ],
  activeSheetIndex: 0, theme: 'light', paperStyle: 'white', decimalPlaces: 3
}

const proc = spawn(resolveBrowser(), browserArgs([
  `--remote-debugging-port=${PORT}`, `--user-data-dir=${tmpProfile('calcpaper-audit-')}`
]), { stdio: 'ignore' })

let ws, idSeq = 0
const pending = new Map()
const exceptions = []

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
    if (m.method === 'Runtime.exceptionThrown') {
      const d = m.params.exceptionDetails
      exceptions.push((d.exception && d.exception.description) || d.text || 'unknown')
      return
    }
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
    if (r.exceptionDetails) throw new Error('eval: ' + ((r.exceptionDetails.exception && r.exceptionDetails.exception.description) || JSON.stringify(r.exceptionDetails)).slice(0, 300))
    return r.result.value
  }
  const evalA = async (expr) => {
    const r = await send('Runtime.evaluate', {
      expression: `(async function(){${expr}})()`, returnByValue: true, awaitPromise: true
    })
    if (r.exceptionDetails) throw new Error('evalA: ' + ((r.exceptionDetails.exception && r.exceptionDetails.exception.description) || JSON.stringify(r.exceptionDetails)).slice(0, 300))
    return r.result.value
  }
  const key = async (k, code, vk, modifiers = 0) => {
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key: k, code, windowsVirtualKeyCode: vk, modifiers })
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code, windowsVirtualKeyCode: vk, modifiers })
  }

  await send('Page.enable')
  await send('Runtime.enable')

  // 种数据只能落在 document-start：旧页 beforeunload 的 flushSave 会把当前稿纸写回去
  const seedScript = await send('Page.addScriptToEvaluateOnNewDocument', {
    source: `
      try {
        localStorage.setItem('calc_paper_state', ${JSON.stringify(JSON.stringify(seed))});
        localStorage.removeItem('calc_paper_scroll');
        localStorage.removeItem('calc_paper_guide_dismissed');
        localStorage.removeItem('calc_paper_error_log');
        Object.keys(localStorage).forEach(k => { if (k.indexOf('calc_paper_state_broken_') === 0) localStorage.removeItem(k) });
      } catch (e) {}
      window.__copied = null;
      try {
        Object.defineProperty(navigator, 'clipboard', {
          value: { writeText: (t) => { window.__copied = t; return Promise.resolve(); }, readText: () => Promise.resolve('') },
          configurable: true
        });
      } catch (e) {}
      window.__blobs = [];
      const _mk = URL.createObjectURL.bind(URL);
      URL.createObjectURL = function (b) { try { window.__blobs.push(b); } catch (e) {} return _mk(b); };
    `
  })

  const reload = async () => {
    await send('Page.navigate', { url: URL })
    await waitFor(() => evalS(`return document.querySelectorAll('.calc-row').length === 3`), 25000, 'reload')
    await sleep(450)
  }
  const closeVarPanel = async () => {
    await evalS(`
      document.activeElement && document.activeElement.blur();
      const m = document.querySelector('.var-mask');
      if (m) m.click();
      return true;
    `)
    await sleep(200)
  }
  await reload()

  // ============ 1) 悬停查看变量值：浮层要出现，且不能抛异常 ============
  const excBefore = exceptions.length
  await evalS(`
    const wrap = document.querySelectorAll('.calc-row')[1].querySelector('.expr-wrap');
    wrap.dispatchEvent(new MouseEvent('mouseenter', { clientX: 120, clientY: 240 }));
    return true;
  `)
  await sleep(450)
  const tip = await evalS(`
    const el = document.querySelector('.var-tip');
    if (!el) return { shown: false };
    const r = el.getBoundingClientRect();
    return {
      shown: true,
      text: el.textContent.replace(/\\s+/g, ' ').trim(),
      inViewport: r.left >= 0 && r.right <= window.innerWidth + 1 && r.top >= 0
    };
  `)
  const newExc = exceptions.slice(excBefore)
  check('hover 带变量的行会弹出变量值浮层', tip.shown, tip.shown ? tip.text : '未出现')
  check('hover 不产生未捕获异常', newExc.length === 0,
    newExc.length ? String(newExc[0]).split('\n')[0].slice(0, 110) : '0 条')
  check('变量浮层不超出视口左右边界', !tip.shown || tip.inViewport, tip.shown ? String(tip.inViewport) : 'n/a')

  // ============ 2) 变量面板改值：合并同名定义、可撤销、有反馈 ============
  await evalS(`[...document.querySelectorAll('.tool-group-feat .tool-btn')][2].click(); return true;`)
  await sleep(350)
  const panelOpen = await evalS(`return !!document.querySelector('.var-panel')`)
  check('变量面板可打开', panelOpen)

  await evalS(`
    const inp = document.querySelector('.var-input');
    inp.focus();
    inp.value = '0.25';
    inp.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  `)
  await sleep(1300) // 240ms 防抖 + 400ms 保存 + idle 余量
  const afterVar = await evalS(`
    const st = JSON.parse(localStorage.getItem('calc_paper_state') || 'null');
    return {
      taxDefs: st ? st.sheets.map(s => s.lines.filter(l => /^\\s*tax\\s*=/.test(l.expr)).length) : null,
      rows: st ? st.sheets.map(s => s.lines.length) : null,
      taxNow: st ? (st.sheets[0].lines.find(l => /^\\s*tax\\s*=/.test(l.expr)) || {}).expr : null,
      toast: document.querySelector('.toast') ? document.querySelector('.toast').textContent.replace(/\\s+/g, ' ').trim() : ''
    }
  `)
  note('改值后各稿纸 tax 定义行数', JSON.stringify(afterVar.taxDefs) + '（改前为 [1,1]）')
  check('变量面板改值后 tax 生效', afterVar.taxNow === 'tax = 0.25', String(afterVar.taxNow))
  check('合并同名定义后给出了可撤销的提示', /合并\s*1\s*处同名定义/.test(afterVar.toast), JSON.stringify(afterVar.toast))

  await closeVarPanel()
  await key('z', 'KeyZ', 90, 2)
  await sleep(800)
  const afterUndo = await evalS(`
    const st = JSON.parse(localStorage.getItem('calc_paper_state') || 'null');
    return {
      taxNow: st ? (st.sheets[0].lines.find(l => /^\\s*tax\\s*=/.test(l.expr)) || {}).expr : null,
      rows: st ? st.sheets.map(s => s.lines.length) : null
    }
  `)
  check('变量面板改值可以 Ctrl+Z 撤销', afterUndo.taxNow === 'tax = 0.13',
    '撤销后 ' + String(afterUndo.taxNow) + '（期望 tax = 0.13）')
  check('撤销同时恢复被删掉的同名定义行', JSON.stringify(afterUndo.rows) === '[3,2]',
    JSON.stringify(afterUndo.rows) + '（期望 [3,2]）')

  // ============ 3) 复制「错误」行：不能把「错误」两个字复制出去 ============
  await reload()
  await evalS(`
    window.__copied = null;
    document.querySelectorAll('.calc-row')[2].querySelector('.row-icon').click();
    return true;
  `)
  await sleep(250)
  const menuOpen = await evalS(`return !!document.querySelector('.copy-menu')`)
  await evalS(`
    const btn = document.querySelector('.copy-menu .pop-item');
    if (btn) btn.click();
    return true;
  `)
  await sleep(300)
  const copiedErr = await evalS(`return window.__copied`)
  check('复制菜单能打开', menuOpen)
  check('对错误行「复制结果」不会复制出「错误」二字', copiedErr !== '错误',
    JSON.stringify(copiedErr) + (copiedErr === null ? '（无内容，按「此行暂无内容」处理）' : ''))

  // ============ 4) Esc：导出菜单、错误浮层都要能关掉 ============
  await evalS(`[...document.querySelectorAll('.tool-group-feat .tool-btn')][1].click(); return true;`)
  await sleep(250)
  const exportOpen = await evalS(`return !!document.querySelector('.export-menu')`)
  await key('Escape', 'Escape', 27)
  await sleep(250)
  const exportStill = await evalS(`return !!document.querySelector('.export-menu')`)
  check('导出菜单能打开', exportOpen)
  check('Esc 能关闭导出菜单', exportOpen && !exportStill, exportStill ? '菜单仍在' : '已关闭')

  await evalS(`
    const badge = document.querySelector('.calc-row .err-badge');
    if (badge) badge.click();
    return true;
  `)
  await sleep(250)
  const errOpen = await evalS(`return !!document.querySelector('.err-popover')`)
  await key('Escape', 'Escape', 27)
  await sleep(250)
  const errStill = await evalS(`return !!document.querySelector('.err-popover')`)
  check('错误浮层能打开', errOpen)
  check('Esc 能关闭错误浮层', errOpen && !errStill, errStill ? '浮层仍在' : (errOpen ? '已关闭' : '未打开'))

  // ============ 5) 导出 Markdown 前必须先结算挂起的计算 ============
  await reload()
  const mdClick = await evalA(`
    window.__blobs = [];
    const ta = document.querySelectorAll('.calc-row')[0].querySelector('textarea');
    const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
    setter.call(ta, '2+3');
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise(r => setTimeout(r, 0));
    [...document.querySelectorAll('.tool-group-feat .tool-btn')][1].click();
    await new Promise(r => setTimeout(r, 0));
    const item = document.querySelector('.export-menu:not(.style-menu) .exp-item');
    if (!item) return 'NO_ITEM';
    item.click();
    return 'OK';
  `)
  await sleep(600)
  const mdText = await evalS(`
    const bs = window.__blobs || [];
    if (!bs.length) return null;
    return bs[bs.length - 1].text();
  `)
  note('导出到的 Markdown 片段', JSON.stringify(String(mdText || '').slice(0, 140)))
  check('导出 Markdown 时先结算挂起的计算（算式与结果不配对就是回归）',
    mdClick === 'OK' && !!mdText && /2\+3/.test(mdText) && /=\s*5(?!\d)/.test(mdText),
    mdClick !== 'OK' ? '点击链失败：' + mdClick : (mdText ? (/(^|\D)5(\D|$)/.test(mdText) ? '含结果 5' : '缺结果') : '未捕获到 Blob'))

  // ============ 6) 备份里 expr 是数字：不能白屏，也不能把坏数据写回存储 ============
  await reload()
  const excB = exceptions.length
  await evalS(`
    const bad = { app: 'calc-paper', schema: 1, state: { sheets: [
      { id: 'x', name: '坏数据', lines: [ { id: 'l1', expr: 123, note: '数字算式' }, { id: 'l2', expr: 'ok+1' } ] }
    ], activeSheetIndex: 0 } };
    const file = new File([JSON.stringify(bad)], 'bad.json', { type: 'application/json' });
    const dt = new DataTransfer();
    dt.items.add(file);
    const inp = document.querySelector('input[type=file]');
    inp.files = dt.files;
    inp.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  `)
  await sleep(500)
  const confirmShown = await evalS(`return !!document.querySelector('.modal-mask')`)
  if (confirmShown) {
    await evalS(`
      const btns = [...document.querySelectorAll('.modal-actions .modal-btn')];
      (btns.find(b => /确定/.test(b.textContent)) || btns[1]).click();
      return true;
    `)
    await sleep(900)
  }
  const afterBad = await evalS(`
    return {
      rows: document.querySelectorAll('.calc-row').length,
      appAlive: !!document.querySelector('.app-card'),
      firstResult: document.querySelector('.calc-row .result-value') ? document.querySelector('.calc-row .result-value').textContent.trim() : null
    }
  `)
  const excAfter6 = exceptions.slice(excB)
  await sleep(1200)
  const persisted = await evalS(`
    const raw = localStorage.getItem('calc_paper_state');
    try {
      const j = JSON.parse(raw);
      const l0 = j && j.sheets && j.sheets[0] && j.sheets[0].lines && j.sheets[0].lines[0];
      return { has: !!raw, expr: l0 ? l0.expr : null, type: typeof (l0 ? l0.expr : null) };
    } catch (e) { return { has: !!raw, parseError: true }; }
  `)
  note('坏备份导入后本地存储里的首行算式', JSON.stringify(persisted))
  check('导入 expr 为数字的备份不会打挂界面',
    afterBad.appAlive && afterBad.rows > 0,
    '弹了确认=' + confirmShown + '，行数=' + afterBad.rows +
    (excAfter6.length ? '，异常=' + String(excAfter6[0]).split('\n')[0].slice(0, 80) : ''))
  check('数字算式被收敛成字符串而不是原样保留', persisted && persisted.type === 'string',
    'expr 类型=' + (persisted ? persisted.type : 'n/a'))
  check('坏备份不会把坏数据写回本地存储（刷新后能自愈）',
    !(persisted && persisted.type === 'number') && !(persisted && persisted.parseError),
    JSON.stringify(persisted))

  // ============ 7) 新建稿纸 / 重命名都要能撤销 ============
  await reload()
  await evalS(`document.querySelector('.sheet-add').click(); return true;`)
  await sleep(400)
  const tabsAfterAdd = await evalS(`return document.querySelectorAll('.sheet-tab').length`)
  await key('z', 'KeyZ', 90, 2)
  await sleep(700)
  const tabsAfterUndo = await evalS(`return document.querySelectorAll('.sheet-tab').length`)
  check('新建稿纸后 Ctrl+Z 能撤销', tabsAfterAdd === 3 && tabsAfterUndo === 2,
    `新建后 ${tabsAfterAdd} 张，撤销后 ${tabsAfterUndo} 张`)

  // 重命名：双击标签 → 改名字 → 回车
  await reload()
  const renamed = await evalA(`
    const tabs = [...document.querySelectorAll('.sheet-tab')];
    tabs[0].dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    await new Promise(r => setTimeout(r, 250));
    const inp = document.querySelector('.sheet-rename-input, .sheet-tab input');
    if (!inp) return { err: 'no-input' };
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(inp, '新名字');
    inp.dispatchEvent(new Event('input', { bubbles: true }));
    inp.dispatchEvent(new Event('blur', { bubbles: true }));
    await new Promise(r => setTimeout(r, 350));
    return { name: document.querySelectorAll('.sheet-tab')[0].textContent.replace(/\\s+/g, ' ').trim() };
  `)
  await key('z', 'KeyZ', 90, 2)
  await sleep(700)
  const nameAfterUndo = await evalS(`
    return document.querySelectorAll('.sheet-tab')[0].textContent.replace(/\\s+/g, ' ').trim()
  `)
  check('重命名可 Ctrl+Z 撤销', /新名字/.test(renamed.name || '') && !/新名字/.test(nameAfterUndo),
    `改名后「${renamed.name}」→ 撤销后「${nameAfterUndo}」`)

  // 重命名防重名：把稿纸A 改成「稿纸B」，应自动变成「稿纸B (2)」
  await reload()
  const dupName = await evalA(`
    const tabs = [...document.querySelectorAll('.sheet-tab')];
    tabs[0].dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    await new Promise(r => setTimeout(r, 250));
    const inp = document.querySelector('.sheet-rename-input, .sheet-tab input');
    if (!inp) return { err: 'no-input' };
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(inp, '稿纸B');
    inp.dispatchEvent(new Event('input', { bubbles: true }));
    inp.dispatchEvent(new Event('blur', { bubbles: true }));
    await new Promise(r => setTimeout(r, 350));
    return [...document.querySelectorAll('.sheet-tab')].map(t => t.textContent.replace(/\\s+/g, ' ').trim());
  `)
  const nameList = Array.isArray(dupName) ? dupName : []
  const uniq = new Set(nameList.map(n => n.replace(/^✎/, '').trim()))
  check('重命名不会和已有稿纸重名', Array.isArray(dupName) && uniq.size === nameList.length,
    JSON.stringify(nameList))

  // ============ 8) 图表：负值数据的柱子必须有可见高度 ============
  await reload()
  await evalS(`[...document.querySelectorAll('.tool-group-feat .tool-btn')][4].click(); return true;`)
  await sleep(400)
  const chartOpen = await evalS(`return !!document.querySelector('.chart-card')`)
  await evalS(`
    const ta = document.querySelector('.chart-input');
    const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
    setter.call(ta, '-5, -10, 3');
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  `)
  await sleep(350)
  const bars = await evalS(`
    return [...document.querySelectorAll('.chart-bar')].map(r => ({
      h: Number(r.getAttribute('height')),
      y: Number(r.getAttribute('y'))
    }))
  `)
  const zeroLine = await evalS(`
    const lines = [...document.querySelectorAll('.chart-axis')];
    return lines.length >= 2 ? Number(lines[1].getAttribute('y1')) : null
  `)
  check('图表弹层能打开', chartOpen)
  note('负值数据的柱子（高/顶）', JSON.stringify(bars))
  check('负值数据每根柱子都有可见高度', Array.isArray(bars) && bars.length === 3 && bars.every(b => b.h > 1),
    JSON.stringify(bars && bars.map(b => b.h)))
  check('负值柱画在 0 基线下方（不占据全图高度）',
    Array.isArray(bars) && zeroLine !== null && bars.slice(0, 2).every(b => b.y >= zeroLine - 1),
    '基线 y=' + zeroLine + '，负值柱顶 y=' + (bars ? bars.slice(0, 2).map(b => b.y) : 'n/a'))
  await evalS(`
    const c = document.querySelector('.chart-close');
    if (c) c.click();
    return true;
  `)
  await sleep(200)

  // ============ 9) 变量面板「复制值」= 不带千分位的原始值 ============
  await reload()
  await evalS(`
    window.__copied = null;
    [...document.querySelectorAll('.tool-group-feat .tool-btn')][2].click();
    return true;
  `)
  await sleep(350)
  await evalS(`
    const b = document.querySelector('.var-copy');
    if (b) b.click();
    return true;
  `)
  await sleep(300)
  const varCopied = await evalS(`return window.__copied`)
  check('变量面板「复制值」复制的是原始值', varCopied === '0.13' || varCopied === '0.5', JSON.stringify(varCopied))
  await closeVarPanel()

  // ============ 10) 点确认弹层空白处不该清掉行高亮 ============
  await reload()
  // 用底部输入加一行，制造「最新计算行」高亮
  const latestMade = await evalA(`
    const ta = document.querySelector('.quick-input');
    if (!ta) return 'NO_INPUT';
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
    setter.call(ta, '7*8');
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    const ev = new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true });
    ta.dispatchEvent(ev);
    await new Promise(r => setTimeout(r, 500));
    return document.querySelectorAll('.calc-row.latest').length;
  `)
  if (latestMade === 'NO_INPUT') {
    check('底部输入框可定位（行高亮用例前置）', false, '未找到底部输入框')
  } else {
    check('底部回车新增行后出现最新行高亮', latestMade > 0, String(latestMade))
    // 打开确认弹层（清空当前稿纸）。注意：点工具栏那一下本身就会清掉高亮，
    // 这是既有设计（点行外 = 取消选中），和本用例要测的不是一回事。
    await evalS(`
      // 工具栏第一组第一个按钮就是「清空当前稿纸」（v-tip 是自绘提示，没有 title 属性，按位置取）
      const clear = document.querySelector('.tool-group .tool-btn');
      if (clear) clear.click();
      return true;
    `)
    await sleep(400)
    const maskShown = await evalS(`return !!document.querySelector('.modal-mask')`)
    // 弹层已经弹出来之后再造一个高亮，这样「点弹层空白处」时高亮一定存在，
    // 不会被前面那一下工具栏点击干扰（否则测的是「点工具栏会清高亮」）
    const highlightInDialog = await evalA(`
      const ta = document.querySelector('.quick-input');
      if (!ta) return 0;
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
      setter.call(ta, '9*9');
      ta.dispatchEvent(new Event('input', { bubbles: true }));
      // 必须 bubbles:false：确认弹层打开时，window 上的 Enter 会被当成「确定」，
      // 一冒泡就会把弹层点掉（第一版就这么把弹层弄没了，紧接着的 mask 变 null）
      ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: false }));
      await new Promise(r => setTimeout(r, 400));
      return document.querySelectorAll('.calc-row.latest').length;
    `)
    if (maskShown) {
      // 点弹层空白处（不是卡片），等价于用户点了「跟这个确认框无关的地方」
      await evalS(`
        const mask = document.querySelector('.modal-mask');
        const r = mask.getBoundingClientRect();
        mask.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: r.left + 4, clientY: r.top + 4 }));
        return true;
      `)
      await sleep(400)
    }
    const latestAfterMask = await evalS(`return document.querySelectorAll('.calc-row.latest').length`)
    check('确认弹层能弹出', maskShown)
    check('弹层打开期间新增行能点亮高亮（用例前置）', highlightInDialog > 0, String(highlightInDialog))
    check('点确认弹层空白处不会清掉行高亮', !maskShown || latestAfterMask > 0,
      `弹层=${maskShown}，点之前高亮=${highlightInDialog}，点之后=${latestAfterMask}`)
  }

  // ============ 11) 本地存储里的 JSON 坏掉：不白屏，原文可救 ============
  const brokenInject = await send('Page.addScriptToEvaluateOnNewDocument', {
    source: `try { localStorage.setItem('calc_paper_state', '{ this is not json'); } catch (e) {}`
  })
  await send('Page.navigate', { url: URL })
  await sleep(1600)
  const broken = await evalS(`
    return {
      alive: !!document.querySelector('.app-card'),
      rows: document.querySelectorAll('.calc-row').length,
      sheetTabs: document.querySelectorAll('.sheet-tab').length,
      emptyHint: !!document.querySelector('.empty-hint'),
      toast: document.querySelector('.toast') ? document.querySelector('.toast').textContent.replace(/\\s+/g, ' ').trim() : '',
      hasAction: !!document.querySelector('.toast-action'),
      brokenKey: Object.keys(localStorage).filter(k => k.indexOf('calc_paper_state_broken_') === 0).length
    }
  `)
  // 兜底启动的是空稿纸（0 行、有引导卡），所以「活着」要看容器和稿纸标签，不能看行数
  check('本地数据损坏时应用仍能打开（不白屏）', broken.alive && broken.sheetTabs > 0,
    `行数=${broken.rows}，稿纸标签=${broken.sheetTabs}，引导卡=${broken.emptyHint}`)
  check('损坏时给出提示而不是静默清空', /损坏/.test(broken.toast), JSON.stringify(broken.toast))
  check('损坏原文被另存（刷新后仍能捞回）', broken.brokenKey > 0, 'broken 键数量=' + broken.brokenKey)
  check('提示里带「下载原文」入口', broken.hasAction)
  await send('Page.removeScriptToEvaluateOnNewDocument', { identifier: brokenInject.identifier })
  // 清掉坏数据，别影响下一次运行
  await send('Page.navigate', { url: URL })
  await sleep(800)

  console.log('')
  const fails = results.filter(r => !r.info && !r.ok)
  console.log(`===== 审计回归：${results.filter(r => !r.info).length} 项，失败 ${fails.length} 项 =====`)
  if (fails.length) {
    for (const f of fails) console.log('  ✗ ' + f.n + (f.d !== undefined ? ' | ' + f.d : ''))
    process.exitCode = 1
  }
} catch (e) {
  console.log('FATAL | ' + (e && e.message))
  process.exitCode = 1
} finally {
  try { ws && ws.close() } catch (_) {}
  proc.kill()
}
