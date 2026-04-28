import { NextRequest, NextResponse } from 'next/server'
import { computeRsi, computeBuyZoneDaily, computeS1, MIN_BARS } from '@/lib/rsi'

export const runtime = 'edge'

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  'Accept': 'application/json',
}

async function fetchKlines(symbol: string, interval: string, limit: number) {
  const url = `https://fapi.binance.com/fapi/v1/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`
  const res = await fetch(url, { headers: HEADERS, cache: 'no-store' })
  if (!res.ok) throw new Error(`Binance klines ${symbol} ${interval}: ${res.status}`)
  const rows: number[][] = await res.json()
  return {
    timestamps: rows.map(r => r[0]),           // timestamp d'ouverture en ms
    opens:      rows.map(r => parseFloat(String(r[1]))),
    highs:      rows.map(r => parseFloat(String(r[2]))),
    lows:       rows.map(r => parseFloat(String(r[3]))),
    closes:     rows.map(r => parseFloat(String(r[4]))),
  }
}

async function fetchVolume24h(symbol: string): Promise<number> {
  const url = `https://fapi.binance.com/fapi/v1/ticker/24hr?symbol=${symbol}`
  const res = await fetch(url, { headers: HEADERS, cache: 'no-store' })
  if (!res.ok) return 0
  const data = await res.json()
  return parseFloat(data.quoteVolume)
}

export async function GET(req: NextRequest) {
  const symbol = req.nextUrl.searchParams.get('symbol')
  if (!symbol) return NextResponse.json({ error: 'symbol required' }, { status: 400 })

  try {
    const [daily, weekly, vol24h] = await Promise.all([
      fetchKlines(symbol, '1d', 200),
      fetchKlines(symbol, '1w', 100),
      fetchVolume24h(symbol),
    ])

    const rsiD = computeRsi(daily.closes,  14, MIN_BARS.D)
    const rsiW = computeRsi(weekly.closes, 14, MIN_BARS.W)

    const { daily: bzDaily, dailyCount } = computeBuyZoneDaily(
      daily.closes,
      daily.highs,
      daily.lows,
      daily.timestamps,
      weekly.closes,
      weekly.highs,
      weekly.lows,
      weekly.timestamps,
    )

    const currentPrice = daily.closes[daily.closes.length - 1]
    const pivot = computeS1(daily.highs, daily.lows, daily.closes, currentPrice)

    return NextResponse.json({
      symbol,
      daily:   rsiD,
      weekly:  rsiW,
      buyZone: {
        daily:       bzDaily,
        weekly:      false,
        dailyCount,
        weeklyCount: 0,
      },
      pivot,
      vol24h,
      incomplete: rsiD.incomplete || rsiW.incomplete,
      currentPrice,
    })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
