/**
 * SandboxPage — Design laboratory
 */
import { useState, useMemo, useEffect, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { D1_WORKER_URL } from '../config/dataSource'
import { fmtIDR, dateStr, capToH2, PRESETS } from './ProductPerformancePage'
import { AdSpendHealthCard } from '../components/cards/AdSpendHealthCard'
import { AdsPerformanceHealthCard, type SkuCprlRow } from '../components/cards/AdsPerformanceHealthCard'
import { LeadsQualityCard, type SkuCpaCCRow } from '../components/cards/LeadsQualityCard'
import { AtlPerformanceCard } from '../components/cards/AtlPerformanceCard'
import { SkuPerformanceCard } from '../components/cards/SkuPerformanceCard'
import { TotalRoasCard } from '../components/cards/TotalRoasCard'
import superfoodImg  from '../assets/sku_images/Superfood.webp'
import metafiberImg  from '../assets/sku_images/Metafiber.webp'
import nightsureImg  from '../assets/sku_images/Nightsure.webp'
import threePeptideImg from '../assets/sku_images/3Peptide.webp'

const fmtFull = (n: number) =>
  'Rp ' + Math.round(n).toLocaleString('id-ID')

// ── Consumer-goods response types ───────────────────────────────────────────
interface AdPerfRow    { date: string; traffic_source: string; ads_platform_campaign_id: string; sku: string; ad_spend: number; impressions: number; link_click: number }
interface CampaignBudgetRow { date: string; campaign_name: string; sku: string; daily_budget: number }
interface TargetRow    { date: string; sku: string; daily_ad_spend: number }
interface Ga4Row       { date: string; traffic_source: string; sku: string; ads_platform_campaign_id: string; ga4_first_visit: number; ga4_page_view: number; ga4_view_offer: number }
interface ConvRow      { date: string; traffic_source: string; sku: string; ads_platform_campaign_id: string; mongo_real_lead_ccom: number; mongo_real_lead_d2or: number; mongo_real_lead_mpsh: number; mongo_real_lead_ofls: number; mongo_purchase_ccom: number; mongo_purchase_ccom_revenue: number }
interface BrandBounds  { brand: string; earliest: string; latest: string; skus: string[] }
interface SalesRow   { date: string; brand: string; sku: string; so_ccom_ca: number; so_ccom_crm: number; so_mpsh: number; so_d2or: number; so_ofls: number; rev_ccom_ca: number; rev_ccom_crm: number; rev_mpsh: number; rev_d2or: number; rev_ofls: number }
interface ConsumerGoodsData {
  performance: AdPerfRow[]; campaign_budgets: CampaignBudgetRow[]; targets: TargetRow[]
  ga4: Ga4Row[]; conversions: ConvRow[]
  changelog: { date: string; date_end: string | null; brand: string; sku: string; title: string; changelist: string; notion_page_url: string | null }[]
  campaign_dimension: unknown[]; sales: SalesRow[]
}

// Unified row merged from performance + ga4 + conversions (aggregated by date × sku)
interface AggRow {
  date: string; sku: string
  ad_spend: number; impressions: number; link_click: number
  real_lead_ccom: number; real_lead_d2or: number; real_lead_mpsh: number; real_lead_ofls: number
  purchase_ccom: number; purchase_ccom_revenue: number
  ga4_first_visit: number; ga4_page_view: number; ga4_view_offer: number
}
export interface CprlPoint { date: string; value: number }

export function SandboxPage() {
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
  const brands = useMemo(() => (brandBounds?.map(b => b.brand) ?? []).filter(b => b !== 'MCI'), [brandBounds])

  const [brand, setBrand] = useState('')
  useEffect(() => { if (brands.length > 0 && !brand) setBrand(brands[0]) }, [brands, brand])
  const activeBrand = brand || brands[0] || ''
  const activeBounds = useMemo(() => brandBounds?.find(b => b.brand === activeBrand), [brandBounds, activeBrand])

  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [lastBrand, setLastBrand] = useState('')
  useEffect(() => {
    if (activeBrand && activeBounds && activeBrand !== lastBrand) {
      const latest = capToH2(activeBounds.latest)
      const d = new Date(latest + 'T00:00:00')
      d.setDate(d.getDate() - 29)
      const fromStr = dateStr(d)
      setTo(latest)
      setFrom(fromStr < activeBounds.earliest ? activeBounds.earliest : fromStr)
      setLastBrand(activeBrand)
    }
  }, [activeBrand, activeBounds, lastBrand])
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

  // ── Single query: /v2/consumer-goods ──
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
      if (!activeFrom || !activeTo || !activeBrand) return null
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
    enabled: !!activeFrom && !!activeTo && !!activeBrand,
    staleTime: 5 * 60_000,
  })

  // Merge performance + ga4 + conversions into unified AggRow[] by (date × sku)
  const rawData = useMemo((): AggRow[] => {
    const zero = (): AggRow => ({
      date: '', sku: '',
      ad_spend: 0, impressions: 0, link_click: 0,
      real_lead_ccom: 0, real_lead_d2or: 0, real_lead_mpsh: 0, real_lead_ofls: 0,
      purchase_ccom: 0, purchase_ccom_revenue: 0,
      ga4_first_visit: 0, ga4_page_view: 0, ga4_view_offer: 0,
    })
    const map = new Map<string, AggRow>()
    const k = (date: string, sku: string) => `${date}|${sku}`

    for (const r of cgData?.performance ?? []) {
      const key = k(r.date, r.sku)
      const p = map.get(key) ?? { ...zero(), date: r.date, sku: r.sku }
      map.set(key, { ...p, ad_spend: p.ad_spend + (r.ad_spend ?? 0), impressions: p.impressions + (r.impressions ?? 0), link_click: p.link_click + (r.link_click ?? 0) })
    }
    for (const r of cgData?.ga4 ?? []) {
      const key = k(r.date, r.sku)
      const p = map.get(key) ?? { ...zero(), date: r.date, sku: r.sku }
      map.set(key, { ...p, ga4_first_visit: p.ga4_first_visit + (r.ga4_first_visit ?? 0), ga4_page_view: p.ga4_page_view + (r.ga4_page_view ?? 0), ga4_view_offer: p.ga4_view_offer + (r.ga4_view_offer ?? 0) })
    }
    for (const r of cgData?.conversions ?? []) {
      const key = k(r.date, r.sku)
      const p = map.get(key) ?? { ...zero(), date: r.date, sku: r.sku }
      map.set(key, { ...p,
        real_lead_ccom: p.real_lead_ccom + (r.mongo_real_lead_ccom ?? 0),
        real_lead_d2or: p.real_lead_d2or + (r.mongo_real_lead_d2or ?? 0),
        real_lead_mpsh: p.real_lead_mpsh + (r.mongo_real_lead_mpsh ?? 0),
        real_lead_ofls: p.real_lead_ofls + (r.mongo_real_lead_ofls ?? 0),
        purchase_ccom:  p.purchase_ccom  + (r.mongo_purchase_ccom ?? 0),
        purchase_ccom_revenue: p.purchase_ccom_revenue + (r.mongo_purchase_ccom_revenue ?? 0),
      })
    }
    return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date))
  }, [cgData])

  const targetData       = useMemo(() => cgData?.targets         ?? [], [cgData])
  const filteredChangelog = useMemo(() => cgData?.changelog      ?? [], [cgData])

  // Latest target per SKU (replaces /v2/daily-budget-setting)
  const latestTargetBySku = useMemo(() => {
    const map = new Map<string, TargetRow>()
    for (const r of targetData) {
      const prev = map.get(r.sku)
      if (!prev || r.date > prev.date) map.set(r.sku, r)
    }
    return Array.from(map.values())
  }, [targetData])


  const totalSpend = useMemo(() => (rawData ?? []).reduce((s, r) => s + r.ad_spend, 0), [rawData])
  const totalTarget = useMemo(() => targetData.reduce((s, r) => s + r.daily_ad_spend, 0), [targetData])
  // Daily budget: sum of latest target value per SKU
  const dailyBudget = useMemo(() => latestTargetBySku.reduce((s, r) => s + r.daily_ad_spend, 0), [latestTargetBySku])
  const budgetSettingDate = latestTargetBySku[0]?.date ?? ''
  // Campaign budget: from the campaign_budgets table
  const campaignBudgetTotal = useMemo(() => (cgData?.campaign_budgets ?? []).reduce((s, r) => s + r.daily_budget, 0), [cgData])
  const campaignBudgetDate  = cgData?.campaign_budgets?.[0]?.date ?? ''

  // Per-SKU ad spend vs target breakdown
  const skuSpend = useMemo(() => {
    const skuList = ['MSF', 'MTA', 'MNS', 'M3P'] as const
    return skuList.map(sku => {
      const spend = (rawData ?? []).filter(r => r.sku === sku).reduce((s, r) => s + r.ad_spend, 0)
      const target = targetData.filter(r => r.sku === sku).reduce((s, r) => s + r.daily_ad_spend, 0)
      return { sku, spend, target }
    }).filter(s => s.spend > 0 || s.target > 0)
  }, [rawData, targetData])

  // RoAS revenue metrics
  const ccAdsRevenue    = useMemo(() => (cgData?.conversions ?? []).reduce((s, r) => s + (r.mongo_purchase_ccom_revenue ?? 0), 0), [cgData])
  const totalSalesRevenue = useMemo(() => (cgData?.sales ?? []).reduce((s, r) => s + (r.rev_ccom_ca ?? 0) + (r.rev_ccom_crm ?? 0) + (r.rev_mpsh ?? 0) + (r.rev_d2or ?? 0) + (r.rev_ofls ?? 0), 0), [cgData])

  // Daily RoAS series (total revenue / ad spend per day) + 7-day moving average
  const roasDailySeries = useMemo(() => {
    // Daily revenue from sales
    const revByDate = new Map<string, number>()
    for (const r of cgData?.sales ?? []) {
      const rev = (r.rev_ccom_ca ?? 0) + (r.rev_ccom_crm ?? 0) + (r.rev_mpsh ?? 0) + (r.rev_d2or ?? 0) + (r.rev_ofls ?? 0)
      revByDate.set(r.date, (revByDate.get(r.date) ?? 0) + rev)
    }
    // Daily ad spend from performance
    const spendByDate = new Map<string, number>()
    for (const r of rawData ?? []) {
      spendByDate.set(r.date, (spendByDate.get(r.date) ?? 0) + r.ad_spend)
    }
    // All dates sorted
    const allDates = Array.from(new Set([...revByDate.keys(), ...spendByDate.keys()])).sort()
    // Daily RoAS (raw)
    const daily = allDates.map(date => ({
      date,
      revenue: revByDate.get(date) ?? 0,
      spend: spendByDate.get(date) ?? 0,
      value: (spendByDate.get(date) ?? 0) > 0 ? (revByDate.get(date) ?? 0) / (spendByDate.get(date) ?? 0) : 0,
    }))
    // 14-day moving average (matches bi-weekly reseller payout cycle: DoM 11-16 & 27-31)
    const window = 14
    const ma: { date: string; value: number }[] = []
    for (let i = 0; i < daily.length; i++) {
      const start = Math.max(0, i - window + 1)
      const slice = daily.slice(start, i + 1)
      const totalRev = slice.reduce((s, d) => s + d.revenue, 0)
      const totalSpend = slice.reduce((s, d) => s + d.spend, 0)
      ma.push({ date: daily[i].date, value: totalSpend > 0 ? totalRev / totalSpend : 0 })
    }
    return ma.filter(p => p.value > 0)
  }, [cgData, rawData])

  // CC RoAS daily series (CC ads revenue / ad spend per day) + 7-day moving average
  const ccRoasDailySeries = useMemo(() => {
    // Daily CC revenue from conversions (mongo_purchase_ccom_revenue)
    const revByDate = new Map<string, number>()
    for (const r of cgData?.conversions ?? []) {
      revByDate.set(r.date, (revByDate.get(r.date) ?? 0) + (r.mongo_purchase_ccom_revenue ?? 0))
    }
    // Daily ad spend from performance
    const spendByDate = new Map<string, number>()
    for (const r of rawData ?? []) {
      spendByDate.set(r.date, (spendByDate.get(r.date) ?? 0) + r.ad_spend)
    }
    const allDates = Array.from(new Set([...revByDate.keys(), ...spendByDate.keys()])).sort()
    const daily = allDates.map(date => ({
      date,
      revenue: revByDate.get(date) ?? 0,
      spend: spendByDate.get(date) ?? 0,
    }))
    const window = 14 // 14-day MA (bi-weekly reseller payout cycle)
    const ma: { date: string; value: number }[] = []
    for (let i = 0; i < daily.length; i++) {
      const start = Math.max(0, i - window + 1)
      const slice = daily.slice(start, i + 1)
      const totalRev = slice.reduce((s, d) => s + d.revenue, 0)
      const totalSpend = slice.reduce((s, d) => s + d.spend, 0)
      ma.push({ date: daily[i].date, value: totalSpend > 0 ? totalRev / totalSpend : 0 })
    }
    return ma.filter(p => p.value > 0)
  }, [cgData, rawData])


  // Per-SKU RoAS breakdown (sales revenue vs ad spend)
  const skuRoas = useMemo(() => {
    const skuList = ['MSF', 'MTA', 'MNS', 'M3P'] as const
    return skuList.map(sku => {
      const revenue = (cgData?.sales ?? [])
        .filter(r => r.sku === sku)
        .reduce((s, r) => s + (r.rev_ccom_ca ?? 0) + (r.rev_ccom_crm ?? 0) + (r.rev_mpsh ?? 0) + (r.rev_d2or ?? 0) + (r.rev_ofls ?? 0), 0)
      const spend = (rawData ?? []).filter(r => r.sku === sku).reduce((s, r) => s + r.ad_spend, 0)
      return { sku, revenue, spend, roas: spend > 0 ? revenue / spend : 0 }
    }).filter(s => s.spend > 0 || s.revenue > 0)
  }, [cgData, rawData])

  const totalLeadCcom = useMemo(() => (rawData ?? []).reduce((s, r) => s + r.real_lead_ccom, 0), [rawData])

  const totalLeadD2or = useMemo(() => (rawData ?? []).reduce((s, r) => s + r.real_lead_d2or, 0), [rawData])
  const totalLeadMpsh = useMemo(() => (rawData ?? []).reduce((s, r) => s + r.real_lead_mpsh, 0), [rawData])
  const totalLeadOfls = useMemo(() => (rawData ?? []).reduce((s, r) => s + r.real_lead_ofls, 0), [rawData])

  // Daily CPRL series (grouped by date)
  const cprlSeries = useMemo((): CprlPoint[] => {
    const byDate = new Map<string, { spend: number; leads: number }>()
    for (const r of rawData ?? []) {
      const prev = byDate.get(r.date) ?? { spend: 0, leads: 0 }
      byDate.set(r.date, {
        spend: prev.spend + r.ad_spend,
        leads: prev.leads + r.real_lead_ccom + r.real_lead_d2or + r.real_lead_mpsh + r.real_lead_ofls,
      })
    }
    return Array.from(byDate.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, { spend, leads }]) => ({ date, value: leads > 0 ? spend / leads : 0 }))
      .filter(p => p.value > 0)
  }, [rawData])

  // CPA CC totals + daily series + SKU breakdown
  const totalPurchaseCcom = useMemo(() => (rawData ?? []).reduce((s, r) => s + r.purchase_ccom, 0), [rawData])
  const cpaSeries = useMemo(() => {
    const byDate = new Map<string, { spend: number; purchases: number }>()
    for (const r of rawData ?? []) {
      const prev = byDate.get(r.date) ?? { spend: 0, purchases: 0 }
      byDate.set(r.date, { spend: prev.spend + r.ad_spend, purchases: prev.purchases + r.purchase_ccom })
    }
    const daily = Array.from(byDate.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, v]) => ({ date, ...v }))
    // 7-day rolling MA (smooths weekly Mon/Sat purchase cycle)
    const window = 7
    return daily.map((_, i) => {
      const slice = daily.slice(Math.max(0, i - window + 1), i + 1)
      const totalSpend = slice.reduce((s, d) => s + d.spend, 0)
      const totalPurchases = slice.reduce((s, d) => s + d.purchases, 0)
      return { date: daily[i].date, value: totalPurchases > 0 ? totalSpend / totalPurchases : 0 }
    }).filter(p => p.value > 0)
  }, [rawData])

  const purchaseBySku = useMemo(() => {
    const bySku = new Map<string, number>()
    for (const r of rawData ?? []) {
      bySku.set(r.sku, (bySku.get(r.sku) ?? 0) + r.purchase_ccom)
    }
    return Array.from(bySku.entries())
      .map(([sku, count]) => ({ sku, count }))
      .filter(s => s.count > 0)
      .sort((a, b) => b.count - a.count)
  }, [rawData])

  // ATL metrics: CPM, CTR, First Visit Ratio
  const totalImpressions = useMemo(() => (rawData ?? []).reduce((s, r) => s + r.impressions, 0), [rawData])
  const totalLinkClicks  = useMemo(() => (rawData ?? []).reduce((s, r) => s + r.link_click, 0), [rawData])
  const totalFirstVisit  = useMemo(() => (rawData ?? []).reduce((s, r) => s + (r.ga4_first_visit ?? 0), 0), [rawData])
  const totalPageView    = useMemo(() => (rawData ?? []).reduce((s, r) => s + (r.ga4_page_view ?? 0), 0), [rawData])

  const cpmSeries = useMemo(() => {
    const byDate = new Map<string, { spend: number; impr: number }>()
    for (const r of rawData ?? []) {
      const p = byDate.get(r.date) ?? { spend: 0, impr: 0 }
      byDate.set(r.date, { spend: p.spend + r.ad_spend, impr: p.impr + r.impressions })
    }
    return Array.from(byDate.entries()).sort(([a], [b]) => a.localeCompare(b))
      .map(([date, { spend, impr }]) => ({ date, value: impr > 0 ? (spend / impr) * 1000 : 0 }))
      .filter(p => p.value > 0)
  }, [rawData])

  const ctrSeries = useMemo(() => {
    const byDate = new Map<string, { clicks: number; impr: number }>()
    for (const r of rawData ?? []) {
      const p = byDate.get(r.date) ?? { clicks: 0, impr: 0 }
      byDate.set(r.date, { clicks: p.clicks + r.link_click, impr: p.impr + r.impressions })
    }
    return Array.from(byDate.entries()).sort(([a], [b]) => a.localeCompare(b))
      .map(([date, { clicks, impr }]) => ({ date, value: impr > 0 ? (clicks / impr) * 100 : 0 }))
      .filter(p => p.value > 0)
  }, [rawData])

  const fvSeries = useMemo(() => {
    const byDate = new Map<string, { fv: number; pv: number }>()
    for (const r of rawData ?? []) {
      const p = byDate.get(r.date) ?? { fv: 0, pv: 0 }
      byDate.set(r.date, { fv: p.fv + (r.ga4_first_visit ?? 0), pv: p.pv + (r.ga4_page_view ?? 0) })
    }
    return Array.from(byDate.entries()).sort(([a], [b]) => a.localeCompare(b))
      .map(([date, { fv, pv }]) => ({ date, value: pv > 0 ? (fv / pv) * 100 : 0 }))
      .filter(p => p.value > 0)
  }, [rawData])

  // ── Global averages (used as benchmark target lines in SKU charts) ──
  const globalCtrAvg = useMemo(() => {
    if (ctrSeries.length === 0) return 0
    return ctrSeries.reduce((s, p) => s + p.value, 0) / ctrSeries.length
  }, [ctrSeries])

  const globalLpvoAvg = useMemo(() => {
    const byDate = new Map<string, { vo: number; pv: number }>()
    for (const r of rawData ?? []) {
      const p = byDate.get(r.date) ?? { vo: 0, pv: 0 }
      byDate.set(r.date, { vo: p.vo + (r.ga4_view_offer ?? 0), pv: p.pv + r.ga4_page_view })
    }
    const series = Array.from(byDate.values())
      .map(({ vo, pv }) => pv > 0 ? (vo / pv) * 100 : 0).filter(v => v > 0)
    return series.length > 0 ? series.reduce((s, v) => s + v, 0) / series.length : 0
  }, [rawData])

  const globalVo2lAvg = useMemo(() => {
    const byDate = new Map<string, { leads: number; vo: number }>()
    for (const r of rawData ?? []) {
      const leads = r.real_lead_ccom + r.real_lead_d2or + r.real_lead_mpsh + r.real_lead_ofls
      const p = byDate.get(r.date) ?? { leads: 0, vo: 0 }
      byDate.set(r.date, { leads: p.leads + leads, vo: p.vo + (r.ga4_view_offer ?? 0) })
    }
    const series = Array.from(byDate.values())
      .map(({ leads, vo }) => vo > 0 ? (leads / vo) * 100 : 0).filter(v => v > 0)
    return series.length > 0 ? series.reduce((s, v) => s + v, 0) / series.length : 0
  }, [rawData])

  // ── Per-SKU data (all 4 MNC SKUs computed together) ────────────────────────────────
  const allSkuData = useMemo(() => {
    const skuList = ['MSF', 'MTA', 'MNS', 'M3P'] as const
    type SkuKey = typeof skuList[number]
    type Point = { date: string; value: number }
    type SkuOut = {
      totals: { ctr: number; lpvo: number; vo2l: number; cprl: number; cpaCC: number }
      ctrSeries:  Point[]; lpvoSeries: Point[]; vo2lSeries: Point[]
      cprlSeries: Point[]; cpaSeries:  Point[]
    }
    const out = {} as Record<SkuKey, SkuOut>

    for (const sku of skuList) {
      const rows = (rawData ?? []).filter(r => r.sku === sku)

      // Totals
      let spend = 0, leads = 0, purchase = 0, clicks = 0, impr = 0, vo = 0, pv = 0
      for (const r of rows) {
        spend    += r.ad_spend
        leads    += r.real_lead_ccom + r.real_lead_d2or + r.real_lead_mpsh + r.real_lead_ofls
        purchase += r.purchase_ccom
        clicks   += r.link_click
        impr     += r.impressions
        vo       += (r.ga4_view_offer ?? 0)
        pv       += r.ga4_page_view
      }

      // Daily series helpers
      const byDate = <T,>(init: T, acc: (cur: T, r: typeof rows[0]) => T) => {
        const m = new Map<string, T>()
        for (const r of rows) m.set(r.date, acc(m.get(r.date) ?? init, r))
        return Array.from(m.entries()).sort(([a], [b]) => a.localeCompare(b))
      }

      out[sku] = {
        totals: {
          ctr:   impr > 0 ? (clicks / impr) * 100      : 0,
          lpvo:  pv   > 0 ? (vo     / pv)   * 100      : 0,
          vo2l:  vo   > 0 ? (leads  / vo)   * 100      : 0,
          cprl:  leads    > 0 ? spend / leads           : 0,
          cpaCC: purchase > 0 ? spend / purchase        : 0,
        },
        ctrSeries: byDate({ c: 0, i: 0 }, (p, r) => ({ c: p.c + r.link_click, i: p.i + r.impressions }))
          .map(([date, { c, i }]) => ({ date, value: i > 0 ? (c / i) * 100 : 0 })).filter(p => p.value > 0),
        cprlSeries: byDate({ s: 0, l: 0 }, (p, r) => ({ s: p.s + r.ad_spend, l: p.l + r.real_lead_ccom + r.real_lead_d2or + r.real_lead_mpsh + r.real_lead_ofls }))
          .map(([date, { s, l }]) => ({ date, value: l > 0 ? s / l : 0 })).filter(p => p.value > 0),
        cpaSeries: (() => {
          const daily = byDate({ s: 0, p: 0 }, (p, r) => ({ s: p.s + r.ad_spend, p: p.p + r.purchase_ccom }))
            .map(([date, { s, p }]) => ({ date, spend: s, purchases: p }))
          const win = 7
          return daily.map((_, i) => {
            const slice = daily.slice(Math.max(0, i - win + 1), i + 1)
            const totalSpend = slice.reduce((s, d) => s + d.spend, 0)
            const totalPurchases = slice.reduce((s, d) => s + d.purchases, 0)
            return { date: daily[i].date, value: totalPurchases > 0 ? totalSpend / totalPurchases : 0 }
          }).filter(p => p.value > 0)
        })(),
        lpvoSeries: byDate({ vo: 0, pv: 0 }, (p, r) => ({ vo: p.vo + (r.ga4_view_offer ?? 0), pv: p.pv + r.ga4_page_view }))
          .map(([date, { vo, pv }]) => ({ date, value: pv > 0 ? (vo / pv) * 100 : 0 })).filter(p => p.value > 0),
        vo2lSeries: byDate({ l: 0, vo: 0 }, (p, r) => ({ l: p.l + r.real_lead_ccom + r.real_lead_d2or + r.real_lead_mpsh + r.real_lead_ofls, vo: p.vo + (r.ga4_view_offer ?? 0) }))
          .map(([date, { l, vo }]) => ({ date, value: vo > 0 ? (l / vo) * 100 : 0 })).filter(p => p.value > 0),
      }
    }
    return out
  }, [rawData])

  // ── Per-SKU budget data ───────────────────────────────────────────────────────
  const campaignBudgetData = useMemo(() => cgData?.campaign_budgets ?? [], [cgData])
  const skuBudgets = useMemo(() => {
    const skuList = ['MSF', 'MTA', 'MNS', 'M3P'] as const
    const out = {} as Record<string, { spend: number; periodBudget: number; dailyBudget: number; targetDailyBudget: number; budgetDate: string }>
    for (const sku of skuList) {
      const rows           = rawData.filter(r => r.sku === sku)
      const spend          = rows.reduce((s, r) => s + r.ad_spend, 0)
      // Period budget = SUM of daily targets in range (matches global totalTarget logic)
      const periodBudget   = targetData.filter(r => r.sku === sku).reduce((s, r) => s + r.daily_ad_spend, 0)
      const latestTarget   = latestTargetBySku.find(r => r.sku === sku)
      const targetDailyBud = latestTarget?.daily_ad_spend ?? 0
      // Config = sum of active campaign daily_budget for this SKU (from campaign_budgets table)
      const campaignDailyBud = campaignBudgetData.filter(r => r.sku === sku).reduce((s, r) => s + r.daily_budget, 0)
      out[sku] = {
        spend,
        periodBudget,
        dailyBudget: campaignDailyBud,       // Config — from campaign_budgets
        targetDailyBudget: targetDailyBud,   // Target — from target_ad_spend
        budgetDate: latestTarget?.date ?? '',
      }
    }
    return out
  }, [rawData, targetData, latestTargetBySku, campaignBudgetData])




  // Period budget = SUM of all daily target rows in the date range
  const periodBudget = totalTarget
  const barPct = periodBudget > 0 ? Math.min((totalSpend / periodBudget) * 100, 100) : 0

  const statusColor = barPct === 0 ? '#818cf8'
    : barPct > 115  ? '#f87171'
    : barPct >= 105 ? '#fbbf24'
    : barPct >= 95  ? '#34d399'
    : barPct >= 85  ? '#fbbf24'
    : '#f87171'

  const statusLabel = barPct === 0 ? 'No Data'
    : barPct > 115  ? '🔴 Over Budget'
    : barPct >= 105 ? '🟡 Slightly Over'
    : barPct >= 95  ? '🟢 On Track'
    : barPct >= 85  ? '🟡 Slightly Under'
    : '🔴 Far Behind'

  // suppress unused vars
  void fmtFull; void fmtIDR; void totalTarget; void statusColor; void statusLabel
  void budgetSettingDate


  // ── Loading screen ────────────────────────────────────────────────────────────
  const isInitialLoad = cgLoading || (cgFetching && !cgData)
  if (isInitialLoad || !activeBrand) {
    const steps = [
      { label: 'Connecting to D1 database', done: !!activeBrand },
      { label: 'Fetching ad performance', done: false },
      { label: 'Joining GA4 + MongoDB data', done: false },
      { label: 'Computing KPIs & funnel metrics', done: false },
    ]
    return (
      <div style={{
        minHeight: '100vh',
        background: '#0d0e12',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'Inter, system-ui, sans-serif',
        color: '#ffffff',
        flexDirection: 'column',
        gap: 0,
        zoom: 0.8,
      }}>
        {/* Outer glow ring */}
        <div style={{ position: 'relative', width: 100, height: 100, marginBottom: 40 }}>
          {/* Pulse rings */}
          {[0, 1, 2].map(i => (
            <div key={i} style={{
              position: 'absolute',
              inset: 0,
              borderRadius: '50%',
              border: '1.5px solid rgba(129, 140, 248, 0.25)',
              animation: `cgPulse 2s ease-out ${i * 0.6}s infinite`,
            }} />
          ))}
          {/* Center spinner */}
          <div style={{
            position: 'absolute',
            inset: 14,
            borderRadius: '50%',
            border: '2px solid rgba(129, 140, 248, 0.15)',
            borderTopColor: '#818cf8',
            borderRightColor: '#38bdf8',
            animation: 'cgSpin 1s linear infinite',
          }} />
          {/* Inner dot */}
          <div style={{
            position: 'absolute',
            inset: '50%',
            transform: 'translate(-50%, -50%)',
            width: 10,
            height: 10,
            borderRadius: '50%',
            background: 'radial-gradient(circle, #818cf8, #38bdf8)',
            boxShadow: '0 0 16px #818cf8cc',
          }} />
        </div>

        {/* Title */}
        <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', color: '#818cf8', marginBottom: 6 }}>
          Consumer Goods Dashboard
        </div>
        <div style={{ fontSize: 22, fontWeight: 700, color: '#ffffff', marginBottom: 8 }}>
          Loading data…
        </div>
        <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.35)', marginBottom: 40 }}>
          {activeBrand ? `Fetching ${activeBrand} — ${activeFrom} → ${activeTo}` : 'Resolving brand bounds…'}
        </div>

        {/* Step checklist */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, width: 280 }}>
          {steps.map((step, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{
                width: 18, height: 18, borderRadius: '50%', flexShrink: 0,
                border: step.done ? 'none' : '1.5px solid rgba(129,140,248,0.4)',
                background: step.done ? 'rgba(52, 211, 153, 0.2)' : 'transparent',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                position: 'relative',
              }}>
                {step.done
                  ? <svg width="10" height="10" viewBox="0 0 12 12" fill="none"><polyline points="2,6 5,9 10,3" stroke="#34d399" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  : <div style={{
                      width: 6, height: 6, borderRadius: '50%',
                      background: '#818cf8',
                      animation: `cgBlink 1.4s ease-in-out ${i * 0.25}s infinite`,
                    }} />
                }
              </div>
              <span style={{
                fontSize: 13,
                color: step.done ? 'rgba(255,255,255,0.55)' : 'rgba(255,255,255,0.85)',
                textDecoration: step.done ? 'line-through' : 'none',
              }}>
                {step.label}
              </span>
            </div>
          ))}
        </div>

        {/* Animated scan bar */}
        <div style={{ marginTop: 44, width: 280, height: 3, background: 'rgba(255,255,255,0.06)', borderRadius: 99, overflow: 'hidden', position: 'relative' }}>
          <div style={{
            position: 'absolute',
            top: 0, left: 0,
            height: '100%',
            width: '40%',
            background: 'linear-gradient(90deg, transparent, #818cf8, #38bdf8, transparent)',
            borderRadius: 99,
            animation: 'cgScan 1.6s ease-in-out infinite',
          }} />
        </div>

        {/* Keyframe styles */}
        <style>{`
          @keyframes cgSpin {
            to { transform: rotate(360deg); }
          }
          @keyframes cgPulse {
            0%   { transform: scale(1);    opacity: 0.6; }
            100% { transform: scale(2.4);  opacity: 0; }
          }
          @keyframes cgBlink {
            0%, 100% { opacity: 0.3; transform: scale(0.8); }
            50%       { opacity: 1;   transform: scale(1.2); }
          }
          @keyframes cgScan {
            0%   { left: -40%; }
            100% { left: 140%; }
          }
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
          <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#818cf8', boxShadow: '0 0 6px #818cf8aa' }} />
          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', color: '#818cf8', textTransform: 'uppercase' }}>Consumer Goods Dashboard</span>
        </div>
        <select value={activeBrand} onChange={e => setBrand(e.target.value)}
          style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#ffffff', padding: '6px 10px', fontSize: 13 }}>
          {brands.map(b => <option key={b} value={b}>{b}</option>)}
        </select>
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
        {/* Refresh button */}
        <button
          onClick={handleRefresh}
          disabled={isRefreshing}
          title="Refresh — busts Cloudflare cache"
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

      {/* ── Shared column ── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 28, width: '100%' }}>

        {/* Top row: Ad Spend Health + Total RoAS */}
        <div style={{ display: 'flex', gap: 28, alignItems: 'stretch', flexWrap: 'wrap' }}>

          {/* Ad Spend Health Card */}
          <AdSpendHealthCard
            totalSpend={totalSpend}
            periodBudget={periodBudget}
            dailyBudget={dailyBudget}
            campaignBudgetTotal={campaignBudgetTotal}
            budgetDate={campaignBudgetDate || budgetSettingDate}
            skuSpend={skuSpend}
          />

          {/* Total RoAS card */}
          <TotalRoasCard
            totalSalesRevenue={totalSalesRevenue}
            totalAdSpend={totalSpend}
            skuRoas={skuRoas}
            roasSeries={roasDailySeries}
            changelog={filteredChangelog}
          />

        </div>

        {/* Cards row */}
        <div style={{ display: 'flex', gap: 28, alignItems: 'stretch', flexWrap: 'wrap' }}>

          {/* Ads Performance Health Card */}
          <AdsPerformanceHealthCard
            totalSpend={totalSpend}
            realLeadCcom={totalLeadCcom}
            realLeadD2or={totalLeadD2or}
            realLeadMpsh={totalLeadMpsh}
            realLeadOfls={totalLeadOfls}
            cprlSeries={cprlSeries}
            changelog={filteredChangelog}
            skuCprl={(['MSF', 'MTA', 'MNS', 'M3P'] as const).map((sku): SkuCprlRow => {
              const d = allSkuData[sku]
              const rows = (rawData ?? []).filter(r => r.sku === sku)
              const leads = rows.reduce((s, r) => s + r.real_lead_ccom + r.real_lead_d2or + r.real_lead_mpsh + r.real_lead_ofls, 0)
              return { sku, cprl: d.totals.cprl, leads }
            })}
          />

          {/* Leads Quality Card */}
          <LeadsQualityCard
            totalSpend={totalSpend}
            purchaseCcom={totalPurchaseCcom}
            purchaseBySku={purchaseBySku}
            cpaSeries={cpaSeries}
            changelog={filteredChangelog}
            skuCpaCC={(['MSF', 'MTA', 'MNS', 'M3P'] as const).map((sku): SkuCpaCCRow => {
              const d = allSkuData[sku]
              const rows = (rawData ?? []).filter(r => r.sku === sku)
              const purchases = rows.reduce((s, r) => s + r.purchase_ccom, 0)
              return { sku, cpaCC: d.totals.cpaCC, purchases }
            })}
          />

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

        {/* SKU Performance Cards — 2×2 grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 40, marginTop: 20 }}>

          {([
            { sku: 'MSF', productName: 'Superfood',  skuColor: '#f97316', imageSrc: superfoodImg,   cpaTarget: 2_000_000 },
            { sku: 'MTA', productName: 'Metafiber',  skuColor: '#818cf8', imageSrc: metafiberImg,   cpaTarget: 2_000_000 },
            { sku: 'MNS', productName: 'Nightsure',  skuColor: '#34d399', imageSrc: nightsureImg,   cpaTarget: 2_000_000 },
            { sku: 'M3P', productName: '3Peptide',   skuColor: '#f472b6', imageSrc: threePeptideImg, cpaTarget: 2_000_000 },
          ] as const).map(({ sku, productName, skuColor, imageSrc, cpaTarget }) => {
            const d = allSkuData[sku as 'MSF' | 'MTA' | 'MNS' | 'M3P']
            if (!d) return null
            return (
              <SkuPerformanceCard
                key={sku}
                sku={sku}
                productName={productName}
                skuColor={skuColor}
                imageSrc={imageSrc}
                from={activeFrom}
                to={activeTo}
                totalCtr={d.totals.ctr}
                totalLpvo={d.totals.lpvo}
                totalVo2l={d.totals.vo2l}
                totalCprl={d.totals.cprl}
                totalCpaCC={d.totals.cpaCC}
                ctrSeries={d.ctrSeries}
                lpvoSeries={d.lpvoSeries}
                vo2lSeries={d.vo2lSeries}
                cprlSeries={d.cprlSeries}
                cpaSeries={d.cpaSeries}
                globalCtrAvg={globalCtrAvg}
                globalLpvoAvg={globalLpvoAvg}
                globalVo2lAvg={globalVo2lAvg}
                cprlTarget={150_000}
                cpaTarget={cpaTarget}
                changelog={filteredChangelog}
                skuSpend={skuBudgets[sku]?.spend ?? 0}
                skuPeriodBudget={skuBudgets[sku]?.periodBudget ?? 0}
                skuDailyBudget={skuBudgets[sku]?.dailyBudget ?? 0}
                skuTargetDailyBudget={skuBudgets[sku]?.targetDailyBudget ?? 0}
                budgetDate={skuBudgets[sku]?.budgetDate}
                totalRoas={skuRoas.find(r => r.sku === sku)?.roas ?? 0}
                roasTarget={6.59}
              />
            )
          })}
        </div>

      </div>

    </div>
  )
}
