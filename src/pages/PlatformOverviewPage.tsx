/**
 * PlatformOverviewPage — Per-platform performance cards
 * Uses the same /v2/consumer-goods endpoint as Consumer Goods Dashboard,
 * but aggregates by traffic_source instead of sku.
 * Uses CC RoAS (mongo_purchase_ccom_revenue / ad_spend) instead of Total RoAS.
 */
import React, { useState, useMemo, useEffect, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { D1_WORKER_URL } from '../config/dataSource'
import { dateStr, capToH2, PRESETS } from './ProductPerformancePage'
import { fmtRp, fmtRpM } from '../utils/format'
import { optimizeBudget } from '../utils/budgetOptimizer'
import { SkuPerformanceCard } from '../components/cards/SkuPerformanceCard'
import { AdSpendHealthCard } from '../components/cards/AdSpendHealthCard'
import { SKU_COLORS } from '../utils/skuColors'
import metaAdsImg   from '../assets/ads_platform_images/Meta Ads.webp'
import googleAdsImg from '../assets/ads_platform_images/Google Ads.webp'
import searchAdsImg from '../assets/ads_platform_images/Google Search Ads.webp'

// ── Types (same as ConsumerGoodsDashboard) ────────────────────────────────────────────
interface AdPerfRow    { date: string; traffic_source: string; ads_platform_campaign_id: string; sku: string; ad_spend: number; impressions: number; link_click: number }
interface Ga4Row       { date: string; traffic_source: string; sku: string; ads_platform_campaign_id: string; ga4_first_visit: number; ga4_page_view: number; ga4_view_offer: number }
interface ConvRow      { date: string; traffic_source: string; sku: string; ads_platform_campaign_id: string; mongo_real_lead_ccom: number; mongo_real_lead_d2or: number; mongo_real_lead_mpsh: number; mongo_real_lead_ofls: number; mongo_purchase_ccom: number; mongo_purchase_ccom_revenue: number; mongo_form_submission?: number; mongo_form_conversion?: number }
interface BrandBounds  { brand: string; earliest: string; latest: string; skus: string[] }
interface CampaignBudgetRow { date: string; traffic_source: string; campaign_name: string; sku: string; daily_budget: number }
interface TargetRow { date: string; sku: string; daily_ad_spend: number }
interface ConsumerGoodsData {
  performance: AdPerfRow[]; campaign_budgets: CampaignBudgetRow[]; targets: TargetRow[]
  ga4: Ga4Row[]; conversions: ConvRow[]
  changelog: { date: string; brand: string; sku: string; platform: string; title: string; changelist: string | null }[]
  campaign_dimension: CampaignDimRow[]; sales: unknown[]
}
interface CampaignDimRow { campaign_id: string; traffic_source: string; sku: string; funnel: string; campaign_name: string }

// Unified row merged by (date × platform)
interface PlatAggRow {
  date: string; platform: string
  ad_spend: number; impressions: number; link_click: number
  real_lead_ccom: number; real_lead_d2or: number; real_lead_mpsh: number; real_lead_ofls: number
  purchase_ccom: number; purchase_ccom_revenue: number
  ga4_first_visit: number; ga4_page_view: number; ga4_view_offer: number
  form_submission: number; form_conversion: number
}

// Platform config
const PLATFORMS = [
  { id: 'META', label: 'Meta Ads',          color: '#60a5fa', imageSrc: metaAdsImg },
  { id: 'DGEN', label: 'Demand Gen',        color: '#34d399', imageSrc: googleAdsImg },
  { id: 'SRCH', label: 'Google Search Ads', color: '#fbbf24', imageSrc: searchAdsImg },
] as const

export function PlatformOverviewPage({ brand: fixedBrand }: { brand?: string } = {}) {
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
  const brands = useMemo(() => {
    const all = brandBounds?.map(b => b.brand) ?? []
    return fixedBrand ? all.filter(b => b === fixedBrand) : all
  }, [brandBounds, fixedBrand])

  const [brand, setBrand] = useState(fixedBrand ?? '')
  useEffect(() => { if (brands.length > 0 && !brand) setBrand(brands[0]) }, [brands, brand])
  const activeBrand = brand || brands[0] || ''
  const activeBounds = useMemo(() => brandBounds?.find(b => b.brand === activeBrand), [brandBounds, activeBrand])
  const skus = useMemo(() => activeBounds?.skus ?? [], [activeBounds])
  const skuOrder = ['MSF', 'MTA', 'MNS', 'M3P']
  const orderedSkus = useMemo(() => skuOrder.filter(s => skus.includes(s)).concat(skus.filter(s => !skuOrder.includes(s))), [skus])
  const [selectedSku, setSelectedSku] = useState('')
  useEffect(() => { if (orderedSkus.length > 0 && !orderedSkus.includes(selectedSku)) setSelectedSku(orderedSkus[0]) }, [orderedSkus, selectedSku])

  // Campaign table sort state
  type SortCol = 'name' | 'funnel' | 'cprl' | 'cpaCC' | 'dailyBudget'
  const [campSortCol, setCampSortCol] = useState<SortCol>('name')
  const [campSortAsc, setCampSortAsc] = useState(true)
  const toggleCampSort = (col: SortCol) => {
    if (campSortCol === col) setCampSortAsc(prev => !prev)
    else { setCampSortCol(col); setCampSortAsc(true) }
  }

  // Budget optimizer state
  type OptTarget = 'cprl' | 'cpaCC'
  const [optTarget, setOptTarget] = useState<OptTarget>('cprl')
  const [optStrength, setOptStrength] = useState(100) // 0-100%
  const [optScalePct, setOptScalePct] = useState(0) // -50 to +100
  const [optNewBudget, setOptNewBudget] = useState<number | null>(null)
  const [optBaseBudget, setOptBaseBudget] = useState<number | null>(null)
  const [optResults, setOptResults] = useState<{ name: string; ts: string; funnel: string; suggestedBudget: number; predictedCprl: number; predictedCpaCC: number }[] | null>(null)

  // Sync base budget when SKU changes
  const syncBaseBudget = (base: number) => {
    if (optBaseBudget !== base) {
      setOptBaseBudget(base)
      setOptScalePct(0)
      setOptNewBudget(base)
      setOptResults(null)
    }
  }

  const MA_BUFFER_DAYS = 30
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

  const fetchFrom = useMemo(() => {
    if (!activeFrom) return activeFrom
    const d = new Date(activeFrom + 'T00:00:00')
    d.setDate(d.getDate() - MA_BUFFER_DAYS)
    // Clamp to earliest available
    const earliest = activeBounds?.earliest ?? activeFrom
    const buf = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
    return buf < earliest ? earliest : buf
  }, [activeFrom, activeBounds])

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

  // ── Data fetch (same endpoint as Consumer Goods) ──
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
    queryKey: ['consumer-goods', fetchFrom, activeTo, activeBrand, refreshNonce],
    queryFn: async () => {
      if (!fetchFrom || !activeTo || !activeBrand) return null
      const bust = refreshNonce > 0 ? `&_r=${refreshNonce}` : ''
      const res = await fetch(
        `${D1_WORKER_URL}/v2/consumer-goods?brand=${activeBrand}&from=${fetchFrom}&to=${activeTo}${bust}`
      )
      if (!res.ok) throw new Error('consumer-goods fetch failed')
      const data = res.json() as Promise<ConsumerGoodsData>
      setIsRefreshing(false)
      if (spinRef.current) { clearInterval(spinRef.current); spinRef.current = null }
      return data
    },
    enabled: !!fetchFrom && !!activeTo && !!activeBrand,
    staleTime: 5 * 60_000,
  })

  // ── Aggregate by (date × platform) ──
  const rawData = useMemo((): PlatAggRow[] => {
    const zero = (): PlatAggRow => ({
      date: '', platform: '',
      ad_spend: 0, impressions: 0, link_click: 0,
      real_lead_ccom: 0, real_lead_d2or: 0, real_lead_mpsh: 0, real_lead_ofls: 0,
      purchase_ccom: 0, purchase_ccom_revenue: 0,
      ga4_first_visit: 0, ga4_page_view: 0, ga4_view_offer: 0,
      form_submission: 0, form_conversion: 0,
    })
    const map = new Map<string, PlatAggRow>()
    const k = (date: string, plat: string) => `${date}|${plat}`

    for (const r of cgData?.performance ?? []) {
      const plat = (r.traffic_source ?? '').toUpperCase()
      const key = k(r.date, plat)
      const p = map.get(key) ?? { ...zero(), date: r.date, platform: plat }
      map.set(key, { ...p, ad_spend: p.ad_spend + (r.ad_spend ?? 0), impressions: p.impressions + (r.impressions ?? 0), link_click: p.link_click + (r.link_click ?? 0) })
    }
    for (const r of cgData?.ga4 ?? []) {
      const plat = (r.traffic_source ?? '').toUpperCase()
      const key = k(r.date, plat)
      const p = map.get(key) ?? { ...zero(), date: r.date, platform: plat }
      map.set(key, { ...p, ga4_first_visit: p.ga4_first_visit + (r.ga4_first_visit ?? 0), ga4_page_view: p.ga4_page_view + (r.ga4_page_view ?? 0), ga4_view_offer: p.ga4_view_offer + (r.ga4_view_offer ?? 0) })
    }
    for (const r of cgData?.conversions ?? []) {
      const plat = (r.traffic_source ?? '').toUpperCase()
      const key = k(r.date, plat)
      const p = map.get(key) ?? { ...zero(), date: r.date, platform: plat }
      map.set(key, { ...p,
        real_lead_ccom: p.real_lead_ccom + (r.mongo_real_lead_ccom ?? 0),
        real_lead_d2or: p.real_lead_d2or + (r.mongo_real_lead_d2or ?? 0),
        real_lead_mpsh: p.real_lead_mpsh + (r.mongo_real_lead_mpsh ?? 0),
        real_lead_ofls: p.real_lead_ofls + (r.mongo_real_lead_ofls ?? 0),
        purchase_ccom:  p.purchase_ccom  + (r.mongo_purchase_ccom ?? 0),
        purchase_ccom_revenue: p.purchase_ccom_revenue + (r.mongo_purchase_ccom_revenue ?? 0),
        form_submission: p.form_submission + (r.mongo_form_submission ?? 0),
        form_conversion: p.form_conversion + (r.mongo_form_conversion ?? 0),
      })
    }
    return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date))
  }, [cgData])

  const filteredChangelog = useMemo(() => cgData?.changelog ?? [], [cgData])

  // ── Per-platform computed metrics (same shape as allSkuData in ConsumerGoodsDashboard) ──
  const allPlatformData = useMemo(() => {
    if (!rawData.length) return {} as Record<string, PlatOut>
    const isMCI = activeBrand === 'MCI'
    type Point = { date: string; value: number }
    type PlatOut = {
      totals: { ctr: number; lpvo: number; vo2l: number; cprl: number; cpaCC: number; ccRoas: number }
      ctrSeries: Point[]; lpvoSeries: Point[]; vo2lSeries: Point[]
      cprlSeries: Point[]; cpaSeries: Point[]; ccRoasSeries: Point[]
      totalSpend: number
    }
    const out: Record<string, PlatOut> = {}

    for (const plat of PLATFORMS) {
      const rows = rawData.filter(r => r.platform === plat.id)

      // Totals
      let spend = 0, leads = 0, purchase = 0, ccRevenue = 0, clicks = 0, impr = 0, vo = 0, pv = 0
      let formSubs = 0, formConv = 0
      for (const r of rows.filter(r => r.date >= activeFrom && r.date <= activeTo)) {
        spend    += r.ad_spend
        leads    += r.real_lead_ccom + r.real_lead_d2or + r.real_lead_mpsh + r.real_lead_ofls
        purchase += r.purchase_ccom
        ccRevenue += r.purchase_ccom_revenue
        clicks   += r.link_click
        impr     += r.impressions
        vo       += r.ga4_view_offer
        pv       += r.ga4_page_view
        formSubs += r.form_submission
        formConv += r.form_conversion
      }

      // Daily series helper
      const byDate = <T,>(init: T, acc: (cur: T, r: PlatAggRow) => T) => {
        const m = new Map<string, T>()
        for (const r of rows) m.set(r.date, acc(m.get(r.date) ?? init, r))
        return Array.from(m.entries()).sort(([a], [b]) => a.localeCompare(b))
      }

      // For MCI: CPRL slot = CPR (spend / form_submission), CPA slot = CPV (spend / form_conversion), RoAS = empty
      const cprlTotal = isMCI
        ? (formSubs > 0 ? spend / formSubs : 0)
        : (leads > 0 ? spend / leads : 0)
      const cpaTotal = isMCI
        ? (formConv > 0 ? spend / formConv : 0)
        : (purchase > 0 ? spend / purchase : 0)

      out[plat.id] = {
        totalSpend: spend,
        totals: {
          ctr:    impr > 0 ? (clicks / impr) * 100 : 0,
          lpvo:   pv   > 0 ? (vo     / pv)   * 100 : 0,
          vo2l:   isMCI ? (vo > 0 ? (formSubs / vo) * 100 : 0) : (vo > 0 ? (leads / vo) * 100 : 0),
          cprl:   cprlTotal,
          cpaCC:  cpaTotal,
          ccRoas: isMCI ? (formSubs > 0 ? (formConv / formSubs) * 100 : 0) : (spend > 0 ? ccRevenue / spend : 0),
        },
        ctrSeries: byDate({ c: 0, i: 0 }, (p, r) => ({ c: p.c + r.link_click, i: p.i + r.impressions }))
          .map(([date, { c, i }]) => ({ date, value: i > 0 ? (c / i) * 100 : 0 })).filter(p => p.value > 0 && p.date >= activeFrom),
        cprlSeries: isMCI
          ? (() => {
              const daily = byDate({ s: 0, f: 0 }, (p, r) => ({ s: p.s + r.ad_spend, f: p.f + r.form_submission }))
                .map(([date, { s, f }]) => ({ date, spend: s, subs: f }))
              return daily.map((_, i) => {
                const slice = daily.slice(Math.max(0, i - 6), i + 1)
                const ts = slice.reduce((s, d) => s + d.spend, 0)
                const tf = slice.reduce((s, d) => s + d.subs, 0)
                return { date: daily[i].date, value: tf > 0 ? ts / tf : 0 }
              }).filter(p => p.value > 0 && p.date >= activeFrom)
            })()
          : byDate({ s: 0, l: 0 }, (p, r) => ({ s: p.s + r.ad_spend, l: p.l + r.real_lead_ccom + r.real_lead_d2or + r.real_lead_mpsh + r.real_lead_ofls }))
              .map(([date, { s, l }]) => ({ date, value: l > 0 ? s / l : 0 })).filter(p => p.value > 0 && p.date >= activeFrom),
        cpaSeries: (() => {
          const daily = isMCI
            ? byDate({ s: 0, fc: 0 }, (p, r) => ({ s: p.s + r.ad_spend, fc: p.fc + r.form_conversion }))
                .map(([date, { s, fc }]) => ({ date, spend: s, purchases: fc }))
            : byDate({ s: 0, p: 0 }, (p, r) => ({ s: p.s + r.ad_spend, p: p.p + r.purchase_ccom }))
                .map(([date, { s, p }]) => ({ date, spend: s, purchases: p }))
          const win = isMCI ? 21 : 7
          return daily.map((_, i) => {
            const slice = daily.slice(Math.max(0, i - win + 1), i + 1)
            const totalSpend = slice.reduce((s, d) => s + d.spend, 0)
            const totalPurchases = slice.reduce((s, d) => s + d.purchases, 0)
            return { date: daily[i].date, value: totalPurchases > 0 ? totalSpend / totalPurchases : 0 }
          }).filter(p => p.value > 0 && p.date >= activeFrom)
        })(),
        lpvoSeries: byDate({ vo: 0, pv: 0 }, (p, r) => ({ vo: p.vo + r.ga4_view_offer, pv: p.pv + r.ga4_page_view }))
          .map(([date, { vo, pv }]) => ({ date, value: pv > 0 ? (vo / pv) * 100 : 0 })).filter(p => p.value > 0 && p.date >= activeFrom),
        vo2lSeries: isMCI
          ? byDate({ f: 0, vo: 0 }, (p, r) => ({ f: p.f + r.form_submission, vo: p.vo + r.ga4_view_offer }))
              .map(([date, { f, vo }]) => ({ date, value: vo > 0 ? (f / vo) * 100 : 0 })).filter(p => p.value > 0 && p.date >= activeFrom)
          : byDate({ l: 0, vo: 0 }, (p, r) => ({ l: p.l + r.real_lead_ccom + r.real_lead_d2or + r.real_lead_mpsh + r.real_lead_ofls, vo: p.vo + r.ga4_view_offer }))
              .map(([date, { l, vo }]) => ({ date, value: vo > 0 ? (l / vo) * 100 : 0 })).filter(p => p.value > 0 && p.date >= activeFrom),
        ccRoasSeries: isMCI
          ? byDate({ fs: 0, fc: 0 }, (p, r) => ({ fs: p.fs + r.form_submission, fc: p.fc + r.form_conversion }))
              .map(([date, { fs, fc }]) => ({ date, value: fs > 0 ? (fc / fs) * 100 : 0 })).filter(p => p.value > 0 && p.date >= activeFrom)
          : (() => {
          const daily = byDate({ rev: 0, s: 0 }, (p, r) => ({ rev: p.rev + r.purchase_ccom_revenue, s: p.s + r.ad_spend }))
            .map(([date, { rev, s }]) => ({ date, rev, spend: s }))
          const win = 7
          return daily.map((_, i) => {
            const slice = daily.slice(Math.max(0, i - win + 1), i + 1)
            const totalRev = slice.reduce((s, d) => s + d.rev, 0)
            const totalSpend = slice.reduce((s, d) => s + d.spend, 0)
            return { date: daily[i].date, value: totalSpend > 0 ? totalRev / totalSpend : 0 }
          }).filter(p => p.value > 0 && p.date >= activeFrom)
        })(),
      }
    }
    return out
  }, [rawData, activeBrand, activeFrom, activeTo])

  // ── Global averages (cross-platform benchmarks for target lines) ──
  const globalCtrAvg = useMemo(() => {
    const totals = rawData.reduce((a, r) => ({ c: a.c + r.link_click, i: a.i + r.impressions }), { c: 0, i: 0 })
    return totals.i > 0 ? (totals.c / totals.i) * 100 : 0
  }, [rawData])

  const globalLpvoAvg = useMemo(() => {
    const totals = rawData.reduce((a, r) => ({ vo: a.vo + r.ga4_view_offer, pv: a.pv + r.ga4_page_view }), { vo: 0, pv: 0 })
    return totals.pv > 0 ? (totals.vo / totals.pv) * 100 : 0
  }, [rawData])

  const globalVo2lAvg = useMemo(() => {
    const totals = rawData.reduce((a, r) => {
      const leads = r.real_lead_ccom + r.real_lead_d2or + r.real_lead_mpsh + r.real_lead_ofls
      return { l: a.l + leads, vo: a.vo + r.ga4_view_offer }
    }, { l: 0, vo: 0 })
    return totals.vo > 0 ? (totals.l / totals.vo) * 100 : 0
  }, [rawData])

  // Discover which platforms actually have data
  const activePlatforms = useMemo(() => {
    return PLATFORMS.filter(p => {
      const d = allPlatformData[p.id]
      return d && d.totalSpend > 0
    })
  }, [allPlatformData])

  // ── Loading screen ──
  const isInitialLoad = cgLoading || (cgFetching && !cgData)
  if (isInitialLoad || !activeBrand) {
    const steps = [
      { label: 'Connecting to D1 database', done: !!activeBrand },
      { label: 'Fetching platform data', done: false },
      { label: 'Aggregating by platform', done: false },
    ]
    return (
      <div style={{
        minHeight: '100vh', background: '#0d0e12',
        padding: '32px 32px 80px', fontFamily: 'Inter, system-ui, sans-serif',
        color: '#ffffff', zoom: 0.8,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <div style={{ maxWidth: 340, width: '100%' }}>
          <div style={{ fontSize: 18, fontWeight: 800, color: '#818cf8', letterSpacing: '-0.03em', marginBottom: 24, textAlign: 'center' }}>
            Platform Overview
          </div>
          {steps.map((s, i) => (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14,
              fontSize: 13, color: s.done ? '#34d399' : 'rgba(255,255,255,0.4)',
            }}>
              <div style={{
                width: 20, height: 20, borderRadius: '50%',
                border: `2px solid ${s.done ? '#34d399' : 'rgba(255,255,255,0.15)'}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 10, color: s.done ? '#34d399' : 'rgba(255,255,255,0.2)',
              }}>
                {s.done ? '✓' : i + 1}
              </div>
              {s.label}
            </div>
          ))}
          <div style={{
            marginTop: 20, height: 3, borderRadius: 2,
            background: 'rgba(255,255,255,0.06)', overflow: 'hidden',
          }}>
            <div style={{
              height: '100%', background: '#818cf8', borderRadius: 2,
              animation: 'loading-bar 1.5s ease-in-out infinite',
              width: '40%',
            }} />
          </div>
        </div>
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
          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', color: '#818cf8', textTransform: 'uppercase' }}>Platform Overview</span>
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

      {/* ── Platform Cards ── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 28, width: '100%' }}>
        {(() => {
          const totalSpendAllPlatforms = activePlatforms.reduce((sum, { id }) => sum + (allPlatformData[id]?.totalSpend ?? 0), 0)

          // Per-platform daily budgets (sum of active campaign budgets per traffic_source)
          const budgets = cgData?.campaign_budgets ?? []
          const platformBudgets: Record<string, number> = {}
          for (const b of budgets) {
            const ts = (b.traffic_source ?? '').toUpperCase()
            platformBudgets[ts] = (platformBudgets[ts] ?? 0) + (b.daily_budget ?? 0)
          }
          const totalDailyBudget = Object.values(platformBudgets).reduce((s, v) => s + v, 0)

          return (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 40 }}>
          {activePlatforms.map(({ id, label, color, imageSrc }) => {
            const d = allPlatformData[id]
            if (!d) return null
            return (
              <SkuPerformanceCard
                key={id}
                sku={id}
                skuLabel={id}
                productName={label}
                skuColor={color}
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
                cprlTarget={activeBrand === 'MCI' ? 100_000 : activeBrand === 'GOL' ? (d.cprlSeries.length > 0 ? Math.round(d.cprlSeries.reduce((s: number, p: {value: number}) => s + p.value, 0) / d.cprlSeries.length) : 150_000) : 150_000}
                cpaTarget={activeBrand === 'MCI' ? 500_000 : 2_000_000}
                cprlLabel={activeBrand === 'MCI' ? 'CPR' : undefined}
                cpaLabel={activeBrand === 'MCI' ? 'CPV' : undefined}
                changelog={filteredChangelog}
                skuSpend={d.totalSpend}
                totalAllPlatformsSpend={totalSpendAllPlatforms}
                skuDailyBudget={platformBudgets[id] ?? 0}
                skuTargetDailyBudget={totalDailyBudget}
                totalRoas={d.totals.ccRoas}
                roasTarget={activeBrand === 'MCI' ? undefined : 6.59}
                roasLabel={activeBrand === 'MCI' ? 'Visit Rate' : 'CC RoAS'}
                roasIsPercentage={activeBrand === 'MCI'}
              />
            )
          })}
        </div>
          )
        })()}
      </div>



      {/* ── Ad Spend Health for selected SKU ── */}
      {selectedSku && cgData && (() => {
        const perf = cgData.performance ?? []
        const targets = cgData.targets ?? []
        const budgets = cgData.campaign_budgets ?? []

        const isMCI = activeBrand === 'MCI'

        // Total spend for selected SKU in period (MCI: all SKUs)
        const skuTotalSpend = isMCI
          ? perf.filter(r => r.date >= activeFrom && r.date <= activeTo).reduce((s, r) => s + (r.ad_spend ?? 0), 0)
          : perf.filter(r => r.sku === selectedSku && r.date >= activeFrom && r.date <= activeTo).reduce((s, r) => s + (r.ad_spend ?? 0), 0)

        // Period budget (sum of daily targets across the date range)
        const skuPeriodBudget = isMCI
          ? targets.reduce((s, r) => s + (r.daily_ad_spend ?? 0), 0)
          : targets.filter(r => r.sku === selectedSku).reduce((s, r) => s + (r.daily_ad_spend ?? 0), 0)

        // Daily budget: latest target for this SKU (MCI: all)
        const skuTargets = isMCI
          ? targets.sort((a, b) => b.date.localeCompare(a.date))
          : targets.filter(r => r.sku === selectedSku).sort((a, b) => b.date.localeCompare(a.date))
        const skuDailyBudget = skuTargets[0]?.daily_ad_spend ?? 0

        // Campaign budget: sum of campaign budgets (MCI: all)
        const skuCampaignBudget = isMCI
          ? budgets.reduce((s, r) => s + (r.daily_budget ?? 0), 0)
          : budgets.filter(r => r.sku === selectedSku).reduce((s, r) => s + (r.daily_budget ?? 0), 0)
        const budgetDate = budgets[0]?.date ?? ''

        // Per-platform breakdown (MCI: all SKUs)
        const skuPerf = isMCI ? perf : perf.filter(r => r.sku === selectedSku)
        const convs = isMCI
          ? (cgData.conversions ?? [])
          : (cgData.conversions ?? []).filter(r => r.sku === selectedSku)
        const platformBreakdown = PLATFORMS.map(p => {
          const pRows = skuPerf.filter(r => (r.traffic_source ?? '').toUpperCase() === p.id)
          const cRows = convs.filter(r => (r.traffic_source ?? '').toUpperCase() === p.id)
          const spend = pRows.reduce((s, r) => s + (r.ad_spend ?? 0), 0)
          const totalLeads = activeBrand === 'MCI'
            ? cRows.reduce((s, r) => s + (r.mongo_form_submission ?? 0), 0)
            : cRows.reduce((s, r) => s + (r.mongo_real_lead_ccom ?? 0) + (r.mongo_real_lead_d2or ?? 0) + (r.mongo_real_lead_mpsh ?? 0) + (r.mongo_real_lead_ofls ?? 0), 0)
          const purchases = activeBrand === 'MCI'
            ? cRows.reduce((s, r) => s + (r.mongo_form_conversion ?? 0), 0)
            : cRows.reduce((s, r) => s + (r.mongo_purchase_ccom ?? 0), 0)
          const revenue = activeBrand === 'MCI' ? 0 : cRows.reduce((s, r) => s + (r.mongo_purchase_ccom_revenue ?? 0), 0)
          return {
            platform: p.id, label: p.label, color: p.color, spend,
            cprl: totalLeads > 0 ? spend / totalLeads : 0,
            cpaCC: purchases > 0 ? spend / purchases : 0,
            ccRoas: spend > 0 ? revenue / spend : 0,
          }
        }).filter(p => p.spend > 0)

        // ── Campaign breakdown for selected SKU ──
        const dims = (cgData.campaign_dimension ?? []) as CampaignDimRow[]
        const dimMap = new Map<string, CampaignDimRow>()
        for (const d of dims) dimMap.set(`${d.traffic_source}|${d.campaign_id}`, d)

        const ga4 = isMCI
          ? (cgData.ga4 ?? [])
          : (cgData.ga4 ?? []).filter(r => r.sku === selectedSku)
        const conv = isMCI
          ? (cgData.conversions ?? [])
          : (cgData.conversions ?? []).filter(r => r.sku === selectedSku)

        // Accumulate per (traffic_source, campaign_id)
        type CampAcc = { ts: string; cid: string; spend: number; rl: number; pu: number }
        const campMap = new Map<string, CampAcc>()
        const getOrInit = (ts: string, cid: string) => {
          const k = `${ts}|${cid}`
          let v = campMap.get(k)
          if (!v) { v = { ts, cid, spend: 0, rl: 0, pu: 0 }; campMap.set(k, v) }
          return v
        }
        for (const r of skuPerf) {
          const v = getOrInit(r.traffic_source, r.ads_platform_campaign_id)
          v.spend += r.ad_spend ?? 0
        }
        for (const r of conv) {
          const v = getOrInit(r.traffic_source, r.ads_platform_campaign_id)
          v.rl += activeBrand === 'MCI'
            ? (r.mongo_form_submission ?? 0)
            : (r.mongo_real_lead_ccom ?? 0) + (r.mongo_real_lead_d2or ?? 0) + (r.mongo_real_lead_mpsh ?? 0) + (r.mongo_real_lead_ofls ?? 0)
          v.pu += activeBrand === 'MCI'
            ? (r.mongo_form_conversion ?? 0)
            : (r.mongo_purchase_ccom ?? 0)
        }

        // Build campaign budget lookup: campaign_name → daily_budget
        const budgetByName = new Map<string, number>()
        const budgetFiltered = isMCI ? budgets : budgets.filter(r => r.sku === selectedSku)
        for (const b of budgetFiltered) {
          budgetByName.set(b.campaign_name, (budgetByName.get(b.campaign_name) ?? 0) + (b.daily_budget ?? 0))
        }

        // Also build campaign name lookup from budgets (fallback for SRCH etc.)
        const nameByTsCid = new Map<string, string>()
        for (const b of budgets) {
          if (b.campaign_name && b.campaign_id) {
            nameByTsCid.set(`${b.traffic_source}|${b.campaign_id}`, b.campaign_name)
          }
        }

        const campaignRows = Array.from(campMap.values())
          .filter(v => v.spend > 0)
          .map(v => {
            const dim = dimMap.get(`${v.ts}|${v.cid}`)
            const name = dim?.campaign_name ?? nameByTsCid.get(`${v.ts}|${v.cid}`) ?? v.cid
            const funnel = dim?.funnel ?? '-'
            const cprl = v.rl > 0 ? v.spend / v.rl : 0
            const cpaCC = v.pu > 0 ? v.spend / v.pu : 0
            const dailyBudget = budgetByName.get(name) ?? 0
            return { ts: v.ts, name, funnel, cprl, cpaCC, dailyBudget, spend: v.spend }
          })
          .sort((a, b) => a.name.localeCompare(b.name))

        // Map funnel codes to labels
        const funnelLabel = (code: string) =>
          code === '00' ? 'ToFU00' : code === '25' ? 'MoFU25' : code === '50' ? 'BoFU50' : code === '75' ? 'BoFU75' : code
        const funnelColor = (code: string) =>
          code === '00' ? '#818cf8' : code === '25' ? '#60a5fa' : code === '50' ? '#fbbf24' : code === '75' ? '#fb923c' : 'rgba(255,255,255,0.3)'

        // Platform badge color
        const platColor = (ts: string) => {
          const p = PLATFORMS.find(p => p.id === ts.toUpperCase())
          return p?.color ?? 'rgba(255,255,255,0.5)'
        }

        return (
          <div style={{ marginTop: 20 }}>

            {/* ── Campaign Breakdown Table ── */}
            {campaignRows.length > 0 && (() => {
              // Group by platform
              const platformGroups = new Map<string, typeof campaignRows>()
              for (const row of campaignRows) {
                const key = row.ts.toUpperCase()
                if (!platformGroups.has(key)) platformGroups.set(key, [])
                platformGroups.get(key)!.push(row)
              }

              // Compute summary per platform
              const platformSummaries = Array.from(platformGroups.entries()).map(([ts, rows]) => {
                const totalSpend = rows.reduce((s, r) => s + r.spend, 0)
                const totalLeads = rows.reduce((s, r) => r.cprl > 0 ? s + r.spend / r.cprl : s, 0)
                const totalPurchases = rows.reduce((s, r) => r.cpaCC > 0 ? s + r.spend / r.cpaCC : s, 0)
                const totalBudget = rows.reduce((s, r) => s + r.dailyBudget, 0)
                return {
                  ts,
                  rows,
                  cprl: totalLeads > 0 ? totalSpend / totalLeads : 0,
                  cpaCC: totalPurchases > 0 ? totalSpend / totalPurchases : 0,
                  dailyBudget: totalBudget,
                }
              })

              return (
                <>
                <div style={{
                  marginTop: 40,
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px solid rgba(255,255,255,0.06)',
                  borderRadius: 14,
                  padding: '24px 28px',
                  overflowX: 'auto',
                }}>
                  {/* Header: SKU picker + Budget stats */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
                     {/* Left: Title + SKU tabs (hidden for MCI) */}
                     <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                      <div style={{
                        fontSize: 10, fontWeight: 700, letterSpacing: '0.08em',
                        color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase',
                      }}>Campaign Breakdown</div>
                      {!isMCI && (<>
                      <div style={{ width: 1, height: 16, background: 'rgba(255,255,255,0.08)' }} />
                      {orderedSkus.map(sku => {
                        const isActive = sku === selectedSku
                        const c = SKU_COLORS[sku.toUpperCase()] ?? 'rgba(255,255,255,0.5)'
                        return (
                          <button
                            key={sku}
                            onClick={() => setSelectedSku(sku)}
                            style={{
                              padding: '4px 12px',
                              fontSize: 11,
                              fontWeight: isActive ? 700 : 600,
                              letterSpacing: '0.04em',
                              borderRadius: 5,
                              border: `1.5px solid ${isActive ? c : 'rgba(255,255,255,0.08)'}`,
                              background: isActive ? `${c}18` : 'transparent',
                              color: isActive ? c : 'rgba(255,255,255,0.35)',
                              cursor: 'pointer',
                              transition: 'all 0.15s ease',
                            }}
                          >
                            {sku}
                          </button>
                        )
                      })}
                      </>)}
                    </div>
                  </div>

                  {/* ── Budget Health Section ── */}
                  {(() => {
                    const pct = skuPeriodBudget > 0 ? Math.min((skuTotalSpend / skuPeriodBudget) * 100, 100) : 0
                    const hColor = pct === 0 ? '#818cf8' : pct > 115 ? '#f87171' : pct >= 105 ? '#fbbf24' : pct >= 95 ? '#34d399' : pct >= 85 ? '#fbbf24' : '#f87171'
                    const hLabel = pct === 0 ? 'No Data' : pct > 115 ? '🔴 Over Budget' : pct >= 105 ? '🟡 Slightly Over' : pct >= 95 ? '🟢 On Track' : pct >= 85 ? '🟡 Slightly Under' : '🔴 Far Behind'
                    const delta = skuCampaignBudget > 0 && skuDailyBudget > 0 ? skuCampaignBudget - skuDailyBudget : 0
                    const deltaPct = skuDailyBudget > 0 ? (delta / skuDailyBudget) * 100 : 0

                    return (
                      <div style={{
                        display: 'flex', gap: 32, flexWrap: 'wrap',
                        padding: '20px 0 16px',
                        borderBottom: '1px solid rgba(255,255,255,0.06)',
                        marginBottom: 8,
                      }}>
                        {/* Block 1: Ad Spend Health */}
                        <div style={{ flex: '1 1 260px', minWidth: 240 }}>
                          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase', marginBottom: 6 }}>Ad Spend Health</div>
                          <div style={{ fontSize: 24, fontWeight: 800, color: '#fff', letterSpacing: '-0.04em', lineHeight: 1, marginBottom: 6 }}>{fmtRp(Math.round(skuTotalSpend))}</div>
                          {skuPeriodBudget > 0 && (
                            <>
                              <div style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.40)', marginBottom: 4 }}>Target {fmtRp(Math.round(skuPeriodBudget))}</div>
                              <div style={{ height: 5, background: 'rgba(255,255,255,0.07)', borderRadius: 3 }}>
                                <div style={{ height: '100%', width: `${pct}%`, background: hColor, borderRadius: 3, transition: 'width 0.5s ease' }} />
                              </div>
                              <div style={{
                                display: 'inline-flex', alignItems: 'center', gap: 5,
                                padding: '3px 8px', marginTop: 6,
                                background: `${hColor}12`, border: `1px solid ${hColor}30`,
                                borderRadius: 5,
                              }}>
                                <div style={{ width: 5, height: 5, borderRadius: '50%', background: hColor }} />
                                <span style={{ fontSize: 11, fontWeight: 700, color: hColor }}>{hLabel}</span>
                                <span style={{ fontSize: 11, color: hColor, opacity: 0.8 }}>{(skuTotalSpend / skuPeriodBudget * 100).toFixed(1)}%</span>
                              </div>
                            </>
                          )}
                        </div>

                        {/* Divider */}
                        <div style={{ width: 1, background: 'rgba(255,255,255,0.06)', alignSelf: 'stretch' }} />

                        {/* Block 2: Daily Budget / Target */}
                        <div style={{ flex: '1 1 260px', minWidth: 240 }}>
                          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase', marginBottom: 6 }}>Daily Budget / Target</div>
                          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 4 }}>
                            <span style={{ fontSize: 24, fontWeight: 800, color: '#fff', letterSpacing: '-0.04em' }}>{fmtRpM(skuCampaignBudget)}</span>
                            <span style={{ fontSize: 16, color: 'rgba(255,255,255,0.25)', fontWeight: 700 }}>/</span>
                            <span style={{ fontSize: 20, fontWeight: 800, color: 'rgba(255,255,255,0.55)', letterSpacing: '-0.03em' }}>{fmtRpM(skuDailyBudget)}</span>
                          </div>
                          {skuCampaignBudget > 0 && skuDailyBudget > 0 && (
                            <div style={{
                              display: 'inline-flex', alignItems: 'center', gap: 4,
                              fontSize: 12, fontWeight: 700,
                              color: delta < 0 ? '#f87171' : '#34d399',
                              marginTop: 4,
                            }}>
                              {delta < 0 ? '▼' : '▲'} {fmtRpM(Math.abs(delta))} ({Math.abs(deltaPct).toFixed(1)}%) {delta < 0 ? 'below' : 'above'} target
                            </div>
                          )}
                          {budgetDate && <div style={{ fontSize: 10, fontWeight: 600, color: 'rgba(255,255,255,0.30)', marginTop: 4 }}>as of {budgetDate}</div>}
                        </div>
                      </div>
                    )
                  })()}


                  {/* ── Budget Optimizer Controls ── */}
                  {(() => {
                    // Current total = sum of all campaign daily budgets for this SKU
                    const currentTotal = campaignRows.reduce((s, r) => s + r.dailyBudget, 0)
                    if (currentTotal <= 0) return null
                    // Sync base on first render / SKU change
                    if (optBaseBudget !== currentTotal) syncBaseBudget(currentTotal)
                    const effectiveNew = optNewBudget ?? currentTotal
                    const effectivePct = optBaseBudget && optBaseBudget > 0
                      ? Math.round(((effectiveNew - optBaseBudget) / optBaseBudget) * 100)
                      : 0

                    const handleSlider = (pct: number) => {
                      setOptScalePct(pct)
                      setOptNewBudget(Math.round(currentTotal * (1 + pct / 100)))
                    }
                    const handleBudgetInput = (val: number) => {
                      setOptNewBudget(val)
                      setOptScalePct(currentTotal > 0 ? Math.round(((val - currentTotal) / currentTotal) * 100) : 0)
                    }

                    const pctColor = effectivePct > 0 ? '#34d399' : effectivePct < 0 ? '#f87171' : 'rgba(255,255,255,0.5)'
                    const pctLabel = effectivePct > 0 ? `+${effectivePct}%` : effectivePct < 0 ? `${effectivePct}%` : '0%'

                    return (
                      <div style={{
                        display: 'flex', alignItems: 'center', gap: 28, flexWrap: 'wrap',
                        padding: '18px 22px', marginBottom: 28, marginTop: 4,
                        background: 'rgba(129,140,248,0.04)',
                        border: '1px solid rgba(129,140,248,0.12)',
                        borderRadius: 10,
                      }}>

                        {/* Current Daily Budget */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', color: 'rgba(255,255,255,0.40)', textTransform: 'uppercase' }}>Current Daily Budget</span>
                          <span style={{ fontSize: 20, fontWeight: 800, color: 'rgba(255,255,255,0.6)', letterSpacing: '-0.02em' }}>{fmtRp(Math.round(currentTotal))}</span>
                        </div>

                        {/* Divider */}
                        <div style={{ width: 1, height: 48, background: 'rgba(255,255,255,0.08)' }} />

                        {/* New Budget Input */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', color: 'rgba(255,255,255,0.40)', textTransform: 'uppercase' }}>New Budget</span>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ fontSize: 14, color: 'rgba(255,255,255,0.5)', fontWeight: 600 }}>Rp</span>
                            <input
                              type="text"
                              value={Math.round(effectiveNew).toLocaleString('id-ID')}
                              onChange={e => {
                                const raw = e.target.value.replace(/\D/g, '')
                                handleBudgetInput(Number(raw) || 0)
                              }}
                              style={{
                                width: 170, background: 'rgba(255,255,255,0.06)',
                                border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8,
                                color: '#fff', padding: '8px 12px', fontSize: 18, fontWeight: 700,
                                letterSpacing: '-0.02em', outline: 'none',
                              }}
                            />
                            <span style={{ fontSize: 14, fontWeight: 700, color: pctColor, minWidth: 50 }}>{pctLabel}</span>
                          </div>
                        </div>

                        {/* Divider */}
                        <div style={{ width: 1, height: 48, background: 'rgba(255,255,255,0.08)' }} />

                        {/* Scale Slider */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 220 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', color: 'rgba(255,255,255,0.40)', textTransform: 'uppercase' }}>Scale</span>
                            <span style={{ fontSize: 14, fontWeight: 700, color: pctColor }}>{pctLabel}</span>
                          </div>
                          <input
                            type="range"
                            min={-20}
                            max={20}
                            value={optScalePct}
                            onChange={e => handleSlider(Number(e.target.value))}
                            style={{
                              width: '100%', height: 6, appearance: 'none' as const,
                              background: `linear-gradient(to right, #f87171 0%, rgba(255,255,255,0.15) 50%, #34d399 100%)`,
                              borderRadius: 3, outline: 'none', cursor: 'pointer',
                            }}
                          />
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'rgba(255,255,255,0.25)', fontWeight: 600 }}>
                            <span>-20%</span>
                            <span>0%</span>
                            <span>+20%</span>
                          </div>
                        </div>

                        {/* Divider */}
                        <div style={{ width: 1, height: 48, background: 'rgba(255,255,255,0.08)' }} />

                        {/* Optimize For */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', color: 'rgba(255,255,255,0.40)', textTransform: 'uppercase' }}>Optimize For</span>
                          <div style={{ display: 'flex', gap: 6 }}>
                            {([[activeBrand === 'MCI' ? 'CPR' : 'CPRL', 'cprl'], [activeBrand === 'MCI' ? 'CPV' : 'CPA CC', 'cpaCC']] as [string, string][]).map(([label, val]) => {
                              const active = optTarget === val
                              return (
                                <button
                                  key={val}
                                  onClick={() => setOptTarget(val as OptTarget)}
                                  style={{
                                    padding: '7px 18px', fontSize: 13, fontWeight: active ? 700 : 600,
                                    borderRadius: 7, cursor: 'pointer',
                                    border: `1px solid ${active ? '#818cf8' : 'rgba(255,255,255,0.12)'}`,
                                    background: active ? 'rgba(129,140,248,0.15)' : 'transparent',
                                    color: active ? '#818cf8' : 'rgba(255,255,255,0.50)',
                                    transition: 'all 0.15s',
                                  }}
                                >{label}</button>
                              )
                            })}
                          </div>
                        </div>

                        {/* Divider */}
                        <div style={{ width: 1, height: 48, background: 'rgba(255,255,255,0.08)' }} />

                        {/* Strength Slider */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 140 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', color: 'rgba(255,255,255,0.40)', textTransform: 'uppercase' }}>Strength</span>
                            <span style={{ fontSize: 14, fontWeight: 700, color: '#818cf8' }}>{optStrength}%</span>
                          </div>
                          <input
                            type="range"
                            min={0}
                            max={100}
                            step={5}
                            value={optStrength}
                            onChange={e => setOptStrength(Number(e.target.value))}
                            style={{
                              width: '100%', height: 6, appearance: 'none' as const,
                              background: `linear-gradient(to right, rgba(255,255,255,0.15) 0%, #818cf8 100%)`,
                              borderRadius: 3, outline: 'none', cursor: 'pointer',
                            }}
                          />
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'rgba(255,255,255,0.25)', fontWeight: 600 }}>
                            <span>Gentle</span>
                            <span>Full</span>
                          </div>
                        </div>

                        {/* Optimize Button */}
                        <button
                          onClick={() => {
                            const newTotal = optNewBudget ?? campaignRows.reduce((s, r) => s + r.dailyBudget, 0)
                            const currentTotal = campaignRows.reduce((s, r) => s + r.dailyBudget, 0)
                            if (currentTotal <= 0) return
                            const inputs = campaignRows.map(r => ({
                              name: r.name,
                              ts: r.ts,
                              funnel: r.funnel,
                              cprl: r.cprl,
                              cpaCC: r.cpaCC,
                              dailyBudget: r.dailyBudget,
                              spend: r.spend,
                            }))
                            console.log('=== OPTIMIZER INPUT ===')
                            console.table(inputs.map(r => ({ name: r.name.slice(0, 40), ts: r.ts, funnel: r.funnel, cprl: Math.round(r.cprl), cpaCC: Math.round(r.cpaCC), budget: Math.round(r.dailyBudget) })))
                            console.log('New total:', newTotal, 'Target:', optTarget)
                            const results = optimizeBudget(inputs, newTotal, optTarget, optStrength / 100)
                            console.log('=== OPTIMIZER OUTPUT ===')
                            console.table(results.map(r => ({ name: r.name.slice(0, 40), ts: r.ts, suggested: Math.round(r.suggestedBudget), pCprl: Math.round(r.predictedCprl), pCpaCC: Math.round(r.predictedCpaCC) })))
                            setOptResults(results)
                          }}
                          style={{
                            marginLeft: 'auto',
                            padding: '10px 28px', fontSize: 14, fontWeight: 700,
                            letterSpacing: '0.03em',
                            borderRadius: 8, cursor: 'pointer',
                            border: '1px solid rgba(129,140,248,0.4)',
                            background: 'rgba(129,140,248,0.15)',
                            color: '#818cf8',
                            display: 'flex', alignItems: 'center', gap: 8,
                            transition: 'all 0.2s',
                          }}
                        >
                          <span style={{ fontSize: 16 }}>⚡</span>
                          Optimize
                        </button>

                      </div>
                    )
                  })()}

                  <div style={{
                    border: '1px solid rgba(255,255,255,0.08)',
                    borderRadius: 10,
                    padding: '12px 16px',
                    background: 'rgba(255,255,255,0.015)',
                  }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'Inter, system-ui, sans-serif' }}>
                    <thead>
                      <tr>
                        {([[activeBrand === 'MCI' ? 'Campaign Name' : 'Campaign Name', 'name'], ['Funnel', 'funnel'], [activeBrand === 'MCI' ? 'CPR' : 'CPRL', 'cprl'], [activeBrand === 'MCI' ? 'CPV' : 'CPA CC', 'cpaCC'], ['Daily Budget', 'dailyBudget']] as [string, string][]).map(([label, col]) => {
                          const isActive = campSortCol === col
                          return (
                            <th key={col}
                              onClick={() => toggleCampSort(col as SortCol)}
                              style={{
                                textAlign: col === 'name' ? 'left' : 'right',
                                padding: '6px 10px 8px',
                                fontWeight: 700, fontSize: 12,
                                letterSpacing: '0.06em',
                                color: isActive ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.50)',
                                textTransform: 'uppercase',
                                whiteSpace: 'nowrap',
                                borderBottom: '1px solid rgba(255,255,255,0.07)',
                                cursor: 'pointer',
                                userSelect: 'none',
                              }}>
                              {label} {isActive ? (campSortAsc ? '▲' : '▼') : ''}
                            </th>
                          )
                        })}
                        {['New Budget', 'Change', 'Delta', `P. ${activeBrand === 'MCI' ? 'CPR' : 'CPRL'}`, `P. ${activeBrand === 'MCI' ? 'CPV' : 'CPA CC'}`].map(h => (
                          <th key={h} style={{
                            textAlign: 'right',
                            padding: '6px 10px 8px',
                            fontWeight: 700, fontSize: 12,
                            letterSpacing: '0.06em',
                            color: optResults ? 'rgba(129,140,248,0.7)' : 'rgba(255,255,255,0.20)',
                            textTransform: 'uppercase',
                            whiteSpace: 'nowrap',
                            borderBottom: '1px solid rgba(255,255,255,0.07)',
                          }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      <tr><td colSpan={99} style={{ padding: 0, height: 20, border: 'none' }} /></tr>
                      {platformSummaries.map(({ ts, rows: platRows, cprl, cpaCC, dailyBudget: platBudget }, groupIdx) => {
                        const pc = platColor(ts)
                        const FUNNEL_ORD: Record<string, number> = { '00': 0, '25': 1, '50': 2, '75': 3 }
                        const sortedRows = [...platRows].sort((a, b) => {
                          let cmp = 0
                          switch (campSortCol) {
                            case 'name':        cmp = a.name.localeCompare(b.name); break
                            case 'funnel':      cmp = (FUNNEL_ORD[a.funnel] ?? 9) - (FUNNEL_ORD[b.funnel] ?? 9); break
                            case 'cprl':        cmp = a.cprl - b.cprl; break
                            case 'cpaCC':       cmp = a.cpaCC - b.cpaCC; break
                            case 'dailyBudget': cmp = a.dailyBudget - b.dailyBudget; break
                          }
                          return campSortAsc ? cmp : -cmp
                        })
                        return (
                          <React.Fragment key={ts}>
                            {/* Spacer between platform groups */}
                            {groupIdx > 0 && (
                              <tr><td colSpan={99} style={{ padding: 0, height: 20, border: 'none' }} /></tr>
                            )}
                            {/* Platform summary row */}
                            <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                              <td style={{
                                padding: '10px 10px', fontSize: 12, fontWeight: 800,
                                color: pc,
                              }}>
                                <span style={{
                                  fontSize: 10, fontWeight: 700, letterSpacing: '0.05em',
                                  background: `${pc}15`, border: `1px solid ${pc}30`,
                                  borderRadius: 4, padding: '2px 8px', marginRight: 8,
                                }}>{ts}</span>
                                <span style={{ color: 'rgba(255,255,255,0.40)', fontSize: 11, fontWeight: 600 }}>
                                  {platRows.length} campaign{platRows.length !== 1 ? 's' : ''}
                                </span>
                              </td>
                              <td style={{ padding: '10px 10px', textAlign: 'right' }}></td>
                              <td style={{
                                padding: '10px 10px', textAlign: 'right', fontSize: 12, fontWeight: 800,
                                color: cprl > 0 ? '#fff' : 'rgba(255,255,255,0.25)',
                                whiteSpace: 'nowrap',
                              }}>{cprl > 0 ? fmtRpM(Math.round(cprl)) : '—'}</td>
                              <td style={{
                                padding: '10px 10px', textAlign: 'right', fontSize: 12, fontWeight: 800,
                                color: cpaCC > 0 ? '#fff' : 'rgba(255,255,255,0.25)',
                                whiteSpace: 'nowrap',
                              }}>{cpaCC > 0 ? fmtRpM(Math.round(cpaCC)) : '—'}</td>
                              <td style={{
                                padding: '10px 10px', textAlign: 'right', fontSize: 12, fontWeight: 800,
                                color: platBudget > 0 ? '#fff' : 'rgba(255,255,255,0.25)',
                                whiteSpace: 'nowrap',
                              }}>{platBudget > 0 ? fmtRp(Math.round(platBudget)) : '—'}</td>
                              {/* Opt columns for platform summary */}
                              {(() => {
                                if (!optResults) return <><td style={{ padding: '10px 10px' }} /><td style={{ padding: '10px 10px' }} /><td style={{ padding: '10px 10px' }} /><td style={{ padding: '10px 10px' }} /><td style={{ padding: '10px 10px' }} /></>
                                const platOpt = optResults.filter(r => r.ts.toUpperCase() === ts)
                                const newPlat = platOpt.reduce((s, r) => s + r.suggestedBudget, 0)
                                const change = newPlat - platBudget
                                const delta = platBudget > 0 ? (change / platBudget) * 100 : 0
                                const chColor = change > 0 ? '#34d399' : change < 0 ? '#f87171' : '#fff'
                                // Predicted platform-level CPRL & CPA CC
                                const pLeads = platOpt.reduce((s, r) => r.predictedCprl > 0 ? s + r.suggestedBudget / r.predictedCprl : s, 0)
                                const pPurchases = platOpt.reduce((s, r) => r.predictedCpaCC > 0 ? s + r.suggestedBudget / r.predictedCpaCC : s, 0)
                                const pCprl = pLeads > 0 ? newPlat / pLeads : 0
                                const pCpaCC = pPurchases > 0 ? newPlat / pPurchases : 0
                                return (
                                  <>
                                    <td style={{ padding: '10px 10px', textAlign: 'right', fontSize: 12, fontWeight: 800, color: '#818cf8', whiteSpace: 'nowrap' }}>{fmtRp(Math.round(newPlat))}</td>
                                    <td style={{ padding: '10px 10px', textAlign: 'right', fontSize: 12, fontWeight: 800, color: chColor, whiteSpace: 'nowrap' }}>{change > 0 ? '+' : ''}{fmtRp(Math.round(change))}</td>
                                    <td style={{ padding: '10px 10px', textAlign: 'right', fontSize: 12, fontWeight: 800, color: chColor, whiteSpace: 'nowrap' }}>{delta > 0 ? '+' : ''}{delta.toFixed(1)}%</td>
                                    <td style={{ padding: '10px 10px', textAlign: 'right', fontSize: 12, fontWeight: 800, color: pCprl > 0 ? '#818cf8' : 'rgba(255,255,255,0.25)', whiteSpace: 'nowrap' }}>{pCprl > 0 ? fmtRpM(Math.round(pCprl)) : '—'}</td>
                                    <td style={{ padding: '10px 10px', textAlign: 'right', fontSize: 12, fontWeight: 800, color: pCpaCC > 0 ? '#818cf8' : 'rgba(255,255,255,0.25)', whiteSpace: 'nowrap' }}>{pCpaCC > 0 ? fmtRpM(Math.round(pCpaCC)) : '—'}</td>
                                  </>
                                )
                              })()}
                            </tr>
                            {/* Individual campaign rows */}
                            {sortedRows.map((row, i) => (
                              <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                                <td style={{
                                  padding: '7px 10px 7px 28px', fontSize: 12, fontWeight: 500,
                                  color: 'rgba(255,255,255,0.75)',
                                  maxWidth: 340, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                }}>{row.name}</td>
                                <td style={{ padding: '7px 10px', textAlign: 'right' }}>
                                  <span style={{
                                    fontSize: 10, fontWeight: 700, letterSpacing: '0.05em',
                                    color: funnelColor(row.funnel), background: `${funnelColor(row.funnel)}15`,
                                    border: `1px solid ${funnelColor(row.funnel)}30`,
                                    borderRadius: 4, padding: '2px 6px',
                                  }}>{funnelLabel(row.funnel)}</span>
                                </td>
                                <td style={{
                                  padding: '7px 10px', textAlign: 'right', fontSize: 12, fontWeight: 500,
                                  color: row.cprl > 0 ? 'rgba(255,255,255,0.75)' : 'rgba(255,255,255,0.25)',
                                  whiteSpace: 'nowrap',
                                }}>{row.cprl > 0 ? fmtRpM(Math.round(row.cprl)) : '—'}</td>
                                <td style={{
                                  padding: '7px 10px', textAlign: 'right', fontSize: 12, fontWeight: 500,
                                  color: row.cpaCC > 0 ? 'rgba(255,255,255,0.75)' : 'rgba(255,255,255,0.25)',
                                  whiteSpace: 'nowrap',
                                }}>{row.cpaCC > 0 ? fmtRpM(Math.round(row.cpaCC)) : '—'}</td>
                                <td style={{
                                  padding: '7px 10px', textAlign: 'right', fontSize: 12, fontWeight: 500,
                                  color: row.dailyBudget > 0 ? 'rgba(255,255,255,0.6)' : 'rgba(255,255,255,0.25)',
                                  whiteSpace: 'nowrap',
                                }}>{row.dailyBudget > 0 ? fmtRp(Math.round(row.dailyBudget)) : '—'}</td>
                                {/* Opt columns for campaign row */}
                                {(() => {
                                  const match = optResults?.find(r => r.name === row.name && r.ts === row.ts)
                                  if (!match) return <><td style={{ padding: '7px 10px' }} /><td style={{ padding: '7px 10px' }} /><td style={{ padding: '7px 10px' }} /><td style={{ padding: '7px 10px' }} /><td style={{ padding: '7px 10px' }} /></>
                                  const change = match.suggestedBudget - row.dailyBudget
                                  const delta = row.dailyBudget > 0 ? (change / row.dailyBudget) * 100 : 0
                                  const chColor = change > 0 ? '#34d399' : change < 0 ? '#f87171' : 'rgba(255,255,255,0.5)'
                                  // Color predicted metrics: green if improved vs current, red if worse
                                  const cprlImproved = match.predictedCprl > 0 && row.cprl > 0 && match.predictedCprl < row.cprl
                                  const cprlWorse = match.predictedCprl > 0 && row.cprl > 0 && match.predictedCprl > row.cprl
                                  const cpaImproved = match.predictedCpaCC > 0 && row.cpaCC > 0 && match.predictedCpaCC < row.cpaCC
                                  const cpaWorse = match.predictedCpaCC > 0 && row.cpaCC > 0 && match.predictedCpaCC > row.cpaCC
                                  return (
                                    <>
                                      <td style={{ padding: '7px 10px', textAlign: 'right', fontSize: 12, fontWeight: 500, color: '#818cf8', whiteSpace: 'nowrap' }}>{fmtRp(Math.round(match.suggestedBudget))}</td>
                                      <td style={{ padding: '7px 10px', textAlign: 'right', fontSize: 12, fontWeight: 500, color: chColor, whiteSpace: 'nowrap' }}>{change > 0 ? '+' : ''}{fmtRp(Math.round(change))}</td>
                                      <td style={{ padding: '7px 10px', textAlign: 'right', fontSize: 12, fontWeight: 500, color: chColor, whiteSpace: 'nowrap' }}>{delta > 0 ? '+' : ''}{delta.toFixed(1)}%</td>
                                      <td style={{ padding: '7px 10px', textAlign: 'right', fontSize: 12, fontWeight: 500, color: cprlImproved ? '#34d399' : cprlWorse ? '#f87171' : 'rgba(255,255,255,0.5)', whiteSpace: 'nowrap' }}>{match.predictedCprl > 0 ? fmtRpM(Math.round(match.predictedCprl)) : '—'}</td>
                                      <td style={{ padding: '7px 10px', textAlign: 'right', fontSize: 12, fontWeight: 500, color: cpaImproved ? '#34d399' : cpaWorse ? '#f87171' : 'rgba(255,255,255,0.5)', whiteSpace: 'nowrap' }}>{match.predictedCpaCC > 0 ? fmtRpM(Math.round(match.predictedCpaCC)) : '—'}</td>
                                    </>
                                  )
                                })()}
                              </tr>
                            ))}
                          </React.Fragment>
                        )
                      })}
                    </tbody>
                  </table>
                  </div>
                </div>

                  {/* ── Budget Spread Comparison Cards ── */}
                  {(() => {
                    // Current spread by platform
                    const curByPlat = new Map<string, number>()
                    const curByFunnel = new Map<string, number>()
                    for (const r of campaignRows) {
                      curByPlat.set(r.ts, (curByPlat.get(r.ts) ?? 0) + r.dailyBudget)
                      curByFunnel.set(r.funnel, (curByFunnel.get(r.funnel) ?? 0) + r.dailyBudget)
                    }
                    const curTotal = campaignRows.reduce((s, r) => s + r.dailyBudget, 0)

                    // Optimized spread
                    const optByPlat = new Map<string, number>()
                    const optByFunnel = new Map<string, number>()
                    let optTotal = 0
                    if (optResults) {
                      for (const r of optResults) {
                        optByPlat.set(r.ts, (optByPlat.get(r.ts) ?? 0) + r.suggestedBudget)
                        optByFunnel.set(r.funnel, (optByFunnel.get(r.funnel) ?? 0) + r.suggestedBudget)
                      }
                      optTotal = optResults.reduce((s, r) => s + r.suggestedBudget, 0)
                    }

                    const FUNNELS = ['00', '25', '50', '75'] as const
                    const FUNNEL_LABELS: Record<string, string> = { '00': 'ToFU00', '25': 'MoFU25', '50': 'BoFU50', '75': 'BoFU75' }
                    const FUNNEL_COLORS: Record<string, string> = { '00': '#818cf8', '25': '#60a5fa', '50': '#fbbf24', '75': '#fb923c' }
                    const platNames = ['META', 'DGEN'] as const
                    const PLAT_COLORS: Record<string, string> = { META: '#60a5fa', DGEN: '#34d399' }

                    const renderCard = (title: string, total: number, byPlat: Map<string, number>, byFunnel: Map<string, number>, accent: string, cprl: number, cpaCC: number, metricsLabel: string, baseCprl?: number, baseCpaCC?: number) => (
                      <div style={{
                        flex: '1 1 0', minWidth: 260,
                        background: 'rgba(255,255,255,0.04)',
                        border: '1px solid rgba(255,255,255,0.09)',
                        borderRadius: 14, padding: '28px 32px',
                      }}>
                        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', color: accent, textTransform: 'uppercase', marginBottom: 4 }}>{title}</div>
                        <div style={{ fontSize: 20, fontWeight: 800, color: '#fff', letterSpacing: '-0.03em', marginBottom: 16 }}>{fmtRp(Math.round(total))}</div>

                        {/* Platform spread */}
                        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', marginBottom: 8 }}>Platform Spread</div>
                        <div style={{ display: 'flex', height: 10, borderRadius: 5, overflow: 'hidden', marginBottom: 6 }}>
                          {platNames.map(p => {
                            const val = byPlat.get(p) ?? 0
                            const pct = total > 0 ? (val / total) * 100 : 0
                            return <div key={p} style={{ width: `${pct}%`, background: PLAT_COLORS[p], transition: 'width 0.4s ease' }} />
                          })}
                        </div>
                        <div style={{ display: 'flex', gap: 16, marginBottom: 18 }}>
                          {platNames.map(p => {
                            const val = byPlat.get(p) ?? 0
                            const pct = total > 0 ? (val / total) * 100 : 0
                            return (
                              <div key={p} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                                <div style={{ width: 8, height: 8, borderRadius: 2, background: PLAT_COLORS[p] }} />
                                <span style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.6)' }}>{p}</span>
                                <span style={{ fontSize: 11, fontWeight: 700, color: '#fff' }}>{pct.toFixed(0)}%</span>
                                <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)' }}>{fmtRpM(Math.round(val))}</span>
                              </div>
                            )
                          })}
                        </div>

                        {/* Funnel spread */}
                        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', marginBottom: 8 }}>Funnel Spread</div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                          {FUNNELS.map(f => {
                            const val = byFunnel.get(f) ?? 0
                            const pct = total > 0 ? (val / total) * 100 : 0
                            return (
                              <div key={f}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
                                  <span style={{ fontSize: 11, fontWeight: 600, color: FUNNEL_COLORS[f] }}>{FUNNEL_LABELS[f]}</span>
                                  <span style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.5)' }}>{fmtRpM(Math.round(val))} ({pct.toFixed(0)}%)</span>
                                </div>
                                <div style={{ height: 6, background: 'rgba(255,255,255,0.06)', borderRadius: 3 }}>
                                  <div style={{ height: '100%', width: `${pct}%`, background: FUNNEL_COLORS[f], borderRadius: 3, transition: 'width 0.4s ease', opacity: 0.8 }} />
                                </div>
                              </div>
                            )
                          })}
                        </div>

                        {/* CPRL & CPA CC */}
                        <div style={{ marginTop: 18, paddingTop: 14, borderTop: '1px solid rgba(255,255,255,0.06)', display: 'flex', gap: 24 }}>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', marginBottom: 4 }}>{metricsLabel} {activeBrand === 'MCI' ? 'CPR' : 'CPRL'}</div>
                            <div style={{ fontSize: 18, fontWeight: 800, color: cprl > 0 ? '#fff' : 'rgba(255,255,255,0.25)', letterSpacing: '-0.03em' }}>
                              {cprl > 0 ? fmtRpM(Math.round(cprl)) : '—'}
                            </div>
                            {baseCprl != null && baseCprl > 0 && cprl > 0 && (() => {
                              const d = cprl - baseCprl
                              const dPct = (d / baseCprl) * 100
                              const improved = d < 0 // lower CPRL = better
                              return (
                                <div style={{ fontSize: 11, fontWeight: 700, color: improved ? '#34d399' : '#f87171', marginTop: 3 }}>
                                  {improved ? '▼' : '▲'} {fmtRpM(Math.abs(Math.round(d)))} ({Math.abs(dPct).toFixed(1)}%)
                                </div>
                              )
                            })()}
                          </div>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', marginBottom: 4 }}>{metricsLabel} {activeBrand === 'MCI' ? 'CPV' : 'CPA CC'}</div>
                            <div style={{ fontSize: 18, fontWeight: 800, color: cpaCC > 0 ? '#fff' : 'rgba(255,255,255,0.25)', letterSpacing: '-0.03em' }}>
                              {cpaCC > 0 ? fmtRpM(Math.round(cpaCC)) : '—'}
                            </div>
                            {baseCpaCC != null && baseCpaCC > 0 && cpaCC > 0 && (() => {
                              const d = cpaCC - baseCpaCC
                              const dPct = (d / baseCpaCC) * 100
                              const improved = d < 0 // lower CPA = better
                              return (
                                <div style={{ fontSize: 11, fontWeight: 700, color: improved ? '#34d399' : '#f87171', marginTop: 3 }}>
                                  {improved ? '▼' : '▲'} {fmtRpM(Math.abs(Math.round(d)))} ({Math.abs(dPct).toFixed(1)}%)
                                </div>
                              )
                            })()}
                          </div>
                        </div>
                      </div>
                    )

                    if (curTotal <= 0) return null

                    // Current CPRL & CPA CC from campaign data
                    const curTotalSpend = campaignRows.reduce((s, r) => s + r.spend, 0)
                    const curTotalLeads = campaignRows.reduce((s, r) => r.cprl > 0 ? s + r.spend / r.cprl : s, 0)
                    const curTotalPurchases = campaignRows.reduce((s, r) => r.cpaCC > 0 ? s + r.spend / r.cpaCC : s, 0)
                    const curCPRL = curTotalLeads > 0 ? curTotalSpend / curTotalLeads : 0
                    const curCPACC = curTotalPurchases > 0 ? curTotalSpend / curTotalPurchases : 0

                    // Predicted CPRL & CPA CC from optimization results
                    let predCPRL = curCPRL
                    let predCPACC = curCPACC
                    if (optResults && optTotal > 0) {
                      const predTotalLeads = optResults.reduce((s, r) => r.predictedCprl > 0 ? s + r.suggestedBudget / r.predictedCprl : s, 0)
                      const predTotalPurchases = optResults.reduce((s, r) => r.predictedCpaCC > 0 ? s + r.suggestedBudget / r.predictedCpaCC : s, 0)
                      predCPRL = predTotalLeads > 0 ? optTotal / predTotalLeads : 0
                      predCPACC = predTotalPurchases > 0 ? optTotal / predTotalPurchases : 0
                    }

                    return (
                      <div style={{ display: 'flex', gap: 16, marginTop: 36 }}>
                        {renderCard('Current Budget Spread', curTotal, curByPlat, curByFunnel, 'rgba(255,255,255,0.45)', curCPRL, curCPACC, 'Current')}
                        {optResults
                          ? renderCard('Optimized Budget Spread', optTotal, optByPlat, optByFunnel, '#818cf8', predCPRL, predCPACC, 'Predicted', curCPRL, curCPACC)
                          : <div style={{
                              flex: '1 1 0', minWidth: 260,
                              background: 'rgba(255,255,255,0.02)',
                              border: '1px dashed rgba(255,255,255,0.08)',
                              borderRadius: 14, padding: '28px 32px',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                            }}>
                              <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.20)', fontWeight: 600 }}>Click ⚡ Optimize to see suggested spread</span>
                            </div>
                        }
                      </div>
                    )
                  })()}
                </>
              )
            })()}
          </div>
        )
      })()}

    </div>
  )
}
