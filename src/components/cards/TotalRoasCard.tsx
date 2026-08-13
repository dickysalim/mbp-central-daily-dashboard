/**
 * TotalRoasCard — Total Return on Ad Spend
 * Layout mirrors AdsPerformanceHealthCard:
 *   Left:  Total Sales Revenue headline + Total RoAS sub-headline + SKU breakdown bars
 *   Right: 7-Day MA sparkline chart
 */
import { useRef, useState } from 'react'
import { ChangelogModal } from '../ChangelogModal'
import { ChangelogTooltip } from '../ChangelogTooltip'
import type { ChangelogRow } from '../../types/changelog'
import { fmtRpM as fmtRp } from '../../utils/format'
import { SKU_COLORS } from '../../utils/skuColors'

const fmtFull = (n: number) =>
  'Rp ' + Math.round(n).toLocaleString('id-ID')

/* ── Shared design tokens (identical to AdSpendHealthCard) ──────────────── */
const T = {
  cardTitle:  { fontSize: 14, fontWeight: 800, letterSpacing: '-0.02em', color: '#fff' } as const,
  section:    { fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', color: 'rgba(255,255,255,0.50)', textTransform: 'uppercase' as const },
  headline:   { fontSize: 24, fontWeight: 800, letterSpacing: '-0.04em', color: '#fff', lineHeight: 1, whiteSpace: 'nowrap' as const },
  metaLabel:  { fontSize: 10, fontWeight: 600, color: 'rgba(255,255,255,0.55)', letterSpacing: '0.03em' },
  skuCode:    { fontSize: 13, fontWeight: 700, letterSpacing: '0.07em', minWidth: 32 } as const,
  skuMeta:    { fontSize: 10, fontWeight: 600, color: 'rgba(255,255,255,0.45)' } as const,
  skuValue:   { fontSize: 13, fontWeight: 800, letterSpacing: '-0.02em' } as const,
  pill:       (c: string) => ({
    display: 'inline-flex' as const, alignItems: 'center' as const, gap: 5, marginTop: 6,
    background: `${c}15`, border: `1px solid ${c}30`,
    borderRadius: 5, padding: '3px 8px',
  }),
  barTrack:   { height: 4, background: 'rgba(255,255,255,0.07)', borderRadius: 2 } as const,
  divider:    { borderLeft: '1px solid rgba(255,255,255,0.06)', paddingLeft: 24 } as const,
}

const ROAS_TARGET = 6.59

interface RoasPoint { date: string; value: number }
export interface SkuRoasRow { sku: string; revenue: number; spend: number; roas: number }

export interface TotalRoasCardProps {
  totalSalesRevenue: number
  totalAdSpend:      number
  skuRoas:           SkuRoasRow[]
  roasSeries?:       RoasPoint[]
  changelog?:        ChangelogRow[]
}

export type { ChangelogRow }

function RoasChart({ data, changelog = [] }: { data: RoasPoint[]; changelog: ChangelogRow[] }) {
  const [tooltip, setTooltip] = useState<{ x: number; y: number; p: RoasPoint } | null>(null)
  const [clTooltip, setClTooltip] = useState<{ x: number; y: number; entries: ChangelogRow[] } | null>(null)
  const [modalEntries, setModalEntries] = useState<ChangelogRow[] | null>(null)
  const ref = useRef<SVGSVGElement>(null)

  if (data.length < 2) return null

  const W = 320, H = 180
  const PAD = { top: 10, right: 52, bottom: 20, left: 6 }
  const innerW = W - PAD.left - PAD.right
  const innerH = H - PAD.top - PAD.bottom

  const vals = data.map(d => d.value)
  const minV = 0
  const maxV = Math.max(ROAS_TARGET * 2, ...vals)
  const rng  = maxV - minV || 1
  const n    = vals.length

  const xs = (i: number) => PAD.left + (i / (n - 1)) * innerW
  const ys = (v: number) => PAD.top + innerH - ((v - minV) / rng) * innerH
  const refY = ys(ROAS_TARGET)

  // Trend line
  const mX = (n - 1) / 2
  const mY = vals.reduce((a, b) => a + b, 0) / n
  const slope = vals.reduce((s, v, i) => s + (i - mX) * (v - mY), 0) /
                vals.reduce((s, _, i) => s + (i - mX) ** 2, 0)
  const ic = mY - slope * mX
  const tUp = slope > 0
  const tc = tUp ? '#34d399' : '#f87171'
  const rate = Math.abs((slope / mY) * 100)
  const lineColor = tUp ? '#34d399' : rate < 1 ? '#fbbf24' : '#f87171'

  const pts = data.map((d, i) => `${xs(i)},${ys(d.value)}`).join(' ')

  // Shading above/below target line
  const above: string[] = [], below: string[] = []
  for (let i = 0; i < n - 1; i++) {
    const ya = ys(data[i].value), yb = ys(data[i + 1].value)
    const xa = xs(i), xb = xs(i + 1)
    const aA = ya < refY, bA = yb < refY
    if (aA && bA)        { above.push(`${xa},${refY} ${xa},${ya} ${xb},${yb} ${xb},${refY}`) }
    else if (!aA && !bA) { below.push(`${xa},${refY} ${xa},${ya} ${xb},${yb} ${xb},${refY}`) }
    else {
      const t = (refY - ya) / (yb - ya), xi = xa + t * (xb - xa)
      if (aA) { above.push(`${xa},${refY} ${xa},${ya} ${xi},${refY}`); below.push(`${xi},${refY} ${xb},${yb} ${xb},${refY}`) }
      else    { below.push(`${xa},${refY} ${xa},${ya} ${xi},${refY}`); above.push(`${xi},${refY} ${xb},${yb} ${xb},${refY}`) }
    }
  }

  const sd = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
  const refVisible = refY > PAD.top && refY < PAD.top + innerH

  // Changelog markers
  const markers = data.map((d, i) => ({ d, i, entries: changelog.filter(c => c.date === d.date) }))
    .filter(m => m.entries.length > 0)

  const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const r = ref.current?.getBoundingClientRect(); if (!r) return
    const scale = r.width / W
    const svgX = (e.clientX - r.left) / scale  // screen → SVG coords
    const idx = Math.max(0, Math.min(n - 1, Math.round(((svgX - PAD.left) / innerW) * (n - 1))))
    setTooltip({ x: xs(idx), y: ys(data[idx].value), p: data[idx] })
  }

  return (
    <>
    <div style={{ position: 'relative' }}>
      <svg ref={ref} width={W} height={H}
        onMouseMove={onMove} onMouseLeave={() => setTooltip(null)}
        style={{ display: 'block', overflow: 'visible', cursor: 'crosshair' }}>
        {above.map((p, i) => <polygon key={`a${i}`} points={p} fill="#34d399" fillOpacity="0.1" />)}
        {below.map((p, i) => <polygon key={`b${i}`} points={p} fill="#f87171" fillOpacity="0.1" />)}

        {/* Target reference */}
        {refVisible && (
          <>
            <line x1={PAD.left} y1={refY} x2={W - PAD.right} y2={refY}
              stroke="#94a3b8" strokeOpacity="0.75" strokeWidth="2" strokeDasharray="4,3" />
            <text x={W - PAD.right + 3} y={refY + 5} fontSize="12" fill="#94a3b8" fontWeight="700">{ROAS_TARGET}×</text>
          </>
        )}
        {Math.max(...vals) > ROAS_TARGET * 2 && (() => {
          const ceilY = ys(ROAS_TARGET * 2)
          return <>
            <line x1={PAD.left} y1={ceilY} x2={W - PAD.right} y2={ceilY}
              stroke="#f87171" strokeOpacity="0.5" strokeWidth="1" />
            <text x={W - PAD.right + 3} y={ceilY + 4} fontSize="12" fill="#f87171" opacity="0.8" fontWeight="700">!</text>
          </>
        })()}

        {/* Trend line */}
        <line x1={xs(0)} y1={ys(ic)} x2={xs(n - 1)} y2={ys(slope * (n - 1) + ic)}
          stroke={tc} strokeOpacity="0.65" strokeWidth="3.5" strokeDasharray="4,3" />

        {/* Data line */}
        <polyline points={pts} fill="none" stroke={lineColor} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />

        {/* Changelog markers */}
        {markers.map(m => (
          <g key={m.i}
            onMouseEnter={(e) => setClTooltip({ x: e.clientX, y: e.clientY, entries: m.entries })}
            onMouseLeave={() => setClTooltip(null)}
            onClick={() => { setClTooltip(null); setModalEntries(m.entries) }}
            style={{ cursor: 'pointer' }}>
            <rect x={xs(m.i) - 8} y={PAD.top - 14} width={16} height={18} fill="transparent" />
            <line x1={xs(m.i)} y1={PAD.top} x2={xs(m.i)} y2={PAD.top + innerH} stroke="#fbbf24" strokeOpacity="0.28" strokeWidth="1" strokeDasharray="2,2" />
            <polygon points={`${xs(m.i)},${PAD.top - 1} ${xs(m.i) - 4},${PAD.top - 8} ${xs(m.i) + 4},${PAD.top - 8}`} fill="#fbbf24" opacity="0.9" />
          </g>
        ))}

        {/* Hover crosshair + dot */}
        {tooltip && (
          <g>
            <line x1={tooltip.x} y1={PAD.top} x2={tooltip.x} y2={PAD.top + innerH} stroke="rgba(255,255,255,0.08)" strokeWidth="1" />
            <circle cx={tooltip.x} cy={tooltip.y} r="4.5" fill="#818cf8" stroke="#0d0e12" strokeWidth="1.5" />
          </g>
        )}

        {/* Date labels */}
        <text x={PAD.left} y={H - 2} fontSize="10" fill="rgba(255,255,255,0.65)" textAnchor="start">{sd(data[0].date)}</text>
        <text x={xs(n - 1)} y={H - 2} fontSize="10" fill="rgba(255,255,255,0.65)" textAnchor="end">{sd(data[n - 1].date)}</text>
      </svg>

      {/* Trend badge */}
      <div style={{ display: 'flex', justifyContent: 'flex-start', marginTop: 8 }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: `${tc}12`, border: `1px solid ${tc}28`, borderRadius: 4, padding: '3px 7px' }}>
          <span style={{ fontSize: 9, fontWeight: 800, color: tc }}>{tUp ? '↑' : '↓'}</span>
          <span style={{ fontSize: 9, fontWeight: 700, color: tc }}>{tUp ? 'Improving' : 'Declining'}</span>
          <span style={{ fontSize: 9, color: tc, opacity: 1 }}>{rate.toFixed(1)}%/d</span>
        </div>
      </div>

      {/* Hover tooltip */}
      {tooltip && (
        <div style={{
          position: 'absolute', pointerEvents: 'none', whiteSpace: 'nowrap',
          top: Math.max(0, tooltip.y - 38), left: tooltip.x > W * 0.6 ? tooltip.x - 130 : tooltip.x + 8,
          background: 'rgba(13,14,18,0.95)', border: '1px solid rgba(129,140,248,0.35)',
          borderRadius: 7, padding: '4px 8px', backdropFilter: 'blur(8px)',
        }}>
          <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.65)', marginBottom: 1 }}>{sd(tooltip.p.date)}</div>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#818cf8' }}>{tooltip.p.value.toFixed(2)}× RoAS</div>
        </div>
      )}

      {clTooltip && <ChangelogTooltip x={clTooltip.x} y={clTooltip.y} entries={clTooltip.entries} />}
    </div>

    {modalEntries && <ChangelogModal entries={modalEntries} onClose={() => setModalEntries(null)} />}
    </>
  )
}


/* ── Main card ─────────────────────────────────────────────────────────────── */
export function TotalRoasCard({
  totalSalesRevenue,
  totalAdSpend,
  skuRoas,
  roasSeries = [],
  changelog  = [],
}: TotalRoasCardProps) {

  const totalRoas = totalAdSpend > 0 ? totalSalesRevenue / totalAdSpend : 0
  const div = totalRoas > 0 ? ((totalRoas - ROAS_TARGET) / ROAS_TARGET) * 100 : null
  const roasColor = totalRoas >= ROAS_TARGET ? '#34d399' : totalRoas >= ROAS_TARGET * 0.9 ? '#fbbf24' : '#f87171'
  const roasLabel = totalRoas >= ROAS_TARGET ? '🟢 On Target' : totalRoas >= ROAS_TARGET * 0.9 ? '🟡 Slightly Below' : '🔴 Below Target'
  const maxRoas   = Math.max(...skuRoas.map(s => s.roas), ROAS_TARGET)
  const hasChart  = roasSeries.length > 1

  return (
    <div style={{
      flex: '1.3 1 520px', minWidth: 0,
      background: 'rgba(255,255,255,0.04)',
      border: '1px solid rgba(255,255,255,0.09)',
      borderRadius: 14, padding: '24px 28px',
      display: 'flex', flexDirection: 'column', gap: 16,
      fontFamily: 'Inter, system-ui, sans-serif',
      overflow: 'hidden',
    }}>

      {/* Card title */}
      <div style={T.cardTitle}>RoAS Health</div>

      {/* Content row */}
      <div style={{ display: 'flex', flexDirection: 'row', gap: 0 }}>

        {/* LEFT — headline + sub-headline */}
        <div style={{ flex: '0 0 220px', display: 'flex', flexDirection: 'column', gap: 10, paddingRight: 24 }}>

          {/* Headline: Total Sales Revenue */}
          <div>
            <div style={T.section}>Total Sales Revenue</div>
            <div style={{ ...T.headline, marginTop: 4 }}>
              {totalSalesRevenue > 0 ? fmtFull(totalSalesRevenue) : '—'}
            </div>
          </div>

          {/* Sub headline: Total RoAS / Target RoAS */}
          <div>
            <div style={{ ...T.section, marginBottom: 5 }}>Total RoAS</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
              {/* Current */}
              <span style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.03em', color: roasColor }}>
                {totalRoas > 0 ? totalRoas.toFixed(2) + '×' : '—'}
              </span>
              {/* Separator */}
              <span style={{ fontSize: 18, fontWeight: 300, color: 'rgba(255,255,255,0.2)', lineHeight: 1 }}>/</span>
              {/* Target */}
              <span style={{ ...T.section, alignSelf: 'center' }}>
                {ROAS_TARGET}×
              </span>
            </div>
            {div !== null && (
              <div style={T.pill(roasColor)}>
                <div style={{ width: 4, height: 4, borderRadius: '50%', background: roasColor }} />
                <span style={{ fontSize: 10, fontWeight: 700, color: roasColor }}>{roasLabel}</span>
                <span style={{ fontSize: 10, color: roasColor, opacity: 0.75 }}>{div > 0 ? '+' : ''}{div.toFixed(1)}%</span>
              </div>
            )}
          </div>

        </div>

        {/* MIDDLE — chart */}
        {hasChart && (
          <div style={{
            flex: '0 0 360px', minWidth: 0,
            ...T.divider,
            display: 'flex', alignItems: 'center',
          }}>
            <div style={{ width: '100%', maxWidth: 320 }}>
              <RoasChart data={roasSeries} changelog={changelog} />
            </div>
          </div>
        )}

        {/* RIGHT — per-SKU breakdown */}
        <div style={{
          flex: '1 1 auto',
          ...T.divider,
          display: 'flex', flexDirection: 'column', justifyContent: 'flex-start', gap: 10,
        }}>
          <div style={T.section}>Breakdown by Product</div>
          {skuRoas.map(s => {
            const color = SKU_COLORS[s.sku] ?? 'rgba(255,255,255,0.68)'
            const barPct = maxRoas > 0 ? Math.min((s.roas / maxRoas) * 100, 100) : 0
            const onTarget = s.roas >= ROAS_TARGET
            const gapPct = ROAS_TARGET > 0 ? ((ROAS_TARGET - s.roas) / ROAS_TARGET) * 100 : 0
            // green = at/above target, yellow = within 10% below, red = >10% below
            const barColor = s.roas >= ROAS_TARGET ? '#34d399'
                           : gapPct <= 10 ? '#fbbf24'
                           : '#f87171'
            return (
              <div key={s.sku}>
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 4 }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                    <span style={{ ...T.skuCode, color }}>{s.sku}</span>
                    <span style={T.skuMeta}>
                      {fmtRp(s.revenue)} / {fmtRp(s.spend)}
                    </span>
                  </div>
                  <span style={{ ...T.skuValue, color: barColor }}>
                    {s.roas.toFixed(2)}×
                  </span>
                </div>
                <div style={{ ...T.barTrack, position: 'relative' }}>
                  <div style={{
                    height: '100%', width: `${barPct}%`,
                    background: barColor, borderRadius: 2,
                    transition: 'width 0.4s ease',
                  }} />
                  {maxRoas > 0 && (
                    <div style={{
                      position: 'absolute', top: -2, bottom: -2,
                      left: `${Math.min((ROAS_TARGET / maxRoas) * 100, 100)}%`,
                      width: 1.5, background: 'rgba(255,255,255,0.35)', borderRadius: 1,
                    }} />
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>


  )
}
