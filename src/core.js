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

export function formatResult(res) {
  if (res === undefined || res === null) return ''
  try {
    if (math.isBigNumber(res)) {
      // 整数：完整输出（不转科学计数法，不丢位）
      if (res.isInteger()) return res.toFixed(0)
      // 完整十进制（decimal.js 64 位有效数字，有限小数可精确表示）
      const full = res.toString()
      // 小数部分 > 12 位：商业精度截断到 12 位（数学上必然截断，远超日常精度需求；避免 1/3 输出 64 位字符挤爆 UI）
      const decIdx = full.indexOf('.')
      if (decIdx >= 0 && full.length - decIdx - 1 > 12) {
        const f = trimZeros(math.format(res, { notation: 'fixed', precision: 12 }))
        // fixed 变成 0（极小值）时保留指数形式，避免误显示为 0
        if (f === '0' || f === '-0') return full
        return f
      }
      // 有限且长度适中 → 完整显示，零偏差
      if (!full.includes('e') && full.length <= 32) return trimZeros(full)
      // 罕见大数（>32 位整数部分）：用指数形式
      return trimZeros(math.format(res, { notation: 'exponential', precision: 12 }))
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
export function safeEval(expr, scope) {
  try { return { ok: true, value: formatResult(math.evaluate(expr, scope)) } }
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
