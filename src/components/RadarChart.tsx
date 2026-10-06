import { useState } from 'react'

export interface RadarSeries {
  name: string
  color: string
  values: (number | null)[]
  dashed?: boolean
  marker?: 'circle' | 'square'
}

const SIZE = 520
const C = SIZE / 2
const R = 170
const MAX = 5

const point = (i: number, n: number, v: number) => {
  const a = -Math.PI / 2 + (2 * Math.PI * i) / n
  return [C + Math.cos(a) * (R * v) / MAX, C + Math.sin(a) * (R * v) / MAX] as const
}

/** Gráfico aranha 0–5 por categoria, com legenda, dica ao passar o mouse e tabela com os números. */
export default function RadarChart({ axes, series, title }: { axes: string[]; series: RadarSeries[]; title: string }) {
  const [hover, setHover] = useState<{ s: number; i: number } | null>(null)
  const n = axes.length
  if (n < 3) return null

  const fmt = (v: number | null) => (v === null ? '–' : v.toFixed(1).replace('.', ','))

  return (
    <figure className="m-0">
      <ul className="flex flex-wrap gap-4 text-sm mb-2" aria-label="Legenda">
        {series.map((s) => (
          <li key={s.name} className="flex items-center gap-2">
            <svg width="28" height="12" aria-hidden>
              <line x1="0" y1="6" x2="28" y2="6" stroke={s.color} strokeWidth="2" strokeDasharray={s.dashed ? '5 4' : undefined} />
              {s.marker === 'square'
                ? <rect x="10" y="2" width="8" height="8" fill={s.color} />
                : <circle cx="14" cy="6" r="4" fill={s.color} />}
            </svg>
            {s.name}
          </li>
        ))}
      </ul>
      <svg viewBox={`-80 20 ${SIZE + 160} ${SIZE - 40}`} className="w-full max-w-[640px] mx-auto block" role="img" aria-label={title}>
        {[1, 2, 3, 4, 5].map((lvl) => (
          <polygon key={lvl} fill="none" stroke="#041E42" strokeOpacity={lvl === 5 ? 0.25 : 0.1}
            points={axes.map((_, i) => point(i, n, lvl).join(',')).join(' ')} />
        ))}
        {axes.map((_, i) => {
          const [x, y] = point(i, n, MAX)
          return <line key={i} x1={C} y1={C} x2={x} y2={y} stroke="#041E42" strokeOpacity={0.1} />
        })}
        {[1, 2, 3, 4, 5].map((lvl) => (
          <text key={lvl} x={C + 4} y={C - (R * lvl) / MAX + 4} fontSize="11" fill="#666666">{lvl}</text>
        ))}
        {axes.map((label, i) => {
          const [x, y] = point(i, n, MAX + 0.55)
          const anchor = Math.abs(x - C) < 8 ? 'middle' : x > C ? 'start' : 'end'
          const words = label.split(' ')
          const lines = words.length > 2 ? [words.slice(0, 2).join(' '), words.slice(2).join(' ')] : [label]
          return (
            <text key={label} x={x} y={y - (lines.length - 1) * 7 + 4} fontSize="13" fill="#041E42" textAnchor={anchor}>
              {lines.map((l, k) => <tspan key={k} x={x} dy={k ? 15 : 0}>{l}</tspan>)}
            </text>
          )
        })}
        {series.map((s, si) => {
          const pts = s.values.map((v, i) => (v === null ? null : point(i, n, v)))
          const path = pts.filter(Boolean).map((p) => p!.join(',')).join(' ')
          return (
            <g key={s.name}>
              <polygon points={path} fill={s.dashed ? 'none' : s.color} fillOpacity={0.08} stroke={s.color}
                strokeWidth="2" strokeDasharray={s.dashed ? '6 5' : undefined} strokeLinejoin="round" />
              {pts.map((p, i) => p && (
                <g key={i} onMouseEnter={() => setHover({ s: si, i })} onMouseLeave={() => setHover(null)}>
                  <circle cx={p[0]} cy={p[1]} r="12" fill="transparent" />
                  {s.marker === 'square'
                    ? <rect x={p[0] - 4.5} y={p[1] - 4.5} width="9" height="9" fill={s.color} stroke="#fff" strokeWidth="2" />
                    : <circle cx={p[0]} cy={p[1]} r="5" fill={s.color} stroke="#fff" strokeWidth="2" />}
                </g>
              ))}
            </g>
          )
        })}
        {hover && (() => {
          const s = series[hover.s]
          const v = s.values[hover.i]
          if (v === null) return null
          const [x, y] = point(hover.i, n, v)
          const text = `${axes[hover.i]} · ${s.name}: ${fmt(v)}`
          const w = text.length * 6.6 + 16
          const tx = Math.min(Math.max(x - w / 2, -76), SIZE + 76 - w)
          return (
            <g pointerEvents="none">
              <rect x={tx} y={y - 38} width={w} height="24" rx="4" fill="#041E42" />
              <text x={tx + 8} y={y - 22} fontSize="12" fill="#fff">{text}</text>
            </g>
          )
        })()}
      </svg>
      <details className="mt-2 text-sm">
        <summary className="cursor-pointer text-apoio">Ver os números</summary>
        <table className="w-full mt-2">
          <thead>
            <tr className="text-left text-apoio">
              <th className="py-1">Categoria</th>
              {series.map((s) => <th key={s.name} className="text-right">{s.name}</th>)}
            </tr>
          </thead>
          <tbody>
            {axes.map((a, i) => (
              <tr key={a} className="border-t border-midnight/10">
                <td className="py-1">{a}</td>
                {series.map((s) => <td key={s.name} className="text-right">{fmt(s.values[i])}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  )
}

/** Média 0–5 por categoria, a partir de linhas de nota. */
export function averagesByCategory<T>(
  rows: T[], category: (r: T) => string, value: (r: T) => number | null | undefined, axes: string[],
): (number | null)[] {
  return axes.map((a) => {
    const vals = rows.filter((r) => category(r) === a).map(value).filter((v): v is number => v !== null && v !== undefined)
    return vals.length ? vals.reduce((x, y) => x + y, 0) / vals.length : null
  })
}
