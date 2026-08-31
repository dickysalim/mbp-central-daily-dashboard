/**
 * AdsPerformanceHealthCard — v3
 * Left: CPRL headline + status + leads + channels
 * Right: CPRL trend chart — badge below chart
 */
import { useRef, useState } from 'react'
import { ChangelogModal } from '../ChangelogModal'
import { ChangelogTooltip } from '../ChangelogTooltip'
import type { ChangelogRow } from '../../types/changelog'
import { fmtRp } from '../../utils/format'
import { SKU_COLORS } from '../../utils/skuColors'
import { T } from '../../utils/tokens'

export interface CprlPoint   { date: string; value: number }
export type { ChangelogRow }

export interface SkuCprlRow { sku: string; cprl: number; leads: number; qualLeads?: number }

export interface AdsPerformanceHealthCardProps {
  totalSpend: number
  realLeadCcom: number; realLeadD2or: number
  realLeadMpsh: number; realLeadOfls: number
  qualLeadCcom?: number; lediLeadD2or?: number; lediLeadMpsh?: number
  cprlSeries?: CprlPoint[]
  cpqlSeries?: CprlPoint[]
  volumeSeries?: CprlPoint[]
  qualVolumeSeries?: CprlPoint[]
  changelog?: ChangelogRow[]
  skuCprl?: SkuCprlRow[]
  cprlTarget?: number
}

const DEFAULT_CPRL_TARGET = 150_000

const CHANNELS = [
  { key: 'ccom', label: 'CCOM', color: '#818cf8' },
  { key: 'd2or', label: 'D2OR', color: '#34d399' },
  { key: 'mpsh', label: 'MPSH', color: '#fbbf24' },
  { key: 'ofls', label: 'OFLS', color: '#f87171' },
] as const

const QUAL_CHANNELS = [
  { key: 'ccom', label: 'QUAL (CCOM)', color: '#818cf8' },
  { key: 'd2or', label: 'LEDI (D2OR)', color: '#34d399' },
  { key: 'mpsh', label: 'LEDI (MPSH)', color: '#fbbf24' },
] as const

// ── Chart ─────────────────────────────────────────────────────────────────────
function CprlChart({ data, changelog, cprlTarget, mode = 'ratio' }: { data: CprlPoint[]; changelog: ChangelogRow[]; cprlTarget: number; mode?: 'ratio' | 'volume' }) {
  const isVolume = mode === 'volume'
  const W = 320, H = 180, PAD = { top: 10, right: 52, bottom: 20, left: 6 }
  const innerW = W - PAD.left - PAD.right
  const innerH = H - PAD.top - PAD.bottom
  const [tooltip, setTooltip] = useState<{ x: number; y: number; p: CprlPoint } | null>(null)
  const [clTooltip, setClTooltip] = useState<{ x: number; y: number; entries: ChangelogRow[] } | null>(null)
  const [modalEntries, setModalEntries] = useState<ChangelogRow[] | null>(null)
  const ref = useRef<SVGSVGElement>(null)

  if (data.length < 2) return null

  const vals = data.map(d => d.value)
  const minV = 0
  const avg = vals.reduce((a, b) => a + b, 0) / vals.length
  const refLine = isVolume ? avg : cprlTarget
  const maxV = isVolume ? Math.max(...vals) * 1.15 : Math.max(cprlTarget * 2, ...vals)
  const rng  = maxV - minV || 1
  const n    = vals.length

  const xs = (i: number) => PAD.left + (i / (n - 1)) * innerW
  const ys = (v: number) => PAD.top + innerH - ((v - minV) / rng) * innerH
  const tY  = ys(refLine)

  const mX = (n - 1) / 2
  const mY = vals.reduce((a, b) => a + b, 0) / n
  const slope = vals.reduce((s, v, i) => s + (i - mX) * (v - mY), 0) /
                vals.reduce((s, _, i) => s + (i - mX) ** 2, 0)
  const ic  = mY - slope * mX
  const tUp = slope > 0
  // Volume: higher is better (up=green). Ratio: lower is better (up=red)
  const tc  = isVolume ? (tUp ? '#34d399' : '#f87171') : (tUp ? '#f87171' : '#34d399')
  const rate = Math.abs((slope / (refLine || 1)) * 100)
  const lineColor = isVolume
    ? (tUp ? '#34d399' : rate < 1 ? '#fbbf24' : '#f87171')
    : (!tUp ? '#34d399' : rate < 1 ? '#fbbf24' : '#f87171')

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

  const markers = data.map((d, i) => ({ d, i, entries: changelog.filter(c => c.date === d.date) })).filter(m => m.entries.length > 0)

  const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const r = ref.current?.getBoundingClientRect(); if (!r) return
    const scale = r.width / W
    const svgX = (e.clientX - r.left) / scale
    const idx = Math.max(0, Math.min(n - 1, Math.round(((svgX - PAD.left) / innerW) * (n - 1))))
    setTooltip({ x: xs(idx), y: ys(data[idx].value), p: data[idx] })
  }
  const sd = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })

  return (
    <>
    <div style={{ position: 'relative' }}>
      {/* Chart SVG */}
      <svg ref={ref} width={W} height={H}
        onMouseMove={onMove} onMouseLeave={() => setTooltip(null)}
        style={{ display: 'block', overflow: 'visible', cursor: 'crosshair' }}>
        {above.map((p, i) => <polygon key={`a${i}`} points={p} fill={isVolume ? '#34d399' : '#f87171'} fillOpacity="0.1" />)}
        {below.map((p, i) => <polygon key={`b${i}`} points={p} fill={isVolume ? '#f87171' : '#34d399'} fillOpacity="0.1" />)}
        <line x1={PAD.left} y1={tY} x2={W - PAD.right} y2={tY} stroke="#94a3b8" strokeOpacity="0.75" strokeWidth="2" strokeDasharray="4,3" />
        <text x={W - PAD.right + 3} y={tY + 5} fontSize="12" fill="#94a3b8" opacity="1" fontWeight="700">{isVolume ? (avg >= 1000 ? `${(avg / 1000).toFixed(1)}K` : Math.round(avg).toString()) : (cprlTarget >= 1_000_000 ? `${(cprlTarget / 1_000_000).toFixed(1)}M` : `${Math.round(cprlTarget / 1_000)}K`)}</text>
        {!isVolume && Math.max(...vals) > cprlTarget * 2 && (() => {
          const ceilY = ys(cprlTarget * 2)
          return <>
            <line x1={PAD.left} y1={ceilY} x2={W - PAD.right} y2={ceilY}
              stroke="#f87171" strokeOpacity="0.5" strokeWidth="1" />
            <text x={W - PAD.right + 3} y={ceilY + 4} fontSize="12" fill="#f87171" opacity="0.8" fontWeight="700">!</text>
          </>
        })()}
        <line x1={xs(0)} y1={ys(ic)} x2={xs(n - 1)} y2={ys(slope * (n - 1) + ic)} stroke={tc} strokeOpacity="0.65" strokeWidth="3.5" strokeDasharray="4,3" />
        <polyline points={pts} fill="none" stroke={lineColor} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
        {markers.map(m => (
          <g key={m.i}
            onMouseEnter={(e) => setClTooltip({ x: e.clientX, y: e.clientY, entries: m.entries })}
            onMouseLeave={() => setClTooltip(null)}
            onClick={() => { setClTooltip(null); setModalEntries(m.entries) }}
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
          <span style={{ fontSize: 9, fontWeight: 700, color: tc }}>{isVolume ? (tUp ? 'Increasing' : 'Decreasing') : (tUp ? 'Diverging' : 'Converging')}</span>
          <span style={{ fontSize: 9, color: tc, opacity: 1 }}>{rate.toFixed(1)}%/d</span>
        </div>
      </div>

      {/* Tooltip */}
      {tooltip && (
        <div style={{
          position: 'absolute', pointerEvents: 'none', whiteSpace: 'nowrap',
          bottom: 0, left: tooltip.x > W * 0.6 ? tooltip.x - 130 : tooltip.x + 8,
          background: 'rgba(13,14,18,0.95)', border: '1px solid rgba(129,140,248,0.35)',
          borderRadius: 7, padding: '4px 8px', backdropFilter: 'blur(8px)',
        }}>
          <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.65)', marginBottom: 1 }}>{sd(tooltip.p.date)}</div>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#818cf8' }}>{isVolume ? `${Math.round(tooltip.p.value).toLocaleString('id-ID')} leads` : `${fmtRp(Math.round(tooltip.p.value))} / lead`}</div>
        </div>
      )}

      {clTooltip && <ChangelogTooltip x={clTooltip.x} y={clTooltip.y} entries={clTooltip.entries} />}
    </div>

    {modalEntries && <ChangelogModal entries={modalEntries} onClose={() => setModalEntries(null)} />}
    </>
  )
}

// ── Main card ─────────────────────────────────────────────────────────────────
export function AdsPerformanceHealthCard({
  totalSpend, realLeadCcom, realLeadD2or, realLeadMpsh, realLeadOfls,
  qualLeadCcom = 0, lediLeadD2or = 0, lediLeadMpsh = 0,
  cprlSeries = [], cpqlSeries = [], volumeSeries = [], qualVolumeSeries = [],
  changelog = [], skuCprl = [], cprlTarget,
}: AdsPerformanceHealthCardProps) {
  const CPRL_TARGET = cprlTarget ?? DEFAULT_CPRL_TARGET
  const [leadMode, setLeadMode] = useState<'real' | 'quality'>('real')
  const isQual = leadMode === 'quality'

  const realVals = { ccom: realLeadCcom, d2or: realLeadD2or, mpsh: realLeadMpsh, ofls: realLeadOfls }
  const qualVals = { ccom: qualLeadCcom, d2or: lediLeadD2or, mpsh: lediLeadMpsh }

  // For CPQL, use average as target since we don't have a fixed target yet
  const cpqlAvg = cpqlSeries.length > 0
    ? Math.round(cpqlSeries.reduce((s, p) => s + p.value, 0) / cpqlSeries.length)
    : 0
  const activeTarget = isQual ? cpqlAvg : CPRL_TARGET

  const total = isQual
    ? qualLeadCcom + lediLeadD2or + lediLeadMpsh
    : realLeadCcom + realLeadD2or + realLeadMpsh + realLeadOfls
  const cprl  = total > 0 ? totalSpend / total : 0
  const div   = cprl > 0 && activeTarget > 0 ? ((cprl - activeTarget) / activeTarget) * 100 : null
  const sc    = div === null ? '#818cf8' : div <= 0 ? '#34d399' : div <= 10 ? '#fbbf24' : '#f87171'
  const sl    = div === null ? 'No Data' : div <= 0 ? '🟢 On Target' : div <= 10 ? '🟡 Slightly Over' : '🔴 Over Target'
  const activeCprlSeries = isQual ? cpqlSeries : cprlSeries
  const activeVolumeSeries = isQual ? qualVolumeSeries : volumeSeries
  const hasChart = activeCprlSeries.length > 1
  const [chartMode, setChartMode] = useState<'ratio' | 'volume'>('ratio')
  const activeChartData = chartMode === 'volume' && activeVolumeSeries.length > 1 ? activeVolumeSeries : activeCprlSeries

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

      {/* TITLE row with toggle */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={T.cardTitle}>Ads Performance</div>
        <div style={{ display: 'flex', gap: 2, background: 'rgba(255,255,255,0.06)', borderRadius: 6, padding: 2 }}>
          {(['real', 'quality'] as const).map(m => (
            <button key={m} onClick={() => setLeadMode(m)} style={{
              padding: '3px 10px', fontSize: 9, fontWeight: 700, borderRadius: 4,
              border: 'none', cursor: 'pointer', letterSpacing: '0.04em',
              background: leadMode === m ? 'rgba(255,255,255,0.15)' : 'transparent',
              color: leadMode === m ? '#fff' : 'rgba(255,255,255,0.40)',
              transition: 'all 0.2s',
            }}>{m === 'real' ? 'Real Leads' : 'Quality Leads'}</button>
          ))}
        </div>
      </div>

      {/* CONTENT row */}
      <div style={{ display: 'flex', flexDirection: 'row', gap: 24 }}>

        {/* LEFT: CPRL metrics */}
        <div style={{ flex: '0 0 140px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div>
            <div style={{ ...T.section, marginBottom: 3 }}>{isQual ? 'CPQL' : 'CPRL'}</div>
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
              <span style={T.tiny}>{isQual ? 'quality leads' : 'real leads'}</span>
            </div>
          </div>

          {/* Channel breakdown */}
          {total > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 }}>
              <div style={{ ...T.section, marginBottom: -2 }}>By Channel</div>
              {isQual ? (
                QUAL_CHANNELS.map(ch => {
                  const v = qualVals[ch.key]
                  if (v <= 0) return null
                  const pct = (v / total) * 100
                  return (
                    <div key={ch.key}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 3 }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: ch.color, letterSpacing: '0.07em' }}>{ch.label}</span>
                        <div style={{ textAlign: 'right' }}>
                          <span style={{ fontSize: 11, fontWeight: 800, color: '#fff', letterSpacing: '-0.02em' }}>
                            {v.toLocaleString('id-ID')}
                          </span>
                          <span style={{ fontSize: 9, fontWeight: 600, color: 'rgba(255,255,255,0.4)', marginLeft: 4 }}>
                            {pct.toFixed(1)}%
                          </span>
                        </div>
                      </div>
                      <div style={{ height: 3, background: 'rgba(255,255,255,0.07)', borderRadius: 2 }}>
                        <div style={{ height: '100%', width: `${pct}%`, background: ch.color, borderRadius: 2, transition: 'width 0.4s ease' }} />
                      </div>
                    </div>
                  )
                })
              ) : (
                CHANNELS.map(ch => {
                  const v = realVals[ch.key]
                  if (v <= 0) return null
                  const pct = (v / total) * 100
                  return (
                    <div key={ch.key}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 3 }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: ch.color, letterSpacing: '0.07em' }}>{ch.label}</span>
                        <div style={{ textAlign: 'right' }}>
                          <span style={{ fontSize: 11, fontWeight: 800, color: '#fff', letterSpacing: '-0.02em' }}>
                            {v.toLocaleString('id-ID')}
                          </span>
                          <span style={{ fontSize: 9, fontWeight: 600, color: 'rgba(255,255,255,0.4)', marginLeft: 4 }}>
                            {pct.toFixed(1)}%
                          </span>
                        </div>
                      </div>
                      <div style={{ height: 3, background: 'rgba(255,255,255,0.07)', borderRadius: 2 }}>
                        <div style={{ height: '100%', width: `${pct}%`, background: ch.color, borderRadius: 2, transition: 'width 0.4s ease' }} />
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          )}
        </div>

        {/* MIDDLE: chart */}
        {hasChart && (
          <div style={{ flex: '0 0 320px', minWidth: 0, ...T.divider, display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', gap: 3, marginBottom: 4 }}>
              {(['ratio', 'volume'] as const).map(m => (
                <button key={m} onClick={() => setChartMode(m)} style={{
                  padding: '1px 6px', fontSize: 8, fontWeight: 700, borderRadius: 3,
                  border: 'none', cursor: 'pointer', letterSpacing: '0.03em',
                  background: chartMode === m ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.04)',
                  color: chartMode === m ? '#fff' : 'rgba(255,255,255,0.35)',
                }}>{m === 'ratio' ? 'Daily' : 'Volume'}</button>
              ))}
            </div>
            <div style={{ width: '100%', maxWidth: 320, flex: 1, display: 'flex', alignItems: 'center' }}>
              <CprlChart data={activeChartData} changelog={changelog} cprlTarget={chartMode === 'ratio' ? activeTarget : 0} mode={chartMode} />
            </div>
          </div>
        )}

        {/* RIGHT: Breakdown by Product (CPRL/CPQL per SKU) */}
        {skuCprl.length > 0 && (
          <div style={{ flex: '1 1 auto', ...T.divider, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={T.section}>Breakdown by Product</div>
            {(() => {
              return skuCprl.map(s => {
                const skuLeads = isQual ? (s.qualLeads ?? 0) : s.leads
                if (skuLeads <= 0) return null
                const skuSpend = s.cprl * s.leads  // derive actual spend from cprl × real leads
                const skuCprlVal = skuSpend > 0 ? skuSpend / skuLeads : 0
                const color = SKU_COLORS[s.sku] ?? 'rgba(255,255,255,0.68)'
                const onTarget = (isQual ? skuCprlVal : s.cprl) <= activeTarget
                const displayCprl = isQual ? skuCprlVal : s.cprl
                const efficiency = Math.min(activeTarget / Math.max(displayCprl, 1), 1) * 100
                const barColor = onTarget ? '#34d399' : '#f87171'
                const diff = ((displayCprl - activeTarget) / activeTarget) * 100
                return (
                  <div key={s.sku}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 3 }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color, letterSpacing: '0.07em' }}>{s.sku}</span>
                      <div style={{ textAlign: 'right' }}>
                        <span style={{ fontSize: 13, fontWeight: 800, color: '#fff', letterSpacing: '-0.02em' }}>
                          {fmtRp(Math.round(displayCprl))}
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
