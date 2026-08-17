/**
 * GeneralOverviewPage — Cross-brand quick glance
 */
import { useState, useMemo, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { D1_WORKER_URL } from '../config/dataSource'
import { dateStr, capToH2, PRESETS } from './ProductPerformancePage'
import type { ChangelogRow } from '../types/changelog'
import mncLogo from '../assets/brand_logos/MNC.webp'
import golLogo from '../assets/brand_logos/GOL.webp'
import mciLogo from '../assets/brand_logos/MCI.webp'
import { SkuPerformanceCard } from '../components/cards/SkuPerformanceCard'

interface BrandBounds { brand: string; earliest: string; latest: string; skus: string[] }

// Minimal types for fetched data
interface PerfRow { date: string; sku: string; ad_spend: number; impressions: number; link_click: number }
interface ConvRow { date: string; sku: string; mongo_real_lead_ccom?: number; mongo_real_lead_d2or?: number; mongo_real_lead_mpsh?: number; mongo_real_lead_ofls?: number; mongo_purchase_ccom?: number; mongo_purchase_ccom_revenue?: number }
interface SalesRow { date: string; rev_ccom_ca?: number; rev_ccom_crm?: number; rev_mpsh?: number; rev_d2or?: number; rev_ofls?: number }
interface BrandData { performance: PerfRow[]; conversions: ConvRow[]; sales: SalesRow[]; [k: string]: unknown }

export function GeneralOverviewPage() {
  // ── Date bounds ──
  const { data: brandBounds } = useQuery({
    queryKey: ['date-bounds'],
    queryFn: async () => {
      const res = await fetch(`${D1_WORKER_URL}/v2/date-bounds`)
      return (await res.json()) as BrandBounds[]
    },
    staleTime: 5 * 60_000,
  })

  const activeBounds = useMemo(() => {
    if (!brandBounds?.length) return null
    const earliest = brandBounds.reduce((e, b) => b.earliest < e ? b.earliest : e, brandBounds[0].earliest)
    const latest = brandBounds.reduce((l, b) => b.latest > l ? b.latest : l, brandBounds[0].latest)
    return { brand: 'ALL', earliest, latest, skus: [] } as BrandBounds
  }, [brandBounds])

  // Per-brand bounds for clamping queries
  const mncBounds = useMemo(() => brandBounds?.find(b => b.brand === 'MNC') ?? null, [brandBounds])
  const golBounds = useMemo(() => brandBounds?.find(b => b.brand === 'GOL') ?? null, [brandBounds])
  const mciBounds = useMemo(() => brandBounds?.find(b => b.brand === 'MCI') ?? null, [brandBounds])

  // Clamp date range to a brand's own bounds
  const clamp = (from: string, to: string, bounds: BrandBounds | null) => {
    if (!bounds) return { from, to }
    const cFrom = from < bounds.earliest ? bounds.earliest : from
    const cTo = to > bounds.latest ? capToH2(bounds.latest) : to
    return { from: cFrom, to: cTo }
  }

  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')

  const [didInit, setDidInit] = useState(false)
  if (activeBounds && !didInit) {
    const latest = capToH2(activeBounds.latest)
    const t = new Date(latest + 'T00:00:00')
    t.setDate(t.getDate() - 29)
    const fStr = dateStr(t)
    setFrom(fStr < activeBounds.earliest ? activeBounds.earliest : fStr)
    setTo(latest)
    setDidInit(true)
  }

  const activeFrom = from
  const activeTo = to

  // Pre-fetch buffer: fetch 21 extra days before display range so MAs are warmed up
  const MA_BUFFER_DAYS = 30
  const bufferFrom = (displayFrom: string, earliest: string) => {
    const d = new Date(displayFrom + 'T00:00:00')
    d.setDate(d.getDate() - MA_BUFFER_DAYS)
    const buf = dateStr(d)
    return buf < earliest ? earliest : buf
  }

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

  // ── Refresh ──
  const [refreshNonce, setRefreshNonce] = useState(0)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const spinRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const [spinAngle, setSpinAngle] = useState(0)

  const handleRefresh = () => {
    if (isRefreshing) return
    setIsRefreshing(true)
    setRefreshNonce(n => n + 1)
    if (spinRef.current) clearInterval(spinRef.current)
    spinRef.current = setInterval(() => setSpinAngle(a => a + 15), 30)
    setTimeout(() => {
      setIsRefreshing(false)
      if (spinRef.current) clearInterval(spinRef.current)
    }, 1500)
  }

  // ── MNC data fetch ──
  const mncRange = useMemo(() => clamp(activeFrom, activeTo, mncBounds), [activeFrom, activeTo, mncBounds])
  const mncFetchFrom = useMemo(() => mncBounds ? bufferFrom(mncRange.from, mncBounds.earliest) : mncRange.from, [mncRange.from, mncBounds])
  const { data: mncData, isLoading: mncLoading } = useQuery({
    queryKey: ['overview-mnc', mncFetchFrom, mncRange.to, refreshNonce],
    queryFn: async () => {
      const res = await fetch(`${D1_WORKER_URL}/v2/consumer-goods?brand=MNC&from=${mncFetchFrom}&to=${mncRange.to}${refreshNonce > 0 ? '&bust=' + Date.now() : ''}`)
      return (await res.json()) as BrandData
    },
    enabled: !!mncRange.from && !!mncRange.to,
    staleTime: 5 * 60_000,
  })

  // ── Shared brand metrics computation ──
  function computeBrandMetrics(bd: BrandData, displayFrom: string, displayTo: string) {
    const perf = bd.performance ?? []
    const conv = bd.conversions ?? []
    const sales = bd.sales ?? []

    // Filter to display range for totals
    const perfDisplay = perf.filter(r => r.date >= displayFrom && r.date <= displayTo)
    const convDisplay = conv.filter(r => r.date >= displayFrom && r.date <= displayTo)
    const salesDisplay = sales.filter(r => r.date >= displayFrom && r.date <= displayTo)

    const totalSpend = perfDisplay.reduce((s, r) => s + (r.ad_spend ?? 0), 0)
    const totalLeads = convDisplay.reduce((s, r) => s + (r.mongo_real_lead_ccom ?? 0) + (r.mongo_real_lead_d2or ?? 0) + (r.mongo_real_lead_mpsh ?? 0) + (r.mongo_real_lead_ofls ?? 0), 0)
    const totalPurchases = convDisplay.reduce((s, r) => s + (r.mongo_purchase_ccom ?? 0), 0)
    const totalRevenue = salesDisplay.reduce((s, r) => s + (r.rev_ccom_ca ?? 0) + (r.rev_ccom_crm ?? 0) + (r.rev_mpsh ?? 0) + (r.rev_d2or ?? 0) + (r.rev_ofls ?? 0), 0)

    const cprl = totalLeads > 0 ? totalSpend / totalLeads : 0
    const cpaCC = totalPurchases > 0 ? totalSpend / totalPurchases : 0
    const roas = totalSpend > 0 ? totalRevenue / totalSpend : 0

    const spendByDate = new Map<string, number>()
    for (const r of perf) spendByDate.set(r.date, (spendByDate.get(r.date) ?? 0) + (r.ad_spend ?? 0))

    const leadsByDate = new Map<string, number>()
    for (const r of conv) {
      const leads = (r.mongo_real_lead_ccom ?? 0) + (r.mongo_real_lead_d2or ?? 0) + (r.mongo_real_lead_mpsh ?? 0) + (r.mongo_real_lead_ofls ?? 0)
      leadsByDate.set(r.date, (leadsByDate.get(r.date) ?? 0) + leads)
    }

    const purchByDate = new Map<string, number>()
    for (const r of conv) purchByDate.set(r.date, (purchByDate.get(r.date) ?? 0) + (r.mongo_purchase_ccom ?? 0))

    const allDates = Array.from(new Set([...spendByDate.keys(), ...leadsByDate.keys()])).sort()

    const cprlSeries = allDates.map(d => {
      const sp = spendByDate.get(d) ?? 0
      const ld = leadsByDate.get(d) ?? 0
      return { date: d, value: ld > 0 ? sp / ld : 0 }
    }).filter(p => p.value > 0).filter(p => p.date >= displayFrom)

    const cpaDaily = allDates.map(d => ({ date: d, spend: spendByDate.get(d) ?? 0, purchases: purchByDate.get(d) ?? 0 }))
    const cpaSeries = cpaDaily.map((dd, i) => {
      const slice = cpaDaily.slice(Math.max(0, i - 6), i + 1)
      const ts = slice.reduce((s, d) => s + d.spend, 0)
      const tp = slice.reduce((s, d) => s + d.purchases, 0)
      return { date: dd.date, value: tp > 0 ? ts / tp : 0 }
    }).filter(p => p.value > 0).filter(p => p.date >= displayFrom)

    const revByDate = new Map<string, number>()
    for (const r of sales) {
      const rev = (r.rev_ccom_ca ?? 0) + (r.rev_ccom_crm ?? 0) + (r.rev_mpsh ?? 0) + (r.rev_d2or ?? 0) + (r.rev_ofls ?? 0)
      revByDate.set(r.date, (revByDate.get(r.date) ?? 0) + rev)
    }
    const roasDaily = allDates.map(d => ({ date: d, spend: spendByDate.get(d) ?? 0, rev: revByDate.get(d) ?? 0 }))
    const roasSeries = roasDaily.map((dd, i) => {
      const start = Math.max(0, i - 29) // 30-day MA
      const slice = roasDaily.slice(start, i + 1)
      const ts = slice.reduce((s, d) => s + d.spend, 0)
      const tr = slice.reduce((s, d) => s + d.rev, 0)
      return { date: dd.date, value: ts > 0 ? tr / ts : 0 }
    }).filter(p => p.value > 0).filter(p => p.date >= displayFrom)

    const changelog = (bd.changelog ?? []) as ChangelogRow[]

    return { totalSpend, totalLeads, totalPurchases, totalRevenue, cprl, cpaCC, roas, cprlSeries, cpaSeries, roasSeries, changelog }
  }

  // ── MNC computed metrics ──
  const mnc = useMemo(() => mncData ? computeBrandMetrics(mncData, mncRange.from, mncRange.to) : null, [mncData, mncRange])

  // ── GOL data fetch ──
  const golRange = useMemo(() => clamp(activeFrom, activeTo, golBounds), [activeFrom, activeTo, golBounds])
  const golFetchFrom = useMemo(() => golBounds ? bufferFrom(golRange.from, golBounds.earliest) : golRange.from, [golRange.from, golBounds])
  const { data: golData, isLoading: golLoading } = useQuery({
    queryKey: ['overview-gol', golFetchFrom, golRange.to, refreshNonce],
    queryFn: async () => {
      const res = await fetch(`${D1_WORKER_URL}/v2/consumer-goods?brand=GOL&from=${golFetchFrom}&to=${golRange.to}${refreshNonce > 0 ? '&bust=' + Date.now() : ''}`)
      return (await res.json()) as BrandData
    },
    enabled: !!golRange.from && !!golRange.to,
    staleTime: 5 * 60_000,
  })

  // ── GOL computed metrics ──
  const gol = useMemo(() => golData ? computeBrandMetrics(golData, golRange.from, golRange.to) : null, [golData, golRange])

  // ── MCI data fetch ──
  const mciRange = useMemo(() => clamp(activeFrom, activeTo, mciBounds), [activeFrom, activeTo, mciBounds])
  const mciFetchFrom = useMemo(() => mciBounds ? bufferFrom(mciRange.from, mciBounds.earliest) : mciRange.from, [mciRange.from, mciBounds])
  const { data: mciData, isLoading: mciLoading } = useQuery({
    queryKey: ['overview-mci', mciFetchFrom, mciRange.to, refreshNonce],
    queryFn: async () => {
      const res = await fetch(`${D1_WORKER_URL}/v2/consumer-goods?brand=MCI&from=${mciFetchFrom}&to=${mciRange.to}${refreshNonce > 0 ? '&bust=' + Date.now() : ''}`)
      return (await res.json()) as BrandData
    },
    enabled: !!mciRange.from && !!mciRange.to,
    staleTime: 5 * 60_000,
  })

  // ── MCI computed metrics (CPR + CPV, no ROAS) ──
  const mci = useMemo(() => {
    if (!mciData) return null
    const MCI_SKUS = new Set(['CEK', 'A1C', 'WCA'])
    const perf = mciData.performance ?? []
    const conv = mciData.conversions ?? []
    const ga4 = (mciData.ga4 ?? []) as { date: string; ga4_first_visit?: number; ga4_page_view?: number }[]

    const totalSpend = perf.filter(r => r.date >= mciRange.from && r.date <= mciRange.to).reduce((s, r) => s + (r.ad_spend ?? 0), 0)
    const totalFormSubs = conv.filter(r => r.date >= mciRange.from && r.date <= mciRange.to).reduce((s, r) => s + ((r as any).mongo_form_submission ?? 0), 0)
    const totalFormConv = conv.filter(r => r.date >= mciRange.from && r.date <= mciRange.to).reduce((s, r) => s + ((r as any).mongo_form_conversion ?? 0), 0)
    const totalVisits = ga4.filter(r => r.date >= mciRange.from && r.date <= mciRange.to).reduce((s, r) => s + (r.ga4_first_visit ?? 0), 0)

    const cpr = totalFormSubs > 0 ? totalSpend / totalFormSubs : 0
    const cpv = totalFormConv > 0 ? totalSpend / totalFormConv : 0

    // Build spend by date (filtered by MCI_SKUS, matching HealthcareDashboard)
    const spendByDate = new Map<string, number>()
    for (const r of perf) {
      if (!r.sku || r.sku === '-' || !MCI_SKUS.has(r.sku)) continue
      spendByDate.set(r.date, (spendByDate.get(r.date) ?? 0) + (r.ad_spend ?? 0))
    }

    // Build form submissions by date (filtered by MCI_SKUS)
    const subsByDate = new Map<string, number>()
    for (const r of conv) {
      if (!(r as any).sku || (r as any).sku === '-' || !MCI_SKUS.has((r as any).sku)) continue
      subsByDate.set(r.date, (subsByDate.get(r.date) ?? 0) + ((r as any).mongo_form_submission ?? 0))
    }

    // Build form conversions by date (filtered by MCI_SKUS)
    const convByDate = new Map<string, number>()
    for (const r of conv) {
      if (!(r as any).sku || (r as any).sku === '-' || !MCI_SKUS.has((r as any).sku)) continue
      convByDate.set(r.date, (convByDate.get(r.date) ?? 0) + ((r as any).mongo_form_conversion ?? 0))
    }

    const allDates = Array.from(new Set([...spendByDate.keys(), ...subsByDate.keys()])).sort()

    // CPR series (7d MA)
    const cprDaily = allDates.map(d => ({ date: d, spend: spendByDate.get(d) ?? 0, subs: subsByDate.get(d) ?? 0 }))
    const cprSeries = cprDaily.map((dd, i) => {
      const slice = cprDaily.slice(Math.max(0, i - 6), i + 1)
      const ts = slice.reduce((s, d) => s + d.spend, 0)
      const tsubs = slice.reduce((s, d) => s + d.subs, 0)
      return { date: dd.date, value: tsubs > 0 ? ts / tsubs : 0 }
    }).filter(p => p.value > 0).filter(p => p.date >= mciRange.from)

    // CPV series (21d MA)
    const cpvDaily = allDates.map(d => ({ date: d, spend: spendByDate.get(d) ?? 0, conv: convByDate.get(d) ?? 0 }))
    const cpvSeries = cpvDaily.map((dd, i) => {
      const slice = cpvDaily.slice(Math.max(0, i - 20), i + 1)
      const ts = slice.reduce((s, d) => s + d.spend, 0)
      const tc = slice.reduce((s, d) => s + d.conv, 0)
      return { date: dd.date, value: tc > 0 ? ts / tc : 0 }
    }).filter(p => p.value > 0).filter(p => p.date >= mciRange.from)

    // Visit Rate series (21d MA, same as CPV) = form_conversion / form_submission
    const vrDaily = allDates.map(d => ({ date: d, subs: subsByDate.get(d) ?? 0, conv: convByDate.get(d) ?? 0 }))
    const visitRateSeries = vrDaily.map((dd, i) => {
      const slice = vrDaily.slice(Math.max(0, i - 20), i + 1)
      const tsubs = slice.reduce((s, d) => s + d.subs, 0)
      const tconv = slice.reduce((s, d) => s + d.conv, 0)
      return { date: dd.date, value: tsubs > 0 ? (tconv / tsubs) * 100 : 0 }
    }).filter(p => p.value > 0).filter(p => p.date >= mciRange.from)

    const visitRate = totalFormSubs > 0 ? (totalFormConv / totalFormSubs) * 100 : 0

    const changelog = (mciData.changelog ?? []) as ChangelogRow[]

    return { totalSpend, totalFormSubs, totalFormConv, totalVisits, cpr, cpv, visitRate, cprSeries, cpvSeries, visitRateSeries, changelog }
  }, [mciData, mciRange])

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
          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', color: '#818cf8', textTransform: 'uppercase' }}>General Overview</span>
        </div>
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
        <button
          onClick={handleRefresh}
          disabled={isRefreshing}
          title="Refresh"
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

      {/* ── Content ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 40, width: '100%' }}>

        {/* MNC Brand Snapshot */}
        {mncLoading || !mnc ? (
          <div style={{ padding: "20px 0", textAlign: "center", color: "rgba(255,255,255,0.2)", fontSize: 12 }}>
            {mncLoading ? "Loading MNC data…" : "No data available"}
          </div>
        ) : (
          <SkuPerformanceCard
            sku="MNC"
            skuLabel="MNC"
            productName="mGanik Nutrition"
            skuColor="#f97316"
            imageSrc={mncLogo}
            totalCprl={mnc.cprl}
            totalCpaCC={mnc.cpaCC}
            cprlSeries={mnc.cprlSeries}
            cpaSeries={mnc.cpaSeries}
            totalCtr={0}
            totalLpvo={0}
            totalVo2l={0}
            ctrSeries={[]}
            lpvoSeries={[]}
            vo2lSeries={[]}
            globalCtrAvg={0}
            globalLpvoAvg={0}
            globalVo2lAvg={0}
            cprlTarget={150_000}
            cpaTarget={2_000_000}
            changelog={mnc.changelog}
            totalRoas={mnc.roas}
            roasTarget={6.59}
            roasLabel="RoAS"
            roasSeries={mnc.roasSeries}
            compactLayout
          />
        )}

        {/* GOL Brand Snapshot */}
        {golLoading || !gol ? (
          <div style={{ padding: "20px 0", textAlign: "center", color: "rgba(255,255,255,0.2)", fontSize: 12 }}>
            {golLoading ? "Loading GOL data…" : "No data available"}
          </div>
        ) : (
          <SkuPerformanceCard
            sku="GOL"
            skuLabel="GOL"
            productName="GOLO"
            skuColor="#84cc16"
            imageSrc={golLogo}
            totalCprl={gol.cprl}
            totalCpaCC={gol.cpaCC}
            cprlSeries={gol.cprlSeries}
            cpaSeries={gol.cpaSeries}
            totalCtr={0}
            totalLpvo={0}
            totalVo2l={0}
            ctrSeries={[]}
            lpvoSeries={[]}
            vo2lSeries={[]}
            globalCtrAvg={0}
            globalLpvoAvg={0}
            globalVo2lAvg={0}
            cprlTarget={gol.cprlSeries.length > 0 ? Math.round(gol.cprlSeries.reduce((s, p) => s + p.value, 0) / gol.cprlSeries.length) : 150_000}
            cpaTarget={2_000_000}
            changelog={gol.changelog}
            totalRoas={gol.roas}
            roasTarget={6.59}
            roasLabel="RoAS"
            roasSeries={gol.roasSeries}
            compactLayout
          />
        )}

        {/* MCI Brand Snapshot */}
        {mciLoading || !mci ? (
          <div style={{ padding: "20px 0", textAlign: "center", color: "rgba(255,255,255,0.2)", fontSize: 12 }}>
            {mciLoading ? "Loading MCI data…" : "No data available"}
          </div>
        ) : (
          <SkuPerformanceCard
            sku="MCI"
            skuLabel="MCI"
            productName="mGanik Care"
            skuColor="#34d399"
            imageSrc={mciLogo}
            totalCprl={mci.cpr}
            totalCpaCC={mci.cpv}
            cprlSeries={mci.cprSeries}
            cpaSeries={mci.cpvSeries}
            totalCtr={0}
            totalLpvo={0}
            totalVo2l={0}
            ctrSeries={[]}
            lpvoSeries={[]}
            vo2lSeries={[]}
            globalCtrAvg={0}
            globalLpvoAvg={0}
            globalVo2lAvg={0}
            cprlTarget={100_000}
            cpaTarget={500_000}
            cprlLabel="CPR"
            cpaLabel="CPV"
            changelog={mci.changelog}
            totalRoas={mci.visitRate}
            roasTarget={50}
            roasLabel="Visit Rate"
            roasIsPercentage={true}
            roasSeries={mci.visitRateSeries}
            compactLayout
          />
        )}

      </div>
    </div>
  )
}
