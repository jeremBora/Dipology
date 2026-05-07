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

const SPOT_DELISTED = new Set(['XMR', 'BCHSV', 'NPXS'])
const RWA_SYMBOLS = new Set(['PAXGUSDT', 'XAUTUSDT', 'ONDOUSDT', 'POLYXUSDT', 'CFGUSDT', 'MPLUSDT', 'TRUUSDT', 'CPOOLUSDT'])
const STABLECOINS = ['usdt', 'usdc', 'dai', 'busd', 'fdusd', 'tusd', 'usdp', 'gusd', 'usde', 'pyusd']

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
  const base = symbol.replace('USDT', '')
  if (SPOT_DELISTED.has(base)) return null
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

// ── USDT.D avec historique RSI (méthode TradingView) ─────────────────────────
async function fetchUsdtDominanceWithRSI(): Promise<{
  dominance: number
  dailyCloses: number[]
  weeklyCloses: number[]
}> {
  try {
    const [usdtRes, totalRes, globalRes] = await Promise.all([
      fetch(`${COINGECKO}/coins/tether/market_chart?vs_currency=usd&days=90&interval=daily`, { next: { revalidate: 1800 } }),
      fetch(`${COINGECKO}/global/market_cap_chart?days=90`, { next: { revalidate: 1800 } }),
      fetch(`${COINGECKO}/global`, { next: { revalidate: 1800 } }),
    ])

    if (!globalRes.ok) throw new Error('CoinGecko error')

    const globalData = await globalRes.json()
    const marketCapPct: Record<string, number> = globalData.data?.market_cap_percentage ?? {}
    const currentTotal: number = globalData.data?.total_market_cap?.usd ?? 0

    // Dominance actuelle méthode TradingView
    let stableMcap = 0
    for (const s of STABLECOINS) {
      stableMcap += ((marketCapPct[s] ?? 0) / 100) * currentTotal
    }
    const denominator = currentTotal - stableMcap
    // STABLES.D = somme de tous les stablecoins / (total - stablecoins)
    let stablesMcapCurrent = 0
    for (const s of STABLECOINS) {
      stablesMcapCurrent += ((marketCapPct[s] ?? 0) / 100) * currentTotal
    }
    const dominance = denominator > 0 ? Math.round((stablesMcapCurrent / denominator) * 10000) / 100 : 0

    // Historique dominance journalier
    let dailyCloses: number[] = []

    if (usdtRes.ok) {
      const usdtData = await usdtRes.json()
      const usdtMcaps: [number, number][] = usdtData.market_caps || []
      // Utilise le ratio actuel dominance/mcapUSDT pour reconstruire l'historique
      const currentUsdtMc = usdtMcaps[usdtMcaps.length - 1]?.[1] || 1
      // Approximation historique basée sur USDT mcap scalée à la dominance actuelle
      for (let i = 0; i < usdtMcaps.length; i++) {
        const usdtMc = usdtMcaps[i][1]
        const approxDom = (usdtMc / currentUsdtMc) * dominance
        dailyCloses.push(Math.round(approxDom * 100) / 100)
      }
    }

    // Weekly = 1 point tous les 7 jours
    const weeklyCloses: number[] = []
    for (let i = 0; i < dailyCloses.length; i += 7) {
      weeklyCloses.push(dailyCloses[i])
    }
    // Ajoute le dernier point comme live
    if (dailyCloses.length > 0 && weeklyCloses[weeklyCloses.length-1] !== dailyCloses[dailyCloses.length-1]) {
      weeklyCloses.push(dailyCloses[dailyCloses.length - 1])
    }

    return { dominance, dailyCloses, weeklyCloses }
  } catch (err) {
    console.error('USDT.D error:', err)
    return { dominance: 0, dailyCloses: [], weeklyCloses: [] }
  }
}

// ── Agrégation volumes CoinGecko ─────────────────────────────────────────────
let cgVolumeCache: Map<string, number> = new Map()
let cgVolumeCacheTime = 0
const CG_CACHE_TTL = 30 * 60 * 1000

async function fetchCoinGeckoVolumes(): Promise<Map<string, number>> {
  const now = Date.now()
  if (cgVolumeCache.size > 0 && now - cgVolumeCacheTime < CG_CACHE_TTL) {
    return cgVolumeCache
  }
  const map = new Map<string, number>()
  try {
    const pages = await Promise.all([
      fetch(`${COINGECKO}/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=250&page=1&sparkline=false`, { next: { revalidate: 1800 } }),
      fetch(`${COINGECKO}/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=250&page=2&sparkline=false`, { next: { revalidate: 1800 } }),
    ])
    for (const res of pages) {
      if (!res.ok) continue
      const coins = await res.json()
      for (const coin of coins) {
        if (coin.symbol && coin.total_volume) {
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
      const { dominance, dailyCloses, weeklyCloses } = await fetchUsdtDominanceWithRSI()

      // Calcul RSI sur l'historique de dominance — seuil abaissé à 20
      const rsiD = dailyCloses.length >= 20
        ? computeRsi(dailyCloses, 14, 20)
        : { history: [], live: null, score: null, count: 0, incomplete: true }

      const rsiW = weeklyCloses.length >= 3
        ? computeRsi(weeklyCloses, 3, 3)
        : { history: [], live: null, score: null, count: 0, incomplete: true }

      return Response.json({
        symbol: 'USDT.D',
        daily:  rsiD,
        weekly: rsiW,
        vol24h: 0,
        volSpot: null,
        spotRatio: null,
        ratioFS: null,
        spotRatioPct: null,
        ratioFSPct: null,
        incomplete: false,
        isSpecial: true,
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

    const spotRatio = (!isRWA && volSpot !== null && volSpot > 0 && volFutures > 0)
      ? (volSpot / (volSpot + volFutures)) * 100
      : null

    const ratioFS = (!isRWA && volSpot !== null && volSpot > 0 && volFutures > 0)
      ? volFutures / volSpot
      : null

    const volAllExchanges = cgVolumes.get(base) ?? null

    return Response.json({
      symbol,
      daily: rsiD,
      weekly: rsiW,
      vol24h: volFutures,
      volSpot: isRWA ? null : volSpot,
      volAllExchanges,
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
 
 
 
 
