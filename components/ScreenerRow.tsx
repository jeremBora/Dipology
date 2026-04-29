'use client'

import { useState } from 'react'
import { ExtraCol } from './ColumnPicker'
import { rsiTextColor } from '@/lib/rsi'

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
  isSpecial?: boolean // for USDT.D
}

function formatVol(v: number): string {
  if (v >= 1e9) return '$' + (v / 1e9).toFixed(2) + 'B'
  if (v >= 1e6) return '$' + (v / 1e6).toFixed(1) + 'M'
  if (v >= 1e3) return '$' + (v / 1e3).toFixed(0) + 'K'
  return v > 0 ? '$' + v.toFixed(0) : '—'
}

function fmtMom(v: number | null | undefined): string {
  if (v === null || v === undefined) return '—'
  return (v / 10).toFixed(2)
}

function percentileColor(pct: number): string {
  if (pct >= 80) return '#00e676'
  if (pct >= 60) return '#69f0ae'
  if (pct >= 40) return '#fff176'
  if (pct >= 20) return '#ffb74d'
  return '#ef5350'
}

// USDT.D sentiment label
function usdtDLabel(momentum: number | null | undefined): { text: string; color: string } | null {
  if (momentum === null || momentum === undefined) return null
  const m = momentum / 10
  if (m > 6) return { text: '⚠ Bear Market Signal', color: '#ef5350' }
  if (m < 4) return { text: '✓ Bull Market Signal', color: '#00e676' }
  return { text: '~ Neutre', color: '#fff176' }
}

export default function ScreenerRow({
  data, index, extraCols, gridCols, forceOpen, isPinned
}: {
  data: ContractData
  index: number
  extraCols: Set<ExtraCol>
  gridCols: string
  forceOpen?: boolean
  isPinned?: boolean
}) {
  const [open, setOpen] = useState(false)
  const isOpen = forceOpen || open
  const base = data.symbol === 'USDT.D' ? 'USDT.D' : data.symbol.replace('USDT', '')

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

  const dim = { color: 'var(--text-dim)', fontSize: 11 }
  const sentiment = data.symbol === 'USDT.D' ? usdtDLabel(dLive) : null

  const rowBg = isPinned
    ? (data.symbol === 'USDT.D' ? 'rgba(255,159,67,0.04)' : 'rgba(0,255,68,0.04)')
    : 'transparent'

  return (
    <div
      className={isPinned ? undefined : 'row-animate'}
      style={{
        borderBottom: '1px solid #0a0f1e',
        ...(isPinned ? {} : { animationDelay: `${Math.min(index * 20, 400)}ms` }),
      }}
    >
      <div
        onClick={() => !data.loading && !forceOpen && setOpen(o => !o)}
        style={{
          display: 'grid', gridTemplateColumns: gridCols,
          padding: '10px 24px',
          cursor: (data.loading || forceOpen) ? 'default' : 'pointer',
          background: isOpen ? 'var(--bg-row-hover)' : rowBg,
          borderBottom: isOpen ? '1px solid var(--border)' : 'none',
          transition: 'background 0.15s', alignItems: 'center',
        }}
        onMouseEnter={e => { if (!isOpen && !forceOpen) (e.currentTarget as HTMLDivElement).style.background = 'var(--bg-row-hover)' }}
        onMouseLeave={e => { if (!isOpen && !forceOpen) (e.currentTarget as HTMLDivElement).style.background = rowBg }}
      >
        {/* Contrat */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {!forceOpen && (
            <span style={{ fontSize: 8, color: isOpen ? 'var(--accent-dim)' : 'var(--text-dim)', transition: 'transform 0.2s', display: 'inline-block', transform: isOpen ? 'rotate(90deg)' : 'none' }}>▶</span>
          )}
          {isPinned && (
            <span style={{ fontSize: 9, color: data.symbol === 'USDT.D' ? '#ff9f43' : 'var(--accent)', letterSpacing: 1 }}>
              {data.symbol === 'USDT.D' ? '◆' : '★'}
            </span>
          )}
          <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)', letterSpacing: 0.5 }}>{base}</span>
          {data.symbol !== 'USDT.D' && (
            <span style={{ fontSize: 10, fontWeight: 300, color: 'var(--text-muted)', letterSpacing: 2, textTransform: 'lowercase' }}>/usdt</span>
          )}
          {sentiment && (
            <span style={{ fontSize: 9, color: sentiment.color, letterSpacing: 1, fontWeight: 600 }}>{sentiment.text}</span>
          )}
          {data.incomplete && !data.isSpecial && (
            <span style={{ fontSize: 9, background: 'var(--warn-bg)', color: 'var(--warn)', border: '1px solid var(--warn-border)', padding: '2px 6px', borderRadius: 4, letterSpacing: 1 }}>missing data</span>
          )}
        </div>

        {/* Momentum D */}
        <div style={{ textAlign: 'right', fontSize: 13, fontWeight: 400 }}>
          {data.loading ? <span style={dim}>…</span>
            : dLive !== null && dLive !== undefined
            ? <span style={{ color: rsiTextColor(dLive) }}>{fmtMom(dLive)}</span>
            : <span style={dim}>—</span>}
        </div>

        {/* Momentum W */}
        <div style={{ textAlign: 'right', fontSize: 13, fontWeight: 400 }}>
          {data.loading ? <span style={dim}>…</span>
            : wLive !== null && wLive !== undefined
            ? <span style={{ color: rsiTextColor(wLive) }}>{fmtMom(wLive)}</span>
            : <span style={dim}>—</span>}
        </div>

        {/* Vol 24H */}
        <div style={{ textAlign: 'right', fontSize: 12, color: 'var(--text-muted)' }}>
          {data.loading ? <span style={dim}>…</span> : formatVol(data.vol24h || 0)}
        </div>

        {showMomDPrev && (
          <div style={{ textAlign: 'right', fontSize: 12 }}>
            {data.loading ? <span style={dim}>…</span>
              : dPrev !== null && dPrev !== undefined
              ? <span style={{ color: rsiTextColor(dPrev) }}>{fmtMom(dPrev)}</span>
              : <span style={dim}>—</span>}
          </div>
        )}
        {showMomWPrev && (
          <div style={{ textAlign: 'right', fontSize: 12 }}>
            {data.loading ? <span style={dim}>…</span>
              : wPrev !== null && wPrev !== undefined
              ? <span style={{ color: rsiTextColor(wPrev) }}>{fmtMom(wPrev)}</span>
              : <span style={dim}>—</span>}
          </div>
        )}
        {showScoreD && (
          <div style={{ textAlign: 'right', fontSize: 12 }}>
            {data.loading ? <span style={dim}>…</span>
              : dScore !== null && dScore !== undefined
              ? <span style={{ color: rsiTextColor(dScore) }}>{dScore.toFixed(1)}%</span>
              : <span style={dim}>—</span>}
          </div>
        )}
        {showScoreW && (
          <div style={{ textAlign: 'right', fontSize: 12 }}>
            {data.loading ? <span style={dim}>…</span>
              : wScore !== null && wScore !== undefined
              ? <span style={{ color: rsiTextColor(wScore) }}>{wScore.toFixed(1)}%</span>
              : <span style={dim}>—</span>}
          </div>
        )}
        {showSpotRatio && (
          <div style={{ textAlign: 'right', fontSize: 12 }}>
            {data.loading ? <span style={dim}>…</span>
              : data.spotRatio !== null && srPct !== null
              ? <span style={{ color: percentileColor(srPct), fontWeight: 600 }}>{data.spotRatio.toFixed(1)}%</span>
              : <span style={dim}>—</span>}
          </div>
        )}
        {showRatioFS && (
          <div style={{ textAlign: 'right', fontSize: 12 }}>
            {data.loading ? <span style={dim}>…</span>
              : data.ratioFS !== null && fsPct !== null
              ? <span style={{ color: percentileColor(fsPct), fontWeight: 600 }}>
                  {data.ratioFS >= 100 ? data.ratioFS.toFixed(0) : data.ratioFS >= 10 ? data.ratioFS.toFixed(1) : data.ratioFS.toFixed(2)}x
                </span>
              : <span style={dim}>—</span>}
          </div>
        )}
        {showVolSpot && (
          <div style={{ textAlign: 'right', fontSize: 12, color: 'var(--text-muted)' }}>
            {data.loading ? <span style={dim}>…</span> : formatVol(data.volSpot || 0)}
          </div>
        )}

        <div />
      </div>

      {/* Heatmap */}
      {isOpen && !data.loading && (
        <div className={forceOpen ? undefined : 'heatmap-animate'} style={{ padding: '14px 24px 18px', background: 'var(--bg-heatmap)' }}>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', letterSpacing: 3, textTransform: 'uppercase', marginBottom: 10 }}>
            {base}{data.symbol !== 'USDT.D' ? ' / usdt' : ' dominance'} — rsi heatmap
          </div>

          {data.symbol === 'USDT.D' && (
            <div style={{ fontSize: 10, color: 'var(--text-dim)', marginBottom: 12, letterSpacing: 1, lineHeight: 1.7 }}>
              <span style={{ color: '#ef5350', fontWeight: 600 }}>Momentum &gt; 6.0</span> → USDT dominance en hausse → Bear Market signal<br/>
              <span style={{ color: '#00e676', fontWeight: 600 }}>Momentum &lt; 4.0</span> → USDT dominance en baisse → Bull Market signal
            </div>
          )}

          <div style={{ display: 'flex', gap: 3, alignItems: 'center', marginBottom: 4 }}>
            <div style={{ width: 18, flexShrink: 0 }} />
            {Array(9).fill(0).map((_, i) => (
              <div key={i} style={{ flex: 1, textAlign: 'center', fontSize: 8, color: 'var(--text-dim)', letterSpacing: 1 }}>J-{9 - i}</div>
            ))}
            <div style={{ width: 1, margin: '0 2px', flexShrink: 0, opacity: 0 }} />
            <div style={{ flex: 1, textAlign: 'center', fontSize: 8, color: 'var(--text-muted)', letterSpacing: 1 }}>now</div>
            <div style={{ flex: 1.5, textAlign: 'center', fontSize: 8, color: 'var(--text-muted)', letterSpacing: 1 }}>score</div>
          </div>

          <HeatmapRow label="D" historyT={dHist} liveT={dLive ?? null} history={dHist} live={dLive ?? null} score={dScore ?? null} />
          <div style={{ marginTop: 3 }}>
            <HeatmapRow label="W" historyT={wHist} liveT={wLive ?? null} history={wHist} live={wLive ?? null} score={wScore ?? null} />
          </div>
        </div>
      )}
    </div>
  )
}
