/**
 * ABTestPage — Create and view A/B test experiments
 *
 * Users pick a brand, level (campaign/adset/ad), assign items to Control + Variants,
 * and select primary + secondary metrics to compare.
 */
import React, { useState, useMemo, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { D1_WORKER_URL } from '../config/dataSource'

// ── Types ────────────────────────────────────────────────────────────────────
interface DimensionItem {
  id: string
  name: string
  traffic_source?: string
  sku?: string
  campaign_id?: string   // parent campaign for adsets/ads
  campaign_name?: string
  adset_id?: string      // parent adset for ads
  adset_name?: string
}

interface ABGroup {
  name: string
  items: DimensionItem[]
}

interface MetricDef {
  id: string
  label: string
  group: 'metrics' | 'ratios'
  brands: string[]
}

type Level = 'campaign' | 'adset' | 'ad'

// ── Aggregation types and helpers (mirrored from CsvDownloader) ──────────────
interface AggRow {
  ad_spend: number; impressions: number; link_click: number
  first_visit: number; lp_view: number; view_offer: number
  rl_ccom: number; rl_d2or: number; rl_mpsh: number; rl_ofls: number
  qual_ccom: number; ledi_d2or: number; ledi_mpsh: number; socr_ccom: number
  purchase_ccom: number; revenue_ccom: number
  form_submission: number; visit: number
  net_reaction: number; net_save: number; net_comment: number; net_share: number
  sale_ca: number; sale_crm: number; sale_mpsh: number; sale_d2or: number; sale_ofls: number
}

const emptyAgg = (): AggRow => ({
  ad_spend: 0, impressions: 0, link_click: 0,
  first_visit: 0, lp_view: 0, view_offer: 0,
  rl_ccom: 0, rl_d2or: 0, rl_mpsh: 0, rl_ofls: 0,
  qual_ccom: 0, ledi_d2or: 0, ledi_mpsh: 0, socr_ccom: 0,
  purchase_ccom: 0, revenue_ccom: 0,
  form_submission: 0, visit: 0,
  net_reaction: 0, net_save: 0, net_comment: 0, net_share: 0,
  sale_ca: 0, sale_crm: 0, sale_mpsh: 0, sale_d2or: 0, sale_ofls: 0,
})

const safeDiv = (n: number, d: number) => d > 0 ? n / d : 0
const rlAll = (r: AggRow) => r.rl_ccom + r.rl_d2or + r.rl_mpsh + r.rl_ofls
const qlAll = (r: AggRow) => r.qual_ccom + r.ledi_d2or + r.ledi_mpsh
const engAll = (r: AggRow) => r.net_reaction + r.net_save + r.net_comment + r.net_share

const fmtRp = (v: number) => v > 0 ? 'Rp ' + v.toLocaleString('id-ID') : '—'
const fmtNum = (v: number) => v > 0 ? v.toLocaleString('id-ID') : '—'
const fmtPct = (v: number) => v > 0 ? (v * 100).toFixed(2) + '%' : '—'
const fmtX = (v: number) => v > 0 ? v.toFixed(2) + '×' : '—'
const fmtRpD = (v: number) => v > 0 ? fmtRp(Math.round(v)) : '—'

/** Compute a metric value from an AggRow by metric ID */
const computeMetric = (id: string, r: AggRow): number => {
  switch (id) {
    case 'ad_spend': return r.ad_spend
    case 'impressions': return r.impressions
    case 'link_click': return r.link_click
    case 'first_visit': return r.first_visit
    case 'lp_view': return r.lp_view
    case 'view_offer': return r.view_offer
    case 'form_submission': return r.form_submission
    case 'visit': return r.visit
    case 'rl_all': return rlAll(r)
    case 'rl_ccom': return r.rl_ccom
    case 'rl_d2or': return r.rl_d2or
    case 'rl_mpsh': return r.rl_mpsh
    case 'rl_ofls': return r.rl_ofls
    case 'ql_all': return qlAll(r)
    case 'qual_ccom': return r.qual_ccom
    case 'ledi_d2or': return r.ledi_d2or
    case 'ledi_mpsh': return r.ledi_mpsh
    case 'socr_ccom': return r.socr_ccom
    case 'purchase_ccom': return r.purchase_ccom
    case 'revenue_ccom': return r.revenue_ccom
    case 'sale_cc': return r.sale_ca + r.sale_crm
    case 'sale_ca': return r.sale_ca
    case 'sale_crm': return r.sale_crm
    case 'sale_mpsh': return r.sale_mpsh
    case 'sale_d2or': return r.sale_d2or
    case 'sale_ofls': return r.sale_ofls
    case 'sale_total': return r.sale_ca + r.sale_crm + r.sale_mpsh + r.sale_d2or + r.sale_ofls
    case 'net_engagement': return engAll(r)
    case 'net_reaction': return r.net_reaction
    case 'net_save': return r.net_save
    case 'net_comment': return r.net_comment
    case 'net_share': return r.net_share
    // Ratios
    case 'r_cpm': return safeDiv(r.ad_spend, r.impressions / 1000)
    case 'r_ctr': return safeDiv(r.link_click, r.impressions)
    case 'r_fvr': return safeDiv(r.first_visit, r.lp_view)
    case 'r_oclp': return safeDiv(r.lp_view, r.link_click)
    case 'r_lpvo': return safeDiv(r.view_offer, r.lp_view)
    case 'r_vo2l': return safeDiv(rlAll(r), r.view_offer)
    case 'r_qual_rate_all': return safeDiv(qlAll(r), r.rl_ccom + r.rl_d2or + r.rl_mpsh)
    case 'r_qual_rate_cc': return safeDiv(r.qual_ccom, r.rl_ccom)
    case 'r_ledi_dp': return safeDiv(r.ledi_d2or, r.rl_d2or)
    case 'r_ledi_mp': return safeDiv(r.ledi_mpsh, r.rl_mpsh)
    case 'r_cvr_cc': return safeDiv(r.purchase_ccom, r.rl_ccom)
    case 'r_aov_cc': return safeDiv(r.revenue_ccom, r.purchase_ccom)
    case 'r_cpc': return safeDiv(r.ad_spend, r.link_click)
    case 'r_cpr': return safeDiv(r.ad_spend, r.form_submission)
    case 'r_cpv': return safeDiv(r.ad_spend, r.visit)
    case 'r_cprl_all': return safeDiv(r.ad_spend, rlAll(r))
    case 'r_cpql_all': return safeDiv(r.ad_spend, qlAll(r))
    case 'r_cpa_cc': return safeDiv(r.ad_spend, r.purchase_ccom)
    case 'r_roas_cc': return safeDiv(r.revenue_ccom, r.ad_spend)
    case 'r_roas_total': return safeDiv(r.sale_ca + r.sale_crm + r.sale_mpsh + r.sale_d2or + r.sale_ofls, r.ad_spend)
    case 'r_mcr': return safeDiv(r.ad_spend, r.sale_ca + r.sale_crm + r.sale_mpsh + r.sale_d2or + r.sale_ofls)
    default: return 0
  }
}

/** Format a metric value based on its ID */
const formatMetric = (id: string, v: number): string => {
  if (id.startsWith('r_ctr') || id.startsWith('r_fvr') || id.startsWith('r_oclp') || id.startsWith('r_lpvo') || id.startsWith('r_vo2l') || id.startsWith('r_qual') || id.startsWith('r_ledi') || id.startsWith('r_cvr') || id.startsWith('r_mcr')) return fmtPct(v)
  if (id.startsWith('r_roas') || id === 'r_roas_total_ma30') return fmtX(v)
  if (id === 'r_cpm' || id === 'r_cpc' || id === 'r_cpr' || id === 'r_cpv' || id === 'r_cprl_all' || id === 'r_cpql_all' || id === 'r_cpa_cc' || id === 'r_aov_cc') return fmtRpD(v)
  if (id === 'ad_spend' || id === 'revenue_ccom' || id.startsWith('sale_')) return fmtRp(Math.round(v))
  return fmtNum(Math.round(v))
}

/** Is "higher is better" for this metric? (false = lower is better like CPR, CPC) */
const isHigherBetter = (id: string): boolean => {
  const lowerBetter = ['r_cpm', 'r_cpc', 'r_cpr', 'r_cpv', 'r_cprl_all', 'r_cpql_all', 'r_cpa_cc', 'r_mcr', 'ad_spend']
  return !lowerBetter.includes(id)
}

/** Aggregate raw API data for a set of campaign IDs */
function aggregateForCampaigns(data: any, campaignIds: Set<string>, startDate: string): AggRow {
  const r = emptyAgg()

  for (const p of (data.performance || [])) {
    if (p.date < startDate) continue
    if (!campaignIds.has(p.ads_platform_campaign_id)) continue
    r.ad_spend += p.ad_spend ?? 0
    r.impressions += p.impressions ?? 0
    r.link_click += p.link_click ?? 0
    r.net_reaction += p.engagement_net_reaction ?? 0
    r.net_save += p.engagement_net_save ?? 0
    r.net_comment += p.engagement_net_comment ?? 0
    r.net_share += p.engagement_share ?? 0
  }

  for (const g of (data.ga4 || [])) {
    if (g.date < startDate) continue
    if (!campaignIds.has(g.ads_platform_campaign_id)) continue
    r.first_visit += g.ga4_first_visit ?? 0
    r.lp_view += g.ga4_page_view ?? 0
    r.view_offer += g.ga4_view_offer ?? 0
  }

  for (const c of (data.conversions || [])) {
    if (c.date < startDate) continue
    if (!campaignIds.has(c.ads_platform_campaign_id)) continue
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
    r.form_submission += c.mongo_form_submission ?? 0
    r.visit += c.mongo_form_conversion ?? 0
  }

  return r
}

// ── Metrics (mirrored from CsvDownloader) ────────────────────────────────────
const ALL_METRICS: MetricDef[] = [
  // ── Metrics ──
  { id: 'ad_spend',        label: 'Ad Spend',           group: 'metrics', brands: ['MNC','GOL','MCI'] },
  { id: 'impressions',     label: 'Impressions',        group: 'metrics', brands: ['MNC','GOL','MCI'] },
  { id: 'link_click',      label: 'Link Click',         group: 'metrics', brands: ['MNC','GOL','MCI'] },
  { id: 'first_visit',     label: 'First Visit',        group: 'metrics', brands: ['MNC','GOL','MCI'] },
  { id: 'lp_view',         label: 'LP View',            group: 'metrics', brands: ['MNC','GOL','MCI'] },
  { id: 'view_offer',      label: 'View Offer',         group: 'metrics', brands: ['MNC','GOL','MCI'] },
  { id: 'form_submission', label: 'Form Submission',    group: 'metrics', brands: ['MCI'] },
  { id: 'visit',           label: 'Visit',              group: 'metrics', brands: ['MCI'] },
  { id: 'rl_all',          label: 'Real Leads (All)',   group: 'metrics', brands: ['MNC','GOL'] },
  { id: 'rl_ccom',         label: 'RL CCOM',            group: 'metrics', brands: ['MNC','GOL'] },
  { id: 'rl_d2or',         label: 'RL D2OR',            group: 'metrics', brands: ['MNC','GOL'] },
  { id: 'rl_mpsh',         label: 'RL MPSH',            group: 'metrics', brands: ['MNC','GOL'] },
  { id: 'rl_ofls',         label: 'RL OFLS',            group: 'metrics', brands: ['MNC','GOL'] },
  { id: 'ql_all',          label: 'Quality Leads (All)',group: 'metrics', brands: ['MNC','GOL'] },
  { id: 'qual_ccom',       label: 'QUAL CCOM',          group: 'metrics', brands: ['MNC','GOL'] },
  { id: 'ledi_d2or',       label: 'LEDI D2OR',          group: 'metrics', brands: ['MNC','GOL'] },
  { id: 'ledi_mpsh',       label: 'LEDI MPSH',          group: 'metrics', brands: ['MNC','GOL'] },
  { id: 'socr_ccom',       label: 'SOCR CCOM',          group: 'metrics', brands: ['MNC','GOL'] },
  { id: 'purchase_ccom',   label: 'Purchase CCOM',      group: 'metrics', brands: ['MNC','GOL'] },
  { id: 'revenue_ccom',    label: 'Sales CCOM Ads',     group: 'metrics', brands: ['MNC','GOL'] },
  { id: 'sale_cc',         label: 'Sales CC',           group: 'metrics', brands: ['MNC','GOL'] },
  { id: 'sale_ca',         label: 'Sales CA',           group: 'metrics', brands: ['MNC','GOL'] },
  { id: 'sale_crm',        label: 'Sales CLR',          group: 'metrics', brands: ['MNC','GOL'] },
  { id: 'sale_mpsh',       label: 'Sales MPSH',         group: 'metrics', brands: ['MNC','GOL'] },
  { id: 'sale_d2or',       label: 'Sales D2OR',         group: 'metrics', brands: ['MNC','GOL'] },
  { id: 'sale_ofls',       label: 'Sales OFLS',         group: 'metrics', brands: ['MNC','GOL'] },
  { id: 'sale_total',      label: 'Sales Total',        group: 'metrics', brands: ['MNC','GOL'] },
  { id: 'net_engagement',  label: 'Net Engagement',     group: 'metrics', brands: ['MNC','GOL','MCI'] },
  { id: 'net_reaction',    label: 'Net Reaction',       group: 'metrics', brands: ['MNC','GOL','MCI'] },
  { id: 'net_save',        label: 'Net Save',           group: 'metrics', brands: ['MNC','GOL','MCI'] },
  { id: 'net_comment',     label: 'Net Comment',        group: 'metrics', brands: ['MNC','GOL','MCI'] },
  { id: 'net_share',       label: 'Net Share',          group: 'metrics', brands: ['MNC','GOL','MCI'] },
  // ── Ratios ──
  { id: 'r_cpm',           label: 'CPM',                group: 'ratios',  brands: ['MNC','GOL','MCI'] },
  { id: 'r_ctr',           label: 'CTR',                group: 'ratios',  brands: ['MNC','GOL','MCI'] },
  { id: 'r_fvr',           label: 'First Visit Rate',   group: 'ratios',  brands: ['MNC','GOL','MCI'] },
  { id: 'r_oclp',          label: 'OCLP',               group: 'ratios',  brands: ['MNC','GOL','MCI'] },
  { id: 'r_lpvo',          label: 'LPVO',               group: 'ratios',  brands: ['MNC','GOL','MCI'] },
  { id: 'r_vo2l',          label: 'VO2L',               group: 'ratios',  brands: ['MNC','GOL'] },
  { id: 'r_qual_rate_all', label: 'Quality Leads Rate', group: 'ratios',  brands: ['MNC','GOL'] },
  { id: 'r_qual_rate_cc',  label: 'QUAL Rate CC',       group: 'ratios',  brands: ['MNC','GOL'] },
  { id: 'r_ledi_dp',       label: 'LEDI Rate DP',       group: 'ratios',  brands: ['MNC','GOL'] },
  { id: 'r_ledi_mp',       label: 'LEDI Rate MP',       group: 'ratios',  brands: ['MNC','GOL'] },
  { id: 'r_cvr_cc',        label: 'CVR CC',             group: 'ratios',  brands: ['MNC','GOL'] },
  { id: 'r_aov_cc',        label: 'AOV CC',             group: 'ratios',  brands: ['MNC','GOL'] },
  { id: 'r_cpc',           label: 'CPC',                group: 'ratios',  brands: ['MNC','GOL','MCI'] },
  { id: 'r_cpr',           label: 'CPR',                group: 'ratios',  brands: ['MCI'] },
  { id: 'r_cpv',           label: 'CPV',                group: 'ratios',  brands: ['MCI'] },
  { id: 'r_cprl_all',      label: 'CPRL (All)',         group: 'ratios',  brands: ['MNC','GOL'] },
  { id: 'r_cpql_all',      label: 'CPQL (All)',         group: 'ratios',  brands: ['MNC','GOL'] },
  { id: 'r_cpa_cc',        label: 'CPA CC',             group: 'ratios',  brands: ['MNC','GOL'] },
  { id: 'r_roas_cc',       label: 'RoAS CC Ads',        group: 'ratios',  brands: ['MNC','GOL'] },
  { id: 'r_roas_total',    label: 'RoAS Total',         group: 'ratios',  brands: ['MNC','GOL'] },
  { id: 'r_roas_total_ma30', label: 'RoAS Total (30d MA)', group: 'ratios', brands: ['MNC','GOL'] },
  { id: 'r_mcr',           label: 'Marketing Cost Ratio', group: 'ratios', brands: ['MNC','GOL'] },
]

const BRANDS = ['MCI', 'GOL', 'MNC']
const LEVELS: { value: Level; label: string }[] = [
  { value: 'campaign', label: 'Campaign' },
  { value: 'adset',    label: 'Ad Set' },
  { value: 'ad',       label: 'Ad' },
]

const GROUP_COLORS = ['#6366f1', '#34d399', '#f59e0b', '#f87171', '#a78bfa']
const GROUP_NAMES = ['Control', 'Variant A', 'Variant B', 'Variant C', 'Variant D']

// ── Styles ───────────────────────────────────────────────────────────────────
const S = {
  overlay: {
    position: 'fixed' as const, inset: 0, background: 'rgba(0,0,0,0.6)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
  },
  modal: {
    background: '#151722', borderRadius: 12, width: 720, maxHeight: '90vh',
    border: '1px solid rgba(255,255,255,0.08)', display: 'flex', flexDirection: 'column' as const,
  },
  header: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '16px 20px', borderBottom: '1px solid rgba(255,255,255,0.06)',
  },
  body: { padding: 20, overflowY: 'auto' as const, flex: 1 },
  footer: {
    display: 'flex', justifyContent: 'flex-end', gap: 8,
    padding: '12px 20px', borderTop: '1px solid rgba(255,255,255,0.06)',
  },
  label: { fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase' as const, letterSpacing: '0.04em', marginBottom: 6 },
  select: {
    width: '100%', padding: '8px 10px', fontSize: 12, borderRadius: 6,
    border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.04)',
    color: '#fff', outline: 'none',
  },
  pill: (active: boolean, color: string) => ({
    display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 10px',
    fontSize: 11, fontWeight: 600, borderRadius: 5, cursor: 'pointer', transition: 'all 0.15s',
    border: `1px solid ${active ? color : 'rgba(255,255,255,0.1)'}`,
    background: active ? color + '18' : 'rgba(255,255,255,0.03)',
    color: active ? color : 'rgba(255,255,255,0.5)',
  }),
  chipBtn: {
    display: 'inline-flex', alignItems: 'center', gap: 3, padding: '3px 8px',
    fontSize: 10, fontWeight: 600, borderRadius: 4, cursor: 'pointer',
    border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.03)',
    color: 'rgba(255,255,255,0.5)',
  },
  chipActive: (color: string) => ({
    borderColor: color, background: color + '15', color,
  }),
  btn: (variant: 'primary' | 'ghost') => ({
    padding: '7px 16px', fontSize: 11, fontWeight: 600, borderRadius: 6, cursor: 'pointer',
    border: variant === 'ghost' ? '1px solid rgba(255,255,255,0.1)' : 'none',
    background: variant === 'primary' ? '#6366f1' : 'transparent',
    color: variant === 'primary' ? '#fff' : 'rgba(255,255,255,0.5)',
  }),
  searchInput: {
    width: '100%', padding: '6px 10px', fontSize: 11, borderRadius: 5,
    border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.03)',
    color: '#fff', outline: 'none', marginBottom: 8,
  },
}

// ── Item picker list ─────────────────────────────────────────────────────────
function ItemList({ items, activeGroupIdx, groups, onToggleItem, search, onSearch, tsFilter, onTsFilter, skuFilter, onSkuFilter }: {
  items: DimensionItem[]
  activeGroupIdx: number
  groups: ABGroup[]
  onToggleItem: (item: DimensionItem) => void
  search: string
  onSearch: (v: string) => void
  tsFilter: string
  onTsFilter: (v: string) => void
  skuFilter: string
  onSkuFilter: (v: string) => void
}) {
  const assigned = useMemo(() => {
    const map = new Map<string, number>()
    groups.forEach((g, gi) => g.items.forEach(it => map.set(it.id, gi)))
    return map
  }, [groups])

  const trafficSources = useMemo(() => {
    const set = new Set<string>()
    items.forEach(it => { if (it.traffic_source && it.traffic_source.trim()) set.add(it.traffic_source) })
    return Array.from(set).sort()
  }, [items])

  const skus = useMemo(() => {
    const set = new Set<string>()
    items.forEach(it => { if (it.sku && it.sku.trim()) set.add(it.sku) })
    return Array.from(set).sort()
  }, [items])

  const filtered = useMemo(() => {
    let result = items
    if (search) {
      const q = search.toLowerCase()
      result = result.filter(it => it.name.toLowerCase().includes(q) || it.id.includes(q))
    }
    if (tsFilter) result = result.filter(it => it.traffic_source === tsFilter)
    if (skuFilter) result = result.filter(it => it.sku === skuFilter)
    return result
  }, [items, search, tsFilter, skuFilter])

  const activeColor = GROUP_COLORS[activeGroupIdx]

  return (
    <div>
      {/* Filters row */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
        <input
          type="text" placeholder="Search by name..." value={search} onChange={e => onSearch(e.target.value)}
          style={{ ...S.searchInput, flex: 1, marginBottom: 0 }}
        />
        {trafficSources.length > 0 && (
          <select value={tsFilter} onChange={e => onTsFilter(e.target.value)}
            style={{ ...S.select, width: 100, padding: '5px 6px', fontSize: 10 }}>
            <option value="">All Sources</option>
            {trafficSources.map(ts => <option key={ts} value={ts}>{ts}</option>)}
          </select>
        )}
        {skus.length > 0 && (
          <select value={skuFilter} onChange={e => onSkuFilter(e.target.value)}
            style={{ ...S.select, width: 90, padding: '5px 6px', fontSize: 10 }}>
            <option value="">All SKU</option>
            {skus.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        )}
      </div>

      {/* Items list */}
      <div style={{ maxHeight: 220, overflowY: 'auto', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 6 }}>
        {filtered.length === 0 ? (
          <div style={{ padding: 16, textAlign: 'center', fontSize: 11, color: 'rgba(255,255,255,0.25)' }}>
            No items found
          </div>
        ) : filtered.map(item => {
          const belongsTo = assigned.get(item.id)
          const isInActive = belongsTo === activeGroupIdx
          const isInOther = belongsTo != null && belongsTo !== activeGroupIdx
          return (
            <div
              key={item.id}
              onClick={() => !isInOther && onToggleItem(item)}
              style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px',
                borderBottom: '1px solid rgba(255,255,255,0.03)',
                cursor: isInOther ? 'not-allowed' : 'pointer',
                background: isInActive ? activeColor + '12' : 'transparent',
                opacity: isInOther ? 0.35 : 1,
              }}
            >
              {/* Checkbox */}
              <div style={{
                width: 14, height: 14, borderRadius: 3, flexShrink: 0,
                border: isInActive ? `2px solid ${activeColor}` : '1.5px solid rgba(255,255,255,0.15)',
                background: isInActive ? activeColor : 'transparent',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                {isInActive && (
                  <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                )}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 11, fontWeight: 500, color: isInActive ? '#fff' : 'rgba(255,255,255,0.7)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {item.name}
                </div>
                <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.25)', marginTop: 1 }}>
                  {[item.traffic_source, item.sku].filter(Boolean).join(' · ') || item.id}
                </div>
              </div>
              {isInOther && (
                <span style={{ fontSize: 8, fontWeight: 700, color: GROUP_COLORS[belongsTo!], flexShrink: 0 }}>
                  {groups[belongsTo!].name}
                </span>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Metric picker ────────────────────────────────────────────────────────────
function MetricPicker({ metrics, selected, onToggle, max, color = '#6366f1' }: {
  metrics: MetricDef[]
  selected: string[]
  onToggle: (id: string) => void
  max?: number
  color?: string
}) {
  const metricGroup = metrics.filter(m => m.group === 'metrics')
  const ratioGroup = metrics.filter(m => m.group === 'ratios')

  const renderGroup = (label: string, items: MetricDef[]) => (
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontSize: 9, fontWeight: 700, color: 'rgba(255,255,255,0.2)', textTransform: 'uppercase', marginBottom: 4 }}>{label}</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
        {items.map(m => {
          const active = selected.includes(m.id)
          const disabled = !active && max != null && selected.length >= max
          return (
            <button
              key={m.id}
              onClick={() => !disabled && onToggle(m.id)}
              style={{
                ...S.chipBtn,
                ...(active ? S.chipActive(color) : {}),
                opacity: disabled ? 0.3 : 1,
                cursor: disabled ? 'not-allowed' : 'pointer',
              }}
            >
              {m.label}
            </button>
          )
        })}
      </div>
    </div>
  )

  return (
    <div>
      {metricGroup.length > 0 && renderGroup('Metrics', metricGroup)}
      {ratioGroup.length > 0 && renderGroup('Ratios', ratioGroup)}
    </div>
  )
}

// ── New Experiment Modal ─────────────────────────────────────────────────────
function NewExperimentModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [step, setStep] = useState(0) // 0=setup, 1=groups, 2=metrics
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [brand, setBrand] = useState('')
  const [level, setLevel] = useState<Level>('campaign')
  const [groups, setGroups] = useState<ABGroup[]>([
    { name: GROUP_NAMES[0], items: [] },
    { name: GROUP_NAMES[1], items: [] },
  ])
  const [startDate, setStartDate] = useState('')
  const [primaryMetric, setPrimaryMetric] = useState('')
  const [secondaryMetrics, setSecondaryMetrics] = useState<string[]>([])
  const [search, setSearch] = useState('')
  const [activeGroupIdx, setActiveGroupIdx] = useState(0)
  const [tsFilter, setTsFilter] = useState('')
  const [skuFilter, setSkuFilter] = useState('')
  const [metricTarget, setMetricTarget] = useState<'primary' | 'secondary'>('primary')
  const [metricSearch, setMetricSearch] = useState('')
  const [saving, setSaving] = useState(false)

  // Fetch dimension data when brand is selected
  const { data: dimensionItems, isLoading: loadingDims } = useQuery({
    queryKey: ['ab-dimensions', brand, level],
    queryFn: async () => {
      if (!brand) return []
      // Fetch ALL unique campaigns from ad_performance (no traffic_source filter)
      // and enrich with campaign_dimension names
      const cgRes = await fetch(`${D1_WORKER_URL}/v2/consumer-goods?brand=${brand}&from=2026-01-01&to=2026-12-31`)
      const cg = await cgRes.json()

      // Build a name lookup from campaign_dimension
      const dimLookup = new Map<string, { name: string; ts: string; sku: string }>()
      for (const d of (cg.campaign_dimension || [])) {
        dimLookup.set(d.campaign_id, { name: d.campaign_name, ts: d.traffic_source, sku: d.sku })
      }

      // Also use campaign_budgets for name lookup (has campaign_name)
      for (const b of (cg.campaign_budgets || [])) {
        if (b.campaign_id && b.campaign_name && !dimLookup.has(b.campaign_id)) {
          dimLookup.set(b.campaign_id, { name: b.campaign_name, ts: b.traffic_source || '', sku: b.sku || '' })
        }
      }

      // Get campaigns from performance data (filtered sources only)
      const perf = cg.performance || []
      const seen = new Map<string, DimensionItem>()
      for (const r of perf) {
        const cid = r.campaign_id || r.ads_platform_campaign_id
        if (cid && !seen.has(cid)) {
          const dim = dimLookup.get(cid)
          seen.set(cid, {
            id: cid,
            name: dim?.name || r.campaign_name || cid,
            traffic_source: r.traffic_source || dim?.ts || '',
            sku: r.sku || dim?.sku || '',
          })
        }
      }

      // Also add campaigns from campaign_dimension that might not be in performance
      // (e.g. MTEST015 which is filtered out by the worker's traffic_source IN clause)
      for (const [cid, dim] of dimLookup) {
        if (!seen.has(cid)) {
          seen.set(cid, {
            id: cid,
            name: dim.name || cid,
            traffic_source: dim.ts || '',
            sku: dim.sku || '',
          })
        }
      }

      return Array.from(seen.values()).sort((a, b) => a.name.localeCompare(b.name))
    },
    enabled: !!brand && step >= 1,
    staleTime: 60_000,
  })

  const availableMetrics = useMemo(
    () => brand ? ALL_METRICS.filter(m => m.brands.includes(brand)) : [],
    [brand]
  )

  const addGroup = () => {
    if (groups.length < 5) {
      setGroups([...groups, { name: GROUP_NAMES[groups.length], items: [] }])
    }
  }

  const removeGroup = (idx: number) => {
    if (groups.length > 2 && idx > 0) {
      setGroups(groups.filter((_, i) => i !== idx))
    }
  }

  const toggleItemInActiveGroup = (item: DimensionItem) => {
    setGroups(prev => prev.map((g, gi) => {
      if (gi === activeGroupIdx) {
        // Toggle in active group
        if (g.items.some(it => it.id === item.id)) {
          return { ...g, items: g.items.filter(it => it.id !== item.id) }
        }
        return { ...g, items: [...g.items, item] }
      }
      // Remove from other groups if it's being added to active
      if (!prev[activeGroupIdx].items.some(it => it.id === item.id)) {
        return { ...g, items: g.items.filter(it => it.id !== item.id) }
      }
      return g
    }))
  }

  const toggleSecondary = (id: string) => {
    setSecondaryMetrics(prev =>
      prev.includes(id) ? prev.filter(m => m !== id) : prev.length < 5 ? [...prev, id] : prev
    )
  }

  const canProceedStep0 = brand && level && title.trim() && startDate
  const canProceedStep1 = groups[0].items.length > 0 && groups[1].items.length > 0
  const canCreate = primaryMetric

  return (
    <div style={S.overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={S.modal}>
        {/* Header */}
        <div style={S.header}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>New Experiment</div>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', marginTop: 2 }}>
              Step {step + 1} of 3 — {['Setup', 'Groups', 'Metrics'][step]}
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.3)', cursor: 'pointer', fontSize: 18 }}>✕</button>
        </div>

        {/* Body */}
        <div style={S.body}>
          {/* Step 0: Setup */}
          {step === 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <div style={S.label}>Experiment Title</div>
                <input
                  type="text" placeholder="e.g. MCI A1C Creative Test" value={title}
                  onChange={e => setTitle(e.target.value)}
                  style={S.select}
                />
              </div>

              <div>
                <div style={S.label}>Description <span style={{ fontWeight: 400, opacity: 0.5 }}>(optional)</span></div>
                <textarea
                  placeholder="What are you testing and why?"
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  rows={2}
                  style={{ ...S.select, resize: 'vertical' as const, fontFamily: 'inherit' }}
                />
              </div>

              <div style={{ display: 'flex', gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <div style={S.label}>Brand</div>
                  <select value={brand} onChange={e => setBrand(e.target.value)} style={S.select}>
                    <option value="">Select brand...</option>
                    {BRANDS.map(b => <option key={b} value={b}>{b}</option>)}
                  </select>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={S.label}>Comparison Level</div>
                  <select value={level} onChange={e => setLevel(e.target.value as Level)} style={{ ...S.select, opacity: 0.4, cursor: 'not-allowed' }} disabled>
                    {LEVELS.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
                  </select>
                  <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.2)', marginTop: 3 }}>Ad Set & Ad level coming soon</div>
                </div>
              </div>

              <div style={{ maxWidth: 220 }}>
                <div style={S.label}>Start Date</div>
                <input
                  type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
                  style={S.select}
                />
              </div>
            </div>
          )}

          {/* Step 1: Groups */}
          {step === 1 && (() => {
            const activeColor = GROUP_COLORS[activeGroupIdx]
            return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* Group selector tabs */}
              <div>
                <div style={S.label}>Select a group, then pick campaigns to add</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
                  {groups.map((g, gi) => (
                    <div key={gi} style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                      <button
                        onClick={() => setActiveGroupIdx(gi)}
                        style={{
                          padding: '6px 12px', fontSize: 11, fontWeight: 600, borderRadius: 6,
                          cursor: 'pointer', transition: 'all 0.15s',
                          background: activeGroupIdx === gi ? GROUP_COLORS[gi] + '20' : 'rgba(255,255,255,0.03)',
                          color: activeGroupIdx === gi ? GROUP_COLORS[gi] : 'rgba(255,255,255,0.4)',
                          border: activeGroupIdx === gi ? `2px solid ${GROUP_COLORS[gi]}` : '1px solid rgba(255,255,255,0.08)',
                        }}
                      >
                        {g.name}
                        <span style={{ marginLeft: 4, opacity: 0.5 }}>({g.items.length})</span>
                      </button>
                      {gi > 1 && (
                        <button onClick={() => removeGroup(gi)} style={{
                          background: 'none', border: 'none', color: 'rgba(255,255,255,0.2)',
                          cursor: 'pointer', fontSize: 12, padding: '0 2px',
                        }}>✕</button>
                      )}
                    </div>
                  ))}
                  {groups.length < 5 && (
                    <button onClick={addGroup} style={{ ...S.chipBtn, borderStyle: 'dashed' }}>
                      + Add Variant
                    </button>
                  )}
                </div>

                {/* Chips for active group */}
                <div style={{
                  minHeight: 32, padding: '6px 8px', borderRadius: 6,
                  border: `1.5px solid ${activeColor}30`, background: activeColor + '08',
                  marginBottom: 12,
                }}>
                  {groups[activeGroupIdx].items.length === 0 ? (
                    <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.2)', fontStyle: 'italic' }}>
                      Click campaigns below to add to {groups[activeGroupIdx].name}
                    </span>
                  ) : (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                      {groups[activeGroupIdx].items.map(it => (
                        <span
                          key={it.id}
                          onClick={() => toggleItemInActiveGroup(it)}
                          style={{
                            display: 'inline-flex', alignItems: 'center', gap: 3,
                            padding: '3px 8px', fontSize: 10, borderRadius: 4, cursor: 'pointer',
                            background: activeColor + '20', color: activeColor,
                            border: `1px solid ${activeColor}40`,
                            maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                          }}
                        >
                          {it.name}
                          <span style={{ opacity: 0.5, marginLeft: 2 }}>✕</span>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Campaign list */}
              <div>
                <div style={S.label}>
                  {level === 'campaign' ? 'Campaigns' : level === 'adset' ? 'Ad Sets' : 'Ads'}
                  {loadingDims && <span style={{ marginLeft: 8, opacity: 0.4 }}>Loading...</span>}
                </div>
                <ItemList
                  items={dimensionItems || []}
                  activeGroupIdx={activeGroupIdx}
                  groups={groups}
                  onToggleItem={toggleItemInActiveGroup}
                  search={search}
                  onSearch={setSearch}
                  tsFilter={tsFilter}
                  onTsFilter={setTsFilter}
                  skuFilter={skuFilter}
                  onSkuFilter={setSkuFilter}
                />
              </div>
            </div>
            )
          })()}

          {/* Step 2: Metrics */}
          {step === 2 && (() => {
            const isPrimary = metricTarget === 'primary'
            const activeColor = isPrimary ? '#6366f1' : '#34d399'
            const metricsGroup = availableMetrics.filter(m => m.group === 'metrics')
            const ratiosGroup = availableMetrics.filter(m => m.group === 'ratios')
            const mq = metricSearch.toLowerCase()
            const filteredMetrics = mq ? metricsGroup.filter(m => m.label.toLowerCase().includes(mq) || m.id.includes(mq)) : metricsGroup
            const filteredRatios = mq ? ratiosGroup.filter(m => m.label.toLowerCase().includes(mq) || m.id.includes(mq)) : ratiosGroup

            const toggleMetric = (id: string) => {
              if (isPrimary) {
                setPrimaryMetric(id === primaryMetric ? '' : id)
                // Remove from secondary if it was there
                setSecondaryMetrics(prev => prev.filter(m => m !== id))
              } else {
                if (id === primaryMetric) return // can't add primary to secondary
                setSecondaryMetrics(prev =>
                  prev.includes(id) ? prev.filter(m => m !== id) : prev.length < 5 ? [...prev, id] : prev
                )
              }
            }

            const isSelected = (id: string) => isPrimary ? primaryMetric === id : secondaryMetrics.includes(id)
            const isDisabled = (id: string) => {
              if (isPrimary) return false
              if (id === primaryMetric) return true
              return !secondaryMetrics.includes(id) && secondaryMetrics.length >= 5
            }

            const renderMetricList = (label: string, items: MetricDef[]) => (
              <div style={{ marginBottom: 8 }}>
                <div style={{ fontSize: 9, fontWeight: 700, color: 'rgba(255,255,255,0.2)', textTransform: 'uppercase', marginBottom: 4, paddingLeft: 2 }}>{label}</div>
                <div style={{ border: '1px solid rgba(255,255,255,0.06)', borderRadius: 6 }}>
                  {items.map((m, mi) => {
                    const selected = isSelected(m.id)
                    const disabled = isDisabled(m.id)
                    const isPrimaryItem = m.id === primaryMetric
                    return (
                      <div
                        key={m.id}
                        onClick={() => !disabled && toggleMetric(m.id)}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px',
                          borderBottom: mi < items.length - 1 ? '1px solid rgba(255,255,255,0.03)' : 'none',
                          cursor: disabled ? 'not-allowed' : 'pointer',
                          background: selected ? activeColor + '12' : 'transparent',
                          opacity: disabled ? 0.3 : 1,
                        }}
                      >
                        <div style={{
                          width: 14, height: 14, borderRadius: isPrimary ? '50%' : 3, flexShrink: 0,
                          border: selected ? `2px solid ${activeColor}` : '1.5px solid rgba(255,255,255,0.15)',
                          background: selected ? activeColor : 'transparent',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                          {selected && (
                            isPrimary ? (
                              <div style={{ width: 4, height: 4, borderRadius: '50%', background: '#fff' }} />
                            ) : (
                              <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="20 6 9 17 4 12" />
                              </svg>
                            )
                          )}
                        </div>
                        <span style={{ fontSize: 11, color: selected ? '#fff' : 'rgba(255,255,255,0.6)' }}>{m.label}</span>
                        {!isPrimary && isPrimaryItem && (
                          <span style={{ fontSize: 8, fontWeight: 700, color: '#6366f1', marginLeft: 'auto' }}>Primary</span>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )

            return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* Target selector tabs */}
              <div>
                <div style={S.label}>Select a target, then pick metrics below</div>
                <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
                  <button
                    onClick={() => setMetricTarget('primary')}
                    style={{
                      padding: '6px 12px', fontSize: 11, fontWeight: 600, borderRadius: 6,
                      cursor: 'pointer', transition: 'all 0.15s',
                      background: isPrimary ? '#6366f120' : 'rgba(255,255,255,0.03)',
                      color: isPrimary ? '#6366f1' : 'rgba(255,255,255,0.4)',
                      border: isPrimary ? '2px solid #6366f1' : '1px solid rgba(255,255,255,0.08)',
                    }}
                  >
                    Primary Metric
                    {primaryMetric && <span style={{ marginLeft: 4, opacity: 0.5 }}>✓</span>}
                  </button>
                  <button
                    onClick={() => setMetricTarget('secondary')}
                    style={{
                      padding: '6px 12px', fontSize: 11, fontWeight: 600, borderRadius: 6,
                      cursor: 'pointer', transition: 'all 0.15s',
                      background: !isPrimary ? '#34d39920' : 'rgba(255,255,255,0.03)',
                      color: !isPrimary ? '#34d399' : 'rgba(255,255,255,0.4)',
                      border: !isPrimary ? '2px solid #34d399' : '1px solid rgba(255,255,255,0.08)',
                    }}
                  >
                    Secondary Metrics
                    <span style={{ marginLeft: 4, opacity: 0.5 }}>({secondaryMetrics.length}/5)</span>
                  </button>
                </div>

                {/* Selected chips area */}
                <div style={{
                  minHeight: 32, padding: '6px 8px', borderRadius: 6,
                  border: `1.5px solid ${activeColor}30`, background: activeColor + '08',
                  marginBottom: 12,
                }}>
                  {isPrimary ? (
                    primaryMetric ? (
                      <span
                        onClick={() => setPrimaryMetric('')}
                        style={{
                          display: 'inline-flex', alignItems: 'center', gap: 3,
                          padding: '3px 8px', fontSize: 10, borderRadius: 4, cursor: 'pointer',
                          background: '#6366f120', color: '#6366f1', border: '1px solid #6366f140',
                        }}
                      >
                        {availableMetrics.find(m => m.id === primaryMetric)?.label}
                        <span style={{ opacity: 0.5, marginLeft: 2 }}>✕</span>
                      </span>
                    ) : (
                      <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.2)', fontStyle: 'italic' }}>
                        Click a metric below to set as primary
                      </span>
                    )
                  ) : (
                    secondaryMetrics.length === 0 ? (
                      <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.2)', fontStyle: 'italic' }}>
                        Click metrics below to add as secondary (up to 5)
                      </span>
                    ) : (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {secondaryMetrics.map(id => (
                          <span
                            key={id}
                            onClick={() => setSecondaryMetrics(prev => prev.filter(m => m !== id))}
                            style={{
                              display: 'inline-flex', alignItems: 'center', gap: 3,
                              padding: '3px 8px', fontSize: 10, borderRadius: 4, cursor: 'pointer',
                              background: '#34d39920', color: '#34d399', border: '1px solid #34d39940',
                            }}
                          >
                            {availableMetrics.find(m => m.id === id)?.label}
                            <span style={{ opacity: 0.5, marginLeft: 2 }}>✕</span>
                          </span>
                        ))}
                      </div>
                    )
                  )}
                </div>
              </div>

              {/* Metric list */}
              <div>
                <input
                  type="text" placeholder="Search metrics..." value={metricSearch}
                  onChange={e => setMetricSearch(e.target.value)}
                  style={{ ...S.searchInput, marginBottom: 6 }}
                />
                <div style={{ maxHeight: 250, overflowY: 'auto' }}>
                  {filteredMetrics.length > 0 && renderMetricList('Metrics', filteredMetrics)}
                  {filteredRatios.length > 0 && renderMetricList('Ratios', filteredRatios)}
                  {filteredMetrics.length === 0 && filteredRatios.length === 0 && (
                    <div style={{ padding: 16, textAlign: 'center', fontSize: 11, color: 'rgba(255,255,255,0.25)' }}>
                      No metrics match "{metricSearch}"
                    </div>
                  )}
                </div>
              </div>

              {/* Summary */}
              <div style={{
                background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)',
                borderRadius: 8, padding: 14,
              }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.3)', marginBottom: 8 }}>EXPERIMENT SUMMARY</div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', lineHeight: 1.6 }}>
                  <div><strong style={{ color: '#fff' }}>{title}</strong></div>
                  <div>{brand} · {level} level · from {startDate}</div>
                  {groups.map((g, gi) => (
                    <div key={gi} style={{ color: GROUP_COLORS[gi] }}>
                      {g.name}: {g.items.length} {level}{g.items.length !== 1 ? 's' : ''}
                    </div>
                  ))}
                  {primaryMetric && <div style={{ marginTop: 4 }}>Primary: <strong style={{ color: '#fff' }}>{availableMetrics.find(m => m.id === primaryMetric)?.label}</strong></div>}
                  {secondaryMetrics.length > 0 && <div>Secondary: {secondaryMetrics.map(id => availableMetrics.find(m => m.id === id)?.label).join(', ')}</div>}
                </div>
              </div>
            </div>
            )
          })()}
        </div>

        {/* Footer */}
        <div style={S.footer}>
          {step > 0 && (
            <button onClick={() => setStep(step - 1)} style={S.btn('ghost')}>Back</button>
          )}
          <div style={{ flex: 1 }} />
          {step < 2 ? (
            <button
              onClick={() => setStep(step + 1)}
              disabled={step === 0 ? !canProceedStep0 : !canProceedStep1}
              style={{
                ...S.btn('primary'),
                opacity: (step === 0 ? canProceedStep0 : canProceedStep1) ? 1 : 0.4,
              }}
            >
              Next →
            </button>
          ) : (
            <button
              onClick={async () => {
                setSaving(true)
                try {
                  const id = crypto.randomUUID()
                  const res = await fetch(`${D1_WORKER_URL}/v2/ab-tests`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      id,
                      title: title.trim(),
                      description: description.trim(),
                      brand,
                      level,
                      start_date: startDate,
                      primary_metric: primaryMetric,
                      secondary_metrics: secondaryMetrics,
                      groups: groups.map(g => ({
                        name: g.name,
                        campaign_ids: g.items.map(it => it.id),
                      })),
                    }),
                  })
                  if (!res.ok) {
                    const err = await res.json().catch(() => ({}))
                    alert(`Failed to save: ${(err as any).error || res.statusText}`)
                    return
                  }
                  onCreated()
                  onClose()
                } catch (e: any) {
                  alert(`Error: ${e.message}`)
                } finally {
                  setSaving(false)
                }
              }}
              disabled={!canCreate || saving}
              style={{ ...S.btn('primary'), opacity: canCreate && !saving ? 1 : 0.4 }}
            >
              {saving ? 'Saving...' : 'Create Experiment'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Experiment Card with hydrated data ───────────────────────────────────────
function ExperimentCard({ experiment: exp }: { experiment: any }) {
  const groups = (exp.groups || []).map((g: any) => ({
    name: g.group_name,
    campaignIds: new Set<string>(JSON.parse(g.campaign_ids || '[]')),
  }))

  // Collect all campaign IDs across all groups
  const allCampaignIds = useMemo(() => {
    const ids: string[] = []
    groups.forEach((g: any) => g.campaignIds.forEach((id: string) => ids.push(id)))
    return ids
  }, [groups])

  const today = new Date().toISOString().slice(0, 10)

  const { data: rawData, isLoading } = useQuery({
    queryKey: ['ab-data', exp.id, exp.start_date],
    queryFn: async () => {
      if (allCampaignIds.length === 0) return null
      const res = await fetch(
        `${D1_WORKER_URL}/v2/ab-test-data?brand=${exp.brand}&from=${exp.start_date}&to=${today}&campaign_ids=${allCampaignIds.join(',')}`
      )
      if (!res.ok) return null
      return res.json()
    },
    staleTime: 5 * 60 * 1000,
  })

  const groupAggs = useMemo(() => {
    if (!rawData) return null
    return groups.map((g: { name: string; campaignIds: Set<string> }) =>
      aggregateForCampaigns(rawData, g.campaignIds, exp.start_date)
    )
  }, [rawData, groups, exp.start_date])

  const allMetricIds = [exp.primary_metric, ...(JSON.parse(exp.secondary_metrics || '[]') as string[])]
  const controlIdx = 0

  return (
    <div style={{
      padding: 16, borderRadius: 8,
      border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.02)',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: '#fff' }}>{exp.title}</div>
        <span style={{
          fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 3,
          background: exp.status === 'active' ? '#34d39920' : 'rgba(255,255,255,0.05)',
          color: exp.status === 'active' ? '#34d399' : 'rgba(255,255,255,0.3)',
        }}>
          {exp.status === 'active' ? '● Active' : 'Ended'}
        </span>
      </div>
      <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', marginBottom: 12 }}>
        {exp.brand} · {exp.level} · from {exp.start_date} to {today}
        {exp.description && <span> · {exp.description}</span>}
      </div>

      {/* Data table */}
      {isLoading ? (
        <div style={{ padding: 20, textAlign: 'center', fontSize: 11, color: 'rgba(255,255,255,0.3)' }}>
          Loading performance data...
        </div>
      ) : groupAggs ? (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left', padding: '6px 10px', fontSize: 9, fontWeight: 700, color: 'rgba(255,255,255,0.3)', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                  Metric
                </th>
                {groups.map((g: any, gi: number) => (
                  <th key={gi} style={{
                    textAlign: 'right', padding: '6px 10px', fontSize: 9, fontWeight: 700,
                    color: GROUP_COLORS[gi], borderBottom: '1px solid rgba(255,255,255,0.08)',
                  }}>
                    {g.name}
                  </th>
                ))}
                {groups.length === 2 && (
                  <th style={{ textAlign: 'right', padding: '6px 10px', fontSize: 9, fontWeight: 700, color: 'rgba(255,255,255,0.3)', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                    Δ vs Control
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {allMetricIds.map((metricId: string, mi: number) => {
                const def = ALL_METRICS.find(m => m.id === metricId)
                if (!def) return null
                const isPrimary = mi === 0
                const values = groupAggs.map(agg => computeMetric(metricId, agg))
                const controlVal = values[controlIdx]

                return (
                  <tr key={metricId} style={{
                    background: isPrimary ? 'rgba(99,102,241,0.06)' : 'transparent',
                    borderBottom: '1px solid rgba(255,255,255,0.03)',
                  }}>
                    <td style={{
                      padding: '5px 10px', fontWeight: isPrimary ? 700 : 500,
                      color: isPrimary ? '#6366f1' : 'rgba(255,255,255,0.6)',
                      whiteSpace: 'nowrap',
                    }}>
                      {def.label}
                      {isPrimary && <span style={{ fontSize: 8, marginLeft: 4, opacity: 0.5 }}>PRIMARY</span>}
                    </td>
                    {values.map((val, gi) => (
                      <td key={gi} style={{
                        textAlign: 'right', padding: '5px 10px', fontWeight: 600,
                        color: isPrimary ? '#fff' : 'rgba(255,255,255,0.7)',
                      }}>
                        {formatMetric(metricId, val)}
                      </td>
                    ))}
                    {groups.length === 2 && (() => {
                      const variantVal = values[1]
                      if (controlVal === 0 && variantVal === 0) return <td style={{ textAlign: 'right', padding: '5px 10px', color: 'rgba(255,255,255,0.2)' }}>—</td>
                      // When one side is "—" (0), that side always loses — having no data is the worst outcome
                      if (variantVal === 0 && controlVal > 0) {
                        return <td style={{ textAlign: 'right', padding: '5px 10px', fontWeight: 600, color: '#f87171' }}>-100.0%</td>
                      }
                      if (controlVal === 0 && variantVal > 0) {
                        return <td style={{ textAlign: 'right', padding: '5px 10px', fontWeight: 600, color: '#34d399' }}>∞</td>
                      }
                      // Both have values — normal % diff
                      const diff = ((variantVal - controlVal) / controlVal) * 100
                      const hb = isHigherBetter(metricId)
                      const isGood = hb ? diff > 0 : diff < 0
                      const color = Math.abs(diff) < 1 ? 'rgba(255,255,255,0.3)' : isGood ? '#34d399' : '#f87171'
                      return (
                        <td style={{ textAlign: 'right', padding: '5px 10px', fontWeight: 600, color }}>
                          {diff > 0 ? '+' : ''}{diff.toFixed(1)}%
                        </td>
                      )
                    })()}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div style={{ padding: 12, textAlign: 'center', fontSize: 10, color: 'rgba(255,255,255,0.2)' }}>
          No data available
        </div>
      )}
    </div>
  )
}

// ── Main Page ────────────────────────────────────────────────────────────────
export function ABTestPage() {
  const [showModal, setShowModal] = useState(false)

  const { data: experiments, refetch } = useQuery({
    queryKey: ['ab-experiments'],
    queryFn: async () => {
      const res = await fetch(`${D1_WORKER_URL}/v2/ab-tests`)
      if (!res.ok) return []
      return res.json() as Promise<any[]>
    },
    staleTime: 0,
  })

  const hasExperiments = experiments && experiments.length > 0

  return (
    <div style={{ padding: 32, maxWidth: 1000 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: '#fff', margin: 0 }}>A/B Test</h1>
          <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginTop: 4 }}>
            Track and analyze A/B test experiments
          </p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          style={{
            display: 'flex', alignItems: 'center', gap: 5,
            padding: '8px 14px', fontSize: 12, fontWeight: 600, borderRadius: 7,
            border: 'none', cursor: 'pointer',
            background: '#6366f1', color: '#fff',
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          New Experiment
        </button>
      </div>

      {hasExperiments ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {experiments!.map((exp: any) => (
            <ExperimentCard key={exp.id} experiment={exp} />
          ))}
        </div>
      ) : (
        <div style={{
          padding: 40, textAlign: 'center', borderRadius: 10,
          border: '1px dashed rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.02)',
        }}>
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: 12 }}>
            <path d="M9 2v6l-2 8h4l1 6" /><path d="M15 2v6l2 8h-4l-1 6" /><line x1="7" y1="8" x2="17" y2="8" />
          </svg>
          <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.35)', margin: 0 }}>No experiments yet</p>
          <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.2)', marginTop: 4 }}>
            Click "+ New Experiment" to create your first A/B test
          </p>
        </div>
      )}

      {showModal && <NewExperimentModal onClose={() => setShowModal(false)} onCreated={() => refetch()} />}
    </div>
  )
}
