import { computeRsi, MIN_BARS } from '@/lib/rsi'
import { NextRequest } from 'next/server'

export const runtime = 'edge'

const FUTURES = 'https://fapi.binance.com'
const SPOT    = 'https://api.binance.com'

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
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

// USDT Dominance — just current value from CoinGecko global
async function fetchUsdtDominance(): Promise<{ dominance: number; change7d: number | null }> {
  try {
    const res = await fetch('https://api.coingecko.com/api/v3/global', {
      next: { revalidate: 1800 }
    })
    if (!res.ok) throw new Error('CoinGecko error')
    const data = await res.json()
    const dominance = data.data?.market_cap_percentage?.usdt ?? 0
    return { dominance, change7d: null }
  } catch {
    return { dominance: 0, change7d: null }
  }
}

export async function GET(req: NextRequest) {
  const symbol = req.nextUrl.searchParams.get('symbol')
  if (!symbol) return Response.json({ error: 'symbol required' }, { status: 400 })

  // Special case: USDT Dominance — just show current value, no RSI
  if (symbol === 'USDT.D') {
    try {
      const { dominance } = await fetchUsdtDominance()
      return Response.json({
        symbol: 'USDT.D',
        daily:   { history: [], live: null, score: null, count: 0, incomplete: false },
        weekly:  { history: [], live: null, score: null, count: 0, incomplete: false },
        vol24h: 0,
        volSpot: null,
        spotRatio: null,
        ratioFS: null,
        spotRatioPct: null,
        ratioFSPct: null,
        incomplete: false,
        isSpecial: true,
        dominance, // current USDT dominance %
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
      daily: rsiD,
      weekly: rsiW,
      vol24h: volFutures,
      volSpot,
      spotRatio,
      ratioFS,
      spotRatioPct: null,
      ratioFSPct: null,
      incomplete,
    })
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 })
  }
}
