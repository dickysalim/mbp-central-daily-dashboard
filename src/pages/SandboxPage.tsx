/**
 * SandboxPage — Design laboratory
 */
import { useState, useMemo, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { D1_WORKER_URL } from '../config/dataSource'
import { fmtIDR, dateStr, capToH2, PRESETS } from './ProductPerformancePage'
import { AdSpendHealthCard } from '../components/cards/AdSpendHealthCard'
import { AdsPerformanceHealthCard } from '../components/cards/AdsPerformanceHealthCard'
import { LeadsQualityCard } from '../components/cards/LeadsQualityCard'
import { AtlPerformanceCard } from '../components/cards/AtlPerformanceCard'
import { SkuPerformanceCard } from '../components/cards/SkuPerformanceCard'
import superfoodImg  from '../assets/sku_images/Superfood.webp'
import metafiberImg  from '../assets/sku_images/Metafiber.webp'
import nightsureImg  from '../assets/sku_images/Nightsure.webp'
import threePeptideImg from '../assets/sku_images/3Peptide.webp'

const fmtFull = (n: number) =>
  'Rp ' + Math.round(n).toLocaleString('id-ID')

// ── Local types ──────────────────────────────────────────────────────────────
interface AggRow {
  date: string; sku: string; ad_spend: number
  real_lead_ccom: number; real_lead_d2or: number
  real_lead_mpsh: number; real_lead_ofls: number
  purchase_ccom: number; purchase_ccom_revenue: number
  impressions: number; link_click: number
  attributed_results: number; attributed_acquisition: number
  attributed_acquisition_revenue: number
  ga4_first_visit: number; ga4_page_view: number; ga4_view_offer: number
}
interface BrandBounds { brand: string; earliest: string; latest: string; skus: string[] }
interface TargetRow { sku: string; date: string; daily_ad_spend: number; monthly_ad_spend: number }
interface BudgetSettingRow { sku: string; daily_ad_spend: number; latest_date: string }
interface CampaignBudgetRow { campaign_id: string; campaign_name: string; daily_budget: number; latest_date: string }
interface ChangelogRow { date: string; date_end: string | null; brand: string; sku: string; title: string; changelist: string }
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
  const brands = useMemo(() => brandBounds?.map(b => b.brand) ?? [], [brandBounds])
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

  // ── Queries ──
  const { data: rawData } = useQuery({
    queryKey: ['overview-agg', activeFrom, activeTo, activeBrand],
    queryFn: async () => {
      if (!activeFrom || !activeTo || !activeBrand) return [] as AggRow[]
      const res = await fetch(`${D1_WORKER_URL}/v2/director-daily?brand=${activeBrand}&from=${activeFrom}&to=${activeTo}`)
      if (!res.ok) throw new Error()
      return res.json() as Promise<AggRow[]>
    },
    enabled: !!activeFrom && !!activeTo && !!activeBrand,
    staleTime: 5 * 60_000,
  })

  const { data: targetData } = useQuery({
    queryKey: ['target-ad-spend', activeFrom, activeTo, activeBrand],
    queryFn: async () => {
      if (!activeFrom || !activeTo || !activeBrand) return [] as TargetRow[]
      const res = await fetch(`${D1_WORKER_URL}/v2/target-ad-spend?brand=${activeBrand}&from=${activeFrom}&to=${activeTo}`)
      if (!res.ok) return [] as TargetRow[]
      return res.json() as Promise<TargetRow[]>
    },
    enabled: !!activeFrom && !!activeTo && !!activeBrand,
    staleTime: 5 * 60_000,
  })

  const { data: budgetSettingData } = useQuery({
    queryKey: ['daily-budget-setting', activeBrand, activeTo],
    queryFn: async () => {
      if (!activeBrand || !activeTo) return [] as BudgetSettingRow[]
      const res = await fetch(`${D1_WORKER_URL}/v2/daily-budget-setting?brand=${activeBrand}&to=${activeTo}`)
      if (!res.ok) return [] as BudgetSettingRow[]
      return res.json() as Promise<BudgetSettingRow[]>
    },
    enabled: !!activeBrand && !!activeTo,
    staleTime: 10 * 60_000,
  })

  const { data: campaignBudgetData } = useQuery({
    queryKey: ['campaign-budget-setting', activeBrand, activeTo],
    queryFn: async () => {
      if (!activeBrand || !activeTo) return [] as CampaignBudgetRow[]
      const res = await fetch(`${D1_WORKER_URL}/v2/campaign-budget-setting?brand=${activeBrand}&to=${activeTo}`)
      if (!res.ok) return [] as CampaignBudgetRow[]
      return res.json() as Promise<CampaignBudgetRow[]>
    },
    enabled: !!activeBrand && !!activeTo,
    staleTime: 10 * 60_000,
  })

  const { data: changelogData } = useQuery({
    queryKey: ['changelog', activeFrom, activeTo],
    queryFn: async () => {
      const res = await fetch(`${D1_WORKER_URL}/v2/changelog?from=${activeFrom}&to=${activeTo}`)
      if (!res.ok) return [] as ChangelogRow[]
      return res.json() as Promise<ChangelogRow[]>
    },
    enabled: !!activeFrom && !!activeTo,
    staleTime: 10 * 60_000,
  })
  const filteredChangelog = useMemo(() => {
    if (!activeBrand || !changelogData) return [] as ChangelogRow[]
    return changelogData.filter(e => e.brand.split(',').map(b => b.trim()).some(b => b === activeBrand || b.startsWith(activeBrand)))
  }, [changelogData, activeBrand])

  // ── Derived metrics ──
  const totalSpend = useMemo(() => (rawData ?? []).reduce((s, r) => s + r.ad_spend, 0), [rawData])
  const totalTarget = useMemo(() => (targetData ?? []).reduce((s, r) => s + r.daily_ad_spend, 0), [targetData])
  const dailyBudget = useMemo(() => (budgetSettingData ?? []).reduce((s, r) => s + r.daily_ad_spend, 0), [budgetSettingData])
  const budgetSettingDate = budgetSettingData?.[0]?.latest_date ?? ''
  const campaignBudgetTotal = useMemo(() => (campaignBudgetData ?? []).reduce((s, r) => s + r.daily_budget, 0), [campaignBudgetData])
  const campaignBudgetDate = campaignBudgetData?.[0]?.latest_date ?? ''

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
    return Array.from(byDate.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, { spend, purchases }]) => ({ date, value: purchases > 0 ? spend / purchases : 0 }))
      .filter(p => p.value > 0)
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
        cpaSeries: byDate({ s: 0, p: 0 }, (p, r) => ({ s: p.s + r.ad_spend, p: p.p + r.purchase_ccom }))
          .map(([date, { s, p }]) => ({ date, value: p > 0 ? s / p : 0 })).filter(p => p.value > 0),
        lpvoSeries: byDate({ vo: 0, pv: 0 }, (p, r) => ({ vo: p.vo + (r.ga4_view_offer ?? 0), pv: p.pv + r.ga4_page_view }))
          .map(([date, { vo, pv }]) => ({ date, value: pv > 0 ? (vo / pv) * 100 : 0 })).filter(p => p.value > 0),
        vo2lSeries: byDate({ l: 0, vo: 0 }, (p, r) => ({ l: p.l + r.real_lead_ccom + r.real_lead_d2or + r.real_lead_mpsh + r.real_lead_ofls, vo: p.vo + (r.ga4_view_offer ?? 0) }))
          .map(([date, { l, vo }]) => ({ date, value: vo > 0 ? (l / vo) * 100 : 0 })).filter(p => p.value > 0),
      }
    }
    return out
  }, [rawData])

  // ── Per-SKU budget data ───────────────────────────────────────────────────────
  const skuBudgets = useMemo(() => {
    const skuList = ['MSF', 'MTA', 'MNS', 'M3P'] as const
    const out = {} as Record<string, { spend: number; periodBudget: number; dailyBudget: number; targetDailyBudget: number; budgetDate: string }>
    // days in range
    const d = (!activeFrom || !activeTo) ? 0
      : Math.round((new Date(activeTo).getTime() - new Date(activeFrom).getTime()) / 86_400_000) + 1
    for (const sku of skuList) {
      const rows = (rawData ?? []).filter(r => r.sku === sku)
      const spend = rows.reduce((s, r) => s + r.ad_spend, 0)
      const periodTarget = (targetData ?? []).filter(r => r.sku === sku).reduce((s, r) => s + r.daily_ad_spend, 0)
      const budgetRow = (budgetSettingData ?? []).find(r => r.sku === sku)
      const dailyBud = budgetRow?.daily_ad_spend ?? 0
      // most-recent daily target for this SKU
      const skuTargetRows = (targetData ?? []).filter(r => r.sku === sku)
      const latestTarget  = skuTargetRows.sort((a, b) => b.date.localeCompare(a.date))[0]
      const targetDailyBudget = latestTarget?.daily_ad_spend ?? 0
      // mirror top-card logic: prefer dailyBudget × days, fall back to sum of target rows
      const periodBudget = dailyBud > 0 ? dailyBud * d : periodTarget
      out[sku] = {
        spend,
        periodBudget,
        dailyBudget: dailyBud,
        targetDailyBudget,
        budgetDate:  budgetRow?.latest_date ?? '',
      }
    }
    return out
  }, [rawData, targetData, budgetSettingData, activeFrom, activeTo])

  // Period budget
  const days = useMemo(() => {
    if (!activeFrom || !activeTo) return 0
    const diff = new Date(activeTo).getTime() - new Date(activeFrom).getTime()
    return Math.round(diff / 86_400_000) + 1
  }, [activeFrom, activeTo])
  const periodBudget = dailyBudget > 0 ? dailyBudget * days : totalTarget
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

  // suppress unused vars (kept for future cards)
  void fmtFull; void fmtIDR; void totalTarget; void statusColor; void statusLabel

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
          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', color: '#818cf8', textTransform: 'uppercase' }}>B2C Business Dashboard</span>
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
      </div>

      {/* ── Shared column — width governed by top row's natural card widths ── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 28, width: '100%' }}>

        {/* Top cards row */}
        <div style={{ display: 'flex', gap: 28, alignItems: 'stretch', flexWrap: 'wrap' }}>

          {/* Ad Spend Health Card */}
          <AdSpendHealthCard
            totalSpend={totalSpend}
            periodBudget={periodBudget}
            dailyBudget={dailyBudget}
            campaignBudgetTotal={campaignBudgetTotal}
            budgetDate={campaignBudgetDate || budgetSettingDate}
          />

          {/* Ads Performance Health Card */}
          <AdsPerformanceHealthCard
            totalSpend={totalSpend}
            realLeadCcom={totalLeadCcom}
            realLeadD2or={totalLeadD2or}
            realLeadMpsh={totalLeadMpsh}
            realLeadOfls={totalLeadOfls}
            cprlSeries={cprlSeries}
            changelog={filteredChangelog}
          />

          {/* Leads Quality Card */}
          <LeadsQualityCard
            totalSpend={totalSpend}
            purchaseCcom={totalPurchaseCcom}
            purchaseBySku={purchaseBySku}
            cpaSeries={cpaSeries}
            changelog={filteredChangelog}
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

        {/* SKU Performance Cards — 2-column grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(480px, 1fr))', gap: 40, marginTop: 20 }}>
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
              />
            )
          })}
        </div>

      </div>

    </div>
  )
}
