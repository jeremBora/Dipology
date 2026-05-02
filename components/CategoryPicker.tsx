'use client'

import { useRef, useEffect, useState } from 'react'
import { ALL_CATEGORIES, getCategory } from '@/lib/categories'
import { ContractData } from './ScreenerRow'

interface CategoryPickerProps {
  selected: string | null
  onSelect: (cat: string | null) => void
  contracts: Map<string, ContractData>
}

export default function CategoryPicker({ selected, onSelect, contracts }: CategoryPickerProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [])

  // Calcule le momentum moyen par catégorie
  const catStats = ALL_CATEGORIES.map(cat => {
    const rows = Array.from(contracts.values()).filter(c => {
      if (c.loading || c.incomplete) return false
      return getCategory(c.symbol) === cat
    })
    const momVals = rows
      .map(c => c.daily?.live)
      .filter((v): v is number => v !== null && v !== undefined)
    const avg = momVals.length > 0
      ? momVals.reduce((a, b) => a + b, 0) / momVals.length / 10
      : null
    return { cat, avg, count: rows.length }
  })
  .filter(s => s.count > 0)
  .sort((a, b) => (b.avg ?? -1) - (a.avg ?? -1))

  function momColor(v: number | null) {
    if (v === null) return 'var(--text-dim)'
    if (v >= 6) return '#00e676'
    if (v >= 5) return '#69f0ae'
    if (v >= 4) return '#fff176'
    if (v >= 3) return '#ffb74d'
    return '#ef5350'
  }

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          padding: '5px 14px', borderRadius: 20,
          background: selected ? 'rgba(0,229,255,0.15)' : 'var(--bg-panel)',
          border: `1px solid ${selected ? 'var(--accent)' : 'var(--border)'}`,
          color: selected ? 'var(--accent)' : 'var(--text-muted)',
          fontSize: 11, letterSpacing: 1, cursor: 'pointer',
          fontFamily: "'Dodger', 'Syne', sans-serif", fontWeight: 600,
          transition: 'all 0.2s',
          display: 'flex', alignItems: 'center', gap: 6,
        }}
      >
        {selected ? `${selected} ✕` : 'Catégories ▾'}
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 6px)', left: 0, zIndex: 200,
          background: 'var(--bg-panel)', border: '1px solid var(--border)',
          borderRadius: 10, padding: '8px 0', minWidth: 220,
          boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
        }}>
          {/* Header */}
          <div style={{ padding: '6px 14px 8px', fontSize: 8, letterSpacing: 2, color: 'var(--text-dim)', textTransform: 'uppercase', borderBottom: '1px solid var(--border)', marginBottom: 4 }}>
            Catégories · triées par momentum
          </div>

          {catStats.map(({ cat, avg, count }) => (
            <button
              key={cat}
              onClick={() => { onSelect(selected === cat ? null : cat); setOpen(false) }}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                width: '100%', background: selected === cat ? 'rgba(0,229,255,0.08)' : 'none',
                border: 'none', padding: '8px 14px',
                color: selected === cat ? 'var(--accent)' : 'var(--text-muted)',
                cursor: 'pointer', textAlign: 'left',
                fontFamily: "'Syne', sans-serif", fontSize: 12,
                transition: 'background 0.15s',
              }}
              onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.04)'}
              onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.background = selected === cat ? 'rgba(0,229,255,0.08)' : 'none'}
            >
              {/* Category name */}
              <span style={{ fontWeight: 600, letterSpacing: 1, minWidth: 50 }}>{cat}</span>

              {/* Bar */}
              <div style={{ flex: 1, height: 4, background: 'var(--border)', borderRadius: 2, overflow: 'hidden' }}>
                <div style={{
                  height: '100%', borderRadius: 2,
                  width: avg !== null ? `${Math.min((avg / 10) * 100, 100)}%` : '0%',
                  background: momColor(avg),
                  transition: 'width 0.4s ease',
                }} />
              </div>

              {/* Avg momentum */}
              <span style={{
                fontFamily: "'Space Mono', monospace", fontSize: 11, fontWeight: 700,
                color: momColor(avg), minWidth: 32, textAlign: 'right',
              }}>
                {avg !== null ? avg.toFixed(1) : '—'}
              </span>

              {/* Count */}
              <span style={{ fontSize: 9, color: 'var(--text-dim)', minWidth: 24, textAlign: 'right' }}>
                {count}
              </span>
            </button>
          ))}

          {/* Clear */}
          {selected && (
            <>
              <div style={{ height: 1, background: 'var(--border)', margin: '6px 0' }} />
              <button
                onClick={() => { onSelect(null); setOpen(false) }}
                style={{
                  display: 'block', width: '100%', background: 'none', border: 'none',
                  padding: '7px 14px', color: 'var(--text-dim)', fontSize: 11,
                  cursor: 'pointer', textAlign: 'left',
                  fontFamily: "'Syne', sans-serif", letterSpacing: 1,
                }}
              >✕ Effacer filtre</button>
            </>
          )}
        </div>
      )}
    </div>
  )
}
