'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import ScreenerRow, { ContractData } from '@/components/ScreenerRow'
import ColumnPicker, { ExtraCol } from '@/components/ColumnPicker'
import FilterBar, { Filters, defaultFilters, applyVolFilter } from '@/components/FilterBar'

type SortKey = 'symbol' | 'momentumD' | 'momentumW' | 'vol24h' | 'spotRatio' | 'ratioFS'
type SortDir = 'asc' | 'desc'

const BATCH_SIZE = 20
const REFRESH_MS = 30000

function percentileRank(values: number[], val: number): number {
  const sorted = [...values].sort((a, b) => a - b)
  const idx = sorted.findIndex(v => v >= val)
  if (idx === -1) return 100
  return Math.round((idx / sorted.length) * 100)
}

export default function Home() {
  const [contracts, setContracts]       = useState<Map<string, ContractData>>(new Map())
  const [symbols, setSymbols]           = useState<string[]>([])
  const [totalSymbols, setTotalSymbols] = useState(0)
  const [sortKey, setSortKey]           = useState<SortKey>('momentumD')
  const [sortDir, setSortDir]           = useState<SortDir>('desc')
  const [loadedCount, setLoadedCount]   = useState(0)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [extraCols, setExtraCols]       = useState<Set<ExtraCol>>(new Set())
  const [filters, setFilters]           = useState<Filters>(defaultFilters)
  const [theme, setTheme]               = useState<'dark' | 'light'>('dark')
  const refreshTimer                    = useRef<ReturnType<typeof setInterval> | null>(null)
  const abortRef                        = useRef<AbortController | null>(null)

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

  useEffect(() => {
    fetch('/api/symbols')
      .then(r => r.json())
      .then(data => {
        setSymbols(data.symbols)
        setTotalSymbols(data.total)
        const init = new Map<string, ContractData>()
        data.symbols.forEach((sym: string) => {
          init.set(sym, {
            symbol: sym,
            daily:   { history: [], live: null, score: null, count: 0, incomplete: false },
            weekly:  { history: [], live: null, score: null, count: 0, incomplete: false },
            vol24h: 0, volSpot: null,
            spotRatio: null, ratioFS: null,
            spotRatioPct: null, ratioFSPct: null,
            incomplete: false, loading: true,
          })
        })
        setContracts(init)
      })
  }, [])

  const recalcPercentiles = useCallback((map: Map<string, ContractData>) => {
    const all = Array.from(map.values())
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

  const loadBatch = useCallback(async (syms: string[], signal?: AbortSignal) => {
    for (let i = 0; i < syms.length; i += BATCH_SIZE) {
      if (signal?.aborted) break
      const batch = syms.slice(i, i + BATCH_SIZE)
      await Promise.allSettled(
        batch.map(async sym => {
          try {
            const res = await fetch(`/api/rsi?symbol=${sym}`, { signal })
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
  }, [recalcPercentiles])

  useEffect(() => {
    if (symbols.length === 0) return
    abortRef.current?.abort()
    abortRef.current = new AbortController()
    setLoadedCount(0)
    loadBatch(symbols, abortRef.current.signal)
  }, [symbols, loadBatch])

  useEffect(() => {
    if (symbols.length === 0) return
    refreshTimer.current = setInterval(async () => {
      setIsRefreshing(true)
      abortRef.current?.abort()
      abortRef.current = new AbortController()
      await loadBatch(symbols, abortRef.current.signal)
      setIsRefreshing(false)
    }, REFRESH_MS)
    return () => { if (refreshTimer.current) clearInterval(refreshTimer.current) }
  }, [symbols, loadBatch])

  function toggleExtraCol(col: ExtraCol) {
    setExtraCols(prev => {
      const next = new Set(prev)
      next.has(col) ? next.delete(col) : next.add(col)
      return next
    })
  }

  function handleSort(key: SortKey) {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir(key === 'symbol' ? 'asc' : 'desc') }
  }

  function applyFilters(c: ContractData): boolean {
    const md = c.daily?.live !== null ? (c.daily.live ?? 0) / 10 : null
    const mw = c.weekly?.live !== null ? (c.weekly.live ?? 0) / 10 : null
    const mdPrev = c.daily?.history?.slice(-1)[0]
    const mwPrev = c.weekly?.history?.slice(-1)[0]
    const sd = c.daily?.score !== null ? c.daily.score : null
    const sw = c.weekly?.score !== null ? c.weekly.score : null

    if (filters.momentumDLive !== '' && md !== null && md < parseFloat(filters.momentumDLive)) return false
    if (filters.momentumDPrev !== '' && mdPrev !== null && mdPrev !== undefined && (mdPrev/10) < parseFloat(filters.momentumDPrev)) return false
    if (filters.momentumWLive !== '' && mw !== null && mw < parseFloat(filters.momentumWLive)) return false
    if (filters.momentumWPrev !== '' && mwPrev !== null && mwPrev !== undefined && (mwPrev/10) < parseFloat(filters.momentumWPrev)) return false
    if (filters.scorePctD !== '' && sd !== null && sd < parseFloat(filters.scorePctD)) return false
    if (filters.scorePctW !== '' && sw !== null && sw < parseFloat(filters.scorePctW)) return false
    if (!applyVolFilter(c.vol24h ?? 0, filters.vol24hMin)) return false
    return true
  }

  function getSortedRows(): ContractData[] {
    const filtered = Array.from(contracts.values()).filter(c => !c.loading && applyFilters(c))
    return filtered.sort((a, b) => {
      if (sortKey !== 'symbol') {
        if (a.incomplete && !b.incomplete) return 1
        if (!a.incomplete && b.incomplete) return -1
      }
      let va: number | string = 0, vb: number | string = 0
      if (sortKey === 'symbol')    { va = a.symbol;                vb = b.symbol }
      if (sortKey === 'momentumD') { va = a.daily?.score  ?? -1;   vb = b.daily?.score  ?? -1 }
      if (sortKey === 'momentumW') { va = a.weekly?.score ?? -1;   vb = b.weekly?.score ?? -1 }
      if (sortKey === 'vol24h')    { va = a.vol24h ?? 0;           vb = b.vol24h ?? 0 }
      if (sortKey === 'spotRatio') { va = a.spotRatio ?? -1;       vb = b.spotRatio ?? -1 }
      if (sortKey === 'ratioFS')   { va = a.ratioFS ?? 999999;     vb = b.ratioFS ?? 999999 }
      if (typeof va === 'string') return sortDir === 'asc' ? va.localeCompare(vb as string) : (vb as string).localeCompare(va)
      return sortDir === 'asc' ? (va as number) - (vb as number) : (vb as number) - (va as number)
    })
  }

  const sorted    = getSortedRows()
  const pct       = totalSymbols > 0 ? Math.round((loadedCount / totalSymbols) * 100) : 0
  const allLoaded = loadedCount >= totalSymbols && totalSymbols > 0

  // Grid columns based on active extra cols
  const showSpotRatio = extraCols.has('spotRatio' as ExtraCol)
  const showRatioFS   = extraCols.has('ratioFS' as ExtraCol)
  const showMomDPrev  = extraCols.has('momentumDPrev')
  const showMomWPrev  = extraCols.has('momentumWPrev')
  const showScoreD    = extraCols.has('scorePctD')
  const showScoreW    = extraCols.has('scorePctW')

  const colCount = 4 + (showMomDPrev?1:0) + (showMomWPrev?1:0) + (showScoreD?1:0) + (showScoreW?1:0) + (showSpotRatio?1:0) + (showRatioFS?1:0)
  const gridCols = `2fr repeat(${colCount - 1}, 1fr)`

  function ColBtn({ col, label, align }: { col: SortKey; label: string; align?: string }) {
    const active = sortKey === col
    return (
      <button onClick={() => handleSort(col)} style={{
        background: 'none', border: 'none',
        color: active ? 'var(--accent)' : 'var(--text-dim)',
        fontSize: 10, letterSpacing: 2, textTransform: 'uppercase',
        fontFamily: 'Syne, sans-serif', fontWeight: 500,
        cursor: 'pointer',
        display: 'flex', alignItems: 'center',
        justifyContent: align === 'left' ? 'flex-start' : 'center',
        gap: 4, padding: '10px 12px', width: '100%',
        transition: 'color 0.2s, background 0.2s',
      }}
      onMouseEnter={e => {
        const el = e.currentTarget as HTMLButtonElement
        el.style.color = 'var(--accent)'
        el.style.background = theme === 'dark' ? '#0a1428' : '#eef8f2'
      }}
      onMouseLeave={e => {
        const el = e.currentTarget as HTMLButtonElement
        el.style.color = active ? 'var(--accent)' : 'var(--text-dim)'
        el.style.background = 'none'
      }}>
        {label}
        {col === 'symbol' && (
          <span style={{ color: 'var(--text-muted)', fontWeight: 400, fontSize: 10, marginLeft: 4 }}>
            — {totalSymbols > 0 ? totalSymbols : '…'}
          </span>
        )}
        {active && <span style={{ fontSize: 9 }}>{sortDir === 'asc' ? '▲' : '▼'}</span>}
      </button>
    )
  }

  function SimpleColHeader({ label }: { label: string }) {
    return (
      <div style={{
        color: 'var(--text-dim)', fontSize: 10, letterSpacing: 2,
        textTransform: 'uppercase', fontFamily: 'Syne, sans-serif',
        fontWeight: 500, padding: '10px 12px', textAlign: 'center',
      }}>{label}</div>
    )
  }

  return (
    <main style={{ position: 'relative', zIndex: 1, padding: '24px 16px', maxWidth: 1400, margin: '0 auto' }}>

      <div style={{ textAlign: 'center', padding: '28px 0 24px', position: 'relative' }}>
        {/* Bouton thème */}
        <button
          onClick={() => setTheme(t => t === 'dark' ? 'light' : 'dark')}
          title={theme === 'dark' ? 'Mode clair' : 'Mode sombre'}
          style={{
            position: 'absolute', top: 28, right: 0,
            background: 'var(--bg-panel)', border: '1px solid var(--border)',
            color: 'var(--text-muted)', borderRadius: 8,
            padding: '6px 14px', cursor: 'pointer', fontSize: 15,
            transition: 'all 0.2s',
          }}
          onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--accent)'}
          onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--border)'}
        >
          {theme === 'dark' ? '☀️' : '🌙'}
        </button>

        <h1 style={{
          fontSize: 28, fontWeight: 200, color: 'var(--accent)',
          letterSpacing: 10, textTransform: 'uppercase', fontFamily: 'Syne, sans-serif',
        }}>Dipology Capital</h1>
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 6,
          fontSize: 10, color: 'var(--text-muted)', letterSpacing: 3,
          textTransform: 'lowercase', fontWeight: 300,
        }}>
          <span style={{
            width: 5, height: 5, borderRadius: '50%', background: 'var(--green-live)',
            display: 'inline-block', animation: 'livePulse 1.8s infinite',
          }} />
          live
        </div>
      </div>

      {!allLoaded && totalSymbols > 0 && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ height: 2, background: 'var(--border)', borderRadius: 1, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${pct}%`, background: 'var(--accent)', transition: 'width 0.3s ease', borderRadius: 1 }} />
          </div>
          <div style={{ textAlign: 'right', fontSize: 10, color: 'var(--text-dim)', marginTop: 4, letterSpacing: 1 }}>
            {loadedCount} / {totalSymbols} contrats chargés
          </div>
        </div>
      )}

      {isRefreshing && allLoaded && (
        <div style={{ textAlign: 'right', fontSize: 10, color: 'var(--text-dim)', marginBottom: 8, letterSpacing: 1 }}>
          ↻ mise à jour…
        </div>
      )}

      {/* FilterBar */}
      <FilterBar
        filters={filters}
        onChange={setFilters}
        activeCount={sorted.length}
        totalCount={Array.from(contracts.values()).filter(c => !c.loading).length}
      />

      <div style={{ background: 'var(--bg-panel)', border: '1px solid var(--border)', borderRadius: 16, overflow: 'hidden' }}>
        {/* Header */}
        <div style={{
          display: 'grid', gridTemplateColumns: gridCols,
          background: theme === 'dark' ? '#060910' : '#f0faf4',
          borderBottom: '1px solid var(--border)',
        }}>
          <ColBtn col="symbol"    label="Contrat" align="left" />
          <ColBtn col="momentumD" label="Momentum D" />
          <ColBtn col="momentumW" label="Momentum W" />
          <ColBtn col="vol24h"    label="Vol 24H" />
          {showMomDPrev && <SimpleColHeader label="Mom D-1" />}
          {showMomWPrev && <SimpleColHeader label="Mom W-1" />}
          {showScoreD   && <SimpleColHeader label="Score D" />}
          {showScoreW   && <SimpleColHeader label="Score W" />}
          {showSpotRatio && <ColBtn col="spotRatio" label="Spot Ratio" />}
          {showRatioFS   && <ColBtn col="ratioFS"   label="Ratio F/S" />}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '8px' }}>
            <ColumnPicker
              active={extraCols}
              onToggle={toggleExtraCol}
            />
          </div>
        </div>

        <div>
          {sorted.length === 0 && (
            <div style={{ padding: '40px 24px', textAlign: 'center', color: 'var(--text-dim)', fontSize: 12, letterSpacing: 2 }}>
              {allLoaded ? 'aucun résultat' : 'chargement des contrats…'}
            </div>
          )}
          {sorted.map((row, i) => (
            <ScreenerRow
              key={row.symbol}
              data={row}
              index={i}
              extraCols={extraCols}
              gridCols={gridCols}
            />
          ))}
        </div>
      </div>

      <div style={{ textAlign: 'center', marginTop: 24, fontSize: 10, color: 'var(--text-dim)', letterSpacing: 2, fontWeight: 300 }}>
        données binance futures · usdt perpétuel · momentum = rsi ÷ 10
      </div>
    </main>
  )
}
