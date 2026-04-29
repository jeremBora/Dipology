import { computeRsi, MIN_BARS } from '@/lib/rsi'
import { NextRequest } from 'next/server'

export const runtime = 'edge'

const FUTURES = 'https://fapi.binance.com'
const SPOT    = 'https://api.binance.com'

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'application/json',
}

async function fetchCloses(symbol: string, interval: string, limit: number): Promise<number[]> {
  const url = `${FUTURES}/fapi/v1/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`
  const res = await fetch(url, { headers: HEADERS, next: { revalidate: 30 } })
  if (!res.ok) throw new Error(`klines ${symbol} ${interval}: ${res.status}`)
  const rows: number[][] = await res.json()
  return rows.map((r) => parseFloat(r[4] as unknown as string))
}

async function fetchFuturesVol(symbol: string): Promise<number> {
  try {
    const url = `${FUTURES}/fapi/v1/ticker/24hr?symbol=${symbol}`
    const res = await fetch(url, { headers: HEADERS, next: { revalidate: 30 } })
    if (!res.ok) return 0
    const data = await res.json()
    return parseFloat(data.quoteVolume) || 0
  } catch { return 0 }
}

async function fetchSpotVol(symbol: string): Promise<number | null> {
  try {
    const url = `${SPOT}/api/v3/ticker/24hr?symbol=${symbol}`
    const res = await fetch(url, { headers: HEADERS, next: { revalidate: 30 } })
    if (!res.ok) return null
    const data = await res.json()
    const v = parseFloat(data.quoteVolume)
    return isNaN(v) || v === 0 ? null : v
  } catch { return null }
}

// ── USDT Dominance via CoinGecko ─────────────────────────────────────────────
// Calculates USDT.D = USDT market cap / total crypto market cap
// Returns daily closes of dominance percentage over 90 days
async function fetchUsdtDominanceCloses(): Promise<{ daily: number[]; weekly: number[] }> {
  try {
    // Fetch USDT market cap history (90 days = daily data)
    const [usdtRes, globalRes] = await Promise.all([
      fetch('https://api.coingecko.com/api/v3/coins/tether/market_chart?vs_currency=usd&days=90&interval=daily', {
        next: { revalidate: 3600 }
      }),
      fetch('https://api.coingecko.com/api/v3/global', {
        next: { revalidate: 3600 }
      })
    ])

    if (!usdtRes.ok || !globalRes.ok) throw new Error('CoinGecko error')

    const usdtData = await usdtRes.json()
    const globalData = await globalRes.json()

    // Get total market cap history (also 90 days)
    const totalRes = await fetch(
      'https://api.coingecko.com/api/v3/global/market_cap_chart?days=90',
      { next: { revalidate: 3600 } }
    )

    let dominanceCloses: number[] = []

    if (totalRes.ok) {
      const totalData = await totalRes.json()
      const usdtMcaps: [number, number][] = usdtData.market_caps || []
      const totalMcaps: [number, number][] = totalData.market_cap_chart?.market_cap || []

      // Align by index (both should be same length ~90)
      const minLen = Math.min(usdtMcaps.length, totalMcaps.length)
      for (let i = 0; i < minLen; i++) {
        const usdtMc = usdtMcaps[i][1]
        const totalMc = totalMcaps[i][1]
        if (totalMc > 0) {
          dominanceCloses.push((usdtMc / totalMc) * 100)
        }
      }
    } else {
      // Fallback: use CoinGecko global dominance for current + estimate history from USDT mcap trend
      const currentDominance = globalData.data?.market_cap_percentage?.usdt || 5
      const usdtMcaps: [number, number][] = usdtData.market_caps || []
      // Approximate dominance using ratio to current known value
      const currentUsdtMc = usdtMcaps[usdtMcaps.length - 1]?.[1] || 1
      dominanceCloses = usdtMcaps.map(([, mc]) => (mc / currentUsdtMc) * currentDominance)
    }

    // Build weekly from daily (take every 7th point)
    const weeklyCloses: number[] = []
    for (let i = 0; i < dominanceCloses.length; i += 7) {
      weeklyCloses.push(dominanceCloses[i])
    }
    // Add last value as "live"
    if (dominanceCloses.length > 0) {
      weeklyCloses.push(dominanceCloses[dominanceCloses.length - 1])
    }

    return { daily: dominanceCloses, weekly: weeklyCloses }
  } catch {
    return { daily: [], weekly: [] }
  }
}

export async function GET(req: NextRequest) {
  const symbol = req.nextUrl.searchParams.get('symbol')
  if (!symbol) return Response.json({ error: 'symbol required' }, { status: 400 })

  // Special case: USDT Dominance
  if (symbol === 'USDT.D') {
    try {
      const { daily, weekly } = await fetchUsdtDominanceCloses()
      const rsiD = computeRsi(daily, 14, MIN_BARS.D)
      const rsiW = computeRsi(weekly, 14, MIN_BARS.W)
      return Response.json({
        symbol: 'USDT.D',
        daily: rsiD,
        weekly: rsiW,
        vol24h: 0,
        volSpot: null,
        spotRatio: null,
        ratioFS: null,
        spotRatioPct: null,
        ratioFSPct: null,
        incomplete: rsiD.incomplete || rsiW.incomplete,
        isSpecial: true,
      })
    } catch (err) {
      return Response.json({ error: String(err) }, { status: 500 })
    }
  }

  try {
    const [dailyCloses, weeklyCloses, volFutures, volSpot] = await Promise.all([
      fetchCloses(symbol, '1d', 60),
      fetchCloses(symbol, '1w', 40),
      fetchFuturesVol(symbol),
      fetchSpotVol(symbol),
    ])

    const rsiD = computeRsi(dailyCloses, 14, MIN_BARS.D)
    const rsiW = computeRsi(weeklyCloses, 14, MIN_BARS.W)
    const incomplete = rsiD.incomplete || rsiW.incomplete

    const spotRatio = (volSpot !== null && volSpot > 0 && volFutures > 0)
      ? (volSpot / (volSpot + volFutures)) * 100
      : null

    const ratioFS = (volSpot !== null && volSpot > 0 && volFutures > 0)
      ? volFutures / volSpot
      : null

    return Response.json({
      symbol,
      daily:      rsiD,
      weekly:     rsiW,
      vol24h:     volFutures,
      volSpot,
      spotRatio,
      ratioFS,
      spotRatioPct: null,
      ratioFSPct:   null,
      incomplete,
    })
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 })
  }
}
