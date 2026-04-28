// RSI / Momentum — réplication exacte PineScript Dipology System

export interface RsiResult {
  history:    (number | null)[]
  historyT:   (number | null)[]
  live:       number | null
  liveT:      number | null
  prev:       number | null
  prevT:      number | null
  score:      number | null
  count:      number
  incomplete: boolean
}

export interface BuyZoneResult {
  daily:      boolean
  dailyCount: number
}

export interface PivotResult {
  s1:           number | null
  priceUnderS1: boolean
}

const MIN_BARS_DAILY  = 30
const MIN_BARS_WEEKLY = 25
export const MIN_BARS = { D: MIN_BARS_DAILY, W: MIN_BARS_WEEKLY }

function calcRma(values: number[], period: number): number[] {
  const result: number[] = new Array(values.length).fill(NaN)
  if (values.length < period) return result
  let sum = 0
  for (let i = 0; i < period; i++) sum += values[i]
  result[period - 1] = sum / period
  const alpha = 1 / period
  for (let i = period; i < values.length; i++) {
    result[i] = alpha * values[i] + (1 - alpha) * result[i - 1]
  }
  return result
}

export function calcRsiSeries(closes: number[], period: number): (number | null)[] {
  if (closes.length < period + 1) return closes.map(() => null)
  const changes = closes.map((c, i) => (i === 0 ? 0 : c - closes[i - 1]))
  const rmaUp   = calcRma(changes.map(c => Math.max(c, 0)), period)
  const rmaDn   = calcRma(changes.map(c => Math.max(-c, 0)), period)
  return closes.map((_, i) => {
    const u = rmaUp[i], d = rmaDn[i]
    if (isNaN(u) || isNaN(d)) return null
    if (d === 0) return 100
    if (u === 0) return 0
    return 100 - 100 / (1 + u / d)
  })
}

export function calcRsiLive(confirmedCloses: number[], liveClose: number, period: number): number | null {
  if (confirmedCloses.length < period + 1) return null
  const changes = confirmedCloses.map((c, i) => (i === 0 ? 0 : c - confirmedCloses[i - 1]))
  const rmaUp  = calcRma(changes.map(c => Math.max(c, 0)), period)
  const rmaDn  = calcRma(changes.map(c => Math.max(-c, 0)), period)
  const lastUp = rmaUp[rmaUp.length - 1]
  const lastDn = rmaDn[rmaDn.length - 1]
  if (isNaN(lastUp) || isNaN(lastDn)) return null
  const chg   = liveClose - confirmedCloses[confirmedCloses.length - 1]
  const alpha = 1 / period
  const upNow = alpha * Math.max(chg, 0)  + (1 - alpha) * lastUp
  const dnNow = alpha * Math.max(-chg, 0) + (1 - alpha) * lastDn
  if (dnNow === 0) return 100
  if (upNow === 0) return 0
  return 100 - 100 / (1 + upNow / dnNow)
}

export function toTrendscore(v: number | null): number | null {
  if (v === null) return null
  return Math.round((v / 10) * 100) / 100
}

export function computeRsi(closes: number[], period: number, minBars: number): RsiResult {
  const incomplete = closes.length < minBars
  if (closes.length < period + 2) {
    return {
      history: Array(9).fill(null), historyT: Array(9).fill(null),
      live: null, liveT: null, prev: null, prevT: null,
      score: null, count: 0, incomplete: true,
    }
  }
  const confirmedCloses = closes.slice(0, -1)
  const liveClose       = closes[closes.length - 1]
  const series          = calcRsiSeries(confirmedCloses, period)
  const history: (number | null)[] = []
  for (let i = 9; i >= 1; i--) {
    const idx = series.length - i
    history.push(idx >= 0 ? (series[idx] ?? null) : null)
  }
  const prev  = series[series.length - 1] ?? null
  const live  = calcRsiLive(confirmedCloses, liveClose, period)
  const allV  = [...history.filter(v => v !== null) as number[], ...(live !== null ? [live] : [])]
  const count = allV.length
  const score = count > 0 ? (allV.reduce((a, b) => a + b, 0) / (count * 100)) * 100 : null
  return {
    history, historyT: history.map(toTrendscore),
    live,    liveT:    toTrendscore(live),
    prev,    prevT:    toTrendscore(prev),
    score, count, incomplete,
  }
}

function calcKijun(highs: number[], lows: number[], period: number): number[] {
  const result: number[] = new Array(highs.length).fill(NaN)
  for (let i = period - 1; i < highs.length; i++) {
    const h = Math.max(...highs.slice(i - period + 1, i + 1))
    const l = Math.min(...lows.slice(i - period + 1, i + 1))
    result[i] = (h + l) / 2
  }
  return result
}

// ─── Buy Zone Daily ───────────────────────────────────────────────────────────
//
// Réplication exacte du PineScript :
//
//   isDailyClose = timeframe.change("D")
//   if isDailyClose
//     if closeDaily > kijunDaily   ← close[i], kijun[i] de la barre qui vient de clore
//       if buyZone déjà actif      ← maintien sans revérifier RSI
//         count++
//       else
//         if rsiDaily > 60 AND rsiWeekly > 50   ← rsiDaily[i], rsiWeekly LIVE
//           activer
//     else
//       désactiver, count = 0
//
// Alignement daily↔weekly par timestamp :
//   Pour chaque barre daily[i], on cherche la dernière bougie weekly
//   dont le timestamp de CLÔTURE est <= timestamp de la barre daily[i].
//   C'est la bougie weekly "confirmée" disponible à ce moment.
//
export function computeBuyZoneDaily(
  dailyCloses:      number[],
  dailyHighs:       number[],
  dailyLows:        number[],
  dailyTimestamps:  number[],
  weeklyCloses:     number[],
  weeklyHighs:      number[],
  weeklyLows:       number[],
  weeklyTimestamps: number[],
  rsiPeriod:   number = 14,
  kijunPeriod: number = 26
): BuyZoneResult {

  if (
    dailyCloses.length < kijunPeriod + rsiPeriod + 5 ||
    weeklyCloses.length < rsiPeriod + 5
  ) {
    return { daily: false, dailyCount: 0 }
  }

  const kijunD     = calcKijun(dailyHighs, dailyLows, kijunPeriod)
  const rsiDSeries = calcRsiSeries(dailyCloses, rsiPeriod)

  // Timestamps de clôture weekly = timestamp_ouverture + 7 jours - 1ms
  // Une bougie weekly Binance ouvre le lundi 00:00 UTC
  // Elle est "confirmée" (clôturée) le dimanche 23:59 UTC
  // = weeklyTimestamps[w] + 7*24*3600*1000 - 1
  const MS_WEEK = 7 * 24 * 3600 * 1000

  // RSI Weekly confirmé barre par barre (on exclut la dernière = bougie en cours)
  const rsiWSeries = calcRsiSeries(weeklyCloses.slice(0, -1), rsiPeriod)

  // RSI Weekly LIVE (avec le prix de la dernière bougie weekly en cours)
  const rsiWLive = calcRsiLive(
    weeklyCloses.slice(0, -1),
    weeklyCloses[weeklyCloses.length - 1],
    rsiPeriod
  ) ?? 0

  // Pour chaque barre daily, trouver le RSI weekly applicable
  // = RSI de la dernière bougie weekly CONFIRMÉE à cette date
  function getRsiWeeklyAt(dailyTs: number, isLastDaily: boolean): number {
    // La dernière barre daily = on utilise le RSI Weekly LIVE
    if (isLastDaily) return rsiWLive

    // Sinon : trouver la dernière bougie weekly dont la CLÔTURE est avant dailyTs
    // Clôture weekly[w] = weeklyTimestamps[w] + MS_WEEK
    let bestIdx = -1
    for (let w = 0; w < weeklyTimestamps.length - 1; w++) {
      const weeklyClose = weeklyTimestamps[w] + MS_WEEK
      if (weeklyClose <= dailyTs) {
        bestIdx = w
      } else {
        break
      }
    }
    if (bestIdx < 0) return 0
    return rsiWSeries[bestIdx] ?? 0
  }

  let buyZone = false
  let count   = 0
  const startIdx = Math.max(kijunPeriod - 1, rsiPeriod)

  for (let i = startIdx; i < dailyCloses.length; i++) {
    const isLast     = (i === dailyCloses.length - 1)
    const closeD     = dailyCloses[i]
    const kijunVal   = kijunD[i]
    const rsiD       = rsiDSeries[i] ?? 0
    const rsiW       = getRsiWeeklyAt(dailyTimestamps[i], isLast)

    if (isNaN(kijunVal)) continue

    if (closeD > kijunVal) {
      if (buyZone) {
        count++
      } else {
        if (rsiD > 60 && rsiW > 50) {
          buyZone = true
          count   = 1
        }
      }
    } else {
      buyZone = false
      count   = 0
    }
  }

  return { daily: buyZone, dailyCount: count }
}

export function computeS1(
  dailyHighs:   number[],
  dailyLows:    number[],
  dailyCloses:  number[],
  currentPrice: number
): PivotResult {
  if (dailyCloses.length < 2) return { s1: null, priceUnderS1: false }
  const h = dailyHighs[dailyHighs.length - 2]
  const l = dailyLows[dailyLows.length - 2]
  const c = dailyCloses[dailyCloses.length - 2]
  const pivot = (h + l + c) / 3
  const s1    = 2 * pivot - h
  return { s1, priceUnderS1: currentPrice < s1 }
}

export function rsiColor(v: number): string {
  if (v >= 90) return 'rgb(5,88,5)'
  if (v >= 85) return 'rgb(6,96,6)'
  if (v >= 80) return 'rgb(14,104,14)'
  if (v >= 75) return 'rgb(22,116,22)'
  if (v >= 70) return 'rgb(32,124,32)'
  if (v >= 65) return 'rgb(44,130,44)'
  if (v >= 60) return 'rgb(64,128,64)'
  if (v >= 55) return 'rgb(80,110,80)'
  if (v >= 50) return 'rgb(96,96,96)'
  if (v >= 45) return 'rgb(110,80,80)'
  if (v >= 40) return 'rgb(128,64,64)'
  if (v >= 35) return 'rgb(130,44,44)'
  if (v >= 30) return 'rgb(124,32,32)'
  if (v >= 25) return 'rgb(116,22,22)'
  if (v >= 20) return 'rgb(104,14,14)'
  if (v >= 15) return 'rgb(96,8,8)'
  if (v >= 10) return 'rgb(88,5,5)'
  return 'rgb(80,0,0)'
}

export function rsiTextColor(v: number): string {
  if (v >= 50) return `rgb(${Math.round(140 + v * 0.5)},255,${Math.round(140 + v * 0.5)})`
  return `rgb(255,${Math.round(120 + v * 0.7)},${Math.round(120 + v * 0.7)})`
}
