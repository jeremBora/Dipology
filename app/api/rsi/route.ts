import { computeRsi, MIN_BARS } from '@/lib/rsi'
import { NextRequest } from 'next/server'

export const runtime = 'edge'

const FUTURES = 'https://fapi.binance.com'
const SPOT    = 'https://api.binance.com'
const COINGECKO = 'https://api.coingecko.com/api/v3'

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  'Accept': 'application/json',
}

// Tokens délistés du spot Binance — ne pas chercher leur vol spot
const SPOT_DELISTED = new Set(['XMR', 'BCHSV', 'NPXS'])

// Catégories RWA — pas de vol spot/futures pertinent
const RWA_SYMBOLS = new Set([
  'PAXGUSDT', 'XAUTUSDT', 'ONDOUSDT', 'POLYXUSDT',
  'CFGUSDT', 'MPLUSDT', 'TRUUSDT', 'CPOOLUSDT',
])

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
  // Skip tokens délistés du spot Binance
  const base = symbol.replace('USDT', '')
  if (SPOT_DELISTED.has(base)) return null

  // Skip RWA — pas pertinent
  if (RWA_SYMBOLS.has(symbol)) return null

  try {
    const url = `${SPOT}/api/v3/ticker/24hr?symbol=${symbol}`
    const res = await fetch(url, { headers: HEADERS, next: { revalidate: 30 } })
    if (!res.ok) return null
    const data = await res.json()
    const v = parseFloat(data.quoteVolume)
    return isNaN(v) || v === 0 ? null : v
  } catch { return null }
}

// ── USDT.D — méthode TradingView ─────────────────────────────────────────────
// USDT.D = market cap USDT / (total market cap - stablecoins market cap)
async function fetchUsdtDominanceTradingView(): Promise<number> {
  try {
    const res = await fetch(`${COINGECKO}/global`, { next: { revalidate: 1800 } })
    if (!res.ok) throw new Error('CoinGecko global error')
    const data = await res.json()

    const totalMarketCap: number = data.data?.total_market_cap?.usd ?? 0
    const marketCapPct: Record<string, number> = data.data?.market_cap_percentage ?? {}

    if (totalMarketCap === 0) throw new Error('Total market cap is 0')

    // Stablecoins à exclure du dénominateur (méthode TradingView)
    const stablecoins = ['usdt', 'usdc', 'dai', 'busd', 'fdusd', 'tusd', 'usdp', 'gusd', 'usde', 'pyusd']
    let stablecoinsMcap = 0
    for (const stable of stablecoins) {
      stablecoinsMcap += ((marketCapPct[stable] ?? 0) / 100) * totalMarketCap
    }

    const denominator = totalMarketCap - stablecoinsMcap
    if (denominator <= 0) throw new Error('Denominator is 0')

    const usdtMcap = ((marketCapPct['usdt'] ?? 0) / 100) * totalMarketCap
    const dominance = (usdtMcap / denominator) * 100

    return Math.round(dominance * 100) / 100
  } catch (err) {
    console.error('USDT.D error:', err)
    return 0
  }
}

// ── Agrégation volumes CoinGecko (tous CEX confondus) ────────────────────────
// Cache serveur 30 min — 2 appels max toutes les 30 min pour 500 tokens
let cgVolumeCache: Map<string, number> = new Map()
let cgVolumeCacheTime = 0
const CG_CACHE_TTL = 30 * 60 * 1000 // 30 min

async function fetchCoinGeckoVolumes(): Promise<Map<string, number>> {
  const now = Date.now()
  if (cgVolumeCache.size > 0 && now - cgVolumeCacheTime < CG_CACHE_TTL) {
    return cgVolumeCache
  }

  const map = new Map<string, number>()
  try {
    // 2 pages de 250 = 500 tokens triés par market cap
    const pages = await Promise.all([
      fetch(`${COINGECKO}/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=250&page=1&sparkline=false`, { next: { revalidate: 1800 } }),
      fetch(`${COINGECKO}/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=250&page=2&sparkline=false`, { next: { revalidate: 1800 } }),
    ])

    for (const res of pages) {
      if (!res.ok) continue
      const coins = await res.json()
      for (const coin of coins) {
        if (coin.symbol && coin.total_volume) {
          // Clé = SYMBOL en majuscules (ex: BTC, ETH, SOL)
          map.set(coin.symbol.toUpperCase(), coin.total_volume)
        }
      }
    }

    cgVolumeCache = map
    cgVolumeCacheTime = now
  } catch (err) {
    console.error('CoinGecko volumes error:', err)
  }

  return map
}

export async function GET(req: NextRequest) {
  const symbol = req.nextUrl.searchParams.get('symbol')
  if (!symbol) return Response.json({ error: 'symbol required' }, { status: 400 })

  // ── USDT.D ────────────────────────────────────────────────────────────────
  if (symbol === 'USDT.D') {
    try {
      const dominance = await fetchUsdtDominanceTradingView()
      return Response.json({
        symbol: 'USDT.D',
        daily:   { history: [], live: null, score: null, count: 0, incomplete: false },
        weekly:  { history: [], live: null, score: null, count: 0, incomplete: false },
        vol24h: 0, volSpot: null,
        spotRatio: null, ratioFS: null,
        spotRatioPct: null, ratioFSPct: null,
        incomplete: false, isSpecial: true,
        dominance,
      })
    } catch (err) {
      return Response.json({ error: String(err) }, { status: 500 })
    }
  }

  // ── Contrats Binance Futures ──────────────────────────────────────────────
  try {
    const base = symbol.replace('USDT', '').replace(/^1000/, '')
    const isRWA = RWA_SYMBOLS.has(symbol)

    const [dailyCloses, weeklyCloses, volFutures, volSpot, cgVolumes] = await Promise.all([
      fetchCloses(symbol, '1d', 60),
      fetchCloses(symbol, '1w', 40),
      fetchFuturesVol(symbol),
      fetchSpotVol(symbol),
      fetchCoinGeckoVolumes(),
    ])

    const rsiD = computeRsi(dailyCloses, 14, MIN_BARS.D)
    const rsiW = computeRsi(weeklyCloses, 14, MIN_BARS.W)
    const incomplete = rsiD.incomplete || rsiW.incomplete

    // Spot Ratio + Ratio F/S — null pour RWA
    const spotRatio = (!isRWA && volSpot !== null && volSpot > 0 && volFutures > 0)
      ? (volSpot / (volSpot + volFutures)) * 100
      : null

    const ratioFS = (!isRWA && volSpot !== null && volSpot > 0 && volFutures > 0)
      ? volFutures / volSpot
      : null

    // Volume agrégé tous exchanges (CoinGecko)
    const volAllExchanges = cgVolumes.get(base) ?? null

    return Response.json({
      symbol,
      daily: rsiD,
      weekly: rsiW,
      vol24h: volFutures,
      volSpot: isRWA ? null : volSpot,
      volAllExchanges, // nouveau — volume total tous CEX/DEX
      spotRatio,
      ratioFS,
      spotRatioPct: null,
      ratioFSPct: null,
      incomplete,
      isRWA,
    })
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 })
  }
}
