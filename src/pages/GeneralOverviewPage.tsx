/**
 * GeneralOverviewPage — Cross-brand quick glance
 */
import { useState, useMemo, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { D1_WORKER_URL } from '../config/dataSource'
import { dateStr, capToH2, PRESETS } from './ProductPerformancePage'
import { fmtRp, fmtRpM } from '../utils/format'
import { ChangelogModal } from '../components/ChangelogModal'
import { ChangelogTooltip } from '../components/ChangelogTooltip'
import type { ChangelogRow } from '../types/changelog'

interface BrandBounds { brand: string; earliest: string; latest: string; skus: string[] }

// Minimal types for fetched data
interface PerfRow { date: string; sku: string; ad_spend: number; impressions: number; link_click: number }
interface ConvRow { date: string; sku: string; mongo_real_lead_ccom?: number; mongo_real_lead_d2or?: number; mongo_real_lead_mpsh?: number; mongo_real_lead_ofls?: number; mongo_purchase_ccom?: number; mongo_purchase_ccom_revenue?: number }
interface SalesRow { date: string; rev_ccom_ca?: number; rev_ccom_crm?: number; rev_mpsh?: number; rev_d2or?: number; rev_ofls?: number }
interface BrandData { performance: PerfRow[]; conversions: ConvRow[]; sales: SalesRow[]; [k: string]: unknown }

// ── Overview Chart (identical to MNC CprlChart/CpaChart) ──
function OverviewChart({ data, color, unit, changelog = [], target, targetLabel, higherIsBetter = false, formatFn }: {
  data: { date: string; value: number }[]
  color: string
  unit: string
  changelog?: ChangelogRow[]
  target?: number
  targetLabel?: string
  higherIsBetter?: boolean
  formatFn?: (v: number) => string
}) {
  const W = 320, H = 180, PAD = { top: 10, right: target ? 52 : 10, bottom: 20, left: 6 }
  const innerW = W - PAD.left - PAD.right
  const innerH = H - PAD.top - PAD.bottom
  const [tooltip, setTooltip] = useState<{ x: number; y: number; p: { date: string; value: number }; pxX: number; pxY: number } | null>(null)
  const [clTooltip, setClTooltip] = useState<{ x: number; y: number; entries: ChangelogRow[] } | null>(null)
  const [modalEntries, setModalEntries] = useState<ChangelogRow[] | null>(null)
  const ref = useRef<SVGSVGElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  if (data.length < 2) return null

  const vals = data.map(d => d.value)
  const minV = Math.min(...vals, target ?? Infinity) * 0.96
  const maxV = Math.max(...vals, target ?? -Infinity) * 1.04
  const rng = maxV - minV || 1
  const n = vals.length

  const xs = (i: number) => PAD.left + (i / (n - 1)) * innerW
  const ys = (v: number) => PAD.top + innerH - ((v - minV) / rng) * innerH

  const mX = (n - 1) / 2
  const mY = vals.reduce((a, b) => a + b, 0) / n
  const slope = vals.reduce((s, v, i) => s + (i - mX) * (v - mY), 0) /
                vals.reduce((s, _, i) => s + (i - mX) ** 2, 0)
  const ic = mY - slope * mX
  const tUp = slope > 0
  // For cost metrics (lower is better): slope>0 = diverging (red), slope<0 = converging (green)
  // For value metrics (higher is better): slope>0 = converging (green), slope<0 = diverging (red)
  const tc = higherIsBetter ? (tUp ? '#34d399' : '#f87171') : (tUp ? '#f87171' : '#34d399')
  const converging = higherIsBetter ? tUp : !tUp
  const rate = target ? Math.abs((slope / target) * 100) : Math.abs((slope / mY) * 100)

  const pts = data.map((d, i) => `${xs(i)},${ys(d.value)}`).join(' ')

  // Target zones
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
    const fillPts = `${xs(0)},${PAD.top + innerH} ${pts} ${xs(n - 1)},${PAD.top + innerH}`
    below.push(fillPts)
  }

  const aboveColor = higherIsBetter ? '#34d399' : '#f87171'
  const belowColor = higherIsBetter ? '#f87171' : '#34d399'

  const markers = data.map((d, i) => ({ d, i, entries: changelog.filter(c => c.date === d.date) })).filter(m => m.entries.length > 0)

  const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const r = ref.current?.getBoundingClientRect(); if (!r) return
    const svgX = (e.clientX - r.left) / r.width * W
    const idx = Math.max(0, Math.min(n - 1, Math.round(((svgX - PAD.left) / innerW) * (n - 1))))
    // Store tooltip in pixel coords relative to container
    const pxX = (xs(idx) / W) * r.width
    const pxY = (ys(data[idx].value) / H) * r.height
    setTooltip({ x: xs(idx), y: ys(data[idx].value), p: data[idx], pxX, pxY })
  }
  const sd = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
  const fmt = formatFn ?? ((v: number) => fmtRp(Math.round(v)))

  return (
    <>
    <div ref={containerRef} style={{ position: 'relative' }}>
      <svg ref={ref} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet"
        onMouseMove={onMove} onMouseLeave={() => setTooltip(null)}
        style={{ display: 'block', overflow: 'visible', cursor: 'crosshair', width: '100%', height: 'auto' }}>
        {above.map((p, i) => <polygon key={`a${i}`} points={p} fill={aboveColor} fillOpacity="0.1" />)}
        {below.map((p, i) => <polygon key={`b${i}`} points={p} fill={belowColor} fillOpacity={target != null ? '0.1' : '0.06'} />)}
        {target != null && (
          <>
            <line x1={PAD.left} y1={ys(target)} x2={W - PAD.right} y2={ys(target)} stroke="#94a3b8" strokeOpacity="0.75" strokeWidth="2" strokeDasharray="4,3" />
            <text x={W - PAD.right + 3} y={ys(target) + 5} fontSize="12" fill="#94a3b8" opacity="1" fontWeight="700">{targetLabel ?? ''}</text>
          </>
        )}
        <line x1={xs(0)} y1={ys(ic)} x2={xs(n - 1)} y2={ys(slope * (n - 1) + ic)} stroke={tc} strokeOpacity="0.45" strokeWidth="1.8" strokeDasharray="4,3" />
        <polyline points={pts} fill="none" stroke={color} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
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
        {tooltip && (
          <g>
            <line x1={tooltip.x} y1={PAD.top} x2={tooltip.x} y2={PAD.top + innerH} stroke="rgba(255,255,255,0.08)" strokeWidth="1" />
            <circle cx={tooltip.x} cy={tooltip.y} r="4.5" fill={color} stroke="#0d0e12" strokeWidth="1.5" />
          </g>
        )}
        <text x={PAD.left} y={H - 2} fontSize="10" fill="rgba(255,255,255,0.65)" textAnchor="start">{sd(data[0].date)}</text>
        <text x={xs(n - 1)} y={H - 2} fontSize="10" fill="rgba(255,255,255,0.65)" textAnchor="end">{sd(data[n - 1].date)}</text>
      </svg>

      <div style={{ display: 'flex', justifyContent: 'flex-start', marginTop: 8 }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: `${tc}12`, border: `1px solid ${tc}28`, borderRadius: 4, padding: '3px 7px' }}>
          <span style={{ fontSize: 9, fontWeight: 800, color: tc }}>{converging ? '↓' : '↑'}</span>
          <span style={{ fontSize: 9, fontWeight: 700, color: tc }}>{converging ? 'Converging' : 'Diverging'}</span>
          <span style={{ fontSize: 9, color: tc, opacity: 1 }}>{rate.toFixed(1)}%/d</span>
        </div>
      </div>

      {tooltip && (
        <div style={{
          position: 'absolute', pointerEvents: 'none', whiteSpace: 'nowrap',
          top: Math.max(0, tooltip.pxY - 38),
          left: tooltip.pxX > (containerRef.current?.offsetWidth ?? 200) * 0.6 ? tooltip.pxX - 130 : tooltip.pxX + 8,
          background: 'rgba(13,14,18,0.95)', border: `1px solid ${color}55`,
          borderRadius: 7, padding: '4px 8px', backdropFilter: 'blur(8px)',
        }}>
          <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.65)', marginBottom: 1 }}>{sd(tooltip.p.date)}</div>
          <div style={{ fontSize: 11, fontWeight: 700, color }}>{fmt(tooltip.p.value)} {unit}</div>
        </div>
      )}

      {clTooltip && <ChangelogTooltip x={clTooltip.x} y={clTooltip.y} entries={clTooltip.entries} />}
    </div>

    {modalEntries && <ChangelogModal entries={modalEntries} onClose={() => setModalEntries(null)} />}
    </>
  )
}

// ── Status pill (lower is better — for CPRL/CPA) ──
function StatusPill({ value, target }: { value: number; target: number }) {
  const div = value > 0 ? ((value - target) / target) * 100 : null
  if (div === null) return null
  const sc = div <= 0 ? '#34d399' : div <= 10 ? '#fbbf24' : '#f87171'
  const sl = div <= 0 ? '🟢 On Target' : div <= 10 ? '🟡 Slightly Over' : '🔴 Over Target'
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 6, background: `${sc}15`, border: `1px solid ${sc}30`, borderRadius: 5, padding: '2px 6px' }}>
      <div style={{ width: 4, height: 4, borderRadius: '50%', background: sc }} />
      <span style={{ fontSize: 9, fontWeight: 700, color: sc }}>{sl}</span>
      <span style={{ fontSize: 8, color: sc, opacity: 0.8 }}>{div > 0 ? '+' : ''}{div.toFixed(1)}%</span>
    </div>
  )
}

// ── ROAS status pill (higher is better) ──
function RoasStatusPill({ roas }: { roas: number }) {
  if (roas <= 0) return null
  const sc = roas >= 3 ? '#34d399' : roas >= 2 ? '#fbbf24' : '#f87171'
  const sl = roas >= 3 ? '🟢 Healthy' : roas >= 2 ? '🟡 Moderate' : '🔴 Low'
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 6, background: `${sc}15`, border: `1px solid ${sc}30`, borderRadius: 5, padding: '2px 6px' }}>
      <div style={{ width: 4, height: 4, borderRadius: '50%', background: sc }} />
      <span style={{ fontSize: 9, fontWeight: 700, color: sc }}>{sl}</span>
    </div>
  )
}

export function GeneralOverviewPage() {
  // ── Date bounds ──
  const { data: brandBounds } = useQuery({
    queryKey: ['date-bounds'],
    queryFn: async () => {
      const res = await fetch(`${D1_WORKER_URL}/v2/date-bounds`)
      return (await res.json()) as BrandBounds[]
    },
    staleTime: 5 * 60_000,
  })

  const activeBounds = useMemo(() => {
    if (!brandBounds?.length) return null
    const earliest = brandBounds.reduce((e, b) => b.earliest < e ? b.earliest : e, brandBounds[0].earliest)
    const latest = brandBounds.reduce((l, b) => b.latest > l ? b.latest : l, brandBounds[0].latest)
    return { brand: 'ALL', earliest, latest, skus: [] } as BrandBounds
  }, [brandBounds])

  // Per-brand bounds for clamping queries
  const mncBounds = useMemo(() => brandBounds?.find(b => b.brand === 'MNC') ?? null, [brandBounds])
  const golBounds = useMemo(() => brandBounds?.find(b => b.brand === 'GOL') ?? null, [brandBounds])
  const mciBounds = useMemo(() => brandBounds?.find(b => b.brand === 'MCI') ?? null, [brandBounds])

  // Clamp date range to a brand's own bounds
  const clamp = (from: string, to: string, bounds: BrandBounds | null) => {
    if (!bounds) return { from, to }
    const cFrom = from < bounds.earliest ? bounds.earliest : from
    const cTo = to > bounds.latest ? capToH2(bounds.latest) : to
    return { from: cFrom, to: cTo }
  }

  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')

  const [didInit, setDidInit] = useState(false)
  if (activeBounds && !didInit) {
    const latest = capToH2(activeBounds.latest)
    const t = new Date(latest + 'T00:00:00')
    t.setDate(t.getDate() - 29)
    const fStr = dateStr(t)
    setFrom(fStr < activeBounds.earliest ? activeBounds.earliest : fStr)
    setTo(latest)
    setDidInit(true)
  }

  const activeFrom = from
  const activeTo = to

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

  // ── Refresh ──
  const [refreshNonce, setRefreshNonce] = useState(0)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const spinRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const [spinAngle, setSpinAngle] = useState(0)

  const handleRefresh = () => {
    if (isRefreshing) return
    setIsRefreshing(true)
    setRefreshNonce(n => n + 1)
    if (spinRef.current) clearInterval(spinRef.current)
    spinRef.current = setInterval(() => setSpinAngle(a => a + 15), 30)
    setTimeout(() => {
      setIsRefreshing(false)
      if (spinRef.current) clearInterval(spinRef.current)
    }, 1500)
  }

  // ── MNC data fetch ──
  const mncRange = useMemo(() => clamp(activeFrom, activeTo, mncBounds), [activeFrom, activeTo, mncBounds])
  const { data: mncData, isLoading: mncLoading } = useQuery({
    queryKey: ['overview-mnc', mncRange.from, mncRange.to, refreshNonce],
    queryFn: async () => {
      const res = await fetch(`${D1_WORKER_URL}/v2/consumer-goods?brand=MNC&from=${mncRange.from}&to=${mncRange.to}${refreshNonce > 0 ? '&bust=' + Date.now() : ''}`)
      return (await res.json()) as BrandData
    },
    enabled: !!mncRange.from && !!mncRange.to,
    staleTime: 5 * 60_000,
  })

  // ── Shared brand metrics computation ──
  function computeBrandMetrics(bd: BrandData) {
    const perf = bd.performance ?? []
    const conv = bd.conversions ?? []
    const sales = bd.sales ?? []

    const totalSpend = perf.reduce((s, r) => s + (r.ad_spend ?? 0), 0)
    const totalLeads = conv.reduce((s, r) => s + (r.mongo_real_lead_ccom ?? 0) + (r.mongo_real_lead_d2or ?? 0) + (r.mongo_real_lead_mpsh ?? 0) + (r.mongo_real_lead_ofls ?? 0), 0)
    const totalPurchases = conv.reduce((s, r) => s + (r.mongo_purchase_ccom ?? 0), 0)
    const totalRevenue = sales.reduce((s, r) => s + (r.rev_ccom_ca ?? 0) + (r.rev_ccom_crm ?? 0) + (r.rev_mpsh ?? 0) + (r.rev_d2or ?? 0) + (r.rev_ofls ?? 0), 0)

    const cprl = totalLeads > 0 ? totalSpend / totalLeads : 0
    const cpaCC = totalPurchases > 0 ? totalSpend / totalPurchases : 0
    const roas = totalSpend > 0 ? totalRevenue / totalSpend : 0

    const spendByDate = new Map<string, number>()
    for (const r of perf) spendByDate.set(r.date, (spendByDate.get(r.date) ?? 0) + (r.ad_spend ?? 0))

    const leadsByDate = new Map<string, number>()
    for (const r of conv) {
      const leads = (r.mongo_real_lead_ccom ?? 0) + (r.mongo_real_lead_d2or ?? 0) + (r.mongo_real_lead_mpsh ?? 0) + (r.mongo_real_lead_ofls ?? 0)
      leadsByDate.set(r.date, (leadsByDate.get(r.date) ?? 0) + leads)
    }

    const purchByDate = new Map<string, number>()
    for (const r of conv) purchByDate.set(r.date, (purchByDate.get(r.date) ?? 0) + (r.mongo_purchase_ccom ?? 0))

    const allDates = Array.from(new Set([...spendByDate.keys(), ...leadsByDate.keys()])).sort()

    const cprlSeries = allDates.map(d => {
      const sp = spendByDate.get(d) ?? 0
      const ld = leadsByDate.get(d) ?? 0
      return { date: d, value: ld > 0 ? sp / ld : 0 }
    }).filter(p => p.value > 0)

    const cpaDaily = allDates.map(d => ({ date: d, spend: spendByDate.get(d) ?? 0, purchases: purchByDate.get(d) ?? 0 }))
    const cpaSeries = cpaDaily.map((dd, i) => {
      const slice = cpaDaily.slice(Math.max(0, i - 6), i + 1)
      const ts = slice.reduce((s, d) => s + d.spend, 0)
      const tp = slice.reduce((s, d) => s + d.purchases, 0)
      return { date: dd.date, value: tp > 0 ? ts / tp : 0 }
    }).filter(p => p.value > 0)

    const revByDate = new Map<string, number>()
    for (const r of sales) {
      const rev = (r.rev_ccom_ca ?? 0) + (r.rev_ccom_crm ?? 0) + (r.rev_mpsh ?? 0) + (r.rev_d2or ?? 0) + (r.rev_ofls ?? 0)
      revByDate.set(r.date, (revByDate.get(r.date) ?? 0) + rev)
    }
    const roasDaily = allDates.map(d => ({ date: d, spend: spendByDate.get(d) ?? 0, rev: revByDate.get(d) ?? 0 }))
    const roasSeries = roasDaily.map((dd, i) => {
      const start = Math.max(0, i - 13)
      const slice = roasDaily.slice(start, i + 1)
      const ts = slice.reduce((s, d) => s + d.spend, 0)
      const tr = slice.reduce((s, d) => s + d.rev, 0)
      return { date: dd.date, value: ts > 0 ? tr / ts : 0 }
    }).filter(p => p.value > 0)

    const changelog = (bd.changelog ?? []) as ChangelogRow[]

    return { totalSpend, totalLeads, totalPurchases, totalRevenue, cprl, cpaCC, roas, cprlSeries, cpaSeries, roasSeries, changelog }
  }

  // ── MNC computed metrics ──
  const mnc = useMemo(() => mncData ? computeBrandMetrics(mncData) : null, [mncData])

  // ── GOL data fetch ──
  const golRange = useMemo(() => clamp(activeFrom, activeTo, golBounds), [activeFrom, activeTo, golBounds])
  const { data: golData, isLoading: golLoading } = useQuery({
    queryKey: ['overview-gol', golRange.from, golRange.to, refreshNonce],
    queryFn: async () => {
      const res = await fetch(`${D1_WORKER_URL}/v2/consumer-goods?brand=GOL&from=${golRange.from}&to=${golRange.to}${refreshNonce > 0 ? '&bust=' + Date.now() : ''}`)
      return (await res.json()) as BrandData
    },
    enabled: !!golRange.from && !!golRange.to,
    staleTime: 5 * 60_000,
  })

  // ── GOL computed metrics ──
  const gol = useMemo(() => golData ? computeBrandMetrics(golData) : null, [golData])

  // ── MCI data fetch ──
  const mciRange = useMemo(() => clamp(activeFrom, activeTo, mciBounds), [activeFrom, activeTo, mciBounds])
  const { data: mciData, isLoading: mciLoading } = useQuery({
    queryKey: ['overview-mci', mciRange.from, mciRange.to, refreshNonce],
    queryFn: async () => {
      const res = await fetch(`${D1_WORKER_URL}/v2/consumer-goods?brand=MCI&from=${mciRange.from}&to=${mciRange.to}${refreshNonce > 0 ? '&bust=' + Date.now() : ''}`)
      return (await res.json()) as BrandData
    },
    enabled: !!mciRange.from && !!mciRange.to,
    staleTime: 5 * 60_000,
  })

  // ── MCI computed metrics (CPR + CPV, no ROAS) ──
  const mci = useMemo(() => {
    if (!mciData) return null
    const MCI_SKUS = new Set(['CEK', 'A1C', 'WCA'])
    const perf = mciData.performance ?? []
    const conv = mciData.conversions ?? []
    const ga4 = (mciData.ga4 ?? []) as { date: string; ga4_first_visit?: number; ga4_page_view?: number }[]

    const totalSpend = perf.reduce((s, r) => s + (r.ad_spend ?? 0), 0)
    const totalFormSubs = conv.reduce((s, r) => s + ((r as any).mongo_form_submission ?? 0), 0)
    const totalFormConv = conv.reduce((s, r) => s + ((r as any).mongo_form_conversion ?? 0), 0)
    const totalVisits = ga4.reduce((s, r) => s + (r.ga4_first_visit ?? 0), 0)

    const cpr = totalFormSubs > 0 ? totalSpend / totalFormSubs : 0
    const cpv = totalFormConv > 0 ? totalSpend / totalFormConv : 0

    // Build spend by date (filtered by MCI_SKUS, matching HealthcareDashboard)
    const spendByDate = new Map<string, number>()
    for (const r of perf) {
      if (!r.sku || r.sku === '-' || !MCI_SKUS.has(r.sku)) continue
      spendByDate.set(r.date, (spendByDate.get(r.date) ?? 0) + (r.ad_spend ?? 0))
    }

    // Build form submissions by date (filtered by MCI_SKUS)
    const subsByDate = new Map<string, number>()
    for (const r of conv) {
      if (!(r as any).sku || (r as any).sku === '-' || !MCI_SKUS.has((r as any).sku)) continue
      subsByDate.set(r.date, (subsByDate.get(r.date) ?? 0) + ((r as any).mongo_form_submission ?? 0))
    }

    // Build form conversions by date (filtered by MCI_SKUS)
    const convByDate = new Map<string, number>()
    for (const r of conv) {
      if (!(r as any).sku || (r as any).sku === '-' || !MCI_SKUS.has((r as any).sku)) continue
      convByDate.set(r.date, (convByDate.get(r.date) ?? 0) + ((r as any).mongo_form_conversion ?? 0))
    }

    const allDates = Array.from(new Set([...spendByDate.keys(), ...subsByDate.keys()])).sort()

    // CPR series (7d MA)
    const cprDaily = allDates.map(d => ({ date: d, spend: spendByDate.get(d) ?? 0, subs: subsByDate.get(d) ?? 0 }))
    const cprSeries = cprDaily.map((dd, i) => {
      const slice = cprDaily.slice(Math.max(0, i - 6), i + 1)
      const ts = slice.reduce((s, d) => s + d.spend, 0)
      const tsubs = slice.reduce((s, d) => s + d.subs, 0)
      return { date: dd.date, value: tsubs > 0 ? ts / tsubs : 0 }
    }).filter(p => p.value > 0)

    // CPV series (21d MA)
    const cpvDaily = allDates.map(d => ({ date: d, spend: spendByDate.get(d) ?? 0, conv: convByDate.get(d) ?? 0 }))
    const cpvSeries = cpvDaily.map((dd, i) => {
      const slice = cpvDaily.slice(Math.max(0, i - 20), i + 1)
      const ts = slice.reduce((s, d) => s + d.spend, 0)
      const tc = slice.reduce((s, d) => s + d.conv, 0)
      return { date: dd.date, value: tc > 0 ? ts / tc : 0 }
    }).filter(p => p.value > 0)

    const changelog = (mciData.changelog ?? []) as ChangelogRow[]

    return { totalSpend, totalFormSubs, totalFormConv, totalVisits, cpr, cpv, cprSeries, cpvSeries, changelog }
  }, [mciData])

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
          <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#818cf8', boxShadow: '0 0 6px #818cf8aa' }} />
          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', color: '#818cf8', textTransform: 'uppercase' }}>General Overview</span>
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
          title="Refresh"
          style={{
            marginLeft: 4,
            background: isRefreshing ? 'rgba(129,140,248,0.12)' : 'rgba(255,255,255,0.06)',
            border: `1px solid ${isRefreshing ? 'rgba(129,140,248,0.4)' : 'rgba(255,255,255,0.15)'}`,
            borderRadius: 6, color: isRefreshing ? '#818cf8' : 'rgba(255,255,255,0.7)',
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

        {/* ── MNC Brand Snapshot ── */}
        <div style={{
          background: 'rgba(255,255,255,0.04)',
          border: '1px solid rgba(255,255,255,0.09)',
          borderRadius: 14, padding: '24px 28px',
          overflow: 'hidden',
        }}>
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24 }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#f97316', boxShadow: '0 0 8px #f9731688' }} />
            <span style={{ fontSize: 15, fontWeight: 800, letterSpacing: '-0.02em', color: '#fff' }}>MNC</span>
            <span style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.35)', marginLeft: 4 }}>Brand Snapshot</span>
            {mnc && (
              <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.2)', marginLeft: 'auto' }}>
                Ad Spend: {fmtRpM(mnc.totalSpend)}
              </span>
            )}
          </div>

          {mncLoading || !mnc ? (
            <div style={{ padding: '20px 0', textAlign: 'center', color: 'rgba(255,255,255,0.2)', fontSize: 12 }}>
              {mncLoading ? 'Loading MNC data…' : 'No data available'}
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 0 }}>

              {/* ── CPRL ── */}
              <div style={{ flex: '1 1 0', padding: '0 24px 0 0' }}>
                <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', color: 'rgba(255,255,255,0.40)', textTransform: 'uppercase', marginBottom: 6 }}>
                  Ads Performance
                </div>
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 4 }}>
                  <div>
                    <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', color: 'rgba(255,255,255,0.50)', textTransform: 'uppercase', marginBottom: 4 }}>CPRL</div>
                    <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.04em', color: '#fff', lineHeight: 1 }}>
                      {mnc.cprl > 0 ? fmtRp(Math.round(mnc.cprl)) : '—'}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', color: 'rgba(255,255,255,0.50)', textTransform: 'uppercase', marginBottom: 4 }}>Real Leads</div>
                    <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.04em', color: '#fff', lineHeight: 1 }}>{mnc.totalLeads.toLocaleString('id-ID')}</div>
                  </div>
                </div>
                <StatusPill value={mnc.cprl} target={150_000} />
                <div style={{ marginTop: 10 }}>
                  <OverviewChart data={mnc.cprlSeries} color="#818cf8" unit="/ lead" target={150_000} targetLabel="150K" changelog={mnc.changelog} />
                </div>
              </div>

              {/* Divider */}
              <div style={{ width: 1, background: 'rgba(255,255,255,0.06)', alignSelf: 'stretch' }} />

              {/* ── CPA CC ── */}
              <div style={{ flex: '1 1 0', padding: '0 24px' }}>
                <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', color: 'rgba(255,255,255,0.40)', textTransform: 'uppercase', marginBottom: 6 }}>
                  Leads Quality
                </div>
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 4 }}>
                  <div>
                    <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', color: 'rgba(255,255,255,0.50)', textTransform: 'uppercase', marginBottom: 4 }}>CPA CC</div>
                    <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.04em', color: '#fff', lineHeight: 1 }}>
                      {mnc.cpaCC > 0 ? fmtRpM(Math.round(mnc.cpaCC)) : '—'}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', color: 'rgba(255,255,255,0.50)', textTransform: 'uppercase', marginBottom: 4 }}>Purchases CC</div>
                    <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.04em', color: '#fff', lineHeight: 1 }}>{mnc.totalPurchases.toLocaleString('id-ID')}</div>
                  </div>
                </div>
                <StatusPill value={mnc.cpaCC} target={2_000_000} />
                <div style={{ marginTop: 10 }}>
                  <OverviewChart data={mnc.cpaSeries} color="#f472b6" unit="/ purchase" target={2_000_000} targetLabel="2M" changelog={mnc.changelog} formatFn={(v) => fmtRpM(Math.round(v))} />
                </div>
              </div>

              {/* Divider */}
              <div style={{ width: 1, background: 'rgba(255,255,255,0.06)', alignSelf: 'stretch' }} />

              {/* ── ROAS ── */}
              <div style={{ flex: '1 1 0', padding: '0 0 0 24px' }}>
                <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', color: 'rgba(255,255,255,0.40)', textTransform: 'uppercase', marginBottom: 6 }}>
                  RoAS Health
                </div>
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 4 }}>
                  <div>
                    <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', color: 'rgba(255,255,255,0.50)', textTransform: 'uppercase', marginBottom: 4 }}>ROAS</div>
                    <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.04em', color: '#fff', lineHeight: 1 }}>
                      {mnc.roas > 0 ? `${mnc.roas.toFixed(2)}x` : '—'}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', color: 'rgba(255,255,255,0.50)', textTransform: 'uppercase', marginBottom: 4 }}>Revenue</div>
                    <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.04em', color: '#fff', lineHeight: 1 }}>{fmtRpM(mnc.totalRevenue)}</div>
                  </div>
                </div>
                <RoasStatusPill roas={mnc.roas} />
                <div style={{ marginTop: 10 }}>
                  <OverviewChart data={mnc.roasSeries} color="#34d399" unit="x" target={6.59} targetLabel="6.59x" changelog={mnc.changelog} higherIsBetter formatFn={(v) => `${v.toFixed(2)}x`} />
                </div>
              </div>

            </div>
          )}
        </div>

        {/* ── GOL Brand Snapshot ── */}
        <div style={{
          background: 'rgba(255,255,255,0.04)',
          border: '1px solid rgba(255,255,255,0.09)',
          borderRadius: 14, padding: '24px 28px',
          overflow: 'hidden',
        }}>
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24 }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#84cc16', boxShadow: '0 0 8px #84cc1688' }} />
            <span style={{ fontSize: 15, fontWeight: 800, letterSpacing: '-0.02em', color: '#fff' }}>GOL</span>
            <span style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.35)', marginLeft: 4 }}>Brand Snapshot</span>
            {gol && (
              <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.2)', marginLeft: 'auto' }}>
                Ad Spend: {fmtRpM(gol.totalSpend)}
              </span>
            )}
          </div>

          {golLoading || !gol ? (
            <div style={{ padding: '20px 0', textAlign: 'center', color: 'rgba(255,255,255,0.2)', fontSize: 12 }}>
              {golLoading ? 'Loading GOL data…' : 'No data available'}
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 0 }}>

              {/* ── CPRL ── */}
              <div style={{ flex: '1 1 0', padding: '0 24px 0 0' }}>
                <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', color: 'rgba(255,255,255,0.40)', textTransform: 'uppercase', marginBottom: 6 }}>
                  Ads Performance
                </div>
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 4 }}>
                  <div>
                    <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', color: 'rgba(255,255,255,0.50)', textTransform: 'uppercase', marginBottom: 4 }}>CPRL</div>
                    <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.04em', color: '#fff', lineHeight: 1 }}>
                      {gol.cprl > 0 ? fmtRp(Math.round(gol.cprl)) : '—'}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', color: 'rgba(255,255,255,0.50)', textTransform: 'uppercase', marginBottom: 4 }}>Real Leads</div>
                    <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.04em', color: '#fff', lineHeight: 1 }}>{gol.totalLeads.toLocaleString('id-ID')}</div>
                  </div>
                </div>
                {(() => {
                  const avg = gol.cprlSeries.length > 0 ? Math.round(gol.cprlSeries.reduce((s, p) => s + p.value, 0) / gol.cprlSeries.length) : 0
                  const label = avg >= 1_000_000 ? `${(avg / 1_000_000).toFixed(1)}M` : avg >= 1_000 ? `${Math.round(avg / 1_000)}K` : `${avg}`
                  return (
                    <>
                      <StatusPill value={gol.cprl} target={avg || 150_000} />
                      <div style={{ marginTop: 10 }}>
                        <OverviewChart data={gol.cprlSeries} color="#818cf8" unit="/ lead" target={avg || 150_000} targetLabel={`${label} avg`} changelog={gol.changelog} />
                      </div>
                    </>
                  )
                })()}
              </div>

              {/* Divider */}
              <div style={{ width: 1, background: 'rgba(255,255,255,0.06)', alignSelf: 'stretch' }} />

              {/* ── CPA CC ── */}
              <div style={{ flex: '1 1 0', padding: '0 24px' }}>
                <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', color: 'rgba(255,255,255,0.40)', textTransform: 'uppercase', marginBottom: 6 }}>
                  Leads Quality
                </div>
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 4 }}>
                  <div>
                    <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', color: 'rgba(255,255,255,0.50)', textTransform: 'uppercase', marginBottom: 4 }}>CPA CC</div>
                    <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.04em', color: '#fff', lineHeight: 1 }}>
                      {gol.cpaCC > 0 ? fmtRpM(Math.round(gol.cpaCC)) : '—'}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', color: 'rgba(255,255,255,0.50)', textTransform: 'uppercase', marginBottom: 4 }}>Purchases CC</div>
                    <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.04em', color: '#fff', lineHeight: 1 }}>{gol.totalPurchases.toLocaleString('id-ID')}</div>
                  </div>
                </div>
                <StatusPill value={gol.cpaCC} target={2_000_000} />
                <div style={{ marginTop: 10 }}>
                  <OverviewChart data={gol.cpaSeries} color="#f472b6" unit="/ purchase" target={2_000_000} targetLabel="2M" changelog={gol.changelog} formatFn={(v) => fmtRpM(Math.round(v))} />
                </div>
              </div>

              {/* Divider */}
              <div style={{ width: 1, background: 'rgba(255,255,255,0.06)', alignSelf: 'stretch' }} />

              {/* ── ROAS ── */}
              <div style={{ flex: '1 1 0', padding: '0 0 0 24px' }}>
                <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', color: 'rgba(255,255,255,0.40)', textTransform: 'uppercase', marginBottom: 6 }}>
                  RoAS Health
                </div>
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 4 }}>
                  <div>
                    <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', color: 'rgba(255,255,255,0.50)', textTransform: 'uppercase', marginBottom: 4 }}>ROAS</div>
                    <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.04em', color: '#fff', lineHeight: 1 }}>
                      {gol.roas > 0 ? `${gol.roas.toFixed(2)}x` : '—'}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', color: 'rgba(255,255,255,0.50)', textTransform: 'uppercase', marginBottom: 4 }}>Revenue</div>
                    <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.04em', color: '#fff', lineHeight: 1 }}>{fmtRpM(gol.totalRevenue)}</div>
                  </div>
                </div>
                <RoasStatusPill roas={gol.roas} />
                <div style={{ marginTop: 10 }}>
                  <OverviewChart data={gol.roasSeries} color="#34d399" unit="x" target={6.59} targetLabel="6.59x" changelog={gol.changelog} higherIsBetter formatFn={(v) => `${v.toFixed(2)}x`} />
                </div>
              </div>

            </div>
          )}
        </div>

        {/* ── MCI Brand Snapshot ── */}
        <div style={{
          background: 'rgba(255,255,255,0.04)',
          border: '1px solid rgba(255,255,255,0.09)',
          borderRadius: 14, padding: '24px 28px',
          overflow: 'hidden',
        }}>
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24 }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#34d399', boxShadow: '0 0 8px #34d39988' }} />
            <span style={{ fontSize: 15, fontWeight: 800, letterSpacing: '-0.02em', color: '#fff' }}>MCI</span>
            <span style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.35)', marginLeft: 4 }}>Brand Snapshot</span>
            {mci && (
              <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.2)', marginLeft: 'auto' }}>
                Ad Spend: {fmtRpM(mci.totalSpend)}
              </span>
            )}
          </div>

          {mciLoading || !mci ? (
            <div style={{ padding: '20px 0', textAlign: 'center', color: 'rgba(255,255,255,0.2)', fontSize: 12 }}>
              {mciLoading ? 'Loading MCI data…' : 'No data available'}
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 0 }}>

              {/* ── CPR ── */}
              <div style={{ flex: '1 1 0', padding: '0 24px 0 0' }}>
                <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', color: 'rgba(255,255,255,0.40)', textTransform: 'uppercase', marginBottom: 6 }}>
                  Ads Performance
                </div>
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 4 }}>
                  <div>
                    <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', color: 'rgba(255,255,255,0.50)', textTransform: 'uppercase', marginBottom: 4 }}>CPR (Cost/Result)</div>
                    <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.04em', color: '#fff', lineHeight: 1 }}>
                      {mci.cpr > 0 ? fmtRp(Math.round(mci.cpr)) : '—'}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', color: 'rgba(255,255,255,0.50)', textTransform: 'uppercase', marginBottom: 4 }}>Form Submissions</div>
                    <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.04em', color: '#fff', lineHeight: 1 }}>{mci.totalFormSubs.toLocaleString('id-ID')}</div>
                  </div>
                </div>
                <StatusPill value={mci.cpr} target={100_000} />
                <div style={{ marginTop: 10 }}>
                  <OverviewChart data={mci.cprSeries} color="#818cf8" unit="/ result" target={100_000} targetLabel="100K" changelog={mci.changelog} />
                </div>
              </div>

              {/* Divider */}
              <div style={{ width: 1, background: 'rgba(255,255,255,0.06)', alignSelf: 'stretch' }} />

              {/* ── CPV ── */}
              <div style={{ flex: '1 1 0', padding: '0 24px' }}>
                <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', color: 'rgba(255,255,255,0.40)', textTransform: 'uppercase', marginBottom: 6 }}>
                  Leads Quality
                </div>
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 4 }}>
                  <div>
                    <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', color: 'rgba(255,255,255,0.50)', textTransform: 'uppercase', marginBottom: 4 }}>CPV (Cost/Visit)</div>
                    <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.04em', color: '#fff', lineHeight: 1 }}>
                      {mci.cpv > 0 ? fmtRpM(Math.round(mci.cpv)) : '—'}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', color: 'rgba(255,255,255,0.50)', textTransform: 'uppercase', marginBottom: 4 }}>Form Conversions</div>
                    <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.04em', color: '#fff', lineHeight: 1 }}>{mci.totalFormConv.toLocaleString('id-ID')}</div>
                  </div>
                </div>
                <StatusPill value={mci.cpv} target={500_000} />
                <div style={{ marginTop: 10 }}>
                  <OverviewChart data={mci.cpvSeries} color="#f472b6" unit="/ visit" target={500_000} targetLabel="500K" changelog={mci.changelog} formatFn={(v) => fmtRpM(Math.round(v))} />
                </div>
              </div>

              {/* Divider */}
              <div style={{ width: 1, background: 'rgba(255,255,255,0.06)', alignSelf: 'stretch' }} />

              {/* ── GA4 Visits (info only, no chart) ── */}
              <div style={{ flex: '1 1 0', padding: '0 0 0 24px' }}>
                <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', color: 'rgba(255,255,255,0.40)', textTransform: 'uppercase', marginBottom: 6 }}>
                  Website Traffic
                </div>
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 4 }}>
                  <div>
                    <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', color: 'rgba(255,255,255,0.50)', textTransform: 'uppercase', marginBottom: 4 }}>First Visits</div>
                    <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.04em', color: '#fff', lineHeight: 1 }}>
                      {mci.totalVisits.toLocaleString('id-ID')}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', color: 'rgba(255,255,255,0.50)', textTransform: 'uppercase', marginBottom: 4 }}>Ad Spend</div>
                    <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.04em', color: '#fff', lineHeight: 1 }}>{fmtRpM(mci.totalSpend)}</div>
                  </div>
                </div>
                <div style={{ marginTop: 28, padding: '20px 0', textAlign: 'center', color: 'rgba(255,255,255,0.12)', fontSize: 11 }}>
                  No RoAS data for MCI
                </div>
              </div>

            </div>
          )}
        </div>

      </div>
    </div>
  )
}
