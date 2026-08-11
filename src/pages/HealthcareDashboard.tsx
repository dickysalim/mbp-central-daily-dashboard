/**
 * HealthcareDashboard — MCI Dashboard
 *
 * Uses the same /v2/consumer-goods endpoint as Consumer Goods.
 * MCI funnel: form_submission → form_conversion (no real leads / purchases).
 */
import { useState, useMemo, useEffect, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { D1_WORKER_URL } from '../config/dataSource'
import { dateStr, capToH2, PRESETS } from './ProductPerformancePage'
import { fmtRp, fmtRpM } from '../utils/format'
import { skuColor } from '../utils/skuColors'
import { ChangelogModal } from '../components/ChangelogModal'
import { ChangelogTooltip } from '../components/ChangelogTooltip'
import { AtlPerformanceCard } from '../components/cards/AtlPerformanceCard'
import type { ChangelogRow } from '../types/changelog'

// ── Types ───────────────────────────────────────────────────────────────────
interface BrandBounds { brand: string; earliest: string; latest: string; skus: string[] }

interface ConsumerGoodsData {
  performance: { date: string; traffic_source: string; sku: string; ad_spend: number; impressions: number; link_click: number }[]
  campaign_budgets: { date: string; traffic_source: string; campaign_name: string; daily_budget: number; sku: string }[]
  targets: { date: string; sku: string; daily_ad_spend: number }[]
  conversions: { date: string; traffic_source: string; sku: string; mongo_form_submission: number; mongo_form_conversion: number }[]
  form_by_branch: { branch: string; form_submission: number; form_conversion: number }[]
  changelog: unknown[]
  sales: unknown[]
  ga4: { date: string; traffic_source: string; sku: string; ads_platform_campaign_id: string; ga4_first_visit: number; ga4_page_view: number; ga4_view_offer: number }[]
  campaign_dimension: unknown[]
}

// ── MCI SKU colors ──────────────────────────────────────────────────────────
const MCI_SKU_COLORS: Record<string, string> = {
  CEK: '#34d399',   // emerald
  A1C: '#38bdf8',   // sky
  WCA: '#a78bfa',   // violet
}
function mciSkuColor(sku: string): string {
  return MCI_SKU_COLORS[sku] ?? skuColor(sku)
}

// ── Branch (Cabang) colors ──────────────────────────────────────────────────
const BRANCH_COLORS = ['#34d399', '#38bdf8', '#a78bfa', '#fb923c', '#f87171', '#fbbf24', '#818cf8', '#e879f9']
function branchColor(idx: number): string {
  return BRANCH_COLORS[idx % BRANCH_COLORS.length]
}

// ── SVG Donut Pie with side legend ──────────────────────────────────────────
function DonutPie({ slices, title }: {
  slices: { label: string; value: number; color: string }[]
  title: string
}) {
  const total = slices.reduce((s, d) => s + d.value, 0)
  if (total === 0) return null

  const CX = 70, CY = 70, R = 58, INNER = 36
  let cumAngle = -Math.PI / 2

  const arcs = slices.map(s => {
    const frac = s.value / total
    const start = cumAngle
    const end = start + frac * 2 * Math.PI
    cumAngle = end
    return { ...s, frac, start, end }
  })

  function arcPath(r: number, start: number, end: number, inner: number) {
    if (Math.abs(end - start) < 0.001) return ''
    const gap = 0.03
    const s = start + gap / 2, e = end - gap / 2
    if (e <= s) return ''
    const x1 = CX + r * Math.cos(s), y1 = CY + r * Math.sin(s)
    const x2 = CX + r * Math.cos(e), y2 = CY + r * Math.sin(e)
    const ix1 = CX + inner * Math.cos(e), iy1 = CY + inner * Math.sin(e)
    const ix2 = CX + inner * Math.cos(s), iy2 = CY + inner * Math.sin(s)
    const large = e - s > Math.PI ? 1 : 0
    return `M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} L ${ix1} ${iy1} A ${inner} ${inner} 0 ${large} 0 ${ix2} ${iy2} Z`
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {/* Title above */}
      <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase' }}>{title}</div>
      {/* Pie + Legend row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        {/* Pie */}
        <svg width={140} height={140} viewBox="0 0 140 140" style={{ flexShrink: 0 }}>
          {arcs.map((a, i) => (
            <path key={i} d={arcPath(R, a.start, a.end, INNER)} fill={a.color} opacity={0.85} />
          ))}
          {/* Center total */}
          <text x={CX} y={CY - 2} textAnchor="middle" dominantBaseline="central" fontFamily="Inter,sans-serif" fontSize={24} fontWeight={800} fill="#fff">
            {total.toLocaleString('id-ID')}
          </text>
          <text x={CX} y={CY + 18} textAnchor="middle" dominantBaseline="central" fontFamily="Inter,sans-serif" fontSize={10} fontWeight={600} fill="rgba(255,255,255,0.35)">
            TOTAL
          </text>
        </svg>
        {/* Legend */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: '1 1 auto', minWidth: 0 }}>
          {arcs.filter(a => a.frac > 0).map((a, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 10, height: 10, borderRadius: 3, background: a.color, flexShrink: 0 }} />
              <span style={{ fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.7)', flex: '1 1 auto', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.label}</span>
              <span style={{ fontSize: 14, fontWeight: 700, color: '#fff', whiteSpace: 'nowrap' }}>{a.value.toLocaleString('id-ID')}</span>
              <span style={{ fontSize: 12, fontWeight: 700, color: a.color, whiteSpace: 'nowrap' }}>▸ {(a.frac * 100).toFixed(0)}%</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── SVG Trend Chart (CPR / CPV) with Changelog ─────────────────────────────
function MciTrendChart({ data, color, unit, changelog = [], target, targetLabel }: {
  data: { date: string; value: number }[]
  color: string
  unit: string
  changelog?: ChangelogRow[]
  target?: number
  targetLabel?: string
}) {
  const W = 320, H = 180, PAD = { top: 10, right: target ? 52 : 10, bottom: 20, left: 6 }
  const innerW = W - PAD.left - PAD.right
  const innerH = H - PAD.top - PAD.bottom
  const [tooltip, setTooltip] = useState<{ x: number; y: number; p: { date: string; value: number } } | null>(null)
  const [clTooltip, setClTooltip] = useState<{ x: number; y: number; entries: ChangelogRow[] } | null>(null)
  const [modalEntries, setModalEntries] = useState<ChangelogRow[] | null>(null)
  const ref = useRef<SVGSVGElement>(null)

  if (data.length < 2) return null

  const vals = data.map(d => d.value)
  const minV = Math.min(...vals, target ?? Infinity) * 0.96
  const maxV = Math.max(...vals, target ?? -Infinity) * 1.04
  const rng = maxV - minV || 1
  const n = vals.length

  const xs = (i: number) => PAD.left + (i / (n - 1)) * innerW
  const ys = (v: number) => PAD.top + innerH - ((v - minV) / rng) * innerH

  // Trend line
  const mX = (n - 1) / 2
  const mY = vals.reduce((a, b) => a + b, 0) / n
  const slope = vals.reduce((s, v, i) => s + (i - mX) * (v - mY), 0) /
                vals.reduce((s, _, i) => s + (i - mX) ** 2, 0)
  const ic = mY - slope * mX
  const tUp = slope > 0
  const tc = tUp ? '#f87171' : '#34d399'
  const rate = target ? Math.abs((slope / target) * 100) : Math.abs((slope / mY) * 100)

  const pts = data.map((d, i) => `${xs(i)},${ys(d.value)}`).join(' ')

  // Target zones — above/below polygons per segment
  const above: string[] = [], below: string[] = []
  if (target != null) {
    const tY = ys(target)
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
  } else {
    // No target — simple fill below
    const fillPts = `${xs(0)},${PAD.top + innerH} ${pts} ${xs(n - 1)},${PAD.top + innerH}`
    below.push(fillPts)
  }

  // Changelog markers
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
    <div style={{ position: 'relative', width: '100%' }}>
      <svg ref={ref} width={W} height={H}
        onMouseMove={onMove} onMouseLeave={() => setTooltip(null)}
        style={{ display: 'block', overflow: 'visible', cursor: 'crosshair', width: '100%', height: 'auto' }}>
        {/* Target zones */}
        {above.map((p, i) => <polygon key={`a${i}`} points={p} fill="#f87171" fillOpacity="0.1" />)}
        {below.map((p, i) => <polygon key={`b${i}`} points={p} fill="#34d399" fillOpacity={target != null ? "0.1" : "0.06"} />)}
        {/* Target line */}
        {target != null && (
          <>
            <line x1={PAD.left} y1={ys(target)} x2={W - PAD.right} y2={ys(target)} stroke="#94a3b8" strokeOpacity="0.75" strokeWidth="2" strokeDasharray="4,3" />
            <text x={W - PAD.right + 3} y={ys(target) + 5} fontSize="12" fill="#94a3b8" opacity="1" fontWeight="700">{targetLabel ?? ''}</text>
          </>
        )}
        {/* Trend dashed line */}
        <line x1={xs(0)} y1={ys(ic)} x2={xs(n - 1)} y2={ys(slope * (n - 1) + ic)} stroke={tc} strokeOpacity="0.45" strokeWidth="1.8" strokeDasharray="4,3" />
        {/* Line */}
        <polyline points={pts} fill="none" stroke={color} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
        {/* Changelog markers */}
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
        {/* Crosshair */}
        {tooltip && (
          <g>
            <line x1={tooltip.x} y1={PAD.top} x2={tooltip.x} y2={PAD.top + innerH} stroke="rgba(255,255,255,0.08)" strokeWidth="1" />
            <circle cx={tooltip.x} cy={tooltip.y} r="4.5" fill={color} stroke="#0d0e12" strokeWidth="1.5" />
          </g>
        )}
        <text x={PAD.left} y={H - 2} fontSize="10" fill="rgba(255,255,255,0.65)" textAnchor="start">{sd(data[0].date)}</text>
        <text x={xs(n - 1)} y={H - 2} fontSize="10" fill="rgba(255,255,255,0.65)" textAnchor="end">{sd(data[n - 1].date)}</text>
      </svg>

      {/* Trend badge */}
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
          background: 'rgba(13,14,18,0.95)', border: `1px solid ${color}55`,
          borderRadius: 7, padding: '4px 8px', backdropFilter: 'blur(8px)',
        }}>
          <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.65)', marginBottom: 1 }}>{sd(tooltip.p.date)}</div>
          <div style={{ fontSize: 11, fontWeight: 700, color }}>{fmtRp(Math.round(tooltip.p.value))} {unit}</div>
        </div>
      )}

      {clTooltip && <ChangelogTooltip x={clTooltip.x} y={clTooltip.y} entries={clTooltip.entries} />}
    </div>

    {modalEntries && <ChangelogModal entries={modalEntries} onClose={() => setModalEntries(null)} />}
    </>
  )
}

export function HealthcareDashboard() {
  // ── Brand + date state ──
  const { data: brandBounds } = useQuery({
    queryKey: ['date-bounds'],
    queryFn: async () => {
      const res = await fetch(`${D1_WORKER_URL}/v2/date-bounds`)
      if (!res.ok) throw new Error()
      return res.json() as Promise<BrandBounds[]>
    },
    staleTime: 0,
  })

  const activeBrand = 'MCI'
  const activeBounds = useMemo(() => brandBounds?.find(b => b.brand === activeBrand), [brandBounds, activeBrand])

  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [initialized, setInitialized] = useState(false)
  useEffect(() => {
    if (activeBounds && !initialized) {
      const latest = capToH2(activeBounds.latest)
      const d = new Date(latest + 'T00:00:00')
      d.setDate(d.getDate() - 29)
      const fromStr = dateStr(d)
      setTo(latest)
      setFrom(fromStr < activeBounds.earliest ? activeBounds.earliest : fromStr)
      setInitialized(true)
    }
  }, [activeBounds, initialized])
  const activeFrom = from || activeBounds?.earliest || ''
  const activeTo = to || capToH2(activeBounds?.latest || '')
  const applyPreset = (days: number) => {
    if (!activeBounds) return
    const latest = capToH2(activeBounds.latest)
    const t = new Date(latest + 'T00:00:00')
    if (days === 0) {
      const f = new Date(t.getFullYear(), t.getMonth(), 1)
      const fStr = dateStr(f)
      setFrom(fStr < activeBounds.earliest ? activeBounds.earliest : fStr)
    } else {
      const f = new Date(t)
      f.setDate(f.getDate() - days + 1)
      const fStr = dateStr(f)
      setFrom(fStr < activeBounds.earliest ? activeBounds.earliest : fStr)
    }
    setTo(latest)
  }

  // ── Data fetch ──
  const [refreshNonce, setRefreshNonce] = useState(0)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const spinRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const [spinAngle, setSpinAngle] = useState(0)

  const handleRefresh = () => {
    setIsRefreshing(true)
    setRefreshNonce(n => n + 1)
    let angle = 0
    if (spinRef.current) clearInterval(spinRef.current)
    spinRef.current = setInterval(() => { angle += 12; setSpinAngle(angle) }, 30)
  }

  const { data: cgData, isLoading: cgLoading, isFetching: cgFetching } = useQuery({
    queryKey: ['consumer-goods', activeFrom, activeTo, activeBrand, refreshNonce],
    queryFn: async () => {
      if (!activeFrom || !activeTo) return null
      const bust = refreshNonce > 0 ? `&_r=${refreshNonce}` : ''
      const res = await fetch(
        `${D1_WORKER_URL}/v2/consumer-goods?brand=${activeBrand}&from=${activeFrom}&to=${activeTo}${bust}`
      )
      if (!res.ok) throw new Error('consumer-goods fetch failed')
      const data = res.json() as Promise<ConsumerGoodsData>
      setIsRefreshing(false)
      if (spinRef.current) { clearInterval(spinRef.current); spinRef.current = null }
      return data
    },
    enabled: !!activeFrom && !!activeTo,
    staleTime: 5 * 60_000,
  })

  // ── Computed metrics ──
  const totalSpend = useMemo(() =>
    (cgData?.performance ?? []).reduce((s, r) => s + (r.ad_spend ?? 0), 0)
  , [cgData])

  const MCI_SKUS = new Set(['CEK', 'A1C', 'WCA'])

  const skuSpend = useMemo(() => {
    const map = new Map<string, number>()
    for (const r of cgData?.performance ?? []) {
      if (!r.sku || r.sku === '-' || !MCI_SKUS.has(r.sku)) continue
      map.set(r.sku, (map.get(r.sku) ?? 0) + (r.ad_spend ?? 0))
    }
    return Array.from(map.entries())
      .map(([sku, spend]) => ({ sku, spend }))
      .sort((a, b) => b.spend - a.spend)
  }, [cgData])

  const campaignBudgets = useMemo(() =>
    (cgData?.campaign_budgets ?? [])
      .sort((a, b) => b.daily_budget - a.daily_budget)
  , [cgData])
  const campaignBudgetTotal = useMemo(() =>
    campaignBudgets.reduce((s, r) => s + r.daily_budget, 0)
  , [campaignBudgets])
  const budgetDate = cgData?.campaign_budgets?.[0]?.date ?? ''

  // Branch data for pie charts
  const formByBranch = useMemo(() =>
    (cgData?.form_by_branch ?? []).map((r, i) => ({
      branch: r.branch,
      submission: r.form_submission ?? 0,
      conversion: r.form_conversion ?? 0,
      color: branchColor(i),
    }))
  , [cgData])

  // ── Changelog ──
  const filteredChangelog = useMemo(() => (cgData?.changelog ?? []) as ChangelogRow[], [cgData])

  // ── Form totals from conversions data ──
  const totalFormSubmissions = useMemo(() =>
    (cgData?.conversions ?? []).reduce((s, r) => s + (r.mongo_form_submission ?? 0), 0)
  , [cgData])
  const totalFormConversions = useMemo(() =>
    (cgData?.conversions ?? []).reduce((s, r) => s + (r.mongo_form_conversion ?? 0), 0)
  , [cgData])

  // CPR = Ad Spend / Form Submissions (daily 7-day moving average)
  const cprSeries = useMemo(() => {
    const byDate = new Map<string, { spend: number; submissions: number }>()
    for (const r of cgData?.performance ?? []) {
      if (!r.sku || r.sku === '-' || !MCI_SKUS.has(r.sku)) continue
      const prev = byDate.get(r.date) ?? { spend: 0, submissions: 0 }
      byDate.set(r.date, { spend: prev.spend + (r.ad_spend ?? 0), submissions: prev.submissions })
    }
    for (const r of cgData?.conversions ?? []) {
      if (!r.sku || r.sku === '-' || !MCI_SKUS.has(r.sku)) continue
      const prev = byDate.get(r.date) ?? { spend: 0, submissions: 0 }
      byDate.set(r.date, { ...prev, submissions: prev.submissions + (r.mongo_form_submission ?? 0) })
    }
    const daily = Array.from(byDate.entries()).sort(([a], [b]) => a.localeCompare(b)).map(([date, v]) => ({ date, ...v }))
    const window = 7
    return daily.map((_, i) => {
      const slice = daily.slice(Math.max(0, i - window + 1), i + 1)
      const totalSpend = slice.reduce((s, d) => s + d.spend, 0)
      const totalSubs = slice.reduce((s, d) => s + d.submissions, 0)
      return { date: daily[i].date, value: totalSubs > 0 ? totalSpend / totalSubs : 0 }
    }).filter(p => p.value > 0)
  }, [cgData])

  // CPV = Ad Spend / Form Conversions (daily 7-day moving average)
  const cpvSeries = useMemo(() => {
    const byDate = new Map<string, { spend: number; conversions: number }>()
    for (const r of cgData?.performance ?? []) {
      if (!r.sku || r.sku === '-' || !MCI_SKUS.has(r.sku)) continue
      const prev = byDate.get(r.date) ?? { spend: 0, conversions: 0 }
      byDate.set(r.date, { spend: prev.spend + (r.ad_spend ?? 0), conversions: prev.conversions })
    }
    for (const r of cgData?.conversions ?? []) {
      if (!r.sku || r.sku === '-' || !MCI_SKUS.has(r.sku)) continue
      const prev = byDate.get(r.date) ?? { spend: 0, conversions: 0 }
      byDate.set(r.date, { ...prev, conversions: prev.conversions + (r.mongo_form_conversion ?? 0) })
    }
    const daily = Array.from(byDate.entries()).sort(([a], [b]) => a.localeCompare(b)).map(([date, v]) => ({ date, ...v }))
    const window = 21
    return daily.map((_, i) => {
      const slice = daily.slice(Math.max(0, i - window + 1), i + 1)
      const totalSpend = slice.reduce((s, d) => s + d.spend, 0)
      const totalConv = slice.reduce((s, d) => s + d.conversions, 0)
      return { date: daily[i].date, value: totalConv > 0 ? totalSpend / totalConv : 0 }
    }).filter(p => p.value > 0)
  }, [cgData])

  // Per-SKU CPR and CPV
  const skuCpr = useMemo(() => {
    return (['CEK', 'A1C', 'WCA'] as const).map(sku => {
      const spend = (cgData?.performance ?? []).filter(r => r.sku === sku).reduce((s, r) => s + (r.ad_spend ?? 0), 0)
      const subs = (cgData?.conversions ?? []).filter(r => r.sku === sku).reduce((s, r) => s + (r.mongo_form_submission ?? 0), 0)
      return { sku, cpr: subs > 0 ? spend / subs : 0, submissions: subs }
    }).filter(s => s.submissions > 0)
  }, [cgData])

  const skuCpv = useMemo(() => {
    return (['CEK', 'A1C', 'WCA'] as const).map(sku => {
      const spend = (cgData?.performance ?? []).filter(r => r.sku === sku).reduce((s, r) => s + (r.ad_spend ?? 0), 0)
      const conv = (cgData?.conversions ?? []).filter(r => r.sku === sku).reduce((s, r) => s + (r.mongo_form_conversion ?? 0), 0)
      return { sku, cpv: conv > 0 ? spend / conv : 0, conversions: conv }
    }).filter(s => s.conversions > 0)
  }, [cgData])

  // ── ATL metrics ──
  const totalImpressions = useMemo(() =>
    (cgData?.performance ?? []).filter(r => MCI_SKUS.has(r.sku)).reduce((s, r) => s + (r.impressions ?? 0), 0)
  , [cgData])
  const totalLinkClicks = useMemo(() =>
    (cgData?.performance ?? []).filter(r => MCI_SKUS.has(r.sku)).reduce((s, r) => s + (r.link_click ?? 0), 0)
  , [cgData])
  const totalFirstVisit = useMemo(() =>
    (cgData?.ga4 ?? []).reduce((s, r) => s + (r.ga4_first_visit ?? 0), 0)
  , [cgData])
  const totalPageView = useMemo(() =>
    (cgData?.ga4 ?? []).reduce((s, r) => s + (r.ga4_page_view ?? 0), 0)
  , [cgData])

  const cpmSeries = useMemo(() => {
    const byDate = new Map<string, { spend: number; impr: number }>()
    for (const r of cgData?.performance ?? []) {
      if (!MCI_SKUS.has(r.sku)) continue
      const p = byDate.get(r.date) ?? { spend: 0, impr: 0 }
      byDate.set(r.date, { spend: p.spend + (r.ad_spend ?? 0), impr: p.impr + (r.impressions ?? 0) })
    }
    return Array.from(byDate.entries()).sort(([a], [b]) => a.localeCompare(b))
      .map(([date, { spend, impr }]) => ({ date, value: impr > 0 ? (spend / impr) * 1000 : 0 }))
      .filter(p => p.value > 0)
  }, [cgData])

  const ctrSeries = useMemo(() => {
    const byDate = new Map<string, { clicks: number; impr: number }>()
    for (const r of cgData?.performance ?? []) {
      if (!MCI_SKUS.has(r.sku)) continue
      const p = byDate.get(r.date) ?? { clicks: 0, impr: 0 }
      byDate.set(r.date, { clicks: p.clicks + (r.link_click ?? 0), impr: p.impr + (r.impressions ?? 0) })
    }
    return Array.from(byDate.entries()).sort(([a], [b]) => a.localeCompare(b))
      .map(([date, { clicks, impr }]) => ({ date, value: impr > 0 ? (clicks / impr) * 100 : 0 }))
      .filter(p => p.value > 0)
  }, [cgData])

  const fvSeries = useMemo(() => {
    const byDate = new Map<string, { fv: number; pv: number }>()
    for (const r of cgData?.ga4 ?? []) {
      const p = byDate.get(r.date) ?? { fv: 0, pv: 0 }
      byDate.set(r.date, { fv: p.fv + (r.ga4_first_visit ?? 0), pv: p.pv + (r.ga4_page_view ?? 0) })
    }
    return Array.from(byDate.entries()).sort(([a], [b]) => a.localeCompare(b))
      .map(([date, { fv, pv }]) => ({ date, value: pv > 0 ? (fv / pv) * 100 : 0 }))
      .filter(p => p.value > 0)
  }, [cgData])

  // ── Number of days in range ──
  const numDays = useMemo(() => {
    if (!activeFrom || !activeTo) return 0
    const d1 = new Date(activeFrom + 'T00:00:00')
    const d2 = new Date(activeTo + 'T00:00:00')
    return Math.max(1, Math.round((d2.getTime() - d1.getTime()) / 86400000) + 1)
  }, [activeFrom, activeTo])

  // ── Loading screen ──
  const isInitialLoad = cgLoading || (cgFetching && !cgData) || !activeFrom || !cgData
  if (isInitialLoad) {
    return (
      <div style={{
        minHeight: '100vh', background: '#0d0e12',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: 'Inter, system-ui, sans-serif', color: '#ffffff',
        flexDirection: 'column', gap: 0, zoom: 0.8,
      }}>
        <div style={{ position: 'relative', width: 100, height: 100, marginBottom: 40 }}>
          {[0, 1, 2].map(i => (
            <div key={i} style={{
              position: 'absolute', inset: 0, borderRadius: '50%',
              border: '1.5px solid rgba(52, 211, 153, 0.25)',
              animation: `mciPulse 2s ease-out ${i * 0.6}s infinite`,
            }} />
          ))}
          <div style={{
            position: 'absolute', inset: 14, borderRadius: '50%',
            border: '2px solid rgba(52, 211, 153, 0.15)',
            borderTopColor: '#34d399', borderRightColor: '#38bdf8',
            animation: 'mciSpin 1s linear infinite',
          }} />
          <div style={{
            position: 'absolute', inset: '50%', transform: 'translate(-50%, -50%)',
            width: 10, height: 10, borderRadius: '50%',
            background: 'radial-gradient(circle, #34d399, #38bdf8)',
            boxShadow: '0 0 16px #34d399cc',
          }} />
        </div>
        <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', color: '#34d399', marginBottom: 6 }}>
          MCI Dashboard
        </div>
        <div style={{ fontSize: 22, fontWeight: 700, color: '#ffffff', marginBottom: 8 }}>
          Loading data…
        </div>
        <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.35)', marginBottom: 40 }}>
          {activeFrom ? `Fetching MCI — ${activeFrom} → ${activeTo}` : 'Resolving date bounds…'}
        </div>
        <div style={{ marginTop: 4, width: 280, height: 3, background: 'rgba(255,255,255,0.06)', borderRadius: 99, overflow: 'hidden', position: 'relative' }}>
          <div style={{
            position: 'absolute', top: 0, left: 0, height: '100%', width: '40%',
            background: 'linear-gradient(90deg, transparent, #34d399, #38bdf8, transparent)',
            borderRadius: 99, animation: 'mciScan 1.6s ease-in-out infinite',
          }} />
        </div>
        <style>{`
          @keyframes mciSpin { to { transform: rotate(360deg); } }
          @keyframes mciPulse { 0% { transform: scale(1); opacity: 0.6; } 100% { transform: scale(2.4); opacity: 0; } }
          @keyframes mciScan { 0% { left: -40%; } 100% { left: 140%; } }
        `}</style>
      </div>
    )
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: '#0d0e12',
      padding: '32px 32px 80px',
      fontFamily: 'Inter, system-ui, sans-serif',
      color: '#ffffff',
      zoom: 0.8,
    }}>

      {/* ── Toolbar ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 40, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginRight: 8 }}>
          <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#34d399', boxShadow: '0 0 6px #34d399aa' }} />
          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', color: '#34d399', textTransform: 'uppercase' }}>MCI Dashboard</span>
        </div>
        <input type="date" value={activeFrom} onChange={e => setFrom(e.target.value)}
          style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#ffffff', padding: '6px 10px', fontSize: 13 }} />
        <span style={{ color: 'rgba(255,255,255,0.9)' }}>→</span>
        <input type="date" value={activeTo} onChange={e => setTo(e.target.value)}
          style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#ffffff', padding: '6px 10px', fontSize: 13 }} />
        <div style={{ display: 'flex', gap: 6 }}>
          {PRESETS.map(p => (
            <button key={p.label} onClick={() => applyPreset(p.days)}
              style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 6, color: '#fff', padding: '5px 10px', fontSize: 12, cursor: 'pointer' }}>
              {p.label}
            </button>
          ))}
        </div>
        <button
          onClick={handleRefresh}
          disabled={isRefreshing}
          title="Refresh — busts Cloudflare cache"
          style={{
            marginLeft: 4,
            background: isRefreshing ? 'rgba(52,211,153,0.12)' : 'rgba(255,255,255,0.06)',
            border: `1px solid ${isRefreshing ? 'rgba(52,211,153,0.4)' : 'rgba(255,255,255,0.15)'}`,
            borderRadius: 6, color: isRefreshing ? '#34d399' : 'rgba(255,255,255,0.7)',
            padding: '5px 9px', fontSize: 14, cursor: isRefreshing ? 'default' : 'pointer',
            display: 'flex', alignItems: 'center', gap: 5, transition: 'all 0.2s',
          }}
        >
          <span style={{ display: 'inline-block', transform: `rotate(${spinAngle}deg)`, transition: isRefreshing ? 'none' : 'transform 0.3s' }}>↻</span>
          <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.05em' }}>{isRefreshing ? 'Refreshing…' : 'Refresh'}</span>
        </button>
      </div>

      {/* ── Content ── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 28, width: '100%' }}>

        {/* ── Top row: Ad Spend Health + Leads Spread ── */}
        <div style={{ display: 'flex', gap: 28, alignItems: 'stretch', flexWrap: 'wrap' }}>

        {/* ── Ad Spend Health Card ── */}
        <div style={{
          flex: '0.8 1 300px', minWidth: 0,
          background: 'rgba(255,255,255,0.03)',
          border: '1px solid rgba(255,255,255,0.06)',
          borderRadius: 14, padding: '20px 24px',
        }}>
          <div style={{ fontSize: 14, fontWeight: 800, letterSpacing: '-0.02em', color: '#fff', marginBottom: 16 }}>Ad Spend Health</div>
          <div style={{ display: 'flex', gap: 32, alignItems: 'flex-start', flexWrap: 'wrap' }}>

            {/* Col 1 — Total Ad Spend + Daily Config */}
            <div style={{ flex: '0 0 auto', minWidth: 200, display: 'flex', flexDirection: 'column', gap: 12 }}>
              {/* Total */}
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase' }}>Total Ad Spend</div>
                <div style={{ fontSize: 24, fontWeight: 800, letterSpacing: '-0.04em', color: '#fff', lineHeight: 1, marginTop: 6, whiteSpace: 'nowrap' }}>
                  {fmtRp(Math.round(totalSpend))}
                </div>
                <div style={{ fontSize: 10, fontWeight: 600, color: 'rgba(255,255,255,0.35)', marginTop: 6 }}>
                  {numDays} days · avg {fmtRpM(totalSpend / numDays)}/day
                </div>
              </div>

              {/* Campaign Budget Config */}
              {campaignBudgetTotal > 0 && (
                <div style={{ borderTop: '1px solid rgba(255,255,255,0.09)', paddingTop: 10 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase' }}>Ad Spend Config</div>
                  <div style={{ fontSize: 15, fontWeight: 800, color: '#fff', letterSpacing: '-0.02em', marginTop: 5 }}>
                    {fmtRpM(campaignBudgetTotal)}<span style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', fontWeight: 600 }}>/day</span>
                  </div>
                  {budgetDate && <div style={{ fontSize: 10, fontWeight: 600, color: 'rgba(255,255,255,0.35)', marginTop: 4 }}>as of {budgetDate}</div>}
                  <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {campaignBudgets.slice(0, 8).map((c, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                        <span style={{ fontSize: 9, fontWeight: 600, color: 'rgba(255,255,255,0.40)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 140 }}>{c.campaign_name}</span>
                        <span style={{ fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.6)', whiteSpace: 'nowrap' }}>{fmtRpM(c.daily_budget)}</span>
                      </div>
                    ))}
                    {campaignBudgets.length > 8 && (
                      <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.25)', marginTop: 2 }}>+{campaignBudgets.length - 8} more campaigns</div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Col 2 — Breakdown by SKU */}
            {skuSpend.length > 0 && (
              <div style={{ flex: '1 1 auto', borderLeft: '1px solid rgba(255,255,255,0.06)', paddingLeft: 24, display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase' }}>Breakdown by Product</div>
                {skuSpend.map(s => {
                  const share = totalSpend > 0 ? (s.spend / totalSpend) * 100 : 0
                  const color = mciSkuColor(s.sku)
                  return (
                    <div key={s.sku}>
                      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 4 }}>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                          <span style={{ fontSize: 13, fontWeight: 700, color }}>{s.sku}</span>
                          <span style={{ fontSize: 10, fontWeight: 600, color: 'rgba(255,255,255,0.45)' }}>{fmtRpM(s.spend)}</span>
                        </div>
                        <span style={{ fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.5)' }}>{share.toFixed(0)}%</span>
                      </div>
                      <div style={{ height: 4, background: 'rgba(255,255,255,0.07)', borderRadius: 2 }}>
                        <div style={{ height: '100%', width: `${share}%`, background: color, borderRadius: 2, transition: 'width 0.4s ease' }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        {/* ── Leads Spread Card ── */}
        {formByBranch.length > 0 && (
          <div style={{
            flex: '1.5 1 500px', minWidth: 0,
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid rgba(255,255,255,0.06)',
            borderRadius: 14, padding: '20px 24px',
          }}>
            <div style={{ fontSize: 14, fontWeight: 800, letterSpacing: '-0.02em', color: '#fff', marginBottom: 16 }}>Leads Spread</div>
            <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start' }}>
              <div style={{ flex: '1 1 0', minWidth: 0 }}>
                <DonutPie
                  title="Form Submissions"
                  slices={formByBranch.map(b => ({ label: b.branch, value: b.submission, color: b.color }))}
                />
              </div>
              <div style={{ borderLeft: '1px solid rgba(255,255,255,0.06)', alignSelf: 'stretch' }} />
              <div style={{ flex: '1 1 0', minWidth: 0 }}>
                <DonutPie
                  title="Form Conversions"
                  slices={formByBranch.map(b => ({ label: b.branch, value: b.conversion, color: b.color }))}
                />
              </div>
            </div>
          </div>
        )}

        </div>{/* end top row */}

        {/* ── Row 2: Ads Performance + Leads Quality ── */}
        <div style={{ display: 'flex', gap: 28, alignItems: 'stretch', flexWrap: 'wrap' }}>

          {/* ── Ads Performance (CPR) ── */}
          <div style={{
            flex: '2 1 380px', minWidth: 0,
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.09)',
            borderRadius: 14, padding: '24px 28px',
            display: 'flex', flexDirection: 'column', gap: 20,
            fontFamily: 'Inter, system-ui, sans-serif',
            overflow: 'hidden',
          }}>
            <div style={{ fontSize: 14, fontWeight: 800, letterSpacing: '-0.02em', color: '#fff' }}>Ads Performance</div>
            <div style={{ display: 'flex', flexDirection: 'row', gap: 24 }}>
              {/* LEFT: CPR metrics */}
              <div style={{ flex: '0 0 150px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div>
                  <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', color: 'rgba(255,255,255,0.50)', textTransform: 'uppercase', marginBottom: 3 }}>CPR (Cost/Result)</div>
                  <div style={{ fontSize: 24, fontWeight: 800, letterSpacing: '-0.04em', color: '#fff', lineHeight: 1, whiteSpace: 'nowrap' }}>
                    {totalFormSubmissions > 0 ? fmtRp(Math.round(totalSpend / totalFormSubmissions)) : '—'}
                  </div>
                  {(() => {
                    const cpr = totalFormSubmissions > 0 ? totalSpend / totalFormSubmissions : 0
                    const div = cpr > 0 ? ((cpr - 100_000) / 100_000) * 100 : null
                    const sc = div === null ? '#818cf8' : div <= 0 ? '#34d399' : div <= 10 ? '#fbbf24' : '#f87171'
                    const sl = div === null ? 'No Data' : div <= 0 ? '🟢 On Target' : div <= 10 ? '🟡 Slightly Over' : '🔴 Over Target'
                    return div !== null ? (
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, marginTop: 6, background: `${sc}15`, border: `1px solid ${sc}30`, borderRadius: 5, padding: '3px 7px' }}>
                        <div style={{ width: 4, height: 4, borderRadius: '50%', background: sc }} />
                        <span style={{ fontSize: 10, fontWeight: 700, color: sc }}>{sl}</span>
                        <span style={{ fontSize: 9, color: sc, opacity: 0.8 }}>{div > 0 ? '+' : ''}{div.toFixed(1)}%</span>
                      </div>
                    ) : null
                  })()}
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginTop: 6 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: '-0.02em', color: 'rgba(255,255,255,0.72)' }}>{totalFormSubmissions.toLocaleString('id-ID')}</span>
                    <span style={{ fontSize: 9, fontWeight: 600, color: 'rgba(255,255,255,0.76)', letterSpacing: '0.05em', textTransform: 'uppercase' }}>form submissions</span>
                  </div>
                </div>
              </div>

              {/* MIDDLE: CPR chart */}
              {cprSeries.length > 1 && (
                <div style={{ flex: '0 0 320px', minWidth: 0, borderLeft: '1px solid rgba(255,255,255,0.06)', paddingLeft: 24, display: 'flex', alignItems: 'center' }}>
                  <div style={{ width: '100%', maxWidth: 320 }}>
                    <MciTrendChart data={cprSeries} color="#34d399" unit="/ result" changelog={filteredChangelog} target={100_000} targetLabel="100K" />
                  </div>
                </div>
              )}

              {/* RIGHT: Breakdown by SKU */}
              {skuCpr.length > 0 && (
                <div style={{ flex: '1 1 auto', borderLeft: '1px solid rgba(255,255,255,0.06)', paddingLeft: 24, display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', color: 'rgba(255,255,255,0.50)', textTransform: 'uppercase' }}>Breakdown by Product</div>
                  {skuCpr.map(s => {
                    const color = mciSkuColor(s.sku)
                    const maxCpr = Math.max(...skuCpr.map(x => x.cpr), 1)
                    const barPct = Math.min((s.cpr / maxCpr) * 100, 100)
                    return (
                      <div key={s.sku}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 3 }}>
                          <span style={{ fontSize: 13, fontWeight: 700, color, letterSpacing: '0.07em' }}>{s.sku}</span>
                          <span style={{ fontSize: 13, fontWeight: 800, color: '#fff', letterSpacing: '-0.02em' }}>{fmtRp(Math.round(s.cpr))}</span>
                        </div>
                        <div style={{ height: 3, background: 'rgba(255,255,255,0.07)', borderRadius: 2 }}>
                          <div style={{ height: '100%', width: `${barPct}%`, background: color, borderRadius: 2, transition: 'width 0.4s ease' }} />
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>

          {/* ── Leads Quality (CPV) ── */}
          <div style={{
            flex: '2 1 380px', minWidth: 0,
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.09)',
            borderRadius: 14, padding: '24px 28px',
            display: 'flex', flexDirection: 'column', gap: 20,
            fontFamily: 'Inter, system-ui, sans-serif',
            overflow: 'hidden',
          }}>
            <div style={{ fontSize: 14, fontWeight: 800, letterSpacing: '-0.02em', color: '#fff' }}>Leads Quality</div>
            <div style={{ display: 'flex', flexDirection: 'row', gap: 24 }}>
              {/* LEFT: CPV metrics */}
              <div style={{ flex: '0 0 150px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div>
                  <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', color: 'rgba(255,255,255,0.50)', textTransform: 'uppercase', marginBottom: 3 }}>CPV (Cost/Visit)</div>
                  <div style={{ fontSize: 24, fontWeight: 800, letterSpacing: '-0.04em', color: '#fff', lineHeight: 1, whiteSpace: 'nowrap' }}>
                    {totalFormConversions > 0 ? fmtRpM(Math.round(totalSpend / totalFormConversions)) : '—'}
                  </div>
                  {(() => {
                    const cpv = totalFormConversions > 0 ? totalSpend / totalFormConversions : 0
                    const div = cpv > 0 ? ((cpv - 500_000) / 500_000) * 100 : null
                    const sc = div === null ? '#818cf8' : div <= 0 ? '#34d399' : div <= 10 ? '#fbbf24' : '#f87171'
                    const sl = div === null ? 'No Data' : div <= 0 ? '🟢 On Target' : div <= 10 ? '🟡 Slightly Over' : '🔴 Over Target'
                    return div !== null ? (
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, marginTop: 6, background: `${sc}15`, border: `1px solid ${sc}30`, borderRadius: 5, padding: '3px 7px' }}>
                        <div style={{ width: 4, height: 4, borderRadius: '50%', background: sc }} />
                        <span style={{ fontSize: 10, fontWeight: 700, color: sc }}>{sl}</span>
                        <span style={{ fontSize: 9, color: sc, opacity: 0.8 }}>{div > 0 ? '+' : ''}{div.toFixed(1)}%</span>
                      </div>
                    ) : null
                  })()}
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginTop: 6 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: '-0.02em', color: 'rgba(255,255,255,0.72)' }}>{totalFormConversions.toLocaleString('id-ID')}</span>
                    <span style={{ fontSize: 9, fontWeight: 600, color: 'rgba(255,255,255,0.76)', letterSpacing: '0.05em', textTransform: 'uppercase' }}>form conversions</span>
                  </div>
                </div>
              </div>

              {/* MIDDLE: CPV chart */}
              {cpvSeries.length > 1 && (
                <div style={{ flex: '0 0 320px', minWidth: 0, borderLeft: '1px solid rgba(255,255,255,0.06)', paddingLeft: 24, display: 'flex', alignItems: 'center' }}>
                  <div style={{ width: '100%', maxWidth: 320 }}>
                    <MciTrendChart data={cpvSeries} color="#f472b6" unit="/ visit" changelog={filteredChangelog} target={500_000} targetLabel="500K" />
                  </div>
                </div>
              )}

              {/* RIGHT: Breakdown by SKU */}
              {skuCpv.length > 0 && (
                <div style={{ flex: '1 1 auto', borderLeft: '1px solid rgba(255,255,255,0.06)', paddingLeft: 24, display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', color: 'rgba(255,255,255,0.50)', textTransform: 'uppercase' }}>Breakdown by Product</div>
                  {skuCpv.map(s => {
                    const color = mciSkuColor(s.sku)
                    const maxCpv = Math.max(...skuCpv.map(x => x.cpv), 1)
                    const barPct = Math.min((s.cpv / maxCpv) * 100, 100)
                    return (
                      <div key={s.sku}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 3 }}>
                          <span style={{ fontSize: 13, fontWeight: 700, color, letterSpacing: '0.07em' }}>{s.sku}</span>
                          <span style={{ fontSize: 13, fontWeight: 800, color: '#fff', letterSpacing: '-0.02em' }}>{fmtRpM(Math.round(s.cpv))}</span>
                        </div>
                        <div style={{ height: 3, background: 'rgba(255,255,255,0.07)', borderRadius: 2 }}>
                          <div style={{ height: '100%', width: `${barPct}%`, background: color, borderRadius: 2, transition: 'width 0.4s ease' }} />
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>

        </div>

        {/* ATL Performance */}
        <AtlPerformanceCard
          totalSpend={totalSpend}
          totalImpressions={totalImpressions}
          totalLinkClicks={totalLinkClicks}
          totalFirstVisit={totalFirstVisit}
          totalPageView={totalPageView}
          cpmSeries={cpmSeries}
          ctrSeries={ctrSeries}
          fvSeries={fvSeries}
          changelog={filteredChangelog}
        />

      </div>
    </div>
  )
}
