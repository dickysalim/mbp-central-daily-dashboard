/**
 * AdsPlatformPage — KPI overview broken down by Ads Platform (META, DGEN)
 *
 * Reuses the exact same SKUCard component as ProductPerformancePage.
 * Rows without a valid SKU tag are excluded at the DB layer.
 */

import { useState, useMemo, useEffect } from 'react'
import { useQuery, keepPreviousData } from '@tanstack/react-query'
import { D1_WORKER_URL } from '../config/dataSource'
import {
  TARGET_CPR, TARGET_CPA_CC, TARGET_ROAS_CC,
  PRESETS, dateStr,
  SKUCard,
} from './DirectorPage'
import type { SKUTotals, SparkPoint } from './DirectorPage'

// ── Types ────────────────────────────────────────────────────────────────────

interface PlatformRow {
  date: string
  brand: string
  traffic_source: string
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

// ── Main Page ────────────────────────────────────────────────────────────────

export function AdsPlatformPage() {
  // ── Per-brand date bounds from DB ──
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

  const brands = useMemo(() => brandBounds?.map(b => b.brand) ?? [], [brandBounds])

  // ── Brand state ──
  const [brand, setBrand] = useState('')
  useEffect(() => {
    if (brands.length > 0 && !brand) setBrand(brands[0])
  }, [brands, brand])

  const activeBrand = brand || brands[0] || ''
  const activeBounds = useMemo(
    () => brandBounds?.find(b => b.brand === activeBrand),
    [brandBounds, activeBrand],
  )

  // ── Date state ──
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [lastBrand, setLastBrand] = useState('')

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

  // ── Quick presets ──
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

  // ── Data fetch grouped by traffic_source ──
  const { data: rawData, isLoading, error } = useQuery({
    queryKey: ['ads-platform-daily', activeFrom, activeTo, activeBrand],
    queryFn: async () => {
      const url = `${D1_WORKER_URL}/v2/ads-platform-daily?from=${activeFrom}&to=${activeTo}&brand=${activeBrand}`
      const res = await fetch(url)
      if (!res.ok) throw new Error('Failed to fetch ads platform data')
      return res.json() as Promise<PlatformRow[]>
    },
    staleTime: 5 * 60_000,
    placeholderData: keepPreviousData, // keeps cards visible while new date range loads
    enabled: !!activeFrom && !!activeTo && !!activeBrand && activeFrom <= activeTo,
  })

  // ── Platforms available in this data ──
  const platforms = useMemo(() => {
    if (!rawData) return []
    return Array.from(new Set(rawData.map(r => r.traffic_source))).sort()
  }, [rawData])

  // ── Totals per platform (same shape as SKUTotals) ──
  const platformTotals = useMemo(() => {
    if (!rawData) return {} as Record<string, SKUTotals>
    const map: Record<string, SKUTotals> = {}
    for (const r of rawData) {
      const p = r.traffic_source
      if (!map[p]) map[p] = { spend: 0, realLeads: 0, purchasesCcom: 0, revenueCcom: 0 }
      map[p].spend += r.ad_spend
      map[p].realLeads += r.real_lead_ccom + r.real_lead_d2or + r.real_lead_mpsh + r.real_lead_ofls
      map[p].purchasesCcom += r.purchase_ccom
      map[p].revenueCcom += r.purchase_ccom_revenue
    }
    return map
  }, [rawData])

  // ── Daily trends per platform ──
  const platformTrends = useMemo(() => {
    if (!rawData) return {} as Record<string, { cpr: SparkPoint[]; cpa: SparkPoint[]; roas: SparkPoint[] }>
    const map: Record<string, Map<string, { spend: number; realLeads: number; purchases: number; revenue: number }>> = {}
    for (const r of rawData) {
      const p = r.traffic_source
      if (!map[p]) map[p] = new Map()
      const existing = map[p].get(r.date)
      const rl = r.real_lead_ccom + r.real_lead_d2or + r.real_lead_mpsh + r.real_lead_ofls
      if (existing) {
        existing.spend += r.ad_spend
        existing.realLeads += rl
        existing.purchases += r.purchase_ccom
        existing.revenue += r.purchase_ccom_revenue
      } else {
        map[p].set(r.date, { spend: r.ad_spend, realLeads: rl, purchases: r.purchase_ccom, revenue: r.purchase_ccom_revenue })
      }
    }
    const result: Record<string, { cpr: SparkPoint[]; cpa: SparkPoint[]; roas: SparkPoint[] }> = {}
    for (const p of platforms) {
      const dayMap = map[p]
      if (!dayMap) { result[p] = { cpr: [], cpa: [], roas: [] }; continue }
      const sorted = Array.from(dayMap.entries()).sort(([a], [b]) => a.localeCompare(b))
      result[p] = {
        cpr: sorted.filter(([, d]) => d.realLeads > 0).map(([date, d]) => ({ date, value: d.spend / d.realLeads })),
        cpa: sorted.filter(([, d]) => d.purchases > 0).map(([date, d]) => ({ date, value: d.spend / d.purchases })),
        roas: sorted.filter(([, d]) => d.spend > 0).map(([date, d]) => ({ date, value: d.revenue / d.spend })),
      }
    }
    return result
  }, [rawData, platforms])

  const globalMaxDevs = { cpr: 150_000, cpa: 3_000_000, roas: 0.1 }

  return (
    <div className="dp-page">
      {/* Toolbar */}
      <div className="dp-toolbar">
        <div className="dp-toolbar-left">
          <h1 className="dp-title">Ads Platform Performance</h1>
          <span className="dp-subtitle">{activeFrom} → {activeTo}</span>
        </div>
        <div className="dp-toolbar-right">
          <select className="dp-select" value={activeBrand} onChange={e => setBrand(e.target.value)}>
            {brands.map(b => <option key={b} value={b}>{b}</option>)}
          </select>
          <input type="date" className="dp-date-input" value={activeFrom}
            min={activeBounds?.earliest} max={activeBounds?.latest}
            onChange={e => {
              const v = e.target.value
              if (!v) return
              setFrom(v)
              if (v > activeTo) setTo(v)
            }} />
          <span className="dp-date-sep">→</span>
          <input type="date" className="dp-date-input" value={activeTo}
            min={activeBounds?.earliest} max={activeBounds?.latest}
            onChange={e => {
              const v = e.target.value
              if (!v) return
              setTo(v)
              if (v < activeFrom) setFrom(v)
            }} />
          <div className="tv-presets">
            {PRESETS.map(p => (
              <button key={p.label} className="tv-preset" onClick={() => applyPreset(p.days)}>
                {p.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {error && (
        <div className="dp-footnote" style={{ color: '#ef4444', borderColor: 'rgba(239,68,68,0.2)' }}>
          ❌ Failed to load data: {error instanceof Error ? error.message : 'Unknown error'}
        </div>
      )}

      {/* Platform Cards — exact same SKUCard, platform name as the "sku" key */}
      <div className="dp-cards">
        {platforms.length === 0 && isLoading && (
          <div className="dp-card-loading"><div className="tv-spinner" /><span>Loading platforms…</span></div>
        )}
        {platforms.map((platform, idx) => (
          <SKUCard
            key={platform}
            sku={platform}
            skuIdx={idx}
            totals={platformTotals[platform] || null}
            dailyCPR={platformTrends[platform]?.cpr || []}
            dailyCPA={platformTrends[platform]?.cpa || []}
            dailyRoAS={platformTrends[platform]?.roas || []}
            maxDevs={globalMaxDevs}
            isLoading={isLoading}
          />
        ))}
      </div>

      <div className="dp-footnote">
        📊 Spend from <strong>Ads Platform APIs</strong> · Real Leads & Purchases from <strong>MongoDB ground truth</strong>.
        Rows without a SKU tag are excluded. CPR = Spend ÷ Real Leads · CPA CC = Spend ÷ Purchase CCOM · RoAS CC = Revenue CC ÷ Spend.
      </div>
    </div>
  )
}
