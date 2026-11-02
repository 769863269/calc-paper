// @vitest-environment jsdom
// 组件级测试：只覆盖「改坏了会静默出错」的关键路径，不追覆盖率。
// 浏览器回归（scripts/verify*.mjs）证明的是真实渲染与事件；这里证明的是逻辑本身，
// 让重构时能在毫秒级发现「输入不再触发计算」这类问题，而不用等一整轮 CDP。
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import App from './App.vue'

// ---- jsdom 缺失的浏览器 API ----
// 这些在真实浏览器里天然存在，jsdom 没有；不 stub 会在挂载期直接抛错。
beforeEach(() => {
  window.matchMedia = window.matchMedia || ((q) => ({
    matches: false, media: q, onchange: null,
    addEventListener: () => {}, removeEventListener: () => {},
    addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false,
  }))
  Element.prototype.scrollIntoView = Element.prototype.scrollIntoView || function () {}
  Element.prototype.scrollTo = Element.prototype.scrollTo || function () {}
  globalThis.requestIdleCallback = globalThis.requestIdleCallback || ((fn) => setTimeout(() => fn({ timeRemaining: () => 50 }), 0))
  globalThis.cancelIdleCallback = globalThis.cancelIdleCallback || ((id) => clearTimeout(id))
  localStorage.clear()
})

const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms))

async function mountApp() {
  const wrapper = mount(App, { attachTo: document.body })
  await tick(30)
  return wrapper
}
const rows = (w) => w.findAll('.calc-row')
const exprInputs = (w) => w.findAll('.calc-row .expr-input')
const resultOf = (w, i) => w.findAll('.calc-row .result-value')[i].text()

// 结果数字有滚动动画（逐帧写 textContent），所以不能读完就当最终值。
// 轮询到目标文本出现为止，比固定 sleep 稳。
async function waitResult(w, i, expectText, timeout = 2500) {
  const t0 = Date.now()
  while (Date.now() - t0 < timeout) {
    try { if (resultOf(w, i).includes(expectText)) return true } catch (_) {}
    await tick(60)
  }
  return false
}

// 输入算式并等防抖（COMPUTE_DEBOUNCE = 180ms）
async function typeExpr(w, i, text) {
  const input = exprInputs(w)[i]
  await input.setValue(text)
  await input.trigger('input')
  await tick(260)
}

describe('App 关键路径', () => {
  it('首次打开有一个空稿纸，并且能新增行', async () => {
    const w = await mountApp()
    expect(w.findAll('.sheet-tab').length).toBe(1)
    // 底部输入框提交一行
    const quick = w.find('.quick-input')
    await quick.setValue('1+1')
    await quick.trigger('input')
    await w.find('.quick-btn').trigger('click')
    await tick(260)
    expect(rows(w).length).toBe(1)
    expect(await waitResult(w, 0, '2')).toBe(true)
    w.unmount()
  })

  it('编辑算式会重算当前行（防抖后）', async () => {
    const w = await mountApp()
    // 全新状态下没有行，先造一行
    const quick = w.find('.quick-input')
    await quick.setValue('1')
    await quick.trigger('input')
    await w.find('.quick-btn').trigger('click')
    await tick(260)
    await typeExpr(w, 0, '12*3')
    expect(await waitResult(w, 0, '36')).toBe(true)
    await typeExpr(w, 0, '12*4')
    expect(await waitResult(w, 0, '48')).toBe(true)
    w.unmount()
  })

  it('赋值行改动会级联到引用它的行', async () => {
    const w = await mountApp()
    const quick = w.find('.quick-input')
    await quick.setValue('tax = 0.1\n1000*tax')
    await quick.trigger('input')
    await w.find('.quick-btn').trigger('click')
    await tick(300)
    expect(await waitResult(w, 1, '100')).toBe(true)

    await typeExpr(w, 0, 'tax = 0.2')
    expect(await waitResult(w, 1, '200')).toBe(true)
    w.unmount()
  })

  it('删除行需要确认，确认后行数 -1，撤销可恢复', async () => {
    const w = await mountApp()
    const quick = w.find('.quick-input')
    await quick.setValue('5+5\n6+6')
    await quick.trigger('input')
    await w.find('.quick-btn').trigger('click')
    await tick(300)
    expect(rows(w).length).toBe(2)

    // 点行尾 × 打开确认框
    await w.findAll('.calc-row .row-actions .row-icon')[3].trigger('click') // 第 2 行的 ×
    await tick(50)
    expect(w.find('.modal-card').exists()).toBe(true)
    await w.find('.modal-btn.primary').trigger('click')
    await tick(150)
    expect(rows(w).length).toBe(1)

    // Ctrl+Z 撤销
    await w.find('.quick-input').trigger('blur')
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true }))
    await tick(150)
    expect(rows(w).length).toBe(2)
    w.unmount()
  })

  it('底部 ↑ 第一级填上一个结果，第二级填上一个公式', async () => {
    const w = await mountApp()
    const quick = w.find('.quick-input')
    await quick.setValue('8*8')
    await quick.trigger('input')
    await w.find('.quick-btn').trigger('click')
    await tick(300)

    const bottom = w.find('.quick-input')
    await bottom.trigger('keydown', { key: 'ArrowUp' })
    await tick(50)
    expect(bottom.element.value).toBe('64') // 第一级：结果

    await bottom.trigger('keydown', { key: 'ArrowUp' })
    await tick(50)
    expect(bottom.element.value).toBe('8*8') // 第二级：公式原文
    w.unmount()
  })

  it('输入法组合态的 Enter 不会新增行（守卫生效）', async () => {
    const w = await mountApp()
    const bottom = w.find('.quick-input')
    await bottom.setValue('7*6')
    await bottom.trigger('input')
    const before = rows(w).length
    // isComposing 的合成事件：应当被守卫拦住
    const ev = new KeyboardEvent('keydown', { key: 'Enter', isComposing: true, bubbles: true, cancelable: true })
    bottom.element.dispatchEvent(ev)
    await tick(200)
    expect(rows(w).length).toBe(before)
    expect(bottom.element.value).toBe('7*6')
    expect(ev.defaultPrevented).toBe(false)
    w.unmount()
  })

  it('导出菜单同时提供「备份」与「从备份恢复」入口', async () => {
    const w = await mountApp()
    // 打开导出菜单：footer 第一个 .tool-export-wrap 里的按钮
    await w.find('.footer-tools .tool-export-wrap .tool-btn').trigger('click')
    await tick(50)
    const menuTexts = w.findAll('.export-menu .exp-item').map((b) => b.text())
    expect(menuTexts.length).toBe(5)
    expect(menuTexts.slice(0, 3).join('|')).toMatch(/Markdown|PNG|PDF/)
    expect(menuTexts.slice(3).join('|')).toMatch(/备份/)
    expect(menuTexts.slice(3).join('|')).toMatch(/恢复/)
    w.unmount()
  })

  it('切到暗色主题会写到 data-theme', async () => {
    const w = await mountApp()
    const before = w.find('.app-wrapper').attributes('data-theme')
    await w.find('.header-actions .icon-btn').trigger('click')
    await tick(30)
    const after = w.find('.app-wrapper').attributes('data-theme')
    expect(after).not.toBe(before)
    w.unmount()
  })
})
