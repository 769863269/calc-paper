// 真实浏览器验证脚本：用 CDP 驱动无头 Edge 跑一遍关键交互。
// 重点验证本轮改动：组件拆分后弹层是否还能开、拖拽（Pointer 重写）是否生效、
// 删稿纸后变量是否真的被清理（P0）、导出入口是否可用、有无 CSP 违规 / 控制台报错。
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import { resolveBrowser, browserArgs, tmpProfile } from './browser.mjs'

const PORT = 9333
const URL = process.argv[2] || 'http://127.0.0.1:4173/'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const results = []
function check(name, ok, detail) {
  results.push({ name, ok, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'} | ${name}${detail ? ' | ' + detail : ''}`)
}

const tmpDir = tmpProfile('calcpaper-cdp-')

const proc = spawn(resolveBrowser(), browserArgs([
  `--remote-debugging-port=${PORT}`, `--user-data-dir=${tmpDir}`
]), { stdio: 'ignore' })

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

function send(method, params = {}) {
  const id = ++idSeq
  ws.send(JSON.stringify({ id, method, params }))
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }))
}

async function evaluate(expr) {
  const r = await send('Runtime.evaluate', {
    expression: `(function(){${expr}})()`,
    returnByValue: true,
    awaitPromise: true
  })
  if (r.exceptionDetails) throw new Error('eval error: ' + JSON.stringify(r.exceptionDetails).slice(0, 300))
  return r.result.value
}

async function clickSelector(sel, idx = 0) {
  const box = await evaluate(`
    const els = document.querySelectorAll(${JSON.stringify(sel)});
    const el = els[${idx}];
    if (!el) return null;
    el.scrollIntoView({block:'center'});
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width/2, y: r.top + r.height/2 };
  `)
  if (!box) throw new Error('selector not found: ' + sel + ' #' + idx)
  await mouseClick(box.x, box.y)
}

async function mouseClick(x, y) {
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'none', clickCount: 0 })
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 })
  await sleep(30)
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 })
  await sleep(120)
}

try {
  const version = await waitFor(async () => {
    const r = await fetch(`http://127.0.0.1:${PORT}/json/version`).catch(() => null)
    return r && r.ok ? await r.json() : null
  }, 20000, 'edge devtools')
  const wsUrl = version.webSocketDebuggerUrl
  ws = new WebSocket(wsUrl)
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

  // 建一个新页面
  const target = await send('Target.createTarget', { url: 'about:blank' })
  const attach = await send('Target.attachToTarget', { targetId: target.targetId, flatten: true })
  const sessionId = attach.sessionId
  // 用 sessionId 路由后续命令
  const sendS = (method, params = {}) => {
    const id = ++idSeq
    ws.send(JSON.stringify({ id, method, params, sessionId }))
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
    await clickAtS(box.x, box.y)
    return box
  }
  const clickAtS = async (x, y) => {
    await sendS('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'none', clickCount: 0 })
    await sendS('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 })
    await sleep(30)
    await sendS('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 })
    await sleep(150)
  }

  await sendS('Runtime.enable')
  await sendS('Log.enable')
  await sendS('Page.enable')
  await sendS('Page.navigate', { url: URL })

  // 等应用挂载（轮询，不用固定 sleep）
  await waitFor(async () => evalS(`return !!document.querySelector('.app-card')`), 15000, 'app mount')
  check('首屏挂载', true)

  // 1) 空稿纸显示引导卡
  const guide = await evalS(`return !!document.querySelector('.guide-card')`)
  check('空稿纸引导卡', guide)

  // 2) 载入示例 → 5 行 + 结果正确
  await clickS('.guide-card .modal-btn.primary')
  await sleep(300)
  const rows = await evalS(`
    const rows = [...document.querySelectorAll('.calc-row')];
    return rows.map(r => ({
      expr: r.querySelector('.expr-input')?.value || '',
      res: (r.querySelector('.result-value')?.textContent || '').trim()
    }));
  `)
  check('载入示例生成 5 行', rows.length === 5, JSON.stringify(rows.map(r => r.res)))
  check('首行计算结果 1,942', rows[0] && rows[0].res === '1,942', rows[0] && rows[0].res)
  check('变量行参与计算 1650*tax = 214.5', rows[3] && rows[3].res === '214.5', rows[3] && rows[3].res)

  // 3) 帮助弹层（组件拆分后）
  const toolBtns = await evalS(`return document.querySelectorAll('.footer-tools .tool-btn').length`)
  check('底部工具栏按钮数量', toolBtns >= 12, String(toolBtns))
  await clickS('.footer-tools .tool-btn', 6)
  await sleep(250)
  const helpOpen = await evalS(`return !!document.querySelector('.help-card')`)
  check('帮助弹层可打开', helpOpen)
  if (helpOpen) {
    const helpText = await evalS(`return (document.querySelector('.help-card')||{}).textContent.length`)
    check('帮助内容渲染', helpText > 500, String(helpText))
    const btns = await evalS(`return [...document.querySelectorAll('.help-card .modal-btn')].length`)
    await clickS('.help-card .modal-btn', btns - 1)
    await sleep(250)
    check('帮助弹层可关闭', !(await evalS(`return !!document.querySelector('.help-card')`)))
  }

  // 4) 变量面板
  await clickS('.footer-tools .tool-btn', 9)
  await sleep(300)
  const varPanel = await evalS(`
    const p = document.querySelector('.var-panel');
    if (!p) return null;
    return { rows: p.querySelectorAll('.var-row').length, names: [...p.querySelectorAll('.var-name')].map(e => e.textContent) };
  `)
  check('变量面板可打开且列出 tax', !!varPanel && varPanel.names.includes('tax'), JSON.stringify(varPanel))
  // 在面板里改值 → 全部稿纸重算
  if (varPanel) {
    await evalS(`
      const inp = document.querySelector('.var-panel .var-input');
      inp.focus();
      inp.value = '0.5';
      inp.dispatchEvent(new Event('input', { bubbles: true }));
      inp.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    `)
    await sleep(500)
    const after = await evalS(`
      const rows = [...document.querySelectorAll('.calc-row')];
      return (rows[3].querySelector('.result-value')?.textContent || '').trim();
    `)
    check('变量面板改值触发重算（1650*0.5=825）', after === '825', after)
    // 改回 0.13，避免影响后续断言
    await evalS(`
      const inp = document.querySelector('.var-panel .var-input');
      inp.value = '0.13';
      inp.dispatchEvent(new Event('input', { bubbles: true }));
      inp.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    `)
    await sleep(400)
  }
  await clickS('.var-panel .var-panel-close')
  await sleep(250)

  // 5) 图表弹层
  await clickS('.footer-tools .tool-btn', 11)
  await sleep(300)
  const chart = await evalS(`
    const c = document.querySelector('.chart-card');
    if (!c) return null;
    return { svg: !!c.querySelector('.chart-svg'), bars: c.querySelectorAll('.chart-bar').length };
  `)
  check('图表弹层渲染 5 根柱', !!chart && chart.bars === 5, JSON.stringify(chart))
  if (chart) {
    // 切折线图
    await clickS('.chart-tabs button', 1)
    await sleep(200)
    const line = await evalS(`return document.querySelectorAll('.chart-line').length`)
    check('切换折线图', line === 1, String(line))
    await clickS('.chart-close')
    await sleep(200)
  }

  // 6) 拖拽排序（Pointer 重写后的关键回归）
  const before = await evalS(`return [...document.querySelectorAll('.calc-row .expr-input')].map(e => e.value)`)
  const drag = await evalS(`
    const rows = [...document.querySelectorAll('.calc-row')];
    const handle = rows[0].querySelector('.drag-handle');
    const hr = handle.getBoundingClientRect();
    const tr = rows[2].getBoundingClientRect();
    return {
      sx: hr.left + hr.width/2, sy: hr.top + hr.height/2,
      ty: tr.top + tr.height * 0.75
    };
  `)
  await sendS('Input.dispatchMouseEvent', { type: 'mouseMoved', x: drag.sx, y: drag.sy, button: 'none', clickCount: 0 })
  await sendS('Input.dispatchMouseEvent', { type: 'mousePressed', x: drag.sx, y: drag.sy, button: 'left', clickCount: 1 })
  await sleep(50)
  const steps = 6
  for (let s = 1; s <= steps; s++) {
    const y = drag.sy + (drag.ty - drag.sy) * s / steps
    await sendS('Input.dispatchMouseEvent', { type: 'mouseMoved', x: drag.sx, y, button: 'left', buttons: 1 })
    await sleep(40)
  }
  const draggingClass = await evalS(`return document.querySelectorAll('.calc-row.dragging').length`)
  await sendS('Input.dispatchMouseEvent', { type: 'mouseReleased', x: drag.sx, y: drag.ty, button: 'left', clickCount: 1 })
  await sleep(400)
  const after2 = await evalS(`return [...document.querySelectorAll('.calc-row .expr-input')].map(e => e.value)`)
  check('拖拽中行进入 dragging 态', draggingClass === 1, String(draggingClass))
  check('拖拽后顺序改变', JSON.stringify(before) !== JSON.stringify(after2), JSON.stringify(after2))
  check('拖拽是移动而非复制（行数不变）', after2.length === before.length, `${before.length} -> ${after2.length}`)

  // 7) 撤销拖拽
  await evalS(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true })); return true;`)
  await sleep(400)
  const afterUndo = await evalS(`return [...document.querySelectorAll('.calc-row .expr-input')].map(e => e.value)`)
  check('Ctrl+Z 撤销拖拽恢复原序', JSON.stringify(afterUndo) === JSON.stringify(before), JSON.stringify(afterUndo))

  // 8) P0 验证：删稿纸后变量必须被清理
  await evalS(`
    // 新建稿纸2
    document.querySelector('.sheet-add').click();
    return true;
  `)
  await sleep(300)
  // 稿纸2 里输入 tax*100
  await evalS(`
    const q = document.querySelector('.quick-input');
    q.focus();
    q.value = 'tax*100';
    q.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  `)
  await sleep(150)
  await evalS(`
    const btn = [...document.querySelectorAll('.footer-tools .quick-btn')][0] || document.querySelector('.quick-btn');
    btn.click();
    return true;
  `)
  await sleep(400)
  const sheet2 = await evalS(`
    const rows = [...document.querySelectorAll('.calc-row')];
    return rows.map(r => ({ expr: r.querySelector('.expr-input')?.value, res: (r.querySelector('.result-value')?.textContent||'').trim() }));
  `)
  check('稿纸2 可引用稿纸1 的变量（tax*100=13）', sheet2[0] && sheet2[0].res === '13', JSON.stringify(sheet2))

  // 删掉稿纸1（第一个标签的 ×）
  const sheetCountBefore = await evalS(`return document.querySelectorAll('.sheet-tab').length`)
  await evalS(`
    const tabs = [...document.querySelectorAll('.sheet-tab')];
    const del = tabs[0].querySelector('.sheet-del');
    del.click();
    return true;
  `)
  await sleep(300)
  await clickS('.modal-card .modal-btn.primary')
  await sleep(400)
  const sheetCount = await evalS(`return document.querySelectorAll('.sheet-tab').length`)
  check('删除稿纸生效', sheetCount === sheetCountBefore - 1, `${sheetCountBefore} -> ${sheetCount}`)

  const afterDel = await evalS(`
    const rows = [...document.querySelectorAll('.calc-row')];
    return rows.map(r => ({
      expr: r.querySelector('.expr-input')?.value,
      res: (r.querySelector('.result-value')?.textContent||'').trim(),
      err: !!r.querySelector('.err-badge')
    }));
  `)
  const firstRow = afterDel[0] || {}
  check('P0: 删稿纸后 tax 引用变为未定义（不再残留）',
    firstRow.err === true || firstRow.res === '错误',
    JSON.stringify(afterDel))

  // 变量面板应该已经没有 tax
  await clickS('.footer-tools .tool-btn', 9)
  await sleep(300)
  const varAfter = await evalS(`
    const p = document.querySelector('.var-panel');
    return p ? { rows: p.querySelectorAll('.var-row').length, names: [...p.querySelectorAll('.var-name')].map(e => e.textContent) } : null;
  `)
  check('P0: 变量面板不再显示被删稿纸的 tax', !!varAfter && varAfter.names.length === 0, JSON.stringify(varAfter))
  await evalS(`
    const c = document.querySelector('.var-panel-close'); if (c) c.click();
    return true;
  `)
  await sleep(200)

  // 9) 暗色主题
  await clickS('.header-actions .icon-btn')
  await sleep(350)
  const themeAttr = await evalS(`return document.querySelector('.app-wrapper').dataset.theme`)
  check('暗色主题切换', themeAttr === 'dark', themeAttr)
  await clickS('.header-actions .icon-btn')
  await sleep(300)

  // 10) 持久化：刷新后数据还在
  await sendS('Page.navigate', { url: URL })
  await waitFor(async () => evalS(`return !!document.querySelector('.app-card')`), 15000, 'reload')
  await sleep(600)
  const afterReload = await evalS(`
    const tabs = document.querySelectorAll('.sheet-tab').length;
    const rows = document.querySelectorAll('.calc-row').length;
    return { tabs, rows };
  `)
  check('刷新后数据持久化', afterReload.rows >= 1, JSON.stringify(afterReload))

  // 11) 无严重错误 / CSP 违规
  const cspViolations = logs.filter(l => /Content Security Policy|Refused to/i.test(l))
  const errors = logs.filter(l => /^console\.error|^exception|^error:/i.test(l) && !/favicon|Failed to load resource/i.test(l))
  check('无 CSP 违规', cspViolations.length === 0, cspViolations.slice(0, 3).join(' || '))
  check('无未捕获错误', errors.length === 0, errors.slice(0, 3).join(' || '))

  console.log('\n---- 汇总 ----')
  const failed = results.filter(r => !r.ok)
  console.log(`${results.length - failed.length}/${results.length} 通过`)
  if (failed.length) console.log('失败项：\n' + failed.map(f => ' - ' + f.name + ' => ' + (f.detail || '')).join('\n'))
  if (logs.length) console.log('\n浏览器日志：\n' + logs.slice(0, 15).join('\n'))
  process.exitCode = failed.length ? 1 : 0
} catch (e) {
  console.error('VERIFY ERROR:', e && e.message)
  console.log('\n已完成的检查：')
  results.forEach(r => console.log(`${r.ok ? 'PASS' : 'FAIL'} | ${r.name} | ${r.detail || ''}`))
  process.exitCode = 2
} finally {
  try { ws && ws.close() } catch (_) {}
  try { proc.kill() } catch (_) {}
}
