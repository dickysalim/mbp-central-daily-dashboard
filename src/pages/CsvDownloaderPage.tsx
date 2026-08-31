/**
 * CsvDownloaderPage — Aggregated data table with CSV export
 */
import React, { useState, useMemo, useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { D1_WORKER_URL } from '../config/dataSource'
import { DOMAIN_BRAND } from '../config/domainConfig'

const ALL_BRANDS = ['MNC', 'GOL', 'MCI'] as const
const BRANDS = DOMAIN_BRAND === 'ALL' ? ALL_BRANDS : ALL_BRANDS.filter(b => b === DOMAIN_BRAND || (DOMAIN_BRAND === 'GOLO' && b === 'GOL'))

function today() { return new Date().toISOString().slice(0, 10) }
function daysAgo(n: number) { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10) }

// ISO week number
function isoWeek(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  d.setDate(d.getDate() + 4 - (d.getDay() || 7))
  const yearStart = new Date(d.getFullYear(), 0, 1)
  const weekNo = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7)
  return `${d.getFullYear()}-W${String(weekNo).padStart(2, '0')}`
}

function isoWeekRange(isoWeekStr: string): string {
  // Parse "2026-W35" → Monday of that week
  const [yearStr, wStr] = isoWeekStr.split('-W')
  const year = parseInt(yearStr), week = parseInt(wStr)
  // Jan 4 is always in ISO week 1
  const jan4 = new Date(year, 0, 4)
  const dayOfWeek = jan4.getDay() || 7 // Mon=1..Sun=7
  const mon = new Date(jan4.getTime())
  mon.setDate(jan4.getDate() - dayOfWeek + 1 + (week - 1) * 7)
  const sun = new Date(mon.getTime())
  sun.setDate(mon.getDate() + 6)
  const fmt = (d: Date) => `${d.getDate()} ${d.toLocaleDateString('en-GB', { month: 'short' })}`
  return `${fmt(mon)} – ${fmt(sun)}`
}

function dateKey(date: string, breakdown: 'daily' | 'isoweek' | 'monthly'): string {
  if (breakdown === 'monthly') return date.slice(0, 7)
  if (breakdown === 'isoweek') {
    const wk = isoWeek(date)
    return `${wk} (${isoWeekRange(wk)})`
  }
  return date
}

function fmtNum(n: number) { return Math.round(n).toLocaleString('id-ID') }
function fmtRp(n: number) { return 'Rp ' + Math.round(n).toLocaleString('id-ID') }

function toCsv(headers: string[], rows: (string | number)[][]): string {
  const h = headers.join(',')
  const body = rows.map(r => r.map(v => {
    const s = String(v)
    return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s
  }).join(',')).join('\n')
  return h + '\n' + body
}

function downloadCsv(filename: string, csv: string) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = filename; a.click()
  URL.revokeObjectURL(url)
}

const inputStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,0.06)',
  border: '1px solid rgba(255,255,255,0.12)',
  borderRadius: 6, padding: '6px 10px',
  color: '#fff', fontSize: 12, fontFamily: 'Inter, system-ui, sans-serif',
  outline: 'none',
}

const thStyle: React.CSSProperties = {
  padding: '6px 10px', fontSize: 9, fontWeight: 700,
  color: 'rgba(255,255,255,0.4)', textAlign: 'right',
  whiteSpace: 'nowrap', borderBottom: '1px solid rgba(255,255,255,0.08)',
  position: 'sticky' as const, top: 0, background: '#111',
}

const tdStyle: React.CSSProperties = {
  padding: '5px 10px', fontSize: 11, fontWeight: 600,
  color: 'rgba(255,255,255,0.7)', textAlign: 'right',
  whiteSpace: 'nowrap', borderBottom: '1px solid rgba(255,255,255,0.04)',
}

interface PerfRow { date: string; traffic_source: string; sku: string; ad_spend: number; impressions: number; link_click: number }
interface Ga4Row { date: string; traffic_source: string; sku: string; ga4_first_visit: number; ga4_page_view: number; ga4_view_offer: number }
interface ConvRow {
  date: string; traffic_source: string; sku: string
  mongo_real_lead_ccom: number; mongo_real_lead_d2or: number; mongo_real_lead_mpsh: number; mongo_real_lead_ofls: number
  mongo_qualified_lead_ccom: number
  mongo_lead_dispatch_d2or: number; mongo_lead_dispatch_mpsh: number
  mongo_so_created_ccom: number
  mongo_purchase_ccom: number; mongo_purchase_ccom_revenue: number
}

interface AggRow {
  period: string; traffic_source: string; product: string
  ad_spend: number; impressions: number; link_click: number
  first_visit: number; lp_view: number; view_offer: number
  rl_ccom: number; rl_d2or: number; rl_mpsh: number; rl_ofls: number
  qual_ccom: number
  ledi_d2or: number; ledi_mpsh: number; socr_ccom: number
  purchase_ccom: number; revenue_ccom: number
  form_submission: number; visit: number
  ga4_predicted?: boolean
}

// ── Formatters (module-level) ────────────────────────────────────────────────
const fmtPct = (v: number) => v > 0 ? (v * 100).toFixed(2) + '%' : '—'
const fmtX   = (v: number) => v > 0 ? v.toFixed(2) + '×' : '—'
const fmtRpD = (v: number) => v > 0 ? fmtRp(Math.round(v)) : '—'
const safeDiv = (num: number, den: number) => den > 0 ? num / den : 0
const rlAll = (r: AggRow) => r.rl_ccom + r.rl_d2or + r.rl_mpsh + r.rl_ofls
const qlAll = (r: AggRow) => r.qual_ccom + r.ledi_d2or + r.ledi_mpsh

// ── Column definitions (module-level) ────────────────────────────────────────
type ColGroup = 'metrics' | 'ratios'
type ColDef = { id: string; label: string; get: (r: AggRow) => number; fmt: (v: number) => string; brands: string[]; group: ColGroup }

const ALL_COLUMNS: ColDef[] = [
  // ── Metrics ──
  { id: 'ad_spend',        label: 'Ad Spend',         get: r => r.ad_spend,        fmt: fmtRp,  brands: ['MNC','GOL','MCI'], group: 'metrics' },
  { id: 'impressions',     label: 'Impressions',      get: r => r.impressions,     fmt: fmtNum, brands: ['MNC','GOL','MCI'], group: 'metrics' },
  { id: 'link_click',      label: 'Link Click',       get: r => r.link_click,      fmt: fmtNum, brands: ['MNC','GOL','MCI'], group: 'metrics' },
  { id: 'first_visit',     label: 'First Visit',      get: r => r.first_visit,     fmt: fmtNum, brands: ['MNC','GOL','MCI'], group: 'metrics' },
  { id: 'lp_view',         label: 'LP View',          get: r => r.lp_view,         fmt: fmtNum, brands: ['MNC','GOL','MCI'], group: 'metrics' },
  { id: 'view_offer',      label: 'View Offer',       get: r => r.view_offer,      fmt: fmtNum, brands: ['MNC','GOL','MCI'], group: 'metrics' },
  { id: 'form_submission', label: 'Form Submission',   get: r => r.form_submission, fmt: fmtNum, brands: ['MCI'],             group: 'metrics' },
  { id: 'visit',           label: 'Visit',             get: r => r.visit,           fmt: fmtNum, brands: ['MCI'],             group: 'metrics' },
  { id: 'rl_all',          label: 'Real Leads (All)',   get: rlAll,                  fmt: fmtNum, brands: ['MNC','GOL'],       group: 'metrics' },
  { id: 'rl_ccom',         label: 'RL CCOM',           get: r => r.rl_ccom,         fmt: fmtNum, brands: ['MNC','GOL'],       group: 'metrics' },
  { id: 'rl_d2or',         label: 'RL D2OR',           get: r => r.rl_d2or,         fmt: fmtNum, brands: ['MNC','GOL'],       group: 'metrics' },
  { id: 'rl_mpsh',         label: 'RL MPSH',           get: r => r.rl_mpsh,         fmt: fmtNum, brands: ['MNC','GOL'],       group: 'metrics' },
  { id: 'rl_ofls',         label: 'RL OFLS',           get: r => r.rl_ofls,         fmt: fmtNum, brands: ['MNC','GOL'],       group: 'metrics' },
  { id: 'ql_all',           label: 'Quality Leads (All)', get: qlAll,                fmt: fmtNum, brands: ['MNC','GOL'],       group: 'metrics' },
  { id: 'qual_ccom',       label: 'QUAL CCOM',         get: r => r.qual_ccom,       fmt: fmtNum, brands: ['MNC','GOL'],       group: 'metrics' },
  { id: 'ledi_d2or',       label: 'LEDI D2OR',         get: r => r.ledi_d2or,       fmt: fmtNum, brands: ['MNC','GOL'],       group: 'metrics' },
  { id: 'ledi_mpsh',       label: 'LEDI MPSH',         get: r => r.ledi_mpsh,       fmt: fmtNum, brands: ['MNC','GOL'],       group: 'metrics' },
  { id: 'socr_ccom',       label: 'SOCR CCOM',         get: r => r.socr_ccom,       fmt: fmtNum, brands: ['MNC','GOL'],       group: 'metrics' },
  { id: 'purchase_ccom',   label: 'Purchase CCOM',     get: r => r.purchase_ccom,   fmt: fmtNum, brands: ['MNC','GOL'],       group: 'metrics' },
  { id: 'revenue_ccom',    label: 'Revenue CCOM',      get: r => r.revenue_ccom,    fmt: fmtRp,  brands: ['MNC','GOL'],       group: 'metrics' },

  // ── Ratios ──
  { id: 'r_cpm',           label: 'CPM',               get: r => safeDiv(r.ad_spend, r.impressions / 1000), fmt: fmtRpD,  brands: ['MNC','GOL','MCI'], group: 'ratios' },
  { id: 'r_ctr',           label: 'CTR',               get: r => safeDiv(r.link_click, r.impressions),      fmt: fmtPct,  brands: ['MNC','GOL','MCI'], group: 'ratios' },
  { id: 'r_fvr',           label: 'First Visit Rate',  get: r => safeDiv(r.first_visit, r.link_click),      fmt: fmtPct,  brands: ['MNC','GOL','MCI'], group: 'ratios' },
  { id: 'r_oclp',          label: 'OCLP',              get: r => safeDiv(r.lp_view, r.link_click),          fmt: fmtPct,  brands: ['MNC','GOL','MCI'], group: 'ratios' },
  { id: 'r_lpvo',          label: 'LPVO',              get: r => safeDiv(r.view_offer, r.lp_view),          fmt: fmtPct,  brands: ['MNC','GOL','MCI'], group: 'ratios' },
  { id: 'r_vo2l',          label: 'VO2L',              get: r => safeDiv(rlAll(r), r.view_offer),           fmt: fmtPct,  brands: ['MNC','GOL'],       group: 'ratios' },
  { id: 'r_ledi_dp',       label: 'LEDI Rate DP',      get: r => safeDiv(r.ledi_d2or, r.rl_d2or),          fmt: fmtPct,  brands: ['MNC','GOL'],       group: 'ratios' },
  { id: 'r_ledi_mp',       label: 'LEDI Rate MP',      get: r => safeDiv(r.ledi_mpsh, r.rl_mpsh),          fmt: fmtPct,  brands: ['MNC','GOL'],       group: 'ratios' },
  { id: 'r_cvr_cc',        label: 'CVR CC',            get: r => safeDiv(r.purchase_ccom, r.rl_ccom),       fmt: fmtPct,  brands: ['MNC','GOL'],       group: 'ratios' },
  { id: 'r_aov_cc',        label: 'AOV CC',            get: r => safeDiv(r.revenue_ccom, r.purchase_ccom),  fmt: fmtRpD,  brands: ['MNC','GOL'],       group: 'ratios' },
  { id: 'r_cpc',           label: 'CPC',               get: r => safeDiv(r.ad_spend, r.link_click),         fmt: fmtRpD,  brands: ['MNC','GOL','MCI'], group: 'ratios' },
  { id: 'r_cprl_all',      label: 'CPRL (All)',        get: r => safeDiv(r.ad_spend, rlAll(r)),             fmt: fmtRpD,  brands: ['MNC','GOL'],       group: 'ratios' },
  { id: 'r_cpql_all',      label: 'CPQL (All)',        get: r => safeDiv(r.ad_spend, qlAll(r)),             fmt: fmtRpD,  brands: ['MNC','GOL'],       group: 'ratios' },
  { id: 'r_cpa_cc',        label: 'CPA CC',            get: r => safeDiv(r.ad_spend, r.purchase_ccom),      fmt: fmtRpD,  brands: ['MNC','GOL'],       group: 'ratios' },
  { id: 'r_roas_cc',       label: 'RoAS CC',           get: r => safeDiv(r.revenue_ccom, r.ad_spend),       fmt: fmtX,    brands: ['MNC','GOL'],       group: 'ratios' },
]

// Column IDs that depend on GA4 data (will be styled yellow italic when predicted)
const GA4_COLS = new Set(['first_visit', 'lp_view', 'view_offer', 'r_fvr', 'r_oclp', 'r_lpvo', 'r_vo2l'])

const defaultColumnsForBrand = (b: string) =>
  ALL_COLUMNS.filter(c => c.brands.includes(b) && c.group === 'metrics').map(c => c.id)

export function CsvDownloaderPage() {
  const queryClient = useQueryClient()

  // ── LocalStorage helpers ─────────────────────────────────────────────────
  const LS_KEY = 'csv_dl_config'
  type SavedConfig = {
    selectedColumns: string[]
    dimensions: { trafficSource: boolean; product: boolean }
    dimSortBy: 'none' | 'trafficSource' | 'product'
    dimSortDir: 'asc' | 'desc'
    dateBreakdown: 'daily' | 'isoweek' | 'monthly'
    dateSortDir: 'asc' | 'desc'
  }

  const loadConfig = useCallback((b: string): SavedConfig | null => {
    try {
      const raw = localStorage.getItem(`${LS_KEY}_${b}`)
      return raw ? JSON.parse(raw) : null
    } catch { return null }
  }, [])

  const saveConfig = useCallback((b: string, cfg: SavedConfig) => {
    try { localStorage.setItem(`${LS_KEY}_${b}`, JSON.stringify(cfg)) } catch {}
  }, [])

  // ── State ────────────────────────────────────────────────────────────────
  const [brand, setBrand] = useState<string>(BRANDS[0])

  const initCfg = loadConfig(BRANDS[0])
  const [dateFrom, setDateFrom] = useState(daysAgo(30))
  const [dateTo, setDateTo] = useState(daysAgo(1))
  const [dateBreakdown, setDateBreakdown] = useState<'daily' | 'isoweek' | 'monthly'>(initCfg?.dateBreakdown ?? 'daily')
  const [dateSortDir, setDateSortDir] = useState<'asc' | 'desc'>(initCfg?.dateSortDir ?? 'asc')
  const [dimSortBy, setDimSortBy] = useState<'none' | 'trafficSource' | 'product'>(initCfg?.dimSortBy ?? 'none')
  const [dimSortDir, setDimSortDir] = useState<'asc' | 'desc'>(initCfg?.dimSortDir ?? 'asc')
  const [dimensions, setDimensions] = useState<{ trafficSource: boolean; product: boolean }>(initCfg?.dimensions ?? { trafficSource: false, product: false })
  const [dimFilterTS, setDimFilterTS] = useState<Set<string> | null>(null)   // null = show all
  const [dimFilterProd, setDimFilterProd] = useState<Set<string> | null>(null)

  const toggleDim = useCallback((key: 'trafficSource' | 'product') =>
    setDimensions(prev => ({ ...prev, [key]: !prev[key] })), [])

  const { data, isLoading } = useQuery({
    queryKey: ['csv-data', brand, dateFrom, dateTo],
    queryFn: async () => {
      const res = await fetch(`${D1_WORKER_URL}/v2/consumer-goods?brand=${brand}&from=${dateFrom}&to=${dateTo}`)
      return res.json() as Promise<{ performance: PerfRow[]; ga4: Ga4Row[]; conversions: ConvRow[] }>
    },
    enabled: !!dateFrom && !!dateTo,
  })

  // Unique dimension values from raw data
  const uniqueTrafficSources = useMemo(() => {
    if (!data) return []
    const s = new Set<string>()
    for (const p of data.performance) s.add(p.traffic_source)
    for (const g of (data.ga4 ?? [])) s.add(g.traffic_source)
    return [...s].sort()
  }, [data])

  const uniqueProducts = useMemo(() => {
    if (!data) return []
    const s = new Set<string>()
    for (const p of data.performance) if (p.sku && !p.sku.toUpperCase().includes('B2B')) s.add(p.sku)
    for (const g of (data.ga4 ?? [])) if (g.sku && !g.sku.toUpperCase().includes('B2B')) s.add(g.sku)
    return [...s].sort()
  }, [data])

  // Aggregate data
  const rows = useMemo((): AggRow[] => {
    if (!data) return []
    const map = new Map<string, AggRow>()

    const getKey = (date: string, ts: string, sku: string) => {
      const parts = [dateKey(date, dateBreakdown)]
      if (dimensions.trafficSource) parts.push(ts)
      if (dimensions.product) parts.push(sku)
      return parts.join('|')
    }

    const ensure = (date: string, ts: string, sku: string): AggRow => {
      const k = getKey(date, ts, sku)
      let r = map.get(k)
      if (!r) {
        r = {
          period: dateKey(date, dateBreakdown),
          traffic_source: dimensions.trafficSource ? ts : 'ALL',
          product: dimensions.product ? sku : 'ALL',
          ad_spend: 0, impressions: 0, link_click: 0,
          first_visit: 0, lp_view: 0, view_offer: 0,
          rl_ccom: 0, rl_d2or: 0, rl_mpsh: 0, rl_ofls: 0,
          qual_ccom: 0,
          ledi_d2or: 0, ledi_mpsh: 0, socr_ccom: 0,
          purchase_ccom: 0, revenue_ccom: 0,
          form_submission: 0, visit: 0,
        }
        map.set(k, r)
      }
      return r
    }

    const isB2B = (sku: string) => sku?.toUpperCase().includes('B2B')

    for (const p of data.performance) {
      if (isB2B(p.sku)) continue
      const r = ensure(p.date, p.traffic_source, p.sku)
      r.ad_spend += p.ad_spend ?? 0
      r.impressions += p.impressions ?? 0
      r.link_click += p.link_click ?? 0
    }

    for (const g of (data.ga4 ?? [])) {
      if (isB2B(g.sku)) continue
      const r = ensure(g.date, g.traffic_source, g.sku)
      r.first_visit += g.ga4_first_visit ?? 0
      r.lp_view += g.ga4_page_view ?? 0
      r.view_offer += g.ga4_view_offer ?? 0
    }

    for (const c of (data.conversions ?? [])) {
      if (isB2B(c.sku)) continue
      const r = ensure(c.date, c.traffic_source, c.sku)
      r.rl_ccom += c.mongo_real_lead_ccom ?? 0
      r.rl_d2or += c.mongo_real_lead_d2or ?? 0
      r.rl_mpsh += c.mongo_real_lead_mpsh ?? 0
      r.rl_ofls += c.mongo_real_lead_ofls ?? 0
      r.qual_ccom += c.mongo_qualified_lead_ccom ?? 0
      r.ledi_d2or += c.mongo_lead_dispatch_d2or ?? 0
      r.ledi_mpsh += c.mongo_lead_dispatch_mpsh ?? 0
      r.socr_ccom += c.mongo_so_created_ccom ?? 0
      r.purchase_ccom += c.mongo_purchase_ccom ?? 0
      r.revenue_ccom += c.mongo_purchase_ccom_revenue ?? 0
      r.form_submission += (c as any).mongo_form_submission ?? 0
      r.visit += (c as any).mongo_form_conversion ?? 0
    }

    // ── GA4 prediction for H-1 ──────────────────────────────────────────────
    // Find latest date with actual GA4 data
    const ga4Dates = new Set<string>()
    for (const g of (data.ga4 ?? [])) ga4Dates.add(g.date)
    const latestGa4 = ga4Dates.size > 0 ? [...ga4Dates].sort().pop()! : ''

    // For daily breakdown, predict GA4 for dates beyond latestGa4
    if (dateBreakdown === 'daily' && latestGa4) {
      // Build trailing averages per (traffic_source, sku) from rows WITH GA4 data
      const trailMap = new Map<string, { fv: number[]; lp: number[]; vo: number[] }>()
      for (const [, row] of map) {
        if (row.period > latestGa4) continue // skip dates without GA4
        const dk = `${row.traffic_source}|${row.product}`
        let t = trailMap.get(dk)
        if (!t) { t = { fv: [], lp: [], vo: [] }; trailMap.set(dk, t) }
        t.fv.push(row.first_visit)
        t.lp.push(row.lp_view)
        t.vo.push(row.view_offer)
      }
      const avg = (arr: number[]) => {
        const last7 = arr.slice(-7)
        return last7.length > 0 ? last7.reduce((s, v) => s + v, 0) / last7.length : 0
      }
      // Fill predicted values
      for (const [, row] of map) {
        if (row.period <= latestGa4) continue
        const dk = `${row.traffic_source}|${row.product}`
        const t = trailMap.get(dk)
        if (t) {
          row.first_visit = Math.round(avg(t.fv))
          row.lp_view = Math.round(avg(t.lp))
          row.view_offer = Math.round(avg(t.vo))
          row.ga4_predicted = true
        }
      }
    }

    const dateDir = dateSortDir === 'asc' ? 1 : -1
    const dDir = dimSortDir === 'asc' ? 1 : -1
    return Array.from(map.values())
      .filter(r => r.ad_spend > 0)
      .filter(r => {
        if (dimensions.trafficSource && dimFilterTS && !dimFilterTS.has(r.traffic_source)) return false
        if (dimensions.product && dimFilterProd && !dimFilterProd.has(r.product)) return false
        return true
      })
      .sort((a, b) => {
        if (dimSortBy === 'trafficSource') {
          const cmp = dDir * a.traffic_source.localeCompare(b.traffic_source)
          if (cmp !== 0) return cmp
        } else if (dimSortBy === 'product') {
          const cmp = dDir * a.product.localeCompare(b.product)
          if (cmp !== 0) return cmp
        }
        return dateDir * a.period.localeCompare(b.period)
      })
  }, [data, dateBreakdown, dateSortDir, dimSortBy, dimSortDir, dimensions, dimFilterTS, dimFilterProd])

  const availableColumns = useMemo(() => ALL_COLUMNS.filter(c => c.brands.includes(brand)), [brand])
  const availableMetrics = useMemo(() => availableColumns.filter(c => c.group === 'metrics'), [availableColumns])
  const availableRatios  = useMemo(() => availableColumns.filter(c => c.group === 'ratios'), [availableColumns])

  const [selectedColumns, setSelectedColumns] = useState<string[]>(() =>
    initCfg?.selectedColumns ?? defaultColumnsForBrand(brand)
  )
  const [showColumnPicker, setShowColumnPicker] = useState(false)

  // Restore config when brand changes
  const prevBrandRef = React.useRef(brand)
  React.useEffect(() => {
    if (prevBrandRef.current !== brand) {
      // Always reset dim value filters on brand change (they're data-specific)
      setDimFilterTS(null)
      setDimFilterProd(null)
      const cfg = loadConfig(brand)
      if (cfg) {
        setSelectedColumns(cfg.selectedColumns)
        setDimensions(cfg.dimensions)
        setDimSortBy(cfg.dimSortBy)
        setDimSortDir(cfg.dimSortDir)
        setDateBreakdown(cfg.dateBreakdown)
        setDateSortDir(cfg.dateSortDir)
      } else {
        setSelectedColumns(defaultColumnsForBrand(brand))
        setDimensions({ trafficSource: false, product: false })
        setDimSortBy('none')
        setDimSortDir('asc')
      }
      prevBrandRef.current = brand
    }
  }, [brand, loadConfig])

  // Auto-save config to localStorage
  React.useEffect(() => {
    saveConfig(brand, { selectedColumns, dimensions, dimSortBy, dimSortDir, dateBreakdown, dateSortDir })
  }, [brand, selectedColumns, dimensions, dimSortBy, dimSortDir, dateBreakdown, dateSortDir, saveConfig])

  const activeColumns = useMemo(() =>
    selectedColumns.map(id => availableColumns.find(c => c.id === id)).filter((c): c is ColDef => c != null),
    [selectedColumns, availableColumns]
  )

  const toggleColumn = useCallback((id: string) => {
    setSelectedColumns(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    )
  }, [])

  const moveColumn = useCallback((id: string, dir: -1 | 1) => {
    setSelectedColumns(prev => {
      const idx = prev.indexOf(id)
      if (idx < 0) return prev
      const newIdx = idx + dir
      if (newIdx < 0 || newIdx >= prev.length) return prev
      const next = [...prev]
      ;[next[idx], next[newIdx]] = [next[newIdx], next[idx]]
      return next
    })
  }, [])

  // Drag-and-drop reorder
  const dragItemRef = React.useRef<string | null>(null)
  const [dragOverId, setDragOverId] = useState<string | null>(null)

  const handleDragStart = useCallback((id: string) => { dragItemRef.current = id }, [])
  const handleDragOver = useCallback((e: React.DragEvent, id: string) => { e.preventDefault(); setDragOverId(id) }, [])
  const handleDragLeave = useCallback(() => { setDragOverId(null) }, [])
  const handleDrop = useCallback((targetId: string) => {
    const srcId = dragItemRef.current
    if (!srcId || srcId === targetId) { setDragOverId(null); return }
    setSelectedColumns(prev => {
      const next = prev.filter(id => id !== srcId)
      const targetIdx = next.indexOf(targetId)
      if (targetIdx < 0) return prev
      next.splice(targetIdx, 0, srcId)
      return next
    })
    dragItemRef.current = null
    setDragOverId(null)
  }, [])
  const handleDragEnd = useCallback(() => { dragItemRef.current = null; setDragOverId(null) }, [])

  // Build headers (memoized)
  const dimHeaders = useMemo(() => {
    const h: string[] = []
    if (dimensions.trafficSource) h.push('Traffic Source')
    if (dimensions.product) h.push('Product')
    return h
  }, [dimensions.trafficSource, dimensions.product])

  const dateLabel = dateBreakdown === 'isoweek' ? 'ISO Week' : dateBreakdown === 'monthly' ? 'Month' : 'Date'
  const allHeaders = useMemo(() => [dateLabel, ...dimHeaders, ...activeColumns.map(c => c.label)], [dateLabel, dimHeaders, activeColumns])

  // Frozen column config (memoized)
  const frozen = useMemo(() => {
    const DATE_W = 180, DIM_W = 80
    const widths = [DATE_W]
    if (dimensions.trafficSource) widths.push(DIM_W)
    if (dimensions.product) widths.push(DIM_W)
    const lefts = widths.reduce<number[]>((acc, _, i) => {
      acc.push(i === 0 ? 0 : acc[i - 1] + widths[i - 1])
      return acc
    }, [])
    return { count: widths.length, widths, lefts }
  }, [dimensions.trafficSource, dimensions.product])

  const handleDownload = useCallback(() => {
    const csvRows = rows.map(r => {
      const dims: (string | number)[] = []
      if (dimensions.trafficSource) dims.push(r.traffic_source)
      if (dimensions.product) dims.push(r.product)
      const metrics = activeColumns.map(c => c.get(r))
      return [r.period, ...dims, ...metrics]
    })
    const csv = toCsv(allHeaders, csvRows)
    downloadCsv(`${brand}_data_${dateBreakdown}_${dateFrom}_${dateTo}.csv`, csv)
  }, [rows, dimensions, activeColumns, allHeaders, brand, dateBreakdown, dateFrom, dateTo])

  return (
    <div style={{ padding: '32px 40px', fontFamily: 'Inter, system-ui, sans-serif', color: '#fff' }}>
      <h1 style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.03em', marginBottom: 8 }}>CSV Downloader</h1>
      <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginBottom: 28 }}>
        Aggregated performance data table with CSV export.
      </p>

      {/* Controls */}
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', marginBottom: 24, flexWrap: 'wrap' }}>
        {/* Brand */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label style={{ fontSize: 9, fontWeight: 700, color: 'rgba(255,255,255,0.4)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Brand</label>
          <select value={brand} onChange={e => setBrand(e.target.value)} style={{ ...inputStyle, minWidth: 80 }}>
            {BRANDS.map(b => <option key={b} value={b}>{b}</option>)}
          </select>
        </div>

        {/* Date range */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label style={{ fontSize: 9, fontWeight: 700, color: 'rgba(255,255,255,0.4)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>From</label>
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} style={inputStyle} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label style={{ fontSize: 9, fontWeight: 700, color: 'rgba(255,255,255,0.4)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>To</label>
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} style={inputStyle} />
        </div>

        {/* Date Breakdown */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label style={{ fontSize: 9, fontWeight: 700, color: 'rgba(255,255,255,0.4)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Date Breakdown</label>
          <div style={{ display: 'flex', gap: 2 }}>
            {(['daily', 'isoweek', 'monthly'] as const).map(v => (
              <button key={v} onClick={() => setDateBreakdown(v)} style={{
                padding: '5px 10px', fontSize: 10, fontWeight: 700, borderRadius: 4,
                border: 'none', cursor: 'pointer', letterSpacing: '0.03em',
                background: dateBreakdown === v ? 'rgba(129,140,248,0.25)' : 'rgba(255,255,255,0.06)',
                color: dateBreakdown === v ? '#818cf8' : 'rgba(255,255,255,0.4)',
                transition: 'all 0.15s',
              }}>{v === 'isoweek' ? 'Isoweek' : v === 'monthly' ? 'Monthly' : 'Daily'}</button>
            ))}
          </div>
        </div>

        {/* Date Sorting */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label style={{ fontSize: 9, fontWeight: 700, color: 'rgba(255,255,255,0.4)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Date Sorting</label>
          <div style={{ display: 'flex', gap: 2 }}>
            {(['asc', 'desc'] as const).map(v => (
              <button key={v} onClick={() => setDateSortDir(v)} style={{
                padding: '5px 10px', fontSize: 10, fontWeight: 700, borderRadius: 4,
                border: 'none', cursor: 'pointer', letterSpacing: '0.03em',
                background: dateSortDir === v ? 'rgba(129,140,248,0.25)' : 'rgba(255,255,255,0.06)',
                color: dateSortDir === v ? '#818cf8' : 'rgba(255,255,255,0.4)',
                transition: 'all 0.15s',
              }}>{v === 'asc' ? '↑ Ascending' : '↓ Descending'}</button>
            ))}
          </div>
        </div>

        {/* Columns button */}
        <button onClick={() => setShowColumnPicker(prev => !prev)} style={{
          padding: '8px 12px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.12)', cursor: 'pointer',
          fontWeight: 700, fontSize: 12, letterSpacing: '0.03em',
          background: showColumnPicker ? 'rgba(129,140,248,0.2)' : 'rgba(255,255,255,0.06)',
          color: showColumnPicker ? '#818cf8' : 'rgba(255,255,255,0.6)',
          transition: 'all 0.15s',
        }}>⊞ Columns ({activeColumns.length})</button>

        {/* Refresh button */}
        <button onClick={() => queryClient.invalidateQueries({ queryKey: ['csv-data', brand, dateFrom, dateTo] })} style={{
          padding: '8px 12px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.12)', cursor: 'pointer',
          fontWeight: 700, fontSize: 12, letterSpacing: '0.03em',
          background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.6)',
          transition: 'all 0.15s',
        }}>⟳ Refresh</button>

        {/* Download button */}
        <button onClick={handleDownload} disabled={rows.length === 0} style={{
          padding: '8px 16px', borderRadius: 6, border: 'none', cursor: rows.length > 0 ? 'pointer' : 'default',
          fontWeight: 700, fontSize: 12, letterSpacing: '0.03em',
          background: rows.length > 0 ? '#818cf8' : 'rgba(255,255,255,0.1)',
          color: rows.length > 0 ? '#fff' : 'rgba(255,255,255,0.3)',
          transition: 'all 0.15s',
        }}>↓ Download CSV</button>
      </div>

      {/* Column Picker Panel */}
      {showColumnPicker && (
        <div style={{
          display: 'flex', gap: 24, marginBottom: 20,
          background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 10, padding: '16px 20px',
        }}>
          {/* Dimensions & Sort */}
          <div style={{ flex: '0 0 auto', minWidth: 140 }}>
            <div style={{ fontSize: 9, fontWeight: 700, color: 'rgba(255,255,255,0.4)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 6 }}>Dimensions</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {([{ key: 'trafficSource' as const, label: 'Traffic Source' }, { key: 'product' as const, label: 'Product' }]).map(d => {
                const isOn = dimensions[d.key]
                return (
                  <button key={d.key} onClick={() => toggleDim(d.key)} style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '3px 7px', fontSize: 10, fontWeight: 600, borderRadius: 4,
                    border: 'none', cursor: 'pointer', textAlign: 'left',
                    background: isOn ? 'rgba(52,211,153,0.12)' : 'rgba(255,255,255,0.03)',
                    color: isOn ? '#34d399' : 'rgba(255,255,255,0.45)',
                    transition: 'all 0.15s',
                  }}>
                    <span style={{
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                      width: 12, height: 12, borderRadius: 3,
                      border: isOn ? '2px solid #34d399' : '2px solid rgba(255,255,255,0.15)',
                      background: isOn ? '#34d399' : 'transparent',
                      fontSize: 8, color: '#111', fontWeight: 900,
                    }}>{isOn ? '✓' : ''}</span>
                    {d.label}
                  </button>
                )
              })}
            </div>

            {/* Traffic Source value filter */}
            {dimensions.trafficSource && uniqueTrafficSources.length > 0 && (
              <>
                <div style={{ fontSize: 8, fontWeight: 700, color: 'rgba(255,255,255,0.3)', letterSpacing: '0.08em', textTransform: 'uppercase', marginTop: 10, marginBottom: 4 }}>
                  Sources
                  <button onClick={() => setDimFilterTS(null)} style={{
                    marginLeft: 6, padding: '1px 5px', fontSize: 7, fontWeight: 700, borderRadius: 3,
                    border: 'none', cursor: 'pointer',
                    background: !dimFilterTS ? 'rgba(129,140,248,0.2)' : 'rgba(255,255,255,0.06)',
                    color: !dimFilterTS ? '#818cf8' : 'rgba(255,255,255,0.35)',
                  }}>All</button>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                  {uniqueTrafficSources.map(ts => {
                    const isOn = !dimFilterTS || dimFilterTS.has(ts)
                    return (
                      <button key={ts} onClick={() => {
                        setDimFilterTS(prev => {
                          if (!prev) { const s = new Set(uniqueTrafficSources); s.delete(ts); return s }
                          const next = new Set(prev)
                          if (next.has(ts)) next.delete(ts); else next.add(ts)
                          return next.size === uniqueTrafficSources.length ? null : next
                        })
                      }} style={{
                        display: 'flex', alignItems: 'center', gap: 5,
                        padding: '2px 6px', fontSize: 9, fontWeight: 600, borderRadius: 3,
                        border: 'none', cursor: 'pointer', textAlign: 'left',
                        background: isOn ? 'rgba(52,211,153,0.1)' : 'rgba(255,255,255,0.02)',
                        color: isOn ? '#34d399' : 'rgba(255,255,255,0.3)',
                      }}>
                        <span style={{
                          width: 10, height: 10, borderRadius: 2, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                          border: isOn ? '1.5px solid #34d399' : '1.5px solid rgba(255,255,255,0.12)',
                          background: isOn ? '#34d399' : 'transparent', fontSize: 7, color: '#111', fontWeight: 900,
                        }}>{isOn ? '✓' : ''}</span>
                        {ts}
                      </button>
                    )
                  })}
                </div>
              </>
            )}

            {/* Product value filter */}
            {dimensions.product && uniqueProducts.length > 0 && (
              <>
                <div style={{ fontSize: 8, fontWeight: 700, color: 'rgba(255,255,255,0.3)', letterSpacing: '0.08em', textTransform: 'uppercase', marginTop: 10, marginBottom: 4 }}>
                  Products
                  <button onClick={() => setDimFilterProd(null)} style={{
                    marginLeft: 6, padding: '1px 5px', fontSize: 7, fontWeight: 700, borderRadius: 3,
                    border: 'none', cursor: 'pointer',
                    background: !dimFilterProd ? 'rgba(129,140,248,0.2)' : 'rgba(255,255,255,0.06)',
                    color: !dimFilterProd ? '#818cf8' : 'rgba(255,255,255,0.35)',
                  }}>All</button>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                  {uniqueProducts.map(prod => {
                    const isOn = !dimFilterProd || dimFilterProd.has(prod)
                    return (
                      <button key={prod} onClick={() => {
                        setDimFilterProd(prev => {
                          if (!prev) { const s = new Set(uniqueProducts); s.delete(prod); return s }
                          const next = new Set(prev)
                          if (next.has(prod)) next.delete(prod); else next.add(prod)
                          return next.size === uniqueProducts.length ? null : next
                        })
                      }} style={{
                        display: 'flex', alignItems: 'center', gap: 5,
                        padding: '2px 6px', fontSize: 9, fontWeight: 600, borderRadius: 3,
                        border: 'none', cursor: 'pointer', textAlign: 'left',
                        background: isOn ? 'rgba(52,211,153,0.1)' : 'rgba(255,255,255,0.02)',
                        color: isOn ? '#34d399' : 'rgba(255,255,255,0.3)',
                      }}>
                        <span style={{
                          width: 10, height: 10, borderRadius: 2, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                          border: isOn ? '1.5px solid #34d399' : '1.5px solid rgba(255,255,255,0.12)',
                          background: isOn ? '#34d399' : 'transparent', fontSize: 7, color: '#111', fontWeight: 900,
                        }}>{isOn ? '✓' : ''}</span>
                        {prod}
                      </button>
                    )
                  })}
                </div>
              </>
            )}

            <div style={{ fontSize: 9, fontWeight: 700, color: 'rgba(255,255,255,0.4)', letterSpacing: '0.1em', textTransform: 'uppercase', marginTop: 14, marginBottom: 6 }}>Dim. Sort</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {([{ key: 'none' as const, label: 'None' }, { key: 'trafficSource' as const, label: 'Source' }, { key: 'product' as const, label: 'Product' }]).map(v => (
                <button key={v.key} onClick={() => setDimSortBy(v.key)} style={{
                  padding: '3px 7px', fontSize: 10, fontWeight: 600, borderRadius: 4,
                  border: 'none', cursor: 'pointer', textAlign: 'left',
                  background: dimSortBy === v.key ? 'rgba(129,140,248,0.2)' : 'rgba(255,255,255,0.03)',
                  color: dimSortBy === v.key ? '#818cf8' : 'rgba(255,255,255,0.45)',
                  transition: 'all 0.15s',
                }}>{v.label}</button>
              ))}
            </div>

            {dimSortBy !== 'none' && (
              <>
                <div style={{ fontSize: 9, fontWeight: 700, color: 'rgba(255,255,255,0.4)', letterSpacing: '0.1em', textTransform: 'uppercase', marginTop: 10, marginBottom: 6 }}>Dim. Order</div>
                <div style={{ display: 'flex', gap: 2 }}>
                  {(['asc', 'desc'] as const).map(v => (
                    <button key={v} onClick={() => setDimSortDir(v)} style={{
                      padding: '3px 7px', fontSize: 10, fontWeight: 600, borderRadius: 4,
                      border: 'none', cursor: 'pointer',
                      background: dimSortDir === v ? 'rgba(129,140,248,0.2)' : 'rgba(255,255,255,0.03)',
                      color: dimSortDir === v ? '#818cf8' : 'rgba(255,255,255,0.45)',
                      transition: 'all 0.15s',
                    }}>{v === 'asc' ? '↑ A→Z' : '↓ Z→A'}</button>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Available columns — grouped */}
          <div style={{ flex: '0 0 auto', display: 'flex', gap: 20 }}>
            {([
              { label: 'Metrics', cols: availableMetrics },
              { label: 'Ratios',  cols: availableRatios },
            ] as const).map(grp => (
              <div key={grp.label} style={{ minWidth: 170 }}>
                <div style={{ fontSize: 9, fontWeight: 700, color: 'rgba(255,255,255,0.4)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 6 }}>{grp.label}</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  {grp.cols.map(c => {
                    const isOn = selectedColumns.includes(c.id)
                    return (
                      <button key={c.id} onClick={() => toggleColumn(c.id)} style={{
                        display: 'flex', alignItems: 'center', gap: 6,
                        padding: '3px 7px', fontSize: 10, fontWeight: 600, borderRadius: 4,
                        border: 'none', cursor: 'pointer', textAlign: 'left',
                        background: isOn ? 'rgba(52,211,153,0.12)' : 'rgba(255,255,255,0.03)',
                        color: isOn ? '#34d399' : 'rgba(255,255,255,0.45)',
                        transition: 'all 0.15s',
                      }}>
                        <span style={{
                          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                          width: 12, height: 12, borderRadius: 3,
                          border: isOn ? '2px solid #34d399' : '2px solid rgba(255,255,255,0.15)',
                          background: isOn ? '#34d399' : 'transparent',
                          fontSize: 8, color: '#111', fontWeight: 900,
                        }}>{isOn ? '✓' : ''}</span>
                        {c.label}
                      </button>
                    )
                  })}
                  <div style={{ marginTop: 4, display: 'flex', gap: 3 }}>
                    <button onClick={() => setSelectedColumns(prev => {
                      const grpIds = grp.cols.map(c => c.id)
                      const without = prev.filter(id => !grpIds.includes(id))
                      return [...without, ...grpIds]
                    })} style={{
                      padding: '2px 6px', fontSize: 8, fontWeight: 700, borderRadius: 3,
                      border: 'none', cursor: 'pointer',
                      background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.4)',
                    }}>All</button>
                    <button onClick={() => setSelectedColumns(prev => {
                      const grpIds = new Set(grp.cols.map(c => c.id))
                      return prev.filter(id => !grpIds.has(id))
                    })} style={{
                      padding: '2px 6px', fontSize: 8, fontWeight: 700, borderRadius: 3,
                      border: 'none', cursor: 'pointer',
                      background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.4)',
                    }}>None</button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Column order */}
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 9, fontWeight: 700, color: 'rgba(255,255,255,0.4)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 8 }}>Column Order</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {activeColumns.map((c, idx) => (
                <div key={c.id}
                  draggable
                  onDragStart={() => handleDragStart(c.id)}
                  onDragOver={(e) => handleDragOver(e, c.id)}
                  onDragLeave={handleDragLeave}
                  onDrop={() => handleDrop(c.id)}
                  onDragEnd={handleDragEnd}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '4px 8px', fontSize: 11, fontWeight: 600, borderRadius: 4,
                    background: dragOverId === c.id ? 'rgba(129,140,248,0.15)' : 'rgba(255,255,255,0.04)',
                    color: 'rgba(255,255,255,0.7)',
                    cursor: 'grab',
                    borderTop: dragOverId === c.id ? '2px solid #818cf8' : '2px solid transparent',
                    transition: 'background 0.1s',
                  }}
                >
                  <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.2)', cursor: 'grab', userSelect: 'none' }}>⠿</span>
                  <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.25)', fontWeight: 700, width: 16, textAlign: 'center' }}>{idx + 1}</span>
                  <span style={{ flex: 1 }}>{c.label}</span>
                  <button onClick={() => moveColumn(c.id, -1)} disabled={idx === 0} style={{
                    padding: '1px 4px', fontSize: 10, fontWeight: 700, borderRadius: 3,
                    border: 'none', cursor: idx > 0 ? 'pointer' : 'default',
                    background: 'rgba(255,255,255,0.06)', color: idx > 0 ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.15)',
                  }}>↑</button>
                  <button onClick={() => moveColumn(c.id, 1)} disabled={idx === activeColumns.length - 1} style={{
                    padding: '1px 4px', fontSize: 10, fontWeight: 700, borderRadius: 3,
                    border: 'none', cursor: idx < activeColumns.length - 1 ? 'pointer' : 'default',
                    background: 'rgba(255,255,255,0.06)', color: idx < activeColumns.length - 1 ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.15)',
                  }}>↓</button>
                  <button onClick={() => toggleColumn(c.id)} style={{
                    padding: '1px 4px', fontSize: 10, fontWeight: 700, borderRadius: 3,
                    border: 'none', cursor: 'pointer',
                    background: 'rgba(248,113,113,0.1)', color: '#f87171',
                  }}>×</button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Loading */}
      {isLoading && <div style={{ padding: 20, color: 'rgba(255,255,255,0.4)', fontSize: 12 }}>Loading data...</div>}

      {/* Table */}
      {rows.length > 0 && (
        <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, overflow: 'auto', maxHeight: 'calc(100vh - 260px)' }}>
          <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, fontSize: 11 }}>
            <thead>
              <tr>
                {allHeaders.map((h, i) => {
                  const isFrozen = i < frozen.count
                  return (
                    <th key={h} style={{
                      ...thStyle,
                      textAlign: isFrozen ? 'left' : 'right',
                      ...(isFrozen ? { position: 'sticky' as const, left: frozen.lefts[i], zIndex: 3, background: '#111', minWidth: frozen.widths[i], maxWidth: frozen.widths[i], width: frozen.widths[i] } : {}),
                    }}>{h}</th>
                  )
                })}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, ri) => {
                const bg = ri % 2 === 0 ? '#0d0e12' : '#111215'
                let fi = 0
                const fz = (idx: number): React.CSSProperties => ({ position: 'sticky', left: frozen.lefts[idx], zIndex: 1, background: bg, minWidth: frozen.widths[idx], maxWidth: frozen.widths[idx], width: frozen.widths[idx] })
                return (
                  <tr key={ri}>
                    <td style={{ ...tdStyle, textAlign: 'left', color: '#fff', fontWeight: 700, ...fz(fi++) }}>{r.period}</td>
                    {dimensions.trafficSource && <td style={{ ...tdStyle, textAlign: 'left', ...fz(fi++) }}>{r.traffic_source}</td>}
                    {dimensions.product && <td style={{ ...tdStyle, textAlign: 'left', ...fz(fi++) }}>{r.product}</td>}
                    {activeColumns.map(c => {
                      const isPredicted = r.ga4_predicted && GA4_COLS.has(c.id)
                      return (
                        <td key={c.id} style={{
                          ...tdStyle,
                          ...(isPredicted ? { color: '#fbbf24', fontStyle: 'italic' } : {}),
                        }}>{c.fmt(c.get(r))}</td>
                      )
                    })}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {rows.some(r => r.ga4_predicted) && activeColumns.some(c => GA4_COLS.has(c.id)) && (
        <div style={{ marginTop: 6, fontSize: 10, color: '#fbbf24', fontStyle: 'italic' }}>
          *numbers in yellow is forecasted value, not actual value
        </div>
      )}

      {!isLoading && rows.length === 0 && data && (
        <div style={{ padding: 20, color: 'rgba(255,255,255,0.3)', fontSize: 12 }}>No data for selected range.</div>
      )}

      {/* Row count */}
      {rows.length > 0 && (
        <div style={{ marginTop: 8, fontSize: 10, color: 'rgba(255,255,255,0.3)' }}>{rows.length} rows</div>
      )}
    </div>
  )
}
