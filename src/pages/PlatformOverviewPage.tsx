/**
 * PlatformOverviewPage — Per-platform performance cards
 * Uses the same /v2/consumer-goods endpoint as Consumer Goods Dashboard,
 * but aggregates by traffic_source instead of sku.
 * Uses CC RoAS (mongo_purchase_ccom_revenue / ad_spend) instead of Total RoAS.
 */
import { useState, useMemo, useEffect, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { D1_WORKER_URL } from '../config/dataSource'
import { dateStr, capToH2, PRESETS } from './ProductPerformancePage'
import { SkuPerformanceCard } from '../components/cards/SkuPerformanceCard'
import metaAdsImg   from '../assets/ads_platform_images/Meta Ads.webp'
import googleAdsImg from '../assets/ads_platform_images/Google Ads.webp'
import searchAdsImg from '../assets/ads_platform_images/Google Search Ads.webp'

// ── Types (same as SandboxPage) ────────────────────────────────────────────
interface AdPerfRow    { date: string; traffic_source: string; ads_platform_campaign_id: string; sku: string; ad_spend: number; impressions: number; link_click: number }
interface Ga4Row       { date: string; traffic_source: string; sku: string; ads_platform_campaign_id: string; ga4_first_visit: number; ga4_page_view: number; ga4_view_offer: number }
interface ConvRow      { date: string; traffic_source: string; sku: string; ads_platform_campaign_id: string; mongo_real_lead_ccom: number; mongo_real_lead_d2or: number; mongo_real_lead_mpsh: number; mongo_real_lead_ofls: number; mongo_purchase_ccom: number; mongo_purchase_ccom_revenue: number }
interface BrandBounds  { brand: string; earliest: string; latest: string; skus: string[] }
interface ConsumerGoodsData {
  performance: AdPerfRow[]; campaign_budgets: unknown[]; targets: unknown[]
  ga4: Ga4Row[]; conversions: ConvRow[]
  changelog: { date: string; brand: string; sku: string; platform: string; title: string; changelist: string | null }[]
  campaign_dimension: unknown[]; sales: unknown[]
}

// Unified row merged by (date × platform)
interface PlatAggRow {
  date: string; platform: string
  ad_spend: number; impressions: number; link_click: number
  real_lead_ccom: number; real_lead_d2or: number; real_lead_mpsh: number; real_lead_ofls: number
  purchase_ccom: number; purchase_ccom_revenue: number
  ga4_first_visit: number; ga4_page_view: number; ga4_view_offer: number
}

// Platform config
const PLATFORMS = [
  { id: 'META', label: 'Meta Ads',          color: '#60a5fa', imageSrc: metaAdsImg },
  { id: 'DGEN', label: 'Demand Gen',        color: '#34d399', imageSrc: googleAdsImg },
  { id: 'SRCH', label: 'Google Search Ads', color: '#fbbf24', imageSrc: searchAdsImg },
] as const

export function PlatformOverviewPage() {
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

  // ── Aggregate by (date × platform) ──
  const rawData = useMemo((): PlatAggRow[] => {
    const zero = (): PlatAggRow => ({
      date: '', platform: '',
      ad_spend: 0, impressions: 0, link_click: 0,
      real_lead_ccom: 0, real_lead_d2or: 0, real_lead_mpsh: 0, real_lead_ofls: 0,
      purchase_ccom: 0, purchase_ccom_revenue: 0,
      ga4_first_visit: 0, ga4_page_view: 0, ga4_view_offer: 0,
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
      })
    }
    return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date))
  }, [cgData])

  const filteredChangelog = useMemo(() => cgData?.changelog ?? [], [cgData])

  // ── Per-platform computed metrics (same shape as allSkuData in SandboxPage) ──
  const allPlatformData = useMemo(() => {
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
      for (const r of rows) {
        spend    += r.ad_spend
        leads    += r.real_lead_ccom + r.real_lead_d2or + r.real_lead_mpsh + r.real_lead_ofls
        purchase += r.purchase_ccom
        ccRevenue += r.purchase_ccom_revenue
        clicks   += r.link_click
        impr     += r.impressions
        vo       += r.ga4_view_offer
        pv       += r.ga4_page_view
      }

      // Daily series helper
      const byDate = <T,>(init: T, acc: (cur: T, r: PlatAggRow) => T) => {
        const m = new Map<string, T>()
        for (const r of rows) m.set(r.date, acc(m.get(r.date) ?? init, r))
        return Array.from(m.entries()).sort(([a], [b]) => a.localeCompare(b))
      }

      out[plat.id] = {
        totalSpend: spend,
        totals: {
          ctr:    impr > 0 ? (clicks / impr) * 100 : 0,
          lpvo:   pv   > 0 ? (vo     / pv)   * 100 : 0,
          vo2l:   vo   > 0 ? (leads  / vo)   * 100 : 0,
          cprl:   leads    > 0 ? spend / leads      : 0,
          cpaCC:  purchase > 0 ? spend / purchase   : 0,
          ccRoas: spend    > 0 ? ccRevenue / spend  : 0,
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
        lpvoSeries: byDate({ vo: 0, pv: 0 }, (p, r) => ({ vo: p.vo + r.ga4_view_offer, pv: p.pv + r.ga4_page_view }))
          .map(([date, { vo, pv }]) => ({ date, value: pv > 0 ? (vo / pv) * 100 : 0 })).filter(p => p.value > 0),
        vo2lSeries: byDate({ l: 0, vo: 0 }, (p, r) => ({ l: p.l + r.real_lead_ccom + r.real_lead_d2or + r.real_lead_mpsh + r.real_lead_ofls, vo: p.vo + r.ga4_view_offer }))
          .map(([date, { l, vo }]) => ({ date, value: vo > 0 ? (l / vo) * 100 : 0 })).filter(p => p.value > 0),
        ccRoasSeries: (() => {
          const daily = byDate({ rev: 0, s: 0 }, (p, r) => ({ rev: p.rev + r.purchase_ccom_revenue, s: p.s + r.ad_spend }))
            .map(([date, { rev, s }]) => ({ date, rev, spend: s }))
          const win = 7
          return daily.map((_, i) => {
            const slice = daily.slice(Math.max(0, i - win + 1), i + 1)
            const totalRev = slice.reduce((s, d) => s + d.rev, 0)
            const totalSpend = slice.reduce((s, d) => s + d.spend, 0)
            return { date: daily[i].date, value: totalSpend > 0 ? totalRev / totalSpend : 0 }
          }).filter(p => p.value > 0)
        })(),
      }
    }
    return out
  }, [rawData])

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
        <div style={{ display: 'grid', gridTemplateColumns: activePlatforms.length >= 2 ? 'repeat(2, 1fr)' : '1fr', gap: 40 }}>
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
                cprlTarget={150_000}
                cpaTarget={2_000_000}
                changelog={filteredChangelog}
                totalRoas={d.totals.ccRoas}
                roasTarget={6.59}
                roasLabel="CC RoAS"
              />
            )
          })}
        </div>
      </div>

    </div>
  )
}
