// 弹层无障碍：把「这是对话框、焦点该在里面、关掉要还回去」这三件事集中到一处。
// 四个弹层（帮助 / 汇率 / 变量面板 / 图表）各写一套的话，迟早漏掉其中一个；
// 这里用一条自定义指令 v-dialog 统一处理：
//   1) role="dialog" + aria-modal="true" + 可读名称（读屏才知道弹出了什么）
//   2) 打开时把焦点移进来（否则 Tab 会从页面顶部重新走一遍）
//   3) Tab / Shift+Tab 在弹层内部循环，不会漏到背后的页面上
//   4) 关闭时把焦点还给打开它的那个按钮
const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'textarea:not([disabled])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])'
].join(',')

export function focusableIn(root) {
  if (!root || typeof root.querySelectorAll !== 'function') return []
  return Array.from(root.querySelectorAll(FOCUSABLE))
}

export function dialogDirective() {
  return {
    mounted(el, binding) {
      el.setAttribute('role', 'dialog')
      el.setAttribute('aria-modal', 'true')
      if (!el.hasAttribute('aria-label') && !el.hasAttribute('aria-labelledby')) {
        const label = typeof binding.value === 'string' ? binding.value : ''
        if (label) el.setAttribute('aria-label', label)
      }
      // 没有可聚焦子元素时，让弹层自己接住焦点（否则焦点会留在背后的页面上）
      if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '-1')

      // 记住是谁打开的：关闭时把焦点还回去，读屏和键盘用户才不会「丢位置」
      const opener = document.activeElement
      el.__opener = opener && opener !== document.body ? opener : null

      const items = focusableIn(el)
      const first = items[0] || el
      try { first.focus({ preventScroll: true }) } catch (_) { try { first.focus() } catch (_) {} }

      el.__onKeydown = (e) => {
        if (e.key !== 'Tab') return
        const list = focusableIn(el)
        if (!list.length) { e.preventDefault(); return }
        const firstEl = list[0]
        const lastEl = list[list.length - 1]
        const active = document.activeElement
        if (e.shiftKey && (active === firstEl || active === el)) {
          e.preventDefault()
          lastEl.focus()
        } else if (!e.shiftKey && active === lastEl) {
          e.preventDefault()
          firstEl.focus()
        }
      }
      el.addEventListener('keydown', el.__onKeydown)
    },
    unmounted(el) {
      if (el.__onKeydown) el.removeEventListener('keydown', el.__onKeydown)
      delete el.__onKeydown
      const opener = el.__opener
      delete el.__opener
      if (opener && document.contains(opener) && typeof opener.focus === 'function') {
        try { opener.focus({ preventScroll: true }) } catch (_) { try { opener.focus() } catch (_) {} }
      }
    }
  }
}
