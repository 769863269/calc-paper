import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { fetchRateSources, fmtRateTime, RATE_SOURCES } from './rate.js'

// 汇率模块唯一的失败模式是「联网」，所以这里全程替换 fetch。
// 每个用例按 URL 分发响应，借此断言降级链真的按顺序走、失败真的被吞掉。
const ok = (body) => ({ ok: true, json: async () => body })
const http500 = () => ({ ok: false, json: async () => ({}) })

let calls = []

// 按「第 N 个源」构造响应序列；未列出的源一律 HTTP 500
function stubSources(map) {
  calls = []
  vi.stubGlobal('fetch', async (url) => {
    calls.push(url)
    for (const [kw, res] of Object.entries(map)) {
      if (url.includes(kw)) {
        if (res instanceof Error) throw res
        if (typeof res === 'function') return res()
        return res
      }
    }
    return http500()
  })
}

afterEach(() => {
  vi.unstubAllGlobals()
  calls = []
})

describe('fetchRateSources 降级链', () => {
  it('首个源可用时直接用，不做多余请求', async () => {
    stubSources({
      'open.er-api.com': ok({
        rates: { CNY: 7.1234 },
        time_last_update_utc: 'Tue, 05 Nov 2024 00:02:31 +0000',
        time_next_update_utc: 'Wed, 06 Nov 2024 00:02:31 +0000'
      })
    })
    const r = await fetchRateSources()
    expect(r.source).toBe('open.er-api.com')
    expect(r.rate).toBe('7.123400')          // 统一六位小数，UI 直接显示
    expect(r.time).toContain('2024')
    expect(calls).toHaveLength(1)            // 中途不浪费配额
  })

  it('首源 HTTP 500 时降级到 ECB，并用数据日期推算更新/下次更新', async () => {
    stubSources({
      'open.er-api.com': http500(),
      'frankfurter.app': ok({ rates: { CNY: 7.2 }, date: '2024-11-04' })
    })
    const r = await fetchRateSources()
    expect(r.source).toBe('ECB 欧洲央行')
    expect(r.rate).toBe('7.200000')
    // ECB 只给日期：当天 00:00 UTC 当更新时间，+24h 当下次更新
    expect(r.time).toBe('2024-11-04T00:00:00.000Z')
    expect(r.nextUpdate).toBe('2024-11-05T00:00:00.000Z')
  })

  it('前两源网络异常（超时/断网）时降级到第三个源', async () => {
    stubSources({
      'open.er-api.com': new Error('timeout'),
      'frankfurter.app': new Error('ECONNRESET'),
      'exchangerate-api.com': ok({ rates: { CNY: 7.05 }, time_last_update_utc: 'x', time_next_update_utc: 'y' })
    })
    const r = await fetchRateSources()
    expect(r.source).toBe('exchangerate-api.com')
    expect(r.rate).toBe('7.050000')
    expect(calls).toHaveLength(3)
  })

  it('三源全挂时抛错，交给上层提示重试', async () => {
    stubSources({})
    await expect(fetchRateSources()).rejects.toThrow('all sources failed')
    expect(calls).toHaveLength(RATE_SOURCES.length)
  })

  it('200 但缺 rates.CNY 视作失败，继续降级而不是返回 undefined', async () => {
    stubSources({
      'open.er-api.com': ok({ rates: { EUR: 0.9 } }),   // 只有 EUR，没有 CNY
      'frankfurter.app': ok({ rates: { CNY: 7.18 }, date: '2024-11-04' })
    })
    const r = await fetchRateSources()
    expect(r.source).toBe('ECB 欧洲央行')
    expect(r.rate).toBe('7.180000')
  })

  it('汇率不是有限数字时降级，绝不把 NaN 当结果填进公式框', async () => {
    stubSources({
      'open.er-api.com': ok({ rates: { CNY: 'N/A' } }),
      'frankfurter.app': ok({ rates: { CNY: 7.15 }, date: '2024-11-04' })
    })
    const r = await fetchRateSources()
    expect(r.source).toBe('ECB 欧洲央行')
    expect(r.rate).toBe('7.150000')
    expect(r.rate).not.toBe('NaN')
  })

  it('三源均为非数字汇率的极端情况仍然抛错，而不是返回 NaN', async () => {
    stubSources({
      'open.er-api.com': ok({ rates: { CNY: null } }),
      'frankfurter.app': ok({ rates: { CNY: 'undefined' } }),
      'exchangerate-api.com': ok({ rates: { CNY: {} } })
    })
    await expect(fetchRateSources()).rejects.toThrow('all sources failed')
  })

  it('每个源的请求地址与降级顺序一致', async () => {
    stubSources({})
    await expect(fetchRateSources()).rejects.toThrow()
    expect(calls[0]).toContain('open.er-api.com/v6/latest/USD')
    expect(calls[1]).toContain('frankfurter.app/latest?from=USD&to=CNY')
    expect(calls[2]).toContain('exchangerate-api.com/v4/latest/USD')
  })
})

describe('fmtRateTime', () => {
  it('空值显示破折号', async () => {
    expect(fmtRateTime('')).toBe('—')
    expect(fmtRateTime(null)).toBe('—')
    expect(fmtRateTime(undefined)).toBe('—')
  })

  it('无法解析的字符串原样返回，不显示 Invalid Date', async () => {
    expect(fmtRateTime('not-a-date')).toBe('not-a-date')
    expect(fmtRateTime('2024-13-45')).toBe('2024-13-45')
  })

  it('合法时间戳转成中文可读格式', async () => {
    const s = fmtRateTime('2024-11-04T00:00:00.000Z')
    expect(s).toContain('2024')
    expect(s).toContain('11')
    expect(s).toMatch(/\d{1,2}:\d{2}/)   // 带时分，不依赖具体时区
    expect(s).not.toBe('2024-11-04T00:00:00.000Z')
  })
})

describe('RATE_SOURCES 结构', () => {
  it('每个源都有名称与 get 方法，名称不重复', async () => {
    const names = RATE_SOURCES.map((s) => s.name)
    expect(new Set(names).size).toBe(names.length)
    for (const s of RATE_SOURCES) {
      expect(typeof s.name).toBe('string')
      expect(s.name.length).toBeGreaterThan(0)
      expect(typeof s.get).toBe('function')
    }
  })
})
