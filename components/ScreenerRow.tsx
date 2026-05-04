'use client'

import { useState } from 'react'
import { ExtraCol } from './ColumnPicker'


// Harmonized momentum color using CSS variables (works in both light and dark mode)
function momColor(v: number): string {
  if (v >= 60) return 'var(--num-green)'
  if (v >= 50) return 'var(--num-green)'
  if (v >= 40) return '#c8a800'
  if (v >= 30) return 'var(--num-red)'
  return 'var(--num-red)'
}

const HeatmapRow = require('./HeatmapRow').default as (props: {
  label: string
  historyT: (number | null)[]
  liveT: number | null
  history: (number | null)[]
  live: number | null
  score: number | null
}) => React.ReactElement

interface RsiData {
  history: (number | null)[]
  live: number | null
  score: number | null
  count: number
  incomplete: boolean
}

export interface ContractData {
  symbol: string
  daily: RsiData
  weekly: RsiData
  vol24h: number
  volSpot: number | null
  spotRatio: number | null
  ratioFS: number | null
  spotRatioPct: number | null
  ratioFSPct: number | null
  incomplete: boolean
  loading?: boolean
  error?: boolean
  isSpecial?: boolean
  dominance?: number
  volAllExchanges?: number | null
  isRWA?: boolean
}

function formatVol(v: number | null | undefined): string {
  if (!v || v === 0) return '—'
  if (v >= 1e9) return '$' + (v / 1e9).toFixed(2) + 'B'
  if (v >= 1e6) return '$' + (v / 1e6).toFixed(1) + 'M'
  if (v >= 1e3) return '$' + (v / 1e3).toFixed(0) + 'K'
  return '$' + v.toFixed(0)
}

// Momentum = RSI ÷ 10, displayed with Syne font for better readability
function fmtMom(v: number | null | undefined): string {
  if (v === null || v === undefined) return '—'
  return (v / 10).toFixed(2)
}

function percentileColor(pct: number): string {
  if (pct >= 80) return 'var(--num-green)'
  if (pct >= 60) return 'var(--num-green)'
  if (pct >= 40) return '#c8a800'
  if (pct >= 20) return 'var(--num-red)'
  return 'var(--num-red)'
}


export default function ScreenerRow({
  data, index, extraCols, gridCols, forceOpen, isPinned, isFavorite, onToggleFavorite
}: {
  data: ContractData
  index: number
  extraCols: Set<ExtraCol>
  gridCols: string
  forceOpen?: boolean
  isPinned?: boolean
  isFavorite?: boolean
  onToggleFavorite?: () => void
  showVolAll?: boolean
  compositeScore?: number | null
  rank?: number
}) {
  const [open, setOpen] = useState(false)
  const isOpen = forceOpen || open
  const base = data.symbol.replace('USDT', '').replace(/^1000/, '')

  const dLive   = data.daily?.live
  const wLive   = data.weekly?.live
  const dHist   = data.daily?.history ?? []
  const wHist   = data.weekly?.history ?? []
  const dPrev   = dHist.length > 0 ? dHist[dHist.length - 1] : null
  const wPrev   = wHist.length > 0 ? wHist[wHist.length - 1] : null
  const dScore  = data.daily?.score
  const wScore  = data.weekly?.score
  const srPct   = data.spotRatioPct
  const fsPct   = data.ratioFSPct

  const showMomDPrev  = extraCols.has('momentumDPrev')
  const showMomWPrev  = extraCols.has('momentumWPrev')
  const showScoreD    = extraCols.has('scorePctD')
  const showScoreW    = extraCols.has('scorePctW')
  const showSpotRatio = extraCols.has('spotRatio' as ExtraCol)
  const showRatioFS   = extraCols.has('ratioFS' as ExtraCol)
  const showVolSpot   = extraCols.has('volSpot' as ExtraCol)

  const dim = { color: 'var(--text-dim)', fontSize: 11, fontFamily: "'Space Mono', monospace" }

  return (
    <div
      className="row-animate"
      style={{ borderBottom: '1px solid var(--border)', animationDelay: `${Math.min(index * 20, 400)}ms` }}
    >
      <div
        onClick={() => !data.loading && !forceOpen && setOpen(o => !o)}
        style={{
          display: 'grid', gridTemplateColumns: gridCols,
          padding: '9px 16px',
          cursor: (data.loading || forceOpen) ? 'default' : 'pointer',
          background: isOpen ? 'var(--bg-row-hover)' : 'transparent',
          borderBottom: isOpen ? '1px solid var(--border)' : 'none',
          transition: 'background 0.15s', alignItems: 'center',
        }}
        onMouseEnter={e => { if (!isOpen && !forceOpen) (e.currentTarget as HTMLDivElement).style.background = 'var(--bg-row-hover)' }}
        onMouseLeave={e => { if (!isOpen && !forceOpen) (e.currentTarget as HTMLDivElement).style.background = 'transparent' }}
      >
        {/* Contrat */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {/* Favorite star */}
          <button
            onClick={e => { e.stopPropagation(); onToggleFavorite?.() }}
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: isFavorite ? '#f0a020' : 'var(--text-dim)', padding: '0 2px', lineHeight: 1, flexShrink: 0 }}
          >{isFavorite ? '★' : '☆'}</button>

          {rank !== undefined && (
            <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 9, color: rank <= 5 ? 'var(--accent)' : 'var(--text-dim)', minWidth: 16, textAlign: 'right', flexShrink: 0 }}>
              {rank}
            </span>
          )}
          {!forceOpen && (
            <span style={{ fontSize: 7, color: isOpen ? 'var(--accent-dim)' : 'var(--text-dim)', display: 'inline-block', transform: isOpen ? 'rotate(90deg)' : 'none', transition: 'transform 0.2s', flexShrink: 0 }}>▶</span>
          )}

          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', letterSpacing: 0.5, fontFamily: "'Space Mono', monospace" }}>{base}</span>
          <span style={{ fontSize: 9, fontWeight: 300, color: 'var(--text-muted)', letterSpacing: 1, textTransform: 'lowercase' }}>/usdt</span>

          {data.incomplete && (
            <span style={{ fontSize: 8, background: 'var(--warn-bg)', color: 'var(--warn)', border: '1px solid var(--warn-border)', padding: '1px 5px', borderRadius: 3, letterSpacing: 0.5, flexShrink: 0 }}>!</span>
          )}
        </div>

        {/* Momentum D */}
        <div style={{ textAlign: 'right' }}>
          {data.loading ? <span style={dim}>…</span>
            : dLive !== null && dLive !== undefined
            ? <span style={{ color: momColor(dLive), fontFamily: "'Space Mono', monospace", fontSize: 13, fontWeight: 700 }}>{fmtMom(dLive)}</span>
            : <span style={dim}>—</span>}
        </div>

        {/* Momentum W */}
        <div style={{ textAlign: 'right' }}>
          {data.loading ? <span style={dim}>…</span>
            : wLive !== null && wLive !== undefined
            ? <span style={{ color: momColor(wLive), fontFamily: "'Space Mono', monospace", fontSize: 13, fontWeight: 700 }}>{fmtMom(wLive)}</span>
            : <span style={dim}>—</span>}
        </div>

        {/* F Vol 24H */}
        <div style={{ textAlign: 'right', fontFamily: "'Space Mono', monospace", fontSize: 11, color: 'var(--text-muted)' }}>
          {data.loading ? <span style={dim}>…</span> : formatVol(data.vol24h)}
        </div>

        {/* S Vol 24H */}
        {showVolSpot && (
          <div style={{ textAlign: 'right', fontFamily: "'Space Mono', monospace", fontSize: 11, color: 'var(--text-muted)' }}>
            {data.loading ? <span style={dim}>…</span> : formatVol(data.volSpot)}
          </div>
        )}

        {/* Mom D-1 */}
        {showMomDPrev && (
          <div style={{ textAlign: 'right' }}>
            {data.loading ? <span style={dim}>…</span>
              : dPrev !== null && dPrev !== undefined
              ? <span style={{ color: momColor(dPrev), fontFamily: "'Space Mono', monospace", fontSize: 12 }}>{fmtMom(dPrev)}</span>
              : <span style={dim}>—</span>}
          </div>
        )}

        {/* Mom W-1 */}
        {showMomWPrev && (
          <div style={{ textAlign: 'right' }}>
            {data.loading ? <span style={dim}>…</span>
              : wPrev !== null && wPrev !== undefined
              ? <span style={{ color: momColor(wPrev), fontFamily: "'Space Mono', monospace", fontSize: 12 }}>{fmtMom(wPrev)}</span>
              : <span style={dim}>—</span>}
          </div>
        )}

        {/* Score D */}
        {showScoreD && (
          <div style={{ textAlign: 'right' }}>
            {data.loading ? <span style={dim}>…</span>
              : dScore !== null && dScore !== undefined
              ? <span style={{ color: momColor(dScore), fontFamily: "'Space Mono', monospace", fontSize: 12 }}>{dScore.toFixed(1)}%</span>
              : <span style={dim}>—</span>}
          </div>
        )}

        {/* Score W */}
        {showScoreW && (
          <div style={{ textAlign: 'right' }}>
            {data.loading ? <span style={dim}>…</span>
              : wScore !== null && wScore !== undefined
              ? <span style={{ color: momColor(wScore), fontFamily: "'Space Mono', monospace", fontSize: 12 }}>{wScore.toFixed(1)}%</span>
              : <span style={dim}>—</span>}
          </div>
        )}

        {/* Turn-over (Spot Ratio) */}
        {showSpotRatio && (
          <div style={{ textAlign: 'right' }}>
            {data.loading ? <span style={dim}>…</span>
              : data.spotRatio !== null && srPct !== null
              ? <span style={{ color: percentileColor(srPct), fontFamily: "'Space Mono', monospace", fontSize: 12, fontWeight: 600 }}>{data.spotRatio.toFixed(1)}%</span>
              : <span style={dim}>—</span>}
          </div>
        )}

        {/* Ratio F/S */}
        {showRatioFS && (
          <div style={{ textAlign: 'right' }}>
            {data.loading ? <span style={dim}>…</span>
              : data.ratioFS !== null && fsPct !== null
              ? <span style={{ color: percentileColor(fsPct), fontFamily: "'Space Mono', monospace", fontSize: 12, fontWeight: 600 }}>
                  {data.ratioFS >= 100 ? data.ratioFS.toFixed(0) : data.ratioFS >= 10 ? data.ratioFS.toFixed(1) : data.ratioFS.toFixed(2)}x
                </span>
              : <span style={dim}>—</span>}
          </div>
        )}

        {/* Vol Total tous CEX */}
        {showVolAll && (
          <div style={{ textAlign: 'right', fontFamily: "'Space Mono', monospace", fontSize: 11, color: 'var(--text-muted)' }}>
            {data.loading ? <span style={{ color: 'var(--text-dim)', fontSize: 11 }}>…</span>
              : formatVol(data.volAllExchanges ?? null)}
          </div>
        )}

        <div />
      </div>

      {/* Heatmap panel */}
      {isOpen && !data.loading && (
        <div className="heatmap-animate" style={{ padding: '14px 20px 16px', background: 'var(--bg-heatmap)' }}>
          <div style={{ fontSize: 9, color: 'var(--text-muted)', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 8, fontFamily: "'Dodger', 'Syne', sans-serif" }}>
            {base} — Momentum Heatmap
          </div>

          <div style={{ display: 'flex', gap: 3, alignItems: 'center', marginBottom: 4 }}>
            <div style={{ width: 18, flexShrink: 0 }} />
            {Array(9).fill(0).map((_, i) => (
              <div key={i} style={{ flex: 1, textAlign: 'center', fontSize: 8, color: 'var(--text-dim)', letterSpacing: 1, fontFamily: "'Space Mono', monospace" }}>
                -{9 - i}
              </div>
            ))}
            <div style={{ width: 1, margin: '0 2px', flexShrink: 0, opacity: 0 }} />
            <div style={{ flex: 1, textAlign: 'center', fontSize: 8, color: 'var(--text-muted)', letterSpacing: 1, fontFamily: "'Space Mono', monospace" }}>now</div>
            <div style={{ flex: 1.5, textAlign: 'center', fontSize: 8, color: 'var(--text-muted)', letterSpacing: 1, fontFamily: "'Space Mono', monospace" }}>score</div>
          </div>

          <HeatmapRow
            label="D"
            historyT={dHist}
            liveT={dLive ?? null}
            history={dHist}
            live={dLive ?? null}
            score={dScore ?? null}
          />
          <div style={{ marginTop: 3 }}>
            <HeatmapRow
              label="W"
              historyT={wHist}
              liveT={wLive ?? null}
              history={wHist}
              live={wLive ?? null}
              score={wScore ?? null}
            />
          </div>

          {/* Values on /10 note */}
          <div style={{ marginTop: 8, fontSize: 9, color: 'var(--text-dim)', letterSpacing: 1 }}>
            mom D = <span style={{ color: rsiTextColor(dLive ?? 50), fontFamily: "'Space Mono', monospace", fontWeight: 700 }}>{fmtMom(dLive)}</span>
            &nbsp;·&nbsp;
            mom W = <span style={{ color: rsiTextColor(wLive ?? 50), fontFamily: "'Space Mono', monospace", fontWeight: 700 }}>{fmtMom(wLive)}</span>
            &nbsp;·&nbsp;
            score D = <span style={{ fontFamily: "'Space Mono', monospace" }}>{dScore !== null && dScore !== undefined ? dScore.toFixed(1) + '%' : '—'}</span>
            &nbsp;·&nbsp;
            score W = <span style={{ fontFamily: "'Space Mono', monospace" }}>{wScore !== null && wScore !== undefined ? wScore.toFixed(1) + '%' : '—'}</span>
          </div>
        </div>
      )}
    </div>
  )
}
 
 
