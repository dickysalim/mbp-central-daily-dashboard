/**
 * DirectorPage — SKU-level KPI overview for the Director
 *
 * Data: JOINs cdd.v2_ad_performance (spend) with
 *       cdd.v2_mongodb_conversion_performance (ground truth results/purchases)
 *
 * Shows at-a-glance:
 * 1. CPR and CPA CC per SKU vs targets (ground truth)
 * 2. Whether each SKU is hitting targets (green/red)
 * 3. Daily trend lines with target reference lines + hover tooltips
 */

import { useState, useMemo, useCallback, useRef, useEffect } from 'react'
import { useQuery, keepPreviousData } from '@tanstack/react-query'
import { D1_WORKER_URL } from '../config/dataSource'

import imgMetafiber from '../assets/sku_images/Metafiber.webp'
import imgSuperfood from '../assets/sku_images/Superfood.webp'
import img3Peptide from '../assets/sku_images/3Peptide.webp'

import imgGoogleAds from '../assets/ads_platform_images/Google Ads.webp'
import imgGoogleSearch from '../assets/ads_platform_images/Google Search Ads.webp'
import imgMetaAds from '../assets/ads_platform_images/Meta Ads.webp'

// ── Constants ────────────────────────────────────────────────────────────────

export const TARGET_CPR = 150_000
export const TARGET_CPA_CC = 2_000_000
export const TARGET_ROAS_CC = 0.2

// Static lookup for known SKUs — extend as new SKUs are added
export const SKU_META: Record<string, { label: string; fullName: string; color: string; colorMuted: string; image: string | null }> = {
  MTA: { label: 'MTA', fullName: 'Metafiber', color: '#5b8def', colorMuted: 'rgba(91,141,239,0.15)', image: imgMetafiber },
  MSF: { label: 'MSF', fullName: 'Superfood', color: '#34d399', colorMuted: 'rgba(52,211,153,0.15)', image: imgSuperfood },
  M3P: { label: 'M3P', fullName: '3Peptide', color: '#a855f7', colorMuted: 'rgba(168,85,247,0.15)', image: img3Peptide },
  // Ads Platforms
  META: { label: 'META', fullName: 'Meta Leads Campaign', color: '#1877f2', colorMuted: 'rgba(24,119,242,0.15)', image: imgMetaAds },
  DGEN: { label: 'DGEN', fullName: 'Demand Gen', color: '#34a853', colorMuted: 'rgba(52,168,83,0.15)', image: imgGoogleAds },
  SRCH: { label: 'SRCH', fullName: 'Search Ads', color: '#fbbc04', colorMuted: 'rgba(251,188,4,0.15)', image: imgGoogleSearch },
}

// Fallback for unknown SKUs not in SKU_META
const SKU_COLORS = ['#f59e0b', '#ec4899', '#06b6d4', '#84cc16', '#f97316']
export function getSkuMeta(sku: string, idx: number) {
  if (SKU_META[sku]) return SKU_META[sku]
  const color = SKU_COLORS[idx % SKU_COLORS.length]
  return { label: sku, fullName: sku, color, colorMuted: `${color}26`, image: null }
}

export const PRESETS = [
  { label: '7D', days: 7 },
  { label: '14D', days: 14 },
  { label: '30D', days: 30 },
  { label: 'MTD', days: 0 }, // special: month to date
]

// ── Helpers ──────────────────────────────────────────────────────────────────

export function dateStr(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function getDateRange(days: number): { from: string; to: string } {
  const to = new Date()
  to.setDate(to.getDate() - 2) // H-2 (ETL pipeline latest available)
  if (days === 0) {
    // MTD
    const from = new Date(to.getFullYear(), to.getMonth(), 1)
    return { from: dateStr(from), to: dateStr(to) }
  }
  const from = new Date(to)
  from.setDate(from.getDate() - days + 1)
  return { from: dateStr(from), to: dateStr(to) }
}

export function fmtIDR(n: number): string {
  if (n < 0) return '-' + fmtIDR(-n)
  if (n >= 1_000_000_000) return `Rp ${(n / 1_000_000_000).toFixed(1)}B`
  if (n >= 1_000_000) return `Rp ${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `Rp ${(n / 1_000).toFixed(0)}K`
  return `Rp ${n.toFixed(0)}`
}

export function fmtNum(n: number): string {
  return n.toLocaleString('id-ID')
}

function shortDate(d: string): string {
  // "2026-07-21" → "Jul 21"
  const dt = new Date(d + 'T00:00:00')
  return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

// ── Data Fetching ────────────────────────────────────────────────────────────

export interface DirectorRow {
  date: string
  sku: string
  ad_spend: number
  impressions: number
  link_click: number
  attributed_results: number
  attributed_acquisition: number
  attributed_acquisition_revenue: number
  real_lead_ccom: number
  real_lead_d2or: number
  real_lead_mpsh: number
  real_lead_ofls: number
  purchase_ccom: number
  purchase_ccom_revenue: number
}

export async function fetchDirectorDaily(from: string, to: string): Promise<DirectorRow[]> {
  const url = `${D1_WORKER_URL}/v2/director-daily?from=${from}&to=${to}`
  const res = await fetch(url)
  if (!res.ok) throw new Error('Failed to fetch director data')
  const raw: any[] = await res.json()
  return raw.map(r => ({
    date: r.date,
    sku: r.sku,
    ad_spend: r.ad_spend || 0,
    impressions: r.impressions || 0,
    link_click: r.link_click || 0,
    attributed_results: r.attributed_results || 0,
    attributed_acquisition: r.attributed_acquisition || 0,
    attributed_acquisition_revenue: r.attributed_acquisition_revenue || 0,
    real_lead_ccom: r.real_lead_ccom || 0,
    real_lead_d2or: r.real_lead_d2or || 0,
    real_lead_mpsh: r.real_lead_mpsh || 0,
    real_lead_ofls: r.real_lead_ofls || 0,
    purchase_ccom: r.purchase_ccom || 0,
    purchase_ccom_revenue: r.purchase_ccom_revenue || 0,
  }))
}

// ── Sparkline with Hover Tooltip ─────────────────────────────────────────────

export type SparkPoint = {
  date: string
  value: number
}

interface SparklineProps {
  data: SparkPoint[]
  target: number
  title?: string
  fmt?: 'currency' | 'multiplier'
  /** true = below target is good (CPR/CPA); false = above target is good (RoAS) */
  lowerIsBetter?: boolean
  /** If provided, use this as the max deviation from target for Y scaling (enables cross-SKU comparison) */
  sharedMaxDev?: number
  /** Fixed Y-axis bounds — overrides dynamic scaling when both are provided */
  fixedYMin?: number
  fixedYMax?: number
  width?: number
  height?: number
  color: string
}

let sparklineIdCounter = 0

export function Sparkline({ data, target, title, width = 280, height = 150, color, fmt = 'currency', lowerIsBetter = true, sharedMaxDev, fixedYMin, fixedYMax }: SparklineProps) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  void sparklineIdCounter++

  const pad = { t: 14, r: 12, b: 24, l: 12 }
  const w = width - pad.l - pad.r
  const h = height - pad.t - pad.b

  const values = data.map(d => d.value)

  // ── Y-axis scaling: use fixed bounds if provided, otherwise dynamic ──
  let yMin: number, yMax: number
  if (fixedYMin !== undefined && fixedYMax !== undefined) {
    yMin = fixedYMin
    yMax = fixedYMax
  } else {
    const localMaxDev = values.reduce((mx, v) => Math.max(mx, Math.abs(v - target)), 0)
    const maxDev = sharedMaxDev ?? localMaxDev
    const padding = sharedMaxDev ? 0 : (maxDev * 0.2 || target * 0.1)
    yMin = target - maxDev - padding
    yMax = target + maxDev + padding
  }
  const yRange = yMax - yMin || 1

  // Guard: avoid NaN when only 1 data point (xStep would be /0)
  const xStep = data.length > 1 ? w / (data.length - 1) : w

  const yScaleRaw = (v: number) => pad.t + h - ((v - yMin) / yRange) * h
  const yClamp = (y: number) => Math.max(pad.t + 2, Math.min(pad.t + h - 2, y))
  const yScale = (v: number) => yClamp(yScaleRaw(v))
  const targetY = yScaleRaw(target)

  // Build data line points
  const points = values.map((v, i) => `${pad.l + i * xStep},${yScale(v)}`).join(' ')

  // Detect which points overflow
  const overflows = values.map(v => {
    if (v > yMax) return 'above'
    if (v < yMin) return 'below'
    return null
  })

  const lastValue = values.length > 0 ? values[values.length - 1] : null
  const lastY = lastValue !== null ? yScale(lastValue) : 0
  const lastIsGood = lastValue !== null && (lowerIsBetter ? lastValue <= target : lastValue >= target)

  const handleMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    const svg = svgRef.current
    if (!svg || data.length < 2) return
    const rect = svg.getBoundingClientRect()
    const svgX = ((e.clientX - rect.left) / rect.width) * width
    const dataX = svgX - pad.l
    const idx = Math.round(dataX / xStep)
    if (idx >= 0 && idx < data.length) {
      setHoverIdx(idx)
    } else {
      setHoverIdx(null)
    }
  }, [data.length, width, xStep, pad.l])

  const handleMouseLeave = useCallback(() => setHoverIdx(null), [])

  const hoveredPoint = hoverIdx !== null ? data[hoverIdx] : null
  const hoveredX = hoverIdx !== null ? pad.l + hoverIdx * xStep : 0
  const hoveredY = hoverIdx !== null ? yScale(values[hoverIdx]) : 0

  // Compute trend direction for line color
  const trendColor = (() => {
    const n = values.length
    if (n < 2) return lastIsGood ? '#34d399' : '#ef4444'
    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0
    for (let i = 0; i < n; i++) {
      sumX += i; sumY += values[i]; sumXY += i * values[i]; sumX2 += i * i
    }
    const denom = n * sumX2 - sumX * sumX
    const slope = denom !== 0 ? (n * sumXY - sumX * sumY) / denom : 0
    const trendGood = lowerIsBetter ? slope <= 0 : slope >= 0
    return trendGood ? '#34d399' : '#ef4444'
  })()

  // Show empty state for 0 data points — but AFTER all hooks
  if (data.length === 0) return <div className="dp-spark-empty">No data</div>

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${width} ${height}`}
      className="dp-spark"
      preserveAspectRatio="xMidYMid meet"
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      {/* Chart area boundary — rounded rectangle */}
      <rect
        x={pad.l} y={pad.t} width={w} height={h}
        rx={4} ry={4}
        fill="none"
        stroke="rgba(255,255,255,0.1)"
        strokeWidth={1.5}
      />
      {/* Boundary value labels — outside chart edges */}
      {title && (
        <text
          x={pad.l} y={pad.t - 3}
          fill="rgba(255,255,255,0.45)"
          fontSize={8}
          fontWeight={700}
          textAnchor="start"
          fontFamily="Inter, sans-serif"
          textTransform="uppercase"
          letterSpacing="0.08em"
        >
          {title}
        </text>
      )}
      <text
        x={pad.l + w} y={pad.t - 3}
        fill="rgba(255,255,255,0.25)"
        fontSize={8}
        textAnchor="end"
        fontFamily="Inter, sans-serif"
      >
        {fmt === 'multiplier' ? `${yMax.toFixed(1)}×` : fmtIDR(yMax)}
      </text>
      <text
        x={pad.l + w} y={pad.t + h + 11}
        fill="rgba(255,255,255,0.25)"
        fontSize={8}
        textAnchor="end"
        fontFamily="Inter, sans-serif"
      >
        {fmt === 'multiplier' ? `${Math.max(0, yMin).toFixed(1)}×` : fmtIDR(Math.max(0, yMin))}
      </text>

      {/* Target line (centered) */}
      <line
        x1={pad.l} y1={targetY}
        x2={pad.l + w} y2={targetY}
        stroke="rgba(255,255,255,0.2)"
        strokeWidth={1}
        strokeDasharray="4 3"
      />
      <text
        x={pad.l + w}
        y={targetY - 5}
        fill="rgba(255,255,255,0.3)"
        fontSize={9}
        textAnchor="end"
        fontFamily="Inter, sans-serif"
      >
        Target {fmt === 'multiplier' ? `${target}×` : fmtIDR(target)}
      </text>

      {/* Data line — colored by trend direction */}
      <polyline
        points={points}
        fill="none"
        stroke={trendColor}
        strokeWidth={2}
        strokeLinejoin="round"
        strokeLinecap="round"
      />

      {/* Overflow indicators — small triangles at clipped points */}
      {overflows.map((dir, i) => {
        if (!dir) return null
        const cx = pad.l + i * xStep
        const cy = dir === 'above' ? pad.t + 1 : pad.t + h - 1
        const tri = dir === 'above'
          ? `M${cx},${cy} L${cx - 4},${cy + 6} L${cx + 4},${cy + 6} Z`
          : `M${cx},${cy} L${cx - 4},${cy - 6} L${cx + 4},${cy - 6} Z`
        return <path key={i} d={tri} fill="#ef4444" opacity={0.7} />
      })}

      {/* Last point dot — green=good, red=bad */}
      <circle
        cx={pad.l + (data.length - 1) * xStep}
        cy={lastY}
        r={3.5}
        fill={lastIsGood ? '#34d399' : '#ef4444'}
        stroke="#0e0f12"
        strokeWidth={2}
      />

      {/* Hover vertical line + dot + tooltip */}
      {hoveredPoint && hoverIdx !== null && (
        <g>
          <line
            x1={hoveredX} y1={pad.t}
            x2={hoveredX} y2={pad.t + h}
            stroke="rgba(255,255,255,0.15)"
            strokeWidth={1}
            strokeDasharray="2 2"
          />
          <circle
            cx={hoveredX}
            cy={hoveredY}
            r={4}
            fill={trendColor}
            stroke="#0e0f12"
            strokeWidth={2}
          />
          <rect
            x={hoveredX + (hoverIdx > data.length / 2 ? -100 : 8)}
            y={Math.max(pad.t, hoveredY - 28)}
            width={92}
            height={30}
            rx={4}
            fill="rgba(20,21,26,0.95)"
            stroke="rgba(255,255,255,0.1)"
            strokeWidth={1}
          />
          <text
            x={hoveredX + (hoverIdx > data.length / 2 ? -54 : 54)}
            y={Math.max(pad.t, hoveredY - 28) + 13}
            fill="#e0e2e6"
            fontSize={11}
            fontWeight={700}
            textAnchor="middle"
            fontFamily="Inter, sans-serif"
          >
            {fmt === 'multiplier' ? `${hoveredPoint.value.toFixed(2)}×` : fmtIDR(hoveredPoint.value)}
          </text>
          <text
            x={hoveredX + (hoverIdx > data.length / 2 ? -54 : 54)}
            y={Math.max(pad.t, hoveredY - 28) + 25}
            fill="rgba(255,255,255,0.35)"
            fontSize={9}
            textAnchor="middle"
            fontFamily="Inter, sans-serif"
          >
            {shortDate(hoveredPoint.date)}
          </text>
        </g>
      )}

      {/* Invisible hit areas for hover */}
      {data.map((_, i) => (
        <rect
          key={i}
          x={pad.l + i * xStep - xStep / 2}
          y={0}
          width={xStep}
          height={height}
          fill="transparent"
        />
      ))}
    </svg>
  )
}

// ── SKU Card Component ───────────────────────────────────────────────────────

export type SKUTotals = {
  spend: number
  realLeads: number
  purchasesCcom: number
  revenueCcom: number
}

interface SKUCardProps {
  sku: string
  skuIdx: number
  totals: SKUTotals | null
  dailyCPR: SparkPoint[]
  dailyCPA: SparkPoint[]
  dailyRoAS: SparkPoint[]
  maxDevs: { cpr: number; cpa: number; roas: number }
  isLoading: boolean
}

export function SKUCard({ sku, skuIdx, totals, dailyCPR, dailyCPA, dailyRoAS, maxDevs, isLoading }: SKUCardProps) {
  const meta = getSkuMeta(sku, skuIdx)

  if (isLoading) {
    return (
      <div className="dp-card">
        <div className="dp-card-header">
          <span className="dp-sku-badge" style={{ background: meta.colorMuted, color: meta.color }}>
            {meta.label}
          </span>
          <span className="dp-sku-name">{meta.fullName}</span>
        </div>
        <div className="dp-card-loading">
          <div className="tv-spinner" />
          <span>Loading…</span>
        </div>
      </div>
    )
  }

  if (!totals) {
    return (
      <div className="dp-card">
        <div className="dp-card-header">
          <span className="dp-sku-badge" style={{ background: meta.colorMuted, color: meta.color }}>
            {meta.label}
          </span>
          <span className="dp-sku-name">{meta.fullName}</span>
        </div>
        <div className="dp-card-loading"><span>No data</span></div>
      </div>
    )
  }

  const cpr = totals.realLeads > 0 ? totals.spend / totals.realLeads : 0
  const cpaCcom = totals.purchasesCcom > 0 ? totals.spend / totals.purchasesCcom : 0
  const roasCc = totals.spend > 0 ? totals.revenueCcom / totals.spend : 0
  const cprOk = cpr > 0 && cpr <= TARGET_CPR
  const cpaOk = cpaCcom > 0 && cpaCcom <= TARGET_CPA_CC
  const roasOk = roasCc >= TARGET_ROAS_CC

  const cprDelta = cpr > 0 ? ((cpr - TARGET_CPR) / TARGET_CPR) * 100 : 0
  const cpaDelta = cpaCcom > 0 ? ((cpaCcom - TARGET_CPA_CC) / TARGET_CPA_CC) * 100 : 0
  const roasDelta = roasCc > 0 ? ((roasCc - TARGET_ROAS_CC) / TARGET_ROAS_CC) * 100 : 0

  return (
    <div className="dp-card">
      <div className="dp-card-body">
        {/* SKU product image + label */}
        <div className="dp-card-image">
          {meta.image
            ? <img src={meta.image} alt={meta.fullName} />
            : <div className="dp-sku-placeholder" style={{ background: meta.colorMuted, color: meta.color }}>{meta.label}</div>
          }
          <span className="dp-sku-badge" style={{ background: meta.colorMuted, color: meta.color }}>
            {meta.label}
          </span>
          <span className="dp-sku-name">{meta.fullName}</span>
          <span className="dp-spend-badge">{fmtIDR(totals.spend)} spent</span>
        </div>

        {/* Card content */}
        <div className="dp-card-content">
          {/* Metrics row: number | ratio | number | ratio | number | ratio */}
          <div className="dp-kpi-row">
            {/* Real Leads */}
            <div className="dp-kpi">
              <div className="dp-kpi-label">Real Leads</div>
              <div className="dp-kpi-value" style={{ color: '#e0e2e6' }}>{fmtNum(totals.realLeads)}</div>
            </div>

            <div className="dp-kpi-divider" />

            {/* CPR */}
            <div className="dp-kpi">
              <div className="dp-kpi-label">CPR</div>
              <div className={`dp-kpi-value ${cprOk ? 'dp-kpi-good' : 'dp-kpi-bad'}`}>
                {cpr > 0 ? fmtIDR(cpr) : '—'}
              </div>
              {cpr > 0 && (
                <div className={`dp-kpi-delta ${cprDelta <= 0 ? 'dp-delta-good' : 'dp-delta-bad'}`}>
                  {cprDelta <= 0 ? '▼' : '▲'} {Math.abs(cprDelta).toFixed(0)}% vs target
                </div>
              )}
              <div className="dp-kpi-target">Target: {fmtIDR(TARGET_CPR)}</div>
            </div>

            <div className="dp-kpi-divider" />

            {/* Purchases CC */}
            <div className="dp-kpi">
              <div className="dp-kpi-label">Purchases CC</div>
              <div className="dp-kpi-value" style={{ color: '#e0e2e6' }}>{fmtNum(totals.purchasesCcom)}</div>
            </div>

            <div className="dp-kpi-divider" />

            {/* CPA CC */}
            <div className="dp-kpi">
              <div className="dp-kpi-label">CPA CC</div>
              <div className={`dp-kpi-value ${cpaOk ? 'dp-kpi-good' : 'dp-kpi-bad'}`}>
                {cpaCcom > 0 ? fmtIDR(cpaCcom) : '—'}
              </div>
              {cpaCcom > 0 && (
                <div className={`dp-kpi-delta ${cpaDelta <= 0 ? 'dp-delta-good' : 'dp-delta-bad'}`}>
                  {cpaDelta <= 0 ? '▼' : '▲'} {Math.abs(cpaDelta).toFixed(0)}% vs target
                </div>
              )}
              <div className="dp-kpi-target">Target: {fmtIDR(TARGET_CPA_CC)}</div>
            </div>

            <div className="dp-kpi-divider" />

            {/* Revenue CC */}
            <div className="dp-kpi">
              <div className="dp-kpi-label">Revenue CC</div>
              <div className="dp-kpi-value" style={{ color: '#e0e2e6' }}>{fmtIDR(totals.revenueCcom)}</div>
            </div>

            <div className="dp-kpi-divider" />

            {/* RoAS CC */}
            <div className="dp-kpi">
              <div className="dp-kpi-label">RoAS CC</div>
              <div className={`dp-kpi-value ${roasOk ? 'dp-kpi-good' : 'dp-kpi-bad'}`}>
                {roasCc > 0 ? `${roasCc.toFixed(2)}×` : '—'}
              </div>
              {roasCc > 0 && (
                <div className={`dp-kpi-delta ${roasDelta >= 0 ? 'dp-delta-good' : 'dp-delta-bad'}`}>
                  {roasDelta >= 0 ? '▲' : '▼'} {Math.abs(roasDelta).toFixed(0)}% vs target
                </div>
              )}
              <div className="dp-kpi-target">Target: {TARGET_ROAS_CC}×</div>
            </div>
          </div>

          {/* Trend Charts — horizontal */}
          <div className="dp-trends">
            <div className="dp-trend-box">
              <Sparkline title="CPR" data={dailyCPR} target={TARGET_CPR} color={meta.color} fixedYMin={0} fixedYMax={300_000} />
            </div>
            <div className="dp-trend-box">
              <Sparkline title="CPA CC" data={dailyCPA} target={TARGET_CPA_CC} color={meta.color} fixedYMin={0} fixedYMax={5_000_000} />
            </div>
            <div className="dp-trend-box">
              <Sparkline title="RoAS CC" data={dailyRoAS} target={TARGET_ROAS_CC} color={meta.color} fmt="multiplier" lowerIsBetter={false} fixedYMin={0} fixedYMax={0.4} />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Main Page ────────────────────────────────────────────────────────────────

export function DirectorPage() {
  // ── Per-brand date bounds + SKU list from DB ──
  interface BrandBounds { brand: string; earliest: string; latest: string; skus: string[] }
  const { data: brandBounds } = useQuery({
    queryKey: ['date-bounds'],
    queryFn: async () => {
      const res = await fetch(`${D1_WORKER_URL}/v2/date-bounds`)
      if (!res.ok) throw new Error('Failed to fetch date bounds')
      return res.json() as Promise<BrandBounds[]>
    },
    staleTime: 0, // always fresh — small payload, rarely changes
  })

  const brands = useMemo(() => brandBounds?.map(b => b.brand) ?? [], [brandBounds])

  // ── Brand state: default to first available brand ──
  const [brand, setBrand] = useState('')
  useEffect(() => {
    if (brands.length > 0 && !brand) setBrand(brands[0])
  }, [brands, brand])

  const activeBrand = brand || brands[0] || ''
  const activeBounds = useMemo(
    () => brandBounds?.find(b => b.brand === activeBrand),
    [brandBounds, activeBrand],
  )

  // SKUs available for the active brand
  const activeSkus = useMemo(
    () => activeBounds?.skus ?? [],
    [activeBounds],
  )

  // ── Date state: default to last 30 days within brand's range ──
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [lastBrand, setLastBrand] = useState('')

  // Reset dates whenever brand changes
  useEffect(() => {
    if (activeBrand && activeBounds && activeBrand !== lastBrand) {
      const latest = activeBounds.latest
      const d = new Date(latest + 'T00:00:00')
      d.setDate(d.getDate() - 29)
      const fromStr = dateStr(d)
      setTo(latest)
      setFrom(fromStr < activeBounds.earliest ? activeBounds.earliest : fromStr)
      setLastBrand(activeBrand)
    }
  }, [activeBrand, activeBounds, lastBrand])

  const activeFrom = from || activeBounds?.earliest || ''
  const activeTo = to || activeBounds?.latest || ''

  // ── Quick presets (scoped to active brand's bounds) ──
  const applyPreset = (days: number) => {
    if (!activeBounds) return
    const latest = activeBounds.latest
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

  // ── Data fetch (always scoped to brand) ──
  const { data: rawData, isLoading, error } = useQuery({
    queryKey: ['director-daily', activeFrom, activeTo, activeBrand],
    queryFn: async () => {
      const url = `${D1_WORKER_URL}/v2/director-daily?from=${activeFrom}&to=${activeTo}&brand=${activeBrand}`
      const res = await fetch(url)
      if (!res.ok) throw new Error('Failed to fetch director data')
      return res.json() as Promise<DirectorRow[]>
    },
    staleTime: 5 * 60_000,
    placeholderData: keepPreviousData, // keeps cards visible while new date range loads
    enabled: !!activeFrom && !!activeTo && !!activeBrand && activeFrom <= activeTo,
  })

  // Process totals per SKU (using ground truth)
  const skuTotals = useMemo(() => {
    if (!rawData) return {} as Record<string, SKUTotals>
    const map: Record<string, SKUTotals> = {}
    for (const r of rawData) {
      if (!map[r.sku]) map[r.sku] = { spend: 0, realLeads: 0, purchasesCcom: 0, revenueCcom: 0 }
      map[r.sku].spend += r.ad_spend
      map[r.sku].realLeads += r.real_lead_ccom + r.real_lead_d2or + r.real_lead_mpsh + r.real_lead_ofls
      map[r.sku].purchasesCcom += r.purchase_ccom
      map[r.sku].revenueCcom += r.purchase_ccom_revenue
    }
    return map
  }, [rawData])

  // Process daily trend per SKU (for sparklines with dates)
  const skuTrends = useMemo(() => {
    if (!rawData) return {} as Record<string, { cpr: SparkPoint[]; cpa: SparkPoint[]; roas: SparkPoint[] }>
    const map: Record<string, Map<string, { spend: number; realLeads: number; purchases: number; revenue: number }>> = {}
    for (const r of rawData) {
      if (!map[r.sku]) map[r.sku] = new Map()
      const existing = map[r.sku].get(r.date)
      const rl = r.real_lead_ccom + r.real_lead_d2or + r.real_lead_mpsh + r.real_lead_ofls
      if (existing) {
        existing.spend += r.ad_spend
        existing.realLeads += rl
        existing.purchases += r.purchase_ccom
        existing.revenue += r.purchase_ccom_revenue
      } else {
        map[r.sku].set(r.date, {
          spend: r.ad_spend,
          realLeads: rl,
          purchases: r.purchase_ccom,
          revenue: r.purchase_ccom_revenue,
        })
      }
    }

    const result: Record<string, { cpr: SparkPoint[]; cpa: SparkPoint[]; roas: SparkPoint[] }> = {}
    // Iterate all skus found in raw data (not hardcoded)
    const allSkus = Array.from(new Set(rawData.map(r => r.sku)))
    for (const sku of allSkus) {
      const dayMap = map[sku]
      if (!dayMap) { result[sku] = { cpr: [], cpa: [], roas: [] }; continue }
      const sorted = Array.from(dayMap.entries()).sort(([a], [b]) => a.localeCompare(b))
      result[sku] = {
        cpr: sorted
          .filter(([, d]) => d.realLeads > 0)
          .map(([date, d]) => ({ date, value: d.spend / d.realLeads })),
        cpa: sorted
          .filter(([, d]) => d.purchases > 0)
          .map(([date, d]) => ({ date, value: d.spend / d.purchases })),
        roas: sorted
          .filter(([, d]) => d.spend > 0)
          .map(([date, d]) => ({ date, value: d.revenue / d.spend })),
      }
    }
    return result
  }, [rawData])

  // Compute global max deviation per metric (for consistent Y scaling across SKUs)
  const globalMaxDevs = useMemo(() => {
    return { cpr: 150_000, cpa: 3_000_000, roas: 0.1 }
  }, [])

  // Overall totals
  const overallTotals = useMemo(() => {
    let spend = 0, realLeads = 0, purchases = 0, revenue = 0
    for (const s of Object.values(skuTotals)) {
      spend += s.spend; realLeads += s.realLeads; purchases += s.purchasesCcom; revenue += s.revenueCcom
    }
    const cpr = realLeads > 0 ? spend / realLeads : 0
    const cpa = purchases > 0 ? spend / purchases : 0
    const roas = spend > 0 ? revenue / spend : 0
    return { spend, realLeads, purchases, revenue, cpr, cpa, roas }
  }, [skuTotals])

  return (
    <div className="dp-page">
      {/* Toolbar */}
      <div className="dp-toolbar">
        <div className="dp-toolbar-left">
          <h1 className="dp-title">Product Performance Overview</h1>
          <span className="dp-subtitle">{activeFrom} → {activeTo}</span>
        </div>
        <div className="dp-toolbar-right">
          {/* Brand filter */}
          <select
            className="dp-select"
            value={activeBrand}
            onChange={e => setBrand(e.target.value)}
          >
            {brands.map(b => (
              <option key={b} value={b}>{b}</option>
            ))}
          </select>

          {/* Date pickers — no min/max constraints to avoid browser blanking field;
              range correction is handled in onChange instead */}
          <input
            type="date"
            className="dp-date-input"
            value={activeFrom}
            min={activeBounds?.earliest}
            max={activeBounds?.latest}
            onChange={e => {
              const v = e.target.value
              if (!v) return
              setFrom(v)
              if (v > activeTo) setTo(v) // from moved past to → snap to to
            }}
          />
          <span className="dp-date-sep">→</span>
          <input
            type="date"
            className="dp-date-input"
            value={activeTo}
            min={activeBounds?.earliest}
            max={activeBounds?.latest}
            onChange={e => {
              const v = e.target.value
              if (!v) return
              setTo(v)
              if (v < activeFrom) setFrom(v) // to moved before from → snap from to to
            }}
          />

          {/* Quick presets */}
          <div className="tv-presets">
            {PRESETS.map(p => (
              <button
                key={p.label}
                className="tv-preset"
                onClick={() => applyPreset(p.days)}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
      </div>


      {/* Error state */}
      {error && (
        <div className="dp-footnote" style={{ color: '#ef4444', borderColor: 'rgba(239,68,68,0.2)' }}>
          ❌ Failed to load data: {error instanceof Error ? error.message : 'Unknown error'}
        </div>
      )}

      {/* SKU Cards — dynamic from DB */}
      <div className="dp-cards">
        {activeSkus.length === 0 && isLoading && (
          <div className="dp-card-loading"><div className="tv-spinner" /><span>Loading SKUs…</span></div>
        )}
        {activeSkus.map((sku, idx) => (
          <SKUCard
            key={sku}
            sku={sku}
            skuIdx={idx}
            totals={skuTotals[sku] || null}
            dailyCPR={skuTrends[sku]?.cpr || []}
            dailyCPA={skuTrends[sku]?.cpa || []}
            dailyRoAS={skuTrends[sku]?.roas || []}
            maxDevs={globalMaxDevs}
            isLoading={isLoading}
          />
        ))}
      </div>

      {/* Data source note */}
      <div className="dp-footnote">
        📊 Spend from <strong>Meta API</strong> · Real Leads & Purchases from <strong>MongoDB ground truth</strong> (BSP events).
        CPR = Spend ÷ Real Leads (CCOM + D2OR + MPSH + OFLS) · CPA CC = Spend ÷ Purchase CCOM · RoAS CC = Revenue CC ÷ Spend.
      </div>
    </div>
  )
}
