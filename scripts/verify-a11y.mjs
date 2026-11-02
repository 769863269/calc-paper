// 无障碍回归：弹层是不是真的被读屏识别成对话框、焦点有没有进去/还回来、Tab 会不会漏到背景。
// 这些属性在肉眼下完全不可见，改模板时最容易顺手删掉，所以必须有断言盯着。
import { spawn } from 'node:child_process'
import { resolveBrowser, browserArgs, tmpProfile } from './browser.mjs'

const PORT = 9343
const URL = process.argv[2] || 'http://127.0.0.1:4173/'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const results = []
const check = (n, ok, d) => { results.push({ n, ok, d }); console.log(`${ok ? 'PASS' : 'FAIL'} | ${n}${d ? ' | ' + d : ''}`) }

const proc = spawn(resolveBrowser(), browserArgs([
  `--remote-debugging-port=${PORT}`, `--user-data-dir=${tmpProfile('calcpaper-a11y-')}`
]), { stdio: 'ignore' })

let ws, idSeq = 0
const pending = new Map()

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
    await sleep(220)
  }
  const press = async (key, code, vk, modifiers = 0) => {
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key, code, windowsVirtualKeyCode: vk, modifiers })
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode: vk, modifiers })
    await sleep(120)
  }
  // 弹层属性快照：role / aria-modal / 名称 / 焦点是否在内部
  const dialogInfo = (sel) => evalS(`
    const el = document.querySelector(${JSON.stringify(sel)});
    if (!el) return null;
    const active = document.activeElement;
    return {
      role: el.getAttribute('role'),
      modal: el.getAttribute('aria-modal'),
      label: el.getAttribute('aria-label'),
      focusInside: !!active && el.contains(active),
      activeTag: active ? active.tagName.toLowerCase() : '',
      activeClass: active ? (active.className || '').toString().slice(0, 40) : '',
    };
  `)

  await send('Runtime.enable')
  await send('Page.enable')
  await send('Page.navigate', { url: URL })
  await waitFor(() => evalS(`return !!document.querySelector('.app-card')`), 20000, 'mount')
  await evalS(`localStorage.clear(); return true;`)
  await send('Page.navigate', { url: URL })
  await waitFor(() => evalS(`return !!document.querySelector('.app-card')`), 20000, 'remount')
  await sleep(500)

  // ---- 帮助弹层 ----
  await clickS('.footer-tools .tool-btn', 6) // 帮助
  await sleep(400)
  const help = await dialogInfo('.modal-mask')
  check('帮助弹层带 role=dialog + aria-modal',
    help && help.role === 'dialog' && help.modal === 'true', JSON.stringify(help))
  check('帮助弹层有可读名称', !!help && help.label === '帮助与用法', help ? help.label : '')
  check('打开后焦点进入弹层', !!help && help.focusInside, JSON.stringify(help))

  // Tab 走到最后一个再按 Tab，应回到第一个（不会漏到背后的页面）
  const trap = await evalS(`
    const root = document.querySelector('.modal-mask');
    const list = root.querySelectorAll('a[href],button:not([disabled]),input:not([disabled]),textarea:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])');
    if (!list.length) return { ok: false, why: '无可聚焦元素' };
    const last = list[list.length - 1];
    last.focus();
    const before = document.activeElement === last;
    root.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }));
    const after = document.activeElement;
    return { ok: before && after === list[0], lastLabel: last.textContent.trim().slice(0, 10), wraps: after === list[0], count: list.length };
  `)
  check('Tab 在弹层内循环（末尾回到首个）', trap && trap.ok === true, JSON.stringify(trap))

  // 关闭后焦点归还给打开它的按钮
  await press('Escape', 'Escape', 27)
  await sleep(500)
  const afterHelp = await evalS(`
    const gone = !document.querySelector('.modal-mask');
    const active = document.activeElement;
    return { gone, tag: active ? active.tagName.toLowerCase() : '', cls: (active && active.className || '').toString().slice(0, 40) };
  `)
  check('Esc 关闭帮助弹层', afterHelp.gone === true, JSON.stringify(afterHelp))
  check('关闭后焦点回到打开它的按钮', afterHelp.gone && afterHelp.cls.includes('tool-btn'), JSON.stringify(afterHelp))

  // ---- 变量面板 ----
  await clickS('.footer-tools .tool-btn', 9)
  await sleep(450)
  const panel = await dialogInfo('.var-panel')
  check('变量面板带 role=dialog + aria-modal',
    panel && panel.role === 'dialog' && panel.modal === 'true', JSON.stringify(panel))
  check('变量面板有可读名称且焦点在内', !!panel && panel.label === '变量面板' && panel.focusInside, JSON.stringify(panel))
  await press('Escape', 'Escape', 27)
  await sleep(400)
  check('Esc 关闭变量面板', await evalS(`return !document.querySelector('.var-panel')`), '')

  // ---- 图表弹层（本轮补上的 Esc 支持） ----
  await clickS('.footer-tools .tool-btn', 11) // 图表
  await sleep(450)
  const chart = await dialogInfo('.modal-mask.chart-mask, .modal-mask')
  check('图表弹层带 role=dialog + aria-modal',
    chart && chart.role === 'dialog' && chart.modal === 'true', JSON.stringify(chart))
  await press('Escape', 'Escape', 27)
  await sleep(400)
  check('Esc 也能关掉图表弹层（与其它弹层一致）',
    await evalS(`return !document.querySelector('.modal-mask')`), '')

  // ---- 结果区 aria-live：只让当前行播报，避免满屏朗读 ----
  await evalS(`
    const q = document.querySelector('.quick-input');
    q.focus(); q.value = '3*3'; q.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  `)
  await sleep(150)
  await clickS('.quick-btn')
  await sleep(500)
  // 聚焦到这一行
  await clickS('.calc-row .expr-input')
  await sleep(300)
  const live = await evalS(`
    const blocks = [...document.querySelectorAll('.calc-row .result-block')];
    return blocks.map(b => ({ live: b.getAttribute('aria-live'), atomic: b.getAttribute('aria-atomic') }));
  `)
  const polite = live.filter(b => b.live === 'polite').length
  check('只有当前聚焦行的结果区是 aria-live=polite', polite === 1 && live.length >= 1, JSON.stringify(live))
  check('结果区带 aria-atomic', live.every(b => b.atomic === 'true'), JSON.stringify(live))

  // ---- Tab 循环：用元素更多的变量面板再验一次（帮助弹层只有 1 个可聚焦元素，说明力弱） ----
  await evalS(`
    const q = document.querySelector('.quick-input');
    q.focus(); q.value = 'tax = 0.13'; q.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  `)
  await sleep(150)
  await clickS('.quick-btn')
  await sleep(600)
  await clickS('.footer-tools .tool-btn', 9)
  await sleep(450)
  const trap2 = await evalS(`
    const root = document.querySelector('.var-panel');
    const list = root.querySelectorAll('a[href],button:not([disabled]),input:not([disabled]),textarea:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])');
    const n = list.length;
    if (n < 2) return { ok: false, why: '可聚焦元素太少: ' + n };
    // 末尾 Tab → 首个
    list[n - 1].focus();
    root.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }));
    const wrapForward = document.activeElement === list[0];
    // 首个 Shift+Tab → 末尾
    list[0].focus();
    root.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true }));
    const wrapBackward = document.activeElement === list[n - 1];
    return { ok: wrapForward && wrapBackward, n, wrapForward, wrapBackward };
  `)
  check('变量面板 Tab 双向循环（末尾↔首个）', trap2 && trap2.ok === true, JSON.stringify(trap2))
  await press('Escape', 'Escape', 27)
  await sleep(300)
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
