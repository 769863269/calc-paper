import { describe, it, expect } from 'vitest'
import {
  math, trimZeros, displayResult, formatResult, analyzeError, suggestFix,
  lineFullText, uniqueSheetName, isVarDefLine, isAssignExpr, isValidVarName,
  parseChartInput, safeEval, newLine, uid
} from './core.js'

describe('trimZeros', () => {
  it('去掉小数尾部无效 0', () => {
    expect(trimZeros('1.200')).toBe('1.2')
    expect(trimZeros('1.0')).toBe('1')
    expect(trimZeros('100.')).toBe('100')
  })
  it('科学计数法仅去小数部分尾零', () => {
    expect(trimZeros('1.200e3')).toBe('1.2e3')
    expect(trimZeros('1.0e-2')).toBe('1e-2')
  })
})

describe('displayResult 千分位', () => {
  it('纯数字加千分位', () => {
    expect(displayResult('1234.5')).toBe('1,234.5')
    expect(displayResult('1000000')).toBe('1,000,000')
    expect(displayResult('-1234')).toBe('-1,234')
  })
  it('非数字/错误原样返回', () => {
    expect(displayResult('错误')).toBe('错误')
    expect(displayResult('abc')).toBe('abc')
    expect(displayResult('')).toBe('')
  })
})

describe('formatResult', () => {
  it('整数与有限小数零偏差', () => {
    expect(formatResult(math.evaluate('2+3'))).toBe('5')
    expect(formatResult(math.evaluate('0.1+0.2'))).toBe('0.3')
  })
  it('无限小数按商业精度截断到 12 位', () => {
    expect(formatResult(math.evaluate('1/3'))).toBe('0.333333333333')
    expect(formatResult(math.evaluate('1/7')).length).toBeLessThanOrEqual(14)
  })
  it('空值返回空串', () => {
    expect(formatResult(undefined)).toBe('')
    expect(formatResult(null)).toBe('')
  })
})

describe('analyzeError 中文提示', () => {
  it('未定义符号/函数', () => {
    expect(analyzeError(new Error('Undefined symbol x'))).toContain('未定义符号')
    expect(analyzeError(new Error('Undefined function foo'))).toContain('未定义函数')
  })
  it('常见语法错误分类', () => {
    expect(analyzeError(new Error('Cannot divide by zero'))).toBe('不能除以零')
    expect(analyzeError(new Error('Parenthesis ) expected'))).toContain('右括号')
    expect(analyzeError(new Error('Unexpected end of expression'))).toContain('不完整')
  })
  it('未知错误截断到 30 字', () => {
    const long = 'a'.repeat(50)
    expect(analyzeError(new Error(long))).toBe('a'.repeat(30))
    expect(analyzeError(new Error(long)).length).toBe(30)
  })
})

describe('suggestFix 建议', () => {
  it('按错误类型给针对性建议', () => {
    expect(suggestFix('未定义符号：x')).toContain('先定义变量')
    expect(suggestFix('缺少右括号 )')).toContain(')')
    expect(suggestFix('不能除以零')).toContain('分母')
  })
})

describe('lineFullText', () => {
  it('拼装算式=结果(备注)', () => {
    expect(lineFullText({ expr: 'a=1', result: '1', note: '税率' })).toBe('a=1 = 1 (税率)')
    expect(lineFullText({ expr: '2+3', result: '5', note: '' })).toBe('2+3 = 5')
  })
  it('空行返回空串', () => {
    expect(lineFullText({ expr: '', result: '', note: '' })).toBe('')
  })
})

describe('uniqueSheetName', () => {
  it('重名自动加序号', () => {
    expect(uniqueSheetName('稿纸1', ['稿纸1'])).toBe('稿纸1 (2)')
    expect(uniqueSheetName('稿纸1', [])).toBe('稿纸1')
    expect(uniqueSheetName('x', ['x', 'x (2)'])).toBe('x (3)')
  })
})

describe('isVarDefLine', () => {
  it('识别赋值定义行，排除比较运算', () => {
    expect(isVarDefLine('tax = 0.13', 'tax')).toBe(true)
    expect(isVarDefLine('tax=1', 'tax')).toBe(true)
    expect(isVarDefLine('tax == 0.13', 'tax')).toBe(false)
    expect(isVarDefLine('price = 10', 'tax')).toBe(false)
  })
})

describe('isAssignExpr', () => {
  it('仅等号赋值算赋值，== 不算', () => {
    expect(isAssignExpr('x = 1')).toBe(true)
    expect(isAssignExpr('x == 1')).toBe(false)
    expect(isAssignExpr('1+2')).toBe(false)
    expect(isAssignExpr('sqrt(x)')).toBe(false)
  })
})

describe('isValidVarName', () => {
  it('合法变量名规则', () => {
    expect(isValidVarName('tax')).toBe(true)
    expect(isValidVarName('_a1')).toBe(true)
    expect(isValidVarName('1abc')).toBe(false)
  })
  it('排除原型链危险字段', () => {
    expect(isValidVarName('__proto__')).toBe(false)
    expect(isValidVarName('constructor')).toBe(false)
    expect(isValidVarName('prototype')).toBe(false)
    expect(isValidVarName('a.b')).toBe(false)
  })
})

describe('parseChartInput', () => {
  it('纯数字序列按序号命名', () => {
    expect(parseChartInput('12,30,25')).toEqual([
      { name: '1', value: 12 }, { name: '2', value: 30 }, { name: '3', value: 25 }
    ])
  })
  it('支持 名称:值 形式', () => {
    expect(parseChartInput('一月:12, 二月:30')).toEqual([
      { name: '一月', value: 12 }, { name: '二月', value: 30 }
    ])
  })
  it('空串/非数字返回空', () => {
    expect(parseChartInput('')).toEqual([])
    expect(parseChartInput('abc')).toEqual([])
  })
})

describe('safeEval', () => {
  it('正确表达式返回 ok', () => {
    expect(safeEval('2+3', {})).toEqual({ ok: true, value: '5' })
    expect(safeEval('x', { x: 2 })).toEqual({ ok: true, value: '2' })
  })
  it('错误表达式返回 ok:false', () => {
    // 语法不完整：数学上必然抛错
    expect(safeEval('1 +', {}).ok).toBe(false)
    // 未定义函数：必然抛错
    expect(safeEval('foo(1)', {}).ok).toBe(false)
  })
})

describe('uid / newLine', () => {
  it('uid 唯一', () => {
    const a = uid(); const b = uid()
    expect(a).not.toBe(b)
  })
  it('newLine 含完整默认字段', () => {
    const l = newLine()
    expect(l).toMatchObject({ expr: '', result: '', note: '', errorMsg: '', partial: false, wasAssign: false })
    expect(typeof l.id).toBe('string')
  })
})
