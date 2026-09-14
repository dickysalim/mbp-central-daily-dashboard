/**
 * CampaignExplorerPage — MNC Campaign & Ad-level performance explorer
 */
import React, { useState, useMemo, useRef, useCallback } from 'react'
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
  ad_spend: number; impressions: number; video_views: number; video_view_50pct: number; link_click: number
}
interface ConvRow {
  campaign_id?: string; ad_id?: string; sku?: string
  real_lead_ccom: number; real_lead_d2or: number; real_lead_mpsh: number; real_lead_ofls: number
  qualified_lead_ccom: number
  purchase_ccom: number; purchase_revenue: number
  form_submission?: number; form_conversion?: number
}
interface Ga4SummaryRow { campaign_id?: string; ad_id?: string; sku?: string; ga4_first_visit: number; ga4_page_view: number; ga4_view_offer: number }
interface AdPerfRow { ad_id: string; ad_spend: number; impressions: number; video_views: number; video_view_50pct: number; link_click: number }
interface AdDimRow { ad_id: string; ad_title: string | null; internal_ad_id: string | null; sku: string | null; funnel: string | null; publish_date: string | null; grade_ads_quality: string | null }
interface DailyPerfRow { date: string; ad_spend: number; impressions: number; link_click: number }
interface DailyConvRow { date: string; real_lead_ccom: number; real_lead_d2or: number; real_lead_mpsh: number; real_lead_ofls: number; purchase_ccom: number; purchase_revenue: number; form_submission?: number; form_conversion?: number }
interface DailyGa4Row { date: string; ga4_page_view: number; ga4_view_offer: number }

interface ApiResponse {
  campaigns: CampaignRow[]
  campaign_conversions: ConvRow[]
  campaign_ga4: Ga4SummaryRow[]
  ads: AdPerfRow[]
  ad_conversions: ConvRow[]
  ad_ga4: Ga4SummaryRow[]
  ad_dimension: AdDimRow[]
  daily_perf: DailyPerfRow[]
  daily_conv: DailyConvRow[]
  daily_ga4: DailyGa4Row[]
  ads_added: { campaign_id: string; sku: string; ads_added: number }[]
  bridge_page: { ad_id: string; created_by: string | null; lp_url: string | null; notion_url: string | null }[]
}

const fmtK = (n: number) => n >= 1_000_000 ? (n / 1_000_000).toFixed(1) + 'M' : n >= 1_000 ? (n / 1_000).toFixed(0) + 'K' : n.toString()
const fmtRpShort = (n: number) => 'Rp ' + fmtK(n)
const fmtPct = (n: number) => (n * 100).toFixed(1) + '%'
const fmtPctShort = (n: number) => (n * 100).toFixed(1) + '%'
const fmtNum = (n: number) => Math.round(n).toLocaleString('id-ID')
const fmtX = (n: number) => n.toFixed(2) + '×'
const safeDiv = (a: number, b: number) => b > 0 ? a / b : 0
const stripAdPrefix = (title: string) => { const idx = title.indexOf('ADS'); return idx >= 0 ? title.slice(idx) : title }

// ── Campaign column config ─────────────────────────────────────────────────
type CampMetrics = {
  spend: number; impressions: number; video_views: number; video_view_50pct: number; link_click: number
  ga4_first_visit: number; ga4_page_view: number; ga4_view_offer: number
  leads: number; rl_ccom: number; ql_ccom: number; purchases: number; revenue: number
}

interface ColDef {
  id: string; label: string; get: (r: CampMetrics) => number; fmt: (n: number) => string; isRatio?: boolean
}

const CAMP_COLS: ColDef[] = [
  { id: 'spend',       label: 'Ad Spend',         get: r => r.spend,                                     fmt: fmtRpShort },
  { id: 'impressions', label: 'Impressions',       get: r => r.impressions,                               fmt: fmtNum },
  { id: 'cpm',         label: 'CPM',               get: r => safeDiv(r.spend, r.impressions) * 1000,      fmt: fmtRpShort, isRatio: true },
  { id: 'link_click',  label: 'Link Click',        get: r => r.link_click,                                fmt: fmtNum },
  { id: 'ctr',         label: 'CTR',               get: r => safeDiv(r.link_click, r.impressions),        fmt: fmtPct, isRatio: true },
  { id: 'video_3s',    label: '3s Video View',     get: r => r.video_views,                               fmt: fmtNum },
  { id: 'hook_rate',   label: 'Hook Rate',         get: r => safeDiv(r.video_views, r.impressions),       fmt: fmtPct, isRatio: true },
  { id: 'video_50',    label: '50% Video View',    get: r => r.video_view_50pct,                          fmt: fmtNum },
  { id: 'content_q',   label: 'Content Quality',   get: r => safeDiv(r.video_view_50pct, r.video_views),  fmt: fmtPct, isRatio: true },
  { id: 'first_visit', label: 'First Visit',       get: r => r.ga4_first_visit,                           fmt: fmtNum },
  { id: 'lp_view',     label: 'LP View',           get: r => r.ga4_page_view,                             fmt: fmtNum },
  { id: 'view_offer',  label: 'View Offer',        get: r => r.ga4_view_offer,                            fmt: fmtNum },
  { id: 'fvr',         label: 'First Visit Rate',  get: r => safeDiv(r.ga4_first_visit, r.ga4_page_view), fmt: fmtPct, isRatio: true },
  { id: 'lpvo',        label: 'LPVO',              get: r => safeDiv(r.ga4_view_offer, r.ga4_page_view),  fmt: fmtPct, isRatio: true },
  { id: 'leads',       label: 'Real Leads',        get: r => r.leads,                                     fmt: fmtNum },
  { id: 'vo2l',        label: 'VO2L',              get: r => safeDiv(r.ga4_view_offer, r.leads),          fmt: (n) => n.toFixed(1), isRatio: true },
  { id: 'cprl',        label: 'CPRL',              get: r => safeDiv(r.spend, r.leads),                   fmt: (n) => fmtRp(Math.round(n)), isRatio: true },
  { id: 'qual_leads',  label: 'Quality Leads',     get: r => r.ql_ccom,                                   fmt: fmtNum },
  { id: 'ql_rate',     label: 'QL Rate',           get: r => safeDiv(r.ql_ccom, r.rl_ccom),               fmt: fmtPct, isRatio: true },
  { id: 'cpql',        label: 'CPQL',              get: r => safeDiv(r.spend, r.ql_ccom),                 fmt: (n) => fmtRp(Math.round(n)), isRatio: true },
  { id: 'purchases',   label: 'Purchase',          get: r => r.purchases,                                 fmt: fmtNum },
  { id: 'cvr',         label: 'CVR',               get: r => safeDiv(r.purchases, r.rl_ccom),             fmt: fmtPct, isRatio: true },
  { id: 'cpa',         label: 'CPA CC',            get: r => safeDiv(r.spend, r.purchases),               fmt: (n) => fmtRp(Math.round(n)), isRatio: true },
  { id: 'roas',        label: 'RoAS CC',           get: r => safeDiv(r.revenue, r.spend),                 fmt: fmtX, isRatio: true },
]

const DEFAULT_VISIBLE_COLS = ['spend', 'leads', 'cprl', 'purchases', 'cpa', 'roas']

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

function FullChart({ data, color, fixedTarget, higherIsBetter, fmt, fmtShort, chartKey, adsMarkers = [], forecastFromDate }: {
  data: ChartPoint[]; color: string; fixedTarget?: number; higherIsBetter: boolean
  fmt: (v: number) => string; fmtShort: (v: number) => string; chartKey: string
  adsMarkers?: AdsMarker[]
  forecastFromDate?: string
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

  // Forecast split: solid line up to forecastFromDate, dashed after
  const fcIdx = forecastFromDate ? data.findIndex(d => d.date > forecastFromDate) : -1
  const solidPts = fcIdx > 0 ? data.slice(0, fcIdx).map((d, i) => `${xs(i)},${ys(d.value)}`).join(' ') : pts
  const dashPts = fcIdx > 0 ? data.slice(fcIdx - 1).map((d, i) => `${xs(i + fcIdx - 1)},${ys(d.value)}`).join(' ') : ''

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
          {/* Main line — split solid/dashed at forecast boundary */}
          <polyline points={solidPts} fill="none" stroke={lineColor} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
          {dashPts && <>
            <polyline points={dashPts} fill="none" stroke={lineColor} strokeWidth="2" strokeOpacity="0.6"
              strokeLinejoin="round" strokeLinecap="round" strokeDasharray="4,3" />
            <circle cx={xs(fcIdx - 1)} cy={ys(data[fcIdx - 1].value)} r="3.5"
              fill={lineColor} stroke="#0d0e12" strokeWidth="1.5" />
          </>}

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
function MetricCard({ label, value, sub, color, series, fixedTarget, higherIsBetter, fmt: fmtFn, fmtShort: fmtShortFn, adsMarkers, rawSeries, maLabel, forecastFromDate }: {
  label: string; value: string; sub?: string; color: string; series: ChartPoint[]
  fixedTarget?: number; higherIsBetter: boolean
  fmt: (v: number) => string; fmtShort: (v: number) => string
  adsMarkers?: AdsMarker[]
  rawSeries?: ChartPoint[]
  maLabel?: string
  forecastFromDate?: string
}) {
  const [showMA, setShowMA] = useState(true)
  const hasToggle = !!rawSeries && rawSeries.length >= 2
  const activeSeries = hasToggle && !showMA ? rawSeries! : series

  const isGood = (() => {
    if (activeSeries.length < 2 || !fixedTarget) return true
    const last = activeSeries[activeSeries.length - 1].value
    return higherIsBetter ? last >= fixedTarget : last <= fixedTarget
  })()
  const divergence = (() => {
    if (activeSeries.length < 2 || !fixedTarget) return 0
    const last = activeSeries[activeSeries.length - 1].value
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
      {hasToggle && (
        <div style={{ display: 'flex', gap: 3, marginBottom: 4, justifyContent: 'flex-start' }}>
          <button onClick={() => setShowMA(true)} style={{
            padding: '1px 6px', fontSize: 8, fontWeight: 700, borderRadius: 3,
            border: 'none', cursor: 'pointer', letterSpacing: '0.03em',
            background: showMA ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.04)',
            color: showMA ? '#fff' : 'rgba(255,255,255,0.35)',
          }}>{maLabel}</button>
          <button onClick={() => setShowMA(false)} style={{
            padding: '1px 6px', fontSize: 8, fontWeight: 700, borderRadius: 3,
            border: 'none', cursor: 'pointer', letterSpacing: '0.03em',
            background: !showMA ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.04)',
            color: !showMA ? '#fff' : 'rgba(255,255,255,0.35)',
          }}>Daily</button>
        </div>
      )}
      <FullChart data={activeSeries} color={color} fixedTarget={fixedTarget} higherIsBetter={higherIsBetter} fmt={fmtFn} fmtShort={fmtShortFn} chartKey={label} adsMarkers={adsMarkers} forecastFromDate={forecastFromDate} />
    </div>
  )
}

type SortKey = string
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
  colLabels?: Record<string, string>  // override column labels per brand
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
  colLabels: {
    leads: 'Form Submissions',
    cprl: 'CPR',
    qual_leads: 'Quality Forms',
    ql_rate: 'QF Rate',
    cpql: 'CPQF',
    purchases: 'Visit',
    cvr: 'Visit Rate',
    cpa: 'CPV',
  },
}

// MCI conversion data uses aliased SKU codes for policy compliance
const MCI_SKU_ALIAS: Record<string, string> = { ABC: 'A1C', DEF: 'CEK', GHI: 'WCA' }

export function CampaignExplorerPage() { return <CampaignPage config={MNC_CONFIG} /> }
export function GolCampaignExplorerPage() { return <CampaignPage config={GOL_CONFIG} /> }
export function MciCampaignExplorerPage() { return <CampaignPage config={MCI_CONFIG} /> }

function CampaignPage({ config }: { config: BrandConfig }) {
  const { brand, title: pageTitle, badgeColor, skuOrder, skuMeta: SKU_META, showGrade, useFormConversions, cprlLabel: cfgCprlLabel, cpaLabel: cfgCpaLabel, hideRoas, colLabels } = config
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
  const [selectedSku, setSelectedSku] = useState<string | null>(null)
  const [sortKey, setSortKey] = useState<SortKey>('funnel')
  const [sortDir, setSortDir] = useState<SortDir>('asc')
  const [adSortKey, setAdSortKey] = useState<SortKey>('leads')
  const [adSortDir, setAdSortDir] = useState<SortDir>('desc')

  const [adSearchTerm, setAdSearchTerm] = useState('')
  const [expandedSkus, setExpandedSkus] = useState<Set<string>>(new Set())
  const [showColPicker, setShowColPicker] = useState(false)

  // Column visibility + ordering — persisted across brands
  const colStorageKey = 'camp-cols'
  const [colOrder, setColOrder] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem(colStorageKey)
      if (saved) {
        const arr = JSON.parse(saved) as string[]
        if (Array.isArray(arr) && arr.length > 0) return arr
      }
    } catch {}
    return [...DEFAULT_VISIBLE_COLS]
  })
  const saveColOrder = (next: string[]) => { setColOrder(next); localStorage.setItem(colStorageKey, JSON.stringify(next)) }
  const toggleCol = (id: string) => {
    if (colOrder.includes(id)) saveColOrder(colOrder.filter(c => c !== id))
    else saveColOrder([...colOrder, id])
  }
  const moveColumn = useCallback((id: string, dir: -1 | 1) => {
    setColOrder(prev => {
      const idx = prev.indexOf(id)
      if (idx < 0) return prev
      const newIdx = idx + dir
      if (newIdx < 0 || newIdx >= prev.length) return prev
      const next = [...prev]
      ;[next[idx], next[newIdx]] = [next[newIdx], next[idx]]
      localStorage.setItem(colStorageKey, JSON.stringify(next))
      return next
    })
  }, [colStorageKey])

  // Drag-and-drop reorder
  const dragItemRef = React.useRef<string | null>(null)
  const [dragOverId, setDragOverId] = useState<string | null>(null)
  const handleDragStart = useCallback((id: string) => { dragItemRef.current = id }, [])
  const handleDragOver = useCallback((e: React.DragEvent, id: string) => { e.preventDefault(); setDragOverId(id) }, [])
  const handleDragLeave = useCallback(() => { setDragOverId(null) }, [])
  const handleDrop = useCallback((targetId: string) => {
    const srcId = dragItemRef.current
    if (!srcId || srcId === targetId) { setDragOverId(null); return }
    setColOrder(prev => {
      const next = prev.filter(id => id !== srcId)
      const targetIdx = next.indexOf(targetId)
      if (targetIdx < 0) return prev
      next.splice(targetIdx, 0, srcId)
      localStorage.setItem(colStorageKey, JSON.stringify(next))
      return next
    })
    dragItemRef.current = null
    setDragOverId(null)
  }, [colStorageKey])
  const handleDragEnd = useCallback(() => { dragItemRef.current = null; setDragOverId(null) }, [])

  const activeCols = colOrder.map(id => CAMP_COLS.find(c => c.id === id)!).filter(Boolean)
    .map(c => colLabels?.[c.id] ? { ...c, label: colLabels[c.id] } : c)

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

  // ── Merged campaign data (perf + conversions + GA4) ──
  const campaigns = useMemo(() => {
    if (!campData) return []
    // Conv rows keyed by campaign_id|sku (normalize MCI aliased SKUs)
    const convMap = new Map<string, ConvRow>()
    for (const c of campData.campaign_conversions) {
      const normSku = MCI_SKU_ALIAS[c.sku ?? ''] ?? c.sku ?? ''
      convMap.set(`${c.campaign_id}|${normSku}`, c)
    }
    // GA4 rows keyed by campaign_id|sku
    const ga4Map = new Map<string, Ga4SummaryRow>()
    for (const g of (campData.campaign_ga4 ?? [])) ga4Map.set(`${g.campaign_id}|${g.sku ?? ''}`, g)
    const adsAddedMap = new Map<string, number>()
    for (const a of (campData.ads_added ?? [])) adsAddedMap.set(`${a.campaign_id}|${a.sku ?? ''}`, a.ads_added)

    return campData.campaigns.filter(c => c.campaign_name?.includes('[META]')).map(c => {
      const cv = convMap.get(`${c.campaign_id}|${c.sku ?? ''}`)
      const ga = ga4Map.get(`${c.campaign_id}|${c.sku ?? ''}`)
      const leads = cv ? (useFormConversions ? (cv.form_submission ?? 0) : (cv.real_lead_ccom + cv.real_lead_d2or + cv.real_lead_mpsh + cv.real_lead_ofls)) : 0
      const rl_ccom = cv?.real_lead_ccom ?? 0
      const ql_ccom = cv?.qualified_lead_ccom ?? 0
      const purchases = cv ? (useFormConversions ? (cv.form_conversion ?? 0) : (cv.purchase_ccom ?? 0)) : 0
      const revenue = useFormConversions ? 0 : (cv?.purchase_revenue ?? 0)
      const adsAdded = adsAddedMap.get(`${c.campaign_id}|${c.sku ?? ''}`) ?? 0
      const m: CampMetrics = {
        spend: c.ad_spend, impressions: c.impressions,
        video_views: c.video_views ?? 0, video_view_50pct: c.video_view_50pct ?? 0,
        link_click: c.link_click,
        ga4_first_visit: ga?.ga4_first_visit ?? 0, ga4_page_view: ga?.ga4_page_view ?? 0, ga4_view_offer: ga?.ga4_view_offer ?? 0,
        leads, rl_ccom, ql_ccom, purchases, revenue,
      }
      return { ...c, ...m, adsAdded, cprl: safeDiv(m.spend, leads), cpa: safeDiv(m.spend, purchases), roas: safeDiv(revenue, m.spend) }
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
      const colDef = CAMP_COLS.find(c => c.id === sortKey)
      grouped[s].sort((a, b) => {
        const getSortVal = (row: typeof a): string | number => {
          if (sortKey === 'name') return row.campaign_name ?? ''
          if (sortKey === 'funnel') return row.funnel ?? '99'
          if (sortKey === 'adsAdded') return row.adsAdded
          if (colDef) return colDef.get(row)
          return row.spend
        }
        const av = getSortVal(a)
        const bv = getSortVal(b)
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
    const out: Record<string, CampMetrics & { adsAdded: number; cprl: number; cpa: number; roas: number }> = {}
    for (const [sku, rows] of Object.entries(campaignsBySku)) {
      const s = rows.reduce((a, c) => ({
        spend: a.spend + c.spend, impressions: a.impressions + c.impressions,
        video_views: a.video_views + c.video_views, video_view_50pct: a.video_view_50pct + c.video_view_50pct,
        link_click: a.link_click + c.link_click,
        ga4_first_visit: a.ga4_first_visit + c.ga4_first_visit, ga4_page_view: a.ga4_page_view + c.ga4_page_view, ga4_view_offer: a.ga4_view_offer + c.ga4_view_offer,
        leads: a.leads + c.leads, rl_ccom: a.rl_ccom + c.rl_ccom, ql_ccom: a.ql_ccom + c.ql_ccom,
        purchases: a.purchases + c.purchases, revenue: a.revenue + c.revenue, adsAdded: a.adsAdded + c.adsAdded,
      }), { spend: 0, impressions: 0, video_views: 0, video_view_50pct: 0, link_click: 0, ga4_first_visit: 0, ga4_page_view: 0, ga4_view_offer: 0, leads: 0, rl_ccom: 0, ql_ccom: 0, purchases: 0, revenue: 0, adsAdded: 0 })
      out[sku] = { ...s, cprl: safeDiv(s.spend, s.leads), cpa: safeDiv(s.spend, s.purchases), roas: safeDiv(s.revenue, s.spend) }
    }
    return out
  }, [campaignsBySku])

  const filteredSkus = activeSkus

  const toggleSku = (sku: string) => {
    setExpandedSkus(prev => {
      const next = new Set(prev)
      if (next.has(sku)) next.delete(sku); else next.add(sku)
      return next
    })
    setSelectedCampaign(null)
  }

  const getFilteredCampaigns = (sku: string) => campaignsBySku[sku] ?? []

  // ── Merged ad data ──
  const ads = useMemo(() => {
    if (!adData) return []
    const convMap = new Map<string, ConvRow>()
    for (const c of adData.ad_conversions) convMap.set(c.ad_id!, c)
    const ga4Map = new Map<string, Ga4SummaryRow>()
    for (const g of (adData.ad_ga4 ?? [])) ga4Map.set(g.ad_id!, g)
    const dimMap = new Map<string, AdDimRow>()
    for (const d of adData.ad_dimension) dimMap.set(d.ad_id, d)
    const bridgeMap = new Map<string, { created_by: string | null; lp_url: string | null; notion_url: string | null }>()
    for (const b of (adData.bridge_page ?? [])) bridgeMap.set(b.ad_id, b)

    const h2 = new Date(); h2.setDate(h2.getDate() - 2); const h2Str = h2.toISOString().slice(0, 10)

    return adData.ads.map(a => {
      const cv = convMap.get(a.ad_id)
      const ga = ga4Map.get(a.ad_id)
      const dim = dimMap.get(a.ad_id)
      const bridge = dim?.internal_ad_id ? bridgeMap.get(dim.internal_ad_id) : null
      const leads = cv ? (useFormConversions ? (cv.form_submission ?? 0) : (cv.real_lead_ccom + cv.real_lead_d2or + cv.real_lead_mpsh + cv.real_lead_ofls)) : 0
      const rl_ccom = cv?.real_lead_ccom ?? 0
      const ql_ccom = cv?.qualified_lead_ccom ?? 0
      const purchases = cv ? (useFormConversions ? (cv.form_conversion ?? 0) : (cv.purchase_ccom ?? 0)) : 0
      const revenue = useFormConversions ? 0 : (cv?.purchase_revenue ?? 0)
      const publishDate = dim?.publish_date ?? null
      const daysSincePublish = publishDate ? Math.floor((new Date(h2Str).getTime() - new Date(publishDate).getTime()) / 86400000) : 999
      const isLearning = daysSincePublish < 7
      const isBleeder = !isLearning && leads === 0 && purchases === 0 && revenue === 0
      const status: 'Learning' | 'Running' | 'Bleeder' = isLearning ? 'Learning' : isBleeder ? 'Bleeder' : 'Running'
      const statusOrder = isLearning ? 0 : isBleeder ? 2 : 1
      const grade = isLearning ? null : (dim?.grade_ads_quality ?? null)
      const m: CampMetrics = {
        spend: a.ad_spend, impressions: a.impressions,
        video_views: a.video_views ?? 0, video_view_50pct: a.video_view_50pct ?? 0,
        link_click: a.link_click,
        ga4_first_visit: ga?.ga4_first_visit ?? 0, ga4_page_view: ga?.ga4_page_view ?? 0, ga4_view_offer: ga?.ga4_view_offer ?? 0,
        leads, rl_ccom, ql_ccom, purchases, revenue,
      }
      return {
        ...a, ...m,
        ad_title: dim?.ad_title ?? null,
        internal_ad_id: dim?.internal_ad_id ?? null,
        sku: dim?.sku ?? null,
        publish_date: publishDate,
        created_by: bridge?.created_by ?? null,
        lp_url: bridge?.lp_url ?? null,
        notion_url: bridge?.notion_url ?? null,
        status, statusOrder, grade,
        cprl: safeDiv(m.spend, leads),
        cpa: safeDiv(m.spend, purchases),
        roas: safeDiv(revenue, m.spend),
      }
    })
    .filter(a => a.ad_title !== null && !a.ad_title.toLowerCase().includes('(deleted ad)'))
    .filter(a => !selectedSku || a.sku === selectedSku)
  }, [adData, selectedSku])

  // ── Sorted ads ──
  const sortedAds = useMemo(() => {
    const mult = adSortDir === 'desc' ? -1 : 1
    return [...ads].sort((a, b) => {
      if (adSortKey === 'status') {
        const diff = mult * (a.statusOrder - b.statusOrder)
        return diff !== 0 ? diff : b.ad_spend - a.ad_spend // secondary: spend desc
      }
      const colDef = CAMP_COLS.find(c => c.id === adSortKey)
      const getSortVal = (row: typeof a): string | number => {
        if (adSortKey === 'title') return row.ad_title ?? ''
        if (adSortKey === 'publish_date') return row.publish_date ?? ''
        if (adSortKey === 'name') return row.internal_ad_id ?? ''
        if (colDef) return colDef.get(row)
        return row.spend
      }
      const av = getSortVal(a)
      const bv = getSortVal(b)
      return typeof av === 'string' ? mult * av.localeCompare(bv as string) : mult * ((av as number) - (bv as number))
    })
  }, [ads, adSortKey, adSortDir])

  const filteredAds = useMemo(() => {
    if (!adSearchTerm.trim()) return sortedAds
    const q = adSearchTerm.toLowerCase().trim()
    return sortedAds.filter(a =>
      (a.ad_title && a.ad_title.toLowerCase().includes(q)) ||
      (a.internal_ad_id && a.internal_ad_id.toLowerCase().includes(q)) ||
      a.ad_id.toLowerCase().includes(q)
    )
  }, [sortedAds, adSearchTerm])

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

    // Detect latest GA4 date and backfill predicted values for missing dates
    const latestGa4 = dg.length > 0 ? dg.map(r => r.date).sort().pop()! : undefined
    if (latestGa4) {
      const avg7 = (arr: number[], endIdx: number) => {
        const start = Math.max(0, endIdx - 6)
        const slice = arr.slice(start, endIdx + 1).filter(v => v > 0)
        return slice.length > 0 ? Math.round(slice.reduce((s, v) => s + v, 0) / slice.length) : 0
      }
      for (let i = 0; i < dates.length; i++) {
        if (dates[i] <= latestGa4) continue
        dailyPageView[i] = avg7(dailyPageView, i - 1)
        dailyViewOffer[i] = avg7(dailyViewOffer, i - 1)
      }
    }

    // CPRL = MA14(spend) / MA14(leads) — 14D window avoids 0-purchase gaps in per-campaign data
    const spendMA = movingAvg(dailySpend, 14)
    const leadsMA = movingAvg(dailyLeads, 14)
    const cprlSeriesRaw: ChartPoint[] = dates.map((d, i) => ({ date: d, value: leadsMA[i] > 0 ? spendMA[i] / leadsMA[i] : 0 }))
    const cprlDailySeriesRaw: ChartPoint[] = dates.map((d, i) => ({ date: d, value: dailyLeads[i] > 0 ? dailySpend[i] / dailyLeads[i] : 0 }))

    // CPA CC = MA14(spend) / MA14(purchases)
    const purchasesMA = movingAvg(dailyPurchases, 14)
    const cpaSeriesRaw: ChartPoint[] = dates.map((d, i) => ({ date: d, value: purchasesMA[i] > 0 ? spendMA[i] / purchasesMA[i] : 0 }))
    const cpaDailySeriesRaw: ChartPoint[] = dates.map((d, i) => ({ date: d, value: dailyPurchases[i] > 0 ? dailySpend[i] / dailyPurchases[i] : 0 }))

    // CTR = clicks / impressions
    const ctrSeriesRaw: ChartPoint[] = dates.map((d, i) => ({ date: d, value: dailyImpressions[i] > 0 ? dailyClicks[i] / dailyImpressions[i] : 0 }))

    // LPVO = view_offer / page_view
    const lpvoSeriesRaw: ChartPoint[] = dates.map((d, i) => ({ date: d, value: dailyPageView[i] > 0 ? dailyViewOffer[i] / dailyPageView[i] : 0 }))

    // VO2L = leads / view_offer
    const vo2lSeriesRaw: ChartPoint[] = dates.map((d, i) => ({ date: d, value: dailyViewOffer[i] > 0 ? dailyLeads[i] / dailyViewOffer[i] : 0 }))

    // Trim warm-up rows — only keep dates >= dateFrom
    const trim = (s: ChartPoint[]) => s.filter(p => p.date >= dateFrom)
    const cprlSeries = trim(cprlSeriesRaw)
    const cprlDailySeries = trim(cprlDailySeriesRaw)
    const cpaSeries = trim(cpaSeriesRaw)
    const cpaDailySeries = trim(cpaDailySeriesRaw)
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
      cprlDailySeries,
      cpa: totalPurchases > 0 ? totalSpend / totalPurchases : 0,
      cpaSeries,
      cpaDailySeries,
      ctr: totalImpressions > 0 ? totalClicks / totalImpressions : 0,
      ctrSeries,
      lpvo: totalPageView > 0 ? totalViewOffer / totalPageView : 0,
      lpvoSeries,
      vo2l: totalViewOffer > 0 ? totalLeads / totalViewOffer : 0,
      vo2lSeries,
      forecastFromDate: latestGa4,
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
    const s = campaigns.reduce((a, c) => ({
      spend: a.spend + c.spend, impressions: a.impressions + c.impressions,
      video_views: a.video_views + c.video_views, video_view_50pct: a.video_view_50pct + c.video_view_50pct,
      link_click: a.link_click + c.link_click,
      ga4_first_visit: a.ga4_first_visit + c.ga4_first_visit, ga4_page_view: a.ga4_page_view + c.ga4_page_view, ga4_view_offer: a.ga4_view_offer + c.ga4_view_offer,
      leads: a.leads + c.leads, rl_ccom: a.rl_ccom + c.rl_ccom, ql_ccom: a.ql_ccom + c.ql_ccom,
      purchases: a.purchases + c.purchases, revenue: a.revenue + c.revenue, adsAdded: a.adsAdded + c.adsAdded,
    }), { spend: 0, impressions: 0, video_views: 0, video_view_50pct: 0, link_click: 0, ga4_first_visit: 0, ga4_page_view: 0, ga4_view_offer: 0, leads: 0, rl_ccom: 0, ql_ccom: 0, purchases: 0, revenue: 0, adsAdded: 0 })
    return { ...s, cprl: safeDiv(s.spend, s.leads), cpa: safeDiv(s.spend, s.purchases), roas: safeDiv(s.revenue, s.spend) }
  }, [campaigns])

  return (
    <div style={{ padding: '24px 28px', fontFamily: 'Inter, system-ui, sans-serif', color: '#fff', minHeight: '100vh', fontSize: '85%' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 16, fontWeight: 800, letterSpacing: '-0.02em' }}>{pageTitle}</div>
        <div style={{ fontSize: 10, fontWeight: 600, padding: '3px 10px', borderRadius: 6, background: `${badgeColor}1f`, border: `1px solid ${badgeColor}40`, color: badgeColor }}>{brand}</div>
      </div>

      {/* Controls row — sticky */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 30,
        display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20, flexWrap: 'wrap',
        padding: '10px 0', background: 'rgba(13,14,18,0.97)', backdropFilter: 'blur(8px)',
      }}>
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

        {/* Column picker */}
        <div style={{ position: 'relative', marginLeft: 'auto' }}>
          <button onClick={() => setShowColPicker(!showColPicker)} style={{
            padding: '5px 12px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.12)', cursor: 'pointer',
            fontWeight: 700, fontSize: 10, background: showColPicker ? 'rgba(129,140,248,0.15)' : 'rgba(255,255,255,0.06)', color: showColPicker ? '#818cf8' : 'rgba(255,255,255,0.6)',
          }}>⊞ Columns ({activeCols.length})</button>
          {showColPicker && (
            <div style={{
              position: 'absolute', right: 0, top: 32, zIndex: 50, background: '#1a1b20', border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: 10, padding: '12px 14px', width: 320, maxHeight: 520, overflowY: 'auto', boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
            }}>
              {/* Available columns — two columns: Metrics | Ratios */}
              <div style={{ display: 'flex', gap: 12, marginBottom: 14 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 9, fontWeight: 700, color: 'rgba(255,255,255,0.4)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 4 }}>METRICS</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    {CAMP_COLS.filter(c => !c.isRatio).map(col => {
                      const isOn = colOrder.includes(col.id)
                      return (
                        <button key={col.id} onClick={() => toggleCol(col.id)} style={{
                          padding: '3px 8px', fontSize: 10, fontWeight: 600, borderRadius: 4, border: 'none', cursor: 'pointer', textAlign: 'left',
                          background: isOn ? 'rgba(52,211,153,0.15)' : 'rgba(255,255,255,0.06)',
                          color: isOn ? '#34d399' : 'rgba(255,255,255,0.4)',
                        }}>
                          {colLabels?.[col.id] ?? col.label}
                        </button>
                      )
                    })}
                  </div>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 9, fontWeight: 700, color: 'rgba(255,255,255,0.4)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 4 }}>RATIOS</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    {CAMP_COLS.filter(c => c.isRatio).map(col => {
                      const isOn = colOrder.includes(col.id)
                      return (
                        <button key={col.id} onClick={() => toggleCol(col.id)} style={{
                          padding: '3px 8px', fontSize: 10, fontWeight: 600, borderRadius: 4, border: 'none', cursor: 'pointer', textAlign: 'left',
                          background: isOn ? 'rgba(96,165,250,0.15)' : 'rgba(255,255,255,0.06)',
                          color: isOn ? '#60a5fa' : 'rgba(255,255,255,0.4)',
                        }}>
                          {colLabels?.[col.id] ?? col.label}
                        </button>
                      )
                    })}
                  </div>
                </div>
              </div>

              {/* Column order */}
              <div style={{ fontSize: 9, fontWeight: 700, color: 'rgba(255,255,255,0.4)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 6 }}>COLUMN ORDER</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {activeCols.map((col, idx) => (
                  <div key={col.id}
                    draggable
                    onDragStart={() => handleDragStart(col.id)}
                    onDragOver={(e) => handleDragOver(e, col.id)}
                    onDragLeave={handleDragLeave}
                    onDrop={() => handleDrop(col.id)}
                    onDragEnd={handleDragEnd}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 6,
                      padding: '4px 8px', fontSize: 11, fontWeight: 600, borderRadius: 4,
                      background: dragOverId === col.id ? 'rgba(129,140,248,0.15)' : 'rgba(255,255,255,0.04)',
                      color: 'rgba(255,255,255,0.7)',
                      cursor: 'grab',
                      borderTop: dragOverId === col.id ? '2px solid #818cf8' : '2px solid transparent',
                      transition: 'background 0.1s',
                    }}
                  >
                    <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.2)', cursor: 'grab', userSelect: 'none' }}>⠿</span>
                    <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.25)', fontWeight: 700, width: 16, textAlign: 'center' }}>{idx + 1}</span>
                    <span style={{ flex: 1 }}>{col.label}</span>
                    <button onClick={() => moveColumn(col.id, -1)} disabled={idx === 0} style={{
                      padding: '1px 4px', fontSize: 10, fontWeight: 700, borderRadius: 3,
                      border: 'none', cursor: idx > 0 ? 'pointer' : 'default',
                      background: 'rgba(255,255,255,0.06)', color: idx > 0 ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.15)',
                    }}>↑</button>
                    <button onClick={() => moveColumn(col.id, 1)} disabled={idx === activeCols.length - 1} style={{
                      padding: '1px 4px', fontSize: 10, fontWeight: 700, borderRadius: 3,
                      border: 'none', cursor: idx < activeCols.length - 1 ? 'pointer' : 'default',
                      background: 'rgba(255,255,255,0.06)', color: idx < activeCols.length - 1 ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.15)',
                    }}>↓</button>
                    <button onClick={() => toggleCol(col.id)} style={{
                      padding: '1px 4px', fontSize: 10, fontWeight: 700, borderRadius: 3,
                      border: 'none', cursor: 'pointer',
                      background: 'rgba(248,113,113,0.1)', color: '#f87171',
                    }}>×</button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {campLoading && <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', marginBottom: 16 }}>Loading…</div>}

      {/* Hierarchical campaign table */}
      <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12, overflow: 'hidden' }}>
        <div style={{ padding: '10px 14px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ fontSize: 12, fontWeight: 700 }}>Campaigns</div>
          <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', marginLeft: 'auto' }}>{campaigns.length} campaigns · {filteredSkus.length} products</div>
        </div>
        <div style={{ maxHeight: selectedCampaign ? 350 : 600, overflowY: 'auto', overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10 }}>
            <thead>
              <tr style={{ position: 'sticky', top: 0, background: 'rgba(13,14,18,0.95)', zIndex: 1 }}>
                <SortTh label="Product / Campaign" k="name" current={sortKey} dir={sortDir} onClick={toggleSort} />
                <SortTh label="Funnel" k="funnel" current={sortKey} dir={sortDir} onClick={toggleSort} />
                {activeCols.map(col => (
                  <SortTh key={col.id} label={col.label} k={col.id as SortKey} current={sortKey} dir={sortDir} onClick={toggleSort} align="right" />
                ))}
                <SortTh label="Ads Added" k="adsAdded" current={sortKey} dir={sortDir} onClick={toggleSort} align="right" />
              </tr>
            </thead>
            <tbody>
              {/* Grand totals row */}
              {campaigns.length > 0 && (
                <tr style={{ background: 'rgba(99,102,241,0.06)', borderBottom: '2px solid rgba(99,102,241,0.2)' }}>
                  <td style={{ padding: '7px 10px', fontWeight: 800, color: '#818cf8' }}>ALL PRODUCTS</td>
                  <td style={{ padding: '7px 10px' }}></td>
                  {activeCols.map(col => {
                    const v = col.get(totals)
                    return <td key={col.id} style={{ padding: '7px 10px', textAlign: 'right', fontWeight: 700, color: '#fff', whiteSpace: 'nowrap' }}>{v > 0 ? col.fmt(v) : '-'}</td>
                  })}
                  <td style={{ padding: '7px 10px', textAlign: 'right', fontWeight: 700, color: '#fff', whiteSpace: 'nowrap' }}>{totals.adsAdded || '-'}</td>
                </tr>
              )}

              {/* Product rows (expandable) + Campaign rows (nested) */}
              {filteredSkus.map(sku => {
                const t = skuTotals[sku]
                if (!t) return null
                const meta = SKU_META[sku]
                const isExpanded = expandedSkus.has(sku)
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
                      {activeCols.map(col => {
                        const v = col.get(t)
                        return <td key={col.id} style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 700, color: '#fff', whiteSpace: 'nowrap' }}>{v > 0 ? col.fmt(v) : '-'}</td>
                      })}
                      <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 700, color: t.adsAdded > 0 ? '#60a5fa' : 'rgba(255,255,255,0.25)', whiteSpace: 'nowrap' }}>{t.adsAdded > 0 ? `+${t.adsAdded}` : '-'}</td>
                    </tr>

                    {/* Campaign rows (shown when expanded) */}
                    {isExpanded && skuCampaigns.map(c => {
                      const isSelected = selectedCampaign === c.campaign_id && selectedSku === sku
                      const funnelLabel = c.funnel === '00' ? 'ToFU00' : c.funnel === '25' ? 'MoFU25' : c.funnel === '50' ? 'BoFU50' : c.funnel === '75' ? 'BoFU75' : c.funnel ?? '-'
                      const funnelColor = c.funnel === '00' ? '#818cf8' : c.funnel === '25' ? '#60a5fa' : c.funnel === '50' ? '#fbbf24' : c.funnel === '75' ? '#fb923c' : 'rgba(255,255,255,0.3)'
                      return (
                        <tr key={`${c.campaign_id}-${sku}`}
                          onClick={() => { if (isSelected) { setSelectedCampaign(null); setSelectedSku(null) } else { setSelectedCampaign(c.campaign_id); setSelectedSku(sku) } }}
                          style={{ borderBottom: '1px solid rgba(255,255,255,0.03)', cursor: 'pointer', background: isSelected ? 'rgba(99,102,241,0.08)' : 'transparent', transition: 'background 0.1s' }}
                          onMouseEnter={e => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.03)' }}
                          onMouseLeave={e => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = 'transparent' }}
                        >
                          <td style={{ padding: '7px 10px 7px 32px', fontWeight: 600, color: isSelected ? '#818cf8' : '#fff', maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {isSelected && <span style={{ marginRight: 4 }}>▸</span>}
                            {c.campaign_name ?? c.campaign_id}
                          </td>
                          <td style={{ padding: '7px 10px' }}><span style={{ fontSize: 9, fontWeight: 700, color: funnelColor, padding: '1px 5px', borderRadius: 3, background: `${funnelColor}18`, border: `1px solid ${funnelColor}30` }}>{funnelLabel}</span></td>
                          {activeCols.map(col => {
                            const v = col.get(c)
                            return <td key={col.id} style={{ padding: '7px 10px', textAlign: 'right', fontWeight: col.isRatio ? 700 : 600, color: col.isRatio ? '#fff' : 'rgba(255,255,255,0.7)', whiteSpace: 'nowrap' }}>{v > 0 ? col.fmt(v) : '-'}</td>
                          })}
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
              fmt={(v) => fmtRp(Math.round(v))} fmtShort={(v) => fmtRpShort(v)} adsMarkers={adsMarkers}
              rawSeries={campaignCharts.cprlDailySeries} maLabel="14d MA" />
            <MetricCard label={cfgCpaLabel ?? 'CPA CC'} value={campaignCharts.cpa > 0 ? fmtRp(Math.round(campaignCharts.cpa)) : '—'}
              sub="Target Rp 2M" color="#f472b6" series={campaignCharts.cpaSeries}
              fixedTarget={2_000_000} higherIsBetter={false}
              fmt={(v) => fmtRp(Math.round(v))} fmtShort={(v) => fmtRpShort(v)} adsMarkers={adsMarkers}
              rawSeries={campaignCharts.cpaDailySeries} maLabel="14d MA" />
            <MetricCard label="LPVO" value={fmtPct(campaignCharts.lpvo)} color="#fbbf24" series={campaignCharts.lpvoSeries}
              higherIsBetter={true} fmt={(v) => fmtPct(v)} fmtShort={(v) => fmtPctShort(v)} adsMarkers={adsMarkers} forecastFromDate={campaignCharts.forecastFromDate} />
            <MetricCard label="VO2L" value={fmtPct(campaignCharts.vo2l)} color="#f87171" series={campaignCharts.vo2lSeries}
              higherIsBetter={true} fmt={(v) => fmtPct(v)} fmtShort={(v) => fmtPctShort(v)} adsMarkers={adsMarkers} forecastFromDate={campaignCharts.forecastFromDate} />
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
              {adLoading ? 'Loading…' : adSearchTerm ? `${filteredAds.length} / ${sortedAds.length} ads` : `${sortedAds.length} ads`}
            </div>
            <button onClick={() => setSelectedCampaign(null)}
              style={{ padding: '3px 8px', fontSize: 9, fontWeight: 600, borderRadius: 4, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.5)', cursor: 'pointer' }}>
              ✕ Close
            </button>
          </div>

          {/* Search bar */}
          <div style={{ padding: '6px 14px' }}>
            <input
              type="text"
              placeholder="Search ads by title or name…"
              value={adSearchTerm}
              onChange={e => setAdSearchTerm(e.target.value)}
              style={{
                width: '100%', maxWidth: 400, padding: '6px 10px', fontSize: 11, fontWeight: 500,
                borderRadius: 6, border: '1px solid rgba(255,255,255,0.1)',
                background: 'rgba(255,255,255,0.04)', color: '#e0e2e6',
                outline: 'none',
              }}
            />
          </div>
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

          <div style={{ maxHeight: 500, overflowY: 'auto', overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10 }}>
              <thead>
                <tr style={{ position: 'sticky', top: 0, background: 'rgba(13,14,18,0.95)', zIndex: 1 }}>
                  <SortTh label="Title" k="title" current={adSortKey} dir={adSortDir} onClick={toggleAdSort} />
                  <SortTh label="Publish Date" k="publish_date" current={adSortKey} dir={adSortDir} onClick={toggleAdSort} />
                  <th style={{ padding: '8px 10px', fontWeight: 700, color: 'rgba(255,255,255,0.4)', fontSize: 10, textAlign: 'left', borderBottom: '1px solid rgba(255,255,255,0.08)', whiteSpace: 'nowrap' }}>Created By</th>
                  <th style={{ padding: '8px 10px', fontWeight: 700, color: 'rgba(255,255,255,0.4)', fontSize: 10, textAlign: 'left', borderBottom: '1px solid rgba(255,255,255,0.08)', whiteSpace: 'nowrap' }}>Landing Page</th>
                  <SortTh label="Status" k="status" current={adSortKey} dir={adSortDir} onClick={toggleAdSort} />
                  {showGrade && <th style={{ padding: '8px 10px', fontWeight: 700, color: 'rgba(255,255,255,0.4)', fontSize: 10, textAlign: 'center', borderBottom: '1px solid rgba(255,255,255,0.08)', whiteSpace: 'nowrap' }}>Grade</th>}
                  {activeCols.map(col => (
                    <SortTh key={col.id} label={col.label} k={col.id as SortKey} current={adSortKey} dir={adSortDir} onClick={toggleAdSort} align="right" />
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredAds.map(a => {
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
                    <td style={{ padding: '6px 10px', color: 'rgba(255,255,255,0.7)', whiteSpace: 'nowrap', fontSize: 9 }}>
                      {a.publish_date ? <>
                        {a.publish_date >= dateFrom && a.publish_date <= dateTo && <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: '#f87171', marginRight: 4, verticalAlign: 'middle' }} title="Published within selected period" />}
                        {a.publish_date}
                      </> : '-'}
                    </td>
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
                    {activeCols.map(col => {
                      const v = col.get(a)
                      return <td key={col.id} style={{ padding: '6px 10px', textAlign: 'right', fontWeight: 600, color: 'rgba(255,255,255,0.7)', whiteSpace: 'nowrap' }}>{v > 0 ? col.fmt(v) : '-'}</td>
                    })}
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
