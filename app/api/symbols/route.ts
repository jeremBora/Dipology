import { NextResponse } from 'next/server'

export const runtime = 'edge'

export async function GET() {
  try {
    const res = await fetch('https://fapi.binance.com/fapi/v1/exchangeInfo', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json',
      },
      cache: 'no-store',
    })
    if (!res.ok) throw new Error(`Binance exchangeInfo: ${res.status}`)
    const data = await res.json()

    const symbols: string[] = data.symbols
      .filter(
        (s: { symbol: string; quoteAsset: string; contractType: string; status: string }) =>
          s.quoteAsset === 'USDT' &&
          s.contractType === 'PERPETUAL' &&
          s.status === 'TRADING'
      )
      .map((s: { symbol: string }) => s.symbol)
      .sort()

    return NextResponse.json({ symbols, total: symbols.length })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
