/**
 * DpLeadsPage — MNC DP (Distributor Partner) Leads spread
 * Meta Ads Manager-style tabbed table: Island → Province → City → Agent
 */
import React, { useState, useMemo, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { IndonesiaMap } from '../components/maps/IndonesiaMap'
import { D1_WORKER_URL } from '../config/dataSource'
import { getIsland } from '../config/islandMapping'
import { FALLBACK_COORDS } from '../config/fallbackCoords'
import { IS_GOLO, IS_MNC } from '../config/domainConfig'

// ── Helpers ──────────────────────────────────────────────────────────────────
const dateStr = (d: Date) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
const PRESETS = [
  { label: '7D', days: 7 },
  { label: '14D', days: 14 },
  { label: '30D', days: 30 },
  { label: 'MTD', days: 0 },
]
const fmtNum = (n: number) => Math.round(n).toLocaleString('id-ID')

type ViewLevel = 'island' | 'province' | 'city' | 'agent'
const TABS: { key: ViewLevel; label: string }[] = [
  { key: 'island', label: 'Island' },
  { key: 'province', label: 'Province' },
  { key: 'city', label: 'City' },
  { key: 'agent', label: 'Agent' },
]

// ── Location parsing ─────────────────────────────────────────────────────────
function parseLatLng(lat: string | null, lng: string | null, gUrl: string | null): [number, number] | null {
  if (lat && lng) {
    const la = parseFloat(lat), lo = parseFloat(lng)
    if (!isNaN(la) && !isNaN(lo) && la >= -12 && la <= 8 && lo >= 94 && lo <= 142) return [la, lo]
  }
  if (gUrl) {
    for (const re of [/@(-?\d+\.\d+),\s*(-?\d+\.\d+)/, /\/dir\/(-?\d+\.\d+),\s*(-?\d+\.\d+)/, /daddr=(-?\d+\.\d+),\s*(-?\d+\.\d+)/]) {
      const m = gUrl.match(re)
      if (m) { const la = parseFloat(m[1]), lo = parseFloat(m[2]); if (la >= -12 && la <= 8 && lo >= 94 && lo <= 142) return [la, lo] }
    }
  }
  return null
}

// ── Types ────────────────────────────────────────────────────────────────────
interface CmsAgent {
  newAgentCode: string; name: string; isStarSeller: boolean; type: string
  lat: string | null; lng: string | null; googleMapsUrl: string | null
  isActive: boolean; provinceName: string; cityName: string
}
interface AgentRow {
  kode_agen: string; nama_agen: string
  rl_total: number; ledi_total: number; agdi: number
  rl_paid: number; ledi_paid: number
  rl_dmag: number; ledi_dmag: number
}
interface MergedAgent {
  code: string; name: string; city: string; province: string; island: string
  isStarSeller: boolean; type: string; latLng: [number, number] | null
  rl_total: number; ledi_total: number; agdi: number; revenue: number
  rl_paid: number; rl_dmag: number; rl_organic: number
}
interface AggRow {
  key: string; label: string; count: number
  rl_total: number; ledi_total: number; agdi: number; revenue: number
  leadsPerAgent: number; pv: number; revenuePerAgent: number
  rl_paid: number; rl_dmag: number; rl_organic: number
  island?: string; province?: string; city?: string
}

// ── Styles ───────────────────────────────────────────────────────────────────
const inputStyle: React.CSSProperties = {
  padding: '5px 10px', fontSize: 11, fontWeight: 600, borderRadius: 6,
  border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.05)',
  color: '#e0e2e6', outline: 'none',
}
const thStyle: React.CSSProperties = {
  padding: '6px 10px', fontSize: 9, fontWeight: 700,
  color: 'rgba(255,255,255,0.4)', whiteSpace: 'nowrap',
  borderBottom: '1px solid rgba(255,255,255,0.08)',
  position: 'sticky', top: 0, background: '#111', zIndex: 2,
}
const tdStyle: React.CSSProperties = {
  padding: '5px 10px', fontSize: 11, fontWeight: 600,
  color: 'rgba(255,255,255,0.7)', whiteSpace: 'nowrap',
}

const BRAND_CONFIG: Record<string, { cmsUrl: string; cmsSlug: string; d1Brand: string; label: string }> = {
  MNC: { cmsUrl: 'https://mganik-cache.pages.dev/prod/mganik-distributors-v1.js', cmsSlug: 'mganik', d1Brand: 'MNC', label: 'MNC' },
  GOL: { cmsUrl: 'https://mganik-cache.pages.dev/prod/golo-distributors-v1.js', cmsSlug: 'golo', d1Brand: 'GOL', label: 'GOL' },
}

// ── Component ────────────────────────────────────────────────────────────────
export function DpLeadsPage() {
  const latestDate = () => { const d = new Date(); d.setDate(d.getDate() - 2); return dateStr(d) }

  const domainBrand: 'MNC' | 'GOL' = IS_GOLO ? 'GOL' : 'MNC'
  const isBrandLocked = IS_GOLO || IS_MNC
  const [brand, setBrand] = useState<'MNC' | 'GOL'>(domainBrand)
  const bc = BRAND_CONFIG[brand]

  const [dateFrom, setDateFrom] = useState(() => {
    const t = new Date(); t.setDate(t.getDate() - 2)
    const f = new Date(t); f.setDate(f.getDate() - 29)
    return dateStr(f)
  })
  const [dateTo, setDateTo] = useState(() => latestDate())
  const [searchTerm, setSearchTerm] = useState('')
  const [showMap, setShowMap] = useState(true)
  const [viewLevel, setViewLevel] = useState<ViewLevel>('island')

  // Multi-select filters per level (like Meta Ads Manager)
  // Checked items on a level filter CHILD levels, not the current level.
  const [checkedIslands, setCheckedIslands] = useState<Set<string>>(new Set())
  const [checkedProvinces, setCheckedProvinces] = useState<Set<string>>(new Set())
  const [checkedCities, setCheckedCities] = useState<Set<string>>(new Set())

  const [tableHeight, setTableHeight] = useState(480)
  const [showRlBreakdown, setShowRlBreakdown] = useState(false)

  const [refreshNonce, setRefreshNonce] = useState(0)
  const [isRefreshing, setIsRefreshing] = useState(false)
  type SortCol = 'label' | 'count' | 'pv' | 'rl_total' | 'rl_paid' | 'rl_dmag' | 'rl_organic' | 'leadsPerAgent' | 'ledi_total' | 'lediRate' | 'agdi' | 'agdiRate' | 'revenue' | 'revenuePerAgent'
  const [sortCol, setSortCol] = useState<SortCol>('rl_total')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const toggleSort = (col: SortCol) => {
    if (sortCol === col) setSortDir(d => d === 'desc' ? 'asc' : 'desc')
    else { setSortCol(col); setSortDir('desc') }
  }

  const handleRefresh = () => {
    if (isRefreshing) return
    setIsRefreshing(true)
    setRefreshNonce(n => n + 1)
  }

  const applyPreset = (days: number) => {
    const latest = latestDate()
    const t = new Date(latest + 'T00:00:00')
    if (days === 0) {
      const f = new Date(t.getFullYear(), t.getMonth(), 1)
      setDateFrom(dateStr(f))
    } else {
      const f = new Date(t); f.setDate(f.getDate() - days + 1)
      setDateFrom(dateStr(f))
    }
    setDateTo(latest)
  }

  // Toggle: add/remove item from the checked set for that level
  const toggleCheck = useCallback((level: ViewLevel, key: string) => {
    const toggle = (prev: Set<string>) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key); else next.add(key)
      return next
    }
    if (level === 'island') {
      setCheckedIslands(toggle)
      // Clear child selections that are no longer valid
      setCheckedProvinces(new Set())
      setCheckedCities(new Set())
    } else if (level === 'province') {
      setCheckedProvinces(toggle)
      setCheckedCities(new Set())
    } else if (level === 'city') {
      setCheckedCities(toggle)
    }
  }, [])

  // Tab click: just switch view — filters persist independently
  const switchTab = useCallback((tab: ViewLevel) => {
    setViewLevel(tab)
  }, [])

  // 1) Fetch CMS
  const { data: cmsData, isLoading: cmsLoading } = useQuery({
    queryKey: ['dp-cms', brand],
    queryFn: async () => {
      const res = await fetch(bc.cmsUrl)
      const text = await res.text()
      const json = JSON.parse(text.replace(/^loadDistributors\(/, '').replace(/\);\s*$/, ''))
      const agents: CmsAgent[] = []
      for (const province of json.data.distributors) {
        for (const city of province.cities) {
          for (const db of city.distributorBrands) {
            if (!db.isActive || db.brand?.slug !== bc.cmsSlug) continue
            agents.push({
              newAgentCode: db.newAgentCode || db.oldAgentCode || '',
              name: db.name?.trim() || '-',
              isStarSeller: db.isStarSeller || false,
              type: db.type || 'outlet',
              lat: db.lat, lng: db.lng, googleMapsUrl: db.googleMapsUrl,
              isActive: db.isActive, provinceName: province.name, cityName: city.name,
            })
          }
        }
      }
      return agents
    },
    staleTime: 1000 * 60 * 60,
  })

  // 2) Fetch D1 leads + page views (single endpoint)
  const { data: leadsData, isLoading: leadsLoading } = useQuery({
    queryKey: ['dp-leads', brand, dateFrom, dateTo, refreshNonce],
    queryFn: async () => {
      const bust = refreshNonce > 0 ? `&_r=${refreshNonce}` : ''
      const res = await fetch(`${D1_WORKER_URL}/v2/dp-leads?brand=${bc.d1Brand}&from=${dateFrom}&to=${dateTo}${bust}`)
      setIsRefreshing(false)
      return res.json() as Promise<{
        rows: AgentRow[]
        pageViews: { province: string; city: string; page_views: number }[]
        revenue: { kode_agen: string; revenue: number }[]
        revFrom: string
      }>
    },
    enabled: !!dateFrom && !!dateTo,
  })

  const { heatData, pvByIsland, pvByProvince, pvByCity } = useMemo(() => {
    if (!leadsData?.pageViews) return { heatData: undefined, pvByIsland: new Map<string, number>(), pvByProvince: new Map<string, number>(), pvByCity: new Map<string, number>() }
    const hm = new Map<string, number>()
    const isl = new Map<string, number>()
    const prov = new Map<string, number>()
    const city = new Map<string, number>()
    for (const r of leadsData.pageViews) {
      // Province-level for heatmap
      hm.set(r.province, (hm.get(r.province) ?? 0) + r.page_views)
      // Island-level
      const island = getIsland(r.province)
      isl.set(island, (isl.get(island) ?? 0) + r.page_views)
      // Province-level
      prov.set(r.province, (prov.get(r.province) ?? 0) + r.page_views)
      // City-level
      city.set(r.city, (city.get(r.city) ?? 0) + r.page_views)
    }
    return { heatData: hm, pvByIsland: isl, pvByProvince: prov, pvByCity: city }
  }, [leadsData])

  // 3) Index leads by agent code + name (composite key) — already aggregated by worker
  const leadsMap = useMemo(() => {
    const m = new Map<string, { rl_total: number; ledi_total: number; agdi: number; rl_paid: number; rl_dmag: number; rl_organic: number }>()
    if (!leadsData?.rows) return m
    for (const r of leadsData.rows) {
      const key = `${r.kode_agen}|${r.nama_agen.trim()}`
      const rl_organic = Math.max(0, r.rl_total - r.rl_paid - r.rl_dmag)
      m.set(key, { rl_total: r.rl_total, ledi_total: r.ledi_total, agdi: r.agdi, rl_paid: r.rl_paid, rl_dmag: r.rl_dmag, rl_organic })
    }
    return m
  }, [leadsData])

  // 3b) Index revenue by kode_agen (CMS names match exactly)
  const revenueMap = useMemo(() => {
    const m = new Map<string, number>()
    if (!leadsData?.revenue) return m
    for (const r of leadsData.revenue) {
      m.set(r.kode_agen, (m.get(r.kode_agen) ?? 0) + r.revenue)
    }
    return m
  }, [leadsData])

  // 4) Merge CMS + leads + revenue
  const agents = useMemo((): MergedAgent[] => {
    if (!cmsData) return []
    return cmsData.map(c => {
      const key = `${c.newAgentCode}|${c.name.trim()}`
      const leads = leadsMap.get(key)
      const rev = revenueMap.get(c.newAgentCode) ?? 0
      return {
        code: c.newAgentCode, name: c.name, city: c.cityName, province: c.provinceName,
        island: getIsland(c.provinceName),
        isStarSeller: c.isStarSeller, type: c.type,
        latLng: parseLatLng(c.lat, c.lng, c.googleMapsUrl) ?? FALLBACK_COORDS[key] ?? null,
        rl_total: leads?.rl_total ?? 0, ledi_total: leads?.ledi_total ?? 0, agdi: leads?.agdi ?? 0,
        revenue: rev,
        rl_paid: leads?.rl_paid ?? 0, rl_dmag: leads?.rl_dmag ?? 0, rl_organic: leads?.rl_organic ?? 0,
      }
    }).sort((a, b) => b.rl_total - a.rl_total)
  }, [cmsData, leadsMap, revenueMap])

  // Paid vs DM Agen vs Organic breakdown (RL + LEDI) — from CMS-joined agents so totals match
  const leadBreakdown = useMemo(() => {
    const r = { paid: 0, dmag: 0, organic: 0, paidLedi: 0, dmagLedi: 0, organicLedi: 0 }
    for (const a of agents) {
      r.paid += a.rl_paid
      r.dmag += a.rl_dmag
      r.organic += a.rl_organic
    }
    return r
  }, [agents])

  // Filter agents by PARENT-level checked items (not current level)
  // Island tab: all agents visible. Province tab: filtered by checkedIslands. etc.
  const filtered = useMemo(() => {
    let list = agents
    // Apply parent-level filters based on current viewLevel
    if (viewLevel !== 'island' && checkedIslands.size > 0)
      list = list.filter(a => checkedIslands.has(a.island))
    if ((viewLevel === 'city' || viewLevel === 'agent') && checkedProvinces.size > 0)
      list = list.filter(a => checkedProvinces.has(a.province))
    if (viewLevel === 'agent' && checkedCities.size > 0)
      list = list.filter(a => checkedCities.has(a.city))
    // Search
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase().trim()
      list = list.filter(a =>
        a.name.toLowerCase().includes(q) || a.code.toLowerCase().includes(q) ||
        a.city.toLowerCase().includes(q) || a.province.toLowerCase().includes(q) ||
        a.island.toLowerCase().includes(q)
      )
    }
    return list
  }, [agents, searchTerm, viewLevel, checkedIslands, checkedProvinces, checkedCities])

  // Map markers
  const mapPoints = useMemo(() =>
    agents.filter((a): a is MergedAgent & { latLng: [number, number] } => a.latLng !== null),
    [agents]
  )

  // Number of days in selected range
  const numDays = useMemo(() => {
    const from = new Date(dateFrom + 'T00:00:00')
    const to = new Date(dateTo + 'T00:00:00')
    return Math.max(1, Math.round((to.getTime() - from.getTime()) / 86400000) + 1)
  }, [dateFrom, dateTo])

  // Revenue uses a wider date range (warm-up: at least 30 days)
  const revDays = useMemo(() => {
    const rf = leadsData?.revFrom ?? dateFrom
    const from = new Date(rf + 'T00:00:00')
    const to = new Date(dateTo + 'T00:00:00')
    return Math.max(1, Math.round((to.getTime() - from.getTime()) / 86400000) + 1)
  }, [leadsData?.revFrom, dateFrom, dateTo])

  // Aggregation for each view level
  const aggRows = useMemo((): AggRow[] => {
    const map = new Map<string, { count: number; rl: number; ledi: number; agdi: number; rev: number; rl_paid: number; rl_dmag: number; rl_organic: number; island: string; province: string; city: string }>()
    for (const a of filtered) {
      const key = viewLevel === 'island' ? a.island
        : viewLevel === 'province' ? a.province
        : viewLevel === 'city' ? a.city
        : a.code + '|' + a.name
      let g = map.get(key)
      if (!g) { g = { count: 0, rl: 0, ledi: 0, agdi: 0, rev: 0, rl_paid: 0, rl_dmag: 0, rl_organic: 0, island: a.island, province: a.province, city: a.city }; map.set(key, g) }
      g.count++
      g.rl += a.rl_total; g.ledi += a.ledi_total; g.agdi += a.agdi; g.rev += a.revenue
      g.rl_paid += a.rl_paid; g.rl_dmag += a.rl_dmag; g.rl_organic += a.rl_organic
    }
    const pvMap = viewLevel === 'island' ? pvByIsland : viewLevel === 'province' ? pvByProvince : pvByCity
    // Include PV-only entries, filtered by parent-level checked items
    if (pvMap && (viewLevel === 'island' || viewLevel === 'province')) {
      for (const key of pvMap.keys()) {
        if (map.has(key)) continue
        // Province tab: only include PV provinces within checked islands
        if (viewLevel === 'province' && checkedIslands.size > 0 && !checkedIslands.has(getIsland(key))) continue
        map.set(key, { count: 0, rl: 0, ledi: 0, agdi: 0, rev: 0, rl_paid: 0, rl_dmag: 0, rl_organic: 0, island: viewLevel === 'province' ? getIsland(key) : key, province: viewLevel === 'province' ? key : '', city: '' })
      }
    }
    return Array.from(map.entries())
      .map(([key, g]) => ({
        key, label: viewLevel === 'agent' ? key.split('|')[1] || key : key,
        count: g.count, rl_total: g.rl, ledi_total: g.ledi, agdi: g.agdi, revenue: g.rev,
        rl_paid: g.rl_paid, rl_dmag: g.rl_dmag, rl_organic: g.rl_organic,
        leadsPerAgent: g.count > 0 ? g.rl / g.count / numDays : 0,
        revenuePerAgent: g.count > 0 ? (g.rev / revDays) * 30 / g.count : 0,
        pv: viewLevel !== 'agent' ? (pvMap.get(key) ?? 0) : 0,
        island: g.island, province: g.province, city: g.city,
      }))
      .sort((a, b) => {
        const lediRateA = a.rl_total > 0 ? a.ledi_total / a.rl_total : 0
        const lediRateB = b.rl_total > 0 ? b.ledi_total / b.rl_total : 0
        const agdiRateA = a.rl_total > 0 ? a.agdi / a.rl_total : 0
        const agdiRateB = b.rl_total > 0 ? b.agdi / b.rl_total : 0
        let cmp = 0
        switch (sortCol) {
          case 'label': cmp = a.label.localeCompare(b.label); break
          case 'count': cmp = a.count - b.count; break
          case 'pv': cmp = a.pv - b.pv; break
          case 'rl_total': cmp = a.rl_total - b.rl_total; break
          case 'rl_paid': cmp = a.rl_paid - b.rl_paid; break
          case 'rl_dmag': cmp = a.rl_dmag - b.rl_dmag; break
          case 'rl_organic': cmp = a.rl_organic - b.rl_organic; break
          case 'leadsPerAgent': cmp = a.leadsPerAgent - b.leadsPerAgent; break
          case 'ledi_total': cmp = a.ledi_total - b.ledi_total; break
          case 'lediRate': cmp = lediRateA - lediRateB; break
          case 'agdi': cmp = a.agdi - b.agdi; break
          case 'agdiRate': cmp = agdiRateA - agdiRateB; break
          case 'revenue': cmp = a.revenue - b.revenue; break
          case 'revenuePerAgent': cmp = a.revenuePerAgent - b.revenuePerAgent; break
        }
        return sortDir === 'desc' ? -cmp : cmp
      })
  }, [filtered, viewLevel, numDays, revDays, pvByIsland, pvByProvince, pvByCity, sortCol, sortDir, checkedIslands])

  // Global stats (unfiltered — for summary cards above the table)
  const globalTotals = useMemo(() => {
    const t = { total: 0, rl_total: 0, ledi_total: 0, agdi: 0, revenue: 0 }
    for (const a of agents) { t.total++; t.rl_total += a.rl_total; t.ledi_total += a.ledi_total; t.agdi += a.agdi; t.revenue += a.revenue }
    return t
  }, [agents])

  // Quick stats (filtered — for table footer)
  const totals = useMemo(() => {
    const t = { total: 0, rl_total: 0, ledi_total: 0, agdi: 0, revenue: 0 }
    for (const a of filtered) { t.total++; t.rl_total += a.rl_total; t.ledi_total += a.ledi_total; t.agdi += a.agdi; t.revenue += a.revenue }
    return t
  }, [filtered])

  // Breadcrumb
  // Active filter chips for display
  const activeFilters = useMemo(() => {
    const chips: { label: string; key: string; onClear: () => void }[] = []
    for (const isl of checkedIslands) chips.push({
      label: `Island: ${isl}`, key: `i-${isl}`,
      onClear: () => { setCheckedIslands(prev => { const n = new Set(prev); n.delete(isl); return n }); setCheckedProvinces(new Set()); setCheckedCities(new Set()) },
    })
    for (const prov of checkedProvinces) chips.push({
      label: `Province: ${prov}`, key: `p-${prov}`,
      onClear: () => { setCheckedProvinces(prev => { const n = new Set(prev); n.delete(prov); return n }); setCheckedCities(new Set()) },
    })
    for (const city of checkedCities) chips.push({
      label: `City: ${city}`, key: `c-${city}`,
      onClear: () => setCheckedCities(prev => { const n = new Set(prev); n.delete(city); return n }),
    })
    return chips
  }, [checkedIslands, checkedProvinces, checkedCities])

  // Column label for first column
  const firstColLabel = viewLevel === 'island' ? 'Island' : viewLevel === 'province' ? 'Province' : viewLevel === 'city' ? 'City' : 'Agent'

  const isDataLoading = cmsLoading || leadsLoading

  if (isDataLoading) return (
    <div style={{
      minHeight: '100vh', background: '#0d0e12',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: 'Inter, system-ui, sans-serif', color: '#fff',
      flexDirection: 'column', gap: 0,
    }}>
      <style>{`
        @keyframes dpPulse { 0% { transform: scale(1); opacity: 0.6; } 100% { transform: scale(2.2); opacity: 0; } }
        @keyframes dpSpin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
        @keyframes dpBlink { 0%,100% { opacity: 0.2; } 50% { opacity: 1; } }
      `}</style>
      {/* Pulse rings + spinner */}
      <div style={{ position: 'relative', width: 80, height: 80, marginBottom: 32 }}>
        {[0, 1, 2].map(i => (
          <div key={i} style={{
            position: 'absolute', inset: 0, borderRadius: '50%',
            border: '1.5px solid rgba(129,140,248,0.25)',
            animation: `dpPulse 2s ease-out ${i * 0.6}s infinite`,
          }} />
        ))}
        <div style={{
          position: 'absolute', inset: 14, borderRadius: '50%',
          border: '2px solid rgba(129,140,248,0.15)',
          borderTopColor: '#818cf8', borderRightColor: '#38bdf8',
          animation: 'dpSpin 1s linear infinite',
        }} />
        <div style={{
          position: 'absolute', inset: '50%', transform: 'translate(-50%,-50%)',
          width: 8, height: 8, borderRadius: '50%',
          background: 'radial-gradient(circle, #818cf8, #38bdf8)',
          boxShadow: '0 0 12px #818cf8cc',
        }} />
      </div>
      <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', color: '#818cf8', marginBottom: 6 }}>
        DP Leads
      </div>
      <div style={{ fontSize: 20, fontWeight: 700, color: '#fff', marginBottom: 6 }}>Loading data…</div>
      <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)', marginBottom: 32 }}>
        Fetching {brand} — {dateFrom} → {dateTo}
      </div>
      {/* Step checklist */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, width: 240 }}>
        {[
          { label: 'Agent directory (CMS)', done: !cmsLoading },
          { label: 'Real leads (D1)', done: !leadsLoading },
        ].map((step, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 16, height: 16, borderRadius: '50%', flexShrink: 0,
              border: step.done ? 'none' : '1.5px solid rgba(129,140,248,0.4)',
              background: step.done ? 'rgba(52,211,153,0.2)' : 'transparent',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              {step.done
                ? <svg width="9" height="9" viewBox="0 0 12 12" fill="none"><polyline points="2,6 5,9 10,3" stroke="#34d399" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
                : <div style={{ width: 5, height: 5, borderRadius: '50%', background: '#818cf8', animation: `dpBlink 1.4s ease-in-out ${i * 0.25}s infinite` }} />
              }
            </div>
            <span style={{ fontSize: 12, color: step.done ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.85)', textDecoration: step.done ? 'line-through' : 'none' }}>
              {step.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  )

  return (
    <div style={{ padding: '32px 40px', fontFamily: 'Inter, system-ui, sans-serif', color: '#fff' }}>
      <h1 style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.03em', marginBottom: 8 }}>DP Leads</h1>
      <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginBottom: 28 }}>
        Distributor Partner leads by agent — ads-attributed only (META, DGEN).
      </p>

      {/* Controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
        {/* Brand picker — hidden on brand-specific domains */}
        {!isBrandLocked && <div style={{ display: 'flex', borderRadius: 8, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.1)' }}>
          {(['MNC', 'GOL'] as const).map(b => (
            <button key={b} onClick={() => { setBrand(b); setDrillFilter({}); setViewLevel('island'); setSearchTerm('') }}
              style={{
                padding: '6px 14px', fontSize: 12, fontWeight: brand === b ? 800 : 600, cursor: 'pointer',
                background: brand === b ? 'rgba(129,140,248,0.15)' : 'rgba(255,255,255,0.03)',
                color: brand === b ? '#818cf8' : 'rgba(255,255,255,0.4)',
                border: 'none', borderRight: b === 'MNC' ? '1px solid rgba(255,255,255,0.1)' : 'none',
              }}>{b}</button>
          ))}
        </div>}
        <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
          style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#fff', padding: '6px 10px', fontSize: 13 }} />
        <span style={{ color: 'rgba(255,255,255,0.9)' }}>→</span>
        <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
          style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#fff', padding: '6px 10px', fontSize: 13 }} />
        <div style={{ display: 'flex', gap: 6 }}>
          {PRESETS.map(p => (
            <button key={p.label} onClick={() => applyPreset(p.days)}
              style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 6, color: '#fff', padding: '5px 10px', fontSize: 12, cursor: 'pointer' }}>
              {p.label}
            </button>
          ))}
        </div>
        <input type="text" placeholder="Search…" value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
          style={{ ...inputStyle, width: 220 }} />
        <button onClick={() => setShowMap(p => !p)} style={{
          padding: '5px 12px', fontSize: 10, fontWeight: 700, borderRadius: 6, border: 'none', cursor: 'pointer',
          background: showMap ? 'rgba(129,140,248,0.2)' : 'rgba(255,255,255,0.06)',
          color: showMap ? '#818cf8' : 'rgba(255,255,255,0.4)',
        }}>{showMap ? '🗺 Hide Map' : '🗺 Show Map'}</button>
        <button
          onClick={handleRefresh}
          disabled={isRefreshing}
          title="Refresh — busts Cloudflare cache"
          style={{
            display: 'flex', alignItems: 'center', gap: 4,
            background: isRefreshing ? 'rgba(129,140,248,0.12)' : 'rgba(255,255,255,0.06)',
            border: `1px solid ${isRefreshing ? 'rgba(129,140,248,0.4)' : 'rgba(255,255,255,0.15)'}`,
            borderRadius: 6, color: isRefreshing ? '#818cf8' : 'rgba(255,255,255,0.7)',
            padding: '5px 9px', fontSize: 14, cursor: isRefreshing ? 'default' : 'pointer',
          }}>
          <span style={{ display: 'inline-block', animation: isRefreshing ? 'spin 1s linear infinite' : 'none' }}>↻</span>
          <span style={{ fontSize: 11, fontWeight: 600 }}>{isRefreshing ? 'Refreshing…' : 'Refresh'}</span>
        </button>
        <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)' }}>
          {leadsLoading ? 'Loading…' : `${globalTotals.total} DPs`}
        </div>
      </div>

      {/* ── Real Leads Breakdown Card + Stats ── */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap', alignItems: 'stretch' }}>

        {/* RL Breakdown Card */}
        <div style={{
          flex: '0 0 auto', minWidth: 380,
          background: 'rgba(255,255,255,0.04)',
          border: '1px solid rgba(255,255,255,0.09)',
          borderRadius: 14, padding: '24px 28px',
          fontFamily: 'Inter, system-ui, sans-serif',
          display: 'flex', gap: 24,
        }}>
          {/* LEFT: metrics stack */}
          <div style={{ flex: '0 0 140px', display: 'flex', flexDirection: 'column', gap: 12 }}>
            {/* Total Real Leads */}
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', color: 'rgba(255,255,255,0.50)', textTransform: 'uppercase', marginBottom: 3 }}>Total Real Leads</div>
              <div style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-0.04em', color: '#fff', lineHeight: 1 }}>
                {fmtNum(globalTotals.rl_total)}
              </div>
            </div>

            {/* Lead Dispatch */}
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', color: 'rgba(255,255,255,0.50)', textTransform: 'uppercase', marginBottom: 3 }}>Lead Dispatch</div>
              <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: '-0.04em', color: '#fff', lineHeight: 1 }}>
                {fmtNum(globalTotals.ledi_total)}
              </div>
            </div>

            {/* LEDI Rate */}
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', color: 'rgba(255,255,255,0.50)', textTransform: 'uppercase', marginBottom: 3 }}>LEDI Rate</div>
              <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: '-0.04em', color: 'rgba(255,255,255,0.72)', lineHeight: 1 }}>
                {globalTotals.rl_total > 0 ? (globalTotals.ledi_total / globalTotals.rl_total * 100).toFixed(1) + '%' : '-'}
              </div>
            </div>
          </div>

          {/* RIGHT: Breakdown by Source */}
          <div style={{ flex: '1 1 auto', borderLeft: '1px solid rgba(255,255,255,0.06)', paddingLeft: 24, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', color: 'rgba(255,255,255,0.50)', textTransform: 'uppercase', marginBottom: -2 }}>Breakdown by Source</div>
            {[
              { label: 'Paid Ads', color: '#f59e0b', rl: leadBreakdown.paid },
              { label: 'DM Agen', color: '#38bdf8', rl: leadBreakdown.dmag },
              { label: 'Organic', color: '#a78bfa', rl: leadBreakdown.organic },
            ].map(ch => {
              const pct = globalTotals.rl_total > 0 ? (ch.rl / globalTotals.rl_total) * 100 : 0
              return (
                <div key={ch.label}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 3 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: ch.color, letterSpacing: '0.07em' }}>{ch.label}</span>
                    <div style={{ textAlign: 'right' }}>
                      <span style={{ fontSize: 11, fontWeight: 800, color: '#fff', letterSpacing: '-0.02em' }}>
                        {fmtNum(ch.rl)}
                      </span>
                      <span style={{ fontSize: 9, fontWeight: 600, color: 'rgba(255,255,255,0.4)', marginLeft: 4 }}>
                        {pct.toFixed(1)}%
                      </span>
                    </div>
                  </div>
                  <div style={{ height: 3, background: 'rgba(255,255,255,0.07)', borderRadius: 2 }}>
                    <div style={{ height: '100%', width: `${pct}%`, background: ch.color, borderRadius: 2, transition: 'width 0.4s ease' }} />
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Reseller & Dispatch Card */}
        <div style={{
          flex: '0 0 auto', minWidth: 300,
          background: 'rgba(255,255,255,0.04)',
          border: '1px solid rgba(255,255,255,0.09)',
          borderRadius: 14, padding: '24px 28px',
          fontFamily: 'Inter, system-ui, sans-serif',
          display: 'flex', gap: 24,
        }}>
          {/* LEFT: metrics stack */}
          <div style={{ flex: '0 0 140px', display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', color: 'rgba(255,255,255,0.50)', textTransform: 'uppercase', marginBottom: 3 }}>Total Reseller</div>
              <div style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-0.04em', color: '#fff', lineHeight: 1 }}>
                {fmtNum(globalTotals.total)}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', color: 'rgba(255,255,255,0.50)', textTransform: 'uppercase', marginBottom: 3 }}>Agen Dispatch</div>
              <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: '-0.04em', color: '#fff', lineHeight: 1 }}>
                {fmtNum(globalTotals.agdi)}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', color: 'rgba(255,255,255,0.50)', textTransform: 'uppercase', marginBottom: 3 }}>AGDI Rate</div>
              <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: '-0.04em', color: 'rgba(255,255,255,0.72)', lineHeight: 1 }}>
                {globalTotals.rl_total > 0 ? (globalTotals.agdi / globalTotals.rl_total * 100).toFixed(1) + '%' : '-'}
              </div>
            </div>
          </div>

          {/* RIGHT: Daily RL/Agen */}
          <div style={{ flex: '1 1 auto', borderLeft: '1px solid rgba(255,255,255,0.06)', paddingLeft: 24, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', color: 'rgba(255,255,255,0.50)', textTransform: 'uppercase', marginBottom: 3 }}>Daily RL/Agen</div>
            <div style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-0.04em', color: '#34d399', lineHeight: 1 }}>
              {globalTotals.total > 0 ? (globalTotals.rl_total / globalTotals.total / numDays).toFixed(2) : '0'}
            </div>
          </div>
        </div>

        {/* Revenue Card */}
        <div style={{
          flex: '1 1 auto', minWidth: 220,
          background: 'rgba(255,255,255,0.04)',
          border: '1px solid rgba(255,255,255,0.09)',
          borderRadius: 14, padding: '24px 28px',
          fontFamily: 'Inter, system-ui, sans-serif',
          display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 12,
        }}>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', color: 'rgba(255,255,255,0.50)', textTransform: 'uppercase', marginBottom: 3 }}>Total Revenue</div>
            <div style={{ fontSize: 24, fontWeight: 800, letterSpacing: '-0.04em', color: '#34d399', lineHeight: 1 }}>
              {globalTotals.revenue > 0 ? 'Rp ' + fmtNum(globalTotals.revenue) : '-'}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', color: 'rgba(255,255,255,0.50)', textTransform: 'uppercase', marginBottom: 3 }}>Mo. Revenue / Agent</div>
            <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: '-0.04em', color: '#34d399', lineHeight: 1, opacity: 0.72 }}>
              {globalTotals.total > 0 && globalTotals.revenue > 0 ? 'Rp ' + fmtNum(Math.round((globalTotals.revenue / revDays) * 30 / globalTotals.total)) : '-'}
            </div>
          </div>
        </div>
      </div>

      {/* Map */}
      {showMap && mapPoints.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <IndonesiaMap agents={mapPoints} heatData={heatData} />
        </div>
      )}

      {/* Tabs — Meta Ads Manager style */}
      <div style={{ display: 'flex', borderBottom: '1px solid rgba(255,255,255,0.08)', marginBottom: 0 }}>
        {TABS.map(tab => {
          const active = viewLevel === tab.key
          return (
            <button key={tab.key} onClick={() => switchTab(tab.key)} style={{
              padding: '8px 20px', fontSize: 12, fontWeight: active ? 800 : 600, cursor: 'pointer',
              background: 'none', border: 'none', borderBottom: active ? '2px solid #818cf8' : '2px solid transparent',
              color: active ? '#818cf8' : 'rgba(255,255,255,0.4)',
              marginBottom: -1, transition: 'all 0.15s',
            }}>{tab.label}</button>
          )
        })}
      </div>

      {/* Filter Chips */}
      {activeFilters.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 0', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 9, fontWeight: 600, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Filters:</span>
          {activeFilters.map(f => (
            <span key={f.key} style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              padding: '3px 8px', fontSize: 10, fontWeight: 700, borderRadius: 6,
              background: 'rgba(129,140,248,0.12)', color: '#818cf8',
              border: '1px solid rgba(129,140,248,0.2)',
            }}>
              {f.label}
              <span onClick={f.onClear} style={{ cursor: 'pointer', fontSize: 12, lineHeight: 1, opacity: 0.6 }}>×</span>
            </span>
          ))}
          <span onClick={() => { setCheckedIslands(new Set()); setCheckedProvinces(new Set()); setCheckedCities(new Set()) }}
            style={{ fontSize: 9, fontWeight: 600, color: 'rgba(255,255,255,0.3)', cursor: 'pointer', textDecoration: 'underline' }}>
            Clear all
          </span>
        </div>
      )}

      {/* RL Breakdown Toggle + Table */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 6 }}>
        <button onClick={() => setShowRlBreakdown(v => !v)} style={{
          display: 'inline-flex', alignItems: 'center', gap: 5,
          padding: '4px 10px', fontSize: 9, fontWeight: 700, borderRadius: 5,
          border: `1px solid ${showRlBreakdown ? 'rgba(129,140,248,0.4)' : 'rgba(255,255,255,0.1)'}`,
          background: showRlBreakdown ? 'rgba(129,140,248,0.15)' : 'rgba(255,255,255,0.04)',
          color: showRlBreakdown ? '#818cf8' : 'rgba(255,255,255,0.45)',
          cursor: 'pointer', letterSpacing: '0.03em',
        }}>
          <span style={{ fontSize: 10 }}>{showRlBreakdown ? '−' : '+'}</span>
          RL Breakdown
        </button>
      </div>
      <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '0 0 10px 10px', overflow: 'auto', height: tableHeight }}>
        <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, fontSize: 11 }}>
          <thead>
            <tr>
              {(() => {
                const arrow = (col: SortCol) => sortCol === col ? (sortDir === 'desc' ? ' ▼' : ' ▲') : ''
                const sth = (col: SortCol, label: string, align: 'left' | 'right', extra?: React.CSSProperties) => (
                  <th onClick={() => toggleSort(col)} style={{ ...thStyle, textAlign: align, cursor: 'pointer', userSelect: 'none', ...extra }}>
                    {label}{arrow(col)}
                  </th>
                )
                return <>
                  {viewLevel !== 'agent' && <th style={{ ...thStyle, width: 28, padding: '6px 0', textAlign: 'center', position: 'sticky', left: 0, zIndex: 4, background: '#111' }}></th>}
                  {sth('label', firstColLabel, 'left', { position: 'sticky', left: viewLevel !== 'agent' ? 28 : 0, zIndex: 3, background: '#111', minWidth: 220 })}
                  {viewLevel === 'province' && <th style={{ ...thStyle, textAlign: 'left', color: 'rgba(255,255,255,0.4)' }}>Island</th>}
                  {viewLevel === 'city' && <th style={{ ...thStyle, textAlign: 'left', color: 'rgba(255,255,255,0.4)' }}>Province</th>}
                  {viewLevel === 'agent' && <th style={{ ...thStyle, textAlign: 'left', color: 'rgba(255,255,255,0.4)' }}>Province</th>}
                  {viewLevel === 'agent' && <th style={{ ...thStyle, textAlign: 'left', color: 'rgba(255,255,255,0.4)' }}>City</th>}
                  {viewLevel !== 'agent' && sth('count', 'Resellers', 'right')}
                  {(viewLevel === 'island' || viewLevel === 'province') && sth('pv', 'Page Views', 'right')}
                  {sth('rl_total', 'RL Total', 'right')}
                  {showRlBreakdown && <>
                    {sth('rl_paid', 'Paid', 'right', { color: '#f59e0b', fontWeight: 600, fontSize: 9 })}
                    {sth('rl_dmag', 'DM Agen', 'right', { color: '#38bdf8', fontWeight: 600, fontSize: 9 })}
                    {sth('rl_organic', 'Organic', 'right', { color: '#a78bfa', fontWeight: 600, fontSize: 9 })}
                  </>}
                  {sth('leadsPerAgent', 'Daily RL/Agent', 'right')}
                  {sth('ledi_total', 'LEDI Total', 'right')}
                  {sth('lediRate', 'LEDI Rate', 'right')}
                  {sth('agdi', 'AGDI', 'right')}
                  {sth('agdiRate', 'AGDI Rate', 'right')}
                  {sth('revenue', 'Revenue', 'right')}
                  {viewLevel !== 'agent' && sth('revenuePerAgent', 'Mo. Rev/Agent', 'right')}
                </>
              })()}
            </tr>
          </thead>
          <tbody>
            {aggRows.map((row, i) => {
              const bg = i % 2 === 0 ? '#0d0e12' : '#111215'
              const canFilter = viewLevel !== 'agent'
              const isChecked = viewLevel === 'island' ? checkedIslands.has(row.key)
                : viewLevel === 'province' ? checkedProvinces.has(row.key)
                : viewLevel === 'city' ? checkedCities.has(row.key) : false
              return (
                <tr key={row.key}>
                  {canFilter && (
                    <td style={{ ...tdStyle, width: 28, padding: '6px 0', textAlign: 'center', position: 'sticky', left: 0, zIndex: 2, background: bg }}>
                      <input type="checkbox" checked={isChecked} onChange={() => toggleCheck(viewLevel, row.key)}
                        style={{ width: 13, height: 13, cursor: 'pointer', accentColor: '#818cf8' }} />
                    </td>
                  )}
                  <td style={{ ...tdStyle, textAlign: 'left', position: 'sticky', left: canFilter ? 28 : 0, zIndex: 1, background: bg, minWidth: 220 }}>
                    <span style={{ fontWeight: 700, color: '#e0e2e6' }}>{row.label}</span>
                    {viewLevel === 'agent' && (
                      <div style={{ fontSize: 8, color: 'rgba(255,255,255,0.3)', marginTop: 1 }}>{row.key.split('|')[0]}</div>
                    )}
                  </td>
                  {viewLevel === 'province' && <td style={{ ...tdStyle, textAlign: 'left', color: 'rgba(255,255,255,0.4)', fontSize: 10 }}>{row.island}</td>}
                  {viewLevel === 'city' && <td style={{ ...tdStyle, textAlign: 'left', color: 'rgba(255,255,255,0.4)', fontSize: 10 }}>{row.province}</td>}
                  {viewLevel === 'agent' && <td style={{ ...tdStyle, textAlign: 'left', color: 'rgba(255,255,255,0.4)', fontSize: 10 }}>{row.province}</td>}
                  {viewLevel === 'agent' && <td style={{ ...tdStyle, textAlign: 'left', color: 'rgba(255,255,255,0.4)', fontSize: 10 }}>{row.city}</td>}
                  {viewLevel !== 'agent' && <td style={{ ...tdStyle, textAlign: 'right', color: 'rgba(255,255,255,0.5)' }}>{fmtNum(row.count)}</td>}
                  {(viewLevel === 'island' || viewLevel === 'province') && <td style={{ ...tdStyle, textAlign: 'right', color: row.pv > 0 ? '#f59e0b' : 'rgba(255,255,255,0.15)' }}>{row.pv > 0 ? fmtNum(row.pv) : '-'}</td>}
                  <td style={{ ...tdStyle, textAlign: 'right', color: row.rl_total > 0 ? '#818cf8' : 'rgba(255,255,255,0.15)', fontWeight: 800 }}>{fmtNum(row.rl_total)}</td>
                  {showRlBreakdown && <>
                    <td style={{ ...tdStyle, textAlign: 'right', color: row.rl_paid > 0 ? '#f59e0b' : 'rgba(255,255,255,0.12)', fontSize: 10 }}>{row.rl_paid > 0 ? fmtNum(row.rl_paid) : '-'}</td>
                    <td style={{ ...tdStyle, textAlign: 'right', color: row.rl_dmag > 0 ? '#38bdf8' : 'rgba(255,255,255,0.12)', fontSize: 10 }}>{row.rl_dmag > 0 ? fmtNum(row.rl_dmag) : '-'}</td>
                    <td style={{ ...tdStyle, textAlign: 'right', color: row.rl_organic > 0 ? '#a78bfa' : 'rgba(255,255,255,0.12)', fontSize: 10 }}>{row.rl_organic > 0 ? fmtNum(row.rl_organic) : '-'}</td>
                  </>}
                  <td style={{ ...tdStyle, textAlign: 'right', color: row.leadsPerAgent > 0 ? '#34d399' : 'rgba(255,255,255,0.15)' }}>{row.leadsPerAgent.toFixed(2)}</td>
                  <td style={{ ...tdStyle, textAlign: 'right', color: row.ledi_total > 0 ? '#818cf8' : 'rgba(255,255,255,0.15)', fontWeight: 800 }}>{fmtNum(row.ledi_total)}</td>
                  <td style={{ ...tdStyle, textAlign: 'right', color: row.rl_total > 0 ? '#34d399' : 'rgba(255,255,255,0.15)' }}>{row.rl_total > 0 ? (row.ledi_total / row.rl_total * 100).toFixed(1) + '%' : '-'}</td>
                  <td style={{ ...tdStyle, textAlign: 'right', color: row.agdi > 0 ? '#e0e2e6' : 'rgba(255,255,255,0.15)' }}>{fmtNum(row.agdi)}</td>
                  <td style={{ ...tdStyle, textAlign: 'right', color: row.rl_total > 0 ? '#fbbf24' : 'rgba(255,255,255,0.15)' }}>{row.rl_total > 0 ? (row.agdi / row.rl_total * 100).toFixed(1) + '%' : '-'}</td>
                  <td style={{ ...tdStyle, textAlign: 'right', color: row.revenue > 0 ? '#34d399' : 'rgba(255,255,255,0.15)', fontWeight: 700 }}>{row.revenue > 0 ? 'Rp ' + fmtNum(row.revenue) : '-'}</td>
                  {viewLevel !== 'agent' && <td style={{ ...tdStyle, textAlign: 'right', color: row.revenuePerAgent > 0 ? '#34d399' : 'rgba(255,255,255,0.15)' }}>{row.revenuePerAgent > 0 ? 'Rp ' + fmtNum(Math.round(row.revenuePerAgent)) : '-'}</td>}
                </tr>
              )
            })}
          </tbody>
          {/* Sticky total row */}
          {aggRows.length > 1 && (
            <tfoot>
              <tr style={{ position: 'sticky', bottom: 0, zIndex: 2 }}>
                {viewLevel !== 'agent' && <td style={{ ...tdStyle, width: 28, background: '#111', borderTop: '1px solid rgba(255,255,255,0.1)', position: 'sticky', left: 0, zIndex: 4 }}></td>}
                <td style={{ ...tdStyle, textAlign: 'left', position: 'sticky', left: viewLevel !== 'agent' ? 28 : 0, zIndex: 3, background: '#111', fontWeight: 800, color: 'rgba(255,255,255,0.5)', fontSize: 9, borderTop: '1px solid rgba(255,255,255,0.1)' }}>TOTAL</td>
                {viewLevel === 'province' && <td style={{ ...tdStyle, background: '#111', borderTop: '1px solid rgba(255,255,255,0.1)' }}></td>}
                {viewLevel === 'city' && <td style={{ ...tdStyle, background: '#111', borderTop: '1px solid rgba(255,255,255,0.1)' }}></td>}
                {viewLevel === 'agent' && <td style={{ ...tdStyle, background: '#111', borderTop: '1px solid rgba(255,255,255,0.1)' }}></td>}
                {viewLevel === 'agent' && <td style={{ ...tdStyle, background: '#111', borderTop: '1px solid rgba(255,255,255,0.1)' }}></td>}
                {viewLevel !== 'agent' && <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 800, color: 'rgba(255,255,255,0.5)', background: '#111', borderTop: '1px solid rgba(255,255,255,0.1)' }}>{fmtNum(totals.total)}</td>}
                {(viewLevel === 'island' || viewLevel === 'province') && <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 800, color: '#f59e0b', background: '#111', borderTop: '1px solid rgba(255,255,255,0.1)' }}>{fmtNum(aggRows.reduce((s, r) => s + r.pv, 0))}</td>}
                <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 800, color: '#818cf8', background: '#111', borderTop: '1px solid rgba(255,255,255,0.1)' }}>{fmtNum(totals.rl_total)}</td>
                {showRlBreakdown && <>
                  <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 700, color: '#f59e0b', background: '#111', borderTop: '1px solid rgba(255,255,255,0.1)', fontSize: 10 }}>{fmtNum(aggRows.reduce((s, r) => s + r.rl_paid, 0))}</td>
                  <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 700, color: '#38bdf8', background: '#111', borderTop: '1px solid rgba(255,255,255,0.1)', fontSize: 10 }}>{fmtNum(aggRows.reduce((s, r) => s + r.rl_dmag, 0))}</td>
                  <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 700, color: '#a78bfa', background: '#111', borderTop: '1px solid rgba(255,255,255,0.1)', fontSize: 10 }}>{fmtNum(aggRows.reduce((s, r) => s + r.rl_organic, 0))}</td>
                </>}
                <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 800, color: '#34d399', background: '#111', borderTop: '1px solid rgba(255,255,255,0.1)' }}>{totals.total > 0 ? (totals.rl_total / totals.total / numDays).toFixed(2) : '0'}</td>
                <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 800, color: '#818cf8', background: '#111', borderTop: '1px solid rgba(255,255,255,0.1)' }}>{fmtNum(totals.ledi_total)}</td>
                <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 800, color: '#34d399', background: '#111', borderTop: '1px solid rgba(255,255,255,0.1)' }}>{totals.rl_total > 0 ? (totals.ledi_total / totals.rl_total * 100).toFixed(1) + '%' : '-'}</td>
                <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 800, color: '#e0e2e6', background: '#111', borderTop: '1px solid rgba(255,255,255,0.1)' }}>{fmtNum(totals.agdi)}</td>
                <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 800, color: '#fbbf24', background: '#111', borderTop: '1px solid rgba(255,255,255,0.1)' }}>{totals.rl_total > 0 ? (totals.agdi / totals.rl_total * 100).toFixed(1) + '%' : '-'}</td>
                <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 800, color: '#34d399', background: '#111', borderTop: '1px solid rgba(255,255,255,0.1)' }}>{totals.revenue > 0 ? 'Rp ' + fmtNum(totals.revenue) : '-'}</td>
                {viewLevel !== 'agent' && <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 800, color: '#34d399', background: '#111', borderTop: '1px solid rgba(255,255,255,0.1)' }}>{totals.total > 0 && totals.revenue > 0 ? 'Rp ' + fmtNum(Math.round((totals.revenue / revDays) * 30 / totals.total)) : '-'}</td>}
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {/* Resize handle */}
      <div
        style={{
          height: 8, cursor: 'row-resize', display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(255,255,255,0.02)', borderRadius: '0 0 8px 8px',
        }}
        onMouseDown={e => {
          e.preventDefault()
          const startY = e.clientY
          const startH = tableHeight
          const onMove = (ev: MouseEvent) => {
            const newH = Math.max(200, Math.min(1200, startH + ev.clientY - startY))
            setTableHeight(newH)
          }
          const onUp = () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp) }
          document.addEventListener('mousemove', onMove)
          document.addEventListener('mouseup', onUp)
        }}
      >
        <div style={{ width: 40, height: 3, borderRadius: 2, background: 'rgba(255,255,255,0.15)' }} />
      </div>
    </div>
  )
}
