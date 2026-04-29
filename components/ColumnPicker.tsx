'use client'
import { useState, useRef, useEffect } from 'react'

export type ExtraCol =
  | 'momentumDPrev'
  | 'momentumWPrev'
  | 'scorePctD'
  | 'scorePctW'
  | 'spotRatio'
  | 'ratioFS'

export const EXTRA_COL_LABELS: Record<ExtraCol, string> = {
  momentumDPrev: 'Momentum D-1',
  momentumWPrev: 'Momentum W-1',
  scorePctD:     'Score % D',
  scorePctW:     'Score % W',
  spotRatio:     'Spot Ratio',
  ratioFS:       'Ratio F/S',
}

interface ColumnPickerProps {
  active: Set<ExtraCol>
  onToggle: (col: ExtraCol) => void
}

export default function ColumnPicker({ active, onToggle }: ColumnPickerProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [])

  return (
    <div ref={ref} style={{ position:'relative' }}>
      <button onClick={() => setOpen(o => !o)} style={{
        background: open ? '#00ff4415' : '#071409',
        border: `1px solid ${open ? '#00ff4455' : '#1a4028'}`,
        borderRadius:6, color: open ? '#00ff44' : '#4a9060',
        fontSize:18, lineHeight:1, padding:'2px 10px', cursor:'pointer',
        fontFamily:'Syne, sans-serif', transition:'all 0.2s', fontWeight:400,
      }} title="Add columns">+</button>

      {open && (
        <div style={{ position:'absolute', right:0, top:'calc(100% + 6px)', zIndex:100,
          background:'#040d06', border:'1px solid #0a2010', borderRadius:10,
          padding:'8px 0', minWidth:200, boxShadow:'0 8px 32px #000000aa' }}>
          {(Object.entries(EXTRA_COL_LABELS) as [ExtraCol, string][]).map(([col, label]) => (
            <button key={col} onClick={() => onToggle(col)} style={{
              display:'flex', alignItems:'center', gap:8, width:'100%',
              background:'none', border:'none', padding:'8px 14px',
              color: active.has(col) ? '#00ff44' : '#4a9060',
              fontSize:12, letterSpacing:1, fontFamily:'Syne, sans-serif',
              cursor:'pointer', textAlign:'left', transition:'color 0.15s', fontWeight:600,
            }}
            onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.background = '#071409'}
            onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.background = 'none'}>
              <span style={{ fontSize:10, width:12, color: active.has(col) ? '#00ff44' : '#1a4028' }}>
                {active.has(col) ? '✓' : '○'}
              </span>
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
