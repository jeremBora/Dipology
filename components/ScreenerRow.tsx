'use client'

import { useState } from 'react'
import { rsiTextColor } from '@/lib/rsi'

// Import dynamique pour éviter les conflits de types
const HeatmapRow = require('./HeatmapRow').default as (props: {
  label: string
  historyT: (number | null)[]
  liveT: number | null
  history: (number | null)[]
  live: number | null
  score: number | null
}) => JSX.Element

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

function percentileColor(pct: number): string {
  if (pct >= 80) return '#00e676'
  if (pct >= 60) return '#69f0ae'
  if (pct >= 40) return '#fff176'
  if (pct >= 20) return '#ffb74d'
  return '#ef5350'
}

function PercentileBar({ pct, color }: { pct: number; color: string }) {
  return (
    <div style={{
      width: '100%', height: 2,
      background: 'rgba(128,128,128,0.15)',
      borderRadius: 1, overflow: 'hidden', marginTop: 3,
    }}>
      <div style={{
        height: '100%', width: `${pct}%`,
        background: color, borderRadius: 1,
        transition: 'width 0.5s ease',
      }} />
    </div>
  )
}

export default function ScreenerRow({ data, index }: { data: ContractData; index: number }) {
  const [open, setOpen] = useState(false)
  const base = data.symbol.replace('USDT', '')

  const dScore    = data.daily?.score
  const wScore    = data.weekly?.score
  const spotRatio = data.spotRatio
  const ratioFS   = data.ratioFS
  const srPct     = data.spotRatioPct
  const fsPct     = data.ratioFSPct

  const dHistory: (number | null)[] = data.daily?.history ?? []
  const dLive: number | null        = data.daily?.live ?? null
  const dScore2: number | null      = data.daily?.score ?? null
  const wHistory: (number | null)[] = data.weekly?.history ?? []
  const wLive: number | null        = data.weekly?.live ?? null
  const wScore2: number | null      = data.weekly?.score ?? null

  return (
    <div
      className="row-animate"
      style={{ borderBottom: '1px solid #0a0f1e', animationDelay: `${Math.min(index * 20, 400)}ms` }}
    >
      <div
        onClick={() => !data.loading && setOpen(o => !o)}
        style={{
          display: 'grid',
          gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr 1fr',
          padding: '10px 24px',
          cursor: data.loading ? 'default' : 'pointer',
          background: open ? 'var(--bg-row-hover)' : 'transparent',
          borderBottom: open ? '1px solid var(--border)' : 'none',
          transition: 'background 0.15s',
          alignItems: 'center',
        }}
        onMouseEnter={e => { if (!open) (e.currentTarget as HTMLDivElement).style.background = 'var(--bg-row-hover)' }}
        onMouseLeave={e => { if (!open) (e.currentTarget as HTMLDivElement).style.background = 'transparent' }}
      >
        {/* Contrat */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{
            fontSize: 8, color: open ? 'var(--accent-dim)' : 'var(--text-dim)',
            transition: 'transform 0.2s, color 0.2s', display: 'inline-block',
            transform: open ? 'rotate(90deg)' : 'none',
          }}>▶</span>
          <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)', letterSpacing: 0.5 }}>
            {base}
          </span>
          <span style={{ fontSize: 10, fontWeight: 300, color: 'var(--text-muted)', letterSpacing: 2, textTransform: 'lowercase' }}>
            /usdt
          </span>
          {data.incomplete && (
            <span style={{
              fontSize: 9, background: 'var(--warn-bg)', color: 'var(--warn)',
              border: '1px solid var(--warn-border)', padding: '2px 6px',
              borderRadius: 4, letterSpacing: 1, fontWeight: 400,
            }}>missing data</span>
          )}
        </div>

        {/* RSI Daily */}
        <div style={{ textAlign: 'right', fontSize: 13, fontWeight: 400 }}>
          {data.loading ? (
            <span style={{ color: 'var(--text-dim)', fontSize: 11 }}>…</span>
          ) : dScore !== null && dScore !== undefined ? (
            <span style={{ color: rsiTextColor(dScore) }}>{dScore.toFixed(1)}%</span>
          ) : (
            <span style={{ color: 'var(--text-dim)' }}>—</span>
          )}
        </div>

        {/* RSI Weekly */}
        <div style={{ textAlign: 'right', fontSize: 13, fontWeight: 400 }}>
          {data.loading ? (
            <span style={{ color: 'var(--text-dim)', fontSize: 11 }}>…</span>
          ) : wScore !== null && wScore !== undefined ? (
            <span style={{ color: rsiTextColor(wScore) }}>{wScore.toFixed(1)}%</span>
          ) : (
            <span style={{ color: 'var(--text-dim)' }}>—</span>
          )}
        </div>

        {/* Vol 24H */}
        <div style={{ textAlign: 'right', fontSize: 12, fontWeight: 400, color: 'var(--text-muted)' }}>
          {data.loading ? (
            <span style={{ color: 'var(--text-dim)', fontSize: 11 }}>…</span>
          ) : formatVol(data.vol24h || 0)}
        </div>

        {/* Spot Ratio */}
        <div style={{ textAlign: 'right', paddingRight: 4 }}>
          {data.loading ? (
            <span style={{ color: 'var(--text-dim)', fontSize: 11 }}>…</span>
          ) : spotRatio !== null && srPct !== null ? (
            <div>
              <span style={{ fontSize: 12, fontWeight: 600, color: percentileColor(srPct) }}>
                {spotRatio.toFixed(1)}%
              </span>
              <PercentileBar pct={srPct} color={percentileColor(srPct)} />
            </div>
          ) : (
            <span style={{ color: 'var(--text-dim)', fontSize: 11 }}>—</span>
          )}
        </div>

        {/* Ratio F/S */}
        <div style={{ textAlign: 'right', paddingRight: 4 }}>
          {data.loading ? (
            <span style={{ color: 'var(--text-dim)', fontSize: 11 }}>…</span>
          ) : ratioFS !== null && fsPct !== null ? (
            <div>
              <span style={{ fontSize: 12, fontWeight: 600, color: percentileColor(fsPct) }}>
                {ratioFS >= 100 ? ratioFS.toFixed(0) : ratioFS >= 10 ? ratioFS.toFixed(1) : ratioFS.toFixed(2)}x
              </span>
              <PercentileBar pct={fsPct} color={percentileColor(fsPct)} />
            </div>
          ) : (
            <span style={{ color: 'var(--text-dim)', fontSize: 11 }}>—</span>
          )}
        </div>
      </div>

      {/* Heatmap */}
      {open && !data.loading && (
        <div className="heatmap-animate" style={{ padding: '14px 24px 18px', background: 'var(--bg-heatmap)' }}>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', letterSpacing: 3, textTransform: 'uppercase', marginBottom: 10, fontWeight: 400 }}>
            {base} / usdt — rsi heatmap
          </div>

          {(spotRatio !== null || ratioFS !== null) && (
            <div style={{ display: 'flex', gap: 24, marginBottom: 14, flexWrap: 'wrap' }}>
              {spotRatio !== null && srPct !== null && (
                <div style={{ fontSize: 10, color: 'var(--text-dim)', letterSpacing: 1 }}>
                  spot ratio{' '}
                  <span style={{ color: percentileColor(srPct), fontWeight: 600 }}>{spotRatio.toFixed(1)}%</span>
                  <span style={{ color: 'var(--text-dim)', marginLeft: 6, fontSize: 9 }}>
                    {srPct >= 80 ? '— demande réelle forte' : srPct >= 40 ? '— mixte' : '— dominante spéculative'}
                  </span>
                </div>
              )}
              {ratioFS !== null && fsPct !== null && (
                <div style={{ fontSize: 10, color: 'var(--text-dim)', letterSpacing: 1 }}>
                  ratio f/s{' '}
                  <span style={{ color: percentileColor(fsPct), fontWeight: 600 }}>
                    {ratioFS >= 10 ? ratioFS.toFixed(1) : ratioFS.toFixed(2)}x
                  </span>
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
              <div key={i} style={{ flex: 1, textAlign: 'center', fontSize: 8, color: 'var(--text-dim)', letterSpacing: 1 }}>
                J-{9 - i}
              </div>
            ))}
            <div style={{ width: 1, margin: '0 2px', flexShrink: 0, opacity: 0 }} />
            <div style={{ flex: 1, textAlign: 'center', fontSize: 8, color: 'var(--text-muted)', letterSpacing: 1 }}>now</div>
            <div style={{ flex: 1.5, textAlign: 'center', fontSize: 8, color: 'var(--text-muted)', letterSpacing: 1 }}>score</div>
          </div>

          <HeatmapRow
            label="D"
            historyT={dHistory}
            liveT={dLive}
            history={dHistory}
            live={dLive}
            score={dScore2}
          />
          <div style={{ marginTop: 3 }}>
            <HeatmapRow
              label="W"
              historyT={wHistory}
              liveT={wLive}
              history={wHistory}
              live={wLive}
              score={wScore2}
            />
          </div>
        </div>
      )}
    </div>
  )
}
