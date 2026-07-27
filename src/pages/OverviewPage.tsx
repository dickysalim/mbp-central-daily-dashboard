/**
 * MacroOverviewPage — Top-level aggregated view across ALL brands and SKUs
 *
 * Shows a single unified card with total KPIs (spend, leads, purchases, revenue)
 * and daily trend sparklines — no brand/SKU breakdown.
 *
 * Data: director-daily endpoint without brand filter → aggregated across everything.
 */

import { useState, useMemo, useEffect } from 'react'
import { useQuery, keepPreviousData } from '@tanstack/react-query'
import { D1_WORKER_URL } from '../config/dataSource'
import {
  TARGET_CPR, TARGET_CPA_CC, TARGET_ROAS_CC,
  PRESETS, dateStr, fmtIDR, fmtNum,
  Sparkline, getSkuMeta,
} from './ProductPerformancePage'
import type { SparkPoint, ChangelogEntry } from './ProductPerformancePage'

// ── Types ────────────────────────────────────────────────────────────────────

interface AggRow {
  date: string
  sku: string
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

interface BrandBounds {
  brand: string
  earliest: string
  latest: string
  skus: string[]
}

// ── Main Page ────────────────────────────────────────────────────────────────

export function OverviewPage() {
  // ── Per-brand date bounds from DB ──
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

  // ── Fetch data scoped to brand ──
  const { data: rawData, isLoading, error } = useQuery({
    queryKey: ['macro-overview', activeFrom, activeTo, activeBrand],
    queryFn: async () => {
      const url = `${D1_WORKER_URL}/v2/director-daily?from=${activeFrom}&to=${activeTo}&brand=${activeBrand}`
      const res = await fetch(url)
      if (!res.ok) throw new Error('Failed to fetch macro data')
      return res.json() as Promise<AggRow[]>
    },
    staleTime: 5 * 60_000,
    placeholderData: keepPreviousData,
    enabled: !!activeFrom && !!activeTo && !!activeBrand && activeFrom <= activeTo,
  })

  // ── Fetch changelog data ──
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

  const filteredChangelog = useMemo(() => {
    const cl = changelogData ?? []
    if (!activeBrand) return []
    return cl.filter(e => {
      const brands = e.brand.split(',').map(b => b.trim())
      if (!brands.some(b => b === activeBrand)) return false
      return true
    })
  }, [changelogData, activeBrand])

  // ── Aggregate totals across all SKUs within brand ──
  const totals = useMemo(() => {
    if (!rawData || rawData.length === 0) return null
    let spend = 0, impressions = 0, clicks = 0, realLeads = 0, purchases = 0, revenue = 0
    for (const r of rawData) {
      spend += r.ad_spend
      impressions += r.impressions
      clicks += r.link_click
      realLeads += r.real_lead_ccom + r.real_lead_d2or + r.real_lead_mpsh + r.real_lead_ofls
      purchases += r.purchase_ccom
      revenue += r.purchase_ccom_revenue
    }
    return { spend, impressions, clicks, realLeads, purchases, revenue }
  }, [rawData])

  // ── Daily trends ──
  const trends = useMemo(() => {
    const empty = { cpr: [] as SparkPoint[], cpa: [] as SparkPoint[], roas: [] as SparkPoint[], cpm: [] as SparkPoint[], ctr: [] as SparkPoint[] }
    if (!rawData || rawData.length === 0) return empty
    const dayMap = new Map<string, { spend: number; impressions: number; clicks: number; realLeads: number; purchases: number; revenue: number }>()
    for (const r of rawData) {
      const rl = r.real_lead_ccom + r.real_lead_d2or + r.real_lead_mpsh + r.real_lead_ofls
      const existing = dayMap.get(r.date)
      if (existing) {
        existing.spend += r.ad_spend; existing.impressions += r.impressions; existing.clicks += r.link_click
        existing.realLeads += rl; existing.purchases += r.purchase_ccom; existing.revenue += r.purchase_ccom_revenue
      } else {
        dayMap.set(r.date, { spend: r.ad_spend, impressions: r.impressions, clicks: r.link_click, realLeads: rl, purchases: r.purchase_ccom, revenue: r.purchase_ccom_revenue })
      }
    }
    const sorted = Array.from(dayMap.entries()).sort(([a], [b]) => a.localeCompare(b))
    return {
      cpr: sorted.filter(([, d]) => d.realLeads > 0).map(([date, d]) => ({ date, value: d.spend / d.realLeads })),
      cpa: sorted.filter(([, d]) => d.purchases > 0).map(([date, d]) => ({ date, value: d.spend / d.purchases })),
      roas: sorted.filter(([, d]) => d.spend > 0).map(([date, d]) => ({ date, value: d.revenue / d.spend })),
      cpm: sorted.filter(([, d]) => d.impressions > 0).map(([date, d]) => ({ date, value: (d.spend / d.impressions) * 1000 })),
      ctr: sorted.filter(([, d]) => d.impressions > 0).map(([date, d]) => ({ date, value: (d.clicks / d.impressions) * 100 })),
    }
  }, [rawData])

  // ── Computed KPIs ──
  const cpr = totals && totals.realLeads > 0 ? totals.spend / totals.realLeads : 0
  const cpaCcom = totals && totals.purchases > 0 ? totals.spend / totals.purchases : 0
  const roasCc = totals && totals.spend > 0 ? totals.revenue / totals.spend : 0
  const cprOk = cpr > 0 && cpr <= TARGET_CPR
  const cpaOk = cpaCcom > 0 && cpaCcom <= TARGET_CPA_CC
  const roasOk = roasCc >= TARGET_ROAS_CC

  const cprDelta = cpr > 0 ? ((cpr - TARGET_CPR) / TARGET_CPR) * 100 : 0
  const cpaDelta = cpaCcom > 0 ? ((cpaCcom - TARGET_CPA_CC) / TARGET_CPA_CC) * 100 : 0
  const roasDelta = roasCc > 0 ? ((roasCc - TARGET_ROAS_CC) / TARGET_ROAS_CC) * 100 : 0

  // ── Owned/Earned KPIs ──
  const cpm = totals && totals.impressions > 0 ? (totals.spend / totals.impressions) * 1000 : 0
  const ctr = totals && totals.impressions > 0 ? (totals.clicks / totals.impressions) * 100 : 0

  // ── Per-SKU CPM/CTR breakdown ──
  const SKU_ORDER = ['MSF', 'MTA', 'MNS', 'M3P']
  const skuMetrics = useMemo(() => {
    if (!rawData || rawData.length === 0) return []
    const map: Record<string, { spend: number; impressions: number; clicks: number }> = {}
    for (const r of rawData) {
      if (!r.sku || r.sku === '-') continue
      if (!map[r.sku]) map[r.sku] = { spend: 0, impressions: 0, clicks: 0 }
      map[r.sku].spend += r.ad_spend
      map[r.sku].impressions += r.impressions
      map[r.sku].clicks += r.link_click
    }
    return Object.entries(map)
      .sort(([a], [b]) => {
        const ai = SKU_ORDER.indexOf(a)
        const bi = SKU_ORDER.indexOf(b)
        return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi)
      })
      .map(([sku, d]) => ({
        sku,
        cpm: d.impressions > 0 ? (d.spend / d.impressions) * 1000 : 0,
        ctr: d.impressions > 0 ? (d.clicks / d.impressions) * 100 : 0,
      }))
  }, [rawData])

  return (
    <div className="dp-page">
      {/* Toolbar */}
      <div className="dp-toolbar">
        <div className="dp-toolbar-left">
          <h1 className="dp-title">Macro Overview</h1>
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

      {/* ── Section 1: Macro Overview ── */}
      <div className="dp-cards">
        <h2 className="mo-section-title">Macro Overview</h2>
        <div className="dp-card">
          {isLoading && !totals ? (
            <div className="dp-card-loading">
              <div className="tv-spinner" />
              <span>Loading…</span>
            </div>
          ) : !totals ? (
            <div className="dp-card-loading"><span>No data</span></div>
          ) : (
            <div className="dp-card-body">
              {/* Card content */}
              <div className="dp-card-content">
                {/* KPI row */}
                <div className="dp-kpi-row">
                  {/* Real Leads */}
                  <div className="dp-kpi">
                    <div className="dp-kpi-label">Real Leads</div>
                    <div className="dp-kpi-value" style={{ color: '#e0e2e6' }}>{fmtNum(totals.realLeads)}</div>
                  </div>
                  <div className="dp-kpi-divider" />
                  {/* CPR */}
                  <div className="dp-kpi">
                    <div className="dp-kpi-label">CPR</div>
                    <div className={`dp-kpi-value ${cprOk ? 'dp-kpi-good' : 'dp-kpi-bad'}`}>
                      {cpr > 0 ? fmtIDR(cpr) : '—'}
                    </div>
                    {cpr > 0 && (
                      <div className={`dp-kpi-delta ${cprDelta <= 0 ? 'dp-delta-good' : 'dp-delta-bad'}`}>
                        {cprDelta <= 0 ? '▼' : '▲'} {Math.abs(cprDelta).toFixed(0)}% vs target
                      </div>
                    )}
                    <div className="dp-kpi-target">Target: {fmtIDR(TARGET_CPR)}</div>
                  </div>
                  <div className="dp-kpi-divider" />
                  {/* Purchases CC */}
                  <div className="dp-kpi">
                    <div className="dp-kpi-label">Purchases CC</div>
                    <div className="dp-kpi-value" style={{ color: '#e0e2e6' }}>{fmtNum(totals.purchases)}</div>
                  </div>
                  <div className="dp-kpi-divider" />
                  {/* CPA CC */}
                  <div className="dp-kpi">
                    <div className="dp-kpi-label">CPA CC</div>
                    <div className={`dp-kpi-value ${cpaOk ? 'dp-kpi-good' : 'dp-kpi-bad'}`}>
                      {cpaCcom > 0 ? fmtIDR(cpaCcom) : '—'}
                    </div>
                    {cpaCcom > 0 && (
                      <div className={`dp-kpi-delta ${cpaDelta <= 0 ? 'dp-delta-good' : 'dp-delta-bad'}`}>
                        {cpaDelta <= 0 ? '▼' : '▲'} {Math.abs(cpaDelta).toFixed(0)}% vs target
                      </div>
                    )}
                    <div className="dp-kpi-target">Target: {fmtIDR(TARGET_CPA_CC)}</div>
                  </div>
                  <div className="dp-kpi-divider" />
                  {/* Revenue CC */}
                  <div className="dp-kpi">
                    <div className="dp-kpi-label">Revenue CC</div>
                    <div className="dp-kpi-value" style={{ color: '#e0e2e6' }}>{fmtIDR(totals.revenue)}</div>
                  </div>
                  <div className="dp-kpi-divider" />
                  {/* RoAS CC */}
                  <div className="dp-kpi">
                    <div className="dp-kpi-label">RoAS CC</div>
                    <div className={`dp-kpi-value ${roasOk ? 'dp-kpi-good' : 'dp-kpi-bad'}`}>
                      {roasCc > 0 ? `${roasCc.toFixed(2)}×` : '—'}
                    </div>
                    {roasCc > 0 && (
                      <div className={`dp-kpi-delta ${roasDelta >= 0 ? 'dp-delta-good' : 'dp-delta-bad'}`}>
                        {roasDelta >= 0 ? '▲' : '▼'} {Math.abs(roasDelta).toFixed(0)}% vs target
                      </div>
                    )}
                    <div className="dp-kpi-target">Target: {TARGET_ROAS_CC}×</div>
                  </div>
                </div>

                {/* Trend Charts */}
                <div className="dp-trends">
                  <div className="dp-trend-box">
                    <Sparkline title="CPR" data={trends.cpr} target={TARGET_CPR} color="#818cf8" fixedYMin={0} fixedYMax={300_000} changelog={filteredChangelog} />
                  </div>
                  <div className="dp-trend-box">
                    <Sparkline title="CPA CC" data={trends.cpa} target={TARGET_CPA_CC} color="#818cf8" fixedYMin={0} fixedYMax={5_000_000} changelog={filteredChangelog} />
                  </div>
                  <div className="dp-trend-box">
                    <Sparkline title="RoAS CC" data={trends.roas} target={TARGET_ROAS_CC} color="#818cf8" fmt="multiplier" lowerIsBetter={false} fixedYMin={0} fixedYMax={0.4} changelog={filteredChangelog} />
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Section 2: Owned/Earned Performance ── */}
      <div className="dp-cards">
        <h2 className="mo-section-title">Owned/Earned Performance</h2>
        <div className="dp-card">
          {isLoading && !totals ? (
            <div className="dp-card-loading">
              <div className="tv-spinner" />
              <span>Loading…</span>
            </div>
          ) : !totals ? (
            <div className="dp-card-loading"><span>No data</span></div>
          ) : (
            <div className="mo-oe-split">
              {/* Left 2/3: KPIs + Charts */}
              <div className="mo-oe-left">
                {/* KPI row */}
                <div className="dp-kpi-row">
                  {/* Ad Spend */}
                  <div className="dp-kpi">
                    <div className="dp-kpi-label">Ad Spend</div>
                    <div className="dp-kpi-value" style={{ color: '#e0e2e6' }}>{fmtIDR(totals.spend)}</div>
                  </div>
                  <div className="dp-kpi-divider" />
                  {/* Impressions */}
                  <div className="dp-kpi">
                    <div className="dp-kpi-label">Impressions</div>
                    <div className="dp-kpi-value" style={{ color: '#e0e2e6' }}>{fmtNum(totals.impressions)}</div>
                  </div>
                  <div className="dp-kpi-divider" />
                  {/* CPM */}
                  <div className="dp-kpi">
                    <div className="dp-kpi-label">CPM</div>
                    <div className="dp-kpi-value" style={{ color: '#e0e2e6' }}>
                      {cpm > 0 ? fmtIDR(cpm) : '—'}
                    </div>
                  </div>
                  <div className="dp-kpi-divider" />
                  {/* Link Clicks */}
                  <div className="dp-kpi">
                    <div className="dp-kpi-label">Link Clicks</div>
                    <div className="dp-kpi-value" style={{ color: '#e0e2e6' }}>{fmtNum(totals.clicks)}</div>
                  </div>
                  <div className="dp-kpi-divider" />
                  {/* CTR */}
                  <div className="dp-kpi">
                    <div className="dp-kpi-label">CTR</div>
                    <div className="dp-kpi-value" style={{ color: '#e0e2e6' }}>
                      {ctr > 0 ? `${ctr.toFixed(2)}%` : '—'}
                    </div>
                  </div>
                  <div className="dp-kpi-divider" />
                  {/* CPC */}
                  <div className="dp-kpi">
                    <div className="dp-kpi-label">CPC</div>
                    <div className="dp-kpi-value" style={{ color: '#e0e2e6' }}>
                      {totals.clicks > 0 ? fmtIDR(totals.spend / totals.clicks) : '—'}
                    </div>
                  </div>
                </div>

                {/* Trend Charts — CPM and CTR */}
                <div className="dp-trends">
                  <div className="dp-trend-box" style={{ flex: 1 }}>
                    <Sparkline title="CPM" data={trends.cpm} target={cpm || 30_000} color="#f59e0b" fixedYMin={0} fixedYMax={Math.max(80_000, cpm * 2)} targetLabel="Avg" changelog={filteredChangelog} />
                  </div>
                  <div className="dp-trend-box" style={{ flex: 1 }}>
                    <Sparkline title="CTR" data={trends.ctr} target={ctr || 1} color="#06b6d4" fmt="percent" lowerIsBetter={false} fixedYMin={0} fixedYMax={Math.max(3, ctr * 2)} targetLabel="Avg" changelog={filteredChangelog} />
                  </div>
                </div>
              </div>

              {/* Right 1/3: Per-SKU breakdown */}
              <div className="mo-sku-summary">
                <div className="mo-sku-summary-title">SKU Breakdown</div>
                <div className="mo-sku-summary-header">
                  <span>SKU</span>
                  <span>CPM</span>
                  <span>CTR</span>
                </div>
                {skuMetrics.map((s, i) => {
                  const meta = getSkuMeta(s.sku, i)
                  return (
                    <div key={s.sku} className="mo-sku-summary-row">
                      <span className="mo-sku-label">
                        <span className="mo-sku-dot" style={{ background: meta.color }} />
                        {meta.label}
                      </span>
                      <span className="mo-sku-val">{s.cpm > 0 ? fmtIDR(s.cpm) : '—'}</span>
                      <span className="mo-sku-val">{s.ctr > 0 ? `${s.ctr.toFixed(2)}%` : '—'}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Footnote */}
      <div className="dp-footnote">
        📊 Aggregated across <strong>all SKUs</strong> for <strong>{activeBrand}</strong>. Spend from <strong>Ads Platform APIs</strong> · Real Leads &amp; Purchases from <strong>MongoDB ground truth</strong>.
        CPR = Spend ÷ Real Leads · CPA CC = Spend ÷ Purchase CCOM · RoAS CC = Revenue CC ÷ Spend · CPM = (Spend ÷ Impressions) × 1000 · CTR = (Clicks ÷ Impressions) × 100.
      </div>
    </div>
  )
}
