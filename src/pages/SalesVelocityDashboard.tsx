/**
 * SalesVelocityDashboard — MNC Sales Velocity Dashboard
 * Tracks daily revenue per sales channel against target contribution.
 *
 * Channel contribution targets (of 6.59× daily ad spend):
 *   CA: 6.7%, CRM: 8%, MPSH: 19%, D2OR: 65%, OFLS: 1.3%
 */
import { useState, useEffect, useMemo, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { T } from '../utils/tokens'
import { skuColor } from '../utils/skuColors'
import type { ChangelogRow } from '../types/changelog'
import { ChangelogTooltip } from '../components/ChangelogTooltip'
import { ChangelogModal } from '../components/ChangelogModal'

import imgSuperfood from '../assets/sku_images/Superfood.webp'
import imgMetafiber from '../assets/sku_images/Metafiber.webp'
import img3Peptide from '../assets/sku_images/3Peptide.webp'
import imgNightsure from '../assets/sku_images/Nightsure.webp'
import imgGinseng from '../assets/sku_images/Ginseng.webp'
import mncLogo from '../assets/brand_logos/MNC.webp'

const SKU_IMAGES: Record<string, string> = {
  global: mncLogo,
  MSF: imgSuperfood,
  MTA: imgMetafiber,
  M3P: img3Peptide,
  MNS: imgNightsure,
  GIN: imgGinseng,
}

const D1_WORKER_URL = 'https://central-daily-dashboard-worker.mganik-group.workers.dev'
const MA_WINDOW = 30
const MA_BUFFER_DAYS = 30

// Channel contribution percentages of total RoAS target
const MNC_CHANNELS = {
  ccom_ca:  { label: 'CA (CCOM)',   pct: 0.067 },
  ccom_crm: { label: 'CRM (CCOM)',  pct: 0.08  },
  mpsh:     { label: 'MPSH',        pct: 0.19  },
  d2or:     { label: 'D2OR',        pct: 0.65  },
  ofls:     { label: 'OFLS',        pct: 0.013 },
} as const

type ChannelKey = keyof typeof MNC_CHANNELS

interface BrandBounds { brand: string; earliest: string; latest: string; skus: string[] }
interface SalesRow { date: string; brand: string; sku: string; so_ccom_ca: number; so_ccom_crm: number; so_mpsh: number; so_d2or: number; so_ofls: number; rev_ccom_ca: number; rev_ccom_crm: number; rev_mpsh: number; rev_d2or: number; rev_ofls: number }
interface TargetRow { date: string; sku: string; daily_ad_spend: number }
interface CampaignBudgetRow { date: string; sku: string; daily_budget: number }

const dateStr = (d: Date) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
const fmtRp = (v: number) => 'Rp ' + Math.round(v).toLocaleString('id-ID')
const fmtCompact = (v: number) => v >= 1e9 ? (v/1e9).toFixed(2) + 'B' : v >= 1e6 ? (v/1e6).toFixed(1) + 'M' : v >= 1e3 ? (v/1e3).toFixed(0) + 'K' : String(Math.round(v))
const sd = (d: string) => { const dt = new Date(d + 'T00:00:00'); return dt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) }

/* ── Chart (same sizing as CprlChart: W=320 H=180) ─────────────────────────── */
function RevChart({ data, target, changelog = [], showMA, setShowMA }: { data: { date: string; value: number }[]; target: number; changelog?: ChangelogRow[]; showMA?: boolean; setShowMA?: (v: boolean) => void }) {
  const W = 480, H = 220
  const PAD = { top: 10, right: 62, bottom: 20, left: 6 }
  const innerW = W - PAD.left - PAD.right
  const innerH = H - PAD.top - PAD.bottom
  const [tooltip, setTooltip] = useState<{ x: number; y: number; p: { date: string; value: number } } | null>(null)
  const [clTooltip, setClTooltip] = useState<{ x: number; y: number; entries: ChangelogRow[] } | null>(null)
  const [modalEntries, setModalEntries] = useState<ChangelogRow[] | null>(null)
  const ref = useRef<SVGSVGElement>(null)

  if (data.length < 2) return null

  const vals = data.map(d => d.value)
  const n = vals.length
  const avg = vals.reduce((a, b) => a + b, 0) / n
  // Viewport: ±25% of target by default, but expands to fit data if it breaches
  const warnLow  = target * 0.75
  const warnHigh = target * 1.25
  const minV = Math.min(warnLow,  ...vals)
  const maxV = Math.max(warnHigh, ...vals)
  const rng = maxV - minV || 1

  const xs = (i: number) => PAD.left + (i / (n - 1)) * innerW
  const ys = (v: number) => PAD.top + innerH - ((v - minV) / rng) * innerH
  const cl = (y: number) => Math.max(PAD.top, Math.min(PAD.top + innerH, y))

  // Regression
  const mX = (n - 1) / 2
  const slope = vals.reduce((s, v, i) => s + (i - mX) * (v - avg), 0) /
                vals.reduce((s, _, i) => s + (i - mX) ** 2, 0)
  const ic = avg - slope * mX
  const tUp = slope > 0
  const rate = target > 0 ? Math.abs((slope / target) * 100) : 0
  const tc = tUp ? '#34d399' : '#f87171'
  const lineColor = tUp ? '#34d399' : rate < 1 ? '#fbbf24' : '#f87171'

  const tY = ys(target)
  const pts = data.map((d, i) => `${xs(i)},${ys(d.value)}`).join(' ')

  // Changelog markers
  const markers = data.map((d, i) => ({ d, i, entries: changelog.filter(c => c.date === d.date) })).filter(m => m.entries.length > 0)

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!ref.current) return
    const rect = ref.current.getBoundingClientRect()
    const mx = e.clientX - rect.left
    const relX = (mx - (PAD.left / W * rect.width)) / ((innerW / W) * rect.width)
    const idx = Math.round(relX * (n - 1))
    if (idx >= 0 && idx < n) {
      setTooltip({ x: xs(idx), y: ys(data[idx].value), p: data[idx] })
    }
  }

  return (
    <>
    <div style={{ position: 'relative' }}>
      <svg ref={ref} viewBox={`0 0 ${W} ${H}`} width="100%"
        style={{ display: 'block', overflow: 'visible', cursor: 'crosshair', width: '100%', height: 'auto' }}
        onMouseMove={handleMouseMove} onMouseLeave={() => setTooltip(null)}>

        {/* Zone bands — 25% intervals, increasing opacity with distance from target */}
        {[1, 2, 3, 4].map(k => {
          // Below target bands (red)
          const bandHi = target * (1 - (k - 1) * 0.25)
          const bandLo = target * (1 - k * 0.25)
          const cHi = Math.min(bandHi, maxV)
          const cLo = Math.max(bandLo, minV)
          if (cLo >= cHi) return null
          return <rect key={`bz${k}`}
            x={PAD.left} y={ys(cHi)} width={innerW} height={Math.max(0, ys(cLo) - ys(cHi))}
            fill="#dc2626" fillOpacity={k * 0.09} />
        })}
        {[1, 2, 3, 4].map(k => {
          // Above target bands (green)
          const bandLo = target * (1 + (k - 1) * 0.25)
          const bandHi = target * (1 + k * 0.25)
          const cHi = Math.min(bandHi, maxV)
          const cLo = Math.max(bandLo, minV)
          if (cLo >= cHi) return null
          return <rect key={`az${k}`}
            x={PAD.left} y={ys(cHi)} width={innerW} height={Math.max(0, ys(cLo) - ys(cHi))}
            fill="#15803d" fillOpacity={k * 0.09} />
        })}

        {/* Zone grid lines at each 25% step */}
        {[1, 2, 3].map(k => {
          const vLo = target * (1 - k * 0.25)
          const vHi = target * (1 + k * 0.25)
          return (
            <g key={`zl${k}`}>
              {vLo >= minV && vLo <= maxV && <>
                <line x1={PAD.left} y1={ys(vLo)} x2={W - PAD.right} y2={ys(vLo)}
                  stroke="#dc2626" strokeOpacity={0.2 + k * 0.1} strokeWidth="1" />
                <text x={W - PAD.right + 4} y={ys(vLo) + 4} fontSize="10" fill="#dc2626" fillOpacity={0.6 + k * 0.1} fontWeight="700">−{k * 25}%</text>
              </>}
              {vHi >= minV && vHi <= maxV && <>
                <line x1={PAD.left} y1={ys(vHi)} x2={W - PAD.right} y2={ys(vHi)}
                  stroke="#15803d" strokeOpacity={0.2 + k * 0.1} strokeWidth="1" />
                <text x={W - PAD.right + 4} y={ys(vHi) + 4} fontSize="10" fill="#16a34a" fillOpacity={0.6 + k * 0.1} fontWeight="700">+{k * 25}%</text>
              </>}
            </g>
          )
        })}

        {/* Target line + label — sits above zone bands, below data */}
        <line x1={PAD.left} y1={tY} x2={W - PAD.right} y2={tY}
          stroke="rgba(255,255,255,0.70)" strokeWidth="1.5" strokeDasharray="4,3" />
        <text x={W - PAD.right + 4} y={tY + 5} fontSize="11" fill="rgba(255,255,255,0.70)" fontWeight="700">
          {fmtCompact(target)}
        </text>

        {/* Trend line */}
        <line x1={xs(0)} y1={cl(ys(ic))} x2={xs(n - 1)} y2={cl(ys(slope * (n - 1) + ic))}
          stroke={tc} strokeOpacity="0.65" strokeWidth="3.5" strokeDasharray="4,3" />

        {/* Main line */}
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
            <line x1={xs(m.i)} y1={PAD.top} x2={xs(m.i)} y2={PAD.top + innerH} stroke="#fbbf24" strokeOpacity="0.28" strokeWidth="1" strokeDasharray="2,2" />
            <polygon points={`${xs(m.i)},${PAD.top - 1} ${xs(m.i) - 4},${PAD.top - 8} ${xs(m.i) + 4},${PAD.top - 8}`} fill="#fbbf24" opacity="0.9" />
          </g>
        ))}

        {/* Hover dot */}
        {tooltip && (
          <circle cx={tooltip.x} cy={tooltip.y} r="4" fill={lineColor} stroke="#0d0e12" strokeWidth="2" />
        )}

        {/* Date labels */}
        <text x={xs(0)} y={H - 4} fontSize="9" fill="rgba(255,255,255,0.25)" textAnchor="start">{sd(data[0].date)}</text>
        <text x={xs(n - 1)} y={H - 4} fontSize="9" fill="rgba(255,255,255,0.25)" textAnchor="end">{sd(data[n - 1].date)}</text>
      </svg>

      {/* Tooltip */}
      {tooltip && (
        <div style={{
          position: 'absolute', pointerEvents: 'none', whiteSpace: 'nowrap',
          top: '100%', left: tooltip.x > W * 0.6 ? tooltip.x - 130 : tooltip.x + 8,
          background: 'rgba(13,14,18,0.95)', border: `1px solid ${lineColor}50`,
          borderRadius: 7, padding: '4px 8px', backdropFilter: 'blur(8px)',
        }}>
          <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.65)', marginBottom: 1 }}>{sd(tooltip.p.date)}</div>
          <div style={{ fontSize: 11, fontWeight: 700, color: lineColor }}>{fmtRp(Math.round(tooltip.p.value))} / day</div>
        </div>
      )}

      {clTooltip && <ChangelogTooltip x={clTooltip.x} y={clTooltip.y} entries={clTooltip.entries} />}

      {/* Changelog modal */}
      {modalEntries && <ChangelogModal entries={modalEntries} onClose={() => setModalEntries(null)} />}
    </div>

    {/* Trend badge + toggle */}
    <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 6, paddingRight: 62 }}>
      <span style={{ fontSize: 9, fontWeight: 700, color: tc }}>{tUp ? '▲' : '▼'} {tUp ? 'Converging' : 'Diverging'}</span>
      <span style={{ fontSize: 9, color: tc, opacity: 1 }}>{rate.toFixed(1)}%/d</span>
      {setShowMA && (
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 3 }}>
          <button onClick={() => setShowMA(true)} style={{
            padding: '2px 7px', fontSize: 8, fontWeight: 700, borderRadius: 3,
            border: 'none', cursor: 'pointer', letterSpacing: '0.03em',
            background: showMA ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.04)',
            color: showMA ? '#fff' : 'rgba(255,255,255,0.35)',
          }}>30d MA</button>
          <button onClick={() => setShowMA(false)} style={{
            padding: '2px 7px', fontSize: 8, fontWeight: 700, borderRadius: 3,
            border: 'none', cursor: 'pointer', letterSpacing: '0.03em',
            background: !showMA ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.04)',
            color: !showMA ? '#fff' : 'rgba(255,255,255,0.35)',
          }}>Daily</button>
        </div>
      )}
    </div>
    </>
  )
}


/* ── Channel Card (same layout as AdsPerformanceHealthCard) ─────────────────── */
function ChannelCard({
  channelKey, revByDate, soByDate, dailyTarget, activeFrom, activeTo, channelPct, roasTarget, channelLabel,
}: {
  channelKey: ChannelKey
  revByDate: Map<string, number>
  soByDate: Map<string, number>
  dailyTarget: number
  activeFrom: string
  activeTo: string
  channelPct: number
  roasTarget: number
  channelLabel: string
}) {
  const channelTarget = dailyTarget * roasTarget * channelPct

  // Build 30-day MA series (include buffer data for warm-up)
  const allDatesWithBuffer = Array.from(revByDate.keys()).sort()
  const dailyRaw = allDatesWithBuffer.map(d => ({ date: d, value: revByDate.get(d) ?? 0 }))
  const maSeries = dailyRaw.map((dd, i) => {
    const start = Math.max(0, i - MA_WINDOW + 1)
    const slice = dailyRaw.slice(start, i + 1)
    const totalRev = slice.reduce((s, d) => s + d.value, 0)
    return { date: dd.date, value: totalRev / slice.length }
  }).filter(p => p.date >= activeFrom && p.date <= activeTo)

  // Active range stats
  const activeDates = Array.from(revByDate.keys()).filter(d => d >= activeFrom && d <= activeTo).sort()
  const nDays = activeDates.length
  const totalRev = activeDates.reduce((s, d) => s + (revByDate.get(d) ?? 0), 0)
  const totalSO = activeDates.reduce((s, d) => s + (soByDate.get(d) ?? 0), 0)

  // Latest MA value
  const latestMA = maSeries.length > 0 ? maSeries[maSeries.length - 1].value : 0

  // Delta vs target
  const delta = channelTarget > 0 ? ((latestMA - channelTarget) / channelTarget) * 100 : 0
  // Revenue higher = better → positive delta = on target
  const sc = delta >= 0 ? '#34d399' : delta >= -10 ? '#fbbf24' : '#f87171'
  const sl = delta >= 0 ? '🟢 On Target' : delta >= -10 ? '🟡 Slightly Below' : '🔴 Below Target'
  const hasChart = maSeries.length > 1

  return (
    <div style={{
      flex: '1 1 420px', minWidth: 380, maxWidth: 620,
      background: 'rgba(255,255,255,0.04)',
      border: '1px solid rgba(255,255,255,0.09)',
      borderRadius: 12, padding: '17px 19px',
      display: 'flex', flexDirection: 'column', gap: 12,
      fontFamily: 'Inter, system-ui, sans-serif',
      overflow: 'hidden',
    }}>

      {/* TITLE */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={T.cardTitle}>{channelLabel} Revenue</div>
        <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.25)', fontWeight: 600 }}>{(channelPct * 100).toFixed(1)}% of total</div>
      </div>

      {/* Single row: Left metrics | Right chart */}
      <div style={{ display: 'flex', flexDirection: 'row', gap: 17, alignItems: 'center' }}>

        {/* LEFT: Rev/Day + Target */}
        <div style={{ flex: '0 0 120px', display: 'flex', flexDirection: 'column', gap: 9 }}>
          <div>
            <div style={{ ...T.section, marginBottom: 3 }}>REV/DAY (30D MA)</div>
            <div style={T.headline}>
              {latestMA > 0 ? fmtRp(Math.round(latestMA)) : '—'}
            </div>
            {channelTarget > 0 && (
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, marginTop: 5, background: `${sc}15`, border: `1px solid ${sc}30`, borderRadius: 5, padding: '3px 7px' }}>
                <div style={{ width: 4, height: 4, borderRadius: '50%', background: sc }} />
                <span style={{ fontSize: 10, fontWeight: 700, color: sc }}>{sl}</span>
                <span style={{ fontSize: 9, color: sc, opacity: 0.8 }}>{delta > 0 ? '+' : ''}{delta.toFixed(1)}%</span>
              </div>
            )}
          </div>
          <div>
            <div style={{ ...T.section, marginBottom: 3 }}>TARGET</div>
            <div style={{ fontSize: 13, fontWeight: 800, color: 'rgba(255,255,255,0.45)', letterSpacing: '-0.02em' }}>
              {fmtRp(Math.round(channelTarget))}
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginTop: 4 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.5)' }}>{totalSO.toLocaleString('id-ID')}</span>
              <span style={T.tiny}>orders</span>
            </div>
          </div>
          {/* RoAS contribution */}
          {dailyTarget > 0 && (
            <div>
              <div style={{ ...T.section, marginBottom: 4 }}>RoAS CONTRIBUTION</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                {/* Actual */}
                <span style={{ fontSize: 14, fontWeight: 800, letterSpacing: '-0.03em', color: sc }}>
                  {latestMA > 0 ? (latestMA / dailyTarget).toFixed(2) + '×' : '—'}
                </span>
                <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.2)' }}>/</span>
                {/* Expected */}
                <span style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.35)' }}>
                  {(roasTarget * channelPct).toFixed(2)}×
                </span>
              </div>
              <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.2)', marginTop: 2 }}>actual / expected</div>
            </div>
          )}
        </div>

        {/* RIGHT: Chart */}
        {hasChart && (
          <div style={{ flex: 1, minWidth: 0, ...T.divider }}>
            <RevChart data={maSeries} target={channelTarget} />
          </div>
        )}

      </div>
    </div>
  )
}


/* ── CVR Sparkline (unitless ratio, e.g. 0.35 = 35%) ───────────────────────── */
function CvrChart({ data, showMA, setShowMA, changelog = [] }: { data: { date: string; value: number }[]; showMA?: boolean; setShowMA?: (v: boolean) => void; changelog?: ChangelogRow[] }) {
  const W = 480, H = 220
  const PAD = { top: 10, right: 62, bottom: 20, left: 6 }
  const innerW = W - PAD.left - PAD.right
  const innerH = H - PAD.top - PAD.bottom
  const [tooltip, setTooltip] = useState<{ x: number; y: number; p: { date: string; value: number } } | null>(null)
  const [clTooltip, setClTooltip] = useState<{ x: number; y: number; entries: ChangelogRow[] } | null>(null)
  const [modalEntries, setModalEntries] = useState<ChangelogRow[] | null>(null)
  const ref = useRef<SVGSVGElement>(null)

  if (data.length < 2) return null

  const CVR_TARGET = 0.20  // 20%

  const vals = data.map(d => d.value)
  const n = vals.length
  const avg = vals.reduce((a, b) => a + b, 0) / n

  const warnLow  = CVR_TARGET * 0.75
  const warnHigh = CVR_TARGET * 1.25
  const minV = Math.min(warnLow, ...vals)
  const maxV = Math.max(warnHigh, ...vals)
  const rng = maxV - minV || 1

  const xs = (i: number) => PAD.left + (i / (n - 1)) * innerW
  const ys = (v: number) => PAD.top + innerH - ((v - minV) / rng) * innerH
  const cl = (y: number) => Math.max(PAD.top, Math.min(PAD.top + innerH, y))

  const mX = (n - 1) / 2
  const slope = vals.reduce((s, v, i) => s + (i - mX) * (v - avg), 0) /
                vals.reduce((s, _, i) => s + (i - mX) ** 2, 0)
  const ic = avg - slope * mX
  const tUp = slope > 0
  const rate = avg > 0 ? Math.abs((slope / avg) * 100) : 0
  const tc = tUp ? '#34d399' : '#f87171'
  const lineColor = tUp ? '#34d399' : rate < 1 ? '#fbbf24' : '#f87171'

  const tY = ys(CVR_TARGET)
  const pts = data.map((d, i) => `${xs(i)},${ys(d.value)}`).join(' ')

  // Changelog dates -> x positions
  const dateToIdx = new Map(data.map((d, i) => [d.date, i]))
  const clByDate = new Map<string, ChangelogRow[]>()
  for (const entry of changelog) {
    if (!dateToIdx.has(entry.date)) continue
    const arr = clByDate.get(entry.date) ?? []
    arr.push(entry)
    clByDate.set(entry.date, arr)
  }

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!ref.current) return
    const rect = ref.current.getBoundingClientRect()
    const mx = e.clientX - rect.left
    const relX = (mx - (PAD.left / W * rect.width)) / ((innerW / W) * rect.width)
    const idx = Math.round(relX * (n - 1))
    if (idx >= 0 && idx < n) setTooltip({ x: xs(idx), y: ys(data[idx].value), p: data[idx] })
  }

  return (
    <>
    <div style={{ position: 'relative' }}>
      <svg ref={ref} viewBox={`0 0 ${W} ${H}`} width="100%"
        style={{ display: 'block', overflow: 'visible', cursor: 'crosshair', width: '100%', height: 'auto' }}
        onMouseMove={handleMouseMove} onMouseLeave={() => setTooltip(null)}>

        {/* Zone bands */}
        {[1, 2, 3, 4].map(k => {
          const bandHi = CVR_TARGET * (1 - (k - 1) * 0.25), bandLo = CVR_TARGET * (1 - k * 0.25)
          const cHi = Math.min(bandHi, maxV), cLo = Math.max(bandLo, minV)
          if (cLo >= cHi) return null
          return <rect key={`bz${k}`} x={PAD.left} y={ys(cHi)} width={innerW} height={Math.max(0, ys(cLo) - ys(cHi))} fill="#dc2626" fillOpacity={k * 0.09} />
        })}
        {[1, 2, 3, 4].map(k => {
          const bandLo = CVR_TARGET * (1 + (k - 1) * 0.25), bandHi = CVR_TARGET * (1 + k * 0.25)
          const cHi = Math.min(bandHi, maxV), cLo = Math.max(bandLo, minV)
          if (cLo >= cHi) return null
          return <rect key={`az${k}`} x={PAD.left} y={ys(cHi)} width={innerW} height={Math.max(0, ys(cLo) - ys(cHi))} fill="#15803d" fillOpacity={k * 0.09} />
        })}

        {/* Zone grid lines */}
        {[1, 2, 3].map(k => {
          const vLo = CVR_TARGET * (1 - k * 0.25), vHi = CVR_TARGET * (1 + k * 0.25)
          return (
            <g key={`zl${k}`}>
              {vLo >= minV && vLo <= maxV && <>
                <line x1={PAD.left} y1={ys(vLo)} x2={W - PAD.right} y2={ys(vLo)} stroke="#dc2626" strokeOpacity={0.2 + k * 0.1} strokeWidth="1" />
                <text x={W - PAD.right + 4} y={ys(vLo) + 4} fontSize="10" fill="#dc2626" fillOpacity={0.6 + k * 0.1} fontWeight="700">−{k * 25}%</text>
              </>}
              {vHi >= minV && vHi <= maxV && <>
                <line x1={PAD.left} y1={ys(vHi)} x2={W - PAD.right} y2={ys(vHi)} stroke="#15803d" strokeOpacity={0.2 + k * 0.1} strokeWidth="1" />
                <text x={W - PAD.right + 4} y={ys(vHi) + 4} fontSize="10" fill="#16a34a" fillOpacity={0.6 + k * 0.1} fontWeight="700">+{k * 25}%</text>
              </>}
            </g>
          )
        })}

        {/* Target line at 20% */}
        <line x1={PAD.left} y1={tY} x2={W - PAD.right} y2={tY} stroke="rgba(255,255,255,0.70)" strokeWidth="1.5" strokeDasharray="4,3" />
        <text x={W - PAD.right + 4} y={tY + 5} fontSize="11" fill="rgba(255,255,255,0.70)" fontWeight="700">20%</text>

        {/* Trend line */}
        <line x1={xs(0)} y1={cl(ys(ic))} x2={xs(n - 1)} y2={cl(ys(slope * (n - 1) + ic))} stroke={tc} strokeOpacity="0.65" strokeWidth="3.5" strokeDasharray="4,3" />

        {/* Changelog markers */}
        {Array.from(clByDate.entries()).map(([date, entries]) => {
          const idx = dateToIdx.get(date)!
          const cx = xs(idx)
          return (
            <g key={`cl-${date}`} style={{ cursor: 'pointer' }}
              onMouseEnter={(e) => setClTooltip({ x: e.clientX, y: e.clientY, entries })}
              onMouseLeave={() => setClTooltip(null)}
              onClick={() => { setClTooltip(null); setModalEntries(entries) }}>
              <rect x={cx - 8} y={PAD.top - 14} width={16} height={18} fill="transparent" />
              <line x1={cx} y1={PAD.top} x2={cx} y2={PAD.top + innerH} stroke="#fbbf24" strokeOpacity="0.28" strokeWidth="1" strokeDasharray="2,2" />
              <polygon points={`${cx},${PAD.top - 1} ${cx - 4},${PAD.top - 8} ${cx + 4},${PAD.top - 8}`} fill="#fbbf24" opacity="0.9" />
            </g>
          )
        })}

        {/* Main line */}
        <polyline points={pts} fill="none" stroke={lineColor} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />

        {/* Hover dot */}
        {tooltip && <circle cx={tooltip.x} cy={tooltip.y} r="4" fill={lineColor} stroke="#0d0e12" strokeWidth="2" />}

        {/* Date labels */}
        <text x={xs(0)} y={H - 4} fontSize="9" fill="rgba(255,255,255,0.25)" textAnchor="start">{sd(data[0].date)}</text>
        <text x={xs(n - 1)} y={H - 4} fontSize="9" fill="rgba(255,255,255,0.25)" textAnchor="end">{sd(data[n - 1].date)}</text>
      </svg>

      {tooltip && (
        <div style={{
          position: 'absolute', pointerEvents: 'none', whiteSpace: 'nowrap',
          top: '100%', left: tooltip.x > W * 0.6 ? tooltip.x - 100 : tooltip.x + 8,
          background: 'rgba(13,14,18,0.95)', border: `1px solid ${lineColor}50`,
          borderRadius: 7, padding: '4px 8px',
        }}>
          <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.65)', marginBottom: 1 }}>{sd(tooltip.p.date)}</div>
          <div style={{ fontSize: 11, fontWeight: 700, color: lineColor }}>{(tooltip.p.value * 100).toFixed(2)}% CVR</div>
        </div>
      )}

      {clTooltip && <ChangelogTooltip x={clTooltip.x} y={clTooltip.y} entries={clTooltip.entries} />}
      {modalEntries && <ChangelogModal entries={modalEntries} onClose={() => setModalEntries(null)} />}
    </div>
    <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 6, paddingRight: 62 }}>
      <span style={{ fontSize: 9, fontWeight: 700, color: tc }}>{tUp ? '▲' : '▼'} {tUp ? 'Improving' : 'Declining'}</span>
      <span style={{ fontSize: 9, color: tc }}>{rate.toFixed(1)}%/d</span>
      {setShowMA && (
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 3 }}>
          <button onClick={() => setShowMA(true)} style={{
            padding: '2px 7px', fontSize: 8, fontWeight: 700, borderRadius: 3,
            border: 'none', cursor: 'pointer', letterSpacing: '0.03em',
            background: showMA ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.04)',
            color: showMA ? '#fff' : 'rgba(255,255,255,0.35)',
          }}>30d MA</button>
          <button onClick={() => setShowMA(false)} style={{
            padding: '2px 7px', fontSize: 8, fontWeight: 700, borderRadius: 3,
            border: 'none', cursor: 'pointer', letterSpacing: '0.03em',
            background: !showMA ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.04)',
            color: !showMA ? '#fff' : 'rgba(255,255,255,0.35)',
          }}>Daily</button>
        </div>
      )}
    </div>
    </>
  )
}


/* ── Reusable Channel Revenue Card ────────────────────────────────────────── */
function ChannelRevCard({
  channelKey, title, revByDate, soByDate, dailyTarget, activeFrom, activeTo, changelog = [], channelPct, channelLabel, roasTarget,
}: {
  channelKey: ChannelKey
  title: string
  revByDate: Map<string, number>
  soByDate: Map<string, number>
  dailyTarget: number
  activeFrom: string
  activeTo: string
  changelog?: ChangelogRow[]
  channelPct: number
  channelLabel: string
  roasTarget: number
}) {
  const [showMA, setShowMA] = useState(true)
  const channelTarget = dailyTarget * roasTarget * channelPct

  // 30d MA — Revenue
  const allDates = Array.from(revByDate.keys()).sort()
  const dailyRev = allDates.map(d => ({ date: d, value: revByDate.get(d) ?? 0 }))
  const revMASeries = dailyRev.map((dd, i) => {
    const start = Math.max(0, i - MA_WINDOW + 1)
    const slice = dailyRev.slice(start, i + 1)
    return { date: dd.date, value: slice.reduce((s, d) => s + d.value, 0) / slice.length }
  }).filter(p => p.date >= activeFrom && p.date <= activeTo)
  const dailyRawSeries = dailyRev
    .filter(p => p.date >= activeFrom && p.date <= activeTo && p.value > 0)
  const activeChartSeries = showMA ? revMASeries : dailyRawSeries


  const activeDates = allDates.filter(d => d >= activeFrom && d <= activeTo)
  const totalRev = activeDates.reduce((s, d) => s + (revByDate.get(d) ?? 0), 0)
  const totalSO = activeDates.reduce((s, d) => s + (soByDate.get(d) ?? 0), 0)
  const nDays = activeDates.length

  const latestMA = revMASeries.length > 0 ? revMASeries[revMASeries.length - 1].value : 0

  const delta = channelTarget > 0 ? ((latestMA - channelTarget) / channelTarget) * 100 : 0
  const sc = delta >= 0 ? '#34d399' : delta >= -10 ? '#fbbf24' : '#f87171'
  const sl = delta >= 0 ? '🟢 On Target' : delta >= -10 ? '🟡 Slightly Below' : '🔴 Below Target'

  return (
    <div style={{
      flex: '0 0 calc(33.33% - 14px)',
      background: 'rgba(255,255,255,0.04)',
      border: '1px solid rgba(255,255,255,0.09)',
      borderRadius: 12, padding: '17px 20px',
      display: 'flex', flexDirection: 'column', gap: 14,
      fontFamily: 'Inter, system-ui, sans-serif',
    }}>

      {/* TITLE */}
      <div style={T.cardTitle}>{title} <span style={{ fontWeight: 500, color: 'rgba(255,255,255,0.3)', marginLeft: 6 }}>({(channelPct * 100).toFixed(1)}% Share)</span></div>

      {/* Numbers */}
      <div style={{ display: 'flex', gap: 16 }}>
        {/* Rev/Day */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ ...T.section, marginBottom: 3 }}>REV/DAY (30D MA)</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 5 }}>
            <span style={{ fontSize: 16, fontWeight: 800, letterSpacing: '-0.03em', color: '#fff', lineHeight: 1 }}>{latestMA > 0 ? fmtRp(Math.round(latestMA)) : '—'}</span>
            <span style={{ fontSize: 10, fontWeight: 300, color: 'rgba(255,255,255,0.2)' }}>/</span>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.5)' }}>{fmtRp(Math.round(channelTarget))}</span>
          </div>
          {/* Progress bar */}
          {channelTarget > 0 && (() => {
            const pct = latestMA / channelTarget
            return (
              <>
              <div style={{ height: 4, background: 'rgba(255,255,255,0.07)', borderRadius: 99, overflow: 'hidden', marginTop: 6 }}>
                <div style={{ height: '100%', borderRadius: 99, width: `${Math.min(pct * 100, 100)}%`, background: sc, transition: 'width 0.5s ease' }} />
              </div>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 5, background: `${sc}15`, border: `1px solid ${sc}30`, borderRadius: 5, padding: '2px 7px' }}>
                <div style={{ width: 4, height: 4, borderRadius: '50%', background: sc }} />
                <span style={{ fontSize: 9, fontWeight: 700, color: sc }}>{sl}</span>
                <span style={{ fontSize: 9, color: sc, opacity: 0.8 }}>{delta > 0 ? '+' : ''}{delta.toFixed(1)}%</span>
              </div>
              </>
            )
          })()}
        </div>
        {/* RoAS */}
        <div style={{ flex: '0 0 auto', textAlign: 'right' }}>
          <div style={{ ...T.section, marginBottom: 3 }}>RoAS</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 5, justifyContent: 'flex-end' }}>
            <span style={{ fontSize: 16, fontWeight: 800, letterSpacing: '-0.03em', color: sc, lineHeight: 1 }}>
              {dailyTarget > 0 && latestMA > 0 ? (latestMA / dailyTarget).toFixed(2) + '×' : '—'}
            </span>
            <span style={{ fontSize: 10, fontWeight: 300, color: 'rgba(255,255,255,0.2)' }}>/</span>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.5)' }}>{(roasTarget * channelPct).toFixed(2)}×</span>
          </div>
        </div>
      </div>

      {/* Total Revenue — subdued */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 5 }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.45)', letterSpacing: '0.04em', textTransform: 'uppercase' }}>Total</span>
        <span style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.6)' }}>{(totalRev / 1e9).toFixed(2)}B</span>
        <span style={{ fontSize: 11, fontWeight: 300, color: 'rgba(255,255,255,0.3)' }}>/</span>
        <span style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.45)' }}>{(channelTarget * nDays / 1e9).toFixed(2)}B</span>
        <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)' }}>({nDays}d)</span>
      </div>
      {/* Chart */}
      {activeChartSeries.length > 1 && (
        <div style={{ width: '100%' }}>
          <RevChart data={activeChartSeries} target={channelTarget} changelog={changelog} showMA={showMA} setShowMA={setShowMA} />
        </div>
      )}

    </div>
  )
}


/* ── CC CVR Card ─────────────────────────────────────────────────────────────── */
function CCCvrCard({
  cvrLeadByDate, cvrPurchaseByDate, activeFrom, activeTo, changelog = [],
}: {
  cvrLeadByDate: Map<string, number>
  cvrPurchaseByDate: Map<string, number>
  activeFrom: string
  activeTo: string
  changelog?: ChangelogRow[]
}) {
  const [showMA, setShowMA] = useState(true)
  const CVR_TARGET = 0.20 // 20%

  // 30d MA — CVR (purchase / real lead per window)
  const allDates = Array.from(new Set([...cvrLeadByDate.keys(), ...cvrPurchaseByDate.keys()])).sort()
  const dailyCvr = allDates.map(d => ({
    date: d,
    leads: cvrLeadByDate.get(d) ?? 0,
    purchases: cvrPurchaseByDate.get(d) ?? 0,
  }))
  const cvrMASeries = dailyCvr.map((dd, i) => {
    const start = Math.max(0, i - MA_WINDOW + 1)
    const slice = dailyCvr.slice(start, i + 1)
    const totalLeads = slice.reduce((s, d) => s + d.leads, 0)
    const totalPurchases = slice.reduce((s, d) => s + d.purchases, 0)
    return { date: dd.date, value: totalLeads > 0 ? totalPurchases / totalLeads : 0 }
  }).filter(p => p.date >= activeFrom && p.date <= activeTo)
  const dailyRawCvr = dailyCvr
    .map(d => ({ date: d.date, value: d.leads > 0 ? d.purchases / d.leads : 0 }))
    .filter(p => p.date >= activeFrom && p.date <= activeTo && p.value > 0)
  const activeChartSeries = showMA ? cvrMASeries : dailyRawCvr

  const activeDates = allDates.filter(d => d >= activeFrom && d <= activeTo)
  const nDays = activeDates.length

  const latestCVR = cvrMASeries.length > 0 ? cvrMASeries[cvrMASeries.length - 1].value : 0

  // Totals
  const totalLeads = activeDates.reduce((s, d) => s + (cvrLeadByDate.get(d) ?? 0), 0)
  const totalPurchases = activeDates.reduce((s, d) => s + (cvrPurchaseByDate.get(d) ?? 0), 0)
  const targetPurchases = Math.round(totalLeads * CVR_TARGET)

  const delta = CVR_TARGET > 0 ? ((latestCVR - CVR_TARGET) / CVR_TARGET) * 100 : 0
  const sc = delta >= 0 ? '#34d399' : delta >= -10 ? '#fbbf24' : '#f87171'
  const sl = delta >= 0 ? '🟢 On Target' : delta >= -10 ? '🟡 Slightly Below' : '🔴 Below Target'

  return (
    <div style={{
      flex: '0 0 calc(33.33% - 14px)',
      background: 'rgba(255,255,255,0.04)',
      border: '1px solid rgba(255,255,255,0.09)',
      borderRadius: 12, padding: '17px 20px',
      display: 'flex', flexDirection: 'column', gap: 14,
      fontFamily: 'Inter, system-ui, sans-serif',
    }}>

      {/* TITLE */}
      <div style={T.cardTitle}>CC CVR <span style={{ fontWeight: 500, color: 'rgba(255,255,255,0.3)', marginLeft: 6 }}>(MongoDB Data)</span></div>

      {/* Numbers */}
      <div style={{ display: 'flex', gap: 16 }}>
        {/* CVR */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ ...T.section, marginBottom: 3 }}>LATEST CVR (30D MA)</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 5 }}>
            <span style={{ fontSize: 16, fontWeight: 800, letterSpacing: '-0.03em', color: '#fff', lineHeight: 1 }}>{latestCVR > 0 ? (latestCVR * 100).toFixed(2) + '%' : '—'}</span>
            <span style={{ fontSize: 10, fontWeight: 300, color: 'rgba(255,255,255,0.2)' }}>/</span>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.5)' }}>{(CVR_TARGET * 100).toFixed(0)}%</span>
          </div>
          {/* Progress bar */}
          {(() => {
            const pct = latestCVR / CVR_TARGET
            return (
              <>
              <div style={{ height: 4, background: 'rgba(255,255,255,0.07)', borderRadius: 99, overflow: 'hidden', marginTop: 6 }}>
                <div style={{ height: '100%', borderRadius: 99, width: `${Math.min(pct * 100, 100)}%`, background: sc, transition: 'width 0.5s ease' }} />
              </div>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 5, background: `${sc}15`, border: `1px solid ${sc}30`, borderRadius: 5, padding: '2px 7px' }}>
                <div style={{ width: 4, height: 4, borderRadius: '50%', background: sc }} />
                <span style={{ fontSize: 9, fontWeight: 700, color: sc }}>{sl}</span>
                <span style={{ fontSize: 9, color: sc, opacity: 0.8 }}>{delta > 0 ? '+' : ''}{delta.toFixed(1)}%</span>
              </div>
              </>
            )
          })()}
        </div>
        {/* Purchase CC */}
        <div style={{ flex: '0 0 auto', textAlign: 'right' }}>
          <div style={{ ...T.section, marginBottom: 3 }}>Purchase CC</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 5, justifyContent: 'flex-end' }}>
            <span style={{ fontSize: 16, fontWeight: 800, letterSpacing: '-0.03em', color: sc, lineHeight: 1 }}>
              {totalPurchases.toLocaleString('id-ID')}
            </span>
            <span style={{ fontSize: 10, fontWeight: 300, color: 'rgba(255,255,255,0.2)' }}>/</span>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.5)' }}>{targetPurchases.toLocaleString('id-ID')}</span>
          </div>
        </div>
      </div>

      {/* Total — subdued */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 5 }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.45)', letterSpacing: '0.04em' }}>REAL LEADS CC</span>
        <span style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.6)' }}>{totalLeads.toLocaleString('id-ID')}</span>
        <span style={{ fontSize: 11, fontWeight: 300, color: 'rgba(255,255,255,0.3)' }}>·</span>
        <span style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.45)', letterSpacing: '0.04em' }}>PURCHASES CC</span>
        <span style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.6)' }}>{totalPurchases.toLocaleString('id-ID')}</span>
        <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)' }}>({nDays}d)</span>
      </div>

      {/* Chart */}
      {activeChartSeries.length > 1 && (
        <div style={{ width: '100%' }}>
          <CvrChart data={activeChartSeries} showMA={showMA} setShowMA={setShowMA} changelog={changelog} />
        </div>
      )}

    </div>
  )
}


/* ── Main Dashboard ── */
interface SalesVelocityProps {
  brand?: string
  brandLabel?: string
  roasTarget?: number
  channels?: Record<ChannelKey, { label: string; pct: number }>
  brandLogo?: string
  skuImages?: Record<string, string>
}

export function SalesVelocityDashboard({
  brand = 'MNC',
  brandLabel = 'MNC Sales Velocity',
  roasTarget = 6.59,
  channels = MNC_CHANNELS,
  brandLogo = mncLogo,
  skuImages: skuImagesOverride,
}: SalesVelocityProps = {}) {
  const ROAS_TARGET = roasTarget
  const CHANNELS = channels
  const effectiveSkuImages: Record<string, string> = { ...SKU_IMAGES, global: brandLogo, ...(skuImagesOverride ?? {}) }
  // ── Date bounds ──
  const { data: brandBounds } = useQuery({
    queryKey: ['date-bounds'],
    queryFn: async () => {
      const res = await fetch(`${D1_WORKER_URL}/v2/date-bounds`)
      if (!res.ok) throw new Error()
      return res.json() as Promise<BrandBounds[]>
    },
    staleTime: 0,
  })

  const mncBounds = useMemo(() => brandBounds?.find(b => b.brand === brand) ?? null, [brandBounds, brand])

  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [initialized, setInitialized] = useState(false)
  const [selectedSku, setSelectedSku] = useState('global')
  const skuOptions = useMemo(() => mncBounds?.skus?.slice().sort() ?? [], [mncBounds])

  useEffect(() => {
    if (mncBounds && !initialized) {
      const d = new Date(mncBounds.latest + 'T00:00:00')
      d.setDate(d.getDate() - 29)
      const fromStr = dateStr(d)
      setTo(mncBounds.latest)
      setFrom(fromStr < mncBounds.earliest ? mncBounds.earliest : fromStr)
      setInitialized(true)
    }
  }, [mncBounds, initialized])

  const activeFrom = from || mncBounds?.earliest || ''
  const activeTo = to || mncBounds?.latest || ''

  const fetchFrom = useMemo(() => {
    if (!activeFrom) return activeFrom
    const d = new Date(activeFrom + 'T00:00:00')
    d.setDate(d.getDate() - MA_BUFFER_DAYS)
    const earliest = mncBounds?.earliest ?? activeFrom
    const buf = dateStr(d)
    return buf < earliest ? earliest : buf
  }, [activeFrom, mncBounds])

  const applyPreset = (days: number) => {
    if (!mncBounds) return
    const t = new Date(mncBounds.latest + 'T00:00:00')
    if (days === 0) {
      const f = new Date(t.getFullYear(), t.getMonth(), 1)
      const fStr = dateStr(f)
      setFrom(fStr < mncBounds.earliest ? mncBounds.earliest : fStr)
    } else {
      const f = new Date(t)
      f.setDate(f.getDate() - days + 1)
      const fStr = dateStr(f)
      setFrom(fStr < mncBounds.earliest ? mncBounds.earliest : fStr)
    }
    setTo(mncBounds.latest)
  }

  // ── Fetch data ──
  const [refreshNonce, setRefreshNonce] = useState(0)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const spinRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const [spinAngle, setSpinAngle] = useState(0)
  const [showVelMA, setShowVelMA] = useState(true)

  const handleRefresh = () => {
    setIsRefreshing(true)
    setRefreshNonce(n => n + 1)
    let angle = 0
    if (spinRef.current) clearInterval(spinRef.current)
    spinRef.current = setInterval(() => { angle += 12; setSpinAngle(angle) }, 30)
  }

  const { data: cgData, isFetching } = useQuery({
    queryKey: ['consumer-goods', activeFrom, activeTo, brand, refreshNonce],
    queryFn: async () => {
      if (!activeFrom || !activeTo) return null
      const bust = refreshNonce > 0 ? `&_r=${refreshNonce}` : ''
      const res = await fetch(
        `${D1_WORKER_URL}/v2/consumer-goods?brand=${brand}&from=${fetchFrom}&to=${activeTo}${bust}`
      )
      if (!res.ok) throw new Error('fetch failed')
      const data = res.json() as Promise<{ sales: SalesRow[]; targets: TargetRow[]; [k: string]: unknown }>
      setIsRefreshing(false)
      if (spinRef.current) { clearInterval(spinRef.current); spinRef.current = null }
      return data
    },
    enabled: !!activeFrom && !!activeTo,
    staleTime: 5 * 60_000,
  })

  // ── Revenue + SO per channel per date ──
  const { channelRevByDate, channelSOByDate } = useMemo(() => {
    const rev: Record<ChannelKey, Map<string, number>> = {
      ccom_ca: new Map(), ccom_crm: new Map(), mpsh: new Map(), d2or: new Map(), ofls: new Map(),
    }
    const so: Record<ChannelKey, Map<string, number>> = {
      ccom_ca: new Map(), ccom_crm: new Map(), mpsh: new Map(), d2or: new Map(), ofls: new Map(),
    }
    const sales = (cgData?.sales ?? []) as SalesRow[]
    const filtered = selectedSku === 'global' ? sales : sales.filter(r => r.sku === selectedSku)
    for (const r of filtered) {
      for (const ch of Object.keys(rev) as ChannelKey[]) {
        const revVal = (r as Record<string, number>)[`rev_${ch}`] ?? 0
        const soVal = (r as Record<string, number>)[`so_${ch}`] ?? 0
        rev[ch].set(r.date, (rev[ch].get(r.date) ?? 0) + revVal)
        so[ch].set(r.date, (so[ch].get(r.date) ?? 0) + soVal)
      }
    }
    return { channelRevByDate: rev, channelSOByDate: so }
  }, [cgData, selectedSku])

  // CVR data: real leads + purchases from conversions
  const { cvrLeadByDate, cvrPurchaseByDate } = useMemo(() => {
    const leads = new Map<string, number>()
    const purchases = new Map<string, number>()
    const allRows = (cgData?.conversions ?? []) as { date: string; sku?: string; mongo_real_lead_ccom: number; mongo_purchase_ccom: number }[]
    const rows = selectedSku === 'global' ? allRows : allRows.filter(r => r.sku === selectedSku)
    for (const r of rows) {
      leads.set(r.date, (leads.get(r.date) ?? 0) + (r.mongo_real_lead_ccom ?? 0))
      purchases.set(r.date, (purchases.get(r.date) ?? 0) + (r.mongo_purchase_ccom ?? 0))
    }
    return { cvrLeadByDate: leads, cvrPurchaseByDate: purchases }
  }, [cgData, selectedSku])

  // Changelog
  const filteredChangelog = useMemo(() => (cgData?.changelog ?? []) as ChangelogRow[], [cgData])

  // Daily ad spend target
  const dailyAdSpendTarget = useMemo(() => {
    // Sum daily_budget from campaign_budgets (latest date's active campaign budgets)
    const budgets = (cgData?.campaign_budgets ?? []) as CampaignBudgetRow[]
    const filtered = selectedSku === 'global' ? budgets : budgets.filter(r => r.sku === selectedSku)
    return filtered.reduce((s, r) => s + (r.daily_budget ?? 0), 0)
  }, [cgData, selectedSku])

  // Latest 30d MA total revenue across all channels (matches chart)
  const { latestDayRevenue, latestDayDate } = useMemo(() => {
    const allSales = (cgData?.sales ?? []) as SalesRow[]
    const sales = selectedSku === 'global' ? allSales : allSales.filter(r => r.sku === selectedSku)
    if (!sales.length) return { latestDayRevenue: 0, latestDayDate: '' }

    // Build daily totals (all channels summed per date)
    const totByDate = new Map<string, number>()
    for (const r of sales) {
      const tot = (r.rev_ccom_ca ?? 0) + (r.rev_ccom_crm ?? 0) + (r.rev_mpsh ?? 0) + (r.rev_d2or ?? 0) + (r.rev_ofls ?? 0)
      totByDate.set(r.date, (totByDate.get(r.date) ?? 0) + tot)
    }
    const allDates = Array.from(totByDate.keys()).sort()
    // 30d MA on those totals
    const maSeries = allDates.map((d, i) => {
      const start = Math.max(0, i - MA_WINDOW + 1)
      const slice = allDates.slice(start, i + 1)
      return { date: d, value: slice.reduce((s, dd) => s + (totByDate.get(dd) ?? 0), 0) / slice.length }
    })
    // Latest date within active range
    const latest = maSeries.filter(p => p.date <= activeTo).at(-1)
    return { latestDayRevenue: latest?.value ?? 0, latestDayDate: latest?.date ?? '' }
  }, [cgData, activeTo, selectedSku])

  // Per-SKU velocity: daily budget → target, 30d MA of all-channel rev per SKU
  const skuVelocity = useMemo(() => {
    const allSales = (cgData?.sales ?? []) as SalesRow[]
    const allBudgets = (cgData?.campaign_budgets ?? []) as CampaignBudgetRow[]
    const sales = selectedSku === 'global' ? allSales : allSales.filter(r => r.sku === selectedSku)
    const budgets = selectedSku === 'global' ? allBudgets : allBudgets.filter(r => r.sku === selectedSku)
    if (!sales.length) return []

    // SKUs from brand bounds or infer from sales
    const skus = Array.from(new Set(sales.map(r => r.sku))).sort()

    return skus.map(sku => {
      // Per-SKU daily budget = sum of campaign_budgets rows for this SKU
      const skuBudget = budgets.filter(r => r.sku === sku).reduce((s, r) => s + (r.daily_budget ?? 0), 0)
      const skuTarget = skuBudget * ROAS_TARGET

      // All-channel daily revenue for this SKU
      const revByDate = new Map<string, number>()
      for (const r of sales.filter(r => r.sku === sku)) {
        const tot = (r.rev_ccom_ca ?? 0) + (r.rev_ccom_crm ?? 0) + (r.rev_mpsh ?? 0) + (r.rev_d2or ?? 0) + (r.rev_ofls ?? 0)
        revByDate.set(r.date, (revByDate.get(r.date) ?? 0) + tot)
      }
      const allDates = Array.from(revByDate.keys()).sort()
      const daily = allDates.map(d => ({ date: d, value: revByDate.get(d) ?? 0 }))

      // 30d MA
      const ma = daily.map((dd, i) => {
        const slice = daily.slice(Math.max(0, i - MA_WINDOW + 1), i + 1)
        return { date: dd.date, value: slice.reduce((s, d) => s + d.value, 0) / slice.length }
      }).filter(p => p.date >= activeFrom && p.date <= activeTo)

      const latest = ma.at(-1)?.value ?? 0
      const pct = skuTarget > 0 ? latest / skuTarget : 0
      const dev = skuTarget > 0 ? Math.abs((latest - skuTarget) / skuTarget) * 100 : 100
      const sc = dev <= 5 ? '#34d399' : dev < 20 ? '#fbbf24' : '#f87171'

      // Trend regression on MA
      const maVals = ma.map(p => p.value)
      const n = maVals.length
      const maAvg = n > 0 ? maVals.reduce((a, b) => a + b, 0) / n : 0
      const mX2 = (n - 1) / 2
      const denom2 = maVals.reduce((s, _, i) => s + (i - mX2) ** 2, 0)
      const slope2 = denom2 > 0 ? maVals.reduce((s, v, i) => s + (i - mX2) * (v - maAvg), 0) / denom2 : 0
      const tUp = slope2 > 0
      const trendRate = maAvg > 0 ? Math.abs((slope2 / maAvg) * 100) : 0
      const tc = tUp ? '#34d399' : trendRate < 0.5 ? '#fbbf24' : '#f87171'

      return { sku, skuTarget, skuBudget, latest, pct, sc, tUp, trendRate, tc }
    }).filter(s => s.skuTarget > 0)  // only SKUs with active budgets
  }, [cgData, activeFrom, activeTo, selectedSku])

  const presetBtn = (label: string, days: number) => (
    <button
      onClick={() => applyPreset(days)}
      style={{
        padding: '4px 10px', fontSize: 11, fontWeight: 600,
        borderRadius: 6, border: '1px solid rgba(255,255,255,0.08)',
        background: 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.5)',
        cursor: 'pointer', transition: 'all 0.15s',
      }}
      onMouseEnter={e => { (e.target as HTMLElement).style.background = 'rgba(255,255,255,0.1)'; (e.target as HTMLElement).style.color = '#fff' }}
      onMouseLeave={e => { (e.target as HTMLElement).style.background = 'rgba(255,255,255,0.04)'; (e.target as HTMLElement).style.color = 'rgba(255,255,255,0.5)' }}
    >
      {label}
    </button>
  )

  return (
    <div style={{ padding: '17px 27px', paddingTop: 105, paddingBottom: '34vh', fontFamily: 'Inter, system-ui, sans-serif', color: '#fff', minHeight: '100vh', fontSize: '85%' }}>

      {/* ── Top toolbar ── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12,
        flexWrap: 'wrap',
        position: 'fixed', top: 0, left: 144, right: 0, zIndex: 50,
        background: 'rgba(13,14,18,0.88)', backdropFilter: 'blur(14px)',
        padding: '10px 27px',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        boxShadow: '0 2px 12px rgba(0,0,0,0.4)',
      }}>
        <div style={{
          padding: '4px 12px', borderRadius: 20,
          background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
          fontSize: 11, fontWeight: 700, letterSpacing: '0.04em',
          color: '#fff', textTransform: 'uppercase',
        }}>
          ⚡ {brandLabel}
        </div>

        {/* SKU Picker with thumbnail */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <img
            src={effectiveSkuImages[selectedSku] ?? brandLogo}
            alt={selectedSku}
            style={{
              width: 40, height: 40, borderRadius: 8,
              objectFit: 'cover',
              border: '1px solid rgba(255,255,255,0.12)',
              background: 'rgba(255,255,255,0.06)',
            }}
          />
          <select
            value={selectedSku}
            onChange={e => setSelectedSku(e.target.value)}
            style={{
              padding: '5px 10px', fontSize: 11, fontWeight: 600,
              borderRadius: 6, border: '1px solid rgba(255,255,255,0.1)',
              background: 'rgba(255,255,255,0.06)', color: '#fff',
              cursor: 'pointer', appearance: 'none' as const,
              backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 24 24' fill='none' stroke='rgba(255,255,255,0.4)' stroke-width='3'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`,
              backgroundRepeat: 'no-repeat', backgroundPosition: 'right 8px center',
              paddingRight: 26, minWidth: 100,
            }}
          >
            <option value="global" style={{ background: '#1a1b1e' }}>🌐 Global</option>
            {skuOptions.map(sku => (
              <option key={sku} value={sku} style={{ background: '#1a1b1e' }}>{sku}</option>
            ))}
          </select>
        </div>

        <input type="date" value={from} onChange={e => setFrom(e.target.value)}
          min={mncBounds?.earliest} max={activeTo}
          style={{ padding: '5px 10px', fontSize: 11, fontWeight: 500, borderRadius: 6, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.06)', color: '#fff', colorScheme: 'dark' }}
        />
        <span style={{ color: 'rgba(255,255,255,0.25)', fontSize: 12 }}>→</span>
        <input type="date" value={to} onChange={e => setTo(e.target.value)}
          min={activeFrom} max={mncBounds?.latest}
          style={{ padding: '5px 10px', fontSize: 11, fontWeight: 500, borderRadius: 6, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.06)', color: '#fff', colorScheme: 'dark' }}
        />

        {presetBtn('7D', 7)}
        {presetBtn('14D', 14)}
        {presetBtn('30D', 30)}
        {presetBtn('MTD', 0)}

        <button onClick={handleRefresh} style={{
          display: 'flex', alignItems: 'center', gap: 5,
          padding: '4px 12px', fontSize: 11, fontWeight: 600,
          borderRadius: 6, border: '1px solid rgba(255,255,255,0.08)',
          background: 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.5)',
          cursor: 'pointer', transition: 'all 0.15s',
        }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
            style={{ transform: `rotate(${spinAngle}deg)`, transition: isRefreshing ? 'none' : 'transform 0.3s' }}>
            <path d="M23 4v6h-6" /><path d="M1 20v-6h6" />
            <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" />
          </svg>
          Refresh
        </button>

        {dailyAdSpendTarget > 0 && (
          <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', fontWeight: 500 }}>
            Daily Budget: {fmtRp(Math.round(dailyAdSpendTarget))} · Total Target Rev: {fmtRp(Math.round(dailyAdSpendTarget * ROAS_TARGET))}/day
          </div>
        )}
      </div>

      {/* ── Target Summary Card ── */}
      {dailyAdSpendTarget > 0 && (() => {
        const revTarget = dailyAdSpendTarget * ROAS_TARGET
        const velPct = revTarget > 0 ? Math.min(latestDayRevenue / revTarget, 2) : 0
        const velDev = Math.abs((latestDayRevenue - revTarget) / revTarget) * 100
        const velColor = velDev <= 5 ? '#34d399' : velDev < 20 ? '#fbbf24' : '#f87171'
        const velLabel = velDev <= 5 ? 'On Target' : latestDayRevenue >= revTarget ? 'Over Target' : velDev < 20 ? 'Slightly Below' : 'Below Target'

        // Total MA series for chart
        const allDates = Array.from(new Set(
          (Object.keys(channelRevByDate) as ChannelKey[]).flatMap(k => Array.from(channelRevByDate[k].keys()))
        )).sort()
        const dailyTotal = allDates.map(d => ({
          date: d,
          value: (Object.keys(channelRevByDate) as ChannelKey[]).reduce((s, k) => s + (channelRevByDate[k].get(d) ?? 0), 0),
        }))
        const totalMASeries = dailyTotal.map((dd, i) => {
          const start = Math.max(0, i - MA_WINDOW + 1)
          const slice = dailyTotal.slice(start, i + 1)
          return { date: dd.date, value: slice.reduce((s, d) => s + d.value, 0) / slice.length }
        }).filter(p => p.date >= activeFrom && p.date <= activeTo)
        const dailyRawSeries = dailyTotal
          .filter(p => p.date >= activeFrom && p.date <= activeTo && p.value > 0)
        const activeChartSeries = showVelMA ? totalMASeries : dailyRawSeries

        // Per-channel 30d MA + trend
        const chMA = (Object.keys(CHANNELS) as ChannelKey[]).map(key => {
          const dates = Array.from(channelRevByDate[key].keys()).sort()
          const daily = dates.map(d => ({ date: d, value: channelRevByDate[key].get(d) ?? 0 }))
          const ma = daily.map((dd, i) => {
            const start = Math.max(0, i - MA_WINDOW + 1)
            const slice = daily.slice(start, i + 1)
            return { date: dd.date, value: slice.reduce((s, d) => s + d.value, 0) / slice.length }
          }).filter(p => p.date >= activeFrom && p.date <= activeTo)
          const latest = ma.at(-1)?.value ?? 0
          const chTarget = revTarget * CHANNELS[key].pct
          const pct = chTarget > 0 ? latest / chTarget : 0
          const dev = chTarget > 0 ? Math.abs((latest - chTarget) / chTarget) * 100 : 100
          const sc = dev <= 5 ? '#34d399' : dev < 20 ? '#fbbf24' : '#f87171'
          const maVals = ma.map(p => p.value)
          const n = maVals.length
          const maAvg = n > 0 ? maVals.reduce((a, b) => a + b, 0) / n : 0
          const mX = (n - 1) / 2
          const denom = maVals.reduce((s, _, i) => s + (i - mX) ** 2, 0)
          const slope = denom > 0 ? maVals.reduce((s, v, i) => s + (i - mX) * (v - maAvg), 0) / denom : 0
          const tUp = slope > 0
          const trendRate = maAvg > 0 ? Math.abs((slope / maAvg) * 100) : 0
          const tc = tUp ? '#34d399' : trendRate < 0.5 ? '#fbbf24' : '#f87171'
          return { key, label: CHANNELS[key].label, latest, chTarget, pct, sc, tUp, trendRate, tc }
        })

        return (
          <div style={{
            width: '100%', marginBottom: 20,
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 12, padding: '17px 24px',
            fontFamily: 'Inter, system-ui, sans-serif',
          }}>
            <div style={{ display: 'flex', flexDirection: 'row', gap: 0, alignItems: 'stretch' }}>

              {/* ── COL 1: Stats ── */}
              <div style={{ flex: '0 0 220px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6, paddingRight: 24 }}>
                {/* Section label */}
                <div style={{ fontSize: 9, fontWeight: 700, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: '0.09em' }}>
                  Current Daily Velocity
                  {latestDayDate && <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0, marginLeft: 5, color: 'rgba(255,255,255,0.2)' }}>({sd(latestDayDate)})</span>}
                </div>

                {/* Current value */}
                <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: '-0.03em', color: velColor, lineHeight: 1, whiteSpace: 'nowrap', marginTop: 2 }}>
                  {fmtRp(Math.round(latestDayRevenue))}
                </div>

                {/* / Target */}
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                  <span style={{ fontSize: 14, fontWeight: 300, color: 'rgba(255,255,255,0.15)', lineHeight: 1 }}>/</span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.6)', letterSpacing: '0.01em' }}>
                    {fmtRp(Math.round(revTarget))}
                  </span>
                </div>

                {/* Progress bar */}
                <div style={{ height: 4, background: 'rgba(255,255,255,0.07)', borderRadius: 99, overflow: 'hidden', marginTop: 2 }}>
                  <div style={{
                    height: '100%', borderRadius: 99,
                    width: `${Math.min(velPct * 100, 100)}%`,
                    background: velColor, transition: 'width 0.6s ease',
                    boxShadow: `0 0 8px ${velColor}60`,
                  }} />
                </div>

                {/* Flag pill */}
                <div style={{
                  display: 'inline-flex', alignItems: 'center', gap: 5,
                  background: `${velColor}15`, border: `1px solid ${velColor}30`,
                  borderRadius: 5, padding: '3px 8px', alignSelf: 'flex-start',
                }}>
                  <div style={{ width: 4, height: 4, borderRadius: '50%', background: velColor }} />
                  <span style={{ fontSize: 10, fontWeight: 700, color: velColor }}>{velLabel}</span>
                  <span style={{ fontSize: 10, color: velColor, opacity: 0.75 }}>{(velPct * 100).toFixed(1)}%</span>
                </div>

                {/* Divider */}
                <div style={{ height: 1, background: 'rgba(255,255,255,0.06)', margin: '4px 0' }} />

                {/* Calculation */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.5)', whiteSpace: 'nowrap' }}>{fmtCompact(Math.round(dailyAdSpendTarget))}</span>
                  <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.18)' }}>×</span>
                  <span style={{ fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.5)' }}>{ROAS_TARGET}×</span>
                  <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.18)' }}>=</span>
                  <span style={{ fontSize: 10, fontWeight: 800, color: '#34d399', whiteSpace: 'nowrap' }}>{fmtCompact(Math.round(revTarget))}/day</span>
                </div>

                {/* Misc */}
                <div style={{ fontSize: 8, color: 'rgba(255,255,255,0.2)', lineHeight: 1.7, marginTop: 2 }}>
                  <div>CA · CRM · MPSH · D2OR · OFLS</div>
                  <div>30-Day Moving Average</div>
                </div>
              </div>

              {/* ── COL 2: Chart ── */}
              {activeChartSeries.length > 1 && (
                <div style={{ flex: 1.4, minWidth: 0, borderLeft: '1px solid rgba(255,255,255,0.06)', paddingLeft: 20, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                  <RevChart data={activeChartSeries} target={revTarget} changelog={filteredChangelog} showMA={showVelMA} setShowMA={setShowVelMA} />
                </div>
              )}

              {/* ── COL 3: Breakdown by SKU ── */}
              {skuVelocity.length > 0 && (
                <div style={{ flex: 1, minWidth: 0, borderLeft: '1px solid rgba(255,255,255,0.06)', paddingLeft: 20, paddingRight: 16, display: 'flex', flexDirection: 'column', gap: 5 }}>
                  <div style={{ fontSize: 8, fontWeight: 700, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: '0.09em', marginBottom: 2 }}>
                    By SKU
                  </div>
                  {skuVelocity.map(s => (
                    <div key={s.sku} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <div style={{ display: 'flex', alignItems: 'center' }}>
                        {/* Name */}
                        <div style={{ width: 34, display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                          <div style={{ width: 4, height: 4, borderRadius: '50%', background: skuColor(s.sku), flexShrink: 0 }} />
                          <span style={{ fontSize: 8, fontWeight: 800, color: skuColor(s.sku), letterSpacing: '0.05em', textTransform: 'uppercase' }}>{s.sku}</span>
                        </div>
                        {/* Current velocity */}
                        <span style={{ width: 50, fontSize: 9, fontWeight: 800, color: s.sc, letterSpacing: '-0.01em', textAlign: 'right', flexShrink: 0 }}>{fmtCompact(Math.round(s.latest))}</span>
                        {/* / */}
                        <span style={{ width: 12, fontSize: 8, color: 'rgba(255,255,255,0.15)', textAlign: 'center', flexShrink: 0 }}>/</span>
                        {/* Target velocity */}
                        <span style={{ width: 48, fontSize: 8, fontWeight: 500, color: 'rgba(255,255,255,0.35)', flexShrink: 0 }}>{fmtCompact(Math.round(s.skuTarget))}</span>
                        {/* Achievement % */}
                        <span style={{ width: 30, fontSize: 9, fontWeight: 800, color: s.sc, textAlign: 'right', flexShrink: 0 }}>{(s.pct * 100).toFixed(0)}%</span>
                        {/* Flag */}
                        <span style={{ flex: 1, fontSize: 8, fontWeight: 700, color: s.tc, textAlign: 'right', whiteSpace: 'nowrap' }}>{s.tUp ? '▲' : '▼'} {s.tUp ? 'Conv' : 'Div'} {s.trendRate.toFixed(1)}%</span>
                      </div>
                      <div style={{ height: 2, background: 'rgba(255,255,255,0.06)', borderRadius: 99, overflow: 'hidden' }}>
                        <div style={{ height: '100%', borderRadius: 99, width: `${Math.min(s.pct * 100, 100)}%`, background: s.sc, transition: 'width 0.5s ease' }} />
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* ── COL 4: Breakdown by Sales Channel ── */}
              <div style={{ flex: 1, minWidth: 0, borderLeft: '1px solid rgba(255,255,255,0.06)', paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 5 }}>
                <div style={{ fontSize: 8, fontWeight: 700, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: '0.09em', marginBottom: 2 }}>
                  By Sales Channel
                </div>
                {chMA.map(ch => {
                  const displayLabel = ch.label.replace(' (CCOM)', '')
                  return (
                    <div key={ch.key} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <div style={{ display: 'flex', alignItems: 'center' }}>
                        {/* Name */}
                        <span style={{ width: 34, fontSize: 8, fontWeight: 700, color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase', letterSpacing: '0.04em', flexShrink: 0 }}>{displayLabel}</span>
                        {/* Current velocity */}
                        <span style={{ width: 50, fontSize: 9, fontWeight: 800, color: ch.sc, letterSpacing: '-0.01em', textAlign: 'right', flexShrink: 0 }}>{fmtCompact(Math.round(ch.latest))}</span>
                        {/* / */}
                        <span style={{ width: 12, fontSize: 8, color: 'rgba(255,255,255,0.15)', textAlign: 'center', flexShrink: 0 }}>/</span>
                        {/* Target velocity */}
                        <span style={{ width: 48, fontSize: 8, fontWeight: 500, color: 'rgba(255,255,255,0.35)', flexShrink: 0 }}>{fmtCompact(Math.round(ch.chTarget))}</span>
                        {/* Achievement % */}
                        <span style={{ width: 30, fontSize: 9, fontWeight: 800, color: ch.sc, textAlign: 'right', flexShrink: 0 }}>{(ch.pct * 100).toFixed(0)}%</span>
                        {/* Flag */}
                        <span style={{ flex: 1, fontSize: 8, fontWeight: 700, color: ch.tc, textAlign: 'right', whiteSpace: 'nowrap' }}>{ch.tUp ? '▲' : '▼'} {ch.tUp ? 'Conv' : 'Div'} {ch.trendRate.toFixed(1)}%</span>
                      </div>
                      <div style={{ height: 2, background: 'rgba(255,255,255,0.06)', borderRadius: 99, overflow: 'hidden' }}>
                        <div style={{ height: '100%', borderRadius: 99, width: `${Math.min(ch.pct * 100, 100)}%`, background: ch.sc, transition: 'width 0.5s ease' }} />
                      </div>
                    </div>
                  )
                })}
              </div>

            </div>
          </div>
        )
      })()}

      {/* ── Row 1: CA Revenue + CC CVR + CRM Revenue ── */}
      <div style={{ display: 'flex', gap: 20, marginBottom: 20, flexWrap: 'wrap' }}>
        <ChannelRevCard
          channelKey="ccom_ca" title="CA Revenue"
          revByDate={channelRevByDate.ccom_ca}
          soByDate={channelSOByDate.ccom_ca}
          dailyTarget={dailyAdSpendTarget}
          activeFrom={activeFrom}
          activeTo={activeTo}
          changelog={filteredChangelog}
          channelPct={CHANNELS.ccom_ca.pct} channelLabel={CHANNELS.ccom_ca.label} roasTarget={ROAS_TARGET}
        />
        <CCCvrCard
          cvrLeadByDate={cvrLeadByDate}
          cvrPurchaseByDate={cvrPurchaseByDate}
          activeFrom={activeFrom}
          activeTo={activeTo}
          changelog={filteredChangelog}
        />
        <ChannelRevCard
          channelKey="ccom_crm" title="CRM Revenue"
          revByDate={channelRevByDate.ccom_crm}
          soByDate={channelSOByDate.ccom_crm}
          dailyTarget={dailyAdSpendTarget}
          activeFrom={activeFrom}
          activeTo={activeTo}
          changelog={filteredChangelog}
          channelPct={CHANNELS.ccom_crm.pct} channelLabel={CHANNELS.ccom_crm.label} roasTarget={ROAS_TARGET}
        />
      </div>

      {/* ── Row 2: MPSH + D2OR + OFLS ── */}
      <div style={{ display: 'flex', gap: 20, marginBottom: 20, flexWrap: 'wrap' }}>
        <ChannelRevCard
          channelKey="mpsh" title="MPSH Revenue"
          revByDate={channelRevByDate.mpsh}
          soByDate={channelSOByDate.mpsh}
          dailyTarget={dailyAdSpendTarget}
          activeFrom={activeFrom}
          activeTo={activeTo}
          changelog={filteredChangelog}
          channelPct={CHANNELS.mpsh.pct} channelLabel={CHANNELS.mpsh.label} roasTarget={ROAS_TARGET}
        />
        <ChannelRevCard
          channelKey="d2or" title="D2OR Revenue"
          revByDate={channelRevByDate.d2or}
          soByDate={channelSOByDate.d2or}
          dailyTarget={dailyAdSpendTarget}
          activeFrom={activeFrom}
          activeTo={activeTo}
          changelog={filteredChangelog}
          channelPct={CHANNELS.d2or.pct} channelLabel={CHANNELS.d2or.label} roasTarget={ROAS_TARGET}
        />
        <ChannelRevCard
          channelKey="ofls" title="OFLS Revenue"
          revByDate={channelRevByDate.ofls}
          soByDate={channelSOByDate.ofls}
          dailyTarget={dailyAdSpendTarget}
          activeFrom={activeFrom}
          activeTo={activeTo}
          changelog={filteredChangelog}
          channelPct={CHANNELS.ofls.pct} channelLabel={CHANNELS.ofls.label} roasTarget={ROAS_TARGET}
        />
      </div>

    </div>
  )
}

/* ── GOL Sales Velocity Dashboard ── */
import golLogo from '../assets/brand_logos/GOL.webp'

export function GOLSalesVelocityDashboard() {
  return (
    <SalesVelocityDashboard
      brand="GOL"
      brandLabel="GOL Sales Velocity"
      roasTarget={6.59}
      channels={MNC_CHANNELS}
      brandLogo={golLogo}
    />
  )
}
