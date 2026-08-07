/**
 * SkuPerformanceCard
 * Per-SKU diagnostic card with CTR · CPRL · CPA CC.
 *
 * Chart target lines:
 *   CTR    → global CTR average (passed as prop)
 *   CPRL   → fixed Rp 150K
 *   CPA CC → fixed prop (default Rp 5M)
 *
 * Design tokens match AdsPerformanceHealthCard / LeadsQualityCard 1:1.
 */
import { useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { TARGET_CPR, TARGET_CPA_CC, fmtIDR } from '../../pages/ProductPerformancePage'

// ── Types ─────────────────────────────────────────────────────────────────────
export interface SkuPoint     { date: string; value: number }
import type { ChangelogRow } from '../../types/changelog'
export type { ChangelogRow }
import { ChangelogModal } from '../ChangelogModal'
import { ChangelogTooltip } from '../ChangelogTooltip'

export interface SkuPerformanceCardProps {
  sku:           string
  skuLabel?:     string
  productName?:  string
  skuColor:      string
  imageSrc?:     string

  // Period totals
  totalCtr:      number   // 0–100 %
  totalLpvo:     number   // View Offer / LP View  0–100 %
  totalVo2l:     number   // Real Leads / View Offer  0–100 %
  totalCprl:     number   // Rp
  totalCpaCC:    number   // Rp

  // Daily series
  ctrSeries:     SkuPoint[]
  lpvoSeries:    SkuPoint[]
  vo2lSeries:    SkuPoint[]
  cprlSeries:    SkuPoint[]
  cpaSeries:     SkuPoint[]

  // Date range (for evaluator table)
  from?:  string
  to?:    string

  // Target lines
  globalCtrAvg:   number
  globalLpvoAvg:  number
  globalVo2lAvg:  number
  cprlTarget?:    number
  cpaTarget?:     number

  changelog?:    ChangelogRow[]

  // Campaign breakdown (computed from consumer-goods data)
  campaignBreakdown?: CampaignRow[]

  // Per-SKU budget
  skuSpend?:             number
  skuPeriodBudget?:      number
  skuDailyBudget?:       number
  skuTargetDailyBudget?: number
  budgetDate?:           string
  totalAllPlatformsSpend?: number  // When set, shows spend share % instead of budget bar

  // RoAS
  totalRoas?:   number
  roasTarget?:  number
  roasLabel?:   string   // 'Total RoAS' (default) or 'CC RoAS' etc.
}

// ── Formatters ────────────────────────────────────────────────────────────────
import { fmtRp, fmtRpM } from '../../utils/format'
const fmtPct  = (n: number) => n.toFixed(2) + '%'
const fmtShortRp = fmtRpM

const T = {
  label: { fontSize: 9,  fontWeight: 600, letterSpacing: '0.09em', color: 'rgba(255,255,255,0.62)', textTransform: 'uppercase' as const },
  tiny:  { fontSize: 9,  fontWeight: 600, color: 'rgba(255,255,255,0.55)', letterSpacing: '0.05em', textTransform: 'uppercase' as const },
  head:  { fontSize: 22, fontWeight: 800, letterSpacing: '-0.04em', color: '#fff', lineHeight: 1, whiteSpace: 'nowrap' as const },
}

// ── Sparkline (same tokens as reference, supports fixed OR computed target) ──
function Sparkline({
  data = [],           changelog, color, fmt, fmtShort, chartKey,
  higherIsBetter, fixedTarget, targetFontSize = 14, filterSku,
}: {
  data:            SkuPoint[]
  changelog:       ChangelogRow[]
  color:           string
  fmt:             (v: number) => string
  fmtShort:        (v: number) => string
  chartKey:        string
  higherIsBetter:  boolean
  fixedTarget?:    number   // if provided, draw fixed line; otherwise use series avg
  targetFontSize?: number  // viewBox font size for target label (default 14)
  filterSku?:      string  // if set, only show markers for this SKU or empty-sku entries
}) {
  const VW = 320, VH = 140
  const PAD = { top: 10, right: 52, bottom: 20, left: 6 }
  const innerW = VW - PAD.left - PAD.right
  const innerH = VH - PAD.top - PAD.bottom

  const [tooltip,   setTooltip]   = useState<{ px: number; x: number; y: number; p: SkuPoint } | null>(null)
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

  // Y range: always include target in view
  const minV = Math.min(...vals, target) * 0.96
  const maxV = Math.max(...vals, target) * 1.04
  const rng  = maxV - minV || 1

  // Regression
  const mX    = (n - 1) / 2
  const slope = vals.reduce((s, v, i) => s + (i - mX) * (v - avg), 0) /
                vals.reduce((s, _, i) => s + (i - mX) ** 2, 0)
  const ic    = avg - slope * mX
  // Rate relative to target for fixed targets, avg for dynamic
  const rate  = target > 0 ? Math.abs((slope / target) * 100) : 0

  // Trend semantics
  const tUp = slope > 0
  const tc   = higherIsBetter
    ? (tUp ? '#34d399' : '#f87171')
    : (tUp ? '#f87171' : '#34d399')
  const trendLabel = higherIsBetter
    ? (tUp ? 'Converging' : 'Diverging')
    : (tUp ? 'Diverging'  : 'Converging')
  const trendArrow = tUp ? '↑' : '↓'

  // Coordinates
  const xs = (i: number) => PAD.left + (i / (n - 1)) * innerW
  const ys = (v: number) => PAD.top + innerH - ((v - minV) / rng) * innerH
  const cl = (y: number) => Math.max(PAD.top, Math.min(PAD.top + innerH, y))
  const tY = cl(ys(target))

  // Per-segment zone fill with intersection (exact reference impl)
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
    .map((d, i) => {
      const entries = changelog.filter(c => {
        if (c.date !== d.date) return false
        if (!filterSku) return true
        const entrySku = (c.sku ?? '').trim()
        return entrySku === '' || entrySku === filterSku
      })
      return { d, i, entries }
    })
    .filter(m => m.entries.length > 0)

  const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const r = ref.current?.getBoundingClientRect(); if (!r) return
    const relX = (e.clientX - r.left) / r.width
    const idx  = Math.max(0, Math.min(n - 1, Math.round(relX * (n - 1))))
    setTooltip({ px: e.clientX - r.left, x: xs(idx), y: ys(data[idx].value), p: data[idx] })
  }

  const sd     = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
  const gradId = `sku-grad-${chartKey}`

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

          {above.map((p, i) => <polygon key={`a${i}`} points={p} fill={aboveColor} fillOpacity="0.1" />)}
          {below.map((p, i) => <polygon key={`b${i}`} points={p} fill={belowColor} fillOpacity="0.1" />)}

          {/* Target line */}
          <line x1={PAD.left} y1={tY} x2={VW - PAD.right} y2={tY}
            stroke="#94a3b8" strokeOpacity="0.75" strokeWidth="2" strokeDasharray="4,3" />
          <text x={VW - PAD.right + 3} y={tY + 5}
            fontSize={targetFontSize} fill="#94a3b8" opacity="1" fontWeight="700">{fmtShort(target)}</text>

          {/* Trendline */}
          <line x1={xs(0)} y1={cl(ys(ic))} x2={xs(n - 1)} y2={cl(ys(slope * (n - 1) + ic))}
            stroke={tc} strokeOpacity="0.45" strokeWidth="1.8" strokeDasharray="4,3" />

          {/* Main line */}
          <polyline points={pts} fill="none" stroke={color} strokeWidth="2.5"
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
            position: 'absolute', pointerEvents: 'none', whiteSpace: 'nowrap',
            top: 0, left: tooltip.px > 200 ? tooltip.px - 120 : tooltip.px + 8,
            background: 'rgba(13,14,18,0.95)', border: `1px solid ${color}50`,
            borderRadius: 7, padding: '4px 8px', backdropFilter: 'blur(8px)',
          }}>
            <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.65)', marginBottom: 1 }}>{sd(tooltip.p.date)}</div>
            <div style={{ fontSize: 11, fontWeight: 700, color }}>{fmt(tooltip.p.value)}</div>
          </div>
        )}

        {clTooltip && <ChangelogTooltip x={clTooltip.x} y={clTooltip.y} entries={clTooltip.entries} />}
      </div>

      {/* Trend badge — exact reference tokens */}
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

// ── Campaign Performance Evaluator ───────────────────────────────────────────
type FunnelLevel = 'ToFU00' | 'MoFU25' | 'BoFU50' | 'BoFU75' | 'Unknown'
export interface CampaignRow {
  traffic_source: string; campaign_id: string; campaign_name: string
  funnel: string; ad_spend: number
  ga4_page_view: number; ga4_view_offer: number
  real_lead_ccom: number; real_lead_d2or: number
  real_lead_mpsh: number; real_lead_ofls: number
  purchase_ccom: number
}
function mapFunnel(code: string): FunnelLevel {
  return code === '00' ? 'ToFU00' : code === '25' ? 'MoFU25' : code === '50' ? 'BoFU50' : code === '75' ? 'BoFU75' : 'Unknown'
}
const FUNNEL_CLR: Record<FunnelLevel, string> = {
  ToFU00: '#818cf8', MoFU25: '#60a5fa', BoFU50: '#fbbf24', BoFU75: '#fb923c', Unknown: 'rgba(255,255,255,0.3)',
}
function CampaignEvaluator({ data, cprlTarget, cpaTarget }: {
  data: CampaignRow[]; cprlTarget: number; cpaTarget: number
}) {

  const metaRows = (data ?? []).filter(r => r.ad_spend > 0 && r.traffic_source === 'META')
  const tot = metaRows.reduce((t, r) => ({
    spend: t.spend + r.ad_spend, pv: t.pv + r.ga4_page_view, vo: t.vo + r.ga4_view_offer,
    rl: t.rl + r.real_lead_ccom + r.real_lead_d2or + r.real_lead_mpsh + r.real_lead_ofls,
    pu: t.pu + r.purchase_ccom,
  }), { spend: 0, pv: 0, vo: 0, rl: 0, pu: 0 })

  // Target = META global average; capped at the hard limit if global avg exceeds it
  const globalCostVO  = tot.vo > 0 ? tot.spend / tot.vo : 0            // META avg Cost / View Offer
  const effectiveCPRL = Math.min(cprlTarget, tot.rl > 0 ? tot.spend / tot.rl : Infinity)
  const effectiveCPA  = Math.min(cpaTarget,  tot.pu > 0 ? tot.spend / tot.pu : Infinity)

  const rows = metaRows.map(r => {
    const rl = r.real_lead_ccom + r.real_lead_d2or + r.real_lead_mpsh + r.real_lead_ofls
    const fl = mapFunnel(r.funnel)
    let metricName = '', targetValue = 0, actual: number | null = null
    // ToFU: target = META-wide avg Cost/ViewOffer; actual = campaign Cost/ViewOffer
    if (fl === 'ToFU00')      { metricName = 'Cost / View Offer'; targetValue = globalCostVO;    actual = r.ga4_view_offer > 0 ? r.ad_spend / r.ga4_view_offer : null }
    else if (fl === 'MoFU25') { metricName = 'CPRL';    targetValue = effectiveCPRL; actual = rl > 0 ? r.ad_spend / rl : null }
    else if (fl === 'BoFU50') { metricName = 'CPA CC';  targetValue = effectiveCPA;  actual = r.purchase_ccom > 0 ? r.ad_spend / r.purchase_ccom : null }
    else if (fl === 'BoFU75') { metricName = 'CPRL';    targetValue = effectiveCPRL; actual = rl > 0 ? r.ad_spend / rl : null }
    else return null
    const gap = actual !== null && actual > 0 ? (targetValue / actual) - 1 : null
    return { name: r.campaign_name, fl, metricName, targetValue, actual, gap }
  }).filter(Boolean) as { name: string; fl: FunnelLevel; metricName: string; targetValue: number; actual: number | null; gap: number | null }[]


  rows.sort((a, b) => {
    const ord: Record<FunnelLevel, number> = { ToFU00: 0, MoFU25: 1, BoFU50: 2, BoFU75: 3, Unknown: 9 }
    return ord[a.fl] !== ord[b.fl] ? ord[a.fl] - ord[b.fl] : (a.gap ?? -99) - (b.gap ?? -99)
  })

  const F = { fontFamily: 'Inter, system-ui, sans-serif' }

  if (rows.length === 0) return <div style={{ color: 'rgba(255,255,255,0.25)', fontSize: 11, padding: '8px 0', ...F }}>No Meta campaigns found.</div>

  return (
    <div style={{ overflowX: 'auto', marginTop: 16 }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, ...F }}>
        <thead>
          <tr>
            {['Campaign', 'Metric', 'Target', 'Actual', 'Gap'].map(h => (
              <th key={h} style={{
                textAlign: h === 'Campaign' ? 'left' : 'right',
                padding: '4px 10px 8px', fontWeight: 700, fontSize: 11,
                letterSpacing: '0.08em', color: 'rgba(255,255,255,0.35)',
                textTransform: 'uppercase', whiteSpace: 'nowrap',
                borderBottom: '1px solid rgba(255,255,255,0.07)',
              }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => {
            const gc = row.gap === null ? 'rgba(255,255,255,0.25)'
              : row.gap >= 0.1 ? '#34d399' : row.gap >= 0 ? '#fbbf24' : row.gap >= -0.1 ? '#f97316' : '#f87171'
            const gt = row.gap !== null ? `${row.gap >= 0 ? '+' : ''}${(row.gap * 100).toFixed(1)}%` : '—'
            const fc = FUNNEL_CLR[row.fl]
            return (
              <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                <td style={{ padding: '6px 10px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'rgba(255,255,255,0.85)' }}>{row.name}</td>
                <td style={{ padding: '6px 10px', textAlign: 'right', color: 'rgba(255,255,255,0.6)', whiteSpace: 'nowrap' }}>{row.metricName}</td>
                <td style={{ padding: '6px 10px', textAlign: 'right', color: 'rgba(255,255,255,0.4)', whiteSpace: 'nowrap' }}>{fmtIDR(row.targetValue)}</td>
                <td style={{ padding: '6px 10px', textAlign: 'right', color: row.actual !== null ? '#fff' : 'rgba(255,255,255,0.25)', whiteSpace: 'nowrap' }}>{row.actual !== null ? fmtIDR(row.actual) : '—'}</td>
                <td style={{ padding: '6px 10px', textAlign: 'right', color: gc, fontWeight: 700, whiteSpace: 'nowrap' }}>{gt}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// \u2500\u2500 Main card \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
export function SkuPerformanceCard({
  sku, skuLabel, productName, skuColor, imageSrc,
  from, to,
  totalCtr, totalLpvo, totalVo2l, totalCprl, totalCpaCC,
  ctrSeries, lpvoSeries, vo2lSeries, cprlSeries, cpaSeries,
  globalCtrAvg, globalLpvoAvg, globalVo2lAvg,
  cprlTarget = 150_000,
  cpaTarget  = 5_000_000,
  changelog  = [],
  campaignBreakdown = [],
  skuSpend             = 0,
  skuPeriodBudget      = 0,
  skuDailyBudget       = 0,
  skuTargetDailyBudget = 0,
  budgetDate,
  totalAllPlatformsSpend,
  totalRoas   = 0,
  roasTarget  = 6.59,
  roasLabel   = 'Total RoAS',
}: SkuPerformanceCardProps) {
  const label = skuLabel ?? sku
  const [open, setOpen] = useState(false)

  // SKU-level changelog: entries that match this SKU specifically,
  // OR have no SKU set (applies to all SKUs). Trim to guard against whitespace.
  const skuChangelog = changelog.filter(c => {
    const entrySku = (c.sku ?? '').trim()
    return entrySku === '' || entrySku === sku
  })

  const divPct = (val: number, tgt: number) =>
    tgt > 0 ? Math.abs((val - tgt) / tgt * 100) : 0

  // Chart descriptor type
  type ChartDef = {
    key: string; label: string; color: string
    series: { date: string; value: number }[]
    higherIsBetter: boolean; fixedTarget: number
    metricValue: string; metricSub: string
    statusLabel: string | null; statusGood: boolean; divergencePct: number
    fmt: (v: number) => string; fmtShort: (v: number) => string
    targetFontSize?: number
  }

  const mkRpFmt = (v: number) => v >= 1_000_000
    ? 'Rp ' + (v / 1_000_000).toFixed(1) + 'M'
    : 'Rp ' + (v / 1_000).toFixed(0) + 'K'

  // Top row: CPRL + CPA CC
  const topCharts: ChartDef[] = [
    {
      key: `${sku}-cprl`, label: 'CPRL', color: '#818cf8',
      series: cprlSeries, higherIsBetter: false, fixedTarget: cprlTarget,
      metricValue:   totalCprl  > 0 ? fmtRp(Math.round(totalCprl))  : '\u2014',
      metricSub:     `Target ${fmtShortRp(cprlTarget)}`,
      statusLabel:   totalCprl  > 0 ? (totalCprl  <= cprlTarget ? 'On Target' : 'Off Target') : null,
      statusGood:    totalCprl  <= cprlTarget,
      divergencePct: totalCprl  > 0 ? divPct(totalCprl,  cprlTarget) : 0,
      fmt:      (v) => fmtRp(Math.round(v)),
      fmtShort: (v) => mkRpFmt(v),
      targetFontSize: 12,
    },
    {
      key: `${sku}-cpa`, label: 'CPA CC', color: '#f472b6',
      series: cpaSeries, higherIsBetter: false, fixedTarget: cpaTarget,
      metricValue:   totalCpaCC > 0 ? fmtRp(Math.round(totalCpaCC)) : '\u2014',
      metricSub:     `Target ${fmtShortRp(cpaTarget)}`,
      statusLabel:   totalCpaCC > 0 ? (totalCpaCC <= cpaTarget  ? 'On Target' : 'Off Target') : null,
      statusGood:    totalCpaCC <= cpaTarget,
      divergencePct: totalCpaCC > 0 ? divPct(totalCpaCC, cpaTarget)  : 0,
      fmt:      (v) => fmtRp(Math.round(v)),
      fmtShort: (v) => mkRpFmt(v),
      targetFontSize: 12,
    },
    {
      key: `${sku}-roas`, label: roasLabel, color: '#fbbf24',
      series: [], higherIsBetter: true, fixedTarget: roasTarget,
      metricValue:   totalRoas > 0 ? totalRoas.toFixed(2) + '\u00d7' : '\u2014',
      metricSub:     `Target ${roasTarget}\u00d7`,
      statusLabel:   totalRoas > 0 ? (totalRoas >= roasTarget ? 'On Target' : totalRoas >= roasTarget * 0.9 ? 'Slightly Below' : 'Off Target') : null,
      statusGood:    totalRoas >= roasTarget,
      divergencePct: totalRoas > 0 ? divPct(totalRoas, roasTarget) : 0,
      fmt:      (v) => v.toFixed(2) + '\u00d7',
      fmtShort: (v) => v.toFixed(1) + '\u00d7',
    },
  ]

  // Collapsible row: CTR + LPVO + VO2L
  const detailCharts: ChartDef[] = [
    {
      key: `${sku}-ctr`, label: 'CTR', color: '#34d399',
      series: ctrSeries, higherIsBetter: true, fixedTarget: globalCtrAvg,
      metricValue:   totalCtr  > 0 ? fmtPct(totalCtr)  : '\u2014',
      metricSub:     'click-through rate',
      statusLabel:   totalCtr  > 0 ? (totalCtr  >= globalCtrAvg  ? 'Above Average' : 'Below Average') : null,
      statusGood:    totalCtr  >= globalCtrAvg,
      divergencePct: totalCtr  > 0 ? divPct(totalCtr,  globalCtrAvg) : 0,
      fmt:      (v) => fmtPct(v),
      fmtShort: (v) => v.toFixed(1) + '%',
      targetFontSize: 18,
    },
    {
      key: `${sku}-lpvo`, label: 'LPVO', color: '#22d3ee',
      series: lpvoSeries, higherIsBetter: true, fixedTarget: globalLpvoAvg,
      metricValue:   totalLpvo > 0 ? fmtPct(totalLpvo) : '\u2014',
      metricSub:     'offer view / LP view',
      statusLabel:   totalLpvo > 0 ? (totalLpvo >= globalLpvoAvg ? 'Above Average' : 'Below Average') : null,
      statusGood:    totalLpvo >= globalLpvoAvg,
      divergencePct: totalLpvo > 0 ? divPct(totalLpvo, globalLpvoAvg) : 0,
      fmt:      (v) => fmtPct(v),
      fmtShort: (v) => v.toFixed(1) + '%',
      targetFontSize: 18,
    },
    {
      key: `${sku}-vo2l`, label: 'VO2L', color: '#a78bfa',
      series: vo2lSeries, higherIsBetter: true, fixedTarget: globalVo2lAvg,
      metricValue:   totalVo2l > 0 ? fmtPct(totalVo2l) : '\u2014',
      metricSub:     'real lead / view offer',
      statusLabel:   totalVo2l > 0 ? (totalVo2l >= globalVo2lAvg ? 'Above Average' : 'Below Average') : null,
      statusGood:    totalVo2l >= globalVo2lAvg,
      divergencePct: totalVo2l > 0 ? divPct(totalVo2l, globalVo2lAvg) : 0,
      fmt:      (v) => fmtPct(v),
      fmtShort: (v) => v.toFixed(1) + '%',
      targetFontSize: 18,
    },
  ]

  const ChartCol = ({ c, borderLeft }: { c: ChartDef; borderLeft?: boolean }) => {
    const isGood = c.statusGood
    const isWarn = !isGood && c.divergencePct < 10
    const clr = isGood ? '#34d399' : isWarn ? '#fbbf24' : '#f87171'
    const bg  = isGood ? 'rgba(52,211,153,0.12)' : isWarn ? 'rgba(251,191,36,0.12)' : 'rgba(248,113,113,0.12)'
    const bdr = isGood ? 'rgba(52,211,153,0.28)' : isWarn ? 'rgba(251,191,36,0.28)' : 'rgba(248,113,113,0.28)'
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
          </div>
          <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: '-0.04em', color: '#fff', lineHeight: 1, whiteSpace: 'nowrap' }}>
            {c.metricValue}
          </div>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.65)', letterSpacing: '0.05em', textTransform: 'uppercase' as const, marginTop: 4 }}>
            {c.metricSub}
          </div>
          {c.statusLabel && (
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 3,
              marginTop: 5, padding: '2px 6px', borderRadius: 20,
              background: bg, border: `1px solid ${bdr}`,
              fontSize: 10, fontWeight: 700, color: clr, whiteSpace: 'nowrap' as const,
            }}>
              {isGood ? '\u2191' : '\u2193'} {c.statusLabel} &middot; {c.divergencePct.toFixed(1)}%
            </div>
          )}
        </div>
        {/* Sparkline */}
        <Sparkline
          data={c.series} changelog={changelog} filterSku={sku}
          color={c.color} fmt={c.fmt} fmtShort={c.fmtShort}
          chartKey={c.key} higherIsBetter={c.higherIsBetter}
          fixedTarget={c.fixedTarget}
          targetFontSize={c.targetFontSize}
        />
      </div>
    )
  }

  return (
    <div style={{
      background: 'rgba(255,255,255,0.04)',
      border: '1px solid rgba(255,255,255,0.09)',
      borderRadius: 14, padding: '20px 22px',
      fontFamily: 'Inter, system-ui, sans-serif',
      display: 'flex', flexDirection: 'column',
    }}>

      {/* ── MAIN ROW: Image | Right content ── */}
      <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'stretch', gap: 0 }}>

        {/* Image + product identity */}
        <div style={{
          flex: '0 0 120px', display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', textAlign: 'center',
          paddingRight: 16, borderRight: '1px solid rgba(255,255,255,0.09)', marginRight: 18,
        }}>
          {imageSrc
            ? <img src={imageSrc} alt={productName ?? label} style={{ width: '100%', height: 'auto', display: 'block', borderRadius: 10, marginBottom: 8 }} />
            : <div style={{ width: '100%', aspectRatio: '1/1', borderRadius: 10, marginBottom: 8, background: `${skuColor}22`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ fontSize: 20, fontWeight: 800, color: skuColor }}>{label}</span>
              </div>
          }
          {productName && (
            <div style={{ fontSize: 11, fontWeight: 800, color: '#fff', lineHeight: 1.2, marginBottom: 3 }}>{productName}</div>
          )}
          <div style={{ fontSize: 9, fontWeight: 600, color: 'rgba(255,255,255,0.5)', letterSpacing: '0.07em' }}>{label}</div>
        </div>

        {/* Right content */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* Ad Spend Health + Daily Budget */}
          {skuSpend > 0 && (() => {
            const rawPct = skuPeriodBudget > 0 ? (skuSpend / skuPeriodBudget) * 100 : 0
            const barPct = Math.min(rawPct, 100)
            const spColor = rawPct === 0  ? '#818cf8'
              : rawPct >  115 ? '#f87171'
              : rawPct >= 105 ? '#fbbf24'
              : rawPct >=  95 ? '#34d399'
              : rawPct >=  85 ? '#fbbf24'
              :                 '#f87171'
            const spLabel = rawPct === 0  ? 'No Data'
              : rawPct >  115 ? '🔴 Over Budget'
              : rawPct >= 105 ? '🟡 Slightly Over'
              : rawPct >=  95 ? '🟢 On Track'
              : rawPct >=  85 ? '🟡 Slightly Under'
              :                 '🔴 Far Behind'
            const delta    = skuDailyBudget > 0 ? skuDailyBudget - skuTargetDailyBudget : 0
            const deltaPct = skuTargetDailyBudget > 0 ? (delta / skuTargetDailyBudget) * 100 : null
            return (
              <div style={{ display: 'flex', flexDirection: 'row', gap: 20, alignItems: 'flex-start', flexWrap: 'wrap' as const }}>
                {/* Ad Spend Health */}
                <div style={{ flex: '1 1 auto' }}>
                  <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', color: 'rgba(255,255,255,0.50)', textTransform: 'uppercase' as const, marginBottom: 4 }}>
                    Ad Spend Health
                  </div>
                  <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: '-0.04em', color: '#fff', lineHeight: 1, marginBottom: 10 }}>
                    {fmtRp(Math.round(skuSpend))}
                  </div>
                  {skuPeriodBudget > 0 && (
                    <>
                      <div style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.5)', letterSpacing: '0.05em', textTransform: 'uppercase' as const, marginBottom: 5 }}>
                        Target {fmtRp(Math.round(skuPeriodBudget))}
                      </div>
                      <div style={{ height: 4, background: 'rgba(255,255,255,0.1)', borderRadius: 3, marginBottom: 6 }}>
                        <div style={{ height: '100%', width: `${barPct}%`, background: spColor, borderRadius: 3, transition: 'width 0.5s ease' }} />
                      </div>
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4,
                        background: `${spColor}15`, border: `1px solid ${spColor}30`,
                        borderRadius: 5, padding: '2px 6px' }}>
                        <div style={{ width: 4, height: 4, borderRadius: '50%', background: spColor }} />
                        <span style={{ fontSize: 11, fontWeight: 700, color: spColor }}>{spLabel}</span>
                        <span style={{ fontSize: 11, color: spColor, opacity: 0.8 }}>{rawPct.toFixed(1)}%</span>
                      </div>
                    </>
                  )}
                  {!skuPeriodBudget && totalAllPlatformsSpend != null && totalAllPlatformsSpend > 0 && (() => {
                    const sharePct = (skuSpend / totalAllPlatformsSpend) * 100
                    return (
                      <>
                        <div style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.45)', letterSpacing: '0.05em', textTransform: 'uppercase' as const, marginBottom: 5 }}>
                          of {fmtRp(Math.round(totalAllPlatformsSpend))} total
                        </div>
                        <div style={{ height: 4, background: 'rgba(255,255,255,0.08)', borderRadius: 3, marginBottom: 6 }}>
                          <div style={{ height: '100%', width: `${sharePct}%`, background: skuColor, borderRadius: 3, transition: 'width 0.5s ease' }} />
                        </div>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4,
                          background: `${skuColor}15`, border: `1px solid ${skuColor}30`,
                          borderRadius: 5, padding: '2px 6px' }}>
                          <div style={{ width: 4, height: 4, borderRadius: '50%', background: skuColor }} />
                          <span style={{ fontSize: 11, fontWeight: 700, color: skuColor }}>{sharePct.toFixed(1)}%</span>
                          <span style={{ fontSize: 11, color: skuColor, opacity: 0.8 }}>of total spend</span>
                        </div>
                      </>
                    )
                  })()}
                </div>

                {/* Daily Budget Config */}
                {skuDailyBudget > 0 && (
                  <div style={{ flex: '1 1 auto' }}>
                    <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', color: 'rgba(255,255,255,0.50)', textTransform: 'uppercase' as const, marginBottom: 4 }}>
                      Daily Budget
                    </div>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginBottom: 3 }}>
                      <span style={{ fontSize: 18, fontWeight: 800, letterSpacing: '-0.04em', color: '#fff' }}>
                        {fmtRp(Math.round(skuDailyBudget))}
                      </span>
                      {skuTargetDailyBudget > 0 && (
                        <>
                          <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.3)', fontWeight: 600 }}>/</span>
                          <span style={{ fontSize: 15, fontWeight: 700, color: 'rgba(255,255,255,0.6)' }}>
                            {fmtRp(Math.round(skuTargetDailyBudget))}
                          </span>
                        </>
                      )}
                    </div>
                    {totalAllPlatformsSpend != null && skuTargetDailyBudget > 0 ? (() => {
                      // Platform context: show share of total daily budget
                      const sharePct = (skuDailyBudget / skuTargetDailyBudget) * 100
                      return (
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4,
                          background: `${skuColor}15`, border: `1px solid ${skuColor}30`,
                          borderRadius: 5, padding: '2px 6px' }}>
                          <div style={{ width: 4, height: 4, borderRadius: '50%', background: skuColor }} />
                          <span style={{ fontSize: 11, fontWeight: 700, color: skuColor }}>{sharePct.toFixed(1)}%</span>
                          <span style={{ fontSize: 11, color: skuColor, opacity: 0.8 }}>of total</span>
                        </div>
                      )
                    })() : deltaPct !== null && (() => {
                      // SKU context: show above/below target
                      const absDelta = Math.abs(deltaPct)
                      const dClr = absDelta <= 5 ? '#34d399' : absDelta <= 10 ? '#fbbf24' : '#f87171'
                      return (
                        <div style={{ fontSize: 11, fontWeight: 600, color: dClr }}>
                          {delta < 0 ? '▼' : '▲'} {absDelta.toFixed(1)}% {delta < 0 ? 'below' : 'above'} target
                        </div>
                      )
                    })()}
                    {budgetDate && (
                      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginTop: 2 }}>as of {budgetDate}</div>
                    )}
                  </div>
                )}
              </div>
            )
          })()}

          {/* 3 Metric columns: CPRL | CPA CC | RoAS */}
          <div style={{ display: 'flex', flexDirection: 'row', gap: 0 }}>
            {topCharts.map((c, idx) => {
              const vals = c.series.map(p => p.value).filter(v => v > 0)
              const n = vals.length
              let slopeRaw = 0
              if (n >= 3) {
                const mX  = (n - 1) / 2
                const avg = vals.reduce((s, v) => s + v, 0) / n
                slopeRaw = vals.reduce((s, v, i) => s + (i - mX) * (v - avg), 0) /
                           vals.reduce((s, _, i) => s + (i - mX) ** 2, 1)
              }
              const target = c.fixedTarget || 1
              const slopePctPerDay = c.higherIsBetter
                ? (slopeRaw / target) * 100
                : -(slopeRaw / target) * 100
              const isGood     = c.statusGood
              const isWarn     = !isGood && c.divergencePct <= 10
              const clr        = isGood ? '#34d399' : isWarn ? '#fbbf24' : '#f87171'
              const bg         = isGood ? 'rgba(52,211,153,0.10)' : isWarn ? 'rgba(251,191,36,0.10)' : 'rgba(248,113,113,0.10)'
              const bdr        = isGood ? 'rgba(52,211,153,0.25)' : isWarn ? 'rgba(251,191,36,0.25)' : 'rgba(248,113,113,0.25)'
              const trendGood  = slopePctPerDay > 0
              const trendClr   = trendGood ? '#34d399' : '#f87171'
              const strengthLabel = Math.abs(slopePctPerDay) > 3 ? 'Strong'
                                  : Math.abs(slopePctPerDay) > 0.5 ? 'Weak'
                                  : 'Flat'
              return (
                <div key={c.key} style={{
                  flex: 1, display: 'flex', flexDirection: 'column', gap: 4,
                  paddingLeft: idx > 0 ? 14 : 0,
                  borderLeft: idx > 0 ? '1px solid rgba(255,255,255,0.07)' : 'none',
                  marginLeft: idx > 0 ? 14 : 0,
                }}>
                  {/* Metric label */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <div style={{ width: 5, height: 5, borderRadius: '50%', background: c.color }} />
                    <span style={{ fontSize: 10, fontWeight: 700, color: c.color, letterSpacing: '0.08em', textTransform: 'uppercase' as const }}>{c.label}</span>
                  </div>
                  {/* Value */}
                  <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: '-0.04em', color: '#fff', lineHeight: 1 }}>
                    {c.metricValue}
                  </div>
                  {/* On/Off Target badge with off-target % */}
                  {c.statusLabel && (
                    <div style={{
                      display: 'inline-flex', alignItems: 'center', gap: 3,
                      padding: '2px 6px', borderRadius: 20,
                      background: bg, border: `1px solid ${bdr}`,
                      fontSize: 10, fontWeight: 700, color: clr, width: 'fit-content',
                    }}>
                      {isGood ? '●' : '○'} {c.statusLabel}{c.divergencePct > 0 ? ` · ${c.divergencePct.toFixed(0)}%` : ''}
                    </div>
                  )}
                  {/* Trend flag with strength */}
                  {n >= 3 && (
                    <div style={{
                      display: 'inline-flex', alignItems: 'center', gap: 3,
                      padding: '2px 6px', borderRadius: 20,
                      background: `${trendClr}10`, border: `1px solid ${trendClr}25`,
                      fontSize: 10, fontWeight: 700, color: trendClr, width: 'fit-content',
                    }}>
                      {slopeRaw > 0 ? '↗' : '↘'} {strengthLabel} {Math.abs(slopePctPerDay).toFixed(1)}%/d
                    </div>
                  )}
                </div>
              )
            })}

          </div>

          {/* Scale-Up Readiness */}
          {(() => {
            // Require at least 14 days of data for meaningful readiness signal
            const cprlDataPoints = topCharts[0].series.filter(p => p.value > 0).length
            if (cprlDataPoints < 14) {
              const daysLeft = 14 - cprlDataPoints
              return (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '7px 11px', borderRadius: 9,
                  background: 'rgba(129,140,248,0.10)', border: '1px solid rgba(129,140,248,0.25)',
                }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 800, color: '#818cf8', letterSpacing: '-0.02em' }}>📊 Not Enough Data</div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: 'rgba(129,140,248,0.75)', letterSpacing: '0.03em', textTransform: 'uppercase' as const, marginTop: 1, lineHeight: 1.4 }}>
                      Minimum 14 days of available data needed for this feature
                    </div>
                  </div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: '#818cf8', opacity: 0.5 }}>{cprlDataPoints}/14</div>
                </div>
              )
            }
            // Compute rich scores: onTarget, offPct, convergence strength
            const labels = ['CPRL', 'CPA CC', 'RoAS'] as const
            const scores = topCharts.map((c, idx) => {
              const vals = c.series.map(p => p.value).filter(v => v > 0)
              const n = vals.length
              let slopeRaw = 0
              if (n >= 3) {
                const mX  = (n - 1) / 2
                const avg = vals.reduce((s, v) => s + v, 0) / n
                slopeRaw = vals.reduce((s, v, i) => s + (i - mX) * (v - avg), 0) /
                           vals.reduce((s, _, i) => s + (i - mX) ** 2, 1)
              }
              // Normalize slope: % of target per day (positive = moving toward target)
              const target = c.fixedTarget || 1
              const slopePctPerDay = c.higherIsBetter
                ? (slopeRaw / target) * 100        // higher is better: positive slope = converging
                : -(slopeRaw / target) * 100        // lower is better:  negative slope = converging
              // Off-target %: positive = bad (above target for cost, below for RoAS)
              const offPct = c.divergencePct
              const onTarget = c.statusGood
              // Convergence tiers
              const convStrength = slopePctPerDay > 3 ? 'strong' as const
                                 : slopePctPerDay > 0.5 ? 'weak' as const
                                 : slopePctPerDay > -0.5 ? 'flat' as const
                                 : 'diverging' as const
              return { label: labels[idx], onTarget, offPct, slopePctPerDay, convStrength, hasTrend: n >= 3 }
            })

            const cprl  = scores[0]
            const cpaCC = scores[1]
            const roas  = scores[2]

            // Build detail flags shown on the sublabel
            const cprlOff  = cprl.onTarget ? '' : `CPRL +${cprl.offPct.toFixed(0)}% off`
            const cprlConv = cprl.hasTrend
              ? `${Math.abs(cprl.slopePctPerDay).toFixed(1)}%/d ${cprl.slopePctPerDay >= 0 ? '↘' : '↗'}`
              : ''

            let rLabel: string, sublabelStats: string, sublabelMsg: string, color: string, glow: string

            const cprlStr = cprl.convStrength === 'strong' ? 'strong convergence' : 'steady'

            // ── Branch 1: All green → Scale Up
            if (cprl.onTarget && (cprl.convStrength === 'strong' || cprl.convStrength === 'weak') && roas.onTarget && cpaCC.onTarget) {
              rLabel = '🚀 Scale Up Budget'
              sublabelStats = `CPRL on target · RoAS on target · CPA CC healthy`
              sublabelMsg = `Increase daily budget 20–30% and monitor CPRL closely`
              color = '#34d399'; glow = 'rgba(52,211,153,0.15)'

            // ── Branch 2: CPRL ✅ + RoAS ✅ + CPA CC ❌ → Scale Up Potential?
            } else if (cprl.onTarget && (cprl.convStrength === 'strong' || cprl.convStrength === 'weak') && roas.onTarget && !cpaCC.onTarget) {
              rLabel = '⚡ Scale Up Potential?'
              sublabelStats = `CPRL on target · RoAS on target · CPA CC +${cpaCC.offPct.toFixed(0)}% off`
              sublabelMsg = `Produce more Bottom Funnel creatives — CPRL + RoAS are solid`
              color = '#34d399'; glow = 'rgba(52,211,153,0.10)'

            // ── Branch 3: CPRL ✅ + RoAS ❌ + CPA CC ✅ → Hold — RoAS Lagging
            } else if (cprl.onTarget && (cprl.convStrength === 'strong' || cprl.convStrength === 'weak') && !roas.onTarget && cpaCC.onTarget) {
              rLabel = '⚡ Hold — RoAS Lagging'
              sublabelStats = `CPRL on target · CPA CC healthy · RoAS ${roas.offPct.toFixed(0)}% below`
              sublabelMsg = `Produce more Bottom Funnel creatives — push purchase intent`
              color = '#fbbf24'; glow = 'rgba(251,191,36,0.12)'

            // ── Branch 4: CPRL ✅ + RoAS ❌ + CPA CC ❌ → Hold — Both Lagging
            } else if (cprl.onTarget && (cprl.convStrength === 'strong' || cprl.convStrength === 'weak') && !roas.onTarget && !cpaCC.onTarget) {
              rLabel = '⚡ Hold — RoAS & CPA CC Lagging'
              sublabelStats = `CPRL on target · RoAS ${roas.offPct.toFixed(0)}% off · CPA CC +${cpaCC.offPct.toFixed(0)}% off`
              sublabelMsg = `Produce more Bottom Funnel creatives — top funnel is working`
              color = '#fbbf24'; glow = 'rgba(251,191,36,0.12)'

            // ── Branch 5: CPRL on target but flat/diverging → Caution
            } else if (cprl.onTarget && (cprl.convStrength === 'flat' || cprl.convStrength === 'diverging')) {
              const drift = cprl.convStrength === 'diverging'
                ? `diverging ${Math.abs(cprl.slopePctPerDay).toFixed(1)}%/day`
                : 'trend is flat'
              rLabel = '⚠️ Caution — CPRL Drifting'
              sublabelStats = `CPRL on target · trend ${drift}`
              sublabelMsg = `Test new creatives before any budget changes`
              color = '#fb923c'; glow = 'rgba(251,146,60,0.12)'

            // ── Branch 6: CPRL off target but recovering
            } else if (!cprl.onTarget && (cprl.convStrength === 'strong' || cprl.convStrength === 'weak')) {
              const speed = cprl.convStrength === 'strong' ? 'strong' : 'slow'
              rLabel = cprl.convStrength === 'strong' ? '⚠️ Recovering — Almost There' : '⚠️ Recovering — Slowly'
              sublabelStats = `CPRL +${cprl.offPct.toFixed(0)}% off · ${speed} recovery (${Math.abs(cprl.slopePctPerDay).toFixed(1)}%/day)`
              sublabelMsg = `Test new creative hooks to accelerate convergence`
              color = '#fb923c'; glow = 'rgba(251,146,60,0.12)'

            // ── Branch 7: CPRL off target, flat
            } else if (!cprl.onTarget && cprl.convStrength === 'flat') {
              rLabel = '🔧 Stalled — CPRL Stuck'
              sublabelStats = `CPRL +${cprl.offPct.toFixed(0)}% off · no improvement trend`
              sublabelMsg = `Replace underperforming creatives — test new hooks and angles`
              color = '#f87171'; glow = 'rgba(248,113,113,0.12)'

            } else {
              // Branch 8: CPRL off target and diverging
              rLabel = '🔧 Optimize Ads First'
              sublabelStats = `CPRL +${cprl.offPct.toFixed(0)}% off · diverging ${Math.abs(cprl.slopePctPerDay).toFixed(1)}%/day`
              sublabelMsg = `Pause weakest ad sets and test fresh creatives immediately`
              color = '#f87171'; glow = 'rgba(248,113,113,0.12)'
            }

            // Dot color based on convergence strength
            const dotColor = (s: typeof scores[0]) =>
              s.onTarget && (s.convStrength === 'strong' || s.convStrength === 'weak') ? '#34d399'
              : s.onTarget && s.convStrength === 'flat' ? '#a3e635'
              : s.onTarget && s.convStrength === 'diverging' ? '#fbbf24'
              : !s.onTarget && (s.convStrength === 'strong') ? '#fbbf24'
              : !s.onTarget && (s.convStrength === 'weak') ? '#fb923c'
              : '#f87171'

            return (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '7px 11px', borderRadius: 9,
                background: glow, border: `1px solid ${color}30`,
              }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 800, color, letterSpacing: '-0.02em' }}>{rLabel}</div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: `${color}99`, letterSpacing: '0.01em', marginTop: 2, lineHeight: 1.3 }}>{sublabelStats}</div>
                  <div style={{ fontSize: 12, fontWeight: 500, color: `${color}cc`, marginTop: 2, lineHeight: 1.4 }}>{sublabelMsg}</div>
                </div>
              </div>
            )
          })()}



        </div> {/* right content */}
      </div> {/* main row */}

      {/* ── COLLAPSIBLE TOGGLE ── */}
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          all: 'unset', display: 'flex', alignItems: 'center', gap: 8,
          cursor: 'pointer', marginTop: 16, paddingTop: 12,
          borderTop: '1px solid rgba(255,255,255,0.09)', width: '100%',
        }}
      >
        <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', color: 'rgba(255,255,255,0.48)', textTransform: 'uppercase' }}>
          {open ? 'Hide details' : 'CTR · LPVO · VO2L · Campaigns'}
        </span>
        <svg
          width="12" height="12" viewBox="0 0 24 24"
          fill="none" stroke="rgba(255,255,255,0.40)" strokeWidth="2.5"
          strokeLinecap="round" strokeLinejoin="round"
          style={{
            marginLeft: 'auto', flexShrink: 0,
            transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 0.2s ease',
          }}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {/* ── COLLAPSIBLE BODY ── */}
      <div style={{ overflow: 'hidden', maxHeight: open ? '3000px' : '0', transition: 'max-height 0.3s ease' }}>

        {/* CPRL + CPA CC charts */}
        <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'stretch',
          paddingTop: 14, marginTop: 14,
          borderTop: '1px solid rgba(255,255,255,0.09)',
        }}>
          {topCharts.filter(c => c.series.length > 0).map((c, i) => <ChartCol key={c.key} c={c} borderLeft={i > 0} />)}
        </div>

        {/* ── AD SPEND HEALTH moved to main card ── */}

        {/* CTR + LPVO + VO2L row */}
        <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'stretch',
          paddingTop: 14, marginTop: 14,
          borderTop: '1px solid rgba(255,255,255,0.09)',
        }}>
          {detailCharts.map((c, i) => <ChartCol key={c.key} c={c} borderLeft={i > 0} />)}
        </div>

        {/* Campaign evaluator */}
        {campaignBreakdown.length > 0 && (
          <div style={{ marginTop: 18, paddingTop: 14, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
            <div style={{ fontSize: 14, fontWeight: 800, letterSpacing: '-0.01em', color: 'rgba(255,255,255,0.90)', marginBottom: 2 }}>
              Campaign Evaluator · Meta Ads
            </div>
            <CampaignEvaluator data={campaignBreakdown} cprlTarget={cprlTarget} cpaTarget={cpaTarget} />
          </div>
        )}

      </div>

    </div>
  )
}

