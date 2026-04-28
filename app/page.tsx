'use client'

import { useEffect, useRef, useState, useCallback, memo } from 'react'
import ScreenerRow, { ContractData } from '@/components/ScreenerRow'
import FilterBar, { Filters, defaultFilters, applyVolFilter } from '@/components/FilterBar'
import ColumnPicker, { ExtraCol } from '@/components/ColumnPicker'

type SortKey = 'symbol' | 'momentumDLive' | 'momentumWLive' | 'vol24h' | 'momentumDPrev' | 'momentumWPrev' | 'scorePctD' | 'scorePctW'
type SortDir = 'asc' | 'desc'

const BATCH_SIZE = 15
const REFRESH_MS = 60000

function buildGrid(extraCols: Set<ExtraCol>): string {
  const base = '2fr 1fr 1fr 1fr'
  const extras = Array.from(extraCols).map(() => '1fr').join(' ')
  return extras ? base + ' ' + extras + ' 44px' : base + ' 44px'
}

function applyFilters(rows: ContractData[], f: Filters): ContractData[] {
  return rows.filter(d => {
    if (d.loading) return true
    const mDL  = d.daily?.liveT   ?? null
    const mDPr = d.daily?.prevT   ?? null
    const mWL  = d.weekly?.liveT  ?? null
    const mWPr = d.weekly?.prevT  ?? null
    const sPD  = d.daily?.score   ?? null
    const sPW  = d.weekly?.score  ?? null
    if (f.momentumDLive !== '' && (mDL  === null || mDL  < parseFloat(f.momentumDLive))) return false
    if (f.momentumDPrev !== '' && (mDPr === null || mDPr < parseFloat(f.momentumDPrev))) return false
    if (f.momentumWLive !== '' && (mWL  === null || mWL  < parseFloat(f.momentumWLive))) return false
    if (f.momentumWPrev !== '' && (mWPr === null || mWPr < parseFloat(f.momentumWPrev))) return false
    if (f.scorePctD !== '' && (sPD === null || sPD < parseFloat(f.scorePctD))) return false
    if (f.scorePctW !== '' && (sPW === null || sPW < parseFloat(f.scorePctW))) return false
    if (f.vol24hMin !== '' && !applyVolFilter(d.vol24h ?? 0, f.vol24hMin)) return false
    if (f.priceUnderS1 && !d.pivot?.priceUnderS1) return false
    return true
  })
}

// CSS injecté une seule fois pour les boutons du header
const headerBtnStyle = `
  .hdr-btn {
    display: flex;
    align-items: center;
    width: 100%;
    gap: 4px;
    padding: 12px 12px;
    cursor: pointer;
    color: #4a9060;
    font-size: 11px;
    letter-spacing: 2px;
    text-transform: uppercase;
    font-family: Syne, sans-serif;
    font-weight: 700;
    user-select: none;
    background: transparent;
    border: none;
    border-right: 1px solid #0a2010;
    outline: none;
    transition: color 0.15s, background 0.15s;
  }
  .hdr-btn:hover { color: #00ff44 !important; background: #071409 !important; }
  .hdr-btn.active { color: #00ff44; }
  .hdr-btn.center { justify-content: center; }
  .hdr-btn.left   { justify-content: flex-start; }
`

interface HeaderProps {
  gridCols:    string
  sortKey:     SortKey
  sortDir:     SortDir
  totalSymbols: number
  extraCols:   Set<ExtraCol>
  onSort:      (col: SortKey) => void
  onToggle:    (col: ExtraCol) => void
}

const ScreenerHeader = memo(function ScreenerHeader({
  gridCols, sortKey, sortDir, totalSymbols, extraCols, onSort, onToggle
}: HeaderProps) {
  function ColBtn({ col, label, center }: { col: SortKey; label: string; center?: boolean }) {
    const active = sortKey === col
    return (
      <button
        onClick={() => onSort(col)}
        className={`hdr-btn ${active ? 'active' : ''} ${center ? 'center' : 'left'}`}>
        {label}
        {col === 'symbol' && (
          <span style={{ color:'#1a4028', fontWeight:600, fontSize:11, marginLeft:6 }}>
            — {totalSymbols || '…'}
          </span>
        )}
        {active && <span style={{ fontSize:9, marginLeft:3 }}>{sortDir === 'asc' ? '▲' : '▼'}</span>}
      </button>
    )
  }

  return (
    <div style={{ display:'grid', gridTemplateColumns: gridCols, background:'#030805', borderBottom:'1px solid #0a2010' }}>
      <ColBtn col="symbol"        label="Contract" />
      <ColBtn col="momentumDLive" label="Momentum D" center />
      <ColBtn col="momentumWLive" label="Momentum W" center />
      <ColBtn col="vol24h"        label="Vol 24H"    center />
      {extraCols.has('momentumDPrev') && <ColBtn col="momentumDPrev" label="Momentum D-1" center />}
      {extraCols.has('momentumWPrev') && <ColBtn col="momentumWPrev" label="Momentum W-1" center />}
      {extraCols.has('scorePctD')     && <ColBtn col="scorePctD"     label="Score % D"    center />}
      {extraCols.has('scorePctW')     && <ColBtn col="scorePctW"     label="Score % W"    center />}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'center', padding:'6px 8px' }}>
        <ColumnPicker active={extraCols} onToggle={onToggle} />
      </div>
    </div>
  )
})

export default function Home() {
  const [contracts, setContracts]       = useState<Map<string, ContractData>>(new Map())
  const [symbols, setSymbols]           = useState<string[]>([])
  const [totalSymbols, setTotalSymbols] = useState(0)
  const [sortKey, setSortKey]           = useState<SortKey>('vol24h')
  const [sortDir, setSortDir]           = useState<SortDir>('desc')
  const [loadedCount, setLoadedCount]   = useState(0)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [filters, setFilters]           = useState<Filters>(defaultFilters)
  const [extraCols, setExtraCols]       = useState<Set<ExtraCol>>(new Set())
  const refreshTimer = useRef<ReturnType<typeof setInterval> | null>(null)
  const abortRef     = useRef<AbortController | null>(null)

  useEffect(() => {
    fetch('/api/symbols').then(r => r.json()).then(data => {
      setSymbols(data.symbols)
      setTotalSymbols(data.total)
      const init = new Map<string, ContractData>()
      data.symbols.forEach((sym: string) => {
        init.set(sym, {
          symbol: sym,
          daily:   { history:[], historyT:[], live:null, liveT:null, prev:null, prevT:null, score:null, count:0, incomplete:false },
          weekly:  { history:[], historyT:[], live:null, liveT:null, prev:null, prevT:null, score:null, count:0, incomplete:false },
          pivot:   { s1:null, priceUnderS1:false },
          vol24h:0, incomplete:false, currentPrice:0, loading:true,
        })
      })
      setContracts(init)
    })
  }, [])

  const loadBatch = useCallback(async (syms: string[], signal?: AbortSignal) => {
    for (let i = 0; i < syms.length; i += BATCH_SIZE) {
      if (signal?.aborted) break
      const batch = syms.slice(i, i + BATCH_SIZE)
      await Promise.allSettled(batch.map(async sym => {
        try {
          const res = await fetch(`/api/rsi?symbol=${sym}`, { signal })
          if (!res.ok) return
          const data = await res.json()
          setContracts(prev => { const next = new Map(prev); next.set(sym, { ...data, loading:false }); return next })
          setLoadedCount(c => c + 1)
        } catch { /* ignore */ }
      }))
    }
  }, [])

  useEffect(() => {
    if (!symbols.length) return
    abortRef.current?.abort()
    abortRef.current = new AbortController()
    setLoadedCount(0)
    loadBatch(symbols, abortRef.current.signal)
  }, [symbols, loadBatch])

  useEffect(() => {
    if (!symbols.length) return
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
    setExtraCols(prev => { const next = new Set(prev); if (next.has(col)) next.delete(col); else next.add(col); return next })
  }

  function handleSort(key: SortKey) {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir(key === 'symbol' ? 'asc' : 'desc') }
  }

  function getSortedRows(): ContractData[] {
    const filtered = applyFilters(Array.from(contracts.values()), filters)
    return filtered.sort((a, b) => {
      if (sortKey !== 'symbol') {
        if (a.incomplete && !b.incomplete) return 1
        if (!a.incomplete && b.incomplete) return -1
      }
      let va: number | string = 0, vb: number | string = 0
      if (sortKey === 'symbol')        { va = a.symbol;              vb = b.symbol }
      if (sortKey === 'momentumDLive') { va = a.daily?.live  ?? -1;  vb = b.daily?.live  ?? -1 }
      if (sortKey === 'momentumWLive') { va = a.weekly?.live ?? -1;  vb = b.weekly?.live ?? -1 }
      if (sortKey === 'momentumDPrev') { va = a.daily?.prev  ?? -1;  vb = b.daily?.prev  ?? -1 }
      if (sortKey === 'momentumWPrev') { va = a.weekly?.prev ?? -1;  vb = b.weekly?.prev ?? -1 }
      if (sortKey === 'scorePctD')     { va = a.daily?.score ?? -1;  vb = b.daily?.score ?? -1 }
      if (sortKey === 'scorePctW')     { va = a.weekly?.score ?? -1; vb = b.weekly?.score ?? -1 }
      if (sortKey === 'vol24h')        { va = a.vol24h ?? 0;         vb = b.vol24h ?? 0 }
      if (typeof va === 'string') return sortDir === 'asc' ? va.localeCompare(vb as string) : (vb as string).localeCompare(va)
      return sortDir === 'asc' ? (va as number) - (vb as number) : (vb as number) - (va as number)
    })
  }

  const sorted    = getSortedRows()
  const allRows   = Array.from(contracts.values())
  const filtered  = applyFilters(allRows, filters)
  const pct       = totalSymbols > 0 ? Math.round((loadedCount / totalSymbols) * 100) : 0
  const allLoaded = loadedCount >= totalSymbols && totalSymbols > 0
  const gridCols  = buildGrid(extraCols)

  return (
    <main style={{ position:'relative', zIndex:1, padding:'24px 16px', maxWidth:1400, margin:'0 auto' }}>
      <style>{headerBtnStyle}</style>

      <div style={{ textAlign:'center', padding:'28px 0 20px' }}>
        <h1 style={{ fontFamily:'Dodger, Syne, sans-serif', fontSize:36, fontWeight:'normal',
          color:'#00ff44', letterSpacing:6, textTransform:'uppercase',
          textShadow:'0 0 30px #00ff4466, 0 0 60px #00ff4422' }}>
          Dipology Screener
        </h1>
        <div style={{ display:'inline-flex', alignItems:'center', gap:6, marginTop:8,
          fontSize:10, color:'#4a9060', letterSpacing:3, textTransform:'lowercase', fontWeight:600 }}>
          <span style={{ width:5, height:5, borderRadius:'50%', background:'#00ff88',
            display:'inline-block', animation:'livePulse 1.8s infinite' }} />
          live
        </div>
      </div>

      <FilterBar filters={filters} onChange={setFilters}
        activeCount={filtered.filter(d => !d.loading).length}
        totalCount={allRows.filter(d => !d.loading).length} />

      {!allLoaded && totalSymbols > 0 && (
        <div style={{ marginBottom:10 }}>
          <div style={{ height:2, background:'#0a2010', borderRadius:1, overflow:'hidden' }}>
            <div style={{ height:'100%', width:`${pct}%`, background:'#00ff44', transition:'width 0.3s ease', borderRadius:1 }} />
          </div>
          <div style={{ textAlign:'right', fontSize:11, color:'#1a4028', marginTop:4, letterSpacing:1, fontWeight:600 }}>
            {loadedCount} / {totalSymbols} chargés
          </div>
        </div>
      )}
      {isRefreshing && allLoaded && (
        <div style={{ textAlign:'right', fontSize:11, color:'#1a4028', marginBottom:6, letterSpacing:1 }}>↻ updating…</div>
      )}

      <div style={{ background:'#040d06', border:'1px solid #0a2010', borderRadius:16, overflow:'hidden' }}>
        <ScreenerHeader
          gridCols={gridCols}
          sortKey={sortKey}
          sortDir={sortDir}
          totalSymbols={totalSymbols}
          extraCols={extraCols}
          onSort={handleSort}
          onToggle={toggleExtraCol}
        />

        <div>
          {sorted.length === 0 && (
            <div style={{ padding:'40px 24px', textAlign:'center', color:'#1a4028', fontSize:12, letterSpacing:2, fontWeight:600 }}>
              {allRows.filter(d => !d.loading).length > 0 ? 'no contracts match the filters' : 'loading contracts…'}
            </div>
          )}
          {sorted.map((row, i) => (
            <ScreenerRow key={row.symbol} data={row} index={i} extraCols={extraCols} gridCols={gridCols} />
          ))}
        </div>
      </div>
    </main>
  )
}
