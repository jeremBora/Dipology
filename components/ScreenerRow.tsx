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
}

function formatVol(v: number): string {
  if (v >= 1e9) return '$' + (v / 1e9).toFixed(2) + 'B'
  if (v >= 1e6) return '$' + (v / 1e6).toFixed(1) + 'M'
  if (v >= 1e3) return '$' + (v / 1e3).toFixed(0) + 'K'
  return '$' + v.toFixed(0)
}

// Momentum = RSI / 10
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

function PercentileBar({ pct, color }: { pct: number; color: string }) {
  return (
    <div style={{ width: '100%', height: 2, background: 'rgba(128,128,128,0.15)', borderRadius: 1, overflow: 'hidden', marginTop: 3 }}>
      <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 1, transition: 'width 0.5s ease' }} />
    </div>
  )
}

export default function ScreenerRow({
  data, index, extraCols, gridCols
}: {
  data: ContractData
  index: number
  extraCols: Set<ExtraCol>
  gridCols: string
}) {
  const [open, setOpen] = useState(false)
  const base = data.symbol.replace('USDT', '')

  const dLive    = data.daily?.live
  const wLive    = data.weekly?.live
  const dHist    = data.daily?.history ?? []
  const wHist    = data.weekly?.history ?? []
  const dPrev    = dHist.length > 0 ? dHist[dHist.length - 1] : null
  const wPrev    = wHist.length > 0 ? wHist[wHist.length - 1] : null
  const dScore   = data.daily?.score
  const wScore   = data.weekly?.score
  const spotRatio = data.spotRatio
  const ratioFS   = data.ratioFS
  const srPct     = data.spotRatioPct
  const fsPct     = data.ratioFSPct

  const showMomDPrev  = extraCols.has('momentumDPrev')
  const showMomWPrev  = extraCols.has('momentumWPrev')
  const showScoreD    = extraCols.has('scorePctD')
  const showScoreW    = extraCols.has('scorePctW')
  const showSpotRatio = extraCols.has('spotRatio' as ExtraCol)
  const showRatioFS   = extraCols.has('ratioFS' as ExtraCol)

  const dim = { color: 'var(--text-dim)', fontSize: 11 }

  return (
    <div className="row-animate" style={{ borderBottom: '1px solid #0a0f1e', animationDelay: `${Math.min(index * 20, 400)}ms` }}>
      <div
        onClick={() => !data.loading && setOpen(o => !o)}
        style={{
          display: 'grid', gridTemplateColumns: gridCols,
          padding: '10px 24px',
          cursor: data.loading ? 'default' : 'pointer',
          background: open ? 'var(--bg-row-hover)' : 'transparent',
          borderBottom: open ? '1px solid var(--border)' : 'none',
          transition: 'background 0.15s', alignItems: 'center',
        }}
        onMouseEnter={e => { if (!open) (e.currentTarget as HTMLDivElement).style.background = 'var(--bg-row-hover)' }}
        onMouseLeave={e => { if (!open) (e.currentTarget as HTMLDivElement).style.background = 'transparent' }}
      >
        {/* Contrat */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 8, color: open ? 'var(--accent-dim)' : 'var(--text-dim)', transition: 'transform 0.2s', display: 'inline-block', transform: open ? 'rotate(90deg)' : 'none' }}>▶</span>
          <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)', letterSpacing: 0.5 }}>{base}</span>
          <span style={{ fontSize: 10, fontWeight: 300, color: 'var(--text-muted)', letterSpacing: 2, textTransform: 'lowercase' }}>/usdt</span>
          {data.incomplete && (
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

        {/* Momentum D-1 */}
        {showMomDPrev && (
          <div style={{ textAlign: 'right', fontSize: 12 }}>
            {data.loading ? <span style={dim}>…</span>
              : dPrev !== null && dPrev !== undefined
              ? <span style={{ color: rsiTextColor(dPrev) }}>{fmtMom(dPrev)}</span>
              : <span style={dim}>—</span>}
          </div>
        )}

        {/* Momentum W-1 */}
        {showMomWPrev && (
          <div style={{ textAlign: 'right', fontSize: 12 }}>
            {data.loading ? <span style={dim}>…</span>
              : wPrev !== null && wPrev !== undefined
              ? <span style={{ color: rsiTextColor(wPrev) }}>{fmtMom(wPrev)}</span>
              : <span style={dim}>—</span>}
          </div>
        )}

        {/* Score % D */}
        {showScoreD && (
          <div style={{ textAlign: 'right', fontSize: 12 }}>
            {data.loading ? <span style={dim}>…</span>
              : dScore !== null && dScore !== undefined
              ? <span style={{ color: rsiTextColor(dScore) }}>{dScore.toFixed(1)}%</span>
              : <span style={dim}>—</span>}
          </div>
        )}

        {/* Score % W */}
        {showScoreW && (
          <div style={{ textAlign: 'right', fontSize: 12 }}>
            {data.loading ? <span style={dim}>…</span>
              : wScore !== null && wScore !== undefined
              ? <span style={{ color: rsiTextColor(wScore) }}>{wScore.toFixed(1)}%</span>
              : <span style={dim}>—</span>}
          </div>
        )}

        {/* Spot Ratio */}
        {showSpotRatio && (
          <div style={{ textAlign: 'right', paddingRight: 4 }}>
            {data.loading ? <span style={dim}>…</span>
              : spotRatio !== null && srPct !== null
              ? <div>
                  <span style={{ fontSize: 12, fontWeight: 600, color: percentileColor(srPct) }}>{spotRatio.toFixed(1)}%</span>
                  <PercentileBar pct={srPct} color={percentileColor(srPct)} />
                </div>
              : <span style={dim}>—</span>}
          </div>
        )}

        {/* Ratio F/S */}
        {showRatioFS && (
          <div style={{ textAlign: 'right', paddingRight: 4 }}>
            {data.loading ? <span style={dim}>…</span>
              : ratioFS !== null && fsPct !== null
              ? <div>
                  <span style={{ fontSize: 12, fontWeight: 600, color: percentileColor(fsPct) }}>
                    {ratioFS >= 100 ? ratioFS.toFixed(0) : ratioFS >= 10 ? ratioFS.toFixed(1) : ratioFS.toFixed(2)}x
                  </span>
                  <PercentileBar pct={fsPct} color={percentileColor(fsPct)} />
                </div>
              : <span style={dim}>—</span>}
          </div>
        )}

        {/* Spacer pour le bouton + */}
        <div />
      </div>

      {/* Heatmap */}
      {open && !data.loading && (
        <div className="heatmap-animate" style={{ padding: '14px 24px 18px', background: 'var(--bg-heatmap)' }}>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', letterSpacing: 3, textTransform: 'uppercase', marginBottom: 10 }}>
            {base} / usdt — rsi heatmap
          </div>

          {(spotRatio !== null || ratioFS !== null) && (
            <div style={{ display: 'flex', gap: 24, marginBottom: 14, flexWrap: 'wrap' }}>
              {spotRatio !== null && srPct !== null && (
                <div style={{ fontSize: 10, color: 'var(--text-dim)', letterSpacing: 1 }}>
                  spot ratio <span style={{ color: percentileColor(srPct), fontWeight: 600 }}>{spotRatio.toFixed(1)}%</span>
                  <span style={{ color: 'var(--text-dim)', marginLeft: 6, fontSize: 9 }}>
                    {srPct >= 80 ? '— demande réelle forte' : srPct >= 40 ? '— mixte' : '— dominante spéculative'}
                  </span>
                </div>
              )}
              {ratioFS !== null && fsPct !== null && (
                <div style={{ fontSize: 10, color: 'var(--text-dim)', letterSpacing: 1 }}>
                  ratio f/s <span style={{ color: percentileColor(fsPct), fontWeight: 600 }}>{ratioFS >= 10 ? ratioFS.toFixed(1) : ratioFS.toFixed(2)}x</span>
                  <span style={{ color: 'var(--text-dim)', marginLeft: 6, fontSize: 9 }}>
                    {fsPct >= 80 ? '— peu spéculatif' : fsPct >= 40 ? '— mixte' : '— très spéculatif'}
                  </span>
                </div>
              )}
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
