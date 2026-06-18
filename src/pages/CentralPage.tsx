/**
 * CentralPage — Central Dashboard (MNC Brand)
 */

import { useState, useRef, useEffect, useMemo } from 'react'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, LabelList } from 'recharts'
import { CalendarRangePicker } from '../components/ui/CalendarRangePicker'
import { SingleSelect, MultiSelect } from '../components/ui/FilterDropdown'
import { KPICard } from '../components/ui/KPICard'
import { useFilters } from '../hooks/useFilters'
import { usePerformanceData } from '../hooks/usePerformanceData'

// ── Date helpers ──────────────────────────────────────────────────────────────

const fmtLocal = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

function getMTDRange() {
  const now = new Date()
  now.setDate(now.getDate() - 1)
  return {
    from: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`,
    to: fmtLocal(now),
  }
}

function getLastMonthRange() {
  const now = new Date()
  return {
    from: fmtLocal(new Date(now.getFullYear(), now.getMonth() - 1, 1)),
    to:   fmtLocal(new Date(now.getFullYear(), now.getMonth(), 0)),
  }
}

function getLastNDays(n: number) {
  const now = new Date()
  now.setDate(now.getDate() - 1)
  const from = new Date(now)
  from.setDate(from.getDate() - (n - 1))
  return { from: fmtLocal(from), to: fmtLocal(now) }
}

type Preset   = 'last_month' | 'mtd' | 'last_30' | 'last_14' | 'last_7' | 'custom'
type CompMode = 'previous_period' | 'previous_month'

function getPresetRange(preset: Preset, customFrom: string, customTo: string) {
  switch (preset) {
    case 'last_month': return getLastMonthRange()
    case 'mtd':        return getMTDRange()
    case 'last_30':    return getLastNDays(30)
    case 'last_14':    return getLastNDays(14)
    case 'last_7':     return getLastNDays(7)
    case 'custom':     return { from: customFrom, to: customTo }
  }
}

function getPreviousPeriod(from: string, to: string) {
  const f = new Date(from + 'T00:00:00')
  const t = new Date(to   + 'T00:00:00')
  const days = Math.round((t.getTime() - f.getTime()) / 86400000) + 1
  const prevTo   = new Date(f); prevTo.setDate(prevTo.getDate() - 1)
  const prevFrom = new Date(prevTo); prevFrom.setDate(prevFrom.getDate() - (days - 1))
  return { from: fmtLocal(prevFrom), to: fmtLocal(prevTo) }
}

function getPreviousMonth(from: string, to: string) {
  const shift = (s: string) => {
    const d  = new Date(s + 'T00:00:00')
    const ty = d.getMonth() === 0 ? d.getFullYear() - 1 : d.getFullYear()
    const tm = d.getMonth() === 0 ? 11 : d.getMonth() - 1
    const last = new Date(ty, tm + 1, 0).getDate()
    return fmtLocal(new Date(ty, tm, Math.min(d.getDate(), last)))
  }
  return { from: shift(from), to: shift(to) }
}

const PRESETS: { key: Preset; label: string }[] = [
  { key: 'last_month', label: 'Last Month' },
  { key: 'mtd',        label: 'MTD' },
  { key: 'last_30',    label: 'Last 30 Days' },
  { key: 'last_14',    label: 'Last 2 Weeks' },
  { key: 'last_7',     label: 'Last 1 Week' },
]

// ── Formatters ────────────────────────────────────────────────────────────────

const fmtIDR = (v: number) =>
  new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(v)

const fmtNum = (v: number) =>
  v >= 1e6 ? `${(v / 1e6).toFixed(2)}M`
  : v >= 1e3 ? `${(v / 1e3).toFixed(1)}K`
  : v.toLocaleString()

const pctDelta = (curr: number, prev: number): number | null =>
  prev > 0 ? ((curr - prev) / prev) * 100 : null

const SOURCE_COLORS: Record<string, string> = {
  META: '#1877F2',
  MSAL: '#60A5FA',
  DGEN: '#F97316',
  DGV3: '#FDBA74',
  MEV3: '#8B5CF6',
  SRCH: '#34D399',
}
const PIE_FALLBACK = ['#a78bfa', '#38bdf8', '#fbbf24', '#f472b6', '#4ade80', '#818cf8']
const getSourceColor = (name: string, i: number) =>
  SOURCE_COLORS[name] ?? PIE_FALLBACK[i % PIE_FALLBACK.length]

const SKU_COLORS: Record<string, string> = {
  M3P:    '#22c55e',  // Green
  MSF:    '#92400e',  // Brown
  MTA:    '#f97316',  // Orange
  GIN:    '#7f1d1d',  // Dark Red
  SIX:    '#7c3aed',  // Purple
  MCBA1C: '#facc15',  // Yellow
  MCBWCA: '#a3e635',  // Lime
  MCIA1C: '#2dd4bf',  // Teal
  MCIWCA: '#38bdf8',  // Sky
  MDCBIN: '#818cf8',  // Indigo
  MDCGRE: '#c084fc',  // Violet
  GOL:    '#f59e0b',  // Gold
}
const SKU_FALLBACK = ['#94a3b8', '#cbd5e1', '#e2e8f0']
const getSkuColor = (name: string, i: number) =>
  SKU_COLORS[name] ?? SKU_FALLBACK[i % SKU_FALLBACK.length]

// ── Page ──────────────────────────────────────────────────────────────────────

export function CentralPage() {
  // ── Time controls
  const [preset,     setPreset]     = useState<Preset>('mtd')
  const [breakdown, setBreakdown] = useState<'source' | 'sku'>('source')
  const [customFrom, setCustomFrom] = useState(getMTDRange().from)
  const [customTo,   setCustomTo]   = useState(getMTDRange().to)
  const [compMode,   setCompMode]   = useState<CompMode>('previous_period')

  const { from, to } = getPresetRange(preset, customFrom, customTo)
  const { from: prevFrom, to: prevTo } = compMode === 'previous_month'
    ? getPreviousMonth(from, to)
    : getPreviousPeriod(from, to)

  const compLabel = compMode === 'previous_month' ? 'vs prev month' : 'vs prev period'

  // ── Filter controls
  const [brand,        setBrand]        = useState<string>('')
  const [selectedSkus, setSelectedSkus] = useState<string[]>([])
  const [selectedSrcs, setSelectedSrcs] = useState<string[]>([])

  const { data: filterOptions } = useFilters(brand || undefined)
  const brands  = filterOptions?.brands          ?? []
  const skus    = filterOptions?.skus            ?? []
  const sources = filterOptions?.traffic_sources ?? []

  const prevBrandRef = useRef<string>('')

  useEffect(() => {
    if (!brand && brands.length > 0) setBrand(brands[0])
  }, [brands])

  useEffect(() => {
    if (brand && brand !== prevBrandRef.current && (skus.length > 0 || sources.length > 0)) {
      prevBrandRef.current = brand
      setSelectedSkus([...skus])
      setSelectedSrcs([...sources])
    }
  }, [brand, skus, sources])

  // ── Data fetching
  const baseFilters = {
    brand:          brand ? [brand] : undefined,
    sku:            selectedSkus.length > 0 && selectedSkus.length < skus.length ? selectedSkus : undefined,
    traffic_source: selectedSrcs.length > 0 && selectedSrcs.length < sources.length ? selectedSrcs : undefined,
  }

  const { data: currData = [], isLoading } = usePerformanceData({ from, to, ...baseFilters })
  const { data: prevData = [] }            = usePerformanceData({ from: prevFrom, to: prevTo, ...baseFilters })

  // ── Aggregations
  const { totals, prevTotals, sparklines, bySource, bySku } = useMemo(() => {
    const agg = (rows: typeof currData) => {
      const spend         = rows.reduce((s, r) => s + (r.ad_spend         ?? 0), 0)
      const impressions   = rows.reduce((s, r) => s + (r.impressions      ?? 0), 0)
      const link_clicks   = rows.reduce((s, r) => s + (r.link_clicks      ?? 0), 0)
      const lp_view       = rows.reduce((s, r) => s + (r.lp_view          ?? 0), 0)
      const view_offer    = rows.reduce((s, r) => s + (r.view_offer       ?? 0), 0)
      const rl_cc         = rows.reduce((s, r) => s + (r.real_lead_cc     ?? 0), 0)
      const rl_dp         = rows.reduce((s, r) => s + (r.real_lead_dp     ?? 0), 0)
      const rl_mp         = rows.reduce((s, r) => s + (r.real_lead_mp     ?? 0), 0)
      const lead_disp_dp  = rows.reduce((s, r) => s + (r.lead_dispatch_dp ?? 0), 0)
      const lead_disp_mp  = rows.reduce((s, r) => s + (r.lead_dispatch_mp ?? 0), 0)
      const sale_cc       = rows.reduce((s, r) => s + (r.sale_cc          ?? 0), 0)
      const rev_cc        = rows.reduce((s, r) => s + (r.revenue_cc       ?? 0), 0)
      const rl_all        = rl_cc + rl_dp + rl_mp
      return {
        spend, impressions, link_clicks, lp_view, view_offer,
        rl_all, rl_cc, rl_dp, rl_mp, sale_cc, rev_cc, lead_disp_dp, lead_disp_mp,
        cpm:           impressions  > 0 ? (spend        / impressions)  * 1000 : 0,
        ctr:           impressions  > 0 ? (link_clicks  / impressions)  * 100  : 0,
        oclp:          link_clicks  > 0 ? (lp_view      / link_clicks)  * 100  : 0,
        lpvo:          lp_view      > 0 ? (view_offer   / lp_view)      * 100  : 0,
        lp2l:          lp_view      > 0 ? (rl_all       / lp_view)      * 100  : 0,
        cprl:          rl_all       > 0 ?  spend        / rl_all               : 0,
        cvr_cc:        rl_cc        > 0 ?  sale_cc      / rl_cc                : 0,
        closing:       rl_cc        > 0 ?  sale_cc      / rl_cc                : 0,
        roas_cc:       spend        > 0 ?  rev_cc       / spend                : 0,
        dispatch_rate: rl_dp        > 0 ? (lead_disp_dp / rl_dp)       * 100  : 0,
        dispatch_rate_mp: rl_mp     > 0 ? (lead_disp_mp / rl_mp)       * 100  : 0,
      }
    }

    // Daily sparklines
    const byDay = new Map<string, { spend: number; impressions: number; link_clicks: number; lp_view: number; view_offer: number; rl_all: number; rl_cc: number; rl_dp: number; rl_mp: number; rev_cc: number; sale_cc: number }>()
    for (const r of currData) {
      if (!byDay.has(r.day)) byDay.set(r.day, { spend: 0, impressions: 0, link_clicks: 0, lp_view: 0, view_offer: 0, rl_all: 0, rl_cc: 0, rl_dp: 0, rl_mp: 0, lead_disp_dp: 0, lead_disp_mp: 0, rev_cc: 0, sale_cc: 0 })
      const d = byDay.get(r.day)!
      d.spend        += r.ad_spend         ?? 0
      d.impressions  += r.impressions      ?? 0
      d.link_clicks  += r.link_clicks      ?? 0
      d.lp_view      += r.lp_view          ?? 0
      d.view_offer   += r.view_offer       ?? 0
      d.rl_cc        += r.real_lead_cc     ?? 0
      d.rl_dp        += r.real_lead_dp     ?? 0
      d.rl_mp        += r.real_lead_mp     ?? 0
      d.lead_disp_dp += r.lead_dispatch_dp ?? 0
      d.lead_disp_mp += r.lead_dispatch_mp ?? 0
      d.rl_all       += (r.real_lead_cc ?? 0) + (r.real_lead_dp ?? 0) + (r.real_lead_mp ?? 0)
      d.sale_cc      += r.sale_cc          ?? 0
      d.rev_cc       += r.revenue_cc       ?? 0
    }
    const days = Array.from(byDay.entries()).sort(([a], [b]) => a.localeCompare(b))

    return {
      totals:     agg(currData),
      prevTotals: agg(prevData),
      sparklines: {
        spend:       days.map(([day, d]) => ({ day, v: d.spend })),
        impressions: days.map(([day, d]) => ({ day, v: d.impressions })),
        link_clicks: days.map(([day, d]) => ({ day, v: d.link_clicks })),
        lp_view:     days.map(([day, d]) => ({ day, v: d.lp_view })),
        view_offer:  days.map(([day, d]) => ({ day, v: d.view_offer })),
        rl_all:      days.map(([day, d]) => ({ day, v: d.rl_all })),
        rl_cc:       days.map(([day, d]) => ({ day, v: d.rl_cc })),
        rl_dp:         days.map(([day, d]) => ({ day, v: d.rl_dp           ?? 0 })),
        rl_mp:         days.map(([day, d]) => ({ day, v: d.rl_mp           ?? 0 })),
        lead_disp_dp:     days.map(([day, d]) => ({ day, v: d.lead_disp_dp   ?? 0 })),
        lead_disp_mp:     days.map(([day, d]) => ({ day, v: d.lead_disp_mp   ?? 0 })),
        sale_cc:          days.map(([day, d]) => ({ day, v: d.sale_cc })),
        rev_cc:           days.map(([day, d]) => ({ day, v: d.rev_cc })),
        cvr_cc:           days.map(([day, d]) => ({ day, v: d.rl_cc > 0 ? (d.sale_cc / d.rl_cc) * 100 : 0 })),
        dispatch_rate:    days.map(([day, d]) => ({ day, v: d.rl_dp > 0 ? (d.lead_disp_dp / d.rl_dp) * 100 : 0 })),
        dispatch_rate_mp: days.map(([day, d]) => ({ day, v: d.rl_mp > 0 ? (d.lead_disp_mp / d.rl_mp) * 100 : 0 })),
        cpm:         days.map(([day, d]) => ({ day, v: d.impressions > 0 ? (d.spend / d.impressions) * 1000 : 0 })),
        ctr:         days.map(([day, d]) => ({ day, v: d.impressions > 0 ? (d.link_clicks / d.impressions) * 100 : 0 })),
        oclp:        days.map(([day, d]) => ({ day, v: d.link_clicks > 0 ? (d.lp_view    / d.link_clicks) * 100 : 0 })),
        lpvo:        days.map(([day, d]) => ({ day, v: d.lp_view     > 0 ? (d.view_offer / d.lp_view)     * 100 : 0 })),
        lp2l:        days.map(([day, d]) => ({ day, v: d.lp_view     > 0 ? (d.rl_all     / d.lp_view)     * 100 : 0 })),
        cprl:        days.map(([day, d]) => ({ day, v: d.rl_all  > 0 ? d.spend   / d.rl_all  : 0 })),
        closing:     days.map(([day, d]) => ({ day, v: d.rl_cc   > 0 ? d.sale_cc / d.rl_cc * 100 : 0 })),
        roas_cc:     days.map(([day, d]) => ({ day, v: d.spend   > 0 ? d.rev_cc  / d.spend  : 0 })),
      },

      // Source-level breakdown for pie charts
      bySource: (() => {
        const srcMap = new Map<string, { spend: number; impressions: number; link_clicks: number; lp_view: number; view_offer: number; rl_all: number; rl_cc: number; rl_dp: number; rl_mp: number; lead_disp_dp: number; lead_disp_mp: number; sale_cc: number; rev_cc: number }>()
        for (const r of currData) {
          const src = r.traffic_source || 'Unknown'
          if (!srcMap.has(src)) srcMap.set(src, { spend: 0, impressions: 0, link_clicks: 0, lp_view: 0, view_offer: 0, rl_all: 0, rl_cc: 0, rl_dp: 0, rl_mp: 0, lead_disp_dp: 0, lead_disp_mp: 0, sale_cc: 0, rev_cc: 0 })
          const s = srcMap.get(src)!
          s.spend        += r.ad_spend         ?? 0
          s.impressions  += r.impressions      ?? 0
          s.link_clicks  += r.link_clicks      ?? 0
          s.lp_view      += r.lp_view          ?? 0
          s.view_offer   += r.view_offer       ?? 0
          s.rl_all       += (r.real_lead_cc ?? 0) + (r.real_lead_dp ?? 0) + (r.real_lead_mp ?? 0)
          s.rl_cc        += r.real_lead_cc     ?? 0
          s.rl_dp        += r.real_lead_dp     ?? 0
          s.rl_mp        += r.real_lead_mp     ?? 0
          s.lead_disp_dp += r.lead_dispatch_dp ?? 0
          s.lead_disp_mp += r.lead_dispatch_mp ?? 0
          s.sale_cc      += r.sale_cc          ?? 0
          s.rev_cc       += r.revenue_cc       ?? 0
        }
        return Array.from(srcMap.entries())
          .map(([name, v]) => ({ name, ...v }))
          .filter(d => d.impressions > 0 || d.link_clicks > 0)
          .sort((a, b) => b.impressions - a.impressions)
      })(),

      bySku: (() => {
        const skuMap = new Map<string, { spend: number; impressions: number; link_clicks: number; lp_view: number; view_offer: number; rl_all: number; rl_cc: number; rl_dp: number; rl_mp: number; lead_disp_dp: number; lead_disp_mp: number; sale_cc: number; rev_cc: number }>()
        for (const r of currData) {
          const sku = r.sku || 'Unknown'
          if (!skuMap.has(sku)) skuMap.set(sku, { spend: 0, impressions: 0, link_clicks: 0, lp_view: 0, view_offer: 0, rl_all: 0, rl_cc: 0, rl_dp: 0, rl_mp: 0, lead_disp_dp: 0, lead_disp_mp: 0, sale_cc: 0, rev_cc: 0 })
          const s = skuMap.get(sku)!
          s.spend        += r.ad_spend         ?? 0
          s.impressions  += r.impressions      ?? 0
          s.link_clicks  += r.link_clicks      ?? 0
          s.lp_view      += r.lp_view          ?? 0
          s.view_offer   += r.view_offer       ?? 0
          s.rl_all       += (r.real_lead_cc ?? 0) + (r.real_lead_dp ?? 0) + (r.real_lead_mp ?? 0)
          s.rl_cc        += r.real_lead_cc     ?? 0
          s.rl_dp        += r.real_lead_dp     ?? 0
          s.rl_mp        += r.real_lead_mp     ?? 0
          s.lead_disp_dp += r.lead_dispatch_dp ?? 0
          s.lead_disp_mp += r.lead_dispatch_mp ?? 0
          s.sale_cc      += r.sale_cc          ?? 0
          s.rev_cc       += r.revenue_cc       ?? 0
        }
        return Array.from(skuMap.entries())
          .map(([name, v]) => ({ name, ...v }))
          .filter(d => d.impressions > 0 || d.link_clicks > 0)
          .sort((a, b) => b.impressions - a.impressions)
      })(),
    }
  }, [currData, prevData])

  // ── Derived breakdown helpers
  const bdRows  = breakdown === 'source' ? bySource : bySku
  const bdClr   = breakdown === 'source' ? getSourceColor : getSkuColor
  const bdLabel = breakdown === 'source' ? 'Traffic Source' : 'SKU'

  // ── Render
  return (
    <div className="min-h-screen flex flex-col text-surface-100">

      {/* ── Header ── */}
      <header className="fixed top-0 left-56 right-0 z-40 border-b border-white/5 bg-surface-950/90 backdrop-blur-md">
        <div className="px-6 py-3 flex items-center gap-3">

          {/* Title */}
          <div className="shrink-0 mr-2">
            <h1 className="text-sm font-semibold text-surface-100 leading-tight">Central Dashboard</h1>
            <p className="text-[10px] text-surface-200/40 font-mono">{from} → {to}</p>
          </div>

          <div className="w-px h-6 bg-white/8 shrink-0" />

          {/* Filters — left aligned */}
          <SingleSelect label="Brand"          options={brands}  value={brand}        onChange={setBrand}        placeholder="All brands" />
          <MultiSelect  label="SKU"            options={skus}    value={selectedSkus} onChange={setSelectedSkus} placeholder="All SKUs" />
          <MultiSelect  label="Traffic Source" options={sources} value={selectedSrcs} onChange={setSelectedSrcs} placeholder="All Sources" />

          <div className="w-px h-6 bg-white/8 shrink-0" />

          {/* Breakdown toggle */}
          <div className="shrink-0">
            <p className="text-[9px] text-surface-200/30 uppercase tracking-widest font-semibold mb-1">Breakdown</p>
            <div className="flex items-center gap-0.5 bg-white/5 rounded-lg p-0.5">
              {([{ key: 'source', label: 'Traffic Source' }, { key: 'sku', label: 'SKU' }] as const).map(opt => (
                <button
                  key={opt.key}
                  onClick={() => setBreakdown(opt.key)}
                  className={`px-2.5 py-1 rounded-md text-[10px] font-semibold transition-all ${
                    breakdown === opt.key ? 'bg-white/12 text-surface-100' : 'text-surface-200/35 hover:text-surface-200/70'
                  }`}
                >{opt.label}</button>
              ))}
            </div>
          </div>

          {/* Spacer pushes date + compare to the right */}
          <div className="flex-1" />

          {/* Date presets + calendar */}
          <div className="flex items-center gap-1.5 shrink-0">
            <div className="flex items-center gap-0.5 bg-white/5 rounded-xl p-1">
              {PRESETS.map(p => (
                <button
                  key={p.key}
                  onClick={() => setPreset(p.key)}
                  className={`px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all ${
                    preset === p.key
                      ? 'bg-brand-500 text-white shadow-sm'
                      : 'text-surface-200/50 hover:text-surface-100 hover:bg-white/5'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <CalendarRangePicker
              from={preset === 'custom' ? customFrom : from}
              to={preset === 'custom' ? customTo : to}
              onChange={(f, t) => { setPreset('custom'); setCustomFrom(f); setCustomTo(t) }}
            />
          </div>

          <div className="w-px h-6 bg-white/8 shrink-0" />

          {/* Compare toggle — rightmost */}
          <div className="shrink-0">
            <p className="text-[9px] text-surface-200/30 uppercase tracking-widest font-semibold mb-1">Compare vs</p>
            <div className="flex items-center gap-1.5">
              <div className="flex items-center gap-0.5 bg-white/5 rounded-lg p-0.5">
                {([
                  { key: 'previous_period', label: 'Prev Period' },
                  { key: 'previous_month',  label: 'Prev Month'  },
                ] as { key: CompMode; label: string }[]).map(opt => (
                  <button
                    key={opt.key}
                    onClick={() => setCompMode(opt.key)}
                    className={`px-2.5 py-1 rounded-md text-[10px] font-semibold transition-all ${
                      compMode === opt.key
                        ? 'bg-white/12 text-surface-100'
                        : 'text-surface-200/35 hover:text-surface-200/70'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              <span className="text-[10px] text-surface-200/20 font-mono">{prevFrom} → {prevTo}</span>
            </div>
          </div>

        </div>
      </header>

      {/* ── Body ── */}
      <div className="flex-1 px-6 pt-[72px] pb-[50vh] space-y-10">


        {/* ── Funnel Analysis ── (hidden, work in progress) */}
        {false && !isLoading && (() => {
          const STAGES = [
            { key: 'impressions', label: 'Impressions', color: '#6366f1' },
            { key: 'link_clicks', label: 'Link Clicks', color: '#8b5cf6' },
            { key: 'lp_view',    label: 'LP View',      color: '#a78bfa' },
            { key: 'view_offer', label: 'View Offer',   color: '#c4b5fd' },
            { key: 'rl_all',     label: 'Real Leads',   color: '#ddd6fe' },
          ] as const
          const values     = STAGES.map(s => (totals     as any)[s.key] as number)
          const prevValues = STAGES.map(s => (prevTotals as any)[s.key] as number)

          // named ratios for each transition
          const TRANSITIONS = [
            { label: 'CTR',     name: 'Link Clicks / Impressions' },
            { label: 'OCLP',    name: 'LP View / Link Clicks' },
            { label: 'LPVO',    name: 'View Offer / LP View' },
            { label: 'RL Rate', name: 'Real Leads / View Offer' },
          ]

          return (
            <div className="rounded-2xl bg-surface-800/50 p-6">
              <h2 className="text-sm font-bold text-surface-100 uppercase tracking-widest mb-6">Funnel Analysis</h2>
              <div className="flex flex-col">
                {STAGES.map((s, i) => {
                  const raw      = values[i]
                  const prev     = prevValues[i]
                  const rowMax   = Math.max(raw, prev) || 1
                  const pctBar   = (raw  / rowMax) * 100
                  const pctGhost = (prev / rowMax) * 100
                  const delta    = prev > 0 ? ((raw - prev) / prev) * 100 : null
                  const isUp     = delta !== null && delta >= 0

                  const nextRaw = i < STAGES.length - 1 ? values[i + 1] : null
                  const stepPct = nextRaw !== null && raw > 0 ? ((nextRaw / raw) * 100) : null
                  const trans   = TRANSITIONS[i]

                  return (
                    <div key={s.key}>
                      {/* ── Stage row ── */}
                      <div className="flex items-center gap-4 py-1">
                        {/* Label */}
                        <div className="w-24 shrink-0 text-right">
                          <span className="text-[11px] font-semibold" style={{ color: s.color }}>{s.label}</span>
                        </div>

                        {/* Two stacked bars, same linear scale */}
                        <div className="flex-1 flex flex-col gap-0.5">
                          {/* Current bar */}
                          <div className="w-full h-4 bg-surface-900 rounded-sm overflow-hidden relative">
                            {[25, 50, 75].map(g => (
                              <div key={g} className="absolute top-0 bottom-0 w-px bg-white/[0.05]" style={{ left: `${g}%` }} />
                            ))}
                            <div className="absolute inset-y-0 left-0 rounded-r-sm transition-all duration-500"
                              style={{ width: `${pctBar}%`, background: s.color, opacity: 0.85 }} />
                          </div>
                          {/* Ghost bar — comparison period */}
                          <div className="w-full h-2 bg-surface-900 rounded-sm overflow-hidden relative">
                            {[25, 50, 75].map(g => (
                              <div key={g} className="absolute top-0 bottom-0 w-px bg-white/[0.05]" style={{ left: `${g}%` }} />
                            ))}
                            <div className="absolute inset-y-0 left-0 rounded-r-sm transition-all duration-500"
                              style={{ width: `${pctGhost}%`, background: 'rgba(255,255,255,0.28)' }} />
                          </div>
                        </div>

                        {/* Annotations */}
                        <div className="shrink-0 flex items-center gap-3 w-72">
                          <span className="text-[12px] font-bold tabular-nums text-surface-100 w-24 text-right">{fmtNum(raw)}</span>
                          <span className="text-[11px] tabular-nums text-surface-200/25 w-20">vs {fmtNum(prev)}</span>
                          {delta !== null && (
                            <span className={`text-[11px] font-semibold tabular-nums ${isUp ? 'text-emerald-400' : 'text-red-400'}`}>
                              {isUp ? '▲' : '▼'} {Math.abs(delta).toFixed(1)}%
                            </span>
                          )}
                        </div>
                      </div>

                      {/* ── Transition connector (between stages) ── */}
                      {stepPct !== null && trans && (
                        <div className="flex items-center gap-4 py-0.5">
                          {/* Indent to align with bars */}
                          <div className="w-24 shrink-0" />
                          <div className="flex-1 flex items-center gap-3">
                            {/* Vertical line on left */}
                            <div className="flex items-center gap-2 pl-3">
                              <div className="w-px h-5 bg-white/10" />
                              {/* Rate pill */}
                              <div className="flex items-center gap-1.5 bg-surface-900/80 rounded-full px-3 py-0.5 border border-white/8">
                                <span className="text-[10px] font-bold text-surface-200/50 uppercase tracking-wide">{trans.label}</span>
                                <span className="text-[11px] font-bold tabular-nums" style={{ color: STAGES[i + 1].color }}>
                                  {stepPct.toFixed(1)}%
                                </span>
                                <span className="text-[9px] text-surface-200/25">{trans.name}</span>
                              </div>
                            </div>
                          </div>
                          <div className="w-72 shrink-0" />
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>

              {/* Legend */}
              <div className="flex items-center gap-6 mt-5 pt-4 border-t border-white/5">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-3 rounded" style={{ background: '#8b5cf6', opacity: 0.82 }} />
                  <span className="text-[10px] text-surface-200/40">Current period</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-6 h-3 rounded" style={{ background: 'rgba(255,255,255,0.13)', border: '0 2px 0 0 solid rgba(255,255,255,0.25)' }} />
                  <span className="text-[10px] text-surface-200/40">{compLabel} (ghost)</span>
                </div>
                <div className="flex items-center gap-3 ml-4">
                  {[25, 50, 75].map(g => (
                    <span key={g} className="text-[9px] text-surface-200/20 tabular-nums">{g}%</span>
                  ))}
                </div>
              </div>
            </div>
          )
        })()}



        {/* ── Macro KPI ── */}
        <div className="rounded-2xl bg-surface-800/50 p-6 space-y-6">
        <h2 className="text-sm font-bold text-surface-100 uppercase tracking-widest">Macro KPI</h2>

        {isLoading ? (
          <div className="grid grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="rounded-xl bg-surface-900 border border-white/5 h-[180px] animate-pulse" />
            ))}
          </div>
        ) : (<>

          {/* Row 1 — Metrics (volumes) */}
          <div className="grid grid-cols-3 gap-4">
            <KPICard
              label="Ad Spend"
              value={fmtIDR(totals.spend)}
              delta={pctDelta(totals.spend, prevTotals.spend)}
              deltaLabel={compLabel}
              sparkline={sparklines.spend}
              tooltipFmt="currency"
            />
            <KPICard
              label="Real Leads (All)"
              value={fmtNum(totals.rl_all)}
              delta={pctDelta(totals.rl_all, prevTotals.rl_all)}
              deltaLabel={compLabel}
              sparkline={sparklines.rl_all}
              tooltipFmt="number"
            />
            <KPICard
              label="CC Revenue"
              value={fmtIDR(totals.rev_cc)}
              delta={pctDelta(totals.rev_cc, prevTotals.rev_cc)}
              deltaLabel={compLabel}
              sparkline={sparklines.rev_cc}
              tooltipFmt="currency"
            />
          </div>

          {/* Pie charts — Ad Spend | Real Leads | CC Revenue by breakdown */}
          <div className="grid grid-cols-3 gap-4">
            {([
              { title: `Ad Spend by ${bdLabel}`,    key: 'spend'   as const, fmt: fmtIDR },
              { title: `Real Leads by ${bdLabel}`,  key: 'rl_all'  as const, fmt: fmtNum },
              { title: `CC Revenue by ${bdLabel}`,  key: 'rev_cc'  as const, fmt: fmtIDR },
            ]).map(({ title, key, fmt }) => {
              const pieData = bdRows.map(d => ({ name: d.name, value: d[key] })).filter(d => d.value > 0)
              const total   = pieData.reduce((s, d) => s + d.value, 0)
              return (
                <div key={key} className="rounded-xl bg-surface-900 border border-white/5 p-5">
                  <p className="text-[10px] text-surface-200/40 uppercase tracking-widest font-semibold mb-4">{title}</p>
                  {pieData.length === 0 ? <div className="h-40 flex items-center justify-center text-surface-200/20 text-xs italic">No data</div> : (
                    <div className="flex items-center gap-6">
                      <div className="shrink-0">
                        <ResponsiveContainer width={150} height={150}>
                          <PieChart>
                            <Pie data={pieData} cx="50%" cy="50%" innerRadius={42} outerRadius={68} paddingAngle={2} dataKey="value" strokeWidth={0}>
                              {pieData.map((d, i) => <Cell key={i} fill={bdClr(d.name, i)} />)}
                            </Pie>
                            <Tooltip content={({ active, payload }: any) => {
                              if (!active || !payload?.length) return null
                              const d = payload[0]; const pct = total > 0 ? ((d.value / total) * 100).toFixed(1) : '0'
                              return <div style={{ background: 'rgba(15,15,25,.95)', border: '1px solid rgba(255,255,255,.1)', borderRadius: 8, padding: '6px 10px', fontSize: 11, lineHeight: 1.7 }}><p style={{ color: d.payload.fill, fontWeight: 700 }}>{d.name}</p><p style={{ color: '#f1f5f9', fontFamily: 'monospace' }}>{fmt(d.value)}<span style={{ color: 'rgba(255,255,255,.4)', marginLeft: 6 }}>({pct}%)</span></p></div>
                            }} />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                      <div className="flex-1 space-y-2">
                        {pieData.map((d, i) => {
                          const pct = total > 0 ? ((d.value / total) * 100).toFixed(1) : '0'
                          return (
                            <div key={d.name} className="flex items-center gap-2">
                              <span className="w-2 h-2 rounded-full shrink-0" style={{ background: bdClr(d.name, i) }} />
                              <span className="text-[11px] text-surface-200/60 flex-1 truncate">{d.name}</span>
                              <span className="text-[11px] font-semibold tabular-nums text-surface-100">{fmt(d.value)}</span>
                              <span className="text-[10px] text-surface-200/30 w-9 text-right">{pct}%</span>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {/* Row 2 — Ratios */}
          <div className="grid grid-cols-3 gap-4">
            <KPICard
              label="CPRL (All)"
              value={totals.rl_all > 0 ? fmtIDR(totals.cprl) : '—'}
              delta={pctDelta(totals.cprl, prevTotals.cprl)}
              deltaLabel={compLabel}
              sparkline={sparklines.cprl}
              tooltipFmt="currency"
              invertDelta
            />
            <KPICard
              label="Closing Rate"
              value={totals.rl_cc > 0 ? `${(totals.closing * 100).toFixed(2)}%` : '—'}
              delta={pctDelta(totals.closing, prevTotals.closing)}
              deltaLabel={compLabel}
              sparkline={sparklines.closing}
              tooltipFmt="percentage"
            />
            <KPICard
              label="RoAS CC"
              value={totals.spend > 0 ? `${totals.roas_cc.toFixed(2)}×` : '—'}
              delta={pctDelta(totals.roas_cc, prevTotals.roas_cc)}
              deltaLabel={compLabel}
              sparkline={sparklines.roas_cc}
              tooltipFmt="multiplier"
            />
          </div>

          {/* Bar charts — CPRL | Closing Rate | RoAS CC by breakdown */}
          <div className="grid grid-cols-3 gap-4">
            {([
              {
                title: `CPRL by ${bdLabel}`,
                calc: (d: typeof bdRows[0]) => d.rl_all > 0 ? parseFloat((d.spend / d.rl_all).toFixed(0)) : 0,
                fmt:  (v: number) => fmtIDR(v),
                asc:  true,
              },
              {
                title: `Closing Rate by ${bdLabel}`,
                calc: (d: typeof bdRows[0]) => d.rl_cc > 0 ? parseFloat(((d.sale_cc / d.rl_cc) * 100).toFixed(2)) : 0,
                fmt:  (v: number) => `${v}%`,
                asc:  false,
              },
              {
                title: `RoAS CC by ${bdLabel}`,
                calc: (d: typeof bdRows[0]) => d.spend > 0 ? parseFloat((d.rev_cc / d.spend).toFixed(2)) : 0,
                fmt:  (v: number) => `${v}×`,
                asc:  false,
              },
            ]).map(({ title, calc, fmt, asc }) => {
              const barData = bdRows
                .map(d => ({ name: d.name, value: calc(d), fill: bdClr(d.name, 0) }))
                .filter(d => d.value > 0)
                .sort((a, b) => asc ? a.value - b.value : b.value - a.value)
              return (
                <div key={title} className="rounded-xl bg-surface-900 border border-white/5 p-5">
                  <p className="text-[10px] text-surface-200/40 uppercase tracking-widest font-semibold mb-4">{title}</p>
                  {barData.length === 0 ? <div className="h-32 flex items-center justify-center text-surface-200/20 text-xs italic">No data</div> : (
                    <ResponsiveContainer width="100%" height={Math.max(100, barData.length * 36)}>
                      <BarChart data={barData} layout="vertical" margin={{ top: 0, right: 68, left: 8, bottom: 0 }}>
                        <XAxis type="number" hide />
                        <YAxis type="category" dataKey="name" tick={{ fill: 'rgba(255,255,255,.4)', fontSize: 11 }} axisLine={false} tickLine={false} width={48} />
                        <Tooltip cursor={{ fill: 'rgba(255,255,255,.04)' }} content={({ active, payload }: any) => {
                          if (!active || !payload?.length) return null
                          return <div style={{ background: 'rgba(15,15,25,.95)', border: '1px solid rgba(255,255,255,.1)', borderRadius: 8, padding: '6px 10px', fontSize: 11 }}><p style={{ color: payload[0].payload.fill, fontWeight: 700 }}>{payload[0].payload.name}</p><p style={{ color: '#f1f5f9', fontFamily: 'monospace' }}>{fmt(payload[0].value)}</p></div>
                        }} />
                        <Bar dataKey="value" radius={[0, 4, 4, 0]} maxBarSize={20}>
                          {barData.map((d, i) => <Cell key={i} fill={bdClr(d.name, i)} />)}
                          <LabelList dataKey="value" position="right" formatter={fmt} style={{ fill: 'rgba(255,255,255,.4)', fontSize: 10 }} />
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </div>
              )
            })}
          </div>

        </>)}

        </div>

        {/* ── Ad Creative Performance ── */}
        <div className="rounded-2xl bg-surface-800/50 p-6 space-y-6">
        <h2 className="text-sm font-bold text-surface-100 uppercase tracking-widest">Ad Creative Performance</h2>

        <div className="grid grid-cols-4 gap-4">
          <KPICard
            label="Impressions"
            value={fmtNum(totals.impressions)}
            delta={pctDelta(totals.impressions, prevTotals.impressions)}
            deltaLabel={compLabel}
            sparkline={sparklines.impressions}
            tooltipFmt="number"
          />
          <KPICard
            label="CPM"
            value={totals.impressions > 0 ? fmtIDR(totals.cpm) : '—'}
            delta={pctDelta(totals.cpm, prevTotals.cpm)}
            deltaLabel={compLabel}
            sparkline={sparklines.cpm}
            tooltipFmt="currency"
            invertDelta
          />
          <KPICard
            label="Link Click"
            value={fmtNum(totals.link_clicks)}
            delta={pctDelta(totals.link_clicks, prevTotals.link_clicks)}
            deltaLabel={compLabel}
            sparkline={sparklines.link_clicks}
            tooltipFmt="number"
          />
          <KPICard
            label="CTR"
            value={totals.impressions > 0 ? `${totals.ctr.toFixed(2)}%` : '—'}
            delta={pctDelta(totals.ctr, prevTotals.ctr)}
            deltaLabel={compLabel}
            sparkline={sparklines.ctr}
            tooltipFmt="percentage"
          />
        </div>

        {/* Impressions | CPM | Link Clicks | CTR — all in one row */}
        <div className="grid grid-cols-4 gap-4">

          {/* Impressions pie */}
          {(() => {
            const pieData = bdRows.map(d => ({ name: d.name, value: d.impressions })).filter(d => d.value > 0)
            const total   = pieData.reduce((s, d) => s + d.value, 0)
            return (
              <div className="rounded-xl bg-surface-900 border border-white/5 p-5">
                <p className="text-[10px] text-surface-200/40 uppercase tracking-widest font-semibold mb-4">Impressions by {bdLabel}</p>
                {pieData.length === 0 ? <div className="h-40 flex items-center justify-center text-surface-200/20 text-xs italic">No data</div> : (
                  <div className="flex flex-col gap-4">
                    <ResponsiveContainer width="100%" height={150}>
                      <PieChart>
                        <Pie data={pieData} cx="50%" cy="50%" innerRadius={42} outerRadius={68} paddingAngle={2} dataKey="value" strokeWidth={0}>
                          {pieData.map((d, i) => <Cell key={i} fill={bdClr(d.name, i)} />)}
                        </Pie>
                        <Tooltip content={({ active, payload }: any) => {
                          if (!active || !payload?.length) return null
                          const d = payload[0]; const pct = total > 0 ? ((d.value / total) * 100).toFixed(1) : '0'
                          return <div style={{ background: 'rgba(15,15,25,.95)', border: '1px solid rgba(255,255,255,.1)', borderRadius: 8, padding: '6px 10px', fontSize: 11, lineHeight: 1.7 }}><p style={{ color: d.payload.fill, fontWeight: 700 }}>{d.name}</p><p style={{ color: '#f1f5f9', fontFamily: 'monospace' }}>{fmtNum(d.value)}<span style={{ color: 'rgba(255,255,255,.4)', marginLeft: 6 }}>({pct}%)</span></p></div>
                        }} />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="space-y-1.5">
                      {pieData.map((d, i) => { const pct = total > 0 ? ((d.value / total) * 100).toFixed(1) : '0'; return (
                        <div key={d.name} className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full shrink-0" style={{ background: bdClr(d.name, i) }} />
                          <span className="text-[11px] text-surface-200/60 flex-1 truncate">{d.name}</span>
                          <span className="text-[10px] text-surface-200/30 tabular-nums">{pct}%</span>
                        </div>
                      )})}
                    </div>
                  </div>
                )}
              </div>
            )
          })()}

          {/* CPM bar */}
          {(() => {
            const barData = bdRows
              .map(d => ({ name: d.name, value: d.impressions > 0 ? parseFloat((d.spend / d.impressions * 1000).toFixed(0)) : 0, fill: bdClr(d.name, 0) }))
              .filter(d => d.value > 0).sort((a, b) => a.value - b.value)
            return (
              <div className="rounded-xl bg-surface-900 border border-white/5 p-5">
                <p className="text-[10px] text-surface-200/40 uppercase tracking-widest font-semibold mb-4">CPM by {bdLabel}</p>
                {barData.length === 0 ? <div className="h-40 flex items-center justify-center text-surface-200/20 text-xs italic">No data</div> : (
                  <ResponsiveContainer width="100%" height={Math.max(120, barData.length * 36)}>
                    <BarChart data={barData} layout="vertical" margin={{ top: 0, right: 60, left: 8, bottom: 0 }}>
                      <XAxis type="number" hide />
                      <YAxis type="category" dataKey="name" tick={{ fill: 'rgba(255,255,255,.4)', fontSize: 11 }} axisLine={false} tickLine={false} width={48} />
                      <Tooltip cursor={{ fill: 'rgba(255,255,255,.04)' }} content={({ active, payload }: any) => {
                        if (!active || !payload?.length) return null
                        return <div style={{ background: 'rgba(15,15,25,.95)', border: '1px solid rgba(255,255,255,.1)', borderRadius: 8, padding: '6px 10px', fontSize: 11 }}><p style={{ color: payload[0].payload.fill, fontWeight: 700 }}>{payload[0].payload.name}</p><p style={{ color: '#f1f5f9', fontFamily: 'monospace' }}>{fmtIDR(payload[0].value)}</p></div>
                      }} />
                      <Bar dataKey="value" radius={[0, 4, 4, 0]} maxBarSize={20}>
                        {barData.map((d, i) => <Cell key={i} fill={bdClr(d.name, i)} />)}
                        <LabelList dataKey="value" position="right" formatter={(v: number) => fmtIDR(v)} style={{ fill: 'rgba(255,255,255,.4)', fontSize: 10 }} />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            )
          })()}

          {/* Link Clicks pie */}
          {(() => {
            const pieData = bdRows.map(d => ({ name: d.name, value: d.link_clicks })).filter(d => d.value > 0)
            const total   = pieData.reduce((s, d) => s + d.value, 0)
            return (
              <div className="rounded-xl bg-surface-900 border border-white/5 p-5">
                <p className="text-[10px] text-surface-200/40 uppercase tracking-widest font-semibold mb-4">Link Clicks by {bdLabel}</p>
                {pieData.length === 0 ? <div className="h-40 flex items-center justify-center text-surface-200/20 text-xs italic">No data</div> : (
                  <div className="flex flex-col gap-4">
                    <ResponsiveContainer width="100%" height={150}>
                      <PieChart>
                        <Pie data={pieData} cx="50%" cy="50%" innerRadius={42} outerRadius={68} paddingAngle={2} dataKey="value" strokeWidth={0}>
                          {pieData.map((d, i) => <Cell key={i} fill={bdClr(d.name, i)} />)}
                        </Pie>
                        <Tooltip content={({ active, payload }: any) => {
                          if (!active || !payload?.length) return null
                          const d = payload[0]; const pct = total > 0 ? ((d.value / total) * 100).toFixed(1) : '0'
                          return <div style={{ background: 'rgba(15,15,25,.95)', border: '1px solid rgba(255,255,255,.1)', borderRadius: 8, padding: '6px 10px', fontSize: 11, lineHeight: 1.7 }}><p style={{ color: d.payload.fill, fontWeight: 700 }}>{d.name}</p><p style={{ color: '#f1f5f9', fontFamily: 'monospace' }}>{fmtNum(d.value)}<span style={{ color: 'rgba(255,255,255,.4)', marginLeft: 6 }}>({pct}%)</span></p></div>
                        }} />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="space-y-1.5">
                      {pieData.map((d, i) => { const pct = total > 0 ? ((d.value / total) * 100).toFixed(1) : '0'; return (
                        <div key={d.name} className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full shrink-0" style={{ background: bdClr(d.name, i) }} />
                          <span className="text-[11px] text-surface-200/60 flex-1 truncate">{d.name}</span>
                          <span className="text-[10px] text-surface-200/30 tabular-nums">{pct}%</span>
                        </div>
                      )})}
                    </div>
                  </div>
                )}
              </div>
            )
          })()}

          {/* CTR bar */}
          {(() => {
            const barData = bdRows
              .map(d => ({ name: d.name, value: d.impressions > 0 ? parseFloat(((d.link_clicks / d.impressions) * 100).toFixed(2)) : 0, fill: bdClr(d.name, 0) }))
              .filter(d => d.value > 0).sort((a, b) => b.value - a.value)
            return (
              <div className="rounded-xl bg-surface-900 border border-white/5 p-5">
                <p className="text-[10px] text-surface-200/40 uppercase tracking-widest font-semibold mb-4">CTR by {bdLabel}</p>
                {barData.length === 0 ? <div className="h-40 flex items-center justify-center text-surface-200/20 text-xs italic">No data</div> : (
                  <ResponsiveContainer width="100%" height={Math.max(120, barData.length * 36)}>
                    <BarChart data={barData} layout="vertical" margin={{ top: 0, right: 48, left: 8, bottom: 0 }}>
                      <XAxis type="number" hide />
                      <YAxis type="category" dataKey="name" tick={{ fill: 'rgba(255,255,255,.4)', fontSize: 11 }} axisLine={false} tickLine={false} width={48} />
                      <Tooltip cursor={{ fill: 'rgba(255,255,255,.04)' }} content={({ active, payload }: any) => {
                        if (!active || !payload?.length) return null
                        return <div style={{ background: 'rgba(15,15,25,.95)', border: '1px solid rgba(255,255,255,.1)', borderRadius: 8, padding: '6px 10px', fontSize: 11 }}><p style={{ color: payload[0].payload.fill, fontWeight: 700 }}>{payload[0].payload.name}</p><p style={{ color: '#f1f5f9', fontFamily: 'monospace' }}>{payload[0].value}%</p></div>
                      }} />
                      <Bar dataKey="value" radius={[0, 4, 4, 0]} maxBarSize={20}>
                        {barData.map((d, i) => <Cell key={i} fill={bdClr(d.name, i)} />)}
                        <LabelList dataKey="value" position="right" formatter={(v: number) => `${v}%`} style={{ fill: 'rgba(255,255,255,.4)', fontSize: 10 }} />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            )
          })()}

        </div>

        </div>

        {/* ── Engagement ── */}
        <div className="rounded-2xl bg-surface-800/50 p-6 space-y-6">
        <h2 className="text-sm font-bold text-surface-100 uppercase tracking-widest">Engagement</h2>

        {/* Row 1: LP View | View Offer | Real Leads — KPI cards */}
        <div className="grid grid-cols-3 gap-4">
          <KPICard
            label="Landing Page View"
            value={fmtNum(totals.lp_view)}
            delta={pctDelta(totals.lp_view, prevTotals.lp_view)}
            deltaLabel={compLabel}
            sparkline={sparklines.lp_view}
            tooltipFmt="number"
          />
          <KPICard
            label="View Offer"
            value={fmtNum(totals.view_offer)}
            delta={pctDelta(totals.view_offer, prevTotals.view_offer)}
            deltaLabel={compLabel}
            sparkline={sparklines.view_offer}
            tooltipFmt="number"
          />
          <KPICard
            label="Real Leads (All)"
            value={fmtNum(totals.rl_all)}
            delta={pctDelta(totals.rl_all, prevTotals.rl_all)}
            deltaLabel={compLabel}
            sparkline={sparklines.rl_all}
            tooltipFmt="number"
          />
        </div>

        {/* Row 2: Pie charts — LP View | View Offer | Real Leads by breakdown */}
        <div className="grid grid-cols-3 gap-4">
          {([
            { title: `Landing Page View by ${bdLabel}`, key: 'lp_view'    as const },
            { title: `View Offer by ${bdLabel}`,         key: 'view_offer' as const },
            { title: `Real Leads by ${bdLabel}`,         key: 'rl_all'     as const },
          ]).map(({ title, key }) => {
            const pieData = bdRows.map(d => ({ name: d.name, value: d[key] })).filter(d => d.value > 0)
            const total   = pieData.reduce((s, d) => s + d.value, 0)
            return (
              <div key={key} className="rounded-xl bg-surface-900 border border-white/5 p-5">
                <p className="text-[10px] text-surface-200/40 uppercase tracking-widest font-semibold mb-4">{title}</p>
                {pieData.length === 0 ? (
                  <div className="h-40 flex items-center justify-center text-surface-200/20 text-xs italic">No data</div>
                ) : (
                  <div className="flex items-center gap-6">
                    <div className="shrink-0">
                      <ResponsiveContainer width={150} height={150}>
                        <PieChart>
                          <Pie data={pieData} cx="50%" cy="50%" innerRadius={42} outerRadius={68} paddingAngle={2} dataKey="value" strokeWidth={0}>
                            {pieData.map((d, i) => <Cell key={i} fill={bdClr(d.name, i)} />)}
                          </Pie>
                          <Tooltip content={({ active, payload }: any) => {
                            if (!active || !payload?.length) return null
                            const d = payload[0]; const pct = total > 0 ? ((d.value / total) * 100).toFixed(1) : '0'
                            return <div style={{ background: 'rgba(15,15,25,.95)', border: '1px solid rgba(255,255,255,.1)', borderRadius: 8, padding: '6px 10px', fontSize: 11, lineHeight: 1.7 }}><p style={{ color: d.payload.fill, fontWeight: 700 }}>{d.name}</p><p style={{ color: '#f1f5f9', fontFamily: 'monospace' }}>{fmtNum(d.value)}<span style={{ color: 'rgba(255,255,255,.4)', marginLeft: 6 }}>({pct}%)</span></p></div>
                          }} />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="flex-1 space-y-2">
                      {pieData.map((d, i) => {
                        const pct = total > 0 ? ((d.value / total) * 100).toFixed(1) : '0'
                        return (
                          <div key={d.name} className="flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full shrink-0" style={{ background: bdClr(d.name, i) }} />
                            <span className="text-[11px] text-surface-200/60 flex-1 truncate">{d.name}</span>
                            <span className="text-[11px] font-semibold tabular-nums text-surface-100">{fmtNum(d.value)}</span>
                            <span className="text-[10px] text-surface-200/30 w-9 text-right">{pct}%</span>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* Row 3: OCLP | LPVO | LP2L — KPI cards */}
        <div className="grid grid-cols-3 gap-4">
          <KPICard
            label="OCLP (LP View / Link Click)"
            value={totals.link_clicks > 0 ? `${totals.oclp.toFixed(2)}%` : '—'}
            delta={pctDelta(totals.oclp, prevTotals.oclp)}
            deltaLabel={compLabel}
            sparkline={sparklines.oclp}
            tooltipFmt="percentage"
          />
          <KPICard
            label="LPVO (View Offer / LP View)"
            value={totals.lp_view > 0 ? `${totals.lpvo.toFixed(2)}%` : '—'}
            delta={pctDelta(totals.lpvo, prevTotals.lpvo)}
            deltaLabel={compLabel}
            sparkline={sparklines.lpvo}
            tooltipFmt="percentage"
          />
          <KPICard
            label="LP2L (Real Leads / LP View)"
            value={totals.lp_view > 0 ? `${totals.lp2l.toFixed(2)}%` : '—'}
            delta={pctDelta(totals.lp2l, prevTotals.lp2l)}
            deltaLabel={compLabel}
            sparkline={sparklines.lp2l}
            tooltipFmt="percentage"
          />
        </div>

        {/* Row 4: OCLP | LPVO | LP2L — bar charts by breakdown */}
        <div className="grid grid-cols-3 gap-4">
          {([
            {
              title: `OCLP by ${bdLabel}`,
              calc: (d: typeof bdRows[0]) => d.link_clicks > 0 ? parseFloat(((d.lp_view / d.link_clicks) * 100).toFixed(2)) : 0,
              fmt: (v: number) => `${v}%`,
            },
            {
              title: `LPVO by ${bdLabel}`,
              calc: (d: typeof bdRows[0]) => d.lp_view > 0 ? parseFloat(((d.view_offer / d.lp_view) * 100).toFixed(2)) : 0,
              fmt: (v: number) => `${v}%`,
            },
            {
              title: `LP2L by ${bdLabel}`,
              calc: (d: typeof bdRows[0]) => d.lp_view > 0 ? parseFloat(((d.rl_all / d.lp_view) * 100).toFixed(2)) : 0,
              fmt: (v: number) => `${v}%`,
            },
          ]).map(({ title, calc, fmt }) => {
            const barData = bdRows
              .map(d => ({ name: d.name, value: calc(d), fill: bdClr(d.name, 0) }))
              .filter(d => d.value > 0)
              .sort((a, b) => b.value - a.value)
            return (
              <div key={title} className="rounded-xl bg-surface-900 border border-white/5 p-5">
                <p className="text-[10px] text-surface-200/40 uppercase tracking-widest font-semibold mb-4">{title}</p>
                {barData.length === 0 ? (
                  <div className="h-32 flex items-center justify-center text-surface-200/20 text-xs italic">No data</div>
                ) : (
                  <ResponsiveContainer width="100%" height={Math.max(100, barData.length * 36)}>
                    <BarChart data={barData} layout="vertical" margin={{ top: 0, right: 48, left: 8, bottom: 0 }}>
                      <XAxis type="number" hide />
                      <YAxis type="category" dataKey="name" tick={{ fill: 'rgba(255,255,255,.4)', fontSize: 11 }} axisLine={false} tickLine={false} width={48} />
                      <Tooltip cursor={{ fill: 'rgba(255,255,255,.04)' }} content={({ active, payload }: any) => {
                        if (!active || !payload?.length) return null
                        return <div style={{ background: 'rgba(15,15,25,.95)', border: '1px solid rgba(255,255,255,.1)', borderRadius: 8, padding: '6px 10px', fontSize: 11 }}><p style={{ color: payload[0].payload.fill, fontWeight: 700 }}>{payload[0].payload.name}</p><p style={{ color: '#f1f5f9', fontFamily: 'monospace' }}>{fmt(payload[0].value)}</p></div>
                      }} />
                      <Bar dataKey="value" radius={[0, 4, 4, 0]} maxBarSize={20}>
                        {barData.map((d, i) => <Cell key={i} fill={bdClr(d.name, i)} />)}
                        <LabelList dataKey="value" position="right" formatter={fmt} style={{ fill: 'rgba(255,255,255,.4)', fontSize: 10 }} />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            )
          })}
        </div>

        </div>

        {/* ── Conversions ── */}
        <div className="rounded-2xl bg-surface-800/50 p-6 space-y-6">
        <h2 className="text-sm font-bold text-surface-100 uppercase tracking-widest">Conversions</h2>

        {/* Top row: Real Leads + CPRL + channel pie + CPRL bar */}
        <div className="grid grid-cols-4 gap-4">
          <KPICard
            label="Real Leads (All)"
            value={fmtNum(totals.rl_all)}
            delta={pctDelta(totals.rl_all, prevTotals.rl_all)}
            deltaLabel={compLabel}
            sparkline={sparklines.rl_all}
            tooltipFmt="number"
          />
          <KPICard
            label="CPRL (All)"
            value={totals.rl_all > 0 ? fmtIDR(totals.cprl) : '—'}
            delta={pctDelta(totals.cprl, prevTotals.cprl)}
            deltaLabel={compLabel}
            sparkline={sparklines.cprl}
            tooltipFmt="currency"
            invertDelta
          />
          {/* Real Leads by Sales Channel pie */}
          {(() => {
            const CHANNEL_COLORS = { CC: '#6366f1', DP: '#10b981', MP: '#f59e0b' }
            const pieData = [
              { name: 'CC', value: totals.rl_cc },
              { name: 'DP', value: totals.rl_dp },
              { name: 'MP', value: totals.rl_mp },
            ].filter(d => d.value > 0)
            const total = pieData.reduce((s, d) => s + d.value, 0)
            return (
              <div className="rounded-xl bg-surface-900 border border-white/5 p-5">
                <p className="text-[10px] text-surface-200/40 uppercase tracking-widest font-semibold mb-4">Real Leads by Sales Channel</p>
                {pieData.length === 0 ? (
                  <div className="h-32 flex items-center justify-center text-surface-200/20 text-xs italic">No data</div>
                ) : (
                  <div className="flex items-center gap-6">
                    <div className="shrink-0">
                      <ResponsiveContainer width={140} height={140}>
                        <PieChart>
                          <Pie data={pieData} cx="50%" cy="50%" innerRadius={38} outerRadius={64} paddingAngle={3} dataKey="value" strokeWidth={0}>
                            {pieData.map((d) => <Cell key={d.name} fill={CHANNEL_COLORS[d.name as keyof typeof CHANNEL_COLORS]} />)}
                          </Pie>
                          <Tooltip content={({ active, payload }: any) => {
                            if (!active || !payload?.length) return null
                            const d = payload[0]
                            const pct = total > 0 ? ((d.value / total) * 100).toFixed(1) : '0'
                            return (
                              <div style={{ background: 'rgba(15,15,25,.95)', border: '1px solid rgba(255,255,255,.1)', borderRadius: 8, padding: '6px 10px', fontSize: 11, lineHeight: 1.7 }}>
                                <p style={{ color: d.payload.fill, fontWeight: 700 }}>{d.name}</p>
                                <p style={{ color: '#f1f5f9', fontFamily: 'monospace' }}>{fmtNum(d.value)}<span style={{ color: 'rgba(255,255,255,.4)', marginLeft: 6 }}>({pct}%)</span></p>
                              </div>
                            )
                          }} />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="flex-1 space-y-2.5">
                      {pieData.map((d) => {
                        const color = CHANNEL_COLORS[d.name as keyof typeof CHANNEL_COLORS]
                        const pct = total > 0 ? ((d.value / total) * 100).toFixed(1) : '0'
                        return (
                          <div key={d.name} className="flex items-center gap-2.5">
                            <span className="w-2 h-2 rounded-full shrink-0" style={{ background: color }} />
                            <span className="text-[11px] text-surface-200/60 flex-1">{d.name}</span>
                            <span className="text-[11px] font-semibold tabular-nums text-surface-100">{fmtNum(d.value)}</span>
                            <span className="text-[10px] text-surface-200/30 w-9 text-right">{pct}%</span>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>
            )
          })()}
          {/* CPRL bar chart by breakdown */}
          {(() => {
            const barData = bdRows
              .map(d => ({ name: d.name, value: d.rl_all > 0 ? parseFloat((d.spend / d.rl_all).toFixed(0)) : 0, fill: bdClr(d.name, 0) }))
              .filter(d => d.value > 0)
              .sort((a, b) => a.value - b.value)
            return (
              <div className="rounded-xl bg-surface-900 border border-white/5 p-5">
                <p className="text-[10px] text-surface-200/40 uppercase tracking-widest font-semibold mb-4">CPRL by {bdLabel}</p>
                {barData.length === 0 ? (
                  <div className="h-32 flex items-center justify-center text-surface-200/20 text-xs italic">No data</div>
                ) : (
                  <ResponsiveContainer width="100%" height={Math.max(100, barData.length * 36)}>
                    <BarChart data={barData} layout="vertical" margin={{ top: 0, right: 72, left: 8, bottom: 0 }}>
                      <XAxis type="number" hide />
                      <YAxis type="category" dataKey="name" tick={{ fill: 'rgba(255,255,255,.4)', fontSize: 11 }} axisLine={false} tickLine={false} width={48} />
                      <Tooltip cursor={{ fill: 'rgba(255,255,255,.04)' }} content={({ active, payload }: any) => {
                        if (!active || !payload?.length) return null
                        return <div style={{ background: 'rgba(15,15,25,.95)', border: '1px solid rgba(255,255,255,.1)', borderRadius: 8, padding: '6px 10px', fontSize: 11 }}><p style={{ color: payload[0].payload.fill, fontWeight: 700 }}>{payload[0].payload.name}</p><p style={{ color: '#f1f5f9', fontFamily: 'monospace' }}>{fmtIDR(payload[0].value)}</p></div>
                      }} />
                      <Bar dataKey="value" radius={[0, 4, 4, 0]} maxBarSize={20}>
                        {barData.map((d, i) => <Cell key={i} fill={bdClr(d.name, i)} />)}
                        <LabelList dataKey="value" position="right" formatter={(v: number) => fmtIDR(v)} style={{ fill: 'rgba(255,255,255,.4)', fontSize: 10 }} />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            )
          })()}
        </div>

        {/* Bottom row: per-channel breakdown */}
        <div className="grid grid-cols-3 gap-4">
          <KPICard
            label="Real Leads CC"
            value={fmtNum(totals.rl_cc)}
            delta={pctDelta(totals.rl_cc, prevTotals.rl_cc)}
            deltaLabel={compLabel}
            sparkline={sparklines.rl_cc}
            tooltipFmt="number"
          />
          <KPICard
            label="Real Leads DP"
            value={fmtNum(totals.rl_dp)}
            delta={pctDelta(totals.rl_dp, prevTotals.rl_dp)}
            deltaLabel={compLabel}
            sparkline={sparklines.rl_dp}
            tooltipFmt="number"
          />
          <KPICard
            label="Real Leads MP"
            value={fmtNum(totals.rl_mp)}
            delta={pctDelta(totals.rl_mp, prevTotals.rl_mp)}
            deltaLabel={compLabel}
            sparkline={sparklines.rl_mp}
            tooltipFmt="number"
          />
        </div>
        </div>

        {/* ── CC Performance ── */}
        <div className="rounded-2xl bg-surface-800/50 p-6 space-y-6">
          <h2 className="text-sm font-bold text-surface-100 uppercase tracking-widest">CC Performance</h2>

          <div className="grid grid-cols-5 gap-4">
            <KPICard
              label="Real Leads CC"
              value={fmtNum(totals.rl_cc)}
              delta={pctDelta(totals.rl_cc, prevTotals.rl_cc)}
              deltaLabel={compLabel}
              sparkline={sparklines.rl_cc}
              tooltipFmt="number"
            />
            <KPICard
              label="Sales CC"
              value={fmtNum(totals.sale_cc)}
              delta={pctDelta(totals.sale_cc, prevTotals.sale_cc)}
              deltaLabel={compLabel}
              sparkline={sparklines.sale_cc}
              tooltipFmt="number"
            />
            <KPICard
              label="Revenue CC"
              value={fmtIDR(totals.rev_cc)}
              delta={pctDelta(totals.rev_cc, prevTotals.rev_cc)}
              deltaLabel={compLabel}
              sparkline={sparklines.rev_cc}
              tooltipFmt="currency"
            />
            <KPICard
              label="CVR CC"
              value={totals.rl_cc > 0 ? `${(totals.cvr_cc * 100).toFixed(2)}%` : '—'}
              delta={pctDelta(totals.cvr_cc, prevTotals.cvr_cc)}
              deltaLabel={compLabel}
              sparkline={sparklines.cvr_cc}
              tooltipFmt="percentage"
            />
            <KPICard
              label="RoAS CC"
              value={totals.spend > 0 ? `${totals.roas_cc.toFixed(2)}×` : '—'}
              delta={pctDelta(totals.roas_cc, prevTotals.roas_cc)}
              deltaLabel={compLabel}
              sparkline={sparklines.roas_cc}
              tooltipFmt="multiplier"
            />
          </div>

          {/* CC charts: 3 pies + 2 bar charts by breakdown */}
          <div className="grid grid-cols-5 gap-4">
            {([
              { title: `Real Leads CC by ${bdLabel}`, key: 'rl_cc'   as const, currency: false },
              { title: `Sales CC by ${bdLabel}`,      key: 'sale_cc' as const, currency: false },
              { title: `Revenue CC by ${bdLabel}`,    key: 'rev_cc'  as const, currency: true  },
            ]).map(({ title, key, currency }) => {
              const pieData = bdRows.map(d => ({ name: d.name, value: d[key] })).filter(d => d.value > 0)
              const total   = pieData.reduce((s, d) => s + d.value, 0)
              return (
                <div key={key} className="rounded-xl bg-surface-900 border border-white/5 p-5">
                  <p className="text-[10px] text-surface-200/40 uppercase tracking-widest font-semibold mb-4">{title}</p>
                  {pieData.length === 0 ? (
                    <div className="h-40 flex items-center justify-center text-surface-200/20 text-xs italic">No data</div>
                  ) : (
                    <div className="flex items-center gap-6">
                      <div className="shrink-0">
                        <ResponsiveContainer width={150} height={150}>
                          <PieChart>
                            <Pie data={pieData} cx="50%" cy="50%" innerRadius={42} outerRadius={68} paddingAngle={2} dataKey="value" strokeWidth={0}>
                              {pieData.map((d, i) => <Cell key={i} fill={bdClr(d.name, i)} />)}
                            </Pie>
                            <Tooltip content={({ active, payload }: any) => {
                              if (!active || !payload?.length) return null
                              const d = payload[0]
                              const pct = total > 0 ? ((d.value / total) * 100).toFixed(1) : '0'
                              return (
                                <div style={{ background: 'rgba(15,15,25,.95)', border: '1px solid rgba(255,255,255,.1)', borderRadius: 8, padding: '6px 10px', fontSize: 11, lineHeight: 1.7 }}>
                                  <p style={{ color: d.payload.fill, fontWeight: 700 }}>{d.name}</p>
                                  <p style={{ color: '#f1f5f9', fontFamily: 'monospace' }}>
                                    {currency ? fmtIDR(d.value) : fmtNum(d.value)}
                                    <span style={{ color: 'rgba(255,255,255,.4)', marginLeft: 6 }}>({pct}%)</span>
                                  </p>
                                </div>
                              )
                            }} />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                      <div className="flex-1 space-y-2">
                        {pieData.map((d, i) => {
                          const pct = total > 0 ? ((d.value / total) * 100).toFixed(1) : '0'
                          return (
                            <div key={d.name} className="flex items-center gap-2">
                              <span className="w-2 h-2 rounded-full shrink-0" style={{ background: bdClr(d.name, i) }} />
                              <span className="text-[11px] text-surface-200/60 flex-1 truncate">{d.name}</span>
                              <span className="text-[11px] font-semibold tabular-nums text-surface-100">{currency ? fmtIDR(d.value) : fmtNum(d.value)}</span>
                              <span className="text-[10px] text-surface-200/30 w-9 text-right">{pct}%</span>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )
            })}

            {/* CVR CC by breakdown — horizontal bar */}
            {(() => {
              const barData = bdRows
                .map(d => ({ name: d.name, value: d.rl_cc > 0 ? parseFloat(((d.sale_cc / d.rl_cc) * 100).toFixed(2)) : 0, fill: bdClr(d.name, 0) }))
                .filter(d => d.value > 0)
                .sort((a, b) => b.value - a.value)
              return (
                <div className="rounded-xl bg-surface-900 border border-white/5 p-5">
                  <p className="text-[10px] text-surface-200/40 uppercase tracking-widest font-semibold mb-4">CVR CC by {bdLabel}</p>
                  {barData.length === 0 ? (
                    <div className="h-40 flex items-center justify-center text-surface-200/20 text-xs italic">No data</div>
                  ) : (
                    <ResponsiveContainer width="100%" height={Math.max(120, barData.length * 36)}>
                      <BarChart data={barData} layout="vertical" margin={{ top: 0, right: 48, left: 8, bottom: 0 }}>
                        <XAxis type="number" hide />
                        <YAxis type="category" dataKey="name" tick={{ fill: 'rgba(255,255,255,.4)', fontSize: 11 }} axisLine={false} tickLine={false} width={44} />
                        <Tooltip
                          cursor={{ fill: 'rgba(255,255,255,.04)' }}
                          content={({ active, payload }: any) => {
                            if (!active || !payload?.length) return null
                            return (
                              <div style={{ background: 'rgba(15,15,25,.95)', border: '1px solid rgba(255,255,255,.1)', borderRadius: 8, padding: '6px 10px', fontSize: 11 }}>
                                <p style={{ color: payload[0].payload.fill, fontWeight: 700 }}>{payload[0].payload.name}</p>
                                <p style={{ color: '#f1f5f9', fontFamily: 'monospace' }}>{payload[0].value}%</p>
                              </div>
                            )
                          }}
                        />
                        <Bar dataKey="value" radius={[0, 4, 4, 0]} maxBarSize={20}>
                          {barData.map((d, i) => <Cell key={i} fill={bdClr(d.name, i)} />)}
                          <LabelList dataKey="value" position="right" formatter={(v: number) => `${v}%`} style={{ fill: 'rgba(255,255,255,.4)', fontSize: 10 }} />
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </div>
              )
            })()}

            {/* RoAS CC by breakdown — horizontal bar */}
            {(() => {
              const barData = bdRows
                .map(d => ({ name: d.name, value: d.spend > 0 ? parseFloat((d.rev_cc / d.spend).toFixed(2)) : 0, fill: bdClr(d.name, 0) }))
                .filter(d => d.value > 0)
                .sort((a, b) => b.value - a.value)
              return (
                <div className="rounded-xl bg-surface-900 border border-white/5 p-5">
                  <p className="text-[10px] text-surface-200/40 uppercase tracking-widest font-semibold mb-4">RoAS CC by {bdLabel}</p>
                  {barData.length === 0 ? (
                    <div className="h-40 flex items-center justify-center text-surface-200/20 text-xs italic">No data</div>
                  ) : (
                    <ResponsiveContainer width="100%" height={Math.max(120, barData.length * 36)}>
                      <BarChart data={barData} layout="vertical" margin={{ top: 0, right: 48, left: 8, bottom: 0 }}>
                        <XAxis type="number" hide />
                        <YAxis type="category" dataKey="name" tick={{ fill: 'rgba(255,255,255,.4)', fontSize: 11 }} axisLine={false} tickLine={false} width={44} />
                        <Tooltip
                          cursor={{ fill: 'rgba(255,255,255,.04)' }}
                          content={({ active, payload }: any) => {
                            if (!active || !payload?.length) return null
                            return (
                              <div style={{ background: 'rgba(15,15,25,.95)', border: '1px solid rgba(255,255,255,.1)', borderRadius: 8, padding: '6px 10px', fontSize: 11 }}>
                                <p style={{ color: payload[0].payload.fill, fontWeight: 700 }}>{payload[0].payload.name}</p>
                                <p style={{ color: '#f1f5f9', fontFamily: 'monospace' }}>{payload[0].value}×</p>
                              </div>
                            )
                          }}
                        />
                        <Bar dataKey="value" radius={[0, 4, 4, 0]} maxBarSize={20}>
                          {barData.map((d, i) => <Cell key={i} fill={bdClr(d.name, i)} />)}
                          <LabelList dataKey="value" position="right" formatter={(v: number) => `${v}×`} style={{ fill: 'rgba(255,255,255,.4)', fontSize: 10 }} />
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </div>
              )
            })()}
          </div>
        </div>

        {/* ── DP Performance ── */}
        <div className="rounded-2xl bg-surface-800/50 p-6 space-y-6">
          <h2 className="text-sm font-bold text-surface-100 uppercase tracking-widest">DP Performance</h2>

          <div className="grid grid-cols-3 gap-4">
            <KPICard
              label="Real Leads DP"
              value={fmtNum(totals.rl_dp)}
              delta={pctDelta(totals.rl_dp, prevTotals.rl_dp)}
              deltaLabel={compLabel}
              sparkline={sparklines.rl_dp}
              tooltipFmt="number"
            />
            <KPICard
              label="Lead Dispatch DP"
              value={fmtNum(totals.lead_disp_dp)}
              delta={pctDelta(totals.lead_disp_dp, prevTotals.lead_disp_dp)}
              deltaLabel={compLabel}
              sparkline={sparklines.lead_disp_dp}
              tooltipFmt="number"
            />
            <KPICard
              label="Dispatch Rate (Dispatch / RL DP)"
              value={totals.rl_dp > 0 ? `${totals.dispatch_rate.toFixed(2)}%` : '—'}
              delta={pctDelta(totals.dispatch_rate, prevTotals.dispatch_rate)}
              deltaLabel={compLabel}
              sparkline={sparklines.dispatch_rate}
              tooltipFmt="percentage"
            />
          </div>

          {/* DP charts by breakdown */}
          {(() => {
            const rows   = bdRows
            const getClr = bdClr
            const label  = bdLabel
            return (
              <div className="grid grid-cols-3 gap-4">

                {/* RL DP pie */}
                {(() => {
                  const pieData = rows.map(d => ({ name: d.name, value: d.rl_dp })).filter(d => d.value > 0)
                  const total   = pieData.reduce((s, d) => s + d.value, 0)
                  return (
                    <div className="rounded-xl bg-surface-900 border border-white/5 p-5">
                      <p className="text-[10px] text-surface-200/40 uppercase tracking-widest font-semibold mb-4">Real Leads DP by {label}</p>
                      {pieData.length === 0 ? <div className="h-40 flex items-center justify-center text-surface-200/20 text-xs italic">No data</div> : (
                        <div className="flex items-center gap-6">
                          <div className="shrink-0">
                            <ResponsiveContainer width={150} height={150}>
                              <PieChart>
                                <Pie data={pieData} cx="50%" cy="50%" innerRadius={42} outerRadius={68} paddingAngle={2} dataKey="value" strokeWidth={0}>
                                  {pieData.map((d, i) => <Cell key={i} fill={getClr(d.name, i)} />)}
                                </Pie>
                                <Tooltip content={({ active, payload }: any) => {
                                  if (!active || !payload?.length) return null
                                  const d = payload[0]; const pct = total > 0 ? ((d.value / total) * 100).toFixed(1) : '0'
                                  return <div style={{ background: 'rgba(15,15,25,.95)', border: '1px solid rgba(255,255,255,.1)', borderRadius: 8, padding: '6px 10px', fontSize: 11, lineHeight: 1.7 }}><p style={{ color: d.payload.fill, fontWeight: 700 }}>{d.name}</p><p style={{ color: '#f1f5f9', fontFamily: 'monospace' }}>{fmtNum(d.value)}<span style={{ color: 'rgba(255,255,255,.4)', marginLeft: 6 }}>({pct}%)</span></p></div>
                                }} />
                              </PieChart>
                            </ResponsiveContainer>
                          </div>
                          <div className="flex-1 space-y-2">
                            {pieData.map((d, i) => { const pct = total > 0 ? ((d.value / total) * 100).toFixed(1) : '0'; return (
                              <div key={d.name} className="flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full shrink-0" style={{ background: getClr(d.name, i) }} />
                                <span className="text-[11px] text-surface-200/60 flex-1 truncate">{d.name}</span>
                                <span className="text-[11px] font-semibold tabular-nums text-surface-100">{fmtNum(d.value)}</span>
                                <span className="text-[10px] text-surface-200/30 w-9 text-right">{pct}%</span>
                              </div>
                            )})}
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })()}

                {/* Lead Dispatch DP pie */}
                {(() => {
                  const pieData = rows.map(d => ({ name: d.name, value: d.lead_disp_dp })).filter(d => d.value > 0)
                  const total   = pieData.reduce((s, d) => s + d.value, 0)
                  return (
                    <div className="rounded-xl bg-surface-900 border border-white/5 p-5">
                      <p className="text-[10px] text-surface-200/40 uppercase tracking-widest font-semibold mb-4">Lead Dispatch DP by {label}</p>
                      {pieData.length === 0 ? <div className="h-40 flex items-center justify-center text-surface-200/20 text-xs italic">No data</div> : (
                        <div className="flex items-center gap-6">
                          <div className="shrink-0">
                            <ResponsiveContainer width={150} height={150}>
                              <PieChart>
                                <Pie data={pieData} cx="50%" cy="50%" innerRadius={42} outerRadius={68} paddingAngle={2} dataKey="value" strokeWidth={0}>
                                  {pieData.map((d, i) => <Cell key={i} fill={getClr(d.name, i)} />)}
                                </Pie>
                                <Tooltip content={({ active, payload }: any) => {
                                  if (!active || !payload?.length) return null
                                  const d = payload[0]; const pct = total > 0 ? ((d.value / total) * 100).toFixed(1) : '0'
                                  return <div style={{ background: 'rgba(15,15,25,.95)', border: '1px solid rgba(255,255,255,.1)', borderRadius: 8, padding: '6px 10px', fontSize: 11, lineHeight: 1.7 }}><p style={{ color: d.payload.fill, fontWeight: 700 }}>{d.name}</p><p style={{ color: '#f1f5f9', fontFamily: 'monospace' }}>{fmtNum(d.value)}<span style={{ color: 'rgba(255,255,255,.4)', marginLeft: 6 }}>({pct}%)</span></p></div>
                                }} />
                              </PieChart>
                            </ResponsiveContainer>
                          </div>
                          <div className="flex-1 space-y-2">
                            {pieData.map((d, i) => { const pct = total > 0 ? ((d.value / total) * 100).toFixed(1) : '0'; return (
                              <div key={d.name} className="flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full shrink-0" style={{ background: getClr(d.name, i) }} />
                                <span className="text-[11px] text-surface-200/60 flex-1 truncate">{d.name}</span>
                                <span className="text-[11px] font-semibold tabular-nums text-surface-100">{fmtNum(d.value)}</span>
                                <span className="text-[10px] text-surface-200/30 w-9 text-right">{pct}%</span>
                              </div>
                            )})}
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })()}

                {/* Dispatch Rate bar */}
                {(() => {
                  const barData = rows
                    .map(d => ({ name: d.name, value: d.rl_dp > 0 ? parseFloat(((d.lead_disp_dp / d.rl_dp) * 100).toFixed(2)) : 0, fill: getClr(d.name, 0) }))
                    .filter(d => d.value > 0)
                    .sort((a, b) => b.value - a.value)
                  return (
                    <div className="rounded-xl bg-surface-900 border border-white/5 p-5">
                      <p className="text-[10px] text-surface-200/40 uppercase tracking-widest font-semibold mb-4">Dispatch Rate by {label}</p>
                      {barData.length === 0 ? <div className="h-40 flex items-center justify-center text-surface-200/20 text-xs italic">No data</div> : (
                        <ResponsiveContainer width="100%" height={Math.max(120, barData.length * 36)}>
                          <BarChart data={barData} layout="vertical" margin={{ top: 0, right: 48, left: 8, bottom: 0 }}>
                            <XAxis type="number" hide />
                            <YAxis type="category" dataKey="name" tick={{ fill: 'rgba(255,255,255,.4)', fontSize: 11 }} axisLine={false} tickLine={false} width={52} />
                            <Tooltip cursor={{ fill: 'rgba(255,255,255,.04)' }} content={({ active, payload }: any) => {
                              if (!active || !payload?.length) return null
                              return <div style={{ background: 'rgba(15,15,25,.95)', border: '1px solid rgba(255,255,255,.1)', borderRadius: 8, padding: '6px 10px', fontSize: 11 }}><p style={{ color: payload[0].payload.fill, fontWeight: 700 }}>{payload[0].payload.name}</p><p style={{ color: '#f1f5f9', fontFamily: 'monospace' }}>{payload[0].value}%</p></div>
                            }} />
                            <Bar dataKey="value" radius={[0, 4, 4, 0]} maxBarSize={20}>
                              {barData.map((d, i) => <Cell key={i} fill={getClr(d.name, i)} />)}
                              <LabelList dataKey="value" position="right" formatter={(v: number) => `${v}%`} style={{ fill: 'rgba(255,255,255,.4)', fontSize: 10 }} />
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      )}
                    </div>
                  )
                })()}
              </div>
            )
          })()}
        </div>

        {/* ── MP Performance ── */}
        <div className="rounded-2xl bg-surface-800/50 p-6 space-y-6">
          <h2 className="text-sm font-bold text-surface-100 uppercase tracking-widest">MP Performance</h2>

          <div className="grid grid-cols-3 gap-4">
            <KPICard
              label="Real Leads MP"
              value={fmtNum(totals.rl_mp)}
              delta={pctDelta(totals.rl_mp, prevTotals.rl_mp)}
              deltaLabel={compLabel}
              sparkline={sparklines.rl_mp}
              tooltipFmt="number"
            />
            <KPICard
              label="Lead Dispatch MP"
              value={fmtNum(totals.lead_disp_mp)}
              delta={pctDelta(totals.lead_disp_mp, prevTotals.lead_disp_mp)}
              deltaLabel={compLabel}
              sparkline={sparklines.lead_disp_mp}
              tooltipFmt="number"
            />
            <KPICard
              label="Dispatch Rate MP (Dispatch / RL MP)"
              value={totals.rl_mp > 0 ? `${totals.dispatch_rate_mp.toFixed(2)}%` : '—'}
              delta={pctDelta(totals.dispatch_rate_mp, prevTotals.dispatch_rate_mp)}
              deltaLabel={compLabel}
              sparkline={sparklines.dispatch_rate_mp}
              tooltipFmt="percentage"
            />
          </div>

          {/* MP charts by breakdown */}
          {(() => {
            const rows   = bdRows
            const getClr = bdClr
            const label  = bdLabel
            return (
              <div className="grid grid-cols-3 gap-4">
                {/* RL MP pie */}
                {(() => {
                  const pieData = rows.map(d => ({ name: d.name, value: d.rl_mp })).filter(d => d.value > 0)
                  const total   = pieData.reduce((s, d) => s + d.value, 0)
                  return (
                    <div className="rounded-xl bg-surface-900 border border-white/5 p-5">
                      <p className="text-[10px] text-surface-200/40 uppercase tracking-widest font-semibold mb-4">Real Leads MP by {label}</p>
                      {pieData.length === 0 ? <div className="h-40 flex items-center justify-center text-surface-200/20 text-xs italic">No data</div> : (
                        <div className="flex items-center gap-6">
                          <div className="shrink-0">
                            <ResponsiveContainer width={150} height={150}>
                              <PieChart>
                                <Pie data={pieData} cx="50%" cy="50%" innerRadius={42} outerRadius={68} paddingAngle={2} dataKey="value" strokeWidth={0}>
                                  {pieData.map((d, i) => <Cell key={i} fill={getClr(d.name, i)} />)}
                                </Pie>
                                <Tooltip content={({ active, payload }: any) => {
                                  if (!active || !payload?.length) return null
                                  const d = payload[0]; const pct = total > 0 ? ((d.value / total) * 100).toFixed(1) : '0'
                                  return <div style={{ background: 'rgba(15,15,25,.95)', border: '1px solid rgba(255,255,255,.1)', borderRadius: 8, padding: '6px 10px', fontSize: 11, lineHeight: 1.7 }}><p style={{ color: d.payload.fill, fontWeight: 700 }}>{d.name}</p><p style={{ color: '#f1f5f9', fontFamily: 'monospace' }}>{fmtNum(d.value)}<span style={{ color: 'rgba(255,255,255,.4)', marginLeft: 6 }}>({pct}%)</span></p></div>
                                }} />
                              </PieChart>
                            </ResponsiveContainer>
                          </div>
                          <div className="flex-1 space-y-2">
                            {pieData.map((d, i) => { const pct = total > 0 ? ((d.value / total) * 100).toFixed(1) : '0'; return (
                              <div key={d.name} className="flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full shrink-0" style={{ background: getClr(d.name, i) }} />
                                <span className="text-[11px] text-surface-200/60 flex-1 truncate">{d.name}</span>
                                <span className="text-[11px] font-semibold tabular-nums text-surface-100">{fmtNum(d.value)}</span>
                                <span className="text-[10px] text-surface-200/30 w-9 text-right">{pct}%</span>
                              </div>
                            )})}
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })()}
                {/* Lead Dispatch MP pie */}
                {(() => {
                  const pieData = rows.map(d => ({ name: d.name, value: d.lead_disp_mp })).filter(d => d.value > 0)
                  const total   = pieData.reduce((s, d) => s + d.value, 0)
                  return (
                    <div className="rounded-xl bg-surface-900 border border-white/5 p-5">
                      <p className="text-[10px] text-surface-200/40 uppercase tracking-widest font-semibold mb-4">Lead Dispatch MP by {label}</p>
                      {pieData.length === 0 ? <div className="h-40 flex items-center justify-center text-surface-200/20 text-xs italic">No data</div> : (
                        <div className="flex items-center gap-6">
                          <div className="shrink-0">
                            <ResponsiveContainer width={150} height={150}>
                              <PieChart>
                                <Pie data={pieData} cx="50%" cy="50%" innerRadius={42} outerRadius={68} paddingAngle={2} dataKey="value" strokeWidth={0}>
                                  {pieData.map((d, i) => <Cell key={i} fill={getClr(d.name, i)} />)}
                                </Pie>
                                <Tooltip content={({ active, payload }: any) => {
                                  if (!active || !payload?.length) return null
                                  const d = payload[0]; const pct = total > 0 ? ((d.value / total) * 100).toFixed(1) : '0'
                                  return <div style={{ background: 'rgba(15,15,25,.95)', border: '1px solid rgba(255,255,255,.1)', borderRadius: 8, padding: '6px 10px', fontSize: 11, lineHeight: 1.7 }}><p style={{ color: d.payload.fill, fontWeight: 700 }}>{d.name}</p><p style={{ color: '#f1f5f9', fontFamily: 'monospace' }}>{fmtNum(d.value)}<span style={{ color: 'rgba(255,255,255,.4)', marginLeft: 6 }}>({pct}%)</span></p></div>
                                }} />
                              </PieChart>
                            </ResponsiveContainer>
                          </div>
                          <div className="flex-1 space-y-2">
                            {pieData.map((d, i) => { const pct = total > 0 ? ((d.value / total) * 100).toFixed(1) : '0'; return (
                              <div key={d.name} className="flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full shrink-0" style={{ background: getClr(d.name, i) }} />
                                <span className="text-[11px] text-surface-200/60 flex-1 truncate">{d.name}</span>
                                <span className="text-[11px] font-semibold tabular-nums text-surface-100">{fmtNum(d.value)}</span>
                                <span className="text-[10px] text-surface-200/30 w-9 text-right">{pct}%</span>
                              </div>
                            )})}
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })()}
                {/* Dispatch Rate MP bar */}
                {(() => {
                  const barData = rows
                    .map(d => ({ name: d.name, value: d.rl_mp > 0 ? parseFloat(((d.lead_disp_mp / d.rl_mp) * 100).toFixed(2)) : 0, fill: getClr(d.name, 0) }))
                    .filter(d => d.value > 0).sort((a, b) => b.value - a.value)
                  return (
                    <div className="rounded-xl bg-surface-900 border border-white/5 p-5">
                      <p className="text-[10px] text-surface-200/40 uppercase tracking-widest font-semibold mb-4">Dispatch Rate MP by {label}</p>
                      {barData.length === 0 ? <div className="h-40 flex items-center justify-center text-surface-200/20 text-xs italic">No data</div> : (
                        <ResponsiveContainer width="100%" height={Math.max(120, barData.length * 36)}>
                          <BarChart data={barData} layout="vertical" margin={{ top: 0, right: 48, left: 8, bottom: 0 }}>
                            <XAxis type="number" hide />
                            <YAxis type="category" dataKey="name" tick={{ fill: 'rgba(255,255,255,.4)', fontSize: 11 }} axisLine={false} tickLine={false} width={52} />
                            <Tooltip cursor={{ fill: 'rgba(255,255,255,.04)' }} content={({ active, payload }: any) => {
                              if (!active || !payload?.length) return null
                              return <div style={{ background: 'rgba(15,15,25,.95)', border: '1px solid rgba(255,255,255,.1)', borderRadius: 8, padding: '6px 10px', fontSize: 11 }}><p style={{ color: payload[0].payload.fill, fontWeight: 700 }}>{payload[0].payload.name}</p><p style={{ color: '#f1f5f9', fontFamily: 'monospace' }}>{payload[0].value}%</p></div>
                            }} />
                            <Bar dataKey="value" radius={[0, 4, 4, 0]} maxBarSize={20}>
                              {barData.map((d, i) => <Cell key={i} fill={getClr(d.name, i)} />)}
                              <LabelList dataKey="value" position="right" formatter={(v: number) => `${v}%`} style={{ fill: 'rgba(255,255,255,.4)', fontSize: 10 }} />
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      )}
                    </div>
                  )
                })()}
              </div>
            )
          })()}
        </div>

      </div>
    </div>
  )
}
