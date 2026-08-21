/**
 * CampaignExplorerPage — MNC Campaign & Ad-level performance explorer
 */
import React, { useState, useMemo, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { D1_WORKER_URL } from '../config/dataSource'
import { fmtRp } from '../utils/format'
import { capToH2, dateStr, PRESETS } from './ProductPerformancePage'

// ── Date helpers ──────────────────────────────────────────────────────────────
function daysBefore(base: string, n: number) { const d = new Date(base + 'T00:00:00'); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10) }
interface BrandBounds { brand: string; earliest: string; latest: string; skus: string[] }

// ── Types ─────────────────────────────────────────────────────────────────────
interface CampaignRow {
  campaign_id: string; campaign_name: string | null; sku: string | null
  funnel: string | null; traffic_source: string
  ad_spend: number; impressions: number; link_click: number
}
interface ConvRow {
  campaign_id?: string; ad_id?: string; sku?: string
  real_lead_ccom: number; real_lead_d2or: number; real_lead_mpsh: number; real_lead_ofls: number
  purchase_ccom: number; purchase_revenue: number
  form_submission?: number; form_conversion?: number
}
interface AdPerfRow { ad_id: string; ad_spend: number; impressions: number; link_click: number }
interface AdDimRow { ad_id: string; ad_title: string | null; internal_ad_id: string | null; sku: string | null; funnel: string | null; publish_date: string | null; grade_ads_quality: string | null }
interface DailyPerfRow { date: string; ad_spend: number; impressions: number; link_click: number }
interface DailyConvRow { date: string; real_lead_ccom: number; real_lead_d2or: number; real_lead_mpsh: number; real_lead_ofls: number; purchase_ccom: number; purchase_revenue: number; form_submission?: number; form_conversion?: number }
interface DailyGa4Row { date: string; ga4_page_view: number; ga4_view_offer: number }

interface ApiResponse {
  campaigns: CampaignRow[]
  campaign_conversions: ConvRow[]
  ads: AdPerfRow[]
  ad_conversions: ConvRow[]
  ad_dimension: AdDimRow[]
  daily_perf: DailyPerfRow[]
  daily_conv: DailyConvRow[]
  daily_ga4: DailyGa4Row[]
  ads_added: { campaign_id: string; ads_added: number }[]
  bridge_page: { ad_id: string; created_by: string | null; lp_url: string | null; notion_url: string | null }[]
}

const fmtK = (n: number) => n >= 1_000_000 ? (n / 1_000_000).toFixed(1) + 'M' : n >= 1_000 ? (n / 1_000).toFixed(0) + 'K' : n.toString()
const fmtRpShort = (n: number) => 'Rp ' + fmtK(n)
const fmtPct = (n: number) => (n * 100).toFixed(1) + '%'
const fmtPctShort = (n: number) => (n * 100).toFixed(1) + '%'
const stripAdPrefix = (title: string) => { const idx = title.indexOf('ADS'); return idx >= 0 ? title.slice(idx) : title }

// ── Moving average helper ──
function movingAvg(data: number[], window: number): number[] {
  return data.map((_, i) => {
    const start = Math.max(0, i - window + 1)
    const slice = data.slice(start, i + 1)
    return slice.reduce((a, b) => a + b, 0) / slice.length
  })
}

// ── Full Chart (matching MNC dashboard Sparkline) ──
interface ChartPoint { date: string; value: number }
interface AdsMarker { date: string; titles: string[] }

function FullChart({ data, color, fixedTarget, higherIsBetter, fmt, fmtShort, chartKey, adsMarkers = [] }: {
  data: ChartPoint[]; color: string; fixedTarget?: number; higherIsBetter: boolean
  fmt: (v: number) => string; fmtShort: (v: number) => string; chartKey: string
  adsMarkers?: AdsMarker[]
}) {
  const ref = useRef<SVGSVGElement>(null)
  const [tooltip, setTooltip] = useState<{ x: number; y: number; p: ChartPoint } | null>(null)
  const [markerTip, setMarkerTip] = useState<{ x: number; y: number; titles: string[] } | null>(null)

  const VW = 320, VH = 140
  const PAD = { top: 10, right: 52, bottom: 20, left: 6 }
  const innerW = VW - PAD.left - PAD.right
  const innerH = VH - PAD.top - PAD.bottom

  if (data.length < 2) return <div style={{ height: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.3)', fontSize: 10 }}>—</div>

  const vals = data.map(d => d.value)
  const n = vals.length
  const avg = vals.reduce((s, v) => s + v, 0) / n
  const target = fixedTarget ?? avg

  const minV = 0
  const maxV = Math.max(target * 2, ...vals)
  const rng = maxV - minV || 1

  // Regression
  const mX = (n - 1) / 2
  const slope = vals.reduce((s, v, i) => s + (i - mX) * (v - avg), 0) / vals.reduce((s, _, i) => s + (i - mX) ** 2, 0)
  const ic = avg - slope * mX
  const rate = target > 0 ? Math.abs((slope / target) * 100) : 0

  const tUp = slope > 0
  const tc = higherIsBetter ? (tUp ? '#34d399' : '#f87171') : (tUp ? '#f87171' : '#34d399')
  const trendLabel = higherIsBetter ? (tUp ? 'Converging' : 'Diverging') : (tUp ? 'Diverging' : 'Converging')
  const trendArrow = tUp ? '↑' : '↓'
  const isConverging = trendLabel === 'Converging'
  const lineColor = isConverging ? '#34d399' : rate < 1 ? '#fbbf24' : '#f87171'

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
    if (aA && bA) { above.push(`${xa},${tY} ${xa},${ya} ${xb},${yb} ${xb},${tY}`) }
    else if (!aA && !bA) { below.push(`${xa},${tY} ${xa},${ya} ${xb},${yb} ${xb},${tY}`) }
    else {
      const t = (tY - ya) / (yb - ya), xi = xa + t * (xb - xa)
      if (aA) { above.push(`${xa},${tY} ${xa},${ya} ${xi},${tY}`); below.push(`${xi},${tY} ${xb},${yb} ${xb},${tY}`) }
      else { below.push(`${xa},${tY} ${xa},${ya} ${xi},${tY}`); above.push(`${xi},${tY} ${xb},${yb} ${xb},${tY}`) }
    }
  }
  const aboveColor = higherIsBetter ? '#34d399' : '#f87171'
  const belowColor = higherIsBetter ? '#f87171' : '#34d399'

  const pts = data.map((d, i) => `${xs(i)},${ys(d.value)}`).join(' ')
  const sd = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })

  // Ads-added markers: match marker dates to data indices
  const dateIdx = new Map(data.map((d, i) => [d.date, i]))
  const markers = adsMarkers.filter(m => dateIdx.has(m.date)).map(m => ({ ...m, i: dateIdx.get(m.date)! }))

  const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const svg = ref.current; if (!svg) return
    const ctm = svg.getScreenCTM(); if (!ctm) return
    const svgPt = svg.createSVGPoint()
    svgPt.x = e.clientX; svgPt.y = e.clientY
    const { x: svgX } = svgPt.matrixTransform(ctm.inverse())
    const idx = Math.max(0, Math.min(n - 1, Math.round(((svgX - PAD.left) / innerW) * (n - 1))))
    setTooltip({ x: xs(idx), y: ys(data[idx].value), p: data[idx] })
  }

  return (
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ position: 'relative' }}>
        <svg ref={ref} viewBox={`0 0 ${VW} ${VH}`} width="100%" style={{ display: 'block', overflow: 'visible', cursor: 'crosshair' }}
          onMouseMove={onMove} onMouseLeave={() => { setTooltip(null); setMarkerTip(null) }}>
          {above.map((p, i) => <polygon key={`a${i}`} points={p} fill={aboveColor} fillOpacity="0.1" />)}
          {below.map((p, i) => <polygon key={`b${i}`} points={p} fill={belowColor} fillOpacity="0.1" />)}
          <line x1={PAD.left} y1={tY} x2={VW - PAD.right} y2={tY} stroke="#94a3b8" strokeOpacity="0.75" strokeWidth="2" strokeDasharray="4,3" />
          <text x={VW - PAD.right + 3} y={tY + 5} fontSize="12" fill="#94a3b8" fontWeight="700">{fmtShort(target)}</text>
          <line x1={xs(0)} y1={cl(ys(ic))} x2={xs(n - 1)} y2={cl(ys(slope * (n - 1) + ic))} stroke={tc} strokeOpacity="0.65" strokeWidth="3.5" strokeDasharray="4,3" />
          <polyline points={pts} fill="none" stroke={lineColor} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />

          {/* Ads-added markers */}
          {markers.map(m => (
            <g key={m.i}
              onMouseEnter={(e) => setMarkerTip({ x: e.clientX, y: e.clientY, titles: m.titles })}
              onMouseLeave={() => setMarkerTip(null)}
              style={{ cursor: 'pointer' }}>
              <rect x={xs(m.i) - 8} y={PAD.top - 14} width={16} height={18} fill="transparent" />
              <line x1={xs(m.i)} y1={PAD.top} x2={xs(m.i)} y2={PAD.top + innerH}
                stroke="#60a5fa" strokeOpacity="0.28" strokeWidth="1" strokeDasharray="2,2" />
              <polygon points={`${xs(m.i)},${PAD.top - 1} ${xs(m.i) - 4},${PAD.top - 8} ${xs(m.i) + 4},${PAD.top - 8}`}
                fill="#60a5fa" opacity="0.9" />
            </g>
          ))}

          {tooltip && <g>
            <line x1={tooltip.x} y1={PAD.top} x2={tooltip.x} y2={PAD.top + innerH} stroke="rgba(255,255,255,0.08)" strokeWidth="1" />
            <circle cx={tooltip.x} cy={tooltip.y} r="4.5" fill={color} stroke="#0d0e12" strokeWidth="1.5" />
          </g>}
          <text x={PAD.left} y={VH - 2} fontSize="10" fill="rgba(255,255,255,0.48)" textAnchor="start">{sd(data[0].date)}</text>
          <text x={VW - PAD.right} y={VH - 2} fontSize="10" fill="rgba(255,255,255,0.48)" textAnchor="end">{sd(data[n - 1].date)}</text>
        </svg>
        {tooltip && (
          <div style={{ position: 'absolute', pointerEvents: 'none', whiteSpace: 'nowrap', zIndex: 99, bottom: 0, left: tooltip.x > VW * 0.6 ? tooltip.x - 130 : tooltip.x + 8, background: 'rgba(13,14,18,0.95)', border: `1px solid ${color}50`, borderRadius: 7, padding: '4px 8px', backdropFilter: 'blur(8px)' }}>
            <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.65)', marginBottom: 1 }}>{sd(tooltip.p.date)}</div>
            <div style={{ fontSize: 11, fontWeight: 700, color }}>{fmt(tooltip.p.value)}</div>
          </div>
        )}
        {markerTip && (
          <div style={{ position: 'fixed', pointerEvents: 'none', zIndex: 999, left: markerTip.x + 10, top: markerTip.y - 10, background: 'rgba(13,14,18,0.95)', border: '1px solid rgba(96,165,250,0.4)', borderRadius: 7, padding: '6px 10px', backdropFilter: 'blur(8px)', maxWidth: 560 }}>
            <div style={{ fontSize: 9, fontWeight: 700, color: '#60a5fa', marginBottom: 3, letterSpacing: '0.05em' }}>ADS ADDED</div>
            {markerTip.titles.map((t, i) => (
              <div key={i} style={{ fontSize: 10, color: '#fff', lineHeight: 1.5 }}>• {t}</div>
            ))}
          </div>
        )}
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-start', marginTop: 6 }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: `${tc}12`, border: `1px solid ${tc}28`, borderRadius: 4, padding: '2px 6px' }}>
          <span style={{ fontSize: 9, fontWeight: 800, color: tc }}>{trendArrow}</span>
          <span style={{ fontSize: 9, fontWeight: 700, color: tc }}>{trendLabel}</span>
          <span style={{ fontSize: 9, color: tc }}>{rate.toFixed(1)}%/d</span>
        </div>
      </div>
    </div>
  )
}

// ── Metric Card with full chart ──
function MetricCard({ label, value, sub, color, series, fixedTarget, higherIsBetter, fmt: fmtFn, fmtShort: fmtShortFn, adsMarkers }: {
  label: string; value: string; sub?: string; color: string; series: ChartPoint[]
  fixedTarget?: number; higherIsBetter: boolean
  fmt: (v: number) => string; fmtShort: (v: number) => string
  adsMarkers?: AdsMarker[]
}) {
  const isGood = (() => {
    if (series.length < 2 || !fixedTarget) return true
    const last = series[series.length - 1].value
    return higherIsBetter ? last >= fixedTarget : last <= fixedTarget
  })()
  const divergence = (() => {
    if (series.length < 2 || !fixedTarget) return 0
    const last = series[series.length - 1].value
    return Math.abs(((last - fixedTarget) / fixedTarget) * 100)
  })()
  const isWarn = !isGood && divergence < 10
  const clr = isGood ? '#34d399' : isWarn ? '#fbbf24' : '#f87171'
  const bg = isGood ? 'rgba(52,211,153,0.12)' : isWarn ? 'rgba(251,191,36,0.12)' : 'rgba(248,113,113,0.12)'
  const bdr = isGood ? 'rgba(52,211,153,0.28)' : isWarn ? 'rgba(251,191,36,0.28)' : 'rgba(248,113,113,0.28)'

  return (
    <div style={{ flex: '1 1 0', minWidth: 0, display: 'flex', flexDirection: 'column' }}>
      <div style={{ marginBottom: 8, minHeight: 72 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 2 }}>
          <div style={{ width: 4, height: 4, borderRadius: '50%', background: color }} />
          <span style={{ fontSize: 9, fontWeight: 700, color, letterSpacing: '0.08em', textTransform: 'uppercase' as const }}>{label}</span>
        </div>
        <div style={{ fontSize: 16, fontWeight: 800, letterSpacing: '-0.04em', color: '#fff', lineHeight: 1 }}>{value}</div>
        {sub && <div style={{ fontSize: 9, fontWeight: 600, color: 'rgba(255,255,255,0.5)', letterSpacing: '0.05em', textTransform: 'uppercase' as const, marginTop: 3 }}>{sub}</div>}
        {fixedTarget && (
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 2, marginTop: 4, padding: '1px 5px', borderRadius: 20, background: bg, border: `1px solid ${bdr}`, fontSize: 9, fontWeight: 700, color: clr, whiteSpace: 'nowrap' }}>
            {isGood ? '↑' : '↓'} {isGood ? 'On Target' : 'Off Target'} · {divergence.toFixed(1)}%
          </div>
        )}
      </div>
      <FullChart data={series} color={color} fixedTarget={fixedTarget} higherIsBetter={higherIsBetter} fmt={fmtFn} fmtShort={fmtShortFn} chartKey={label} adsMarkers={adsMarkers} />
    </div>
  )
}

type SortKey = 'name' | 'funnel' | 'spend' | 'leads' | 'purchases' | 'revenue' | 'cprl' | 'cpa' | 'roas' | 'ads_added' | 'title' | 'publish_date' | 'status'
type SortDir = 'asc' | 'desc'

interface BrandConfig {
  brand: string
  title: string
  badgeColor: string
  skuOrder: string[]
  skuMeta: Record<string, { name: string; color: string }>
  showGrade?: boolean
  useFormConversions?: boolean  // MCI: map form_submission→leads, form_conversion→purchase
  cprlLabel?: string           // 'CPRL' (default) or 'CPR'
  cpaLabel?: string            // 'CPA CC' (default) or 'CPV'
  hideRoas?: boolean           // hide RoAS column in campaign table
}

const MNC_CONFIG: BrandConfig = {
  brand: 'MNC', title: 'MNC Campaigns', badgeColor: '#f97316',
  skuOrder: ['MSF', 'MTA', 'MNS', 'M3P'],
  skuMeta: {
    MSF: { name: 'Superfood', color: '#f97316' },
    MTA: { name: 'Metafiber', color: '#818cf8' },
    MNS: { name: 'Nightsure', color: '#34d399' },
    M3P: { name: '3Peptide', color: '#f472b6' },
  },
  showGrade: false,
}

const GOL_CONFIG: BrandConfig = {
  brand: 'GOL', title: 'GOL Campaigns', badgeColor: '#ef4444',
  skuOrder: ['GIN', 'SIX'],
  skuMeta: {
    GIN: { name: 'Ginseng', color: '#ef4444' },
    SIX: { name: 'Six Herbs', color: '#34d399' },
  },
  showGrade: false,
}

const MCI_CONFIG: BrandConfig = {
  brand: 'MCI', title: 'MCI Campaigns', badgeColor: '#34d399',
  skuOrder: ['CEK', 'A1C', 'WCA'],
  skuMeta: {
    CEK: { name: 'CEK', color: '#34d399' },
    A1C: { name: 'A1C', color: '#38bdf8' },
    WCA: { name: 'WCA', color: '#a78bfa' },
  },
  showGrade: false,
  useFormConversions: true,
  cprlLabel: 'CPR',
  cpaLabel: 'CPV',
  hideRoas: true,
}

export function CampaignExplorerPage() { return <CampaignPage config={MNC_CONFIG} /> }
export function GolCampaignExplorerPage() { return <CampaignPage config={GOL_CONFIG} /> }
export function MciCampaignExplorerPage() { return <CampaignPage config={MCI_CONFIG} /> }

function CampaignPage({ config }: { config: BrandConfig }) {
  const { brand, title: pageTitle, badgeColor, skuOrder, skuMeta: SKU_META, showGrade, useFormConversions, cprlLabel: cfgCprlLabel, cpaLabel: cfgCpaLabel, hideRoas } = config
  // ── Date bounds ──
  const { data: brandBounds } = useQuery({
    queryKey: ['date-bounds'],
    queryFn: async () => {
      const res = await fetch(`${D1_WORKER_URL}/v2/date-bounds`)
      return (await res.json()) as BrandBounds[]
    },
    staleTime: 5 * 60_000,
  })

  const activeBounds = useMemo(() => brandBounds?.find(b => b.brand === brand), [brandBounds, brand])

  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [lastInit, setLastInit] = useState(false)
  useMemo(() => {
    if (activeBounds && !lastInit) {
      const latest = capToH2(activeBounds.latest)
      const d = new Date(latest + 'T00:00:00')
      d.setDate(d.getDate() - 29)
      const fromStr = dateStr(d)
      setDateTo(latest)
      setDateFrom(fromStr < activeBounds.earliest ? activeBounds.earliest : fromStr)
      setLastInit(true)
    }
  }, [activeBounds, lastInit])

  const [selectedCampaign, setSelectedCampaign] = useState<string | null>(null)
  const [sortKey, setSortKey] = useState<SortKey>('funnel')
  const [sortDir, setSortDir] = useState<SortDir>('asc')
  const [adSortKey, setAdSortKey] = useState<SortKey>('leads')
  const [adSortDir, setAdSortDir] = useState<SortDir>('desc')
  const [searchTerm, setSearchTerm] = useState('')
  const [expandedSkus, setExpandedSkus] = useState<Set<string>>(new Set())

  const applyPreset = (days: number) => {
    if (!activeBounds) return
    const latest = capToH2(activeBounds.latest)
    const t = new Date(latest + 'T00:00:00')
    if (days === 0) {
      const f = new Date(t.getFullYear(), t.getMonth(), 1)
      const fStr = dateStr(f)
      setDateFrom(fStr < activeBounds.earliest ? activeBounds.earliest : fStr)
    } else {
      const f = new Date(t)
      f.setDate(f.getDate() - days + 1)
      const fStr = dateStr(f)
      setDateFrom(fStr < activeBounds.earliest ? activeBounds.earliest : fStr)
    }
    setDateTo(latest)
    setSelectedCampaign(null)
  }

  // Fetch campaign data (no campaign_id — overview mode)
  const { data: campData, isFetching: campLoading } = useQuery({
    queryKey: ['campaign-ads', brand, dateFrom, dateTo],
    queryFn: async () => {
      const res = await fetch(`${D1_WORKER_URL}/v2/campaign-ads?brand=${brand}&from=${dateFrom}&to=${dateTo}`)
      if (!res.ok) throw new Error()
      return res.json() as Promise<ApiResponse>
    },
  })

  // Fetch ad-level data when a campaign is selected
  const { data: adData, isFetching: adLoading } = useQuery({
    queryKey: ['campaign-ads-detail', brand, dateFrom, dateTo, selectedCampaign],
    queryFn: async () => {
      const res = await fetch(`${D1_WORKER_URL}/v2/campaign-ads?brand=${brand}&from=${dateFrom}&to=${dateTo}&campaign_id=${selectedCampaign}`)
      if (!res.ok) throw new Error()
      return res.json() as Promise<ApiResponse>
    },
    enabled: !!selectedCampaign,
  })

  // ── Merged campaign data (perf + conversions) ──
  const campaigns = useMemo(() => {
    if (!campData) return []
    // Conv rows now keyed by campaign_id|sku (since worker groups by both)
    const convMap = new Map<string, ConvRow>()
    for (const c of campData.campaign_conversions) convMap.set(`${c.campaign_id}|${c.sku ?? ''}`, c)
    const adsAddedMap = new Map<string, number>()
    for (const a of (campData.ads_added ?? [])) adsAddedMap.set(a.campaign_id, a.ads_added)

    return campData.campaigns.filter(c => c.campaign_name?.includes('[META]')).map(c => {
      const cv = convMap.get(`${c.campaign_id}|${c.sku ?? ''}`)
      const leads = cv ? (useFormConversions ? (cv.form_submission ?? 0) : (cv.real_lead_ccom + cv.real_lead_d2or + cv.real_lead_mpsh + cv.real_lead_ofls)) : 0
      const purchases = cv ? (useFormConversions ? (cv.form_conversion ?? 0) : (cv.purchase_ccom ?? 0)) : 0
      const revenue = useFormConversions ? 0 : (cv?.purchase_revenue ?? 0)
      const adsAdded = adsAddedMap.get(c.campaign_id) ?? 0
      return { ...c, leads, purchases, revenue, cprl: leads > 0 ? c.ad_spend / leads : 0, cpa: purchases > 0 ? c.ad_spend / purchases : 0, roas: c.ad_spend > 0 ? revenue / c.ad_spend : 0, adsAdded }
    })
  }, [campData])

  // ── Group campaigns by SKU ──
  const campaignsBySku = useMemo(() => {
    const grouped: Record<string, typeof campaigns> = {}
    for (const c of campaigns) {
      const s = c.sku ?? 'OTHER'
      if (!grouped[s]) grouped[s] = []
      grouped[s].push(c)
    }
    // Sort campaigns within each SKU
    const mult = sortDir === 'desc' ? -1 : 1
    for (const s of Object.keys(grouped)) {
      grouped[s].sort((a, b) => {
        const av = sortKey === 'name' ? (a.campaign_name ?? '') : sortKey === 'funnel' ? (a.funnel ?? '99') : sortKey === 'leads' ? a.leads : sortKey === 'purchases' ? a.purchases : sortKey === 'revenue' ? a.revenue : sortKey === 'cprl' ? a.cprl : sortKey === 'cpa' ? a.cpa : sortKey === 'roas' ? a.roas : a.ad_spend
        const bv = sortKey === 'name' ? (b.campaign_name ?? '') : sortKey === 'funnel' ? (b.funnel ?? '99') : sortKey === 'leads' ? b.leads : sortKey === 'purchases' ? b.purchases : sortKey === 'revenue' ? b.revenue : sortKey === 'cprl' ? b.cprl : sortKey === 'cpa' ? b.cpa : sortKey === 'roas' ? b.roas : b.ad_spend
        return typeof av === 'string' ? mult * av.localeCompare(bv as string) : mult * ((av as number) - (bv as number))
      })
    }
    return grouped
  }, [campaigns, sortKey, sortDir])

  // ── Ordered SKU list (only SKUs with campaigns) ──
  const activeSkus = useMemo(() => {
    const ordered = skuOrder.filter(s => campaignsBySku[s]?.length)
    const extras = Object.keys(campaignsBySku).filter(s => !skuOrder.includes(s) && campaignsBySku[s]?.length)
    return [...ordered, ...extras]
  }, [campaignsBySku])

  // ── Per-SKU totals ──
  const skuTotals = useMemo(() => {
    const out: Record<string, { spend: number; leads: number; purchases: number; revenue: number; adsAdded: number; cprl: number; cpa: number; roas: number }> = {}
    for (const [sku, rows] of Object.entries(campaignsBySku)) {
      const s = rows.reduce((a, c) => ({ spend: a.spend + c.ad_spend, leads: a.leads + c.leads, purchases: a.purchases + c.purchases, revenue: a.revenue + c.revenue, adsAdded: a.adsAdded + c.adsAdded }), { spend: 0, leads: 0, purchases: 0, revenue: 0, adsAdded: 0 })
      out[sku] = { ...s, cprl: s.leads > 0 ? s.spend / s.leads : 0, cpa: s.purchases > 0 ? s.spend / s.purchases : 0, roas: s.spend > 0 ? s.revenue / s.spend : 0 }
    }
    return out
  }, [campaignsBySku])

  // ── Search: auto-expand matching SKUs ──
  const filteredSkus = useMemo(() => {
    if (!searchTerm) return activeSkus
    const s = searchTerm.toLowerCase()
    return activeSkus.filter(sku => {
      const meta = SKU_META[sku]
      if (meta?.name.toLowerCase().includes(s) || sku.toLowerCase().includes(s)) return true
      return (campaignsBySku[sku] ?? []).some(c => (c.campaign_name ?? '').toLowerCase().includes(s) || c.campaign_id.includes(s))
    })
  }, [activeSkus, searchTerm, campaignsBySku])

  const toggleSku = (sku: string) => {
    setExpandedSkus(prev => {
      const next = new Set(prev)
      if (next.has(sku)) next.delete(sku); else next.add(sku)
      return next
    })
    setSelectedCampaign(null)
  }

  // Filter campaigns within expanded SKU by search term
  const getFilteredCampaigns = (sku: string) => {
    const list = campaignsBySku[sku] ?? []
    if (!searchTerm) return list
    const s = searchTerm.toLowerCase()
    return list.filter(c => (c.campaign_name ?? '').toLowerCase().includes(s) || c.campaign_id.includes(s) || (c.sku ?? '').toLowerCase().includes(s))
  }

  // ── Merged ad data ──
  const ads = useMemo(() => {
    if (!adData) return []
    const convMap = new Map<string, ConvRow>()
    for (const c of adData.ad_conversions) convMap.set(c.ad_id!, c)
    const dimMap = new Map<string, AdDimRow>()
    for (const d of adData.ad_dimension) dimMap.set(d.ad_id, d)
    const bridgeMap = new Map<string, { created_by: string | null; lp_url: string | null; notion_url: string | null }>()
    for (const b of (adData.bridge_page ?? [])) bridgeMap.set(b.ad_id, b)

    const h2 = new Date(); h2.setDate(h2.getDate() - 2); const h2Str = h2.toISOString().slice(0, 10)

    return adData.ads.map(a => {
      const cv = convMap.get(a.ad_id)
      const dim = dimMap.get(a.ad_id)
      const bridge = dim?.internal_ad_id ? bridgeMap.get(dim.internal_ad_id) : null
      const leads = cv ? (useFormConversions ? (cv.form_submission ?? 0) : (cv.real_lead_ccom + cv.real_lead_d2or + cv.real_lead_mpsh + cv.real_lead_ofls)) : 0
      const purchases = cv ? (useFormConversions ? (cv.form_conversion ?? 0) : (cv.purchase_ccom ?? 0)) : 0
      const revenue = useFormConversions ? 0 : (cv?.purchase_revenue ?? 0)
      const publishDate = dim?.publish_date ?? null
      const daysSincePublish = publishDate ? Math.floor((new Date(h2Str).getTime() - new Date(publishDate).getTime()) / 86400000) : 999
      const isLearning = daysSincePublish < 7
      const isBleeder = !isLearning && leads === 0 && purchases === 0 && revenue === 0
      const status: 'Learning' | 'Running' | 'Bleeder' = isLearning ? 'Learning' : isBleeder ? 'Bleeder' : 'Running'
      // Sort order: Learning=0, Running=1, Bleeder=2
      const statusOrder = isLearning ? 0 : isBleeder ? 2 : 1
      const grade = isLearning ? null : (dim?.grade_ads_quality ?? null)
      return {
        ...a, leads, purchases, revenue,
        ad_title: dim?.ad_title ?? null,
        internal_ad_id: dim?.internal_ad_id ?? null,
        sku: dim?.sku ?? null,
        publish_date: publishDate,
        created_by: bridge?.created_by ?? null,
        lp_url: bridge?.lp_url ?? null,
        notion_url: bridge?.notion_url ?? null,
        status, statusOrder, grade,
        cprl: leads > 0 ? a.ad_spend / leads : 0,
        cpa: purchases > 0 ? a.ad_spend / purchases : 0,
        roas: a.ad_spend > 0 ? revenue / a.ad_spend : 0,
      }
    }).filter(a => a.ad_title !== null && !a.ad_title.toLowerCase().includes('(deleted ad)'))
  }, [adData])

  // ── Sorted ads ──
  const sortedAds = useMemo(() => {
    const mult = adSortDir === 'desc' ? -1 : 1
    return [...ads].sort((a, b) => {
      if (adSortKey === 'status') {
        const diff = mult * (a.statusOrder - b.statusOrder)
        return diff !== 0 ? diff : b.ad_spend - a.ad_spend // secondary: spend desc
      }
      const av = adSortKey === 'title' ? (a.ad_title ?? '') : adSortKey === 'publish_date' ? (a.publish_date ?? '') : adSortKey === 'name' ? (a.internal_ad_id ?? '') : adSortKey === 'leads' ? a.leads : adSortKey === 'purchases' ? a.purchases : adSortKey === 'revenue' ? a.revenue : adSortKey === 'cprl' ? a.cprl : adSortKey === 'cpa' ? a.cpa : adSortKey === 'roas' ? a.roas : a.ad_spend
      const bv = adSortKey === 'title' ? (b.ad_title ?? '') : adSortKey === 'publish_date' ? (b.publish_date ?? '') : adSortKey === 'name' ? (b.internal_ad_id ?? '') : adSortKey === 'leads' ? b.leads : adSortKey === 'purchases' ? b.purchases : adSortKey === 'revenue' ? b.revenue : adSortKey === 'cprl' ? b.cprl : adSortKey === 'cpa' ? b.cpa : adSortKey === 'roas' ? b.roas : b.ad_spend
      return typeof av === 'string' ? mult * av.localeCompare(bv as string) : mult * ((av as number) - (bv as number))
    })
  }, [ads, adSortKey, adSortDir])

  // ── Campaign-level chart series (CPRL, CPA CC, CTR, LPVO, VO2L) ──
  const campaignCharts = useMemo(() => {
    if (!adData) return null
    const dp = adData.daily_perf ?? []
    const dc = adData.daily_conv ?? []
    const dg = adData.daily_ga4 ?? []
    if (dp.length === 0) return null

    // Build date-keyed maps
    const dates = dp.map(r => r.date)
    const perfMap = new Map(dp.map(r => [r.date, r]))
    const convMap = new Map(dc.map(r => [r.date, r]))
    const ga4Map = new Map(dg.map(r => [r.date, r]))

    // Raw daily values
    const dailySpend = dates.map(d => perfMap.get(d)?.ad_spend ?? 0)
    const dailyClicks = dates.map(d => perfMap.get(d)?.link_click ?? 0)
    const dailyImpressions = dates.map(d => perfMap.get(d)?.impressions ?? 0)
    const dailyLeads = dates.map(d => {
      const c = convMap.get(d)
      return c ? (useFormConversions ? (c.form_submission ?? 0) : (c.real_lead_ccom + c.real_lead_d2or + c.real_lead_mpsh + c.real_lead_ofls)) : 0
    })
    const dailyPurchases = dates.map(d => {
      const c = convMap.get(d)
      return c ? (useFormConversions ? (c.form_conversion ?? 0) : (c.purchase_ccom ?? 0)) : 0
    })
    const dailyPageView = dates.map(d => ga4Map.get(d)?.ga4_page_view ?? 0)
    const dailyViewOffer = dates.map(d => ga4Map.get(d)?.ga4_view_offer ?? 0)

    // CPRL = MA14(spend) / MA14(leads) — 14D window avoids 0-purchase gaps in per-campaign data
    const spendMA = movingAvg(dailySpend, 14)
    const leadsMA = movingAvg(dailyLeads, 14)
    const cprlSeriesRaw: ChartPoint[] = dates.map((d, i) => ({ date: d, value: leadsMA[i] > 0 ? spendMA[i] / leadsMA[i] : 0 }))

    // CPA CC = MA14(spend) / MA14(purchases)
    const purchasesMA = movingAvg(dailyPurchases, 14)
    const cpaSeriesRaw: ChartPoint[] = dates.map((d, i) => ({ date: d, value: purchasesMA[i] > 0 ? spendMA[i] / purchasesMA[i] : 0 }))

    // CTR = clicks / impressions
    const ctrSeriesRaw: ChartPoint[] = dates.map((d, i) => ({ date: d, value: dailyImpressions[i] > 0 ? dailyClicks[i] / dailyImpressions[i] : 0 }))

    // LPVO = view_offer / page_view
    const lpvoSeriesRaw: ChartPoint[] = dates.map((d, i) => ({ date: d, value: dailyPageView[i] > 0 ? dailyViewOffer[i] / dailyPageView[i] : 0 }))

    // VO2L = leads / view_offer
    const vo2lSeriesRaw: ChartPoint[] = dates.map((d, i) => ({ date: d, value: dailyViewOffer[i] > 0 ? dailyLeads[i] / dailyViewOffer[i] : 0 }))

    // Trim warm-up rows — only keep dates >= dateFrom
    const trim = (s: ChartPoint[]) => s.filter(p => p.date >= dateFrom)
    const cprlSeries = trim(cprlSeriesRaw)
    const cpaSeries = trim(cpaSeriesRaw)
    const ctrSeries = trim(ctrSeriesRaw)
    const lpvoSeries = trim(lpvoSeriesRaw)
    const vo2lSeries = trim(vo2lSeriesRaw)

    // Totals — only from in-range dates (skip warm-up)
    const inRange = dates.map((d, i) => ({ d, i })).filter(x => x.d >= dateFrom)
    const totalSpend = inRange.reduce((a, x) => a + dailySpend[x.i], 0)
    const totalLeads = inRange.reduce((a, x) => a + dailyLeads[x.i], 0)
    const totalPurchases = inRange.reduce((a, x) => a + dailyPurchases[x.i], 0)
    const totalClicks = inRange.reduce((a, x) => a + dailyClicks[x.i], 0)
    const totalImpressions = inRange.reduce((a, x) => a + dailyImpressions[x.i], 0)
    const totalPageView = inRange.reduce((a, x) => a + dailyPageView[x.i], 0)
    const totalViewOffer = inRange.reduce((a, x) => a + dailyViewOffer[x.i], 0)

    return {
      cprl: totalLeads > 0 ? totalSpend / totalLeads : 0,
      cprlSeries,
      cpa: totalPurchases > 0 ? totalSpend / totalPurchases : 0,
      cpaSeries,
      ctr: totalImpressions > 0 ? totalClicks / totalImpressions : 0,
      ctrSeries,
      lpvo: totalPageView > 0 ? totalViewOffer / totalPageView : 0,
      lpvoSeries,
      vo2l: totalViewOffer > 0 ? totalLeads / totalViewOffer : 0,
      vo2lSeries,
    }
  }, [adData, dateFrom])

  // ── Ads-added markers from ad_dimension publish_date ──
  const adsMarkers = useMemo<AdsMarker[]>(() => {
    if (!adData?.ad_dimension) return []
    const byDate = new Map<string, string[]>()
    for (const ad of adData.ad_dimension) {
      if (!ad.publish_date) continue
      const titles = byDate.get(ad.publish_date) ?? []
      titles.push(stripAdPrefix(ad.ad_title ?? ad.ad_id))
      byDate.set(ad.publish_date, titles)
    }
    return Array.from(byDate.entries()).map(([date, titles]) => ({ date, titles })).sort((a, b) => a.date.localeCompare(b.date))
  }, [adData])

  // Selected campaign info
  const selectedCampInfo = campaigns.find(c => c.campaign_id === selectedCampaign)

  // ── Sort header helper ──
  const SortTh = ({ label, k, current, dir, onClick, align = 'left' }: { label: string; k: SortKey; current: SortKey; dir: SortDir; onClick: (k: SortKey) => void; align?: string }) => (
    <th
      onClick={() => onClick(k)}
      style={{ padding: '8px 10px', fontWeight: 700, color: current === k ? '#fff' : 'rgba(255,255,255,0.4)', cursor: 'pointer', textAlign: align as any, fontSize: 10, whiteSpace: 'nowrap', userSelect: 'none', borderBottom: '1px solid rgba(255,255,255,0.08)' }}
    >
      {label} {current === k ? (dir === 'desc' ? '↓' : '↑') : ''}
    </th>
  )

  const toggleSort = (k: SortKey) => { if (sortKey === k) setSortDir(d => d === 'desc' ? 'asc' : 'desc'); else { setSortKey(k); setSortDir('desc') } }
  const toggleAdSort = (k: SortKey) => { if (adSortKey === k) setAdSortDir(d => d === 'desc' ? 'asc' : 'desc'); else { setAdSortKey(k); setAdSortDir('desc') } }

  // ── Totals row ──
  const totals = useMemo(() => {
    const s = campaigns.reduce((a, c) => ({ spend: a.spend + c.ad_spend, leads: a.leads + c.leads, purchases: a.purchases + c.purchases, revenue: a.revenue + c.revenue, adsAdded: a.adsAdded + c.adsAdded }), { spend: 0, leads: 0, purchases: 0, revenue: 0, adsAdded: 0 })
    return { ...s, cprl: s.leads > 0 ? s.spend / s.leads : 0, cpa: s.purchases > 0 ? s.spend / s.purchases : 0, roas: s.spend > 0 ? s.revenue / s.spend : 0 }
  }, [campaigns])

  return (
    <div style={{ padding: '24px 28px', fontFamily: 'Inter, system-ui, sans-serif', color: '#fff', minHeight: '100vh', fontSize: '85%' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 16, fontWeight: 800, letterSpacing: '-0.02em' }}>{pageTitle}</div>
        <div style={{ fontSize: 10, fontWeight: 600, padding: '3px 10px', borderRadius: 6, background: `${badgeColor}1f`, border: `1px solid ${badgeColor}40`, color: badgeColor }}>{brand}</div>
      </div>

      {/* Date picker */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
        {PRESETS.map(p => (
          <button key={p.label} onClick={() => applyPreset(p.days)}
            style={{ padding: '5px 12px', fontSize: 10, fontWeight: 700, borderRadius: 6, border: '1px solid', cursor: 'pointer', background: 'rgba(255,255,255,0.04)', borderColor: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.5)' }}>
            {p.label}
          </button>
        ))}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginLeft: 8 }}>
          <input type="date" value={dateFrom} onChange={e => { setDateFrom(e.target.value); setSelectedCampaign(null) }}
            style={{ padding: '4px 8px', fontSize: 10, borderRadius: 6, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.05)', color: '#fff' }} />
          <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: 10 }}>→</span>
          <input type="date" value={dateTo} onChange={e => { setDateTo(e.target.value); setSelectedCampaign(null) }}
            style={{ padding: '4px 8px', fontSize: 10, borderRadius: 6, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.05)', color: '#fff' }} />
        </div>
      </div>

      {/* Search */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        <input
          type="text" placeholder="Search campaigns…" value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
          style={{ padding: '5px 12px', fontSize: 10, borderRadius: 6, border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.04)', color: '#fff', width: 280, outline: 'none' }}
        />
        {campLoading && <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)' }}>Loading…</div>}
      </div>

      {/* Hierarchical campaign table */}
      <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12, overflow: 'hidden', marginBottom: 24 }}>
        <div style={{ padding: '10px 14px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ fontSize: 12, fontWeight: 700 }}>Campaigns</div>
          <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', marginLeft: 'auto' }}>{campaigns.length} campaigns · {filteredSkus.length} products</div>
        </div>
        <div style={{ maxHeight: selectedCampaign ? 350 : 600, overflowY: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10 }}>
            <thead>
              <tr style={{ position: 'sticky', top: 0, background: 'rgba(13,14,18,0.95)', zIndex: 1 }}>
                <SortTh label="Product / Campaign" k="name" current={sortKey} dir={sortDir} onClick={toggleSort} />
                <SortTh label="Funnel" k="funnel" current={sortKey} dir={sortDir} onClick={toggleSort} />
                <SortTh label="Spend" k="spend" current={sortKey} dir={sortDir} onClick={toggleSort} align="right" />
                <SortTh label={useFormConversions ? 'Form Submissions' : 'Real Leads'} k="leads" current={sortKey} dir={sortDir} onClick={toggleSort} align="right" />
                <SortTh label={useFormConversions ? 'Visit' : 'Purchase'} k="purchases" current={sortKey} dir={sortDir} onClick={toggleSort} align="right" />
                {!hideRoas && <SortTh label="Revenue" k="revenue" current={sortKey} dir={sortDir} onClick={toggleSort} align="right" />}
                <SortTh label={cfgCprlLabel ?? 'CPRL'} k="cprl" current={sortKey} dir={sortDir} onClick={toggleSort} align="right" />
                <SortTh label={cfgCpaLabel ?? 'CPA CC'} k="cpa" current={sortKey} dir={sortDir} onClick={toggleSort} align="right" />
                {!hideRoas && <SortTh label="RoAS CC" k="roas" current={sortKey} dir={sortDir} onClick={toggleSort} align="right" />}
                <SortTh label="Ads Added" k="adsAdded" current={sortKey} dir={sortDir} onClick={toggleSort} align="right" />
              </tr>
            </thead>
            <tbody>
              {/* Grand totals row */}
              {campaigns.length > 0 && (
                <tr style={{ background: 'rgba(99,102,241,0.06)', borderBottom: '2px solid rgba(99,102,241,0.2)' }}>
                  <td style={{ padding: '7px 10px', fontWeight: 800, color: '#818cf8' }}>ALL PRODUCTS</td>
                  <td style={{ padding: '7px 10px' }}></td>
                  <td style={{ padding: '7px 10px', textAlign: 'right', fontWeight: 700, color: '#fff', whiteSpace: 'nowrap' }}>{fmtRpShort(totals.spend)}</td>
                  <td style={{ padding: '7px 10px', textAlign: 'right', fontWeight: 700, color: '#fff', whiteSpace: 'nowrap' }}>{totals.leads}</td>
                  <td style={{ padding: '7px 10px', textAlign: 'right', fontWeight: 700, color: '#fff', whiteSpace: 'nowrap' }}>{totals.purchases}</td>
                  {!hideRoas && <td style={{ padding: '7px 10px', textAlign: 'right', fontWeight: 700, color: '#fff', whiteSpace: 'nowrap' }}>{fmtRpShort(totals.revenue)}</td>}
                  <td style={{ padding: '7px 10px', textAlign: 'right', fontWeight: 700, color: '#fff', whiteSpace: 'nowrap' }}>{fmtRp(Math.round(totals.cprl))}</td>
                  <td style={{ padding: '7px 10px', textAlign: 'right', fontWeight: 700, color: '#fff', whiteSpace: 'nowrap' }}>{fmtRp(Math.round(totals.cpa))}</td>
                  {!hideRoas && <td style={{ padding: '7px 10px', textAlign: 'right', fontWeight: 700, color: '#fff', whiteSpace: 'nowrap' }}>{totals.roas > 0 ? totals.roas.toFixed(2) + '×' : '-'}</td>}
                  <td style={{ padding: '7px 10px', textAlign: 'right', fontWeight: 700, color: '#fff', whiteSpace: 'nowrap' }}>{totals.adsAdded || '-'}</td>
                </tr>
              )}

              {/* Product rows (expandable) + Campaign rows (nested) */}
              {filteredSkus.map(sku => {
                const t = skuTotals[sku]
                if (!t) return null
                const meta = SKU_META[sku]
                const isExpanded = expandedSkus.has(sku) || !!searchTerm
                const skuCampaigns = getFilteredCampaigns(sku)
                return (
                  <React.Fragment key={sku}>
                    {/* Product summary row */}
                    <tr
                      onClick={() => toggleSku(sku)}
                      style={{ background: 'rgba(255,255,255,0.04)', borderBottom: '1px solid rgba(255,255,255,0.06)', cursor: 'pointer' }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.07)')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.04)')}
                    >
                      <td style={{ padding: '8px 10px', fontWeight: 700 }}>
                        <span style={{ color: 'rgba(255,255,255,0.4)', marginRight: 6, fontSize: 9 }}>{isExpanded ? '▾' : '▸'}</span>
                        <span style={{ display: 'inline-block', padding: '1px 6px', borderRadius: 4, background: `${meta?.color ?? '#666'}18`, border: `1px solid ${meta?.color ?? '#666'}30`, color: meta?.color ?? '#fff', fontSize: 9, fontWeight: 700, marginRight: 6 }}>{sku}</span>
                        <span style={{ color: '#fff' }}>{meta?.name ?? sku}</span>
                        <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: 9, marginLeft: 6 }}>{skuCampaigns.length} campaigns</span>
                      </td>
                      <td style={{ padding: '8px 10px' }}></td>
                      <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 700, color: '#fff', whiteSpace: 'nowrap' }}>{fmtRpShort(t.spend)}</td>
                      <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 700, color: '#fff', whiteSpace: 'nowrap' }}>{t.leads}</td>
                      <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 700, color: '#fff', whiteSpace: 'nowrap' }}>{t.purchases}</td>
                      {!hideRoas && <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 700, color: '#fff', whiteSpace: 'nowrap' }}>{fmtRpShort(t.revenue)}</td>}
                      <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 700, color: '#fff', whiteSpace: 'nowrap' }}>{t.cprl > 0 ? fmtRp(Math.round(t.cprl)) : '-'}</td>
                      <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 700, color: '#fff', whiteSpace: 'nowrap' }}>{t.cpa > 0 ? fmtRp(Math.round(t.cpa)) : '-'}</td>
                      {!hideRoas && <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 700, color: '#fff', whiteSpace: 'nowrap' }}>{t.roas > 0 ? t.roas.toFixed(2) + '×' : '-'}</td>}
                      <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 700, color: t.adsAdded > 0 ? '#60a5fa' : 'rgba(255,255,255,0.25)', whiteSpace: 'nowrap' }}>{t.adsAdded > 0 ? `+${t.adsAdded}` : '-'}</td>
                    </tr>

                    {/* Campaign rows (shown when expanded) */}
                    {isExpanded && skuCampaigns.map(c => {
                      const isSelected = selectedCampaign === c.campaign_id
                      const funnelLabel = c.funnel === '00' ? 'ToFU00' : c.funnel === '25' ? 'MoFU25' : c.funnel === '50' ? 'BoFU50' : c.funnel === '75' ? 'BoFU75' : c.funnel ?? '-'
                      const funnelColor = c.funnel === '00' ? '#818cf8' : c.funnel === '25' ? '#60a5fa' : c.funnel === '50' ? '#fbbf24' : c.funnel === '75' ? '#fb923c' : 'rgba(255,255,255,0.3)'
                      return (
                        <tr key={c.campaign_id}
                          onClick={() => setSelectedCampaign(isSelected ? null : c.campaign_id)}
                          style={{ borderBottom: '1px solid rgba(255,255,255,0.03)', cursor: 'pointer', background: isSelected ? 'rgba(99,102,241,0.08)' : 'transparent', transition: 'background 0.1s' }}
                          onMouseEnter={e => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.03)' }}
                          onMouseLeave={e => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = 'transparent' }}
                        >
                          <td style={{ padding: '7px 10px 7px 32px', fontWeight: 600, color: isSelected ? '#818cf8' : '#fff', maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {isSelected && <span style={{ marginRight: 4 }}>▸</span>}
                            {c.campaign_name ?? c.campaign_id}
                          </td>
                          <td style={{ padding: '7px 10px' }}><span style={{ fontSize: 9, fontWeight: 700, color: funnelColor, padding: '1px 5px', borderRadius: 3, background: `${funnelColor}18`, border: `1px solid ${funnelColor}30` }}>{funnelLabel}</span></td>
                          <td style={{ padding: '7px 10px', textAlign: 'right', fontWeight: 600, color: 'rgba(255,255,255,0.7)', whiteSpace: 'nowrap' }}>{fmtRpShort(c.ad_spend)}</td>
                          <td style={{ padding: '7px 10px', textAlign: 'right', color: 'rgba(255,255,255,0.4)', whiteSpace: 'nowrap' }}>{c.leads || '-'}</td>
                          <td style={{ padding: '7px 10px', textAlign: 'right', color: 'rgba(255,255,255,0.4)', whiteSpace: 'nowrap' }}>{c.purchases || '-'}</td>
                          {!hideRoas && <td style={{ padding: '7px 10px', textAlign: 'right', color: 'rgba(255,255,255,0.4)', whiteSpace: 'nowrap' }}>{c.revenue > 0 ? fmtRpShort(c.revenue) : '-'}</td>}
                          <td style={{ padding: '7px 10px', textAlign: 'right', fontWeight: 700, color: '#fff', whiteSpace: 'nowrap' }}>{c.cprl > 0 ? fmtRp(Math.round(c.cprl)) : '-'}</td>
                          <td style={{ padding: '7px 10px', textAlign: 'right', fontWeight: 700, color: '#fff', whiteSpace: 'nowrap' }}>{c.cpa > 0 ? fmtRp(Math.round(c.cpa)) : '-'}</td>
                          {!hideRoas && <td style={{ padding: '7px 10px', textAlign: 'right', fontWeight: 700, color: '#fff', whiteSpace: 'nowrap' }}>{c.roas > 0 ? c.roas.toFixed(2) + '×' : '-'}</td>}
                          <td style={{ padding: '7px 10px', textAlign: 'right', color: c.adsAdded > 0 ? '#60a5fa' : 'rgba(255,255,255,0.25)', whiteSpace: 'nowrap' }}>{c.adsAdded || '-'}</td>
                        </tr>
                      )
                    })}
                  </React.Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Campaign performance charts */}
      {selectedCampaign && campaignCharts && (
        <div style={{ marginTop: 16, padding: '16px 18px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.5)', marginBottom: 14, letterSpacing: '0.04em' }}>
            CAMPAIGN PERFORMANCE
          </div>
          <div style={{ display: 'flex', gap: 20 }}>
            <MetricCard label={cfgCprlLabel ?? 'CPRL'} value={campaignCharts.cprl > 0 ? fmtRp(Math.round(campaignCharts.cprl)) : '—'}
              sub="Target Rp 150K" color="#818cf8" series={campaignCharts.cprlSeries}
              fixedTarget={150_000} higherIsBetter={false}
              fmt={(v) => fmtRp(Math.round(v))} fmtShort={(v) => fmtRpShort(v)} adsMarkers={adsMarkers} />
            <MetricCard label={cfgCpaLabel ?? 'CPA CC'} value={campaignCharts.cpa > 0 ? fmtRp(Math.round(campaignCharts.cpa)) : '—'}
              sub="Target Rp 2M" color="#f472b6" series={campaignCharts.cpaSeries}
              fixedTarget={2_000_000} higherIsBetter={false}
              fmt={(v) => fmtRp(Math.round(v))} fmtShort={(v) => fmtRpShort(v)} adsMarkers={adsMarkers} />
            <MetricCard label="LPVO" value={fmtPct(campaignCharts.lpvo)} color="#fbbf24" series={campaignCharts.lpvoSeries}
              higherIsBetter={true} fmt={(v) => fmtPct(v)} fmtShort={(v) => fmtPctShort(v)} adsMarkers={adsMarkers} />
            <MetricCard label="VO2L" value={fmtPct(campaignCharts.vo2l)} color="#f87171" series={campaignCharts.vo2lSeries}
              higherIsBetter={true} fmt={(v) => fmtPct(v)} fmtShort={(v) => fmtPctShort(v)} adsMarkers={adsMarkers} />
          </div>
        </div>
      )}

      {/* Ad-level drilldown */}
      {selectedCampaign && (
        <div style={{ marginTop: 16, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(99,102,241,0.15)', borderRadius: 12, overflow: 'hidden' }}>
          <div style={{ padding: '10px 14px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ fontSize: 12, fontWeight: 700 }}>Ads</div>
            {selectedCampInfo && (
              <div style={{ fontSize: 10, fontWeight: 600, color: '#818cf8', padding: '2px 8px', borderRadius: 4, background: 'rgba(99,102,241,0.12)' }}>
                {selectedCampInfo.campaign_name ?? selectedCampInfo.campaign_id}
              </div>
            )}
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', marginLeft: 'auto' }}>
              {adLoading ? 'Loading…' : `${sortedAds.length} ads`}
            </div>
            <button onClick={() => setSelectedCampaign(null)}
              style={{ padding: '3px 8px', fontSize: 9, fontWeight: 600, borderRadius: 4, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.5)', cursor: 'pointer' }}>
              ✕ Close
            </button>
          </div>

          {/* Bleeder vs Productive spend summary */}
          {(() => {
            const h2 = new Date(); h2.setDate(h2.getDate() - 2); const h2Str = h2.toISOString().slice(0, 10)
            const bleederSpend = sortedAds.filter(a => {
              const days = a.publish_date ? Math.floor((new Date(h2Str).getTime() - new Date(a.publish_date).getTime()) / 86400000) : 999
              return days >= 7 && a.leads === 0 && a.purchases === 0 && a.revenue === 0
            }).reduce((s, a) => s + a.ad_spend, 0)
            const totalAdSpend = sortedAds.reduce((s, a) => s + a.ad_spend, 0)
            const productiveSpend = totalAdSpend - bleederSpend
            const bleederPct = totalAdSpend > 0 ? (bleederSpend / totalAdSpend) * 100 : 0
            return (
              <div style={{ display: 'flex', gap: 16, marginBottom: 12, padding: '10px 14px', background: 'rgba(255,255,255,0.02)', borderRadius: 8, border: '1px solid rgba(255,255,255,0.04)' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 9, fontWeight: 700, color: '#34d399', letterSpacing: '0.06em', marginBottom: 2 }}>PRODUCTIVE SPEND</div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: '#fff' }}>{fmtRpShort(productiveSpend)}</div>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 9, fontWeight: 700, color: '#f87171', letterSpacing: '0.06em', marginBottom: 2 }}>BLEEDER SPEND</div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: '#f87171' }}>{fmtRpShort(bleederSpend)}</div>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 9, fontWeight: 700, color: 'rgba(255,255,255,0.4)', letterSpacing: '0.06em', marginBottom: 2 }}>BLEEDER %</div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: bleederPct > 20 ? '#f87171' : bleederPct > 10 ? '#fbbf24' : '#34d399' }}>{bleederPct.toFixed(1)}%</div>
                </div>
              </div>
            )
          })()}

          <div style={{ maxHeight: 500, overflowY: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10 }}>
              <thead>
                <tr style={{ position: 'sticky', top: 0, background: 'rgba(13,14,18,0.95)', zIndex: 1 }}>
                  <SortTh label="Title" k="title" current={adSortKey} dir={adSortDir} onClick={toggleAdSort} />
                  <SortTh label="Publish Date" k="publish_date" current={adSortKey} dir={adSortDir} onClick={toggleAdSort} />
                  <th style={{ padding: '8px 10px', fontWeight: 700, color: 'rgba(255,255,255,0.4)', fontSize: 10, textAlign: 'left', borderBottom: '1px solid rgba(255,255,255,0.08)', whiteSpace: 'nowrap' }}>Created By</th>
                  <th style={{ padding: '8px 10px', fontWeight: 700, color: 'rgba(255,255,255,0.4)', fontSize: 10, textAlign: 'left', borderBottom: '1px solid rgba(255,255,255,0.08)', whiteSpace: 'nowrap' }}>Landing Page</th>
                  <SortTh label="Status" k="status" current={adSortKey} dir={adSortDir} onClick={toggleAdSort} />
                  {showGrade && <th style={{ padding: '8px 10px', fontWeight: 700, color: 'rgba(255,255,255,0.4)', fontSize: 10, textAlign: 'center', borderBottom: '1px solid rgba(255,255,255,0.08)', whiteSpace: 'nowrap' }}>Grade</th>}
                  <SortTh label="Spend" k="spend" current={adSortKey} dir={adSortDir} onClick={toggleAdSort} align="right" />
                  <SortTh label={useFormConversions ? 'Form Submissions' : 'Real Leads'} k="leads" current={adSortKey} dir={adSortDir} onClick={toggleAdSort} align="right" />
                  <SortTh label={useFormConversions ? 'Visit' : 'Purchase'} k="purchases" current={adSortKey} dir={adSortDir} onClick={toggleAdSort} align="right" />
                  {!hideRoas && <SortTh label="Revenue" k="revenue" current={adSortKey} dir={adSortDir} onClick={toggleAdSort} align="right" />}
                  <SortTh label={cfgCprlLabel ?? 'CPRL'} k="cprl" current={adSortKey} dir={adSortDir} onClick={toggleAdSort} align="right" />
                  <SortTh label={cfgCpaLabel ?? 'CPA CC'} k="cpa" current={adSortKey} dir={adSortDir} onClick={toggleAdSort} align="right" />
                  {!hideRoas && <SortTh label="RoAS CC" k="roas" current={adSortKey} dir={adSortDir} onClick={toggleAdSort} align="right" />}
                </tr>
              </thead>
              <tbody>
                {sortedAds.map(a => {
                  const statusColor = a.status === 'Learning' ? '#fbbf24' : a.status === 'Bleeder' ? '#f87171' : '#34d399'
                  const statusBg = a.status === 'Learning' ? 'rgba(251,191,36,0.15)' : a.status === 'Bleeder' ? 'rgba(248,113,113,0.15)' : 'rgba(52,211,153,0.15)'
                  const statusBdr = a.status === 'Learning' ? 'rgba(251,191,36,0.3)' : a.status === 'Bleeder' ? 'rgba(248,113,113,0.3)' : 'rgba(52,211,153,0.3)'
                  const titleText = a.ad_title ? stripAdPrefix(a.ad_title) : '-'
                  return (
                  <tr key={a.ad_id} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                    <td style={{ padding: '6px 10px', maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 600 }} title={a.ad_title ? stripAdPrefix(a.ad_title) : ''}>
                      {a.notion_url
                        ? <a href={a.notion_url} target="_blank" rel="noopener noreferrer" style={{ color: '#818cf8', textDecoration: 'none' }} onMouseEnter={e => (e.currentTarget.style.textDecoration = 'underline')} onMouseLeave={e => (e.currentTarget.style.textDecoration = 'none')}>{titleText}</a>
                        : <span style={{ color: 'rgba(255,255,255,0.7)' }}>{titleText}</span>}
                    </td>
                    <td style={{ padding: '6px 10px', color: 'rgba(255,255,255,0.7)', whiteSpace: 'nowrap', fontSize: 9 }}>{a.publish_date ?? '-'}</td>
                    <td style={{ padding: '6px 10px', color: 'rgba(255,255,255,0.5)', whiteSpace: 'nowrap', fontSize: 9 }}>{a.created_by ?? '-'}</td>
                    <td style={{ padding: '6px 10px', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 9 }}>
                      {a.lp_url
                        ? <a href={a.lp_url} target="_blank" rel="noopener noreferrer" style={{ color: '#60a5fa', textDecoration: 'none' }} onMouseEnter={e => (e.currentTarget.style.textDecoration = 'underline')} onMouseLeave={e => (e.currentTarget.style.textDecoration = 'none')}>{a.lp_url.replace(/^https?:\/\//, '')}</a>
                        : '-'}
                    </td>
                    <td style={{ padding: '6px 10px', textAlign: 'center' }}>
                      <span style={{ display: 'inline-block', padding: '1px 6px', borderRadius: 4, background: statusBg, border: `1px solid ${statusBdr}`, color: statusColor, fontSize: 9, fontWeight: 700, letterSpacing: '0.04em' }}>{a.status}</span>
                    </td>
                    {showGrade && <td style={{ padding: '6px 10px', textAlign: 'center' }}>
                      {(() => {
                        if (!a.grade) return <span style={{ color: 'rgba(255,255,255,0.15)' }}>—</span>
                        const gc: Record<string, { color: string; bg: string; bdr: string }> = {
                          S: { color: '#34d399', bg: 'rgba(52,211,153,0.18)', bdr: 'rgba(52,211,153,0.35)' },
                          A: { color: '#60a5fa', bg: 'rgba(96,165,250,0.18)', bdr: 'rgba(96,165,250,0.35)' },
                          B: { color: '#818cf8', bg: 'rgba(129,140,248,0.18)', bdr: 'rgba(129,140,248,0.35)' },
                          C: { color: '#fbbf24', bg: 'rgba(251,191,36,0.18)', bdr: 'rgba(251,191,36,0.35)' },
                          D: { color: '#f97316', bg: 'rgba(249,115,22,0.18)', bdr: 'rgba(249,115,22,0.35)' },
                          E: { color: '#f87171', bg: 'rgba(248,113,113,0.18)', bdr: 'rgba(248,113,113,0.35)' },
                          F: { color: '#71717a', bg: 'rgba(113,113,122,0.18)', bdr: 'rgba(113,113,122,0.35)' },
                        }
                        const g = gc[a.grade] ?? gc['F']
                        return <span style={{ display: 'inline-block', padding: '1px 7px', borderRadius: 4, background: g.bg, border: `1px solid ${g.bdr}`, color: g.color, fontSize: 9, fontWeight: 800, letterSpacing: '0.06em' }}>{a.grade}</span>
                      })()}
                    </td>}
                    <td style={{ padding: '6px 10px', textAlign: 'right', fontWeight: 600, color: 'rgba(255,255,255,0.7)', whiteSpace: 'nowrap' }}>{fmtRpShort(a.ad_spend)}</td>
                    <td style={{ padding: '6px 10px', textAlign: 'right', fontWeight: 600, color: 'rgba(255,255,255,0.7)', whiteSpace: 'nowrap' }}>{a.leads || '-'}</td>
                    <td style={{ padding: '6px 10px', textAlign: 'right', fontWeight: 600, color: 'rgba(255,255,255,0.7)', whiteSpace: 'nowrap' }}>{a.purchases || '-'}</td>
                    {!hideRoas && <td style={{ padding: '6px 10px', textAlign: 'right', fontWeight: 600, color: 'rgba(255,255,255,0.7)', whiteSpace: 'nowrap' }}>{a.revenue > 0 ? fmtRpShort(a.revenue) : '-'}</td>}
                    <td style={{ padding: '6px 10px', textAlign: 'right', fontWeight: 600, color: 'rgba(255,255,255,0.7)', whiteSpace: 'nowrap' }}>{a.cprl > 0 ? fmtRp(Math.round(a.cprl)) : '-'}</td>
                    <td style={{ padding: '6px 10px', textAlign: 'right', fontWeight: 600, color: 'rgba(255,255,255,0.7)', whiteSpace: 'nowrap' }}>{a.cpa > 0 ? fmtRp(Math.round(a.cpa)) : '-'}</td>
                    {!hideRoas && <td style={{ padding: '6px 10px', textAlign: 'right', fontWeight: 600, color: 'rgba(255,255,255,0.7)', whiteSpace: 'nowrap' }}>{a.roas > 0 ? a.roas.toFixed(2) + '×' : '-'}</td>}
                  </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
