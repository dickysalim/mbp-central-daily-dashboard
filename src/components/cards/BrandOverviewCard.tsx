/**
 * BrandOverviewCard — compact brand card for GeneralOverviewPage
 * Shows brand identity + 4 always-visible sparkline charts.
 */
import { useState, useRef } from 'react'
import type { ChangelogRow } from '../../types/changelog'
import { ChangelogTooltip } from '../ChangelogTooltip'
import { ChangelogModal } from '../ChangelogModal'

// ── Types ─────────────────────────────────────────────────────────────────────
interface DataPoint { date: string; value: number }

export interface ChartSlot {
  key:            string
  label:          string
  color:          string
  series:         DataPoint[]
  value:          string        // pre-formatted display value
  sub:            string        // subtitle text
  target:         number
  higherIsBetter: boolean
  fmt:            (v: number) => string
  fmtShort:       (v: number) => string
  zonedRange?:    boolean       // true for RoAS: ±25% target-centered Y-axis
  rawValue?:      number        // actual numeric value for on-target comparison
  // Volume toggle (Daily/Volume)
  volumeSeries?:  DataPoint[]
  volumeValue?:   string
  volumeSub?:     string
  volumeRawValue?: number
  volumeFmt?:     (v: number) => string
  volumeFmtShort?: (v: number) => string
  volumeLabels?:  [string, string]  // [ratioLabel, volumeLabel], defaults to ['Daily','Volume']
}

export interface TrafficSourceData {
  label:    string
  color:    string
  image?:   string
  charts:   ChartSlot[]     // 5 charts: CPRL, CPQL, CC CVR, CPA CC, RoAS CC
}

export interface BrandOverviewCardProps {
  brandLabel:       string
  productName:      string
  brandColor:       string
  imageSrc?:        string
  charts:           ChartSlot[]    // top-level charts (always visible)
  changelog?:       ChangelogRow[]
  trafficSources?:  TrafficSourceData[]   // collapsible per-traffic-source breakdown
}

// ── Sparkline ─────────────────────────────────────────────────────────────────
function Sparkline({ data, changelog = [], color, fmt, fmtShort, chartKey, higherIsBetter, fixedTarget, zonedRange = false }: {
  data:           DataPoint[]
  changelog:      ChangelogRow[]
  color:          string
  fmt:            (v: number) => string
  fmtShort:       (v: number) => string
  chartKey:       string
  higherIsBetter: boolean
  fixedTarget:    number
  zonedRange?:    boolean   // true for RoAS: ±25% of target, auto-expand in 25% steps
}) {
  const VW = 320, VH = 140
  const PAD = { top: 10, right: 52, bottom: 20, left: 6 }
  const innerW = VW - PAD.left - PAD.right
  const innerH = VH - PAD.top - PAD.bottom

  const [tooltip,   setTooltip]   = useState<{ cx: number; cy: number; x: number; y: number; p: DataPoint } | null>(null)
  const [clTooltip, setClTooltip] = useState<{ x: number; y: number; entries: ChangelogRow[] } | null>(null)
  const [modalEntries, setModalEntries] = useState<ChangelogRow[] | null>(null)
  const ref = useRef<SVGSVGElement>(null)

  if (data.length < 2) return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center' }}>
      <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)' }}>—</span>
    </div>
  )

  const vals = data.map(d => d.value)
  const n    = vals.length
  const avg  = vals.reduce((s, v) => s + v, 0) / n
  const target = fixedTarget ?? avg

  // Y-axis range
  let minV: number, maxV: number
  if (zonedRange && target > 0) {
    // ±25% of target, expand in 25% increments if data exceeds
    const step = target * 0.25
    const dataMin = Math.min(...vals)
    const dataMax = Math.max(...vals)
    minV = target - step
    maxV = target + step
    while (minV > dataMin) minV -= step
    while (maxV < dataMax) maxV += step
    if (minV < 0) minV = 0
  } else {
    minV = 0
    maxV = Math.max(target * 2, ...vals)
  }
  const rng  = maxV - minV || 1

  // Regression
  const mX    = (n - 1) / 2
  const slope = vals.reduce((s, v, i) => s + (i - mX) * (v - avg), 0) /
                vals.reduce((s, _, i) => s + (i - mX) ** 2, 0)
  const ic    = avg - slope * mX
  const rate  = target > 0 ? Math.abs((slope / target) * 100) : 0

  const tUp = slope > 0
  const tc   = higherIsBetter
    ? (tUp ? '#34d399' : '#f87171')
    : (tUp ? '#f87171' : '#34d399')
  const trendLabel = higherIsBetter
    ? (tUp ? 'Converging' : 'Diverging')
    : (tUp ? 'Diverging'  : 'Converging')
  const trendArrow = tUp ? '↑' : '↓'
  const isConverging = trendLabel === 'Converging' || (higherIsBetter ? tUp : !tUp)
  const lineColor = isConverging ? '#34d399' : rate < 1 ? '#fbbf24' : '#f87171'

  // Coordinates
  const xs = (i: number) => PAD.left + (i / (n - 1)) * innerW
  const ys = (v: number) => PAD.top + innerH - ((v - minV) / rng) * innerH
  const cl = (y: number) => Math.max(PAD.top, Math.min(PAD.top + innerH, y))
  const tY = cl(ys(target))

  // Zone fills
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

  const sd = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })

  return (
    <>
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ position: 'relative' }}>
        <svg ref={ref}
          viewBox={`0 0 ${VW} ${VH}`}
          width="100%"
          style={{ display: 'block', overflow: 'visible', cursor: 'crosshair' }}
          onMouseMove={onMove} onMouseLeave={() => setTooltip(null)}>

          {/* Zone bands (when zonedRange) — 25% intervals with increasing opacity */}
          {zonedRange && target > 0 && [1, 2, 3, 4].map(k => {
            const goodColor = higherIsBetter ? '#15803d' : '#dc2626'
            const badColor  = higherIsBetter ? '#dc2626' : '#15803d'
            // Below target bands
            const bHi = target * (1 - (k - 1) * 0.25)
            const bLo = target * (1 - k * 0.25)
            const cbHi = Math.min(bHi, maxV), cbLo = Math.max(bLo, minV)
            // Above target bands
            const aLo2 = target * (1 + (k - 1) * 0.25)
            const aHi2 = target * (1 + k * 0.25)
            const caHi = Math.min(aHi2, maxV), caLo = Math.max(aLo2, minV)
            return (<g key={`z${k}`}>
              {cbLo < cbHi && <rect x={PAD.left} y={ys(cbHi)} width={innerW} height={Math.max(0, ys(cbLo) - ys(cbHi))} fill={badColor} fillOpacity={k * 0.07} />}
              {caLo < caHi && <rect x={PAD.left} y={ys(caHi)} width={innerW} height={Math.max(0, ys(caLo) - ys(caHi))} fill={goodColor} fillOpacity={k * 0.07} />}
            </g>)
          })}

          {above.map((p, i) => <polygon key={`a${i}`} points={p} fill={aboveColor} fillOpacity="0.1" />)}
          {below.map((p, i) => <polygon key={`b${i}`} points={p} fill={belowColor} fillOpacity="0.1" />)}

          {/* Target line */}
          <line x1={PAD.left} y1={tY} x2={VW - PAD.right} y2={tY}
            stroke="#94a3b8" strokeOpacity="0.75" strokeWidth="2" strokeDasharray="4,3" />
          <text x={VW - PAD.right + 3} y={tY + 5}
            fontSize={12} fill="#94a3b8" opacity="1" fontWeight="700">{fmtShort(target)}</text>

          {/* Trendline */}
          <line x1={xs(0)} y1={cl(ys(ic))} x2={xs(n - 1)} y2={cl(ys(slope * (n - 1) + ic))}
            stroke={tc} strokeOpacity="0.65" strokeWidth="3.5" strokeDasharray="4,3" />

          {/* Main data line */}
          <polyline points={pts} fill="none" stroke={lineColor} strokeWidth="2.5"
            strokeLinejoin="round" strokeLinecap="round" />

          {/* Changelog markers */}
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

          {tooltip && (
            <g>
              <line x1={tooltip.x} y1={PAD.top} x2={tooltip.x} y2={PAD.top + innerH}
                stroke="rgba(255,255,255,0.08)" strokeWidth="1" />
              <circle cx={tooltip.x} cy={tooltip.y} r="4.5" fill={color} stroke="#0d0e12" strokeWidth="1.5" />
            </g>
          )}

          <text x={PAD.left} y={VH - 2} fontSize="10" fill="rgba(255,255,255,0.48)" textAnchor="start">{sd(data[0].date)}</text>
          <text x={VW - PAD.right} y={VH - 2} fontSize="10" fill="rgba(255,255,255,0.48)" textAnchor="end">{sd(data[n - 1].date)}</text>
        </svg>

        {tooltip && (
          <div style={{
            position: 'absolute', pointerEvents: 'none', whiteSpace: 'nowrap', zIndex: 99,
            bottom: 0,
            left: tooltip.x > VW * 0.6 ? tooltip.x - 130 : tooltip.x + 8,
            background: 'rgba(13,14,18,0.95)', border: `1px solid ${color}50`,
            borderRadius: 7, padding: '4px 8px', backdropFilter: 'blur(8px)',
          }}>
            <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.65)', marginBottom: 1 }}>{sd(tooltip.p.date)}</div>
            <div style={{ fontSize: 11, fontWeight: 700, color }}>{fmt(tooltip.p.value)}</div>
          </div>
        )}

        {clTooltip && <ChangelogTooltip x={clTooltip.x} y={clTooltip.y} entries={clTooltip.entries} />}
      </div>

      {/* Trend badge */}
      <div style={{ display: 'flex', justifyContent: 'flex-start', marginTop: 8 }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: `${tc}12`, border: `1px solid ${tc}28`, borderRadius: 4, padding: '3px 7px' }}>
          <span style={{ fontSize: 10, fontWeight: 800, color: tc }}>{trendArrow}</span>
          <span style={{ fontSize: 10, fontWeight: 700, color: tc }}>{trendLabel}</span>
          <span style={{ fontSize: 10, color: tc, opacity: 1 }}>{rate.toFixed(1)}%/d</span>
        </div>
      </div>
    </div>

    {modalEntries && <ChangelogModal entries={modalEntries} onClose={() => setModalEntries(null)} />}
    </>
  )
}

// ── Chart Column ──────────────────────────────────────────────────────────────
function ChartCol({ c, changelog, borderLeft }: { c: ChartSlot; changelog: ChangelogRow[]; borderLeft?: boolean }) {
  const [mode, setMode] = useState<'ratio' | 'volume'>('ratio')
  const hasVolume = (c.volumeSeries?.length ?? 0) > 1
  const isVolume = mode === 'volume' && hasVolume

  // Resolve effective chart data based on mode
  const volAvg = hasVolume ? c.volumeSeries!.reduce((s, p) => s + p.value, 0) / c.volumeSeries!.length : 0
  const effSeries = isVolume ? c.volumeSeries! : c.series
  const effValue = isVolume ? (c.volumeValue ?? c.value) : c.value
  const effRawValue = isVolume ? (c.volumeRawValue ?? volAvg) : (c.rawValue ?? parseFloat(c.value.replace(/[^\d.]/g, '')))
  const effSub = isVolume ? (c.volumeSub ?? `Avg ${Math.round(volAvg).toLocaleString('id-ID')}`) : c.sub
  const effTarget = isVolume ? volAvg : c.target
  const effHigherIsBetter = isVolume ? true : c.higherIsBetter
  const effFmt = isVolume ? (c.volumeFmt ?? ((v: number) => Math.round(v).toLocaleString('id-ID'))) : c.fmt
  const effFmtShort = isVolume ? (c.volumeFmtShort ?? ((v: number) => v >= 1000 ? `${(v / 1000).toFixed(1)}K` : Math.round(v).toString())) : c.fmtShort

  const divPct = (a: number, b: number) => Math.abs(((a - b) / b) * 100)
  const numVal = effRawValue
  const onTarget = effHigherIsBetter ? numVal >= effTarget : numVal <= effTarget
  const isGood = effValue !== '—' && !isNaN(numVal) && onTarget
  const clr = isGood ? '#34d399' : '#f87171'
  const bg  = isGood ? 'rgba(52,211,153,0.12)' : 'rgba(248,113,113,0.12)'
  const bdr = isGood ? 'rgba(52,211,153,0.28)' : 'rgba(248,113,113,0.28)'

  // Compute actual divergence from raw series
  const rawTotal = effSeries.length > 0
    ? effSeries.reduce((s, p) => s + p.value, 0) / effSeries.length
    : 0
  const div = rawTotal > 0 ? divPct(rawTotal, effTarget) : 0

  return (
    <div style={{
      flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column',
      paddingLeft: borderLeft ? 16 : 0,
      borderLeft: borderLeft ? '1px solid rgba(255,255,255,0.06)' : 'none',
      marginLeft: borderLeft ? 16 : 0,
    }}>
      {/* Header */}
      <div style={{ marginBottom: 8, flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 3 }}>
          <div style={{ width: 5, height: 5, borderRadius: '50%', background: c.color }} />
          <span style={{ fontSize: 10, fontWeight: 700, color: c.color, letterSpacing: '0.08em', textTransform: 'uppercase' as const }}>{c.label}</span>
          {/* Daily / Volume toggle */}
          {hasVolume && (
            <div style={{ display: 'flex', gap: 3, marginLeft: 'auto' }}>
              {(['ratio', 'volume'] as const).map(m => {
                const active = mode === m
                return (
                  <button key={m} onClick={() => setMode(m)} style={{
                    padding: '1px 5px', fontSize: 7, fontWeight: 700, borderRadius: 3,
                    border: 'none', cursor: 'pointer', letterSpacing: '0.03em',
                    background: active ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.04)',
                    color: active ? '#fff' : 'rgba(255,255,255,0.35)',
                  }}>{m === 'ratio' ? (c.volumeLabels?.[0] ?? 'Daily') : (c.volumeLabels?.[1] ?? 'Volume')}</button>
                )
              })}
            </div>
          )}
        </div>
        <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: '-0.04em', color: '#fff', lineHeight: 1, whiteSpace: 'nowrap' }}>
          {effValue}
        </div>
        <div style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.65)', letterSpacing: '0.05em', textTransform: 'uppercase' as const, marginTop: 4 }}>
          {effSub}
        </div>
        {effValue !== '—' && (
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 3,
            marginTop: 5, padding: '2px 6px', borderRadius: 20,
            background: bg, border: `1px solid ${bdr}`,
            fontSize: 10, fontWeight: 700, color: clr, whiteSpace: 'nowrap' as const,
          }}>
            {isGood ? '↑' : '↓'} {isGood ? 'On Target' : 'Off Target'} · {div.toFixed(1)}%
          </div>
        )}
      </div>
      {/* Sparkline */}
      <Sparkline
        data={effSeries} changelog={changelog}
        color={c.color} fmt={effFmt} fmtShort={effFmtShort}
        chartKey={c.key + (isVolume ? '-vol' : '')} higherIsBetter={effHigherIsBetter}
        fixedTarget={effTarget}
        zonedRange={isVolume ? false : c.zonedRange}
      />
    </div>
  )
}

// ── BrandOverviewCard ─────────────────────────────────────────────────────────
export function BrandOverviewCard({
  brandLabel, productName, brandColor, imageSrc,
  charts, changelog = [], trafficSources = [],
}: BrandOverviewCardProps) {
  const [expanded, setExpanded] = useState(false)
  const hasTS = trafficSources.length > 0

  return (
    <div style={{
      background: 'rgba(255,255,255,0.04)',
      border: '1px solid rgba(255,255,255,0.09)',
      borderRadius: 14, padding: '20px 24px',
      fontFamily: 'Inter, system-ui, sans-serif',
    }}>

      {/* ── Brand identity row ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        {imageSrc && (
          <img src={imageSrc} alt={brandLabel}
            style={{ width: 36, height: 36, borderRadius: 8, objectFit: 'cover', flexShrink: 0 }} />
        )}
        <div>
          <div style={{ fontSize: 16, fontWeight: 800, color: '#fff', letterSpacing: '-0.02em' }}>{brandLabel}</div>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', fontWeight: 600 }}>{productName}</div>
        </div>
      </div>

      {/* ── Top charts (always visible) ── */}
      <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'stretch' }}>
        {charts.map((c, idx) => (
          <ChartCol key={c.key} c={c} changelog={changelog} borderLeft={idx > 0} />
        ))}
      </div>

      {/* ── Toggle button below charts ── */}
      {hasTS && (
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: 16 }}>
          <button
            onClick={() => setExpanded(!expanded)}
            style={{
              background: expanded ? 'rgba(129,140,248,0.12)' : 'rgba(255,255,255,0.06)',
              border: `1px solid ${expanded ? 'rgba(129,140,248,0.3)' : 'rgba(255,255,255,0.12)'}`,
              borderRadius: 6, color: expanded ? '#818cf8' : 'rgba(255,255,255,0.5)',
              padding: '5px 14px', fontSize: 11, fontWeight: 600,
              cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5,
              transition: 'all 0.2s',
            }}
          >
            <span style={{ transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.2s', display: 'inline-block', fontSize: 10 }}>▶</span>
            By Platform
          </button>
        </div>
      )}

      {/* ── Collapsible per-traffic-source breakdown ── */}
      {expanded && trafficSources.length > 0 && (
        <div style={{ marginTop: 28, borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 20, display: 'flex', flexDirection: 'column', gap: 24 }}>
          {trafficSources.map(ts => (
            <div key={ts.label} style={{
              border: '1px solid rgba(255,255,255,0.10)',
              borderRadius: 10, padding: '16px 20px',
              background: 'rgba(255,255,255,0.05)',
            }}>
              {/* Traffic source header */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                {ts.image && (
                  <img src={ts.image} alt={ts.label}
                    style={{ width: 22, height: 22, borderRadius: 5, objectFit: 'cover' }} />
                )}
                <span style={{ fontSize: 12, fontWeight: 700, color: ts.color, letterSpacing: '0.06em', textTransform: 'uppercase' as const }}>{ts.label}</span>
              </div>
              {/* 5 charts */}
              <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'stretch' }}>
                {ts.charts.map((c, idx) => (
                  <ChartCol key={c.key} c={c} changelog={changelog} borderLeft={idx > 0} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

    </div>
  )
}
