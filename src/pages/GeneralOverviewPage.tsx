/**
 * GeneralOverviewPage — Cross-brand quick glance
 */
import { useState, useMemo, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { D1_WORKER_URL } from '../config/dataSource'
import { dateStr, capToH2, PRESETS } from './ProductPerformancePage'
import type { ChangelogRow } from '../types/changelog'
import { fmtRp, fmtRpM as fmtShortRp } from '../utils/format'
import mncLogo from '../assets/brand_logos/MNC.webp'
import golLogo from '../assets/brand_logos/GOL.webp'
import mciLogo from '../assets/brand_logos/MCI.webp'
import { BrandOverviewCard } from '../components/cards/BrandOverviewCard'
import metaAdsImg from '../assets/ads_platform_images/Meta Ads.webp'
import searchAdsImg from '../assets/ads_platform_images/Google Search Ads.webp'
import googleAdsImg from '../assets/ads_platform_images/Google Ads.webp'

interface BrandBounds { brand: string; earliest: string; latest: string; skus: string[] }

// Minimal types for fetched data
interface PerfRow { date: string; sku: string; ad_spend: number; impressions: number; link_click: number }
interface ConvRow { date: string; sku: string; mongo_real_lead_ccom?: number; mongo_real_lead_d2or?: number; mongo_real_lead_mpsh?: number; mongo_real_lead_ofls?: number; mongo_purchase_ccom?: number; mongo_purchase_ccom_revenue?: number; mongo_qualified_lead_ccom?: number; mongo_lead_dispatch_d2or?: number; mongo_lead_dispatch_mpsh?: number }
interface SalesRow { date: string; rev_ccom_ca?: number; rev_ccom_crm?: number; rev_mpsh?: number; rev_d2or?: number; rev_ofls?: number }
interface BrandData { performance: PerfRow[]; conversions: ConvRow[]; sales: SalesRow[]; [k: string]: unknown }

// ── Types for Event Health ──
interface HealthRow {
  brand: string; event_type: string; source: string
  event_count: number; threshold: number; status: string
  wib_hour: number; checked_at: string
}

// Merged columns: each column maps to a per-brand event_type
// leadEvent+formSubmission → "Lead Event", SALE+CRMV → "Purchase/Visit"
const COLUMNS = ['lead', 'REAL', 'QUAL', 'SOCR', 'purchase', 'LEDI'] as const
const COL_LABELS: Record<string, string> = {
  lead: 'Lead Event', REAL: 'Real Lead', QUAL: 'QUAL', SOCR: 'SO Created',
  purchase: 'Purchase/Visit', LEDI: 'LEDI',
}
// Which actual event_type to look up per brand for merged columns
const COL_EVENT: Record<string, Record<string, string>> = {
  lead: { GOL: 'leadEvent', MNC: 'leadEvent', MCI: 'formSubmission', MDC: 'formSubmission' },
  REAL: { GOL: 'REAL', MNC: 'REAL', MCI: 'REAL', MDC: 'REAL' },
  QUAL: { GOL: 'QUAL', MNC: 'QUAL' },
  SOCR: { GOL: 'SOCR', MNC: 'SOCR' },
  purchase: { GOL: 'SALE', MNC: 'SALE', MCI: 'CRMV', MDC: 'CRMV' },
  LEDI: { GOL: 'LEDI', MNC: 'LEDI' },
}

const STATUS_COLOR: Record<string, string> = { OK: '#34d399', WARN: '#fbbf24', CRIT: '#f87171' }
const STATUS_ICON: Record<string, string> = { OK: '●', WARN: '●', CRIT: '●' }
// Only these events show red — others cap at yellow (could be slow day)
const CRIT_EVENTS = new Set(['leadEvent', 'REAL', 'QUAL', 'LEDI'])

function EventHealthCard() {
  const { data, isFetching } = useQuery({
    queryKey: ['event-health'],
    queryFn: async () => {
      const res = await fetch(`${D1_WORKER_URL}/v2/event-health`)
      if (!res.ok) throw new Error('fetch failed')
      return res.json() as Promise<{ latest: HealthRow[]; history: HealthRow[] }>
    },
    staleTime: 60_000,
    refetchInterval: 5 * 60_000, // auto-refresh every 5 min
  })

  const latest = data?.latest ?? []

  // Staleness detection — use the NEWEST checked_at for header display,
  // but the OLDEST for overall staleness (if any event is stale, flag it)
  const newestCheckedAt = latest.length > 0
    ? latest.reduce((a, b) => a.checked_at > b.checked_at ? a : b).checked_at
    : null
  const oldestCheckedAt = latest.length > 0
    ? latest.reduce((a, b) => a.checked_at < b.checked_at ? a : b).checked_at
    : null
  const newestWIB = latest.length > 0
    ? latest.reduce((a, b) => a.checked_at > b.checked_at ? a : b).wib_hour
    : null
  const newestAgeMs = newestCheckedAt ? Date.now() - new Date(newestCheckedAt).getTime() : Infinity
  const newestAgeMin = Math.round(newestAgeMs / 60_000)
  // Pipeline is stale if even the newest check is >90min old
  const isStale = newestAgeMin > 90
  const isDead = newestAgeMin > 120

  // Only consider displayed brands for status
  const brands = ['GOL', 'MNC', 'MCI']
  const displayed = latest.filter(r => brands.includes(r.brand))

  const hasCrit = displayed.some(r => r.status === 'CRIT' && CRIT_EVENTS.has(r.event_type))
  const hasWarn = displayed.some(r => r.status !== 'OK')
  const eventStatus = hasCrit ? 'CRIT' : hasWarn ? 'WARN' : 'OK'
  // If monitor is dead/stale, that's the worst status regardless of events
  const overall = isDead ? 'CRIT' : isStale ? 'WARN' : eventStatus
  const overallColor = STATUS_COLOR[overall]

  // Label reflects both staleness and event status
  const overallLabel = isDead
    ? '⚠ Monitor Pipeline Dead'
    : isStale
    ? '⚠ Monitor Pipeline Stale'
    : hasCrit ? 'Critical Alert' : hasWarn ? 'Warning' : 'All Systems Healthy'

  // Human-readable age
  const ageStr = newestCheckedAt
    ? newestAgeMin < 60
      ? `${newestAgeMin}m ago`
      : `${Math.floor(newestAgeMin / 60)}h ${newestAgeMin % 60}m ago`
    : '—'
  const lastCheckedStr = newestCheckedAt
    ? `${String(newestWIB ?? 0).padStart(2, '0')}:00 WIB`
    : '—'

  // Build lookup: brand+event_type → HealthRow
  const lookup = new Map<string, HealthRow>()
  for (const r of latest) lookup.set(`${r.brand}|${r.event_type}`, r)

  // Count alerts (displayed brands only)
  const alertCount = displayed.filter(r => r.status !== 'OK').length

  return (
    <div style={{
      width: '100%', marginBottom: 24,
      background: overall === 'OK' ? 'rgba(52,211,153,0.04)' : overall === 'WARN' ? 'rgba(251,191,36,0.06)' : 'rgba(248,113,113,0.06)',
      border: `1px solid ${overall === 'OK' ? 'rgba(52,211,153,0.15)' : overall === 'WARN' ? 'rgba(251,191,36,0.2)' : 'rgba(248,113,113,0.25)'}`,
      borderRadius: 12, padding: '14px 20px',
      fontFamily: 'Inter, system-ui, sans-serif',
    }}>

      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 800, letterSpacing: '-0.02em', color: overallColor }}>
            {STATUS_ICON[overall]} {overallLabel}
          </span>
          {alertCount > 0 && !isStale && !isDead && (
            <span style={{
              fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 99,
              background: `${overallColor}20`, color: overallColor, letterSpacing: '0.05em',
            }}>
              {alertCount} ALERT{alertCount > 1 ? 'S' : ''}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {isFetching && (
            <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)' }}>checking…</span>
          )}
          <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', fontWeight: 500 }}>
            Event Pipeline Health
          </span>
          <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)' }}>·</span>
          <span style={{ fontSize: 10, color: isStale || isDead ? overallColor : 'rgba(255,255,255,0.35)', fontWeight: 600 }}>
            {lastCheckedStr} ({ageStr})
          </span>
          {(isStale || isDead) && (
            <span style={{
              fontSize: 8, fontWeight: 700, padding: '2px 6px', borderRadius: 99,
              background: `${overallColor}20`, color: overallColor, letterSpacing: '0.05em',
            }}>
              {isDead ? 'PIPELINE DOWN' : 'STALE'}
            </span>
          )}
        </div>
      </div>

      {/* Grid */}
      {latest.length > 0 ? (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11, minWidth: 650 }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left', padding: '4px 10px 6px 0', fontSize: 9, fontWeight: 700, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: '0.08em', width: 60 }}>
                  Brand
                </th>
                {COLUMNS.map(col => (
                  <th key={col} style={{ textAlign: 'center', padding: '4px 6px 6px', fontSize: 9, fontWeight: 700, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: '0.06em', whiteSpace: 'nowrap' }}>
                    {COL_LABELS[col] ?? col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {brands.map(brand => {
                return (
                  <tr key={brand} style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                    <td style={{ padding: '6px 10px 6px 0', fontWeight: 700, fontSize: 11, color: 'rgba(255,255,255,0.7)' }}>
                      {brand}
                    </td>
                    {COLUMNS.map(col => {
                      const eventType = COL_EVENT[col]?.[brand]
                      if (!eventType) {
                        return (
                          <td key={col} style={{ textAlign: 'center', padding: '6px', color: 'rgba(255,255,255,0.08)' }}>
                            —
                          </td>
                        )
                      }
                      const row = lookup.get(`${brand}|${eventType}`)
                      if (!row) {
                        return (
                          <td key={col} style={{ textAlign: 'center', padding: '6px', color: 'rgba(255,255,255,0.12)' }}>
                            —
                          </td>
                        )
                      }
                      if (row.status === 'OK') {
                        return (
                          <td key={col} style={{ textAlign: 'center', padding: '6px' }}>
                            <span style={{ fontSize: 13, fontWeight: 700, color: '#34d399' }}>✓</span>
                          </td>
                        )
                      }
                      // WARN or CRIT — cap at yellow for non-critical events
                      const effectiveStatus = (row.status === 'CRIT' && !CRIT_EVENTS.has(eventType)) ? 'WARN' : row.status
                      const sc = STATUS_COLOR[effectiveStatus] ?? '#f87171'
                      return (
                        <td key={col} style={{ textAlign: 'center', padding: '6px' }}>
                          <span style={{ fontSize: 13, fontWeight: 700, color: sc }}>✗</span>
                          <div style={{ fontSize: 8, color: sc, marginTop: 1, fontWeight: 600 }}>
                            {row.event_count}/{row.threshold}
                          </div>
                        </td>
                      )
                    })}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.25)', textAlign: 'center', padding: 8 }}>
          {isFetching ? 'Loading health data…' : 'No health check data available'}
        </div>
      )}
    </div>
  )
}

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
    const totalCcLeads = convDisplay.reduce((s, r) => s + (r.mongo_real_lead_ccom ?? 0), 0)
    const totalQualLeads = convDisplay.reduce((s, r) => s + (r.mongo_qualified_lead_ccom ?? 0) + (r.mongo_lead_dispatch_d2or ?? 0) + (r.mongo_lead_dispatch_mpsh ?? 0), 0)
    const totalPurchases = convDisplay.reduce((s, r) => s + (r.mongo_purchase_ccom ?? 0), 0)
    const totalCcRevenue = convDisplay.reduce((s, r) => s + (r.mongo_purchase_ccom_revenue ?? 0), 0)
    const totalRevenue = salesDisplay.reduce((s, r) => s + (r.rev_ccom_ca ?? 0) + (r.rev_ccom_crm ?? 0) + (r.rev_mpsh ?? 0) + (r.rev_d2or ?? 0) + (r.rev_ofls ?? 0), 0)

    const cprl = totalLeads > 0 ? totalSpend / totalLeads : 0
    const cpql = totalQualLeads > 0 ? totalSpend / totalQualLeads : 0
    const cpaCC = totalPurchases > 0 ? totalSpend / totalPurchases : 0
    const ccCvr = totalCcLeads > 0 ? (totalPurchases / totalCcLeads) * 100 : 0
    const roas = totalSpend > 0 ? totalRevenue / totalSpend : 0
    const ccRoas = totalSpend > 0 ? totalCcRevenue / totalSpend : 0

    const spendByDate = new Map<string, number>()
    for (const r of perf) spendByDate.set(r.date, (spendByDate.get(r.date) ?? 0) + (r.ad_spend ?? 0))

    const leadsByDate = new Map<string, number>()
    for (const r of conv) {
      const leads = (r.mongo_real_lead_ccom ?? 0) + (r.mongo_real_lead_d2or ?? 0) + (r.mongo_real_lead_mpsh ?? 0) + (r.mongo_real_lead_ofls ?? 0)
      leadsByDate.set(r.date, (leadsByDate.get(r.date) ?? 0) + leads)
    }

    const qualByDate = new Map<string, number>()
    for (const r of conv) {
      const q = (r.mongo_qualified_lead_ccom ?? 0) + (r.mongo_lead_dispatch_d2or ?? 0) + (r.mongo_lead_dispatch_mpsh ?? 0)
      qualByDate.set(r.date, (qualByDate.get(r.date) ?? 0) + q)
    }

    const purchByDate = new Map<string, number>()
    for (const r of conv) purchByDate.set(r.date, (purchByDate.get(r.date) ?? 0) + (r.mongo_purchase_ccom ?? 0))

    const ccLeadsByDate = new Map<string, number>()
    for (const r of conv) ccLeadsByDate.set(r.date, (ccLeadsByDate.get(r.date) ?? 0) + (r.mongo_real_lead_ccom ?? 0))

    const ccRevByDate = new Map<string, number>()
    for (const r of conv) ccRevByDate.set(r.date, (ccRevByDate.get(r.date) ?? 0) + (r.mongo_purchase_ccom_revenue ?? 0))

    const allDates = Array.from(new Set([...spendByDate.keys(), ...leadsByDate.keys()])).sort()

    const cprlSeries = allDates.map(d => {
      const sp = spendByDate.get(d) ?? 0
      const ld = leadsByDate.get(d) ?? 0
      return { date: d, value: ld > 0 ? sp / ld : 0 }
    }).filter(p => p.value > 0).filter(p => p.date >= displayFrom)

    const cpqlSeries = allDates.map(d => {
      const sp = spendByDate.get(d) ?? 0
      const q = qualByDate.get(d) ?? 0
      return { date: d, value: q > 0 ? sp / q : 0 }
    }).filter(p => p.value > 0).filter(p => p.date >= displayFrom)

    // Volume series (daily lead & qual counts for Volume toggle)
    const leadVolumeSeries = allDates.map(d => ({ date: d, value: leadsByDate.get(d) ?? 0 })).filter(p => p.value > 0).filter(p => p.date >= displayFrom)
    const qualVolumeSeries = allDates.map(d => ({ date: d, value: qualByDate.get(d) ?? 0 })).filter(p => p.value > 0).filter(p => p.date >= displayFrom)

    const cpaDaily = allDates.map(d => ({ date: d, spend: spendByDate.get(d) ?? 0, purchases: purchByDate.get(d) ?? 0 }))
    const cpaSeries = cpaDaily.map((dd, i) => {
      const slice = cpaDaily.slice(Math.max(0, i - 6), i + 1)
      const ts = slice.reduce((s, d) => s + d.spend, 0)
      const tp = slice.reduce((s, d) => s + d.purchases, 0)
      return { date: dd.date, value: tp > 0 ? ts / tp : 0 }
    }).filter(p => p.value > 0).filter(p => p.date >= displayFrom)

    // CC CVR series (7d MA) — purchase_ccom / real_lead_ccom
    const ccCvrDaily = allDates.map(d => ({ date: d, ccLeads: ccLeadsByDate.get(d) ?? 0, purch: purchByDate.get(d) ?? 0 }))
    const ccCvrSeries = ccCvrDaily.map((dd, i) => {
      const slice = ccCvrDaily.slice(Math.max(0, i - 6), i + 1)
      const tl = slice.reduce((s, d) => s + d.ccLeads, 0)
      const tp = slice.reduce((s, d) => s + d.purch, 0)
      return { date: dd.date, value: tl > 0 ? (tp / tl) * 100 : 0 }
    }).filter(p => p.value > 0).filter(p => p.date >= displayFrom)

    // CC CVR raw daily (for Daily toggle)
    const ccCvrRawSeries = ccCvrDaily.map(dd => ({
      date: dd.date, value: dd.ccLeads > 0 ? (dd.purch / dd.ccLeads) * 100 : 0,
    })).filter(p => p.value > 0).filter(p => p.date >= displayFrom)

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

    // CPA CC volume (daily purchase count for Volume toggle)
    const purchVolumeSeries = allDates.map(d => ({ date: d, value: purchByDate.get(d) ?? 0 })).filter(p => p.value > 0).filter(p => p.date >= displayFrom)

    // RoAS Total raw daily (for Daily toggle)
    const roasRawSeries = roasDaily.map(dd => ({
      date: dd.date, value: dd.spend > 0 ? dd.rev / dd.spend : 0,
    })).filter(p => p.value > 0).filter(p => p.date >= displayFrom)

    // CC RoAS series (30d MA)
    const ccRoasDaily = allDates.map(d => ({ date: d, spend: spendByDate.get(d) ?? 0, rev: ccRevByDate.get(d) ?? 0 }))
    const ccRoasSeries = ccRoasDaily.map((dd, i) => {
      const start = Math.max(0, i - 29)
      const slice = ccRoasDaily.slice(start, i + 1)
      const ts = slice.reduce((s, d) => s + d.spend, 0)
      const tr = slice.reduce((s, d) => s + d.rev, 0)
      return { date: dd.date, value: ts > 0 ? tr / ts : 0 }
    }).filter(p => p.value > 0).filter(p => p.date >= displayFrom)

    const changelog = (bd.changelog ?? []) as ChangelogRow[]

    // Per-traffic-source breakdown: CPRL, CPQL, CC CVR, CPA CC, RoAS CC
    const TS_IMG: Record<string, { label: string; color: string; image: string }> = {
      META: { label: 'Meta Ads', color: '#818cf8', image: metaAdsImg },
      DGEN: { label: 'Demand Gen', color: '#34d399', image: googleAdsImg },
      GOOGLE: { label: 'Google Ads', color: '#60a5fa', image: googleAdsImg },
      SRCH: { label: 'Google Search', color: '#fbbf24', image: searchAdsImg },
    }
    const tsSet = new Set<string>()
    for (const r of perf) { const ts = (r as any).traffic_source; if (ts) tsSet.add(ts) }

    const trafficSources = Array.from(tsSet).map(ts => {
      const tsPerf = perf.filter(r => (r as any).traffic_source === ts)
      const tsConv = conv.filter(r => (r as any).traffic_source === ts)

      const spendByD = new Map<string, number>()
      const leadsByD = new Map<string, number>()
      const ccLeadsByD = new Map<string, number>()
      const qualByD = new Map<string, number>()
      const purchByD = new Map<string, number>()
      const ccRevByD = new Map<string, number>()
      for (const r of tsPerf) spendByD.set(r.date, (spendByD.get(r.date) ?? 0) + (r.ad_spend ?? 0))
      for (const r of tsConv) {
        const ld = (r.mongo_real_lead_ccom ?? 0) + (r.mongo_real_lead_d2or ?? 0) + (r.mongo_real_lead_mpsh ?? 0) + (r.mongo_real_lead_ofls ?? 0)
        const q = (r.mongo_qualified_lead_ccom ?? 0) + (r.mongo_lead_dispatch_d2or ?? 0) + (r.mongo_lead_dispatch_mpsh ?? 0)
        leadsByD.set(r.date, (leadsByD.get(r.date) ?? 0) + ld)
        ccLeadsByD.set(r.date, (ccLeadsByD.get(r.date) ?? 0) + (r.mongo_real_lead_ccom ?? 0))
        qualByD.set(r.date, (qualByD.get(r.date) ?? 0) + q)
        purchByD.set(r.date, (purchByD.get(r.date) ?? 0) + (r.mongo_purchase_ccom ?? 0))
        ccRevByD.set(r.date, (ccRevByD.get(r.date) ?? 0) + (r.mongo_purchase_ccom_revenue ?? 0))
      }

      const tsDates = Array.from(new Set([...spendByD.keys(), ...leadsByD.keys()])).sort()

      // Totals in display range
      const inRange = (d: string) => d >= displayFrom && d <= displayTo
      const tSpend = tsDates.filter(inRange).reduce((s, d) => s + (spendByD.get(d) ?? 0), 0)
      const tLeads = tsDates.filter(inRange).reduce((s, d) => s + (leadsByD.get(d) ?? 0), 0)
      const tCcLeads = tsDates.filter(inRange).reduce((s, d) => s + (ccLeadsByD.get(d) ?? 0), 0)
      const tQual  = tsDates.filter(inRange).reduce((s, d) => s + (qualByD.get(d) ?? 0), 0)
      const tPurch = tsDates.filter(inRange).reduce((s, d) => s + (purchByD.get(d) ?? 0), 0)
      const tCcRev = tsDates.filter(inRange).reduce((s, d) => s + (ccRevByD.get(d) ?? 0), 0)

      const tsCprl = tLeads > 0 ? tSpend / tLeads : 0
      const tsCpql = tQual > 0 ? tSpend / tQual : 0
      const tsCcCvr = tCcLeads > 0 ? (tPurch / tCcLeads) * 100 : 0
      const tsCpaCC = tPurch > 0 ? tSpend / tPurch : 0
      const tsCcRoas = tSpend > 0 ? tCcRev / tSpend : 0

      // CPRL series (daily)
      const cprlS = tsDates.map(d => ({ date: d, value: (leadsByD.get(d) ?? 0) > 0 ? (spendByD.get(d) ?? 0) / (leadsByD.get(d) ?? 1) : 0 })).filter(p => p.value > 0 && p.date >= displayFrom)
      // CPQL series (daily)
      const cpqlS = tsDates.map(d => ({ date: d, value: (qualByD.get(d) ?? 0) > 0 ? (spendByD.get(d) ?? 0) / (qualByD.get(d) ?? 1) : 0 })).filter(p => p.value > 0 && p.date >= displayFrom)
      // CC CVR series (7d MA) — purchase_ccom / real_lead_ccom
      const cvrDaily = tsDates.map(d => ({ date: d, ccLeads: ccLeadsByD.get(d) ?? 0, purch: purchByD.get(d) ?? 0 }))
      const ccCvrS = cvrDaily.map((dd, i) => { const sl = cvrDaily.slice(Math.max(0, i - 6), i + 1); const tl = sl.reduce((s, d) => s + d.ccLeads, 0); const tp = sl.reduce((s, d) => s + d.purch, 0); return { date: dd.date, value: tl > 0 ? (tp / tl) * 100 : 0 } }).filter(p => p.value > 0 && p.date >= displayFrom)
      // CPA CC series (7d MA)
      const cpaDaily = tsDates.map(d => ({ date: d, spend: spendByD.get(d) ?? 0, purch: purchByD.get(d) ?? 0 }))
      const cpaS = cpaDaily.map((dd, i) => { const sl = cpaDaily.slice(Math.max(0, i - 6), i + 1); const ts2 = sl.reduce((s, d) => s + d.spend, 0); const tp = sl.reduce((s, d) => s + d.purch, 0); return { date: dd.date, value: tp > 0 ? ts2 / tp : 0 } }).filter(p => p.value > 0 && p.date >= displayFrom)
      // RoAS CC series (30d MA)
      const roasDaily = tsDates.map(d => ({ date: d, spend: spendByD.get(d) ?? 0, rev: ccRevByD.get(d) ?? 0 }))
      const roasS = roasDaily.map((dd, i) => { const sl = roasDaily.slice(Math.max(0, i - 29), i + 1); const ts2 = sl.reduce((s, d) => s + d.spend, 0); const tr = sl.reduce((s, d) => s + d.rev, 0); return { date: dd.date, value: ts2 > 0 ? tr / ts2 : 0 } }).filter(p => p.value > 0 && p.date >= displayFrom)

      // Volume / raw series for toggles
      const leadVolS = tsDates.map(d => ({ date: d, value: leadsByD.get(d) ?? 0 })).filter(p => p.value > 0 && p.date >= displayFrom)
      const qualVolS = tsDates.map(d => ({ date: d, value: qualByD.get(d) ?? 0 })).filter(p => p.value > 0 && p.date >= displayFrom)
      const purchVolS = tsDates.map(d => ({ date: d, value: purchByD.get(d) ?? 0 })).filter(p => p.value > 0 && p.date >= displayFrom)
      const ccCvrRawS = cvrDaily.map(dd => ({ date: dd.date, value: dd.ccLeads > 0 ? (dd.purch / dd.ccLeads) * 100 : 0 })).filter(p => p.value > 0 && p.date >= displayFrom)
      const roasRawS = roasDaily.map(dd => ({ date: dd.date, value: dd.spend > 0 ? dd.rev / dd.spend : 0 })).filter(p => p.value > 0 && p.date >= displayFrom)

      const meta = TS_IMG[ts.toUpperCase()] ?? { label: ts, color: '#94a3b8', image: undefined as string | undefined }
      return { source: ts, label: meta.label, color: meta.color, image: meta.image, spend: tSpend, totalLeads: tLeads, totalQual: tQual, totalPurch: tPurch, cprl: tsCprl, cpql: tsCpql, ccCvr: tsCcCvr, cpaCC: tsCpaCC, ccRoas: tsCcRoas, cprlSeries: cprlS, cpqlSeries: cpqlS, ccCvrSeries: ccCvrS, cpaSeries: cpaS, ccRoasSeries: roasS, leadVolSeries: leadVolS, qualVolSeries: qualVolS, purchVolSeries: purchVolS, ccCvrRawSeries: ccCvrRawS, roasRawSeries: roasRawS }
    }).filter(t => t.spend > 0).sort((a, b) => b.spend - a.spend)

    return { totalSpend, totalLeads, totalQualLeads, totalPurchases, totalRevenue, cprl, cpql, cpaCC, ccCvr, roas, ccRoas, cprlSeries, cpqlSeries, leadVolumeSeries, qualVolumeSeries, cpaSeries, purchVolumeSeries, ccCvrSeries, ccCvrRawSeries, roasSeries, roasRawSeries, ccRoasSeries, changelog, trafficSources }
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

    // Volume series (daily counts for Volume toggle)
    const subsVolumeSeries = allDates.map(d => ({ date: d, value: subsByDate.get(d) ?? 0 })).filter(p => p.value > 0).filter(p => p.date >= mciRange.from)
    const convVolumeSeries = allDates.map(d => ({ date: d, value: convByDate.get(d) ?? 0 })).filter(p => p.value > 0).filter(p => p.date >= mciRange.from)

    // Visit Rate raw daily (for Daily toggle)
    const visitRateRawSeries = vrDaily.map(dd => ({
      date: dd.date, value: dd.subs > 0 ? (dd.conv / dd.subs) * 100 : 0,
    })).filter(p => p.value > 0).filter(p => p.date >= mciRange.from)

    const visitRate = totalFormSubs > 0 ? (totalFormConv / totalFormSubs) * 100 : 0

    const changelog = (mciData.changelog ?? []) as ChangelogRow[]

    // Per-traffic-source breakdown: CPR, CPV, Visit Rate
    const TS_IMG_MCI: Record<string, { label: string; color: string; image: string }> = {
      META: { label: 'Meta Ads', color: '#818cf8', image: metaAdsImg },
      DGEN: { label: 'Demand Gen', color: '#34d399', image: googleAdsImg },
      GOOGLE: { label: 'Google Ads', color: '#60a5fa', image: googleAdsImg },
      SRCH: { label: 'Google Search', color: '#fbbf24', image: searchAdsImg },
    }
    const tsSetMci = new Set<string>()
    for (const r of perf) { const ts = (r as any).traffic_source; if (ts) tsSetMci.add(ts) }

    const trafficSources = Array.from(tsSetMci).map(ts => {
      const tsPerf = perf.filter(r => (r as any).traffic_source === ts)
      const tsConv = conv.filter(r => (r as any).traffic_source === ts)

      const spendByD = new Map<string, number>()
      const subsByD = new Map<string, number>()
      const convByD2 = new Map<string, number>()
      for (const r of tsPerf) {
        if (!r.sku || r.sku === '-' || !MCI_SKUS.has(r.sku)) continue
        spendByD.set(r.date, (spendByD.get(r.date) ?? 0) + (r.ad_spend ?? 0))
      }
      for (const r of tsConv) {
        if (!(r as any).sku || (r as any).sku === '-' || !MCI_SKUS.has((r as any).sku)) continue
        subsByD.set(r.date, (subsByD.get(r.date) ?? 0) + ((r as any).mongo_form_submission ?? 0))
        convByD2.set(r.date, (convByD2.get(r.date) ?? 0) + ((r as any).mongo_form_conversion ?? 0))
      }

      const tsDates = Array.from(new Set([...spendByD.keys(), ...subsByD.keys()])).sort()
      const inRange2 = (d: string) => d >= mciRange.from && d <= mciRange.to
      const tSpend = tsDates.filter(inRange2).reduce((s, d) => s + (spendByD.get(d) ?? 0), 0)
      const tSubs = tsDates.filter(inRange2).reduce((s, d) => s + (subsByD.get(d) ?? 0), 0)
      const tConv = tsDates.filter(inRange2).reduce((s, d) => s + (convByD2.get(d) ?? 0), 0)

      const tsCpr = tSubs > 0 ? tSpend / tSubs : 0
      const tsCpv = tConv > 0 ? tSpend / tConv : 0
      const tsVr = tSubs > 0 ? (tConv / tSubs) * 100 : 0

      // CPR series (7d MA)
      const cprD = tsDates.map(d => ({ date: d, spend: spendByD.get(d) ?? 0, subs: subsByD.get(d) ?? 0 }))
      const cprS = cprD.map((dd, i) => { const sl = cprD.slice(Math.max(0, i - 6), i + 1); const ts2 = sl.reduce((s, d) => s + d.spend, 0); const tf = sl.reduce((s, d) => s + d.subs, 0); return { date: dd.date, value: tf > 0 ? ts2 / tf : 0 } }).filter(p => p.value > 0 && p.date >= mciRange.from)
      // CPV series (21d MA)
      const cpvD = tsDates.map(d => ({ date: d, spend: spendByD.get(d) ?? 0, conv: convByD2.get(d) ?? 0 }))
      const cpvS = cpvD.map((dd, i) => { const sl = cpvD.slice(Math.max(0, i - 20), i + 1); const ts2 = sl.reduce((s, d) => s + d.spend, 0); const tc = sl.reduce((s, d) => s + d.conv, 0); return { date: dd.date, value: tc > 0 ? ts2 / tc : 0 } }).filter(p => p.value > 0 && p.date >= mciRange.from)
      // Visit Rate series (21d MA)
      const vrD = tsDates.map(d => ({ date: d, subs: subsByD.get(d) ?? 0, conv: convByD2.get(d) ?? 0 }))
      const vrS = vrD.map((dd, i) => { const sl = vrD.slice(Math.max(0, i - 20), i + 1); const tsubs2 = sl.reduce((s, d) => s + d.subs, 0); const tconv2 = sl.reduce((s, d) => s + d.conv, 0); return { date: dd.date, value: tsubs2 > 0 ? (tconv2 / tsubs2) * 100 : 0 } }).filter(p => p.value > 0 && p.date >= mciRange.from)

      // Volume series for toggles
      const subsVolS = tsDates.map(d => ({ date: d, value: subsByD.get(d) ?? 0 })).filter(p => p.value > 0 && p.date >= mciRange.from)
      const convVolS = tsDates.map(d => ({ date: d, value: convByD2.get(d) ?? 0 })).filter(p => p.value > 0 && p.date >= mciRange.from)
      const vrRawS = vrD.map(dd => ({ date: dd.date, value: dd.subs > 0 ? (dd.conv / dd.subs) * 100 : 0 })).filter(p => p.value > 0 && p.date >= mciRange.from)

      const meta = TS_IMG_MCI[ts.toUpperCase()] ?? { label: ts, color: '#94a3b8', image: undefined as string | undefined }
      return { source: ts, label: meta.label, color: meta.color, image: meta.image, spend: tSpend, totalSubs: tSubs, totalConv: tConv, cpr: tsCpr, cpv: tsCpv, visitRate: tsVr, cprSeries: cprS, cpvSeries: cpvS, visitRateSeries: vrS, subsVolSeries: subsVolS, convVolSeries: convVolS, vrRawSeries: vrRawS }
    }).filter(t => t.spend > 0).sort((a, b) => b.spend - a.spend)

    return { totalSpend, totalFormSubs, totalFormConv, totalVisits, cpr, cpv, visitRate, cprSeries, cpvSeries, subsVolumeSeries, convVolumeSeries, visitRateSeries, visitRateRawSeries, changelog, trafficSources }
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

      {/* ── Event Pipeline Health Card ── */}
      <EventHealthCard />

      {/* ── Content ── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 40, width: '100%' }}>

        {/* MNC Brand Snapshot */}
        {mncLoading || !mnc ? (
          <div style={{ padding: "20px 0", textAlign: "center", color: "rgba(255,255,255,0.2)", fontSize: 12 }}>
            {mncLoading ? "Loading MNC data…" : "No data available"}
          </div>
        ) : (
          <BrandOverviewCard
            brandLabel="MNC"
            productName="mGanik Nutrition"
            brandColor="#f97316"
            imageSrc={mncLogo}
            changelog={mnc.changelog}
            charts={[
              { key: 'mnc-cprl', label: 'CPRL', color: '#818cf8', series: mnc.cprlSeries, value: mnc.cprl > 0 ? fmtRp(Math.round(mnc.cprl)) : '—', rawValue: mnc.cprl, sub: `Target ${fmtShortRp(150_000)}`, target: 150_000, higherIsBetter: false, fmt: v => fmtRp(Math.round(v)), fmtShort: v => fmtShortRp(v), volumeSeries: mnc.leadVolumeSeries, volumeValue: mnc.totalLeads > 0 ? Math.round(mnc.totalLeads).toLocaleString('id-ID') : '—', volumeRawValue: mnc.totalLeads },
              { key: 'mnc-cpql', label: 'CPQL', color: '#a78bfa', series: mnc.cpqlSeries, value: mnc.cpql > 0 ? fmtRp(Math.round(mnc.cpql)) : '—', rawValue: mnc.cpql, sub: mnc.cpqlSeries.length > 0 ? `Avg ${fmtShortRp(Math.round(mnc.cpqlSeries.reduce((s: number, p: {value:number}) => s + p.value, 0) / mnc.cpqlSeries.length))}` : '', target: mnc.cpqlSeries.length > 0 ? Math.round(mnc.cpqlSeries.reduce((s: number, p: {value:number}) => s + p.value, 0) / mnc.cpqlSeries.length) : 0, higherIsBetter: false, fmt: v => fmtRp(Math.round(v)), fmtShort: v => fmtShortRp(v), volumeSeries: mnc.qualVolumeSeries, volumeValue: mnc.totalQualLeads > 0 ? Math.round(mnc.totalQualLeads).toLocaleString('id-ID') : '—', volumeRawValue: mnc.totalQualLeads },
              { key: 'mnc-ccvr', label: 'CC CVR', color: '#34d399', series: mnc.ccCvrSeries, value: mnc.ccCvr > 0 ? mnc.ccCvr.toFixed(2) + '%' : '—', rawValue: mnc.ccCvr, sub: 'Target 20%', target: 20, higherIsBetter: true, fmt: v => v.toFixed(2) + '%', fmtShort: v => v.toFixed(1) + '%', volumeSeries: mnc.ccCvrRawSeries, volumeLabels: ['7D MA', 'Daily'], volumeFmt: v => v.toFixed(2) + '%', volumeFmtShort: v => v.toFixed(1) + '%' },
              { key: 'mnc-cpa', label: 'CPA CC', color: '#f472b6', series: mnc.cpaSeries, value: mnc.cpaCC > 0 ? fmtRp(Math.round(mnc.cpaCC)) : '—', rawValue: mnc.cpaCC, sub: `Target ${fmtShortRp(2_000_000)}`, target: 2_000_000, higherIsBetter: false, fmt: v => fmtRp(Math.round(v)), fmtShort: v => fmtShortRp(v), volumeSeries: mnc.purchVolumeSeries, volumeValue: mnc.totalPurchases > 0 ? Math.round(mnc.totalPurchases).toLocaleString('id-ID') : '—', volumeRawValue: mnc.totalPurchases },
              { key: 'mnc-roas', label: 'RoAS Total', color: '#fbbf24', series: mnc.roasSeries, value: mnc.roas > 0 ? mnc.roas.toFixed(2) + '×' : '—', rawValue: mnc.roas, sub: 'Target 6.59×', target: 6.59, higherIsBetter: true, fmt: v => v.toFixed(2) + '×', fmtShort: v => v.toFixed(1) + '×', zonedRange: true, volumeSeries: mnc.roasRawSeries, volumeLabels: ['30D MA', 'Daily'], volumeFmt: v => v.toFixed(2) + '×', volumeFmtShort: v => v.toFixed(1) + '×' },
            ]}
            trafficSources={mnc.trafficSources.map(ts => ({
              label: ts.label, color: ts.color, image: ts.image,
              charts: [
                { key: `mnc-${ts.source}-cprl`, label: 'CPRL', color: '#818cf8', series: ts.cprlSeries, value: ts.cprl > 0 ? fmtRp(Math.round(ts.cprl)) : '—', rawValue: ts.cprl, sub: `Target ${fmtShortRp(150_000)}`, target: 150_000, higherIsBetter: false, fmt: v => fmtRp(Math.round(v)), fmtShort: v => fmtShortRp(v), volumeSeries: ts.leadVolSeries, volumeValue: ts.totalLeads > 0 ? Math.round(ts.totalLeads).toLocaleString('id-ID') : '—', volumeRawValue: ts.totalLeads },
                { key: `mnc-${ts.source}-cpql`, label: 'CPQL', color: '#a78bfa', series: ts.cpqlSeries, value: ts.cpql > 0 ? fmtRp(Math.round(ts.cpql)) : '—', rawValue: ts.cpql, sub: `Avg ${ts.cpqlSeries.length > 0 ? fmtShortRp(Math.round(ts.cpqlSeries.reduce((s: number, p: {value:number}) => s+p.value,0)/ts.cpqlSeries.length)) : '—'}`, target: ts.cpqlSeries.length > 0 ? Math.round(ts.cpqlSeries.reduce((s: number, p: {value:number}) => s+p.value,0)/ts.cpqlSeries.length) : 0, higherIsBetter: false, fmt: v => fmtRp(Math.round(v)), fmtShort: v => fmtShortRp(v), volumeSeries: ts.qualVolSeries, volumeValue: ts.totalQual > 0 ? Math.round(ts.totalQual).toLocaleString('id-ID') : '—', volumeRawValue: ts.totalQual },
                { key: `mnc-${ts.source}-ccvr`, label: 'CC CVR', color: '#34d399', series: ts.ccCvrSeries, value: ts.ccCvr > 0 ? ts.ccCvr.toFixed(2) + '%' : '—', rawValue: ts.ccCvr, sub: 'Target 20%', target: 20, higherIsBetter: true, fmt: v => v.toFixed(2) + '%', fmtShort: v => v.toFixed(1) + '%', volumeSeries: ts.ccCvrRawSeries, volumeLabels: ['7D MA', 'Daily'], volumeFmt: v => v.toFixed(2) + '%', volumeFmtShort: v => v.toFixed(1) + '%' },
                { key: `mnc-${ts.source}-cpa`, label: 'CPA CC', color: '#f472b6', series: ts.cpaSeries, value: ts.cpaCC > 0 ? fmtRp(Math.round(ts.cpaCC)) : '—', rawValue: ts.cpaCC, sub: `Target ${fmtShortRp(2_000_000)}`, target: 2_000_000, higherIsBetter: false, fmt: v => fmtRp(Math.round(v)), fmtShort: v => fmtShortRp(v), volumeSeries: ts.purchVolSeries, volumeValue: ts.totalPurch > 0 ? Math.round(ts.totalPurch).toLocaleString('id-ID') : '—', volumeRawValue: ts.totalPurch },
                { key: `mnc-${ts.source}-roas`, label: 'RoAS CC', color: '#fbbf24', series: ts.ccRoasSeries, value: ts.ccRoas > 0 ? ts.ccRoas.toFixed(2) + '×' : '—', rawValue: ts.ccRoas, sub: 'Target 0.3×', target: 0.3, higherIsBetter: true, fmt: v => v.toFixed(2) + '×', fmtShort: v => v.toFixed(1) + '×', zonedRange: true, volumeSeries: ts.roasRawSeries, volumeLabels: ['30D MA', 'Daily'], volumeFmt: v => v.toFixed(2) + '×', volumeFmtShort: v => v.toFixed(1) + '×' },
              ],
            }))}
          />
        )}

        {/* GOL Brand Snapshot */}
        {golLoading || !gol ? (
          <div style={{ padding: "20px 0", textAlign: "center", color: "rgba(255,255,255,0.2)", fontSize: 12 }}>
            {golLoading ? "Loading GOL data…" : "No data available"}
          </div>
        ) : (
          <BrandOverviewCard
            brandLabel="GOL"
            productName="GOLO"
            brandColor="#84cc16"
            imageSrc={golLogo}
            changelog={gol.changelog}
            charts={[
              { key: 'gol-cprl', label: 'CPRL', color: '#818cf8', series: gol.cprlSeries, value: gol.cprl > 0 ? fmtRp(Math.round(gol.cprl)) : '—', rawValue: gol.cprl, sub: gol.cprlSeries.length > 0 ? `Avg ${fmtShortRp(Math.round(gol.cprlSeries.reduce((s: number, p: {value:number}) => s + p.value, 0) / gol.cprlSeries.length))}` : '', target: gol.cprlSeries.length > 0 ? Math.round(gol.cprlSeries.reduce((s: number, p: {value:number}) => s + p.value, 0) / gol.cprlSeries.length) : 150_000, higherIsBetter: false, fmt: v => fmtRp(Math.round(v)), fmtShort: v => fmtShortRp(v), volumeSeries: gol.leadVolumeSeries, volumeValue: gol.totalLeads > 0 ? Math.round(gol.totalLeads).toLocaleString('id-ID') : '—', volumeRawValue: gol.totalLeads },
              { key: 'gol-cpql', label: 'CPQL', color: '#a78bfa', series: gol.cpqlSeries, value: gol.cpql > 0 ? fmtRp(Math.round(gol.cpql)) : '—', rawValue: gol.cpql, sub: gol.cpqlSeries.length > 0 ? `Avg ${fmtShortRp(Math.round(gol.cpqlSeries.reduce((s: number, p: {value:number}) => s + p.value, 0) / gol.cpqlSeries.length))}` : '', target: gol.cpqlSeries.length > 0 ? Math.round(gol.cpqlSeries.reduce((s: number, p: {value:number}) => s + p.value, 0) / gol.cpqlSeries.length) : 0, higherIsBetter: false, fmt: v => fmtRp(Math.round(v)), fmtShort: v => fmtShortRp(v), volumeSeries: gol.qualVolumeSeries, volumeValue: gol.totalQualLeads > 0 ? Math.round(gol.totalQualLeads).toLocaleString('id-ID') : '—', volumeRawValue: gol.totalQualLeads },
              { key: 'gol-ccvr', label: 'CC CVR', color: '#34d399', series: gol.ccCvrSeries, value: gol.ccCvr > 0 ? gol.ccCvr.toFixed(2) + '%' : '—', rawValue: gol.ccCvr, sub: 'Target 20%', target: 20, higherIsBetter: true, fmt: v => v.toFixed(2) + '%', fmtShort: v => v.toFixed(1) + '%', volumeSeries: gol.ccCvrRawSeries, volumeLabels: ['7D MA', 'Daily'], volumeFmt: v => v.toFixed(2) + '%', volumeFmtShort: v => v.toFixed(1) + '%' },
              { key: 'gol-cpa', label: 'CPA CC', color: '#f472b6', series: gol.cpaSeries, value: gol.cpaCC > 0 ? fmtRp(Math.round(gol.cpaCC)) : '—', rawValue: gol.cpaCC, sub: `Target ${fmtShortRp(2_000_000)}`, target: 2_000_000, higherIsBetter: false, fmt: v => fmtRp(Math.round(v)), fmtShort: v => fmtShortRp(v), volumeSeries: gol.purchVolumeSeries, volumeValue: gol.totalPurchases > 0 ? Math.round(gol.totalPurchases).toLocaleString('id-ID') : '—', volumeRawValue: gol.totalPurchases },
              { key: 'gol-roas', label: 'RoAS Total', color: '#fbbf24', series: gol.roasSeries, value: gol.roas > 0 ? gol.roas.toFixed(2) + '×' : '—', rawValue: gol.roas, sub: 'Target 6.59×', target: 6.59, higherIsBetter: true, fmt: v => v.toFixed(2) + '×', fmtShort: v => v.toFixed(1) + '×', zonedRange: true, volumeSeries: gol.roasRawSeries, volumeLabels: ['30D MA', 'Daily'], volumeFmt: v => v.toFixed(2) + '×', volumeFmtShort: v => v.toFixed(1) + '×' },
            ]}
            trafficSources={gol.trafficSources.map(ts => ({
              label: ts.label, color: ts.color, image: ts.image,
              charts: [
                { key: `gol-${ts.source}-cprl`, label: 'CPRL', color: '#818cf8', series: ts.cprlSeries, value: ts.cprl > 0 ? fmtRp(Math.round(ts.cprl)) : '—', rawValue: ts.cprl, sub: `Avg ${ts.cprlSeries.length > 0 ? fmtShortRp(Math.round(ts.cprlSeries.reduce((s: number, p: {value:number}) => s+p.value,0)/ts.cprlSeries.length)) : '—'}`, target: ts.cprlSeries.length > 0 ? Math.round(ts.cprlSeries.reduce((s: number, p: {value:number}) => s+p.value,0)/ts.cprlSeries.length) : 150_000, higherIsBetter: false, fmt: v => fmtRp(Math.round(v)), fmtShort: v => fmtShortRp(v), volumeSeries: ts.leadVolSeries, volumeValue: ts.totalLeads > 0 ? Math.round(ts.totalLeads).toLocaleString('id-ID') : '—', volumeRawValue: ts.totalLeads },
                { key: `gol-${ts.source}-cpql`, label: 'CPQL', color: '#a78bfa', series: ts.cpqlSeries, value: ts.cpql > 0 ? fmtRp(Math.round(ts.cpql)) : '—', rawValue: ts.cpql, sub: `Avg ${ts.cpqlSeries.length > 0 ? fmtShortRp(Math.round(ts.cpqlSeries.reduce((s: number, p: {value:number}) => s+p.value,0)/ts.cpqlSeries.length)) : '—'}`, target: ts.cpqlSeries.length > 0 ? Math.round(ts.cpqlSeries.reduce((s: number, p: {value:number}) => s+p.value,0)/ts.cpqlSeries.length) : 0, higherIsBetter: false, fmt: v => fmtRp(Math.round(v)), fmtShort: v => fmtShortRp(v), volumeSeries: ts.qualVolSeries, volumeValue: ts.totalQual > 0 ? Math.round(ts.totalQual).toLocaleString('id-ID') : '—', volumeRawValue: ts.totalQual },
                { key: `gol-${ts.source}-ccvr`, label: 'CC CVR', color: '#34d399', series: ts.ccCvrSeries, value: ts.ccCvr > 0 ? ts.ccCvr.toFixed(2) + '%' : '—', rawValue: ts.ccCvr, sub: 'Target 20%', target: 20, higherIsBetter: true, fmt: v => v.toFixed(2) + '%', fmtShort: v => v.toFixed(1) + '%', volumeSeries: ts.ccCvrRawSeries, volumeLabels: ['7D MA', 'Daily'], volumeFmt: v => v.toFixed(2) + '%', volumeFmtShort: v => v.toFixed(1) + '%' },
                { key: `gol-${ts.source}-cpa`, label: 'CPA CC', color: '#f472b6', series: ts.cpaSeries, value: ts.cpaCC > 0 ? fmtRp(Math.round(ts.cpaCC)) : '—', rawValue: ts.cpaCC, sub: `Target ${fmtShortRp(2_000_000)}`, target: 2_000_000, higherIsBetter: false, fmt: v => fmtRp(Math.round(v)), fmtShort: v => fmtShortRp(v), volumeSeries: ts.purchVolSeries, volumeValue: ts.totalPurch > 0 ? Math.round(ts.totalPurch).toLocaleString('id-ID') : '—', volumeRawValue: ts.totalPurch },
                { key: `gol-${ts.source}-roas`, label: 'RoAS CC', color: '#fbbf24', series: ts.ccRoasSeries, value: ts.ccRoas > 0 ? ts.ccRoas.toFixed(2) + '×' : '—', rawValue: ts.ccRoas, sub: 'Target 0.3×', target: 0.3, higherIsBetter: true, fmt: v => v.toFixed(2) + '×', fmtShort: v => v.toFixed(1) + '×', zonedRange: true, volumeSeries: ts.roasRawSeries, volumeLabels: ['30D MA', 'Daily'], volumeFmt: v => v.toFixed(2) + '×', volumeFmtShort: v => v.toFixed(1) + '×' },
              ],
            }))}
          />
        )}

        {/* MCI Brand Snapshot */}
        {mciLoading || !mci ? (
          <div style={{ padding: "20px 0", textAlign: "center", color: "rgba(255,255,255,0.2)", fontSize: 12 }}>
            {mciLoading ? "Loading MCI data…" : "No data available"}
          </div>
        ) : (
          <BrandOverviewCard
            brandLabel="MCI"
            productName="mGanik Care"
            brandColor="#34d399"
            imageSrc={mciLogo}
            changelog={mci.changelog}
            charts={[
              { key: 'mci-cpr', label: 'CPR', color: '#818cf8', series: mci.cprSeries, value: mci.cpr > 0 ? fmtRp(Math.round(mci.cpr)) : '—', rawValue: mci.cpr, sub: `Target ${fmtShortRp(100_000)}`, target: 100_000, higherIsBetter: false, fmt: v => fmtRp(Math.round(v)), fmtShort: v => fmtShortRp(v), volumeSeries: mci.subsVolumeSeries, volumeValue: mci.totalFormSubs > 0 ? Math.round(mci.totalFormSubs).toLocaleString('id-ID') : '—', volumeRawValue: mci.totalFormSubs },
              { key: 'mci-cpv', label: 'CPV', color: '#f472b6', series: mci.cpvSeries, value: mci.cpv > 0 ? fmtRp(Math.round(mci.cpv)) : '—', rawValue: mci.cpv, sub: `Target ${fmtShortRp(500_000)}`, target: 500_000, higherIsBetter: false, fmt: v => fmtRp(Math.round(v)), fmtShort: v => fmtShortRp(v), volumeSeries: mci.convVolumeSeries, volumeValue: mci.totalFormConv > 0 ? Math.round(mci.totalFormConv).toLocaleString('id-ID') : '—', volumeRawValue: mci.totalFormConv },
              { key: 'mci-vr', label: 'Visit Rate', color: '#fbbf24', series: mci.visitRateSeries, value: mci.visitRate > 0 ? mci.visitRate.toFixed(1) + '%' : '—', rawValue: mci.visitRate, sub: 'Target 50%', target: 50, higherIsBetter: true, fmt: v => v.toFixed(1) + '%', fmtShort: v => v.toFixed(0) + '%', volumeSeries: mci.visitRateRawSeries, volumeLabels: ['21D MA', 'Daily'], volumeFmt: v => v.toFixed(1) + '%', volumeFmtShort: v => v.toFixed(0) + '%' },
            ]}
            trafficSources={mci.trafficSources.map(ts => ({
              label: ts.label, color: ts.color, image: ts.image,
              charts: [
                { key: `mci-${ts.source}-cpr`, label: 'CPR', color: '#818cf8', series: ts.cprSeries, value: ts.cpr > 0 ? fmtRp(Math.round(ts.cpr)) : '—', rawValue: ts.cpr, sub: `Target ${fmtShortRp(100_000)}`, target: 100_000, higherIsBetter: false, fmt: v => fmtRp(Math.round(v)), fmtShort: v => fmtShortRp(v), volumeSeries: ts.subsVolSeries, volumeValue: ts.totalSubs > 0 ? Math.round(ts.totalSubs).toLocaleString('id-ID') : '—', volumeRawValue: ts.totalSubs },
                { key: `mci-${ts.source}-cpv`, label: 'CPV', color: '#f472b6', series: ts.cpvSeries, value: ts.cpv > 0 ? fmtRp(Math.round(ts.cpv)) : '—', rawValue: ts.cpv, sub: `Target ${fmtShortRp(500_000)}`, target: 500_000, higherIsBetter: false, fmt: v => fmtRp(Math.round(v)), fmtShort: v => fmtShortRp(v), volumeSeries: ts.convVolSeries, volumeValue: ts.totalConv > 0 ? Math.round(ts.totalConv).toLocaleString('id-ID') : '—', volumeRawValue: ts.totalConv },
                { key: `mci-${ts.source}-vr`, label: 'Visit Rate', color: '#fbbf24', series: ts.visitRateSeries, value: ts.visitRate > 0 ? ts.visitRate.toFixed(1) + '%' : '—', rawValue: ts.visitRate, sub: 'Target 50%', target: 50, higherIsBetter: true, fmt: v => v.toFixed(1) + '%', fmtShort: v => v.toFixed(0) + '%', volumeSeries: ts.vrRawSeries, volumeLabels: ['21D MA', 'Daily'], volumeFmt: v => v.toFixed(1) + '%', volumeFmtShort: v => v.toFixed(0) + '%' },
              ],
            }))}
          />
        )}

      </div>
    </div>
  )
}
