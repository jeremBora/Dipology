'use client'
import { useState } from 'react'
import HeatmapRow from './HeatmapRow'
import type { ExtraCol } from './ColumnPicker'

export interface RsiData {
  history:  (number | null)[]
  historyT: (number | null)[]
  live:     number | null
  liveT:    number | null
  prev:     number | null
  prevT:    number | null
  score:    number | null
  count:    number
  incomplete: boolean
}

export interface ContractData {
  symbol:       string
  daily:        RsiData
  weekly:       RsiData
  pivot:        { s1: number | null; priceUnderS1: boolean }
  vol24h:       number
  incomplete:   boolean
  currentPrice: number
  loading?:     boolean
  error?:       boolean
}

function formatVol(v: number): string {
  if (v >= 1e9) return '$' + (v / 1e9).toFixed(2) + 'B'
  if (v >= 1e6) return '$' + (v / 1e6).toFixed(1) + 'M'
  return '$' + (v / 1e3).toFixed(0) + 'K'
}

function formatPrice(v: number): string {
  if (v >= 1000) return v.toFixed(0)
  if (v >= 1)    return v.toFixed(3)
  return v.toPrecision(4)
}

function MomentumCell({ value, raw }: { value: number | null; raw: number | null }) {
  if (value === null || raw === null) return <span style={{ color:'#1a4028' }}>—</span>
  const color = raw >= 50
    ? `rgb(${Math.round(140 + raw * 0.5)},255,${Math.round(140 + raw * 0.5)})`
    : `rgb(255,${Math.round(120 + raw * 0.7)},${Math.round(120 + raw * 0.7)})`
  return <span style={{ color }}>{value.toFixed(1)}</span>
}

export default function ScreenerRow({ data, index, extraCols, gridCols }: {
  data: ContractData; index: number; extraCols: Set<ExtraCol>; gridCols: string
}) {
  const [open, setOpen] = useState(false)
  const base = data.symbol.replace('USDT', '')
  const inDiscount = data.pivot?.priceUnderS1

  return (
    <div className="row-animate"
      style={{ borderBottom:'1px solid #07120a', animationDelay:`${Math.min(index * 15, 300)}ms` }}>

      <div onClick={() => !data.loading && setOpen(o => !o)}
        style={{ display:'grid', gridTemplateColumns: gridCols,
          padding:'11px 20px', cursor: data.loading ? 'default' : 'pointer',
          background: open ? '#071409' : 'transparent',
          borderBottom: open ? '1px solid #0a2010' : 'none',
          transition:'background 0.15s', alignItems:'center', gap:0 }}
        onMouseEnter={e => { if (!open) (e.currentTarget as HTMLDivElement).style.background = '#071409' }}
        onMouseLeave={e => { if (!open) (e.currentTarget as HTMLDivElement).style.background = 'transparent' }}>

        {/* Contrat */}
        <div style={{ display:'flex', alignItems:'center', gap:8, borderRight:'1px solid #0a2010', paddingRight:12 }}>
          <span style={{ fontSize:9, color: open ? '#00ff4466' : '#1a4028',
            transition:'transform 0.2s', display:'inline-block',
            transform: open ? 'rotate(90deg)' : 'none' }}>▶</span>
          <span style={{ fontSize:13, fontWeight:700, color:'#d0f0d8', letterSpacing:0.5 }}>{base}</span>
          <span style={{ fontSize:11, fontWeight:600, color:'#4a9060', letterSpacing:1 }}>/usdt</span>
          {inDiscount && (
            <span style={{ fontSize:9, color:'#ff9f43', border:'1px solid #ff9f4355',
              background:'#ff9f4315', padding:'2px 7px', borderRadius:3,
              letterSpacing:1, fontWeight:700 }}>Discount Zone</span>
          )}
          {data.incomplete && (
            <span style={{ fontSize:9, color:'#ff9f43', border:'1px solid #ff9f4333',
              background:'#ff9f4310', padding:'1px 6px', borderRadius:3, letterSpacing:1 }}>missing data</span>
          )}
        </div>

        {/* Momentum D */}
        <div style={{ textAlign:'center', fontSize:13, fontWeight:600, borderRight:'1px solid #0a2010', padding:'0 8px' }}>
          {data.loading ? <span style={{ color:'#1a4028' }}>…</span>
            : <MomentumCell value={data.daily?.liveT ?? null} raw={data.daily?.live ?? null} />}
        </div>

        {/* Momentum W */}
        <div style={{ textAlign:'center', fontSize:13, fontWeight:600, borderRight:'1px solid #0a2010', padding:'0 8px' }}>
          {data.loading ? <span style={{ color:'#1a4028' }}>…</span>
            : <MomentumCell value={data.weekly?.liveT ?? null} raw={data.weekly?.live ?? null} />}
        </div>

        {/* Vol 24H */}
        <div style={{ textAlign:'center', fontSize:12, fontWeight:600, color:'#4a9060',
          borderRight: extraCols.size > 0 ? '1px solid #0a2010' : 'none', padding:'0 8px' }}>
          {data.loading ? <span style={{ color:'#1a4028' }}>…</span> : formatVol(data.vol24h || 0)}
        </div>

        {/* Colonnes optionnelles */}
        {extraCols.has('momentumDPrev') && (
          <div style={{ textAlign:'center', fontSize:12, fontWeight:600, borderRight:'1px solid #0a2010', padding:'0 8px' }}>
            {data.loading ? '…' : <MomentumCell value={data.daily?.prevT ?? null} raw={data.daily?.prev ?? null} />}
          </div>
        )}
        {extraCols.has('momentumWPrev') && (
          <div style={{ textAlign:'center', fontSize:12, fontWeight:600, borderRight:'1px solid #0a2010', padding:'0 8px' }}>
            {data.loading ? '…' : <MomentumCell value={data.weekly?.prevT ?? null} raw={data.weekly?.prev ?? null} />}
          </div>
        )}
        {extraCols.has('scorePctD') && (
          <div style={{ textAlign:'center', fontSize:12, fontWeight:600, borderRight:'1px solid #0a2010', padding:'0 8px' }}>
            {data.loading ? '…' : data.daily?.score != null
              ? <MomentumCell value={data.daily.score} raw={data.daily.score} />
              : <span style={{ color:'#1a4028' }}>—</span>}
          </div>
        )}
        {extraCols.has('scorePctW') && (
          <div style={{ textAlign:'center', fontSize:12, fontWeight:600, padding:'0 8px' }}>
            {data.loading ? '…' : data.weekly?.score != null
              ? <MomentumCell value={data.weekly.score} raw={data.weekly.score} />
              : <span style={{ color:'#1a4028' }}>—</span>}
          </div>
        )}
      </div>

      {/* Heatmap */}
      {open && !data.loading && (
        <div className="heatmap-animate" style={{ padding:'16px 20px 20px', background:'#030805', borderTop:'1px solid #0a2010' }}>

          {/* Prix + Discount Zone */}
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:14 }}>
            <div style={{ fontSize:10, color:'#4a9060', letterSpacing:3, textTransform:'uppercase', fontWeight:600 }}>
              {base} / usdt — momentum heatmap
            </div>
            <div style={{ display:'flex', gap:16, alignItems:'center' }}>
              <div style={{ display:'flex', flexDirection:'column', alignItems:'flex-end', gap:2 }}>
                <span style={{ fontSize:9, color:'#2a5035', letterSpacing:2, textTransform:'uppercase', fontWeight:600 }}>Price</span>
                <span style={{ fontSize:14, fontWeight:700, color:'#d0f0d8', letterSpacing:0.5, fontFamily:'Space Mono, monospace' }}>
                  {formatPrice(data.currentPrice)}
                </span>
              </div>
              {data.pivot?.s1 != null && (
                <div style={{ display:'flex', flexDirection:'column', alignItems:'flex-end', gap:2 }}>
                  <span style={{ fontSize:9, letterSpacing:2, textTransform:'uppercase', fontWeight:600,
                    color: inDiscount ? '#ff9f43' : '#2a5035' }}>Discount Zone</span>
                  <span style={{ fontSize:14, fontWeight:700, letterSpacing:0.5,
                    fontFamily:'Space Mono, monospace',
                    color: inDiscount ? '#ff9f43' : '#4a9060' }}>
                    {formatPrice(data.pivot.s1)}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Badge Discount Zone si actif */}
          {inDiscount && (
            <div style={{ marginBottom:12 }}>
              <span style={{ fontSize:10, fontWeight:700, color:'#ff9f43',
                background:'#ff9f4315', border:'1px solid #ff9f4344',
                padding:'3px 10px', borderRadius:4, letterSpacing:1.5 }}>
                DISCOUNT ZONE
              </span>
            </div>
          )}

          {/* En-têtes heatmap */}
          <div style={{ display:'flex', gap:3, alignItems:'center', marginBottom:6 }}>
            <div style={{ width:18, flexShrink:0 }} />
            {Array(9).fill(0).map((_, i) => (
              <div key={i} style={{ flex:1, textAlign:'center', fontSize:12,
                color:'#4a7055', fontWeight:700, letterSpacing:0.5 }}>
                -{9 - i}
              </div>
            ))}
            <div style={{ width:1, margin:'0 2px', flexShrink:0, opacity:0 }} />
            <div style={{ flex:1, textAlign:'center', fontSize:12, color:'#4a9060', fontWeight:700 }}>now</div>
            <div style={{ flex:1.5, textAlign:'center', fontSize:12, color:'#4a9060', fontWeight:700 }}>score</div>
          </div>

          <HeatmapRow label="D" historyT={data.daily.historyT} liveT={data.daily.liveT}
            score={data.daily.score} history={data.daily.history} live={data.daily.live} />
          <div style={{ marginTop:5 }}>
            <HeatmapRow label="W" historyT={data.weekly.historyT} liveT={data.weekly.liveT}
              score={data.weekly.score} history={data.weekly.history} live={data.weekly.live} />
          </div>
        </div>
      )}
    </div>
  )
}
