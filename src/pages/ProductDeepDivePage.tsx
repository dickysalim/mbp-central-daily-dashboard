/**
 * SuperfoodDeepdivePage — Deep dive into Superfood (MSF) SKU performance
 *
 * Sections:
 * 1. SKU Card (reused from Director) — headline KPIs
 * 2. Full-funnel overview — 10 metric tiles with sparklines
 */

import { useState, useMemo, useEffect } from 'react'
import { useQuery, keepPreviousData } from '@tanstack/react-query'
import { D1_WORKER_URL } from '../config/dataSource'
import {
  TARGET_CPR,
  TARGET_CPA_CC,
  TARGET_ROAS_CC,
  getSkuMeta,
  PRESETS,
  dateStr,
  capToH2,
  fmtIDR,
  fmtNum,
  fetchDirectorDaily,
  SKUCard,
  Sparkline,
} from './ProductPerformancePage'
import type { SparkPoint, SKUTotals, ChangelogEntry } from './ProductPerformancePage'

// ── Funnel Data Fetching ─────────────────────────────────────────────────────

interface FunnelRow {
  date: string
  brand: string
  traffic_source: string
  sku: string
  ad_spend: number
  impressions: number
  link_click: number
  attributed_lp_view: number
  ga4_first_visit: number
  ga4_page_view: number
  ga4_view_offer: number
  ga4_lead_event_ccom: number
  ga4_lead_event_d2or: number
  ga4_lead_event_mpsh: number
  ga4_lead_event_ofls: number
  real_lead_ccom: number
  real_lead_d2or: number
  real_lead_mpsh: number
  real_lead_ofls: number
  purchase_ccom: number
  purchase_ccom_revenue: number
}

async function fetchFunnelDaily(from: string, to: string, sku?: string): Promise<FunnelRow[]> {
  let url = `${D1_WORKER_URL}/v2/funnel-daily?from=${from}&to=${to}`
  if (sku) url += `&sku=${sku}`
  const res = await fetch(url)
  if (!res.ok) throw new Error('Failed to fetch funnel data')
  return res.json()
}

// ── Mini Sparkline (inline, subtle) ──────────────────────────────────────────

interface MiniSparkProps {
  data: number[]
  width?: number
  height?: number
  /** true = lower values are good (costs), false = higher values are good (rates/volume) */
  lowerIsBetter?: boolean
}

function MiniSpark({ data, width = 80, height = 28, lowerIsBetter = false }: MiniSparkProps) {
  if (data.length < 2) return null

  const min = Math.min(...data)
  const max = Math.max(...data)
  const range = max - min || 1
  const pad = 2

  const xStep = (width - pad * 2) / (data.length - 1)
  const yScale = (v: number) => pad + (height - pad * 2) - ((v - min) / range) * (height - pad * 2)

  const points = data.map((v, i) => `${pad + i * xStep},${yScale(v)}`).join(' ')

  // Linear regression for trendline + color
  const n = data.length
  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0
  for (let i = 0; i < n; i++) {
    sumX += i; sumY += data[i]; sumXY += i * data[i]; sumX2 += i * i
  }
  const denom = n * sumX2 - sumX * sumX
  const slope = denom !== 0 ? (n * sumXY - sumX * sumY) / denom : 0
  const intercept = (sumY - slope * sumX) / n
  const trendingUp = slope >= 0
  const isGood = lowerIsBetter ? !trendingUp : trendingUp
  const lineColor = isGood ? 'rgba(52,211,153,0.6)' : 'rgba(239,68,68,0.5)'
  const dotColor = isGood ? '#34d399' : '#ef4444'

  // Trendline endpoints
  const tlY1 = yScale(intercept)
  const tlY2 = yScale(slope * (n - 1) + intercept)

  return (
    <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="sf-mini-spark">
      {/* Trendline */}
      <line
        x1={pad} y1={tlY1}
        x2={pad + (n - 1) * xStep} y2={tlY2}
        stroke={lineColor}
        strokeWidth={1}
        strokeDasharray="4 2"
        opacity={0.5}
      />
      <polyline
        points={points}
        fill="none"
        stroke={lineColor}
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {/* Last point dot */}
      <circle
        cx={pad + (data.length - 1) * xStep}
        cy={yScale(data[data.length - 1])}
        r={2}
        fill={dotColor}
      />
    </svg>
  )
}

// ── Metric Tile ──────────────────────────────────────────────────────────────

interface MetricTileProps {
  label: string
  value: string
  sparkData: number[]
  source: 'ads' | 'ga4' | 'mongo'
  /** true = lower values are good (costs) */
  lowerIsBetter?: boolean
}

const SOURCE_BADGE: Record<string, { label: string; color: string; bg: string }> = {
  ads:   { label: 'Ads', color: '#5b8def', bg: 'rgba(91,141,239,0.12)' },
  ga4:   { label: 'GA4', color: '#f59e0b', bg: 'rgba(245,158,11,0.12)' },
  mongo: { label: 'MongoDB', color: '#34d399', bg: 'rgba(52,211,153,0.12)' },
}

function MetricTile({ label, value, sparkData, source, lowerIsBetter }: MetricTileProps) {
  const badge = SOURCE_BADGE[source]
  return (
    <div className="sf-metric-tile">
      <div className="sf-metric-text">
        <span className="sf-metric-label">{label}</span>
        <div className="sf-metric-value">{value}</div>
        <span className="sf-metric-source" style={{ color: badge.color, background: badge.bg }}>
          {badge.label}
        </span>
      </div>
      <div className="sf-metric-spark">
        <MiniSpark data={sparkData} width={100} height={48} lowerIsBetter={lowerIsBetter} />
      </div>
    </div>
  )
}

// ── Campaign Performance Breakdown ───────────────────────────────────────────

interface CampaignRow {
  traffic_source: string
  campaign_id: string
  campaign_name: string
  funnel: string        // from campaign_dimension: '00' | '25' | '50' | '75' | '-'
  daily_budget: number
  campaign_status: string
  ad_spend: number
  impressions: number
  link_click: number
  ga4_first_visit: number
  ga4_page_view: number
  ga4_view_offer: number
  real_lead_ccom: number
  real_lead_d2or: number
  real_lead_mpsh: number
  real_lead_ofls: number
  purchase_ccom: number
  revenue_ccom: number
}

async function fetchCampaignBreakdown(from: string, to: string, sku: string): Promise<CampaignRow[]> {
  const res = await fetch(`${D1_WORKER_URL}/v2/campaign-breakdown?from=${from}&to=${to}&sku=${sku}`)
  if (!res.ok) throw new Error('Failed to fetch campaign breakdown')
  return res.json()
}

interface ComputedRow {
  raw: CampaignRow
  realLeads: number
  realLeadsCC: number
  fv: number; pv: number; vo: number; rev: number
  cpm: number | null
  ctr: number | null
  cpc: number | null
  costPerLPView: number | null
  firstVisitRate: number | null
  lpvo: number | null
  vo2l: number | null
  cprl: number | null
  cvrCC: number | null
  cpaCC: number | null
  roasCC: number | null
  // Budget optimizer fields (populated after all rows computed)
  effScore: number
  suggestedBudget: number
  budgetDelta: number
  funnel: FunnelLevel
}

type SortKey = 'platform' | 'campaign_name' | 'funnel' |
  'daily_budget' | 'ad_spend' | 'impressions' | 'cpm' | 'link_click' | 'ctr' | 'cpc' |
  'first_visit' | 'cost_fv' | 'lp_view' | 'cost_lp_view' | 'fv_rate' | 'view_offer' | 'lpvo' |
  'real_leads' | 'vo2l' | 'cprl' | 'real_leads_cc' | 'purchase_cc' | 'cvr_cc' | 'cpa_cc' | 'revenue_cc' | 'roas_cc' |
  'eff_score' | 'suggested_budget' | 'budget_delta'

const FUNNEL_SORT_ORDER: Record<FunnelLevel, number> = {
  ToFU00: 0, MoFU25: 1, BoFU50: 2, BoFU75: 3, Unknown: 4,
}

const PLATFORM_COLOR: Record<string, { bg: string; text: string }> = {
  META: { bg: 'rgba(24,119,242,0.15)', text: '#5ba7ff' },
  DGEN: { bg: 'rgba(52,168,83,0.15)',  text: '#5ecf7e' },
  SRCH: { bg: 'rgba(251,188,4,0.15)',  text: '#fcd34d' },
  BOOST: { bg: 'rgba(168,85,247,0.15)', text: '#c084fc' },
}
function platformBadge(ts: string) {
  const c = PLATFORM_COLOR[ts] ?? { bg: 'rgba(255,255,255,0.08)', text: 'rgba(255,255,255,0.6)' }
  return (
    <span style={{
      background: c.bg, color: c.text,
      fontSize: 10, fontWeight: 700, letterSpacing: '0.06em',
      padding: '2px 6px', borderRadius: 4, whiteSpace: 'nowrap',
    }}>
      {ts}
    </span>
  )
}

function fmtPct(n: number | null): string {
  if (n === null) return '—'
  return `${n.toFixed(2)}%`
}

/** Full-number IDR format for budget values — no K/M truncation */
function fmtBudget(n: number): string {
  if (n < 0) return '-' + fmtBudget(-n)
  return `Rp ${new Intl.NumberFormat('id-ID').format(Math.round(n))}`
}

// ── Funnel-level parsing ─────────────────────────────────────────────────────
type FunnelLevel = 'ToFU00' | 'MoFU25' | 'BoFU50' | 'BoFU75' | 'Unknown'

/** Map campaign_dimension.funnel code to FunnelLevel */
function mapFunnelLevel(code: string): FunnelLevel {
  switch (code) {
    case '00': return 'ToFU00'
    case '25': return 'MoFU25'
    case '50': return 'BoFU50'
    case '75': return 'BoFU75'
    default:   return 'Unknown'
  }
}

const FUNNEL_BADGE: Record<FunnelLevel, { bg: string; text: string; short: string }> = {
  ToFU00:  { bg: 'rgba(99,102,241,0.15)',  text: '#818cf8', short: 'ToFU00' },
  MoFU25:  { bg: 'rgba(59,130,246,0.15)',  text: '#60a5fa', short: 'MoFU25' },
  BoFU50:  { bg: 'rgba(245,158,11,0.15)',  text: '#fbbf24', short: 'BoFU50' },
  BoFU75:  { bg: 'rgba(239,68,68,0.15)',   text: '#f87171', short: 'BoFU75' },
  Unknown: { bg: 'rgba(255,255,255,0.06)', text: 'rgba(255,255,255,0.4)', short: '—' },
}

// ── Funnel-aware KPI weights (v2) ────────────────────────────────────────────
// Each funnel level is scored on its PRIMARY JOB + a quality multiplier
// to prevent gaming (e.g., cheap clickbait traffic that doesn't convert).
//
//   ToFU00: Cost/FV efficiency × LPVO quality × FV volume
//   MoFU25: Cost/VO efficiency × VO2L quality × VO volume
//   BoFU50: CPA CC efficiency × RoAS quality  (fallback: CPRL if no purchases)
//   BoFU75: CPRL efficiency   × RL volume     (bonus: CPA CC if purchases)

// ── Budget Optimizer ─────────────────────────────────────────────────────────
// Principle: Ads platform optimizes for most results at lowest cost.
// If campaign CPRL < 150K (over-performing) → add budget, CPRL will naturally
//   rise toward 150K as you reach broader audiences.
// If campaign CPRL > 150K (under-performing) → cut budget, CPRL will improve
//   as the platform focuses on the best-converting subset.
//
// Decay rate by funnel depth: deeper funnel = audience exhausts faster.
//   ToFU00: α=0.15 (low decay — broad audiences scale well)
//   MoFU25: α=0.25
//   BoFU50: α=0.40
//   BoFU75: α=0.60 (high decay — retargeting pools are small)

const FUNNEL_DECAY: Record<string, number> = {
  ToFU00: 0.15, MoFU25: 0.25, BoFU50: 0.40, BoFU75: 0.60,
}

function computeBudgetOptimization(rows: ComputedRow[]): void {
  const scoreable = rows.filter(c =>
    c.funnel !== 'Unknown' &&
    c.raw.campaign_status !== 'PAUSED' &&
    c.raw.ad_spend > 0
  )

  const totalBudget = scoreable.reduce((s, c) => s + (c.raw.daily_budget || 0), 0)

  // Zero out non-scoreable
  rows.forEach(c => {
    if (!scoreable.includes(c)) {
      c.effScore = 0
      c.suggestedBudget = c.raw.daily_budget || 0
      c.budgetDelta = 0
    }
  })

  if (totalBudget <= 0 || scoreable.length === 0) return

  // ── Step 1: Compute each campaign's performance ratio ────────────────────
  // Blend CPRL and CPA CC using geometric mean:
  //   combined = √(cprl_ratio × cpa_ratio)
  // This ensures both metrics matter — great CPRL but bad CPA CC = balanced out.
  // Campaigns without purchases use CPRL only.

  const ratios = scoreable.map(c => {
    const cprl = c.realLeads > 0 ? c.raw.ad_spend / c.realLeads : null
    const cpaCC = c.raw.purchase_ccom > 0 ? c.raw.ad_spend / c.raw.purchase_ccom : null

    const cprlRatio = cprl !== null && cprl > 0 ? TARGET_CPR / cprl : null
    const cpaRatio = cpaCC !== null && cpaCC > 0 ? TARGET_CPA_CC / cpaCC : null

    if (cprlRatio !== null && cpaRatio !== null) {
      // Has both metrics → geometric mean
      return Math.sqrt(cprlRatio * cpaRatio)
    } else if (cprlRatio !== null) {
      // Has leads but no purchases → CPRL only
      return cprlRatio
    }
    // No leads at all → minimal allocation
    return 0.1
  })

  // ── Step 2: Apply funnel decay dampening ────────────────────────────────
  // budget_multiplier = ratio ^ (1 / (1 + α))
  // This moves PARTIALLY toward the target, not all the way.
  // Higher α (deeper funnel) = less aggressive movement.
  //
  // Example: CPRL = 75K (ratio = 2.0), ToFU α=0.15:
  //   multiplier = 2.0 ^ (1/1.15) = 1.85×  → aggressive scale-up
  // Same ratio, BoFU75 α=0.60:
  //   multiplier = 2.0 ^ (1/1.60) = 1.54×  → conservative scale-up

  const multipliers = scoreable.map((c, i) => {
    const ratio = ratios[i]
    if (ratio <= 0) return 0.1
    const alpha = FUNNEL_DECAY[c.funnel] ?? 0.35
    const mult = Math.pow(ratio, 1 / (1 + alpha))
    // Cap max change: no more than 2.5× increase or 0.3× decrease per cycle
    return Math.max(0.3, Math.min(2.5, mult))
  })

  // ── Step 3: Compute suggested budgets ───────────────────────────────────
  // Scale each campaign's current budget by its multiplier,
  // then normalize so total remains the same.

  const rawSuggested = scoreable.map((c, i) => {
    const current = c.raw.daily_budget || 0
    return current * multipliers[i]
  })

  const rawTotal = rawSuggested.reduce((s, v) => s + v, 0)
  if (rawTotal <= 0) {
    scoreable.forEach(c => { c.effScore = 0; c.suggestedBudget = c.raw.daily_budget || 0; c.budgetDelta = 0 })
    return
  }

  // ── Step 4: Normalize + assign ──────────────────────────────────────────
  // Efficiency score = how far above/below target (0-100 scale)
  const maxMult = Math.max(...multipliers, 0.001)

  scoreable.forEach((c, i) => {
    c.effScore = (multipliers[i] / maxMult) * 100
    c.suggestedBudget = Math.ceil(((rawSuggested[i] / rawTotal) * totalBudget) / 1000) * 1000
    c.budgetDelta = c.suggestedBudget - (c.raw.daily_budget || 0)
  })
}

function getSortValue(row: ComputedRow, key: SortKey): number {
  const r = row.raw
  if (key === 'funnel') return FUNNEL_SORT_ORDER[row.funnel] ?? 99
  const m: Record<string, number | null> = {
    daily_budget: r.daily_budget, ad_spend: r.ad_spend, impressions: r.impressions,
    cpm: row.cpm, link_click: r.link_click, ctr: row.ctr, cpc: row.cpc,
    first_visit: row.fv, cost_fv: row.fv > 0 ? row.raw.ad_spend / row.fv : null, lp_view: row.pv, cost_lp_view: row.costPerLPView,
    fv_rate: row.firstVisitRate, view_offer: row.vo, lpvo: row.lpvo,
    real_leads: row.realLeads, vo2l: row.vo2l, cprl: row.cprl,
    real_leads_cc: row.realLeadsCC, purchase_cc: r.purchase_ccom,
    cvr_cc: row.cvrCC, cpa_cc: row.cpaCC, revenue_cc: row.rev, roas_cc: row.roasCC,
    eff_score: row.effScore, suggested_budget: row.suggestedBudget, budget_delta: row.budgetDelta,
  }
  return m[key] ?? -Infinity
}

function getStringSortValue(row: ComputedRow, key: SortKey): string {
  if (key === 'platform') return row.raw.traffic_source
  if (key === 'campaign_name') return row.raw.campaign_name.toLowerCase()
  return ''
}

const STRING_SORT_KEYS = new Set<SortKey>(['platform', 'campaign_name'])

export function CampaignBreakdownSection({ from, to, sku }: { from: string; to: string; sku: string }) {
  const [sortKey, setSortKey] = useState<SortKey>('funnel')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')

  const { data, isLoading, error } = useQuery({
    queryKey: ['campaign-breakdown', from, to, sku],
    queryFn: () => fetchCampaignBreakdown(from, to, sku),
    staleTime: 5 * 60_000,
    placeholderData: keepPreviousData,
    enabled: !!from && !!to && !!sku && from <= to,
  })

  const rawRows = (data ?? []).filter(r => r.ad_spend > 0)

  const computed: ComputedRow[] = rawRows.map(r => {
    const realLeads = r.real_lead_ccom + r.real_lead_d2or + r.real_lead_mpsh + r.real_lead_ofls
    const realLeadsCC = r.real_lead_ccom
    const fv = r.ga4_first_visit || 0
    const pv = r.ga4_page_view || 0
    const vo = r.ga4_view_offer || 0
    const rev = r.revenue_ccom || 0
    return {
      raw: r, realLeads, realLeadsCC, fv, pv, vo, rev,
      cpm: r.impressions > 0 ? (r.ad_spend / r.impressions) * 1000 : null,
      ctr: r.impressions > 0 ? (r.link_click / r.impressions) * 100 : null,
      cpc: r.link_click > 0 ? r.ad_spend / r.link_click : null,
      costPerLPView: pv > 0 ? r.ad_spend / pv : null,
      firstVisitRate: pv > 0 ? (fv / pv) * 100 : null,
      lpvo: pv > 0 ? (vo / pv) * 100 : null,
      vo2l: vo > 0 ? (realLeads / vo) * 100 : null,
      cprl: realLeads > 0 ? r.ad_spend / realLeads : null,
      cvrCC: realLeadsCC > 0 ? (r.purchase_ccom / realLeadsCC) * 100 : null,
      cpaCC: r.purchase_ccom > 0 ? r.ad_spend / r.purchase_ccom : null,
      roasCC: r.ad_spend > 0 ? rev / r.ad_spend : null,
      effScore: 0, suggestedBudget: 0, budgetDelta: 0,
      funnel: mapFunnelLevel(r.funnel),
    }
  })

  // Run budget optimizer
  computeBudgetOptimization(computed)

  const sorted = [...computed].sort((a, b) => {
    if (STRING_SORT_KEYS.has(sortKey)) {
      const sa = getStringSortValue(a, sortKey)
      const sb = getStringSortValue(b, sortKey)
      const cmp = sa.localeCompare(sb)
      return sortDir === 'desc' ? -cmp : cmp
    }
    const va = getSortValue(a, sortKey)
    const vb = getSortValue(b, sortKey)
    return sortDir === 'desc' ? vb - va : va - vb
  })

  function handleSort(key: SortKey) {
    if (sortKey === key) setSortDir(d => d === 'desc' ? 'asc' : 'desc')
    else { setSortKey(key); setSortDir('desc') }
  }

  function SortTh({ label, k }: { label: string; k: SortKey }) {
    const active = sortKey === k
    return (
      <th className={`cb-num cb-sortable${active ? ' cb-sort-active' : ''}`} onClick={() => handleSort(k)} title={`Sort by ${label}`}>
        {label}{active ? <span className="cb-sort-arrow">{sortDir === 'desc' ? ' ▼' : ' ▲'}</span> : null}
      </th>
    )
  }

  const dim = 'rgba(255,255,255,0.25)'
  const muted = 'rgba(255,255,255,0.55)'
  const ok = '#34d399'
  const bad = '#ef4444'

  // ── Budget aggregations for charts ──
  const totalDailyBudget = computed.reduce((s, c) => s + (c.raw.daily_budget || 0), 0)

  const PIE_COLORS: Record<string, string> = { META: '#818cf8', DGEN: '#f59e0b', SRCH: '#34d399', PMAX: '#06b6d4' }
  const FUNNEL_COLORS: Record<FunnelLevel, string> = {
    ToFU00: '#818cf8', MoFU25: '#60a5fa', BoFU50: '#fbbf24', BoFU75: '#f87171', Unknown: 'rgba(255,255,255,0.2)',
  }

  // ── Ratio aggregations by funnel & platform ──
  type RatioGroup = { label: string; groups: { key: string; value: number | null; color: string }[] }

  const ratioCharts = useMemo(() => {
    const funnelOrder: FunnelLevel[] = ['ToFU00', 'MoFU25', 'BoFU50', 'BoFU75']
    const platforms = [...new Set(computed.map(c => c.raw.traffic_source))].sort()

    // Aggregate raw nums/denoms per group
    function aggByFunnel(numFn: (c: ComputedRow) => number, denFn: (c: ComputedRow) => number) {
      return funnelOrder.map(f => {
        const rows = computed.filter(c => c.funnel === f)
        const num = rows.reduce((s, c) => s + numFn(c), 0)
        const den = rows.reduce((s, c) => s + denFn(c), 0)
        return { key: FUNNEL_BADGE[f].short, value: den > 0 ? num / den : null, color: FUNNEL_COLORS[f] }
      })
    }
    function aggByPlatform(numFn: (c: ComputedRow) => number, denFn: (c: ComputedRow) => number) {
      return platforms.map(p => {
        const rows = computed.filter(c => c.raw.traffic_source === p)
        const num = rows.reduce((s, c) => s + numFn(c), 0)
        const den = rows.reduce((s, c) => s + denFn(c), 0)
        return { key: p, value: den > 0 ? num / den : null, color: PIE_COLORS[p] || 'rgba(255,255,255,0.4)' }
      })
    }

    const charts: { title: string; fmt: (v: number) => string; lowerIsBetter: boolean; target?: number; byFunnel: RatioGroup; byPlatform: RatioGroup }[] = [
      {
        title: 'CPRL', fmt: fmtIDR, lowerIsBetter: true, target: 150_000,
        byFunnel: { label: 'By Funnel', groups: aggByFunnel(c => c.raw.ad_spend, c => c.realLeads) },
        byPlatform: { label: 'By Platform', groups: aggByPlatform(c => c.raw.ad_spend, c => c.realLeads) },
      },
      {
        title: 'CPA CC', fmt: fmtIDR, lowerIsBetter: true, target: 2_000_000,
        byFunnel: { label: 'By Funnel', groups: aggByFunnel(c => c.raw.ad_spend, c => c.raw.purchase_ccom) },
        byPlatform: { label: 'By Platform', groups: aggByPlatform(c => c.raw.ad_spend, c => c.raw.purchase_ccom) },
      },
      {
        title: 'RoAS CC', fmt: (v: number) => `${v.toFixed(2)}×`, lowerIsBetter: false, target: 0.2,
        byFunnel: { label: 'By Funnel', groups: aggByFunnel(c => c.rev, c => c.raw.ad_spend) },
        byPlatform: { label: 'By Platform', groups: aggByPlatform(c => c.rev, c => c.raw.ad_spend) },
      },
    ]
    return charts
  }, [computed])

  return (
    <div className="sf-section">
      <h2 className="sf-section-title">Campaign Performance Breakdown</h2>

      {/* Current Budget Overview — single card */}
      {computed.length > 0 && totalDailyBudget > 0 && (
        <div style={{
          background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)',
          borderRadius: 12, padding: '20px 24px', marginBottom: 24,
        }}>
          {/* Top row: Budget scorecard + ratio charts */}
          <div style={{ display: 'flex', gap: 28, alignItems: 'flex-start', flexWrap: 'wrap' }}>

            {/* Budget Scorecard */}
            <div style={{ minWidth: 160, paddingRight: 20, borderRight: '1px solid rgba(255,255,255,0.06)' }}>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.45)', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 6 }}>
                Total Daily Budget
              </div>
              <div style={{ fontSize: 24, fontWeight: 700, color: '#e0e2e6', fontVariantNumeric: 'tabular-nums' }}>
                {fmtBudget(totalDailyBudget)}
              </div>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', marginTop: 4 }}>
                {computed.filter(c => c.raw.daily_budget > 0).length} campaigns
              </div>
            </div>

            {/* Ratio vertical bar charts */}
            {ratioCharts.map(chart => {
              const allGroups = [...chart.byFunnel.groups, ...chart.byPlatform.groups]
              const validVals = allGroups.map(g => g.value).filter((v): v is number => v !== null)
              const maxVal = validVals.length > 0 ? Math.max(...validVals) : 1

              return (
                <div key={chart.title} style={{ flex: 1, minWidth: 220 }}>
                  <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.45)', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 10 }}>
                    {chart.title}
                  </div>
                  <div style={{ display: 'flex', gap: 20 }}>

                    {/* By Funnel */}
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.35)', fontWeight: 600, letterSpacing: '0.05em', marginBottom: 6 }}>FUNNEL</div>
                      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 80 }}>
                        {chart.byFunnel.groups.map(g => {
                          const barH = g.value !== null ? Math.max((g.value / maxVal) * 100, 4) : 0
                          const isOk = g.value !== null && chart.target !== undefined
                            ? (chart.lowerIsBetter ? g.value <= chart.target : g.value >= chart.target) : false
                          return (
                            <div key={g.key} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', height: '100%', justifyContent: 'flex-end' }}>
                              {g.value !== null && (
                                <div style={{ fontSize: 9, color: isOk ? ok : bad, fontWeight: 600, marginBottom: 2, whiteSpace: 'nowrap' }}>
                                  {chart.fmt(g.value)}
                                </div>
                              )}
                              <div style={{
                                width: '100%', maxWidth: 28, borderRadius: '3px 3px 0 0',
                                height: `${barH}%`, minHeight: g.value !== null ? 4 : 0,
                                background: g.color, opacity: 0.85,
                                transition: 'height 0.3s ease',
                              }} />
                              <div style={{ fontSize: 8, color: 'rgba(255,255,255,0.4)', marginTop: 3, letterSpacing: '0.02em', fontWeight: 600 }}>
                                {g.key.replace(/^(ToFU|MoFU|BoFU)/, '')}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>

                    {/* Divider */}
                    <div style={{ width: 1, background: 'rgba(255,255,255,0.06)', alignSelf: 'stretch' }} />

                    {/* By Platform */}
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.35)', fontWeight: 600, letterSpacing: '0.05em', marginBottom: 6 }}>PLATFORM</div>
                      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 80 }}>
                        {chart.byPlatform.groups.map(g => {
                          const barH = g.value !== null ? Math.max((g.value / maxVal) * 100, 4) : 0
                          const isOk = g.value !== null && chart.target !== undefined
                            ? (chart.lowerIsBetter ? g.value <= chart.target : g.value >= chart.target) : false
                          return (
                            <div key={g.key} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', height: '100%', justifyContent: 'flex-end' }}>
                              {g.value !== null && (
                                <div style={{ fontSize: 9, color: isOk ? ok : bad, fontWeight: 600, marginBottom: 2, whiteSpace: 'nowrap' }}>
                                  {chart.fmt(g.value)}
                                </div>
                              )}
                              <div style={{
                                width: '100%', maxWidth: 28, borderRadius: '3px 3px 0 0',
                                height: `${barH}%`, minHeight: g.value !== null ? 4 : 0,
                                background: g.color, opacity: 0.85,
                                transition: 'height 0.3s ease',
                              }} />
                              <div style={{ fontSize: 8, color: 'rgba(255,255,255,0.4)', marginTop: 3, fontWeight: 600 }}>
                                {g.key}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  </div>

                  {/* Target line label */}
                  {chart.target !== undefined && (
                    <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)', marginTop: 4, textAlign: 'center' }}>
                      Target: {chart.fmt(chart.target)}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {isLoading && rawRows.length === 0 && (
        <div className="dp-card-loading"><div className="tv-spinner" /><span>Loading campaigns…</span></div>
      )}
      {error && (
        <div className="dp-footnote" style={{ color: bad, borderColor: 'rgba(239,68,68,0.2)' }}>
          ❌ {error instanceof Error ? error.message : 'Unknown error'}
        </div>
      )}
      {!isLoading && rawRows.length === 0 && !error && (
        <div className="dp-card-loading"><span>No campaign data for this SKU / date range.</span></div>
      )}

      {sorted.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table className="cb-table">
            <thead>
              <tr>
                <SortTh label="Platform" k="platform" />
                <th className="cb-sticky cb-sticky-campaign"><span className={`cb-sortable${sortKey === 'campaign_name' ? ' cb-sort-active' : ''}`} onClick={() => handleSort('campaign_name')}>Campaign{sortKey === 'campaign_name' ? <span className="cb-sort-arrow">{sortDir === 'desc' ? ' ▼' : ' ▲'}</span> : null}</span></th>
                <SortTh label="Funnel" k="funnel" />
                <SortTh label="Score" k="eff_score" />
                <SortTh label="Daily Budget" k="daily_budget" />
                <SortTh label="Suggested" k="suggested_budget" />
                <SortTh label="Δ Budget" k="budget_delta" />
                <SortTh label="CPRL" k="cprl" />
                <SortTh label="CPA CC" k="cpa_cc" />
                <SortTh label="RoAS CC" k="roas_cc" />
              </tr>
            </thead>
            <tbody>
              {sorted.map((c, i) => {
                const r = c.raw
                const cprlOk = c.cprl !== null && c.cprl <= 150_000
                const cpaOk  = c.cpaCC !== null && c.cpaCC <= 2_000_000
                const roasOk = c.roasCC !== null && c.roasCC >= 0.2
                return (
                  <tr key={`${r.traffic_source}-${r.campaign_id}-${i}`}>
                    <td className="cb-num">{platformBadge(r.traffic_source)}</td>
                    <td className="cb-sticky cb-sticky-campaign cb-name" title={r.campaign_name}>
                      {r.campaign_name}
                      {r.campaign_status === 'PAUSED' && <span style={{ marginLeft: 6, fontSize: 9, color: 'rgba(255,255,255,0.3)', fontWeight: 600, letterSpacing: '0.05em' }}>PAUSED</span>}
                    </td>
                    <td className="cb-num"><span style={{ background: FUNNEL_BADGE[c.funnel].bg, color: FUNNEL_BADGE[c.funnel].text, fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', padding: '2px 6px', borderRadius: 4, whiteSpace: 'nowrap' }}>{FUNNEL_BADGE[c.funnel].short}</span></td>
                    <td className="cb-num"><span className="cb-score-bar" style={{ '--score-pct': `${c.effScore}%`, '--score-color': c.effScore >= 70 ? ok : c.effScore >= 40 ? '#fbbf24' : bad } as React.CSSProperties}>{c.effScore.toFixed(0)}</span></td>
                    <td className="cb-num" style={{ color: r.daily_budget > 0 ? 'rgba(255,255,255,0.7)' : dim }}>{r.daily_budget > 0 ? fmtBudget(r.daily_budget) : '—'}</td>
                    <td className="cb-num" style={{ color: 'rgba(99,102,241,0.85)', fontWeight: 600 }}>{c.suggestedBudget > 0 ? fmtBudget(c.suggestedBudget) : '—'}</td>
                    <td className="cb-num" style={{ color: c.budgetDelta > 0 ? ok : c.budgetDelta < 0 ? bad : dim, fontWeight: 600 }}>{c.budgetDelta !== 0 ? `${c.budgetDelta > 0 ? '+' : ''}${fmtBudget(c.budgetDelta)}` : '—'}</td>
                    <td className="cb-num" style={{ color: c.cprl === null ? dim : cprlOk ? ok : bad }}>{c.cprl !== null ? fmtIDR(c.cprl) : '—'}</td>
                    <td className="cb-num" style={{ color: c.cpaCC === null ? dim : cpaOk ? ok : bad }}>{c.cpaCC !== null ? fmtIDR(c.cpaCC) : '—'}</td>
                    <td className="cb-num" style={{ color: c.roasCC === null ? dim : roasOk ? ok : bad }}>{c.roasCC !== null ? `${c.roasCC.toFixed(2)}×` : '—'}</td>
                  </tr>
                )
              })}
            </tbody>
            {(() => {
              const t = {
                budget: computed.reduce((s, c) => s + (c.raw.daily_budget || 0), 0),
                spend: computed.reduce((s, c) => s + c.raw.ad_spend, 0),
                rl: computed.reduce((s, c) => s + c.realLeads, 0),
                purch: computed.reduce((s, c) => s + c.raw.purchase_ccom, 0),
                rev: computed.reduce((s, c) => s + c.rev, 0),
              }
              const tCprl = t.rl > 0 ? t.spend / t.rl : null
              const tCpaCC = t.purch > 0 ? t.spend / t.purch : null
              const tRoas = t.spend > 0 ? t.rev / t.spend : null
              const cprlOk = tCprl !== null && tCprl <= 150_000
              const cpaOk = tCpaCC !== null && tCpaCC <= 2_000_000
              const roasOk = tRoas !== null && tRoas >= 0.2
              return (
                <tfoot className="cb-totals">
                  <tr>
                    <td className="cb-num cb-total-label" colSpan={1}></td>
                    <td className="cb-sticky cb-sticky-campaign cb-total-label">TOTAL</td>
                    <td className="cb-num">—</td>
                    <td className="cb-num">—</td>
                    <td className="cb-num">{fmtBudget(t.budget)}</td>
                    <td className="cb-num" style={{ color: 'rgba(99,102,241,0.85)' }}>{fmtBudget(t.budget)}</td>
                    <td className="cb-num">—</td>
                    <td className="cb-num" style={{ color: tCprl === null ? dim : cprlOk ? ok : bad }}>{tCprl !== null ? fmtIDR(tCprl) : '—'}</td>
                    <td className="cb-num" style={{ color: tCpaCC === null ? dim : cpaOk ? ok : bad }}>{tCpaCC !== null ? fmtIDR(tCpaCC) : '—'}</td>
                    <td className="cb-num" style={{ color: tRoas === null ? dim : roasOk ? ok : bad }}>{tRoas !== null ? `${tRoas.toFixed(2)}×` : '—'}</td>
                  </tr>
                </tfoot>
              )
            })()}
          </table>
        </div>
      )}
    </div>
  )
}

// ── Campaign Performance Evaluator ───────────────────────────────────────────

function CampaignEvaluatorSection({ from, to, sku }: { from: string; to: string; sku: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ['campaign-breakdown', from, to, sku],
    queryFn: () => fetchCampaignBreakdown(from, to, sku),
    staleTime: 5 * 60_000,
    placeholderData: keepPreviousData,
  })

  const rawRows = (data ?? []).filter(r => r.ad_spend > 0)

  // Only META campaigns
  const metaRows = rawRows.filter(r => r.traffic_source === 'META')

  // Compute metrics for each campaign
  const evaluated = metaRows.map(r => {
    const realLeads = r.real_lead_ccom + r.real_lead_d2or + r.real_lead_mpsh + r.real_lead_ofls
    const fv = r.ga4_first_visit || 0
    const pv = r.ga4_page_view || 0
    const vo = r.ga4_view_offer || 0
    const funnel = mapFunnelLevel(r.funnel)
    return { raw: r, realLeads, fv, pv, vo, funnel }
  })

  // Compute overall funnel rates from META campaigns only for derived targets
  const allWithMetrics = metaRows.map(r => ({
    spend: r.ad_spend,
    fv: r.ga4_first_visit || 0,
    pv: r.ga4_page_view || 0,
    vo: r.ga4_view_offer || 0,
    rl: r.real_lead_ccom + r.real_lead_d2or + r.real_lead_mpsh + r.real_lead_ofls,
  }))
  const totals = allWithMetrics.reduce((t, c) => ({
    spend: t.spend + c.spend, fv: t.fv + c.fv,
    pv: t.pv + c.pv, vo: t.vo + c.vo, rl: t.rl + c.rl,
  }), { spend: 0, fv: 0, pv: 0, vo: 0, rl: 0 })

  const overallVO2L  = totals.vo > 0 ? totals.rl / totals.vo : 0.01
  const overallLPVO  = totals.pv > 0 ? totals.vo / totals.pv : 0.01
  const overallFVRate = totals.pv > 0 ? totals.fv / totals.pv : 0.01

  const targetCostVO  = TARGET_CPR * overallVO2L
  const targetCostLPV = targetCostVO * overallLPVO
  const targetCostFV  = overallFVRate > 0 ? targetCostLPV / overallFVRate : targetCostLPV

  // If actual average is better (lower) than hard target, use actual as the bar
  const totalPurchCC = metaRows.reduce((s, r) => s + r.purchase_ccom, 0)
  const actualAvgCPRL = totals.rl > 0 ? totals.spend / totals.rl : Infinity
  const actualAvgCPA  = totalPurchCC > 0 ? totals.spend / totalPurchCC : Infinity
  const effectiveCPRL = Math.min(TARGET_CPR, actualAvgCPRL)
  const effectiveCPA  = Math.min(TARGET_CPA_CC, actualAvgCPA)

  // Build evaluation rows
  const evalRows = evaluated
    .filter(c => c.funnel !== 'Unknown')
    .map(c => {
      const spend = c.raw.ad_spend
      let metricName = ''
      let targetValue = 0
      let campaignValue: number | null = null

      switch (c.funnel) {
        case 'ToFU00':
          metricName = 'Cost / View Offer'
          targetValue = targetCostVO
          campaignValue = c.vo > 0 ? spend / c.vo : null
          break
        case 'MoFU25':
          metricName = 'CPRL'
          targetValue = effectiveCPRL
          campaignValue = c.realLeads > 0 ? spend / c.realLeads : null
          break
        case 'BoFU50':
          metricName = 'CPA CC'
          targetValue = effectiveCPA
          campaignValue = c.raw.purchase_ccom > 0 ? spend / c.raw.purchase_ccom : null
          break
        case 'BoFU75':
          metricName = 'CPRL'
          targetValue = effectiveCPRL
          campaignValue = c.realLeads > 0 ? spend / c.realLeads : null
          break
      }

      // Gap = (Target / Campaign) - 1  → positive = good, negative = bad
      const gap = campaignValue !== null && campaignValue > 0
        ? (targetValue / campaignValue) - 1
        : null

      return { ...c, metricName, targetValue, campaignValue, gap }
    })

  // Sort by funnel order, then by gap (worst first)
  const funnelOrd: Record<string, number> = { ToFU00: 0, MoFU25: 1, BoFU50: 2, BoFU75: 3 }
  evalRows.sort((a, b) => {
    const fa = funnelOrd[a.funnel] ?? 9, fb = funnelOrd[b.funnel] ?? 9
    if (fa !== fb) return fa - fb
    return (a.gap ?? -99) - (b.gap ?? -99) // worst gap first within same funnel
  })

  const ok = '#34d399'
  const bad = '#ef4444'

  const funnelColors: Record<string, string> = {
    ToFU00: '#818cf8', MoFU25: '#fbbf24', BoFU50: '#f87171', BoFU75: '#fb923c',
  }

  return (
    <div className="sf-section">
      <h2 className="sf-section-title">Campaign Performance Evaluator</h2>
      <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.8rem', marginBottom: 12 }}>
        Meta Ads only · Compares each campaign's primary metric against the derived target from overall funnel rates
      </p>

      {isLoading ? (
        <div className="dp-card-loading">
          <div className="tv-spinner" />
          <span>Loading…</span>
        </div>
      ) : evalRows.length === 0 ? (
        <p style={{ color: 'rgba(255,255,255,0.4)' }}>No Meta campaigns found.</p>
      ) : (
        <div className="cb-table-wrap">
          <table className="cb-table">
            <thead>
              <tr>
                <th className="cb-name-col">Campaign</th>
                <th className="cb-num">Funnel</th>
                <th className="cb-num">Primary Metric</th>
                <th className="cb-num">Target</th>
                <th className="cb-num">Actual</th>
                <th className="cb-num">Gap</th>
              </tr>
            </thead>
            <tbody>
              {evalRows.map((row, i) => {
                const gapColor = row.gap === null ? 'rgba(255,255,255,0.25)'
                  : row.gap >= 0 ? ok : bad
                const gapText = row.gap !== null
                  ? `${row.gap >= 0 ? '+' : ''}${(row.gap * 100).toFixed(1)}%`
                  : '—'
                const fColor = funnelColors[row.funnel] ?? '#999'

                return (
                  <tr key={i}>
                    <td className="cb-name-col" style={{ maxWidth: 320 }}>{row.raw.campaign_name}</td>
                    <td className="cb-num">
                      <span className="funnel-badge" style={{ background: fColor + '22', color: fColor, border: `1px solid ${fColor}55` }}>
                        {row.funnel}
                      </span>
                    </td>
                    <td className="cb-num" style={{ color: 'rgba(255,255,255,0.7)' }}>{row.metricName}</td>
                    <td className="cb-num" style={{ color: 'rgba(255,255,255,0.55)' }}>{fmtIDR(row.targetValue)}</td>
                    <td className="cb-num" style={{ color: row.campaignValue !== null ? '#fff' : 'rgba(255,255,255,0.25)' }}>
                      {row.campaignValue !== null ? fmtIDR(row.campaignValue) : '—'}
                    </td>
                    <td className="cb-num" style={{
                      color: gapColor,
                      fontWeight: 600,
                      fontSize: '0.85rem',
                    }}>
                      {gapText}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}


export function ProductDeepDivePage() {
  // ── Per-brand date bounds + SKU list ──
  interface BrandBounds { brand: string; earliest: string; latest: string; skus: string[] }
  const { data: brandBounds } = useQuery({
    queryKey: ['date-bounds'],
    queryFn: async () => {
      const res = await fetch(`${D1_WORKER_URL}/v2/date-bounds`)
      if (!res.ok) throw new Error('Failed to fetch date bounds')
      return res.json() as Promise<BrandBounds[]>
    },
    staleTime: 0,
  })

  // Flat list of all unique SKUs across all brands
  const allSkus = useMemo(() => {
    if (!brandBounds) return []
    const set = new Set<string>()
    brandBounds.forEach(b => b.skus.forEach(s => set.add(s)))
    return Array.from(set).sort()
  }, [brandBounds])

  // Global earliest/latest across all brands
  const globalEarliest = useMemo(() =>
    brandBounds?.map(b => b.earliest).sort()[0] ?? '', [brandBounds])
  const globalLatest = useMemo(() =>
    brandBounds?.map(b => b.latest).sort().reverse()[0] ?? '', [brandBounds])

  // ── SKU state — default to first available ──
  const [sku, setSku] = useState('')
  useEffect(() => {
    if (allSkus.length > 0 && !sku) setSku(allSkus[0])
  }, [allSkus, sku])
  const activeSku = sku || allSkus[0] || 'MSF'

  // ── Date state — default to last 30 days ──
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [boundsReady, setBoundsReady] = useState(false)

  useEffect(() => {
    if (globalLatest && !boundsReady) {
      const d = new Date(globalLatest + 'T00:00:00')
      d.setDate(d.getDate() - 29)
      const fromStr = dateStr(d)
      setTo(capToH2(globalLatest))
      setFrom(fromStr < globalEarliest ? globalEarliest : fromStr)
      setBoundsReady(true)
    }
  }, [globalLatest, globalEarliest, boundsReady])

  const activeFrom = from || globalEarliest
  const activeTo = to || capToH2(globalLatest)

  const applyPreset = (days: number) => {
    if (!globalLatest) return
    const t = new Date(globalLatest + 'T00:00:00')
    if (days === 0) {
      const f = new Date(t.getFullYear(), t.getMonth(), 1)
      const fStr = dateStr(f)
      setFrom(fStr < globalEarliest ? globalEarliest : fStr)
    } else {
      const f = new Date(t)
      f.setDate(f.getDate() - days + 1)
      const fStr = dateStr(f)
      setFrom(fStr < globalEarliest ? globalEarliest : fStr)
    }
    setTo(capToH2(globalLatest))
  }

  // ── Director data for SKU card ──
  const { data: directorData, isLoading: dirLoading } = useQuery({
    queryKey: ['director-daily', activeFrom, activeTo],
    queryFn: () => fetchDirectorDaily(activeFrom, activeTo),
    staleTime: 5 * 60_000,
    placeholderData: keepPreviousData,
    enabled: !!activeFrom && !!activeTo && activeFrom <= activeTo,
  })

  // Full funnel data filtered by selected SKU
  const { data: funnelData, isLoading: funnelLoading } = useQuery({
    queryKey: ['funnel-daily', activeFrom, activeTo, activeSku],
    queryFn: () => fetchFunnelDaily(activeFrom, activeTo, activeSku),
    staleTime: 5 * 60_000,
    placeholderData: keepPreviousData,
    enabled: !!activeFrom && !!activeTo && !!activeSku && activeFrom <= activeTo,
  })

  // Global funnel data (all brands, all SKUs) for benchmark averages
  const { data: globalFunnelData } = useQuery({
    queryKey: ['funnel-daily-global', activeFrom, activeTo],
    queryFn: () => fetchFunnelDaily(activeFrom, activeTo),
    staleTime: 5 * 60_000,
    placeholderData: keepPreviousData,
    enabled: !!activeFrom && !!activeTo && activeFrom <= activeTo,
  })

  // Compute global benchmark ratios (all brands, all SKUs)
  const globalBenchmark = useMemo(() => {
    const fallback = { cpm: 30_000, ctr: 1, lpvo: 10, vo2l: 5 }
    if (!globalFunnelData || globalFunnelData.length === 0) return fallback
    let spend = 0, impr = 0, clicks = 0, pv = 0, vo = 0, rl = 0
    for (const r of globalFunnelData) {
      spend += r.ad_spend
      impr += r.impressions
      clicks += r.link_click
      pv += r.ga4_page_view
      vo += r.ga4_view_offer
      rl += r.real_lead_ccom + r.real_lead_d2or + r.real_lead_mpsh + r.real_lead_ofls
    }
    return {
      cpm: impr > 0 ? (spend / impr) * 1000 : fallback.cpm,
      ctr: impr > 0 ? (clicks / impr) * 100 : fallback.ctr,
      lpvo: pv > 0 ? (vo / pv) * 100 : fallback.lpvo,
      vo2l: vo > 0 ? (rl / vo) * 100 : fallback.vo2l,
    }
  }, [globalFunnelData])

  // Changelog entries for the date range
  const { data: changelogData } = useQuery({
    queryKey: ['changelog', activeFrom, activeTo],
    queryFn: async () => {
      const res = await fetch(`${D1_WORKER_URL}/v2/changelog?from=${activeFrom}&to=${activeTo}`)
      if (!res.ok) return []
      return res.json() as Promise<ChangelogEntry[]>
    },
    staleTime: 10 * 60_000,
    enabled: !!activeFrom && !!activeTo,
  })
  const changelog = changelogData ?? []

  // Derive brand from funnel data for the active SKU
  const activeBrand = useMemo(() => {
    if (!funnelData || funnelData.length === 0) return ''
    return funnelData[0]?.brand ?? ''
  }, [funnelData])

  // Filter changelog to entries relevant to this brand + SKU
  const filteredChangelog = useMemo(() => {
    if (!activeBrand) return []
    return changelog.filter(e => {
      // Brand must match (comma-separated field)
      const brands = e.brand.split(',').map(b => b.trim())
      if (!brands.some(b => b === activeBrand)) return false
      // If changelog specifies a SKU, only show on that SKU
      if (e.sku && e.sku !== activeSku) return false
      return true
    })
  }, [changelog, activeBrand, activeSku])

  // ── SKU Card data filtered to selected SKU ──
  const msfData = useMemo(() => directorData?.filter(r => r.sku === activeSku) ?? [], [directorData, activeSku])

  const msfTotals = useMemo((): SKUTotals | null => {
    if (msfData.length === 0) return null
    const totals: SKUTotals = { spend: 0, realLeads: 0, purchasesCcom: 0, revenueCcom: 0 }
    for (const r of msfData) {
      totals.spend += r.ad_spend
      totals.realLeads += r.real_lead_ccom + r.real_lead_d2or + r.real_lead_mpsh + r.real_lead_ofls
      totals.purchasesCcom += r.purchase_ccom
      totals.revenueCcom += r.purchase_ccom_revenue
    }
    return totals
  }, [msfData])

  const msfTrends = useMemo(() => {
    if (msfData.length === 0) return { cpr: [] as SparkPoint[], cpa: [] as SparkPoint[], roas: [] as SparkPoint[] }
    const dayMap = new Map<string, { spend: number; realLeads: number; purchases: number; revenue: number }>()
    for (const r of msfData) {
      const rl = r.real_lead_ccom + r.real_lead_d2or + r.real_lead_mpsh + r.real_lead_ofls
      const existing = dayMap.get(r.date)
      if (existing) {
        existing.spend += r.ad_spend; existing.realLeads += rl
        existing.purchases += r.purchase_ccom; existing.revenue += r.purchase_ccom_revenue
      } else {
        dayMap.set(r.date, { spend: r.ad_spend, realLeads: rl, purchases: r.purchase_ccom, revenue: r.purchase_ccom_revenue })
      }
    }
    const sorted = Array.from(dayMap.entries()).sort(([a], [b]) => a.localeCompare(b))
    return {
      cpr: sorted.filter(([, d]) => d.realLeads > 0).map(([date, d]) => ({ date, value: d.spend / d.realLeads })),
      cpa: sorted.filter(([, d]) => d.purchases > 0).map(([date, d]) => ({ date, value: d.spend / d.purchases })),
      roas: sorted.filter(([, d]) => d.spend > 0).map(([date, d]) => ({ date, value: d.revenue / d.spend })),
    }
  }, [msfData])

  const maxDevs = useMemo(() => {
    let cprMax = 0, cpaMax = 0, roasMax = 0
    for (const p of msfTrends.cpr) cprMax = Math.max(cprMax, Math.abs(p.value - TARGET_CPR))
    for (const p of msfTrends.cpa) cpaMax = Math.max(cpaMax, Math.abs(p.value - TARGET_CPA_CC))
    for (const p of msfTrends.roas) roasMax = Math.max(roasMax, Math.abs(p.value - TARGET_ROAS_CC))
    return { cpr: cprMax || 150_000, cpa: cpaMax || 3_000_000, roas: roasMax || 0.1 }
  }, [msfTrends])

  // ── Overview tiles data (from funnel endpoint) ──
  const overviewData = useMemo(() => {
    if (!funnelData || funnelData.length === 0) return null

    // Aggregate totals and daily series
    const dailyMap = new Map<string, {
      ad_spend: number; impressions: number; link_click: number;
      first_visit: number; page_view: number; view_offer: number;
      real_leads: number; real_leads_cc: number;
      purchase_cc: number; revenue_cc: number;
    }>()

    let totals = {
      ad_spend: 0, impressions: 0, link_click: 0,
      first_visit: 0, page_view: 0, view_offer: 0,
      real_leads: 0, real_leads_cc: 0,
      purchase_cc: 0, revenue_cc: 0,
    }

    for (const r of funnelData) {
      const rl = r.real_lead_ccom + r.real_lead_d2or + r.real_lead_mpsh + r.real_lead_ofls

      totals.ad_spend += r.ad_spend
      totals.impressions += r.impressions
      totals.link_click += r.link_click
      totals.first_visit += r.ga4_first_visit
      totals.page_view += r.ga4_page_view
      totals.view_offer += r.ga4_view_offer
      totals.real_leads += rl
      totals.real_leads_cc += r.real_lead_ccom
      totals.purchase_cc += r.purchase_ccom
      totals.revenue_cc += r.purchase_ccom_revenue

      const existing = dailyMap.get(r.date)
      if (existing) {
        existing.ad_spend += r.ad_spend
        existing.impressions += r.impressions
        existing.link_click += r.link_click
        existing.first_visit += r.ga4_first_visit
        existing.page_view += r.ga4_page_view
        existing.view_offer += r.ga4_view_offer
        existing.real_leads += rl
        existing.real_leads_cc += r.real_lead_ccom
        existing.purchase_cc += r.purchase_ccom
        existing.revenue_cc += r.purchase_ccom_revenue
      } else {
        dailyMap.set(r.date, {
          ad_spend: r.ad_spend, impressions: r.impressions, link_click: r.link_click,
          first_visit: r.ga4_first_visit, page_view: r.ga4_page_view, view_offer: r.ga4_view_offer,
          real_leads: rl, real_leads_cc: r.real_lead_ccom,
          purchase_cc: r.purchase_ccom, revenue_cc: r.purchase_ccom_revenue,
        })
      }
    }

    const sorted = Array.from(dailyMap.entries()).sort(([a], [b]) => a.localeCompare(b))
    const daily = {
      ad_spend: sorted.map(([, d]) => d.ad_spend),
      impressions: sorted.map(([, d]) => d.impressions),
      link_click: sorted.map(([, d]) => d.link_click),
      first_visit: sorted.map(([, d]) => d.first_visit),
      page_view: sorted.map(([, d]) => d.page_view),
      view_offer: sorted.map(([, d]) => d.view_offer),
      real_leads: sorted.map(([, d]) => d.real_leads),
      real_leads_cc: sorted.map(([, d]) => d.real_leads_cc),
      purchase_cc: sorted.map(([, d]) => d.purchase_cc),
      revenue_cc: sorted.map(([, d]) => d.revenue_cc),
    }

    // Computed ratios (daily series for sparklines)
    const ratios = {
      cpm: sorted.map(([, d]) => d.impressions > 0 ? (d.ad_spend / d.impressions) * 1000 : 0),
      cpc: sorted.map(([, d]) => d.link_click > 0 ? d.ad_spend / d.link_click : 0),
      ctr: sorted.map(([, d]) => d.impressions > 0 ? (d.link_click / d.impressions) * 100 : 0),
      cost_first_visit: sorted.map(([, d]) => d.first_visit > 0 ? d.ad_spend / d.first_visit : 0),
      oclp: sorted.map(([, d]) => d.link_click > 0 ? (d.page_view / d.link_click) * 100 : 0),
      cost_lp_view: sorted.map(([, d]) => d.page_view > 0 ? d.ad_spend / d.page_view : 0),
      new_lp_visit_rate: sorted.map(([, d]) => d.page_view > 0 ? (d.first_visit / d.page_view) * 100 : 0),
      lpvo: sorted.map(([, d]) => d.page_view > 0 ? (d.view_offer / d.page_view) * 100 : 0),
      vo2l: sorted.map(([, d]) => d.view_offer > 0 ? (d.real_leads / d.view_offer) * 100 : 0),
      cprl: sorted.map(([, d]) => d.real_leads > 0 ? d.ad_spend / d.real_leads : 0),
      cvr_cc: sorted.map(([, d]) => d.real_leads_cc > 0 ? (d.purchase_cc / d.real_leads_cc) * 100 : 0),
      cpa_cc: sorted.map(([, d]) => d.purchase_cc > 0 ? d.ad_spend / d.purchase_cc : 0),
    }

    // Aggregate ratio totals
    const t = totals
    const ratioTotals = {
      cpm: t.impressions > 0 ? (t.ad_spend / t.impressions) * 1000 : 0,
      cpc: t.link_click > 0 ? t.ad_spend / t.link_click : 0,
      ctr: t.impressions > 0 ? (t.link_click / t.impressions) * 100 : 0,
      cost_first_visit: t.first_visit > 0 ? t.ad_spend / t.first_visit : 0,
      oclp: t.link_click > 0 ? (t.page_view / t.link_click) * 100 : 0,
      cost_lp_view: t.page_view > 0 ? t.ad_spend / t.page_view : 0,
      new_lp_visit_rate: t.page_view > 0 ? (t.first_visit / t.page_view) * 100 : 0,
      lpvo: t.page_view > 0 ? (t.view_offer / t.page_view) * 100 : 0,
      vo2l: t.view_offer > 0 ? (t.real_leads / t.view_offer) * 100 : 0,
      cprl: t.real_leads > 0 ? t.ad_spend / t.real_leads : 0,
      cvr_cc: t.real_leads_cc > 0 ? (t.purchase_cc / t.real_leads_cc) * 100 : 0,
      cpa_cc: t.purchase_cc > 0 ? t.ad_spend / t.purchase_cc : 0,
    }

    return { totals, daily, ratios, ratioTotals, dates: sorted.map(([d]) => d) }
  }, [funnelData])

  const isLoading = dirLoading || funnelLoading
  const skuMeta = getSkuMeta(activeSku, allSkus.indexOf(activeSku))

  return (
    <div className="dp-page">
      {/* Toolbar */}
      <div className="dp-toolbar">
        <div className="dp-toolbar-left">
          <h1 className="dp-title">Product Deep Dive</h1>
          <span className="dp-subtitle">{activeFrom} → {activeTo}</span>
        </div>
        <div className="dp-toolbar-right">
          {/* SKU picker */}
          <select
            className="dp-select"
            value={activeSku}
            onChange={e => setSku(e.target.value)}
            style={{ minWidth: 90 }}
          >
            {allSkus.map(s => (
              <option key={s} value={s}>
                {getSkuMeta(s, allSkus.indexOf(s)).fullName} ({s})
              </option>
            ))}
          </select>

          {/* Date pickers */}
          <input
            type="date"
            className="dp-date-input"
            value={activeFrom}
            min={globalEarliest}
            max={globalLatest}
            onChange={e => {
              const v = e.target.value
              if (!v) return
              setFrom(v)
              if (v > activeTo) setTo(v)
            }}
          />
          <span className="dp-date-sep">→</span>
          <input
            type="date"
            className="dp-date-input"
            value={activeTo}
            min={globalEarliest}
            max={globalLatest}
            onChange={e => {
              const v = e.target.value
              if (!v) return
              setTo(v)
              if (v < activeFrom) setFrom(v)
            }}
          />

          {/* Quick presets */}
          <div className="tv-presets">
            {PRESETS.map(p => (
              <button key={p.label} className="tv-preset" onClick={() => applyPreset(p.days)}>
                {p.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* SKU Card — matches selected SKU */}
      <div className="dp-cards">
        <SKUCard
          sku={activeSku}
          skuIdx={allSkus.indexOf(activeSku)}
          totals={msfTotals}
          dailyCPR={msfTrends.cpr}
          dailyCPA={msfTrends.cpa}
          dailyRoAS={msfTrends.roas}
          maxDevs={maxDevs}
          isLoading={dirLoading}
          changelog={filteredChangelog}
        />
      </div>

      {/* Full-Funnel Overview */}
      <div className="sf-section">
        <h2 className="sf-section-title">Full-Funnel Overview</h2>
        {funnelLoading ? (
          <div className="dp-card-loading">
            <div className="tv-spinner" />
            <span>Loading funnel data…</span>
          </div>
        ) : overviewData ? (
          <div className="sf-metrics-grid">
            <MetricTile
              label="Ad Spend"
              value={fmtIDR(overviewData.totals.ad_spend)}
              sparkData={overviewData.daily.ad_spend}
              source="ads"
              lowerIsBetter
            />
            <MetricTile
              label="Impressions"
              value={fmtNum(overviewData.totals.impressions)}
              sparkData={overviewData.daily.impressions}
              source="ads"
            />
            <MetricTile
              label="Link Click"
              value={fmtNum(overviewData.totals.link_click)}
              sparkData={overviewData.daily.link_click}
              source="ads"
            />
            <MetricTile
              label="First Visit"
              value={fmtNum(overviewData.totals.first_visit)}
              sparkData={overviewData.daily.first_visit}
              source="ga4"
            />
            <MetricTile
              label="LP View"
              value={fmtNum(overviewData.totals.page_view)}
              sparkData={overviewData.daily.page_view}
              source="ga4"
            />
            <MetricTile
              label="View Offer"
              value={fmtNum(overviewData.totals.view_offer)}
              sparkData={overviewData.daily.view_offer}
              source="ga4"
            />
            <MetricTile
              label="Real Leads"
              value={fmtNum(overviewData.totals.real_leads)}
              sparkData={overviewData.daily.real_leads}
              source="mongo"
            />
            <MetricTile
              label="Real Leads CC"
              value={fmtNum(overviewData.totals.real_leads_cc)}
              sparkData={overviewData.daily.real_leads_cc}
              source="mongo"
            />
            <MetricTile
              label="Purchase CC"
              value={fmtNum(overviewData.totals.purchase_cc)}
              sparkData={overviewData.daily.purchase_cc}
              source="mongo"
            />
            <MetricTile
              label="Revenue CC"
              value={fmtIDR(overviewData.totals.revenue_cc)}
              sparkData={overviewData.daily.revenue_cc}
              source="mongo"
            />
          </div>
        ) : (
          <div className="dp-card-loading"><span>No data</span></div>
        )}
      </div>

      {/* ── Funnel Trend Charts ── */}
      {overviewData && (
        <div className="sf-section">
          <h2 className="sf-section-title">Funnel Trends</h2>
          <div className="sf-trend-charts">
            <div className="dp-trend-box" style={{ flex: 1 }}>
              <Sparkline
                title="CPM"
                data={overviewData.dates.map((d, i) => ({ date: d, value: overviewData.ratios.cpm[i] }))}
                target={globalBenchmark.cpm}
                targetLabel="Benchmark"
                color="#f59e0b"
                fixedYMin={0}
                fixedYMax={Math.max(80_000, globalBenchmark.cpm * 2, overviewData.ratioTotals.cpm * 1.5)}
                showTrendline
                height={180}
                changelog={filteredChangelog}
              />
            </div>
            <div className="dp-trend-box" style={{ flex: 1 }}>
              <Sparkline
                title="CTR"
                data={overviewData.dates.map((d, i) => ({ date: d, value: overviewData.ratios.ctr[i] }))}
                target={globalBenchmark.ctr}
                targetLabel="Benchmark"
                color="#06b6d4"
                fmt="percent"
                lowerIsBetter={false}
                fixedYMin={0}
                fixedYMax={Math.max(5, globalBenchmark.ctr * 2.5, overviewData.ratioTotals.ctr * 2)}
                showTrendline
                height={180}
                changelog={filteredChangelog}
              />
            </div>
            <div className="dp-trend-box" style={{ flex: 1 }}>
              <Sparkline
                title="LPVO"
                data={overviewData.dates.map((d, i) => ({ date: d, value: overviewData.ratios.lpvo[i] }))}
                target={globalBenchmark.lpvo}
                targetLabel="Benchmark"
                color="#a78bfa"
                fmt="percent"
                lowerIsBetter={false}
                fixedYMin={0}
                fixedYMax={Math.max(50, globalBenchmark.lpvo * 2, overviewData.ratioTotals.lpvo * 1.5)}
                showTrendline
                height={180}
                changelog={filteredChangelog}
              />
            </div>
            <div className="dp-trend-box" style={{ flex: 1 }}>
              <Sparkline
                title="VO2L"
                data={overviewData.dates.map((d, i) => ({ date: d, value: overviewData.ratios.vo2l[i] }))}
                target={globalBenchmark.vo2l}
                targetLabel="Benchmark"
                color="#34d399"
                fmt="percent"
                lowerIsBetter={false}
                fixedYMin={0}
                fixedYMax={Math.max(30, globalBenchmark.vo2l * 2.5, overviewData.ratioTotals.vo2l * 2)}
                showTrendline
                height={180}
                changelog={filteredChangelog}
              />
            </div>
          </div>
        </div>
      )}

      {/* Campaign Performance Evaluator — Meta Ads only */}
      <CampaignEvaluatorSection
        from={activeFrom}
        to={activeTo}
        sku={activeSku}
      />

      {/* Campaign Performance Breakdown — moved to Budget Setting panel */}

      {/* Data source note */}
      <div className="dp-footnote">
        📊 Spend/Impressions/Clicks from <strong>Meta API</strong> · First Visit/LP View/View Offer from <strong>GA4</strong> · Real Leads &amp; Purchases from <strong>MongoDB ground truth</strong>.
      </div>
    </div>
  )
}
