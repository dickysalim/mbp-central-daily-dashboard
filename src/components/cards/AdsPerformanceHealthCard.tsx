/**
 * AdsPerformanceHealthCard — v3
 * Left: CPRL headline + status + leads + channels
 * Right: CPRL trend chart — badge below chart
 */
import { useRef, useState } from 'react'
import { createPortal } from 'react-dom'

const fmtRp = (n: number) => 'Rp ' + Math.round(n).toLocaleString('id-ID')

export interface CprlPoint   { date: string; value: number }
export interface ChangelogRow { date: string; date_end: string | null; brand: string; sku: string; title: string; changelist: string }

export interface SkuCprlRow { sku: string; cprl: number; leads: number }

export interface AdsPerformanceHealthCardProps {
  totalSpend: number
  realLeadCcom: number; realLeadD2or: number
  realLeadMpsh: number; realLeadOfls: number
  cprlSeries?: CprlPoint[]
  changelog?: ChangelogRow[]
  skuCprl?: SkuCprlRow[]
}

const CPRL_TARGET = 150_000

const SKU_COLORS: Record<string, string> = {
  MTA: '#fdba74', MSF: '#f97316', M3P: '#34d399', MNS: '#60a5fa',
}

const T = {
  cardTitle: { fontSize: 14, fontWeight: 800, letterSpacing: '-0.02em', color: '#fff' } as const,
  headline:  { fontSize: 24, fontWeight: 800, letterSpacing: '-0.04em', color: '#fff', lineHeight: 1, whiteSpace: 'nowrap' as const },
  section:   { fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', color: 'rgba(255,255,255,0.50)', textTransform: 'uppercase' as const },
  label: { fontSize: 9, fontWeight: 600, letterSpacing: '0.09em', color: 'rgba(255,255,255,0.62)', textTransform: 'uppercase' as const },
  tiny:  { fontSize: 9, fontWeight: 600, color: 'rgba(255,255,255,0.76)', letterSpacing: '0.05em', textTransform: 'uppercase' as const },
  divider: { borderLeft: '1px solid rgba(255,255,255,0.06)', paddingLeft: 24 } as const,
}

const CHANNELS = [
  { key: 'ccom', label: 'CCOM', color: '#818cf8' },
  { key: 'd2or', label: 'D2OR', color: '#34d399' },
  { key: 'mpsh', label: 'MPSH', color: '#fbbf24' },
  { key: 'ofls', label: 'OFLS', color: '#f87171' },
] as const

// ── Chart ─────────────────────────────────────────────────────────────────────
function CprlChart({ data, changelog }: { data: CprlPoint[]; changelog: ChangelogRow[] }) {
  const W = 320, H = 180, PAD = { top: 10, right: 52, bottom: 20, left: 6 }
  const innerW = W - PAD.left - PAD.right
  const innerH = H - PAD.top - PAD.bottom
  const [tooltip, setTooltip] = useState<{ x: number; y: number; p: CprlPoint } | null>(null)
  const [clTooltip, setClTooltip] = useState<{ x: number; y: number; entry: ChangelogRow } | null>(null)
  const ref = useRef<SVGSVGElement>(null)

  if (data.length < 2) return null

  const vals = data.map(d => d.value)
  const minV = Math.min(...vals, CPRL_TARGET) * 0.96
  const maxV = Math.max(...vals, CPRL_TARGET) * 1.04
  const rng  = maxV - minV || 1
  const n    = vals.length

  const xs = (i: number) => PAD.left + (i / (n - 1)) * innerW
  const ys = (v: number) => PAD.top + innerH - ((v - minV) / rng) * innerH
  const tY  = ys(CPRL_TARGET)

  const mX = (n - 1) / 2
  const mY = vals.reduce((a, b) => a + b, 0) / n
  const slope = vals.reduce((s, v, i) => s + (i - mX) * (v - mY), 0) /
                vals.reduce((s, _, i) => s + (i - mX) ** 2, 0)
  const ic  = mY - slope * mX
  const tUp = slope > 0
  const tc  = tUp ? '#f87171' : '#34d399'
  const rate = Math.abs((slope / CPRL_TARGET) * 100)

  const pts = data.map((d, i) => `${xs(i)},${ys(d.value)}`).join(' ')

  const above: string[] = [], below: string[] = []
  for (let i = 0; i < n - 1; i++) {
    const ya = ys(data[i].value), yb = ys(data[i + 1].value)
    const xa = xs(i), xb = xs(i + 1)
    const aA = ya < tY, bA = yb < tY
    if (aA && bA)        { above.push(`${xa},${tY} ${xa},${ya} ${xb},${yb} ${xb},${tY}`) }
    else if (!aA && !bA) { below.push(`${xa},${tY} ${xa},${ya} ${xb},${yb} ${xb},${tY}`) }
    else {
      const t = (tY - ya) / (yb - ya), xi = xa + t * (xb - xa)
      if (aA) { above.push(`${xa},${tY} ${xa},${ya} ${xi},${tY}`); below.push(`${xi},${tY} ${xb},${yb} ${xb},${tY}`) }
      else    { below.push(`${xa},${tY} ${xa},${ya} ${xi},${tY}`); above.push(`${xi},${tY} ${xb},${yb} ${xb},${tY}`) }
    }
  }

  const clDates = new Set(changelog.map(c => c.date))
  const markers = data.map((d, i) => ({ d, i, entry: changelog.find(c => c.date === d.date) })).filter((m): m is typeof m & { entry: ChangelogRow } => m.entry != null)

  const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const r = ref.current?.getBoundingClientRect(); if (!r) return
    const scale = r.width / W
    const svgX = (e.clientX - r.left) / scale
    const idx = Math.max(0, Math.min(n - 1, Math.round(((svgX - PAD.left) / innerW) * (n - 1))))
    setTooltip({ x: xs(idx), y: ys(data[idx].value), p: data[idx] })
  }
  const sd = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })

  return (
    <div style={{ position: 'relative' }}>
      {/* Chart SVG */}
      <svg ref={ref} width={W} height={H}
        onMouseMove={onMove} onMouseLeave={() => setTooltip(null)}
        style={{ display: 'block', overflow: 'visible', cursor: 'crosshair' }}>
        {above.map((p, i) => <polygon key={`a${i}`} points={p} fill="#f87171" fillOpacity="0.1" />)}
        {below.map((p, i) => <polygon key={`b${i}`} points={p} fill="#34d399" fillOpacity="0.1" />)}
        <line x1={PAD.left} y1={tY} x2={W - PAD.right} y2={tY} stroke="#94a3b8" strokeOpacity="0.75" strokeWidth="2" strokeDasharray="4,3" />
        <text x={W - PAD.right + 3} y={tY + 5} fontSize="12" fill="#94a3b8" opacity="1" fontWeight="700">150K</text>
        <line x1={xs(0)} y1={ys(ic)} x2={xs(n - 1)} y2={ys(slope * (n - 1) + ic)} stroke={tc} strokeOpacity="0.45" strokeWidth="1.8" strokeDasharray="4,3" />
        <polyline points={pts} fill="none" stroke="#818cf8" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
        {markers.map(m => (
          <g key={m.i}
            onMouseEnter={(e) => setClTooltip({ x: e.clientX, y: e.clientY, entry: m.entry })}
            onMouseLeave={() => setClTooltip(null)}
            style={{ cursor: 'pointer' }}>
            {/* wider invisible hit area */}
            <rect x={xs(m.i) - 8} y={PAD.top - 14} width={16} height={18} fill="transparent" />
            <line x1={xs(m.i)} y1={PAD.top} x2={xs(m.i)} y2={PAD.top + innerH} stroke="#fbbf24" strokeOpacity="0.28" strokeWidth="1" strokeDasharray="2,2" />
            <polygon points={`${xs(m.i)},${PAD.top - 1} ${xs(m.i) - 4},${PAD.top - 8} ${xs(m.i) + 4},${PAD.top - 8}`} fill="#fbbf24" opacity="0.9" />
          </g>
        ))}
        {tooltip && (
          <g>
            <line x1={tooltip.x} y1={PAD.top} x2={tooltip.x} y2={PAD.top + innerH} stroke="rgba(255,255,255,0.08)" strokeWidth="1" />
            <circle cx={tooltip.x} cy={tooltip.y} r="4.5" fill="#818cf8" stroke="#0d0e12" strokeWidth="1.5" />
          </g>
        )}
        <text x={PAD.left} y={H - 2} fontSize="10" fill="rgba(255,255,255,0.65)" textAnchor="start">{sd(data[0].date)}</text>
        <text x={xs(n - 1)} y={H - 2} fontSize="10" fill="rgba(255,255,255,0.65)" textAnchor="end">{sd(data[n - 1].date)}</text>
      </svg>

      {/* Trend badge — below chart */}
      <div style={{ display: 'flex', justifyContent: 'flex-start', marginTop: 8 }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: `${tc}12`, border: `1px solid ${tc}28`, borderRadius: 4, padding: '3px 7px' }}>
          <span style={{ fontSize: 9, fontWeight: 800, color: tc }}>{tUp ? '↑' : '↓'}</span>
          <span style={{ fontSize: 9, fontWeight: 700, color: tc }}>{tUp ? 'Diverging' : 'Converging'}</span>
          <span style={{ fontSize: 9, color: tc, opacity: 1 }}>{rate.toFixed(1)}%/d</span>
        </div>
      </div>

      {/* Tooltip */}
      {tooltip && (
        <div style={{
          position: 'absolute', pointerEvents: 'none', whiteSpace: 'nowrap',
          top: Math.max(0, tooltip.y - 38), left: tooltip.x > W * 0.6 ? tooltip.x - 130 : tooltip.x + 8,
          background: 'rgba(13,14,18,0.95)', border: '1px solid rgba(129,140,248,0.35)',
          borderRadius: 7, padding: '4px 8px', backdropFilter: 'blur(8px)',
        }}>
          <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.65)', marginBottom: 1 }}>{sd(tooltip.p.date)}</div>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#818cf8' }}>{fmtRp(Math.round(tooltip.p.value))} / lead</div>
        </div>
      )}

      {/* Changelog portal tooltip — renders into document.body, always top z-layer */}
      {clTooltip && createPortal(
        <div style={{
          position: 'fixed',
          top: (() => { const h = 140; let t = clTooltip.y + 18; if (t + h > window.innerHeight - 8) t = clTooltip.y - h - 8; return Math.max(8, t) })(),
          left: Math.max(8, Math.min(clTooltip.x + 14, window.innerWidth - 280)),
          zIndex: 9999,
          background: 'rgba(10,11,15,0.97)',
          border: '1px solid rgba(251,191,36,0.45)',
          borderRadius: 10,
          padding: '10px 14px',
          maxWidth: 260,
          pointerEvents: 'none',
          backdropFilter: 'blur(16px)',
          fontFamily: 'Inter, system-ui, sans-serif',
          boxShadow: '0 12px 40px rgba(0,0,0,0.6), 0 0 0 1px rgba(251,191,36,0.1)',
        }}>
          <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', color: '#fbbf24', textTransform: 'uppercase', marginBottom: 5 }}>
            Changelog · {clTooltip.entry.date}{clTooltip.entry.date_end ? ` → ${clTooltip.entry.date_end}` : ''}
          </div>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#fff', marginBottom: 6, lineHeight: 1.3 }}>
            {clTooltip.entry.title}
          </div>
          {clTooltip.entry.changelist && (
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.72)', lineHeight: 1.6, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
              {clTooltip.entry.changelist}
            </div>
          )}
        </div>,
        document.body
      )}
    </div>
  )
}

// ── Main card ─────────────────────────────────────────────────────────────────
export function AdsPerformanceHealthCard({
  totalSpend, realLeadCcom, realLeadD2or, realLeadMpsh, realLeadOfls,
  cprlSeries = [], changelog = [], skuCprl = [],
}: AdsPerformanceHealthCardProps) {
  const vals  = { ccom: realLeadCcom, d2or: realLeadD2or, mpsh: realLeadMpsh, ofls: realLeadOfls }
  const total = realLeadCcom + realLeadD2or + realLeadMpsh + realLeadOfls
  const cprl  = total > 0 ? totalSpend / total : 0
  const div   = cprl > 0 ? ((cprl - CPRL_TARGET) / CPRL_TARGET) * 100 : null
  const sc    = div === null ? '#818cf8' : div <= 0 ? '#34d399' : div <= 10 ? '#fbbf24' : '#f87171'
  const sl    = div === null ? 'No Data' : div <= 0 ? '🟢 On Target' : div <= 10 ? '🟡 Slightly Over' : '🔴 Over Target'
  const hasChart = cprlSeries.length > 1

  return (
    <div style={{
      flex: '2 1 380px', minWidth: 0,
      background: 'rgba(255,255,255,0.04)',
      border: '1px solid rgba(255,255,255,0.09)',
      borderRadius: 14, padding: '24px 28px',
      display: 'flex', flexDirection: 'column', gap: 20,
      fontFamily: 'Inter, system-ui, sans-serif',
      overflow: 'hidden',
    }}>

      {/* TITLE row */}
      <div style={T.cardTitle}>Ads Performance</div>

      {/* CONTENT row */}
      <div style={{ display: 'flex', flexDirection: 'row', gap: 24 }}>

        {/* LEFT: CPRL metrics */}
        <div style={{ flex: '0 0 150px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div>
            <div style={{ ...T.section, marginBottom: 3 }}>CPRL</div>
            <div style={T.headline}>
              {cprl > 0 ? fmtRp(Math.round(cprl)) : '—'}
            </div>
            {div !== null && (
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, marginTop: 6, background: `${sc}15`, border: `1px solid ${sc}30`, borderRadius: 5, padding: '3px 7px' }}>
                <div style={{ width: 4, height: 4, borderRadius: '50%', background: sc }} />
                <span style={{ fontSize: 10, fontWeight: 700, color: sc }}>{sl}</span>
                <span style={{ fontSize: 9, color: sc, opacity: 0.8 }}>{div > 0 ? '+' : ''}{div.toFixed(1)}%</span>
              </div>
            )}
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginTop: 6 }}>
              <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: '-0.02em', color: 'rgba(255,255,255,0.72)' }}>{total.toLocaleString('id-ID')}</span>
              <span style={T.tiny}>real leads</span>
            </div>
          </div>
        </div>

        {/* MIDDLE: chart */}
        {hasChart && (
          <div style={{ flex: '0 0 320px', minWidth: 0, ...T.divider, display: 'flex', alignItems: 'center' }}>
            <div style={{ width: '100%', maxWidth: 320 }}>
              <CprlChart data={cprlSeries} changelog={changelog} />
            </div>
          </div>
        )}

        {/* RIGHT: Breakdown by Product (CPRL per SKU) */}
        {skuCprl.length > 0 && (
          <div style={{ flex: '1 1 auto', ...T.divider, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={T.section}>Breakdown by Product</div>
            {(() => {
              const maxCprl = Math.max(...skuCprl.map(s => s.cprl), 1)
              return skuCprl.filter(s => s.leads > 0).map(s => {
                const color = SKU_COLORS[s.sku] ?? 'rgba(255,255,255,0.68)'
                const onTarget = s.cprl <= CPRL_TARGET
                // Efficiency bar: full = at/under target, shrinks as cost rises above target
                const efficiency = Math.min(CPRL_TARGET / Math.max(s.cprl, 1), 1) * 100
                const barColor = onTarget ? '#34d399' : '#f87171'
                const diff = ((s.cprl - CPRL_TARGET) / CPRL_TARGET) * 100
                return (
                  <div key={s.sku}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 3 }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color, letterSpacing: '0.07em' }}>{s.sku}</span>
                      <div style={{ textAlign: 'right' }}>
                        <span style={{ fontSize: 13, fontWeight: 800, color: '#fff', letterSpacing: '-0.02em' }}>
                          {fmtRp(Math.round(s.cprl))}
                        </span>
                        <span style={{ fontSize: 9, fontWeight: 600, color: onTarget ? '#34d399' : '#f87171', marginLeft: 4 }}>
                          {diff > 0 ? '+' : ''}{diff.toFixed(0)}%
                        </span>
                      </div>
                    </div>
                    <div style={{ height: 3, background: 'rgba(255,255,255,0.07)', borderRadius: 2 }}>
                      <div style={{ height: '100%', width: `${efficiency}%`, background: barColor, borderRadius: 2, transition: 'width 0.4s ease' }} />
                    </div>
                </div>
                )
              })
            })()}
          </div>
        )}
      </div>
    </div>
  )
}
