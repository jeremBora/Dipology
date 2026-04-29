'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import ScreenerRow, { ContractData } from '@/components/ScreenerRow'

type SortKey = 'symbol' | 'rsiD' | 'rsiW' | 'vol24h' | 'spotRatio' | 'ratioFS'
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
  const [sortKey, setSortKey]           = useState<SortKey>('vol24h')
  const [sortDir, setSortDir]           = useState<SortDir>('desc')
  const [loadedCount, setLoadedCount]   = useState(0)
  const [isRefreshing, setIsRefreshing] = useState(false)
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

  function handleSort(key: SortKey) {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir(key === 'symbol' ? 'asc' : 'desc') }
  }

  function getSortedRows(): ContractData[] {
    return Array.from(contracts.values()).sort((a, b) => {
      if (sortKey !== 'symbol') {
        if (a.incomplete && !b.incomplete) return 1
        if (!a.incomplete && b.incomplete) return -1
      }
      let va: number | string = 0, vb: number | string = 0
      if (sortKey === 'symbol')    { va = a.symbol;              vb = b.symbol }
      if (sortKey === 'rsiD')      { va = a.daily?.score  ?? -1; vb = b.daily?.score  ?? -1 }
      if (sortKey === 'rsiW')      { va = a.weekly?.score ?? -1; vb = b.weekly?.score ?? -1 }
      if (sortKey === 'vol24h')    { va = a.vol24h ?? 0;         vb = b.vol24h ?? 0 }
      if (sortKey === 'spotRatio') { va = a.spotRatio ?? -1;     vb = b.spotRatio ?? -1 }
      if (sortKey === 'ratioFS')   { va = a.ratioFS ?? 999999;   vb = b.ratioFS ?? 999999 }
      if (typeof va === 'string') return sortDir === 'asc' ? va.localeCompare(vb as string) : (vb as string).localeCompare(va)
      return sortDir === 'asc' ? (va as number) - (vb as number) : (vb as number) - (va as number)
    })
  }

  const sorted    = getSortedRows()
  const pct       = totalSymbols > 0 ? Math.round((loadedCount / totalSymbols) * 100) : 0
  const allLoaded = loadedCount >= totalSymbols && totalSymbols > 0

  function ColBtn({ col, label, align, tooltip }: {
    col: SortKey; label: string; align?: string; tooltip?: string
  }) {
    const active = sortKey === col
    return (
      <button onClick={() => handleSort(col)} title={tooltip} style={{
        background: 'none', border: 'none',
        color: active ? 'var(--accent)' : 'var(--text-dim)',
        fontSize: 10, letterSpacing: 2, textTransform: 'uppercase',
        fontFamily: 'Syne, sans-serif', fontWeight: 500, cursor: 'pointer',
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

  return (
    <main style={{ position: 'relative', zIndex: 1, padding: '24px 16px', maxWidth: 1300, margin: '0 auto' }}>

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

      {/* Légende percentile */}
      <div style={{ marginBottom: 10, fontSize: 9, color: 'var(--text-dim)', letterSpacing: 1 }}>
        <span style={{ color: '#00e676' }}>■</span> top 20% &nbsp;
        <span style={{ color: '#fff176' }}>■</span> milieu 60% &nbsp;
        <span style={{ color: '#ef5350' }}>■</span> bas 20%
        &nbsp;— couleurs relatives au marché en cours
      </div>

      <div style={{ background: 'var(--bg-panel)', border: '1px solid var(--border)', borderRadius: 16, overflow: 'hidden' }}>
        <div style={{
          display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr 1fr',
          background: theme === 'dark' ? '#060910' : '#f0faf4',
          borderBottom: '1px solid var(--border)',
        }}>
          <ColBtn col="symbol"    label="Contrat"    align="left" />
          <ColBtn col="rsiD"      label="RSI Daily" />
          <ColBtn col="rsiW"      label="RSI Weekly" />
          <ColBtn col="vol24h"    label="Vol 24H" />
          <ColBtn col="spotRatio" label="Spot Ratio"
            tooltip="% spot dans le volume total. Plus c'est élevé = demande réelle. Coloré par percentile relatif." />
          <ColBtn col="ratioFS"   label="Ratio F/S"
            tooltip="Futures ÷ Spot. Plus c'est bas = moins spéculatif. Coloré par percentile relatif." />
        </div>
        <div>
          {sorted.length === 0 && (
            <div style={{ padding: '40px 24px', textAlign: 'center', color: 'var(--text-dim)', fontSize: 12, letterSpacing: 2 }}>
              chargement des contrats…
            </div>
          )}
          {sorted.map((row, i) => <ScreenerRow key={row.symbol} data={row} index={i} />)}
        </div>
      </div>

      <div style={{ textAlign: 'center', marginTop: 24, fontSize: 10, color: 'var(--text-dim)', letterSpacing: 2, fontWeight: 300 }}>
        données binance futures · usdt perpétuel · rsi 14 périodes
      </div>
    </main>
  )
}
