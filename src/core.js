// 计算核心：与 UI 无关的纯逻辑，集中于此便于单元测试与复用。
// 本模块不依赖任何 Vue 响应式状态，全部为纯函数 + mathjs 实例。
import {
  create,
  evaluateDependencies,
  formatDependencies,
  bignumberDependencies,
  addDependencies, subtractDependencies, multiplyDependencies, divideDependencies,
  unaryMinusDependencies, unaryPlusDependencies,
  powDependencies, sqrtDependencies, modDependencies,
  equalDependencies, unequalDependencies, smallerDependencies, largerDependencies,
  smallerEqDependencies, largerEqDependencies,
  andDependencies, orDependencies, notDependencies,
  piDependencies, eDependencies,
  sinDependencies, cosDependencies, tanDependencies,
  absDependencies, roundDependencies, floorDependencies, ceilDependencies,
  expDependencies, logDependencies, log10Dependencies, factorialDependencies,
  numberDependencies, booleanDependencies, stringDependencies,
  isIntegerDependencies, isNumericDependencies,
  minDependencies, maxDependencies, sumDependencies
} from 'mathjs'

export const math = create(
  {
    evaluateDependencies,
    formatDependencies,
    bignumberDependencies,
    addDependencies, subtractDependencies, multiplyDependencies, divideDependencies, unaryMinusDependencies, unaryPlusDependencies,
    powDependencies, sqrtDependencies, modDependencies,
    equalDependencies, unequalDependencies, smallerDependencies, largerDependencies,
    smallerEqDependencies, largerEqDependencies,
    andDependencies, orDependencies, notDependencies,
    piDependencies, eDependencies,
    sinDependencies, cosDependencies, tanDependencies,
    absDependencies, roundDependencies, floorDependencies, ceilDependencies,
    expDependencies, logDependencies, log10Dependencies, factorialDependencies,
    numberDependencies, booleanDependencies, stringDependencies,
    isIntegerDependencies, isNumericDependencies,
    minDependencies, maxDependencies, sumDependencies
  },
  { number: 'BigNumber' }
)

let uidSeq = 0
export function uid() {
  uidSeq += 1
  // 优先用 crypto.randomUUID（不可用则退化 Math.random，兼容非 HTTPS / 老浏览器）
  const rand = (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function')
    ? crypto.randomUUID().slice(0, 8)
    : Math.random().toString(36).slice(2, 7)
  return `${Date.now().toString(36)}-${uidSeq}-${rand}`
}

// 新建一行数据的工厂（统一默认字段，避免各处手写字面量不一致）
export function newLine() {
  return { id: uid(), expr: '', result: '', note: '', time: '', errorMsg: '', partial: false, wasAssign: false }
}

// 去掉数字字符串尾部的无效 0（含科学计数法小数部分）
const TRAILING_ZEROS = /(\.\d*?)0+$/
export function trimZeros(s) {
  if (s.includes('e')) {
    const [m, exp] = s.split('e')
    return m.replace(TRAILING_ZEROS, '$1').replace(/\.$/, '') + 'e' + exp
  }
  return s.replace(TRAILING_ZEROS, '$1').replace(/\.$/, '')
}

export function formatResult(res, opts = {}) {
  // precision：结果最多保留几位小数；默认 12 保持历史行为，App 内默认改为 3
  const precision = opts.precision ?? 12
  if (res === undefined || res === null) return ''
  try {
    if (math.isBigNumber(res)) {
      // 整数：完整输出（不转科学计数法，不丢位）
      if (res.isInteger()) return res.toFixed(0)
      // 精度为 0 时直接按整数四舍五入（math.format 对 precision:0 会当默认处理）
      if (precision === 0) return res.toFixed(0)
      // 完整十进制（decimal.js 64 位有效数字，有限小数可精确表示）
      const full = res.toString()
      // 小数部分超过设定精度：按精度四舍五入并去掉尾部无效 0
      const decIdx = full.indexOf('.')
      if (decIdx >= 0 && full.length - decIdx - 1 > precision) {
        const f = trimZeros(math.format(res, { notation: 'fixed', precision }))
        // fixed 变成 0（极小值）时保留指数形式，避免误显示为 0
        if (f === '0' || f === '-0') return full
        return f
      }
      // 有限且长度适中 → 完整显示，零偏差
      if (!full.includes('e') && full.length <= 32) return trimZeros(full)
      // 罕见大数（>32 位整数部分）：用指数形式
      return trimZeros(math.format(res, { notation: 'exponential', precision }))
    }
    return math.format(res, { precision: 14 })
  } catch (e) { return String(res) }
}

// 结果展示：纯数字加千分位，非数字原样返回
export function displayResult(raw) {
  if (!raw) return ''
  if (raw === '错误') return raw
  if (/^[-+]?\d+(\.\d+)?$/.test(raw)) {
    const [intPart, decPart] = raw.split('.')
    const sign = intPart.startsWith('-') ? '-' : ''
    const digits = intPart.replace(/^-/, '')
    const formatted = digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
    return sign + formatted + (decPart !== undefined ? '.' + decPart : '')
  }
  return raw
}

export function nowTime() {
  const d = new Date()
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

// 把 mathjs 抛出的英文错误转成可读中文提示
export function analyzeError(err) {
  const msg = String(err?.message || err || '')
  let m
  m = msg.match(/Undefined symbol (.+)/)
  if (m) return `未定义符号：${m[1]}（检查拼写或是否已定义变量）`
  m = msg.match(/Undefined function (.+)/)
  if (m) return `未定义函数：${m[1]}（检查函数名拼写）`
  m = msg.match(/Too few arguments in function (\w+)/)
  if (m) return `${m[1]}() 缺少参数`
  if (/Too many arguments/.test(msg)) return '参数过多'
  m = msg.match(/Value expected \(char (\d+)\)/)
  if (m) return `运算符后缺少数值（第 ${m[1]} 位）`
  if (/Value expected/.test(msg)) return '运算符后缺少数值'
  if (/Unexpected end of expression/.test(msg)) return '表达式不完整（末尾缺内容）'
  if (/Parenthesis \) expected/.test(msg)) return '缺少右括号 )'
  m = msg.match(/Unexpected operator (.+?) \(/)
  if (m) return `运算符位置错误：${m[1]}`
  m = msg.match(/Unexpected part "(.+?)"/)
  if (m) return `数字格式错误：意外的「${m[1]}」`
  m = msg.match(/Syntax error in part "(.+?)"/)
  if (m) return `无效字符：${m[1]}`
  if (/Invalid left hand side of assignment/.test(msg)) return '赋值错误：等号左侧必须是变量名'
  if (/missing in provided namespace/.test(msg)) return '暂不支持的运算'
  if (/Cannot divide by zero/.test(msg)) return '不能除以零'
  return msg.slice(0, 30) || '无法解析'
}

// 针对中文错误信息给出修复建议
export function suggestFix(msg) {
  if (/未定义符号/.test(msg)) {
    const m = msg.match(/：(\S+)/)
    const sym = m ? m[1].replace(/（.*/, '') : ''
    return `检查拼写，或先定义变量（如 ${sym || 'x'} = 0）。若是函数，可尝试 sqrt( abs( round( 等。`
  }
  if (/未定义函数/.test(msg)) return '检查函数名拼写，可用：sqrt abs round floor ceil min max sum sin cos tan exp log log10 factorial'
  if (/缺少右括号/.test(msg)) return '在表达式末尾补上一个 )'
  if (/不完整/.test(msg)) return '在运算符后补上数值，或删除多余的运算符'
  if (/缺少数值/.test(msg)) return '运算符（如 + - * /）后面需要跟一个数值或括号'
  if (/除以零/.test(msg)) return '检查分母是否为 0，或先定义分母变量再计算'
  if (/赋值错误/.test(msg)) return '等号左侧必须是变量名，例如 tax = 0.13'
  if (/参数/.test(msg)) return '函数需要正确的参数个数，例如 sqrt(9)'
  if (/无效字符/.test(msg)) return '表达式包含不支持的字符，请删除或替换'
  if (/数字格式/.test(msg)) return '数字写法有误，例如 1.2.3 或带逗号 1,000 不合法'
  return '请检查表达式语法后重试'
}

// 安全求值：返回 { ok, value } 或 { ok:false, error }
export function safeEval(expr, scope, opts = {}) {
  try { return { ok: true, value: formatResult(math.evaluate(expr, scope), opts) } }
  catch (e) { return { ok: false, error: e } }
}

// 整行的可读文本：算式 = 结果 (备注)
export function lineFullText(line) {
  const parts = []
  if (line.expr.trim()) parts.push(line.expr.trim())
  if (line.result) parts.push('= ' + line.result)
  if (line.note.trim()) parts.push(`(${line.note.trim()})`)
  return parts.join(' ') || ''
}

// 生成不重复的稿纸名
export function uniqueSheetName(base, existingNames) {
  const used = new Set(existingNames)
  if (!used.has(base)) return base
  let n = 2
  while (used.has(`${base} (${n})`)) n++
  return `${base} (${n})`
}

// 判断某行是否是「name = ...」形式的变量定义行（排除 == 等比较运算）
export function isVarDefLine(expr, name) {
  const esc = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp('^\\s*' + esc + '\\s*=\\s*(?!=)').test(expr)
}

// 判断表达式是否为「name = ...」赋值（不关心 name 具体是什么）
export function isAssignExpr(expr) {
  return /^\s*[a-zA-Z_][a-zA-Z0-9_]*\s*=\s*(?!=)/.test(expr)
}

// 合法变量名：字母/下划线开头，仅含字母数字下划线；排除危险原型链字段
export function isValidVarName(name) {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) return false
  return !/^(__proto__|constructor|prototype)$/.test(name)
}

// 把一段文本按最大像素宽度折成多行。
// measure: (text) => number，由调用方提供字体测量（canvas 的 measureText），
// 这样本函数不依赖 DOM，可在 Node 里单测。
// 断行优先级：优先落在运算符 / 空格 / 逗号之后，避免把算式从数字中间劈开。
const BREAK_CHARS = /[+\-*/^%,\s]/
export function wrapText(text, maxWidth, measure) {
  const s = String(text ?? '')
  if (!s) return ['']
  if (!(maxWidth > 0) || measure(s) <= maxWidth) return [s]
  const lines = []
  let cur = ''
  for (const ch of s) {
    const next = cur + ch
    if (cur && measure(next) > maxWidth) {
      // 在已积累的片段里找最靠后的可断点（断在运算符之后）
      let brk = -1
      for (let i = cur.length - 1; i > 0; i--) {
        if (BREAK_CHARS.test(cur[i - 1])) { brk = i; break }
      }
      // 断点太靠前（会把一大截挤成空行）时直接按当前宽度硬断
      if (brk > 0 && measure(cur.slice(0, brk)) > maxWidth * 0.5) {
        lines.push(cur.slice(0, brk))
        cur = cur.slice(brk) + ch
      } else {
        lines.push(cur)
        cur = ch
      }
    } else {
      cur = next
    }
  }
  if (cur) lines.push(cur)
  return lines.length ? lines : ['']
}

// 解析图表输入：支持 "12,30,25" 或 "一月:12, 二月:30"
export function parseChartInput(raw) {
  const text = (raw || '').trim()
  if (!text) return []
  const parts = text.split(/[\n,]+/).map(s => s.trim()).filter(Boolean)
  const out = []
  for (const p of parts) {
    const m = p.match(/^(.+?)[:\s=]+(-?\d+(?:\.\d+)?)$/)
    if (m) out.push({ name: m[1].replace(/^\[|\]$/g, '').trim(), value: parseFloat(m[2]) })
    else if (/^-?\d+(?:\.\d+)?$/.test(p)) out.push({ name: String(out.length + 1), value: parseFloat(p) })
  }
  return out
}

// 底部输入框 ↑ 的三级阶梯（纯函数，便于单测）：
//   0 → 1  上一个结果：填入原始值（不带千分位，能直接参与运算）
//   1 → 2  上一个公式：填入原文
//   2 → 跳  历史行：清空输入框并把焦点移进那一行继续编辑
// 返回 { stage, text, jumpTo }；jumpTo >= 0 表示要跳进该行，text 为 null。
// 锚点始终取「最后一条有内容的行」，保证结果与公式来自同一行，不会串行。
const NON_FINITE = /^(-?Infinity|NaN)$/
export function nextUpRecall(state, lines) {
  const list = Array.isArray(lines) ? lines : []
  const boxText = (state && state.boxText) || ''
  const stage = (state && state.stage) || 0
  const filled = (state && state.filled) || ''
  const trimmed = boxText.trim()
  // 只有内容仍与上次 ↑ 填入的完全一致，才认为还在阶梯里；否则是用户自己打的字
  const recalling = stage > 0 && boxText === filled
  const lastMatch = (q) => {
    for (let i = list.length - 1; i >= 0; i--) {
      if (((list[i] && list[i].expr) || '').trim() === q) return i
    }
    return -1
  }
  // 用户手打的内容绝不被覆盖：直接按内容去命中历史行，命中不了就落到末行
  if (trimmed && !recalling) {
    const hit = lastMatch(trimmed)
    return { stage: 0, text: null, jumpTo: hit >= 0 ? hit : (list.length ? list.length - 1 : -1) }
  }
  let anchor = -1
  for (let i = list.length - 1; i >= 0; i--) {
    if (((list[i] && list[i].expr) || '').trim()) { anchor = i; break }
  }
  // 一条公式都没有：只剩空行时跳进末行，否则什么都不做
  if (anchor < 0) return { stage: 0, text: null, jumpTo: list.length ? list.length - 1 : -1 }
  if (stage <= 0) {
    const raw = list[anchor].result || ''
    // 错误行、「表达式不完整」的中间值、以及 Infinity/NaN 都不当作上一个结果，直接给公式：
    // 这三种填进输入框都没法继续算，给公式更有用
    if (raw && raw !== '错误' && !list[anchor].partial && !NON_FINITE.test(raw)) {
      return { stage: 1, text: raw, jumpTo: -1 }
    }
    return { stage: 2, text: list[anchor].expr.trim(), jumpTo: -1 }
  }
  if (stage === 1) return { stage: 2, text: list[anchor].expr.trim(), jumpTo: -1 }
  return { stage: 0, text: null, jumpTo: anchor }
}

// ---------- 增量重算的依赖分析 ----------
// 目的：改一个赋值行不应该让整份稿纸重新求值。要做这件事，先得知道每行「读了哪些变量」。
// 这里只取自由符号（SymbolNode），函数名（sqrt 之类）不算变量——它在 mathjs 里是 FunctionNode
// 的 fn 子节点，遍历时跳过即可。解析失败（半截表达式）返回空依赖，
// 表示「这行不依赖任何变量」，于是同样的错误文本下次可以安全复用。
export function parseDeps(expr) {
  const src = String(expr ?? '').trim()
  if (!src) return { reads: [], assign: null }
  let node
  try { node = math.parse(src) } catch (_) { return { reads: [], assign: null } }
  const reads = new Set()
  let assign = null
  try {
    node.traverse((n, _path, parent) => {
      if (n.isAssignmentNode) {
        // tax = … 左侧是 SymbolNode，取名字当被写入的变量
        if (n.object && n.object.isSymbolNode) assign = n.object.name
        return
      }
      if (!n.isSymbolNode) return
      // 函数调用的 fn 不是变量（sqrt(x) 里的 sqrt）
      if (parent && parent.isFunctionNode && parent.fn === n) return
      // 赋值目标是「写入」而不是「读取」，不能算依赖；
      // 但 tax = tax + 1 右侧那个 tax 是 BinaryNode 的子节点，仍会被正常计入
      if (parent && parent.isAssignmentNode && parent.object === n) return
      reads.add(n.name)
    })
  } catch (_) { return { reads: [], assign: null } }
  // 被赋值的变量如果同时在右侧出现（tax = tax + 1），它也是依赖，不能漏
  return { reads: [...reads].sort(), assign }
}

// 依赖签名：只由「读到的变量当前值」决定。值不变 → 结果必然不变 → 可以跳过求值。
// 用 String() 而不是 JSON：作用域里存的是 mathjs 的 BigNumber 等对象，
// String 得到的是稳定的十进制文本，正好是我们要的「值是否变了」的判据。
export function depSignature(reads, scope) {
  let sig = ''
  const list = Array.isArray(reads) ? reads : []
  for (let i = 0; i < list.length; i++) {
    const name = list[i]
    const v = scope ? scope[name] : undefined
    sig += name + '=' + (v === undefined ? '\u0000' : String(v)) + ';'
  }
  return sig
}

// 超长稿纸提示：行数超过这个值，首屏与滚动会明显变慢（实测 200 行 0.9s / 400 行 1.85s /
// 1000 行 5.3s，成本在 DOM 节点数而不是计算），提示用户拆成多张稿纸。
// 只提示、不拦截——拦下来反而更烦人。
export const HUGE_SHEET_ROWS = 500

// 是否该给这张稿纸挂提示。单独抽成纯函数只为一件事：边界值（500/501）能被单测钉住，
// 而不是靠「我觉得 500 差不多」。dismissed 是「用户点过不再提示」的稿纸 id 集合。
export function needsSplitHint(lineCount, dismissedIds, sheetId) {
  if (!(lineCount > HUGE_SHEET_ROWS)) return false
  if (!sheetId) return true
  if (!dismissedIds) return true
  const has = typeof dismissedIds.has === 'function'
    ? dismissedIds.has(sheetId)
    : Array.isArray(dismissedIds) && dismissedIds.includes(sheetId)
  return !has
}
