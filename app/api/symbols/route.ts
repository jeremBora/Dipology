export const runtime = 'edge'

export async function GET() {
  try {
    const res = await fetch(
      'https://fapi.binance.com/fapi/v1/exchangeInfo',
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'application/json',
        },
        next: { revalidate: 300 },
      }
    )
    if (!res.ok) throw new Error(`Binance exchangeInfo: ${res.status}`)
    const data = await res.json()

    // Match exactly what Binance Futures screener shows:
    // All USDT-quoted symbols that are TRADING, regardless of contractType
    const symbols: string[] = data.symbols
      .filter((s: { symbol: string; quoteAsset: string; status: string; contractType: string }) =>
        s.quoteAsset === 'USDT' &&
        s.status === 'TRADING'
      )
      .map((s: { symbol: string }) => s.symbol)
      .sort()

    return Response.json({ symbols, total: symbols.length })
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 })
  }
}
