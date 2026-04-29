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

export async function GET(req: NextRequest) {
  const symbol = req.nextUrl.searchParams.get('symbol')
  if (!symbol) return Response.json({ error: 'symbol required' }, { status: 400 })

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

    // Spot Ratio = volSpot / (volSpot + volFutures) * 100
    const spotRatio = (volSpot !== null && volSpot > 0 && volFutures > 0)
      ? (volSpot / (volSpot + volFutures)) * 100
      : null

    // Ratio F/S = volFutures / volSpot
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
      incomplete,
    })
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 })
  }
}
