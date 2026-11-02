// 稿纸导出：把当前稿纸排成一张 canvas（PNG / PDF 共用），以及按页切图。
// 本模块只依赖 core.js 的纯函数与 DOM canvas，不引用任何 Vue 状态，
// 调用方把「稿纸名 / 行数组 / 是否暗色」传进来即可。
import { wrapText, displayResult } from './core.js'

export const EXPORT_W = 720
export const EXPORT_SCALE = 2
export const PDF_PAGE_H = 1120

const PAD_X = 40
const PAD_TOP = 64
const PAD_BOTTOM = 36
const EXPR_LINE_H = 22
const NOTE_LINE_H = 18
const NOTE_TOP_GAP = 6
const ROW_GAP = 12
const MONO_STACK = '15px "SFMono-Regular", ui-monospace, Menlo, Consolas, monospace'
const NOTE_STACK = '12px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
const TITLE_STACK = '600 22px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
const DATE_STACK = '13px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'

function palette(isDark) {
  return {
    bg: isDark ? '#1e2128' : '#ffffff',
    text: isDark ? '#f5f5f7' : '#1d1d1f',
    sub: isDark ? 'rgba(245,245,247,0.55)' : 'rgba(0,0,0,0.45)',
    accent: isDark ? '#0a84ff' : '#0071e3',
    border: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)',
    error: '#ff3b30'
  }
}

// 结果文本：错误行显示「错误」，其余走千分位
function resultText(l) {
  if (l.result && l.result !== '错误') return displayResult(l.result)
  return l.errorMsg ? '错误' : ''
}

// 先排版再建画布：canvas 高度必须画之前就定，而折行依赖字体测量，
// 所以先用离屏 ctx 试量一遍，得到每行的折行结构与总高。
function layout(lines) {
  const probe = document.createElement('canvas').getContext('2d')
  if (!probe) return null
  const contentW = EXPORT_W - PAD_X * 2
  const rows = []
  let y = PAD_TOP
  for (const l of lines) {
    probe.font = MONO_STACK
    const res = resultText(l)
    const rw = res ? probe.measureText(res).width : 0
    // 结果特别长（几十位小数）时不再和算式挤一行，单独下移一行右对齐，
    // 否则算式可用宽度会被压到只剩几十像素、每行只放得下两三个字符
    const stackResult = rw > contentW * 0.6
    const exprMaxW = stackResult ? contentW : contentW - rw - (rw ? 18 : 0)
    const exprLines = wrapText(l.expr.trim(), exprMaxW, (t) => probe.measureText(t).width)
    probe.font = NOTE_STACK
    const noteText = l.note.trim()
    const noteLines = noteText ? wrapText(noteText, contentW, (t) => probe.measureText(t).width) : []
    let h = exprLines.length * EXPR_LINE_H
    if (stackResult) h += EXPR_LINE_H
    if (noteLines.length) h += NOTE_TOP_GAP + noteLines.length * NOTE_LINE_H
    rows.push({ res, rw, stackResult, exprLines, noteLines, h, y })
    y += h + ROW_GAP
  }
  const H = (rows.length ? y - ROW_GAP : y + 20) + PAD_BOTTOM
  return { rows, H }
}

function roundRect(c, x, y, w, h, r) {
  c.beginPath()
  c.moveTo(x + r, y)
  c.arcTo(x + w, y, x + w, y + h, r)
  c.arcTo(x + w, y + h, x, y + h, r)
  c.arcTo(x, y + h, x, y, r)
  c.arcTo(x, y, x + w, y, r)
  c.closePath()
}

/**
 * 渲染稿纸为 canvas
 * @param {{ name: string, lines: Array, isDark: boolean, date?: Date }} opts
 * @returns {{ canvas: HTMLCanvasElement, cssW: number, cssH: number } | null}
 */
export function renderPaperCanvas({ name, lines, isDark, date }) {
  const list = (lines || []).filter((l) => (l.expr || '').trim())
  const p = palette(!!isDark)
  const plan = layout(list)
  if (!plan) return null
  const { rows, H } = plan

  const cv = document.createElement('canvas')
  cv.width = EXPORT_W * EXPORT_SCALE
  cv.height = Math.round(H * EXPORT_SCALE)
  const c = cv.getContext('2d')
  if (!c) return null
  c.scale(EXPORT_SCALE, EXPORT_SCALE)
  c.textBaseline = 'top'
  c.fillStyle = p.bg
  roundRect(c, 0, 0, EXPORT_W, H, 18)
  c.fill()

  // 标题 + 日期
  const now = date || new Date()
  c.fillStyle = p.text
  c.font = TITLE_STACK
  c.fillText(name || '计算稿纸', PAD_X, 24)
  c.fillStyle = p.sub
  c.font = DATE_STACK
  c.fillText(
    `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`,
    PAD_X, 54
  )
  c.strokeStyle = p.border
  c.beginPath(); c.moveTo(PAD_X, PAD_TOP - 12); c.lineTo(EXPORT_W - PAD_X, PAD_TOP - 12); c.stroke()

  // 逐行绘制：算式左对齐可折行，结果右对齐贴首行，备注在算式下方
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]
    c.font = MONO_STACK
    c.fillStyle = p.text
    let ty = r.y
    for (const seg of r.exprLines) { c.fillText(seg, PAD_X, ty); ty += EXPR_LINE_H }
    if (r.res) {
      c.fillStyle = r.res === '错误' ? p.error : p.accent
      const ry = r.stackResult ? r.y + r.exprLines.length * EXPR_LINE_H : r.y
      c.fillText(r.res, EXPORT_W - PAD_X - r.rw, ry)
    }
    if (r.noteLines.length) {
      c.font = NOTE_STACK
      c.fillStyle = p.sub
      let ny = r.y + r.exprLines.length * EXPR_LINE_H + (r.stackResult ? EXPR_LINE_H : 0) + NOTE_TOP_GAP
      for (const seg of r.noteLines) { c.fillText(seg, PAD_X, ny); ny += NOTE_LINE_H }
    }
    if (i < rows.length - 1) {
      c.strokeStyle = p.border
      c.beginPath()
      c.moveTo(PAD_X, r.y + r.h + ROW_GAP / 2)
      c.lineTo(EXPORT_W - PAD_X, r.y + r.h + ROW_GAP / 2)
      c.stroke()
    }
  }
  if (!rows.length) {
    c.fillStyle = p.sub
    c.font = NOTE_STACK
    c.fillText('（暂无算式）', PAD_X, PAD_TOP)
  }
  return { canvas: cv, cssW: EXPORT_W, cssH: H }
}

/**
 * 把整张 canvas 按页高切成若干块（PDF 分页用）。
 * jsPDF 的 addImage 不支持源矩形裁剪，只能先切到临时 canvas 再逐页贴。
 * @returns {Array<{ canvas: HTMLCanvasElement, cssW: number, cssH: number }>}
 */
export function sliceCanvasPages(canvas, cssW, cssH, pageH = PDF_PAGE_H) {
  const pages = []
  let offset = 0
  while (offset < cssH - 0.5) {
    const h = Math.min(pageH, cssH - offset)
    const slice = document.createElement('canvas')
    slice.width = canvas.width
    slice.height = Math.max(1, Math.round(h * EXPORT_SCALE))
    const sc = slice.getContext('2d')
    if (!sc) break
    sc.drawImage(
      canvas,
      0, Math.round(offset * EXPORT_SCALE), canvas.width, slice.height,
      0, 0, canvas.width, slice.height
    )
    pages.push({ canvas: slice, cssW, cssH: h })
    offset += h
  }
  return pages
}
