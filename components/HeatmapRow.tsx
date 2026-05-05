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

function rsiText(v: number): string {
  if (v >= 50) return `rgb(${Math.round(140 + v * 0.5)},255,${Math.round(140 + v * 0.5)})`
  return `rgb(255,${Math.round(120 + v * 0.7)},${Math.round(120 + v * 0.7)})`
}

function BarCell({ valueT, valueRaw }: { valueT: number | null; valueRaw: number | null }) {
  if (valueT === null || valueRaw === null) {
    return (
      <div style={{ flex:1, textAlign:'center', padding:'4px 2px 3px',
        display:'flex', flexDirection:'column', alignItems:'center', gap:4 }}>
        <span style={{ fontSize:13, fontWeight:600, color:'var(--text-dim)', fontFamily:'Space Mono, monospace' }}>—</span>
        <div style={{ width:'80%', height:3, borderRadius:2, background:'var(--border)' }} />
      </div>
    )
  }
  const [r,g,b] = rsiRGB(valueRaw)
  const pct = Math.min(Math.round(valueRaw), 100)
  const textC = rsiText(valueRaw)
  const mom = (valueT / 10).toFixed(1)
  return (
    <div style={{ flex:1, textAlign:'center', padding:'4px 2px 3px',
      display:'flex', flexDirection:'column', alignItems:'center', gap:4 }}>
      <span style={{ fontSize:13, fontWeight:600, color:textC,
        fontFamily:'Space Mono, monospace', lineHeight:1 }}>
        {mom}
      </span>
      <div style={{ width:'80%', height:3, borderRadius:2,
        background:`rgba(${r},${g},${b},0.2)` }}>
        <div style={{ width:`${pct}%`, height:'100%', borderRadius:2,
          background:`rgb(${r},${g},${b})` }} />
      </div>
    </div>
  )
}

function LiveCell({ valueT, valueRaw }: { valueT: number | null; valueRaw: number | null }) {
  if (valueT === null || valueRaw === null) {
    return (
      <div style={{ flex:1, textAlign:'center', padding:'4px 2px 3px',
        display:'flex', flexDirection:'column', alignItems:'center', gap:4,
        border:'1px solid var(--border)', borderRadius:6 }}>
        <span style={{ fontSize:13, fontWeight:600, color:'var(--text-dim)', fontFamily:'Space Mono, monospace' }}>—</span>
        <div style={{ width:'80%', height:3, borderRadius:2, background:'var(--border)' }} />
      </div>
    )
  }
  const [r,g,b] = rsiRGB(valueRaw)
  const pct = Math.min(Math.round(valueRaw), 100)
  const textC = rsiText(valueRaw)
  const mom = (valueT / 10).toFixed(1)
  return (
    <div style={{ flex:1, textAlign:'center', padding:'4px 2px 3px',
      display:'flex', flexDirection:'column', alignItems:'center', gap:4,
      border:`1px solid rgba(${r},${g},${b},0.5)`, borderRadius:6,
      background:`rgba(${r},${g},${b},0.06)` }}>
      <span style={{ fontSize:13, fontWeight:700, color:textC,
        fontFamily:'Space Mono, monospace', lineHeight:1 }}>
        {mom}
      </span>
      <div style={{ width:'80%', height:3, borderRadius:2,
        background:`rgba(${r},${g},${b},0.2)` }}>
        <div style={{ width:`${pct}%`, height:'100%', borderRadius:2,
          background:`rgb(${r},${g},${b})` }} />
      </div>
    </div>
  )
}

function ScoreCell({ score }: { score: number | null }) {
  if (score === null) {
    return (
      <div style={{ flex:1.5, textAlign:'center', padding:'4px 4px 3px',
        display:'flex', flexDirection:'column', alignItems:'center', gap:4 }}>
        <span style={{ fontSize:13, fontWeight:600, color:'var(--text-dim)', fontFamily:'Space Mono, monospace' }}>—</span>
        <div style={{ width:'80%', height:3, borderRadius:2, background:'var(--border)' }} />
      </div>
    )
  }
  const [r,g,b] = rsiRGB(score)
  const pct = Math.min(Math.round(score), 100)
  const textC = rsiText(score)
  return (
    <div style={{ flex:1.5, textAlign:'center', padding:'4px 4px 3px',
      display:'flex', flexDirection:'column', alignItems:'center', gap:4 }}>
      <span style={{ fontSize:13, fontWeight:700, color:textC,
        fontFamily:'Space Mono, monospace', lineHeight:1 }}>
        {(score/10).toFixed(2)}
      </span>
      <div style={{ width:'80%', height:3, borderRadius:2,
        background:`rgba(${r},${g},${b},0.2)` }}>
        <div style={{ width:`${pct}%`, height:'100%', borderRadius:2,
          background:`rgb(${r},${g},${b})` }} />
      </div>
    </div>
  )
}

export default function HeatmapRow({ label, historyT, liveT, score, history, live }: HeatmapRowProps) {
  const hist9T   = historyT.length < 9 ? [...Array(9 - historyT.length).fill(null), ...historyT] : historyT.slice(-9)
  const hist9Raw = history.length  < 9 ? [...Array(9 - history.length).fill(null),  ...history]  : history.slice(-9)

  return (
    <div style={{ display:'flex', gap:3, alignItems:'stretch' }}>
      <div style={{ width:18, textAlign:'center', fontSize:11, fontWeight:600,
        color:'var(--text-muted)', flexShrink:0, display:'flex', alignItems:'center',
        justifyContent:'center', letterSpacing:1 }}>{label}</div>

      {hist9T.map((vT, i) => <BarCell key={i} valueT={vT} valueRaw={hist9Raw[i]} />)}

      <div style={{ width:1, background:'var(--border)', flexShrink:0, margin:'0 2px', alignSelf:'stretch' }} />

      <LiveCell valueT={liveT} valueRaw={live} />
      <ScoreCell score={score} />
    </div>
  )
}
 
