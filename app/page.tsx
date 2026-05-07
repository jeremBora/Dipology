'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import ScreenerRow, { ContractData } from '@/components/ScreenerRow'
import ColumnPicker, { ExtraCol } from '@/components/ColumnPicker'
import FilterBar, { Filters, defaultFilters, applyVolFilter } from '@/components/FilterBar'
import { getCategory } from '@/lib/categories'
import CategoryPicker from '@/components/CategoryPicker'

type SortKey = 'symbol' | 'momentumD' | 'momentumW' | 'vol24h' | 'spotRatio' | 'ratioFS' | 'volSpot'
type SortDir = 'asc' | 'desc'

const BATCH_SIZE = 20
const PINNED_SYMBOLS = ['BTCUSDT', 'STABLES.D']
const EXCLUDED_SYMBOLS = new Set(['BTCDOMUSDT', 'USDCUSDT'])

// Favoris persistants via localStorage
function loadFavorites(): Set<string> {
  if (typeof window === 'undefined') return new Set()
  try {
    const raw = localStorage.getItem('dipology_favorites')
    return raw ? new Set(JSON.parse(raw)) : new Set()
  } catch { return new Set() }
}

function saveFavorites(favs: Set<string>) {
  if (typeof window === 'undefined') return
  try { localStorage.setItem('dipology_favorites', JSON.stringify([...favs])) } catch {}
}

// Column order persistant
function loadColOrder(): string[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem('dipology_col_order')
    return raw ? JSON.parse(raw) : []
  } catch { return [] }
}

function saveColOrder(order: string[]) {
  if (typeof window === 'undefined') return
  try { localStorage.setItem('dipology_col_order', JSON.stringify(order)) } catch {}
}

function percentileRank(values: number[], val: number): number {
  const sorted = [...values].sort((a, b) => a - b)
  const idx = sorted.findIndex(v => v >= val)
  if (idx === -1) return 100
  return Math.round((idx / sorted.length) * 100)
}


// ── Score composite Rising ────────────────────────────────────────────────────
// 50% Mom Daily live + 30% Pente Daily (3j) + 20% Mom Weekly live
function cScore(data: ContractData): number | null {
  const dLive = data.daily?.live
  const wLive = data.weekly?.live
  const hist  = data.daily?.history ?? []

  if (dLive === null || dLive === undefined) return null
  if (wLive === null || wLive === undefined) return null

  // Pente = mom daily live - moyenne des 3 dernières valeurs historiques
  const last3 = hist.slice(-3).filter((v): v is number => v !== null && v !== undefined)
  const slope = last3.length > 0
    ? dLive - (last3.reduce((a, b) => a + b, 0) / last3.length)
    : 0

  // Score composite /10
  const momD  = dLive / 10
  const momW  = wLive / 10
  const pente = slope / 10

  return (momD * 0.5) + (pente * 3) + (momW * 0.2)
}

export default function Home() {
  const [contracts, setContracts]           = useState<Map<string, ContractData>>(new Map())
  const [symbols, setSymbols]               = useState<string[]>([])
  const [totalSymbols, setTotalSymbols]     = useState(0)
  const [sortKey, setSortKey]               = useState<SortKey>('momentumD')
  const [sortDir, setSortDir]               = useState<SortDir>('desc')
  const [loadedCount, setLoadedCount]       = useState(0)
  const [extraCols, setExtraCols]           = useState<Set<ExtraCol>>(new Set())
  const [filters, setFilters]               = useState<Filters>(defaultFilters)
  const [theme, setTheme]                   = useState<'dark' | 'light'>('dark')
  const [pushMissingToBottom, setPushMissingToBottom] = useState(false)
  const [favorites, setFavorites]           = useState<Set<string>>(new Set())
  const [activeTab, setActiveTab]           = useState<'all' | 'favorites'>('all')
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [searchQuery, setSearchQuery]       = useState('')
  const [hideMissing, setHideMissing]       = useState(false)
  const [isLoading, setIsLoading]           = useState(false)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

  useEffect(() => {
    setFavorites(loadFavorites())
  }, [])

  const toggleFavorite = useCallback((sym: string) => {
    setFavorites(prev => {
      const next = new Set(prev)
      next.has(sym) ? next.delete(sym) : next.add(sym)
      saveFavorites(next)
      return next
    })
  }, [])

  const makeEmpty = (sym: string): ContractData => ({
    symbol: sym,
    daily:   { history: [], live: null, score: null, count: 0, incomplete: false },
    weekly:  { history: [], live: null, score: null, count: 0, incomplete: false },
    vol24h: 0, volSpot: null,
    spotRatio: null, ratioFS: null,
    spotRatioPct: null, ratioFSPct: null,
    incomplete: false, loading: true,
    volAllExchanges: null, isRWA: false,
  })

  const recalcPercentiles = useCallback((map: Map<string, ContractData>) => {
    const all = Array.from(map.values()).filter(c => !c.loading)
    const srVals = all.map(c => c.spotRatio).filter((v): v is number => v !== null)
    const fsVals = all.map(c => c.ratioFS).filter((v): v is number => v !== null)
    const updated = new Map(map)
    updated.forEach((c, sym) => {
      const next = { ...c }
      if (c.spotRatio !== null && srVals.length > 0)
        next.spotRatioPct = percentileRank(srVals, c.spotRatio)
      if (c.ratioFS !== null && fsVals.length > 0)
        next.ratioFSPct = 100 - percentileRank(fsVals, c.ratioFS)
      updated.set(sym, next)
    })
    return updated
  }, [])

  const loadAll = useCallback(async (syms: string[]) => {
    abortRef.current?.abort()
    abortRef.current = new AbortController()
    const signal = abortRef.current.signal
    setIsLoading(true)
    setLoadedCount(0)

    for (let i = 0; i < syms.length; i += BATCH_SIZE) {
      if (signal.aborted) break
      const batch = syms.slice(i, i + BATCH_SIZE)
      await Promise.allSettled(
        batch.map(async sym => {
          try {
            const res = await fetch(`/api/rsi?symbol=${encodeURIComponent(sym)}`, { signal })
            if (!res.ok) return
            const data = await res.json()
            setContracts(prev => {
              const next = new Map(prev)
              next.set(sym, { ...data, loading: false, error: false })
              return recalcPercentiles(next)
            })
            setLoadedCount(c => c + 1)
          } catch { /* ignore */ }
        })
      )
    }
    setIsLoading(false)
  }, [recalcPercentiles])

  useEffect(() => {
    fetch('/api/symbols')
      .then(r => r.json())
      .then(data => {
        const filtered = (data.symbols as string[]).filter(s => !EXCLUDED_SYMBOLS.has(s))
        const allSymbols = ['STABLES.D', ...filtered]
        setSymbols(allSymbols)
        setTotalSymbols(allSymbols.length)
        const init = new Map<string, ContractData>()
        allSymbols.forEach(sym => { init.set(sym, makeEmpty(sym)) })
        setContracts(init)
        loadAll(allSymbols)
      })
  }, [loadAll])

  function handleSort(key: SortKey) {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir(key === 'symbol' ? 'asc' : 'desc') }
  }

  function applyFiltersCheck(c: ContractData): boolean {
    if (hideMissing && c.incomplete) return false
    if (selectedCategory) {
      const cat = getCategory(c.symbol)
      if (cat !== selectedCategory) return false
    }
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      if (!c.symbol.toLowerCase().includes(q)) return false
    }
    if (activeTab === 'favorites' && !favorites.has(c.symbol)) return false

    const dLive = c.daily?.live
    const wLive = c.weekly?.live
    const dHist = c.daily?.history ?? []
    const wHist = c.weekly?.history ?? []
    const dPrev = dHist.length > 0 ? dHist[dHist.length - 1] : null
    const wPrev = wHist.length > 0 ? wHist[wHist.length - 1] : null
    const dScore = c.daily?.score
    const wScore = c.weekly?.score
    const md     = dLive !== null && dLive !== undefined ? dLive / 10 : null
    const mw     = wLive !== null && wLive !== undefined ? wLive / 10 : null
    const mdPrev = dPrev !== null && dPrev !== undefined ? dPrev / 10 : null
    const mwPrev = wPrev !== null && wPrev !== undefined ? wPrev / 10 : null

    if (filters.momentumDLive !== '' && (md === null || md < parseFloat(filters.momentumDLive))) return false
    if (filters.momentumDPrev !== '' && (mdPrev === null || mdPrev < parseFloat(filters.momentumDPrev))) return false
    if (filters.momentumWLive !== '' && (mw === null || mw < parseFloat(filters.momentumWLive))) return false
    if (filters.momentumWPrev !== '' && (mwPrev === null || mwPrev < parseFloat(filters.momentumWPrev))) return false
    if (filters.scorePctD !== '' && (dScore === null || dScore === undefined || dScore < parseFloat(filters.scorePctD))) return false
    if (filters.scorePctW !== '' && (wScore === null || wScore === undefined || wScore < parseFloat(filters.scorePctW))) return false
    if (!applyVolFilter(c.vol24h ?? 0, filters.vol24hMin)) return false
    return true
  }

    function getSortedRows(): { pinned: ContractData[]; normal: ContractData[] } {
    const all = Array.from(contracts.values()).filter(c => !c.loading)
    const pinned = PINNED_SYMBOLS
      .map(sym => contracts.get(sym))
      .filter((c): c is ContractData => !!c)

    const normal = all
      .filter(c => !PINNED_SYMBOLS.includes(c.symbol) && applyFiltersCheck(c))
      .sort((a, b) => {
        if (pushMissingToBottom) {
          if (a.incomplete && !b.incomplete) return 1
          if (!a.incomplete && b.incomplete) return -1
        }
        let va: number | string = 0, vb: number | string = 0
        if (sortKey === 'symbol')    { va = a.symbol;                    vb = b.symbol }
        if (sortKey === 'momentumD') { va = a.daily?.score     ?? -1;    vb = b.daily?.score     ?? -1 }
        if (sortKey === 'momentumW') { va = a.weekly?.score    ?? -1;    vb = b.weekly?.score    ?? -1 }
        if (sortKey === 'vol24h')    { va = a.vol24h           ?? 0;     vb = b.vol24h           ?? 0 }
        if (sortKey === 'spotRatio') { va = a.spotRatio        ?? -1;    vb = b.spotRatio        ?? -1 }
        if (sortKey === 'ratioFS')   { va = a.ratioFS          ?? 999999;vb = b.ratioFS          ?? 999999 }
        if (sortKey === 'volSpot')   { va = a.volSpot          ?? 0;     vb = b.volSpot          ?? 0 }
        if (typeof va === 'string') return sortDir === 'asc' ? va.localeCompare(vb as string) : (vb as string).localeCompare(va)
        return sortDir === 'asc' ? (va as number) - (vb as number) : (vb as number) - (va as number)
      })
    return { pinned, normal }
  }

  const { pinned, normal } = getSortedRows()
  const allLoaded = !isLoading && loadedCount >= totalSymbols && totalSymbols > 0
  const pct = totalSymbols > 0 ? Math.round((loadedCount / totalSymbols) * 100) : 0

  const showMomDPrev  = extraCols.has('momentumDPrev')
  const showMomWPrev  = extraCols.has('momentumWPrev')
  const showScoreD    = extraCols.has('scorePctD')
  const showScoreW    = extraCols.has('scorePctW')
  const showSpotRatio = extraCols.has('spotRatio' as ExtraCol)
  const showRatioFS   = extraCols.has('ratioFS' as ExtraCol)
  const showVolSpot   = extraCols.has('volSpot' as ExtraCol)
  const colVolAll    = extraCols.has('volAllExchanges' as ExtraCol)

  const extraCount = (showMomDPrev?1:0)+(showMomWPrev?1:0)+(showScoreD?1:0)+(showScoreW?1:0)+(showSpotRatio?1:0)+(showRatioFS?1:0)+(showVolSpot?1:0)+(colVolAll?1:0)
  const colCount = 4 + extraCount
  const gridCols = `2fr repeat(${colCount - 1}, 1fr)`

  const headerBg = theme === 'dark' ? '#060910' : '#f0faf4'

  function ColBtn({ col, label, align }: { col: SortKey; label: string; align?: string }) {
    const active = sortKey === col
    return (
      <button onClick={() => handleSort(col)} style={{
        background: 'none', border: 'none',
        color: active ? 'var(--accent)' : 'var(--text-dim)',
        fontSize: 10, letterSpacing: 2, textTransform: 'uppercase',
        fontFamily: "'Dodger', 'Syne', sans-serif", fontWeight: 500, cursor: 'pointer',
        display: 'flex', alignItems: 'center',
        justifyContent: align === 'left' ? 'flex-start' : 'center',
        gap: 4, padding: '10px 12px', width: '100%',
        transition: 'color 0.2s',
      }}>
        {label}
        {col === 'symbol' && (
          <span style={{ color: 'var(--text-muted)', fontWeight: 400, fontSize: 10, marginLeft: 4 }}>
            — {totalSymbols > 0 ? totalSymbols - 1 : '…'}
          </span>
        )}
        {active && <span style={{ fontSize: 9 }}>{sortDir === 'asc' ? '▲' : '▼'}</span>}
      </button>
    )
  }

  function SimpleHdr({ label }: { label: string }) {
    return (
      <div style={{ color: 'var(--text-dim)', fontSize: 10, letterSpacing: 2, textTransform: 'uppercase', fontFamily: "'Dodger', 'Syne', sans-serif", fontWeight: 500, padding: '10px 12px', textAlign: 'center' }}>
        {label}
      </div>
    )
  }

  return (
    <main style={{ position: 'relative', zIndex: 1, padding: '24px 16px', maxWidth: 1500, margin: '0 auto' }}>

      {/* Header */}
      <div style={{ textAlign: 'center', padding: '28px 0 32px', position: 'relative' }}>
        <button
          onClick={() => setTheme(t => t === 'dark' ? 'light' : 'dark')}
          style={{ position: 'absolute', top: 28, right: 0, background: 'var(--bg-panel)', border: '1px solid var(--border)', color: 'var(--text-muted)', borderRadius: 8, padding: '6px 14px', cursor: 'pointer', fontSize: 15, transition: 'all 0.2s' }}
        >{theme === 'dark' ? '☀️' : '🌙'}</button>

        <h1 style={{ fontSize: 28, fontWeight: 200, color: 'var(--accent)', letterSpacing: 10, textTransform: 'uppercase', fontFamily: "'Dodger', 'Syne', sans-serif" }}>
          Dipology Screener
        </h1>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 6, fontSize: 10, color: 'var(--text-muted)', letterSpacing: 3, textTransform: 'lowercase' }}>
          <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--green-live)', display: 'inline-block', animation: 'livePulse 1.8s infinite' }} />
          live
        </div>
      </div>

      {/* Pinned cards - BTC + STABLES.D above table */}
      {pinned.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 28 }}>
          {pinned.map(row => (
            <PinnedCard key={row.symbol} data={row} theme={theme} favorite={favorites.has(row.symbol)} onFav={() => toggleFavorite(row.symbol)} />
          ))}
        </div>
      )}

      {/* Progress bar */}
      {isLoading && totalSymbols > 0 && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ height: 2, background: 'var(--border)', borderRadius: 1, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${pct}%`, background: 'var(--accent)', transition: 'width 0.3s ease', borderRadius: 1 }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
            <span style={{ fontSize: 10, color: 'var(--text-dim)', letterSpacing: 1 }}>{loadedCount} / {totalSymbols} contrats chargés</span>
            <span style={{ fontSize: 10, color: 'var(--text-dim)', letterSpacing: 1 }}>{pct}%</span>
          </div>
        </div>
      )}

      {/* Tabs: All / Favorites */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        {(['all', 'favorites'] as const).map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)} style={{
            padding: '5px 14px', borderRadius: 20,
            background: activeTab === tab ? 'var(--accent)' : 'var(--bg-panel)',
            border: `1px solid ${activeTab === tab ? 'var(--accent)' : 'var(--border)'}`,
            color: activeTab === tab ? '#000' : 'var(--text-muted)',
            fontSize: 11, letterSpacing: 1, cursor: 'pointer',
            fontFamily: "'Dodger', 'Syne', sans-serif", fontWeight: 600,
            transition: 'all 0.2s',
          }}>
            {tab === 'all' ? 'Tous' : tab === 'favorites' ? '★ Favoris' : '↑ Rising'}
          </button>
        ))}

        <CategoryPicker selected={selectedCategory} onSelect={setSelectedCategory} contracts={contracts} />

        {/* Hide missing */}
        <button onClick={() => setHideMissing(p => !p)} style={{
          padding: '4px 11px', borderRadius: 20,
          background: hideMissing ? 'rgba(255,159,67,0.15)' : 'var(--bg-panel)',
          border: `1px solid ${hideMissing ? '#ff9f43' : 'var(--border)'}`,
          color: hideMissing ? '#ff9f43' : 'var(--text-dim)',
          fontSize: 10, letterSpacing: 1, cursor: 'pointer',
          fontFamily: "'Dodger', 'Syne', sans-serif", fontWeight: 600,
        }}>Missing data ✕</button>

        {/* Search - pill */}
        <div style={{
          marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6,
          background: 'var(--bg-panel)', border: '1px solid var(--border)',
          borderRadius: 20, padding: '4px 12px',
        }}>
          <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
            <circle cx="4.5" cy="4.5" r="3.2" stroke="var(--text-dim)" strokeWidth="1.2"/>
            <line x1="7" y1="7" x2="10" y2="10" stroke="var(--text-dim)" strokeWidth="1.2" strokeLinecap="round"/>
          </svg>
          <input
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder=""
            style={{
              background: 'none', border: 'none', outline: 'none',
              color: 'var(--text-primary)',
              fontFamily: "'Space Mono', monospace", fontSize: 10,
              width: 110,
            }}
          />
        </div>

        {/* Refresh button */}
        <button
          onClick={() => loadAll(symbols)}
          disabled={isLoading}
          style={{
            padding: '5px 14px', borderRadius: 6,
            background: isLoading ? 'var(--border)' : 'var(--accent)',
            border: 'none', color: isLoading ? 'var(--text-muted)' : '#000',
            fontSize: 11, letterSpacing: 1, cursor: isLoading ? 'not-allowed' : 'pointer',
            fontFamily: "'Dodger', 'Syne', sans-serif", fontWeight: 700,
            transition: 'all 0.2s',
          }}
        >{isLoading ? '↻ ...' : '↻ Refresh'}</button>
      </div>

      {/* FilterBar */}
      <FilterBar filters={filters} onChange={setFilters} activeCount={normal.length} totalCount={normal.length} />

      {/* Table */}
      <div style={{ background: 'var(--bg-panel)', border: '1px solid var(--border)', borderRadius: 16, overflow: 'hidden' }}>
        {/* Sticky header */}
        <div style={{
          display: 'grid', gridTemplateColumns: gridCols,
          background: headerBg, borderBottom: '1px solid var(--border)',
          position: 'sticky', top: 0, zIndex: 20,
        }}>
          <ColBtn col="symbol"    label="Contrat"    align="left" />
          <ColBtn col="momentumD" label="Mom D" />
          <ColBtn col="momentumW" label="Mom W" />
          <ColBtn col="vol24h"    label="F Vol 24H" />
          {showVolSpot   && <ColBtn col="volSpot"   label="S Vol 24H" />}
          {colVolAll    && <SimpleHdr label="Vol Total" />}
          {showMomDPrev  && <SimpleHdr label="Mom D-1" />}
          {showMomWPrev  && <SimpleHdr label="Mom W-1" />}
          {showScoreD    && <SimpleHdr label="Score D" />}
          {showScoreW    && <SimpleHdr label="Score W" />}
          {showSpotRatio && <ColBtn col="spotRatio" label="Turn-over" />}
          {showRatioFS   && <ColBtn col="ratioFS"   label="Ratio F/S" />}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '8px' }}>
            <button
              onClick={() => setPushMissingToBottom(p => !p)}
              title="Repousser données manquantes en bas"
              style={{
                background: pushMissingToBottom ? 'rgba(255,159,67,0.15)' : 'none',
                border: `1px solid ${pushMissingToBottom ? '#ff9f43' : 'var(--border)'}`,
                color: pushMissingToBottom ? '#ff9f43' : 'var(--text-dim)',
                borderRadius: 4, padding: '2px 7px', cursor: 'pointer',
                fontSize: 10, fontFamily: "'Dodger', 'Syne', sans-serif",
              }}
            >↓?</button>
            <ColumnPicker active={extraCols} onToggle={col => {
              setExtraCols(prev => {
                const next = new Set(prev)
                next.has(col) ? next.delete(col) : next.add(col)
                return next
              })
            }} />
          </div>
        </div>

        {/* Normal rows */}
        <div style={{ maxHeight: 'calc(100vh - 420px)', overflowY: 'auto' }}>
          {normal.length === 0 && allLoaded && (
            <div style={{ padding: '40px 24px', textAlign: 'center', color: 'var(--text-dim)', fontSize: 12, letterSpacing: 2 }}>
              aucun résultat
            </div>
          )}
                  {normal.map((row, i) => (
            <ScreenerRow
              key={row.symbol}
              data={row}
              index={i}
              extraCols={extraCols}
              gridCols={gridCols}
              forceOpen={false}
              isPinned={false}
              colVolAll={colVolAll}
              isFavorite={favorites.has(row.symbol)}
              onToggleFavorite={() => toggleFavorite(row.symbol)}
            />
          ))}
        </div>
      </div>
    </main>
  )
}

// ── Pinned card component ─────────────────────────────────────────────────────
function PinnedCard({ data, theme, favorite, onFav }: {
  data: ContractData
  theme: string
  favorite: boolean
  onFav: () => void
}) {
  const isBTC  = data.symbol === 'BTCUSDT'
  const isUSDT = data.symbol === 'STABLES.D'
  const accentColor = isBTC ? 'var(--accent)' : '#ff9f43'
  const base = isBTC ? 'BTC' : 'STABLES.D'

  const dLive  = data.daily?.live
  const wLive  = data.weekly?.live
  const dHist  = data.daily?.history ?? []
  const wHist  = data.weekly?.history ?? []
  const dScore = data.daily?.score
  const wScore = data.weekly?.score
  const dominance = (data as ContractData & { dominance?: number }).dominance

  function fmtMom(v: number | null | undefined) {
    if (v === null || v === undefined) return '—'
    return (v / 10).toFixed(2)
  }

  function momColor(v: number | null | undefined) {
    if (v === null || v === undefined) return 'var(--text-dim)'
    const m = v / 10
    if (m >= 6) return 'var(--num-green)'
    if (m >= 5) return 'var(--num-green)'
    if (m >= 4) return '#c8a800'
    if (m >= 3) return 'var(--num-red)'
    return 'var(--num-red)'
  }

  // STABLES.D seuils basés sur l'analyse de marché :
  // < 5% = bull zone (capitaux en altcoins)
  // 5-6% = neutre
  // > 6% = bear zone (capitaux en stablecoins)
  function usdtSignal(dom: number | undefined) {
    if (dom === undefined || dom === 0) return null
    if (dom < 5) return { text: 'Bull Zone', color: 'var(--num-green)', dot: '#22c55e' }
    if (dom <= 6) return { text: 'Neutre', color: '#c8a800', dot: '#eab308' }
    return { text: 'Bear Zone', color: 'var(--num-red)', dot: '#ef4444' }
  }

  const signal = isUSDT ? usdtSignal(dominance) : null

  // Donut chart params for STABLES.D
  // Scale: 0-10% dominance range shown on donut
  // At 4.82% on 0-10% scale = 48.2% of circle
  const domPct = dominance !== undefined ? Math.min(dominance / 10, 1) : 0
  const circumference = 2 * Math.PI * 36 // r=36
  const usdtDash = circumference * domPct
  const altDash  = circumference * (1 - domPct) - 4

  const dCells = [...Array(9).fill(null).map((_, i) => dHist[dHist.length - 9 + i] ?? null), dLive ?? null]
  const wCells = [...Array(9).fill(null).map((_, i) => wHist[wHist.length - 9 + i] ?? null), wLive ?? null]

  function cellColor(v: number | null) {
    if (v === null) return theme === 'dark' ? '#0a0f1e' : '#f0f4f0'
    if (v >= 70) return '#1d8848'
    if (v >= 60) return '#3aaa64'
    if (v >= 50) return '#6abf8a'
    if (v >= 40) return '#96c896'
    if (v >= 30) return '#c89696'
    if (v >= 20) return '#c86464'
    return '#a83232'
  }

  return (
    <div style={{
      background: 'var(--bg-panel)',
      border: `1px solid var(--border)`,
      borderLeft: `3px solid ${accentColor}`,
      borderRadius: 12, padding: '16px 20px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <span style={{ color: accentColor, fontSize: 11 }}>{isBTC ? '★' : '◆'}</span>
        <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', fontFamily: "'Space Mono', monospace" }}>{base}</span>
        {!isBTC && <span style={{ fontSize: 10, color: 'var(--text-muted)', letterSpacing: 1 }}>dominance</span>}
        {signal && (
          <span style={{ fontSize: 9, color: signal.color, fontWeight: 600, marginLeft: 4, letterSpacing: 1 }}>
            · {signal.text}
          </span>
        )}
        <button onClick={onFav} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, color: favorite ? '#f0a020' : 'var(--text-dim)' }}>
          {favorite ? '★' : '☆'}
        </button>
      </div>

      {/* BTC content */}
      {isBTC && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
            {[
              { label: 'Momentum Daily', val: fmtMom(dLive), color: momColor(dLive) },
              { label: 'Momentum Weekly', val: fmtMom(wLive), color: momColor(wLive) },
            ].map(m => (
              <div key={m.label} style={{ background: theme === 'dark' ? '#0a0f1e' : '#f5f9f5', borderRadius: 6, padding: '6px 10px' }}>
                <div style={{ fontSize: 8, letterSpacing: 1, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 3 }}>{m.label}</div>
                <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 15, fontWeight: 700, color: m.color }}>{m.val}</div>
              </div>
            ))}
          </div>
          <div style={{ fontSize: 9, letterSpacing: 1, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 5 }}>
            Momentum Heatmap
          </div>
          {[{ label: 'D', cells: dCells, rawCells: dHist, score: dScore }, { label: 'W', cells: wCells, rawCells: wHist, score: wScore }].map(row => (
            <div key={row.label} style={{ display: 'flex', gap: 2, alignItems: 'stretch', marginBottom: 3 }}>
              <span style={{ width: 12, fontSize: 9, color: 'var(--text-muted)', fontFamily: "'Space Mono', monospace", display: 'flex', alignItems: 'center' }}>{row.label}</span>
              {row.cells.slice(0, 9).map((v, i) => {
                const raw = row.rawCells[row.rawCells.length - 9 + i] ?? null
                if (v === null || raw === null) return (
                  <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, padding: '3px 1px' }}>
                    <span style={{ fontSize: 9, color: 'var(--text-dim)', fontFamily: 'Space Mono, monospace' }}>—</span>
                    <div style={{ width: '80%', height: 2, borderRadius: 1, background: 'var(--border)' }} />
                  </div>
                )
                const rVal = raw
                let r = 96, g = 96, b = 96
                if (rVal >= 70) { r=32; g=124; b=32 }
                else if (rVal >= 60) { r=64; g=128; b=64 }
                else if (rVal >= 50) { r=80; g=110; b=80 }
                else if (rVal >= 40) { r=110; g=80; b=80 }
                else if (rVal >= 30) { r=124; g=32; b=32 }
                else { r=104; g=14; b=14 }
                const pct = Math.min(Math.round(rVal), 100)
                const textC = rVal >= 50 ? `rgb(${Math.round(140+rVal*0.5)},255,${Math.round(140+rVal*0.5)})` : `rgb(255,${Math.round(120+rVal*0.7)},${Math.round(120+rVal*0.7)})`
                return (
                  <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, padding: '3px 1px' }}>
                    <span style={{ fontSize: 9, fontWeight: 600, color: textC, fontFamily: 'Space Mono, monospace', lineHeight: 1 }}>{(v/10).toFixed(1)}</span>
                    <div style={{ width: '80%', height: 2, borderRadius: 1, background: `rgba(${r},${g},${b},0.2)` }}>
                      <div style={{ width: `${pct}%`, height: '100%', borderRadius: 1, background: `rgb(${r},${g},${b})` }} />
                    </div>
                  </div>
                )
              })}
              <div style={{ width: 1, background: 'var(--border)', flexShrink: 0, margin: '0 2px' }} />
              {(() => {
                const v = row.cells[9] ?? null
                const raw = v
                if (v === null || raw === null) return (
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, padding: '3px 1px', border: '1px solid var(--border)', borderRadius: 4 }}>
                    <span style={{ fontSize: 9, color: 'var(--text-dim)', fontFamily: 'Space Mono, monospace' }}>—</span>
                    <div style={{ width: '80%', height: 2, borderRadius: 1, background: 'var(--border)' }} />
                  </div>
                )
                let r = 96, g = 96, b = 96
                if (raw >= 70) { r=32; g=124; b=32 }
                else if (raw >= 60) { r=64; g=128; b=64 }
                else if (raw >= 50) { r=80; g=110; b=80 }
                else if (raw >= 40) { r=110; g=80; b=80 }
                else if (raw >= 30) { r=124; g=32; b=32 }
                else { r=104; g=14; b=14 }
                const pct = Math.min(Math.round(raw), 100)
                const textC = raw >= 70 ? '#00aa44' : raw >= 60 ? '#00882a' : raw >= 50 ? '#006622' : raw >= 40 ? '#884400' : raw >= 30 ? '#aa2200' : '#cc1100'
                return (
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, padding: '3px 1px', border: `1px solid rgba(${r},${g},${b},0.5)`, borderRadius: 4, background: `rgba(${r},${g},${b},0.06)` }}>
                    <span style={{ fontSize: 9, fontWeight: 700, color: textC, fontFamily: 'Space Mono, monospace', lineHeight: 1 }}>{(v/10).toFixed(1)}</span>
                    <div style={{ width: '80%', height: 2, borderRadius: 1, background: `rgba(${r},${g},${b},0.2)` }}>
                      <div style={{ width: `${pct}%`, height: '100%', borderRadius: 1, background: `rgb(${r},${g},${b})` }} />
                    </div>
                  </div>
                )
              })()}
              <div style={{ flex: 1.5, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, padding: '3px 4px', background: theme === 'dark' ? '#0a0f1e' : '#f0f4f0', borderRadius: 4 }}>
                <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 9, fontWeight: 700, color: accentColor }}>
                  {row.score !== null && row.score !== undefined ? (row.score/10).toFixed(2) : '—'}
                </span>
                {row.score !== null && row.score !== undefined && (
                  <div style={{ width: '80%', height: 2, borderRadius: 1, background: 'var(--border)' }}>
                    <div style={{ width: `${Math.min(row.score, 100)}%`, height: '100%', borderRadius: 1, background: accentColor }} />
                  </div>
                )}
              </div>
            </div>
          ))}
        </>
      )}

      {/* STABLES.D content */}
      {isUSDT && dominance !== undefined && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
            {[
              { label: 'Momentum Daily', val: fmtMom(dLive), color: momColor(dLive) },
              { label: 'Momentum Weekly', val: fmtMom(wLive), color: momColor(wLive) },
            ].map(m => (
              <div key={m.label} style={{ background: theme === 'dark' ? '#0a0f1e' : '#f5f9f5', borderRadius: 6, padding: '6px 10px' }}>
                <div style={{ fontSize: 8, letterSpacing: 1, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 3 }}>{m.label}</div>
                <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 15, fontWeight: 700, color: m.color }}>{m.val}</div>
              </div>
            ))}
          </div>
          <div style={{ fontSize: 9, letterSpacing: 1, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 5 }}>Momentum Heatmap</div>
          {[{ label: 'D', cells: dCells, rawCells: dHist, score: dScore }, { label: 'W', cells: wCells, rawCells: wHist, score: wScore }].map(row => (
            <div key={row.label} style={{ display: 'flex', gap: 2, alignItems: 'stretch', marginBottom: 3 }}>
              <span style={{ width: 12, fontSize: 9, color: 'var(--text-muted)', fontFamily: "'Space Mono', monospace", display: 'flex', alignItems: 'center' }}>{row.label}</span>
              {row.cells.slice(0, 9).map((v, i) => {
                const raw = row.rawCells[row.rawCells.length - 9 + i] ?? null
                if (v === null || raw === null) return (
                  <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, padding: '3px 1px' }}>
                    <span style={{ fontSize: 9, color: 'var(--text-dim)', fontFamily: 'Space Mono, monospace' }}>—</span>
                    <div style={{ width: '80%', height: 2, borderRadius: 1, background: 'var(--border)' }} />
                  </div>
                )
                let r = 96, g = 96, b = 96
                if (raw >= 70) { r=32; g=124; b=32 }
                else if (raw >= 60) { r=64; g=128; b=64 }
                else if (raw >= 50) { r=80; g=110; b=80 }
                else if (raw >= 40) { r=110; g=80; b=80 }
                else if (raw >= 30) { r=124; g=32; b=32 }
                else { r=104; g=14; b=14 }
                const pct = Math.min(Math.round(raw), 100)
                const textC = raw >= 70 ? '#00aa44' : raw >= 60 ? '#00882a' : raw >= 50 ? '#006622' : raw >= 40 ? '#884400' : raw >= 30 ? '#aa2200' : '#cc1100'
                return (
                  <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, padding: '3px 1px' }}>
                    <span style={{ fontSize: 9, fontWeight: 600, color: textC, fontFamily: 'Space Mono, monospace', lineHeight: 1 }}>{(v/10).toFixed(1)}</span>
                    <div style={{ width: '80%', height: 2, borderRadius: 1, background: `rgba(${r},${g},${b},0.2)` }}>
                      <div style={{ width: `${pct}%`, height: '100%', borderRadius: 1, background: `rgb(${r},${g},${b})` }} />
                    </div>
                  </div>
                )
              })}
              <div style={{ width: 1, background: 'var(--border)', flexShrink: 0, margin: '0 2px' }} />
              {(() => {
                const v = row.cells[9] ?? null
                if (v === null) return (
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, padding: '3px 1px', border: '1px solid var(--border)', borderRadius: 4 }}>
                    <span style={{ fontSize: 9, color: 'var(--text-dim)', fontFamily: 'Space Mono, monospace' }}>—</span>
                    <div style={{ width: '80%', height: 2, borderRadius: 1, background: 'var(--border)' }} />
                  </div>
                )
                let r = 96, g = 96, b = 96
                if (v >= 70) { r=32; g=124; b=32 }
                else if (v >= 60) { r=64; g=128; b=64 }
                else if (v >= 50) { r=80; g=110; b=80 }
                else if (v >= 40) { r=110; g=80; b=80 }
                else if (v >= 30) { r=124; g=32; b=32 }
                else { r=104; g=14; b=14 }
                const pct = Math.min(Math.round(v), 100)
                const textC = v >= 70 ? '#00aa44' : v >= 60 ? '#00882a' : v >= 50 ? '#006622' : v >= 40 ? '#884400' : v >= 30 ? '#aa2200' : '#cc1100'
                return (
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, padding: '3px 1px', border: `1px solid rgba(${r},${g},${b},0.5)`, borderRadius: 4, background: `rgba(${r},${g},${b},0.06)` }}>
                    <span style={{ fontSize: 9, fontWeight: 700, color: textC, fontFamily: 'Space Mono, monospace', lineHeight: 1 }}>{(v/10).toFixed(1)}</span>
                    <div style={{ width: '80%', height: 2, borderRadius: 1, background: `rgba(${r},${g},${b},0.2)` }}>
                      <div style={{ width: `${pct}%`, height: '100%', borderRadius: 1, background: `rgb(${r},${g},${b})` }} />
                    </div>
                  </div>
                )
              })()}
              <div style={{ flex: 1.5, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, padding: '3px 4px', background: theme === 'dark' ? '#0a0f1e' : '#f0f4f0', borderRadius: 4 }}>
                <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 9, fontWeight: 700, color: '#ff9f0a' }}>
                  {row.score !== null && row.score !== undefined ? (row.score/10).toFixed(2) : '—'}
                </span>
                {row.score !== null && row.score !== undefined && (
                  <div style={{ width: '80%', height: 2, borderRadius: 1, background: 'var(--border)' }}>
                    <div style={{ width: `${Math.min(row.score, 100)}%`, height: '100%', borderRadius: 1, background: '#ff9f0a' }} />
                  </div>
                )}
              </div>
            </div>
          ))}
        </>
      )}
      {isUSDT && (dominance === undefined || dominance === 0) && (
        <div style={{ fontSize: 11, color: 'var(--text-dim)', textAlign: 'center', padding: '20px 0' }}>chargement…</div>
      )}
    </div>
  )
}

 
 
 
 
 
 
 
 
 
 
 
 
 
 
 
 
 
 
 
