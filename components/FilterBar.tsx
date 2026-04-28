'use client'

export interface Filters {
  momentumDLive: string
  momentumDPrev: string
  momentumWLive: string
  momentumWPrev: string
  scorePctD:     string
  scorePctW:     string
  vol24hMin:     string
  priceUnderS1:  boolean
}

export const defaultFilters: Filters = {
  momentumDLive: '', momentumDPrev: '',
  momentumWLive: '', momentumWPrev: '',
  scorePctD: '', scorePctW: '',
  vol24hMin: '',
  priceUnderS1: false,
}

interface FilterBarProps {
  filters: Filters
  onChange: (f: Filters) => void
  activeCount: number
  totalCount: number
}

function FilterInput({ label, value, onChange, step }: {
  label: string; value: string; onChange: (v: string) => void; step?: number
}) {
  return (
    <div style={{ display:'flex', alignItems:'center', gap:6,
      background:'#071409', border:'1px solid #1a4028', borderRadius:8,
      padding:'5px 10px' }}>
      <span style={{ fontSize:11, color:'#4a9060', whiteSpace:'nowrap',
        letterSpacing:1, fontWeight:600 }}>{label} &gt;</span>
      <input
        type="number" step={step ?? 0.1} min="0"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder="—"
        style={{ width: label.includes('Vol') ? 60 : 38,
          background:'transparent', border:'none', outline:'none',
          color:'#00ff44', fontSize:12, fontFamily:'Space Mono, monospace',
          textAlign:'center', fontWeight:600 }}
      />
    </div>
  )
}

function ToggleBtn({ label, active, onClick }: {
  label: string; active: boolean; onClick: () => void
}) {
  return (
    <button onClick={onClick} style={{
      display:'flex', alignItems:'center', gap:6,
      background: active ? '#ff9f4315' : '#071409',
      border: `1px solid ${active ? '#ff9f4355' : '#1a4028'}`,
      borderRadius:8, padding:'5px 12px', cursor:'pointer',
      color: active ? '#ff9f43' : '#4a9060',
      fontSize:11, letterSpacing:1, fontFamily:'Syne, sans-serif',
      fontWeight:600, transition:'all 0.2s',
    }}>
      <span style={{ fontSize:10 }}>{active ? '✓' : '○'}</span>
      {label}
    </button>
  )
}

export function applyVolFilter(vol24h: number, filter: string): boolean {
  if (filter === '') return true
  const min = parseFloat(filter)
  if (isNaN(min)) return true
  return vol24h >= min * 1_000_000
}

export default function FilterBar({ filters, onChange, activeCount, totalCount }: FilterBarProps) {
  const set = (key: keyof Filters) => (val: string | boolean) =>
    onChange({ ...filters, [key]: val })

  const hasActive = Object.entries(filters).some(([, v]) =>
    typeof v === 'boolean' ? v : v !== ''
  )

  return (
    <div style={{ marginBottom:14 }}>
      <div style={{ display:'flex', flexWrap:'wrap', gap:7, alignItems:'center' }}>
        <FilterInput label="Momentum D"   value={filters.momentumDLive} onChange={set('momentumDLive')} />
        <FilterInput label="Momentum D-1" value={filters.momentumDPrev} onChange={set('momentumDPrev')} />
        <FilterInput label="Momentum W"   value={filters.momentumWLive} onChange={set('momentumWLive')} />
        <FilterInput label="Momentum W-1" value={filters.momentumWPrev} onChange={set('momentumWPrev')} />
        <FilterInput label="Score % D"    value={filters.scorePctD}     onChange={set('scorePctD')} />
        <FilterInput label="Score % W"    value={filters.scorePctW}     onChange={set('scorePctW')} />
        <FilterInput label="Vol 24H (M$)" value={filters.vol24hMin}     onChange={set('vol24hMin')} step={10} />
        <ToggleBtn
          label="Discount Zone"
          active={filters.priceUnderS1}
          onClick={() => set('priceUnderS1')(!filters.priceUnderS1)}
        />

        {hasActive && (
          <button onClick={() => onChange(defaultFilters)} style={{
            background:'none', border:'none', color:'#1a4028',
            fontSize:11, cursor:'pointer', letterSpacing:1,
            fontFamily:'Syne, sans-serif', padding:'5px 8px', fontWeight:600,
          }}>✕ reset</button>
        )}

        <div style={{ marginLeft:'auto', fontSize:11, color:'#1a4028', letterSpacing:1, fontWeight:600 }}>
          {activeCount} / {totalCount}
        </div>
      </div>
    </div>
  )
}
