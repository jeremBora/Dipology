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
const PINNED_SYMBOLS = ['BTCUSDT', 'USDT.D']
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
        const allSymbols = ['USDT.D', ...filtered]
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

  const extraCount = (showMomDPrev?1:0)+(showMomWPrev?1:0)+(showScoreD?1:0)+(showScoreW?1:0)+(showSpotRatio?1:0)+(showRatioFS?1:0)+(showVolSpot?1:0)
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
      <div style={{ textAlign: 'center', padding: '28px 0 20px', position: 'relative' }}>
        <button
          onClick={() => setTheme(t => t === 'dark' ? 'light' : 'dark')}
          style={{ position: 'absolute', top: 28, right: 0, background: 'var(--bg-panel)', border: '1px solid var(--border)', color: 'var(--text-muted)', borderRadius: 8, padding: '6px 14px', cursor: 'pointer', fontSize: 15, transition: 'all 0.2s' }}
        >{theme === 'dark' ? '☀️' : '🌙'}</button>

        <h1 style={{ fontSize: 28, fontWeight: 200, color: 'var(--accent)', letterSpacing: 10, textTransform: 'uppercase', fontFamily: "'Dodger', 'Syne', sans-serif" }}>
          Dipology Screener
        </h1>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 6, fontSize: 10, color: 'var(--text-muted)', letterSpacing: 3, textTransform: 'lowercase' }}>
          <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--green-live)', display: 'inline-block', animation: 'livePulse 1.8s infinite' }} />
          binance futures usdt perpétuel · momentum = rsi ÷ 10
        </div>
      </div>

      {/* Pinned cards - BTC + USDT.D above table */}
      {pinned.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
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
            {tab === 'all' ? 'Tous' : '★ Favoris'}
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

        {/* Search */}
        <input
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          placeholder="Rechercher..."
          style={{
            marginLeft: 'auto', padding: '5px 12px',
            background: 'var(--bg-panel)', border: '1px solid var(--border)',
            borderRadius: 6, color: 'var(--text-primary)',
            fontFamily: "'Space Mono', monospace", fontSize: 11,
            outline: 'none', width: 160,
          }}
        />

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
  const isUSDT = data.symbol === 'USDT.D'
  const accentColor = isBTC ? 'var(--accent)' : '#ff9f43'
  const base = isBTC ? 'BTC' : 'USDT.D'

  const dLive  = data.daily?.live
  const wLive  = data.weekly?.live
  const dHist  = data.daily?.history ?? []
  const wHist  = data.weekly?.history ?? []
  const dScore = data.daily?.score
  const wScore = data.weekly?.score

  function fmtMom(v: number | null | undefined) {
    if (v === null || v === undefined) return '—'
    return (v / 10).toFixed(2)
  }

  function momColor(v: number | null | undefined) {
    if (v === null || v === undefined) return 'var(--text-dim)'
    const m = v / 10
    if (m >= 6) return '#00e676'
    if (m >= 5) return '#69f0ae'
    if (m >= 4) return '#fff176'
    if (m >= 3) return '#ffb74d'
    return '#ef5350'
  }

  // Mini heatmap cells
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

  const sentiment = isUSDT && dLive !== null && dLive !== undefined
    ? dLive / 10 < 4
      ? { text: '✓ Bull Signal', color: '#00e676' }
      : dLive / 10 > 6
      ? { text: '⚠ Bear Signal', color: '#ef5350' }
      : { text: '~ Neutre', color: '#fff176' }
    : null

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
        {sentiment && (
          <span style={{ fontSize: 10, color: sentiment.color, fontWeight: 600, marginLeft: 4, letterSpacing: 1 }}>{sentiment.text}</span>
        )}
        <button onClick={onFav} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, color: favorite ? '#f0a020' : 'var(--text-dim)' }}>
          {favorite ? '★' : '☆'}
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 12 }}>
        {[
          { label: 'Mom Daily', val: fmtMom(dLive), color: momColor(dLive) },
          { label: 'Mom Weekly', val: fmtMom(wLive), color: momColor(wLive) },
          { label: 'Score D', val: dScore !== null && dScore !== undefined ? dScore.toFixed(1) + '%' : '—', color: 'var(--text-muted)' },
        ].map(m => (
          <div key={m.label} style={{ background: theme === 'dark' ? '#0a0f1e' : '#f5f9f5', borderRadius: 6, padding: '6px 10px' }}>
            <div style={{ fontSize: 8, letterSpacing: 1, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 3 }}>{m.label}</div>
            <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 15, fontWeight: 700, color: m.color }}>{m.val}</div>
          </div>
        ))}
      </div>

      <div style={{ fontSize: 9, letterSpacing: 1, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 5 }}>Momentum Heatmap</div>
      {[{ label: 'D', cells: dCells, score: dScore }, { label: 'W', cells: wCells, score: wScore }].map(row => (
        <div key={row.label} style={{ display: 'flex', gap: 2, alignItems: 'center', marginBottom: 4 }}>
          <span style={{ width: 12, fontSize: 9, color: 'var(--text-muted)', fontFamily: "'Space Mono', monospace" }}>{row.label}</span>
          {row.cells.slice(0, 9).map((v, i) => (
            <div key={i} style={{ flex: 1, height: 18, borderRadius: 2, background: cellColor(v) }} title={v !== null ? v.toFixed(1) : '—'} />
          ))}
          <div style={{ width: 4, flexShrink: 0 }} />
          <div style={{ flex: 1, height: 18, borderRadius: 2, background: cellColor(row.cells[9] ?? null), border: `1px solid ${accentColor}66` }} />
          <div style={{ flex: 1.5, height: 18, borderRadius: 2, background: theme === 'dark' ? '#0a0f1e' : '#f0f4f0', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 9, fontWeight: 700, color: accentColor }}>
              {row.score !== null && row.score !== undefined ? row.score.toFixed(1) + '%' : '—'}
            </span>
          </div>
        </div>
      ))}
    </div>
  )
}
