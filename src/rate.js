// 汇率模块：多个免费公开源顺序降级取 USD→CNY 参考汇率。
// 不依赖 Vue，方便单测与复用。
async function getJson(url, timeout = 6000) {
  const res = await fetch(url, { signal: AbortSignal.timeout(timeout) })
  if (!res.ok) throw new Error('fail')
  return res.json()
}

// 取 USD→CNY 并校验成有限正数。
// 上游偶发把汇率给成 'N/A' / null / 空对象，这些值 Number() 之后是 NaN 或 0，
// 若直接 toFixed(6) 会产出字符串 "NaN"，既显示成「1 美元 = NaN 元」，
// 又会被填进底部公式框变成一条必然报错的公式。所以在这里就判失败，交给下一个源。
function pickCny(d) {
  const raw = d?.rates?.CNY
  if (raw === null || raw === undefined || raw === '') throw new Error('no cny')
  const n = Number(raw)
  if (!Number.isFinite(n) || n <= 0) throw new Error('bad cny')
  return n
}

export const RATE_SOURCES = [
  {
    name: 'open.er-api.com',
    async get() {
      const d = await getJson('https://open.er-api.com/v6/latest/USD')
      return {
        rate: Number(pickCny(d)).toFixed(6),
        time: d.time_last_update_utc || '',
        nextUpdate: d.time_next_update_utc || ''
      }
    }
  },
  {
    name: 'ECB 欧洲央行',
    async get() {
      const d = await getJson('https://api.frankfurter.app/latest?from=USD&to=CNY')
      const cny = pickCny(d)
      // ECB 只给数据日期，用日期 + 次日推「更新时间 / 下次更新」
      const date = d.date ? new Date(d.date + 'T00:00:00Z') : null
      return {
        rate: Number(cny).toFixed(6),
        time: date ? date.toISOString() : '',
        nextUpdate: date ? new Date(date.getTime() + 24 * 3600 * 1000).toISOString() : ''
      }
    }
  },
  {
    name: 'exchangerate-api.com',
    async get() {
      const d = await getJson('https://api.exchangerate-api.com/v4/latest/USD')
      return {
        rate: Number(pickCny(d)).toFixed(6),
        time: d.time_last_update_utc || '',
        nextUpdate: d.time_next_update_utc || ''
      }
    }
  }
]

// 顺序尝试所有源，任一成功即返回；全部失败抛错
export async function fetchRateSources() {
  for (const s of RATE_SOURCES) {
    try {
      const data = await s.get()
      return { source: s.name, ...data }
    } catch (e) { /* 换下一个源 */ }
  }
  throw new Error('all sources failed')
}

// 把时间戳格式化成中文本地时间；无法解析时原样返回
export function fmtRateTime(s) {
  if (!s) return '—'
  try {
    const d = new Date(s)
    if (Number.isNaN(d.getTime())) return s
    return d.toLocaleString('zh-CN', {
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hour12: false,
      timeZoneName: 'short'
    })
  } catch (e) { return s }
}
