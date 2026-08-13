/**
 * AtlPerformanceCard — v4
 * Design tokens aligned 1:1 with AdsPerformanceHealthCard / LeadsQualityCard:
 *   • badge: bg={tc}12  border={tc}28  radius=4  pad=3px 7px
 *   • arrow: fontWeight 800 separate span
 *   • label: fontWeight 700 separate span
 *   • rate:  opacity 0.7  separate span
 *   • date text: fontSize 10
 *   • target label: fontSize 11
 *   • crosshair dot: r=4.5
 *   • zone fill: per-segment polygon with intersection (exact reference impl)
 *   • CPM: higherIsBetter=false → slope>0 = Diverging ↑ (red)
 *   • CTR / FVR: higherIsBetter=true → slope>0 = Converging ↑ (green)
 */
import { useRef, useState } from 'react'
import { ChangelogModal } from '../ChangelogModal'
import { ChangelogTooltip } from '../ChangelogTooltip'
import type { ChangelogRow } from '../../types/changelog'
import { fmtRp } from '../../utils/format'

// ── Types ─────────────────────────────────────────────────────────────────────
export interface AtlPoint     { date: string; value: number }
export type { ChangelogRow }

export interface AtlPerformanceCardProps {
  totalSpend:       number
  totalImpressions: number
  totalLinkClicks:  number
  totalFirstVisit:  number
  totalPageView:    number
  cpmSeries?:       AtlPoint[]
  ctrSeries?:       AtlPoint[]
  fvSeries?:        AtlPoint[]
  changelog?:       ChangelogRow[]
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmtPct = (n: number) => n.toFixed(2) + '%'
const fmtK   = (n: number) =>
  n >= 1_000_000 ? (n / 1_000_000).toFixed(1) + 'M'
  : n >= 1_000   ? (n / 1_000).toFixed(1) + 'K'
  : n.toString()

const T = {
  cardTitle: { fontSize: 14, fontWeight: 800, letterSpacing: '-0.02em', color: '#fff' } as const,
  label: { fontSize: 9,  fontWeight: 700, letterSpacing: '0.1em',  color: 'rgba(255,255,255,0.55)', textTransform: 'uppercase' as const },
  tiny:  { fontSize: 9,  fontWeight: 600, color: 'rgba(255,255,255,0.65)', letterSpacing: '0.05em', textTransform: 'uppercase' as const },
  head:  { fontSize: 22, fontWeight: 800, letterSpacing: '-0.04em', color: '#fff', lineHeight: 1, whiteSpace: 'nowrap' as const },
}

// ── Sparkline ─────────────────────────────────────────────────────────────────
function Sparkline({
  data, changelog, color, fmt, fmtShort, chartKey, higherIsBetter,
}: {
  data:            AtlPoint[]
  changelog:       ChangelogRow[]
  color:           string
  fmt:             (v: number) => string
  fmtShort:        (v: number) => string
  chartKey:        string
  higherIsBetter:  boolean
}) {
  // ── Layout (viewBox coordinate system) ──────────────────────────────────────
  const VW = 320, VH = 180
  const PAD = { top: 10, right: 52, bottom: 20, left: 6 }
  const innerW = VW - PAD.left - PAD.right
  const innerH = VH - PAD.top - PAD.bottom

  const [tooltip,   setTooltip]   = useState<{ cx: number; cy: number; x: number; y: number; p: AtlPoint } | null>(null)
  const [clTooltip, setClTooltip] = useState<{ x: number; y: number; entries: ChangelogRow[] } | null>(null)
  const [modalEntries, setModalEntries] = useState<ChangelogRow[] | null>(null)
  const ref = useRef<SVGSVGElement>(null)

  if (data.length < 2) return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center' }}>
      <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)' }}>—</span>
    </div>
  )

  const vals  = data.map(d => d.value)
  const n     = vals.length
  const minV  = 0
  const avg0  = vals.reduce((s, v) => s + v, 0) / n
  const maxV  = Math.max(avg0 * 2, ...vals)
  const lo    = 0, hi = maxV, rng = hi - lo || 1

  // ── Derived stats ────────────────────────────────────────────────────────────
  const avg   = vals.reduce((s, v) => s + v, 0) / n
  const mX    = (n - 1) / 2
  const slope = vals.reduce((s, v, i) => s + (i - mX) * (v - avg), 0) /
                vals.reduce((s, _, i) => s + (i - mX) ** 2, 0)
  const ic    = avg - slope * mX
  const rate  = avg > 0 ? Math.abs((slope / avg) * 100) : 0

  // ── Trend semantics ──────────────────────────────────────────────────────────
  // slope > 0 means values are trending up
  const tUp = slope > 0
  // For CPM (higherIsBetter=false): up = bad = Diverging (red)
  // For CTR/FVR (higherIsBetter=true): up = good = Converging (green)
  const tc         = higherIsBetter
    ? (tUp ? '#34d399' : '#f87171')
    : (tUp ? '#f87171' : '#34d399')
  const trendLabel = higherIsBetter
    ? (tUp ? 'Converging' : 'Diverging')
    : (tUp ? 'Diverging'  : 'Converging')
  const trendArrow = tUp ? '↑' : '↓'

  // ── Coordinate helpers ───────────────────────────────────────────────────────
  const xs = (i: number) => PAD.left + (i / (n - 1)) * innerW
  const ys = (v: number) => PAD.top + innerH - ((v - lo) / rng) * innerH
  const cl = (y: number) => Math.max(PAD.top, Math.min(PAD.top + innerH, y))

  const tY = cl(ys(avg))

  // ── Zone fill: per-segment polygons with intersection (exact reference impl) ──
  const above: string[] = [], below: string[] = []
  for (let i = 0; i < n - 1; i++) {
    const ya = ys(data[i].value), yb = ys(data[i + 1].value)
    const xa = xs(i), xb = xs(i + 1)
    const aA = ya < tY, bA = yb < tY
    if (aA && bA)       { above.push(`${xa},${tY} ${xa},${ya} ${xb},${yb} ${xb},${tY}`) }
    else if (!aA && !bA){ below.push(`${xa},${tY} ${xa},${ya} ${xb},${yb} ${xb},${tY}`) }
    else {
      const t = (tY - ya) / (yb - ya), xi = xa + t * (xb - xa)
      if (aA) { above.push(`${xa},${tY} ${xa},${ya} ${xi},${tY}`);  below.push(`${xi},${tY} ${xb},${yb} ${xb},${tY}`) }
      else    { below.push(`${xa},${tY} ${xa},${ya} ${xi},${tY}`);  above.push(`${xi},${tY} ${xb},${yb} ${xb},${tY}`) }
    }
  }

  // above = above target line
  // For CPM (lowerIsBetter): above target = bad (red), below = good (green)
  // For CTR/FVR (higherIsBetter): above target = good (green), below = bad (red)
  const aboveColor = higherIsBetter ? '#34d399' : '#f87171'
  const belowColor = higherIsBetter ? '#f87171' : '#34d399'

  const pts = data.map((d, i) => `${xs(i)},${ys(d.value)}`).join(' ')

  const markers = data
    .map((d, i) => ({ d, i, entries: changelog.filter(c => c.date === d.date) }))
    .filter(m => m.entries.length > 0)

  const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const svg = ref.current; if (!svg) return
    const ctm = svg.getScreenCTM(); if (!ctm) return
    const svgPt = svg.createSVGPoint()
    svgPt.x = e.clientX
    svgPt.y = e.clientY
    const { x: svgX } = svgPt.matrixTransform(ctm.inverse())
    const idx = Math.max(0, Math.min(n - 1, Math.round(((svgX - PAD.left) / innerW) * (n - 1))))
    setTooltip({ cx: e.clientX, cy: e.clientY, x: xs(idx), y: ys(data[idx].value), p: data[idx] })
  }

  const sd     = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
  const gradId = `atl-grad-${chartKey}`

  return (
    <>
    <div style={{ flex: 1, minWidth: 0 }}>

      {/* SVG — proportional scaling via viewBox, no stretch */}
      <div style={{ position: 'relative' }}>
        <svg ref={ref}
          viewBox={`0 0 ${VW} ${VH}`}
          width="100%"
          style={{ display: 'block', overflow: 'visible', cursor: 'crosshair' }}
          onMouseMove={onMove} onMouseLeave={() => setTooltip(null)}>

          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity="0.18" />
              <stop offset="100%" stopColor={color} stopOpacity="0.01" />
            </linearGradient>
          </defs>

          {/* Zone fills — per-segment, same as reference */}
          {above.map((p, i) => <polygon key={`a${i}`} points={p} fill={aboveColor} fillOpacity="0.1" />)}
          {below.map((p, i) => <polygon key={`b${i}`} points={p} fill={belowColor} fillOpacity="0.1" />)}

          {/* Average target line — unified tokens */}
          <line x1={PAD.left} y1={tY} x2={VW - PAD.right} y2={tY}
            stroke="#94a3b8" strokeOpacity="0.75" strokeWidth="2" strokeDasharray="4,3" />
          <text x={VW - PAD.right + 3} y={tY + 4}
            fontSize="11" fill="#94a3b8" opacity="1" fontWeight="700">{fmtShort(avg)}</text>

          {/* Regression trendline */}
          <line x1={xs(0)} y1={cl(ys(ic))} x2={xs(n - 1)} y2={cl(ys(slope * (n - 1) + ic))}
            stroke={tc} strokeOpacity="0.45" strokeWidth="1.8" strokeDasharray="4,3" />

          {/* Main data line */}
          <polyline points={pts} fill="none" stroke={color} strokeWidth="2.5"
            strokeLinejoin="round" strokeLinecap="round" />

          {/* Changelog markers — same as reference */}
          {markers.map(m => (
            <g key={m.i}
              onMouseEnter={(e) => setClTooltip({ x: e.clientX, y: e.clientY, entries: m.entries })}
              onMouseLeave={() => setClTooltip(null)}
              onClick={() => { setClTooltip(null); setModalEntries(m.entries) }}
              style={{ cursor: 'pointer' }}>
              <rect x={xs(m.i) - 8} y={PAD.top - 14} width={16} height={18} fill="transparent" />
              <line x1={xs(m.i)} y1={PAD.top} x2={xs(m.i)} y2={PAD.top + innerH}
                stroke="#fbbf24" strokeOpacity="0.28" strokeWidth="1" strokeDasharray="2,2" />
              <polygon points={`${xs(m.i)},${PAD.top - 1} ${xs(m.i) - 4},${PAD.top - 8} ${xs(m.i) + 4},${PAD.top - 8}`}
                fill="#fbbf24" opacity="0.9" />
            </g>
          ))}

          {/* Crosshair — r=4.5 same as reference */}
          {tooltip && (
            <g>
              <line x1={tooltip.x} y1={PAD.top} x2={tooltip.x} y2={PAD.top + innerH}
                stroke="rgba(255,255,255,0.08)" strokeWidth="1" />
              <circle cx={tooltip.x} cy={tooltip.y} r="4.5" fill={color} stroke="#0d0e12" strokeWidth="1.5" />
            </g>
          )}

          {/* Date labels */}
          <text x={PAD.left} y={VH - 2} fontSize="10" fill="rgba(255,255,255,0.65)" textAnchor="start">{sd(data[0].date)}</text>
          <text x={VW - PAD.right} y={VH - 2} fontSize="10" fill="rgba(255,255,255,0.65)" textAnchor="end">{sd(data[n - 1].date)}</text>
        </svg>

        {/* Hover tooltip */}
        {tooltip && (
          <div style={{
            position: 'fixed', pointerEvents: 'none', whiteSpace: 'nowrap', zIndex: 9999,
            top: tooltip.cy + 1,
            left: tooltip.cx + 1,
            background: 'rgba(13,14,18,0.95)', border: `1px solid ${color}50`,
            borderRadius: 7, padding: '4px 8px', backdropFilter: 'blur(8px)',
          }}>
            <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.65)', marginBottom: 1 }}>{sd(tooltip.p.date)}</div>
            <div style={{ fontSize: 11, fontWeight: 700, color }}>{fmt(tooltip.p.value)}</div>
          </div>
        )}

      {clTooltip && <ChangelogTooltip x={clTooltip.x} y={clTooltip.y} entries={clTooltip.entries} />}
      </div>

      {/* ── Trend badge — exact reference tokens ── */}
      <div style={{ display: 'flex', justifyContent: 'flex-start', marginTop: 8 }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: `${tc}12`, border: `1px solid ${tc}28`, borderRadius: 4, padding: '3px 7px' }}>
          <span style={{ fontSize: 9, fontWeight: 800, color: tc }}>{trendArrow}</span>
          <span style={{ fontSize: 9, fontWeight: 700, color: tc }}>{trendLabel}</span>
          <span style={{ fontSize: 9, color: tc, opacity: 1 }}>{rate.toFixed(1)}%/d</span>
        </div>
      </div>

    </div>

    {modalEntries && <ChangelogModal entries={modalEntries} onClose={() => setModalEntries(null)} />}
    </>
  )
}

// ── Main card ─────────────────────────────────────────────────────────────────
export function AtlPerformanceCard({
  totalSpend, totalImpressions, totalLinkClicks,
  totalFirstVisit, totalPageView,
  cpmSeries = [], ctrSeries = [], fvSeries = [],
  changelog = [],
}: AtlPerformanceCardProps) {
  const cpm = totalImpressions > 0 ? (totalSpend / totalImpressions) * 1000 : 0
  const ctr = totalImpressions > 0 ? (totalLinkClicks / totalImpressions) * 100 : 0
  const fvr = totalPageView    > 0 ? (totalFirstVisit / totalPageView) * 100 : 0

  const metrics = [
    { label: 'CPM',               value: cpm > 0 ? fmtRp(Math.round(cpm)) : '—', sub: `${fmtK(totalImpressions)} impressions` },
    { label: 'CTR',               value: ctr > 0 ? fmtPct(ctr)            : '—', sub: `${fmtK(totalLinkClicks)} link clicks` },
    { label: 'First Visit Ratio', value: fvr > 0 ? fmtPct(fvr)            : '—', sub: totalPageView > 0 ? `${fmtK(totalFirstVisit)} FV · ${fmtK(totalPageView)} PV` : 'No page view data' },
  ]

  const charts = [
    {
      series: cpmSeries, color: '#818cf8', key: 'cpm', label: 'CPM',
      higherIsBetter: false,
      fmt:      (v: number) => fmtRp(Math.round(v)),
      fmtShort: (v: number) => v >= 1_000_000 ? 'Rp ' + (v / 1_000_000).toFixed(1) + 'M' : v >= 1_000 ? 'Rp ' + (v / 1_000).toFixed(0) + 'K' : fmtRp(Math.round(v)),
    },
    {
      series: ctrSeries, color: '#34d399', key: 'ctr', label: 'CTR',
      higherIsBetter: true,
      fmt:      (v: number) => fmtPct(v),
      fmtShort: (v: number) => v.toFixed(1) + '%',
    },
    {
      series: fvSeries, color: '#f472b6', key: 'fvr', label: 'First Visit Ratio',
      higherIsBetter: true,
      fmt:      (v: number) => fmtPct(v),
      fmtShort: (v: number) => v.toFixed(1) + '%',
    },
  ]

  return (
    <div style={{
      background: 'rgba(255,255,255,0.04)',
      border: '1px solid rgba(255,255,255,0.09)',
      borderRadius: 14, padding: '24px 28px',
      fontFamily: 'Inter, system-ui, sans-serif',
      display: 'flex', flexDirection: 'column', gap: 20,
    }}>

      {/* ── Title ── */}
      <div style={T.cardTitle}>ATL Performance</div>

      {/* ── Content row ── */}
      <div style={{ display: 'flex', flexDirection: 'row' }}>

        {/* ── Left: stacked metrics ── */}
        <div style={{ flex: '0 0 210px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
            {metrics.map(m => (
              <div key={m.label}>
                <div style={T.label}>{m.label}</div>
                <div style={{ ...T.head, marginTop: 4 }}>{m.value}</div>
                <div style={{ ...T.tiny, marginTop: 4 }}>{m.sub}</div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Divider ── */}
        <div style={{ width: 1, background: 'rgba(255,255,255,0.09)', margin: '0 32px', flexShrink: 0 }} />

        {/* ── Right: charts in a row ── */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'row', alignItems: 'stretch' }}>
          {charts.map((c, idx) => (
            <div key={c.key} style={{
              flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column',
              paddingLeft: idx > 0 ? 24 : 0,
              borderLeft: idx > 0 ? '1px solid rgba(255,255,255,0.06)' : 'none',
              marginLeft: idx > 0 ? 24 : 0,
            }}>
              {/* Chart label — dot + name */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, flexShrink: 0 }}>
                <div style={{ width: 5, height: 5, borderRadius: '50%', background: c.color, flexShrink: 0 }} />
                <span style={{ fontSize: 9, fontWeight: 700, color: c.color, letterSpacing: '0.07em', textTransform: 'uppercase' }}>{c.label}</span>
              </div>
              <Sparkline
                data={c.series} changelog={changelog}
                color={c.color} fmt={c.fmt} fmtShort={c.fmtShort}
                chartKey={c.key} higherIsBetter={c.higherIsBetter}
              />
            </div>
          ))}
        </div>

      </div>
    </div>
  )
}
