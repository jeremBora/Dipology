'use client'

interface HeatmapRowProps {
  label: string
  historyT: (number | null)[]
  liveT: number | null
  score: number | null
  history: (number | null)[]
  live: number | null
}

function rsiRGB(v: number): [number, number, number] {
  if (v >= 90) return [5,88,5]
  if (v >= 85) return [6,96,6]
  if (v >= 80) return [14,104,14]
  if (v >= 75) return [22,116,22]
  if (v >= 70) return [32,124,32]
  if (v >= 65) return [44,130,44]
  if (v >= 60) return [64,128,64]
  if (v >= 55) return [80,110,80]
  if (v >= 50) return [96,96,96]
  if (v >= 45) return [110,80,80]
  if (v >= 40) return [128,64,64]
  if (v >= 35) return [130,44,44]
  if (v >= 30) return [124,32,32]
  if (v >= 25) return [116,22,22]
  if (v >= 20) return [104,14,14]
  if (v >= 15) return [96,8,8]
  if (v >= 10) return [88,5,5]
  return [80,0,0]
}

function cellTextColor(v: number): string {
  // Use white for dark cells, slightly off-white for mid cells
  return 'rgba(255,255,255,0.9)'
}

function BarCell({ valueT, valueRaw }: { valueT: number | null; valueRaw: number | null }) {
  if (valueT === null || valueRaw === null) {
    return (
      <div style={{
        flex:1, textAlign:'center', padding:'3px 1px',
        display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center',
        minHeight: 28,
      }}>
        <span style={{ fontSize:9, color:'var(--text-dim)', fontFamily:'Space Mono, monospace' }}>—</span>
      </div>
    )
  }
  const [r,g,b] = rsiRGB(valueRaw)
  const mom = (valueT / 10).toFixed(1)
  return (
    <div style={{
      flex:1, textAlign:'center', padding:'2px 1px',
      display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center',
      background:`rgb(${r},${g},${b})`,
      borderRadius: 3, minHeight: 28,
    }}>
      <span style={{
        fontSize: 10, fontWeight: 700,
        color: cellTextColor(valueRaw),
        fontFamily:'Space Mono, monospace', lineHeight: 1,
      }}>
        {mom}
      </span>
    </div>
  )
}

function LiveCell({ valueT, valueRaw }: { valueT: number | null; valueRaw: number | null }) {
  if (valueT === null || valueRaw === null) {
    return (
      <div style={{
        flex:1, textAlign:'center', padding:'3px 1px',
        display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center',
        border:'1px solid var(--border)', borderRadius:4, minHeight: 28,
      }}>
        <span style={{ fontSize:9, color:'var(--text-dim)', fontFamily:'Space Mono, monospace' }}>—</span>
      </div>
    )
  }
  const [r,g,b] = rsiRGB(valueRaw)
  const mom = (valueT / 10).toFixed(1)
  return (
    <div style={{
      flex:1, textAlign:'center', padding:'2px 1px',
      display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center',
      background:`rgb(${r},${g},${b})`,
      border:`2px solid rgba(${r},${g},${b},0.3)`,
      borderRadius: 4, minHeight: 28,
      boxShadow: `0 0 8px rgba(${r},${g},${b},0.4)`,
    }}>
      <span style={{
        fontSize: 11, fontWeight: 700,
        color: cellTextColor(valueRaw),
        fontFamily:'Space Mono, monospace', lineHeight: 1,
      }}>
        {mom}
      </span>
    </div>
  )
}

function ScoreCell({ score }: { score: number | null }) {
  if (score === null) {
    return (
      <div style={{
        flex:1.5, textAlign:'center', padding:'3px 4px',
        display:'flex', alignItems:'center', justifyContent:'center',
      }}>
        <span style={{ fontSize:9, color:'var(--text-dim)', fontFamily:'Space Mono, monospace' }}>—</span>
      </div>
    )
  }
  const [r,g,b] = rsiRGB(score)
  return (
    <div style={{
      flex:1.5, textAlign:'center', padding:'2px 4px',
      display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center',
      background:`rgba(${r},${g},${b},0.15)`,
      borderRadius: 4, minHeight: 28,
      border: `1px solid rgba(${r},${g},${b},0.3)`,
    }}>
      <span style={{
        fontSize: 11, fontWeight: 700,
        color:`rgb(${r},${g},${b})`,
        fontFamily:'Space Mono, monospace', lineHeight: 1,
      }}>
        {(score/10).toFixed(2)}
      </span>
    </div>
  )
}

export default function HeatmapRow({ label, historyT, liveT, score, history, live }: HeatmapRowProps) {
  const hist9T   = historyT.length < 9 ? [...Array(9 - historyT.length).fill(null), ...historyT] : historyT.slice(-9)
  const hist9Raw = history.length  < 9 ? [...Array(9 - history.length).fill(null),  ...history]  : history.slice(-9)

  return (
    <div style={{ display:'flex', gap:2, alignItems:'stretch' }}>
      <div style={{
        width:18, textAlign:'center', fontSize:10, fontWeight:600,
        color:'var(--text-muted)', flexShrink:0,
        display:'flex', alignItems:'center', justifyContent:'center',
        letterSpacing:1, fontFamily:'Space Mono, monospace',
      }}>{label}</div>

      {hist9T.map((vT, i) => <BarCell key={i} valueT={vT} valueRaw={hist9Raw[i]} />)}

      <div style={{ width:1, background:'var(--border)', flexShrink:0, margin:'0 2px', alignSelf:'stretch' }} />

      <LiveCell valueT={liveT} valueRaw={live} />
      <ScoreCell score={score} />
    </div>
  )
}
 
