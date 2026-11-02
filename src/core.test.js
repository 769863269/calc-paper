import { describe, it, expect } from 'vitest'
import {
  math, trimZeros, displayResult, formatResult, analyzeError, suggestFix,
  lineFullText, uniqueSheetName, isVarDefLine, isAssignExpr, isValidVarName,
  parseChartInput, safeEval, newLine, uid, wrapText, nextUpRecall
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
  it('可配置精度：默认 3 位', () => {
    expect(formatResult(math.evaluate('1/3'), { precision: 3 })).toBe('0.333')
    expect(formatResult(math.evaluate('pi'), { precision: 3 })).toBe('3.142')
    expect(formatResult(math.evaluate('1.23456'), { precision: 3 })).toBe('1.235')
  })
  it('可配置精度：0 位保留整数', () => {
    expect(formatResult(math.evaluate('1/3'), { precision: 0 })).toBe('0')
    expect(formatResult(math.evaluate('2.9'), { precision: 0 })).toBe('3')
  })
  it('可配置精度：位数少于原长时保留原样', () => {
    expect(formatResult(math.evaluate('0.13'), { precision: 3 })).toBe('0.13')
    expect(formatResult(math.evaluate('1.2'), { precision: 3 })).toBe('1.2')
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
  it('透传精度配置', () => {
    expect(safeEval('1/3', {}, { precision: 3 })).toEqual({ ok: true, value: '0.333' })
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

describe('wrapText 画布折行', () => {
  // 等宽假设：每字符 10px，maxWidth=100 即每行 10 字符
  const mono = (s) => [...s].length * 10
  it('未超宽时原样返回单行', () => {
    expect(wrapText('1234+5678', 100, mono)).toEqual(['1234+5678'])
  })
  it('超宽时按宽度折行', () => {
    expect(wrapText('1111+2222+3333', 100, mono)).toEqual(['1111+2222+', '3333'])
  })
  it('无断点字符时硬断，不丢字符', () => {
    const out = wrapText('aaaaaaaaaaa', 100, mono)
    expect(out.join('')).toBe('aaaaaaaaaaa')
    expect(out.length).toBe(2)
  })
  it('空串与空宽度的边界', () => {
    expect(wrapText('', 100, mono)).toEqual([''])
    expect(wrapText('123', 0, mono)).toEqual(['123'])
    expect(wrapText(null, 100, mono)).toEqual([''])
  })
})

describe('nextUpRecall 底部输入框 ↑ 三级阶梯', () => {
  // 三行数据：两条计算行 + 一条赋值行
  const lines = () => [
    { expr: '12*3', result: '36', partial: false },
    { expr: 'total = 10+5', result: '15', partial: false },
    { expr: '', result: '', partial: false },
  ]

  it('第一级填上一个结果（原始值，不带千分位）', () => {
    const r = nextUpRecall({ boxText: '', stage: 0, filled: '' }, lines())
    expect(r).toEqual({ stage: 1, text: '15', jumpTo: -1 })
  })

  it('第二级填上一个公式原文', () => {
    const r = nextUpRecall({ boxText: '15', stage: 1, filled: '15' }, lines())
    expect(r).toEqual({ stage: 2, text: 'total = 10+5', jumpTo: -1 })
  })

  it('第三级跳进历史行（末条有内容的行号，跳过末尾空行）', () => {
    const r = nextUpRecall({ boxText: 'total = 10+5', stage: 2, filled: 'total = 10+5' }, lines())
    expect(r).toEqual({ stage: 0, text: null, jumpTo: 1 })
  })

  it('锚点取最后一条有内容的行，结果与公式来自同一行', () => {
    const ls = [
      { expr: '1+1', result: '2', partial: false },
      { expr: '5*5', result: '25', partial: false },
    ]
    const a = nextUpRecall({ boxText: '', stage: 0, filled: '' }, ls)
    expect(a.text).toBe('25')
    const b = nextUpRecall({ boxText: '25', stage: 1, filled: '25' }, ls)
    expect(b.text).toBe('5*5')
  })

  it('末行是错误行时跳过结果级，直接给公式', () => {
    const ls = [{ expr: '1+1', result: '2', partial: false }, { expr: '1/0', result: '错误', partial: false }]
    const r = nextUpRecall({ boxText: '', stage: 0, filled: '' }, ls)
    expect(r).toEqual({ stage: 2, text: '1/0', jumpTo: -1 })
  })

  it('表达式不完整的半截结果不当作上一个结果', () => {
    const ls = [{ expr: '12+', result: '12', partial: true }]
    const r = nextUpRecall({ boxText: '', stage: 0, filled: '' }, ls)
    expect(r).toEqual({ stage: 2, text: '12+', jumpTo: -1 })
  })

  it('用户手打的内容不被覆盖，直接按内容命中历史行', () => {
    const ls = [{ expr: '1+1', result: '2', partial: false }, { expr: '2+2', result: '4', partial: false }]
    const r = nextUpRecall({ boxText: '1+1', stage: 0, filled: '' }, ls)
    expect(r).toEqual({ stage: 0, text: null, jumpTo: 0 })
  })

  it('手打内容命中不了时落到末行', () => {
    const ls = [{ expr: '1+1', result: '2', partial: false }]
    const r = nextUpRecall({ boxText: '999', stage: 0, filled: '' }, ls)
    expect(r).toEqual({ stage: 0, text: null, jumpTo: 0 })
  })

  it('召回后被用户改写（内容与 filled 不一致）则退出阶梯', () => {
    const ls = [{ expr: '1+1', result: '2', partial: false }]
    const r = nextUpRecall({ boxText: '2.5', stage: 1, filled: '2' }, ls)
    expect(r.jumpTo).toBe(0)
    expect(r.text).toBe(null)
  })

  it('没有任何公式时：有空行跳末行，没行不动', () => {
    expect(nextUpRecall({ boxText: '', stage: 0, filled: '' }, [{ expr: '' }])).toEqual({ stage: 0, text: null, jumpTo: 0 })
    expect(nextUpRecall({ boxText: '', stage: 0, filled: '' }, [])).toEqual({ stage: 0, text: null, jumpTo: -1 })
  })

  it('非法入参不抛错', () => {
    expect(nextUpRecall(null, null)).toEqual({ stage: 0, text: null, jumpTo: -1 })
    expect(nextUpRecall({}, [])).toEqual({ stage: 0, text: null, jumpTo: -1 })
  })
})

describe('nextUpRecall 非可用结果不进入结果级', () => {
  it('1/0 得到 Infinity 时跳过结果级给公式', () => {
    const ls = [{ expr: '1/0', result: 'Infinity', partial: false }]
    expect(nextUpRecall({ boxText: '', stage: 0, filled: '' }, ls)).toEqual({ stage: 2, text: '1/0', jumpTo: -1 })
  })
  it('-Infinity / NaN 同样跳过', () => {
    expect(nextUpRecall({ boxText: '', stage: 0, filled: '' }, [{ expr: '-1/0', result: '-Infinity' }]).text).toBe('-1/0')
    expect(nextUpRecall({ boxText: '', stage: 0, filled: '' }, [{ expr: '0/0', result: 'NaN' }]).text).toBe('0/0')
  })
  it('未定义符号的错误行同样跳过', () => {
    const ls = [{ expr: 'abc+1', result: '错误', partial: false }]
    expect(nextUpRecall({ boxText: '', stage: 0, filled: '' }, ls)).toEqual({ stage: 2, text: 'abc+1', jumpTo: -1 })
  })
})
