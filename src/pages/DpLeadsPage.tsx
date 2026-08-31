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
  rl_organic: number; ledi_organic: number
}
interface MergedAgent {
  code: string; name: string; city: string; province: string; island: string
  isStarSeller: boolean; type: string; latLng: [number, number] | null
  rl_total: number; ledi_total: number; agdi: number
}
interface AggRow {
  key: string; label: string; count: number
  rl_total: number; ledi_total: number; agdi: number
  leadsPerAgent: number; pv: number
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
  const [drillFilter, setDrillFilter] = useState<{ island?: string; province?: string; city?: string }>({})
  const [refreshNonce, setRefreshNonce] = useState(0)
  const [isRefreshing, setIsRefreshing] = useState(false)
  type SortCol = 'label' | 'count' | 'pv' | 'rl_total' | 'leadsPerAgent' | 'ledi_total' | 'lediRate' | 'agdi' | 'agdiRate'
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

  // Drill-down handler: click a row to go deeper
  const drillDown = useCallback((level: ViewLevel, key: string) => {
    if (level === 'island') {
      setDrillFilter({ island: key })
      setViewLevel('province')
    } else if (level === 'province') {
      setDrillFilter(prev => ({ ...prev, province: key }))
      setViewLevel('city')
    } else if (level === 'city') {
      setDrillFilter(prev => ({ ...prev, city: key }))
      setViewLevel('agent')
    }
  }, [])

  // Tab click: reset drill filter when switching manually
  const switchTab = useCallback((tab: ViewLevel) => {
    setViewLevel(tab)
    // Clear drill filters below the selected level
    if (tab === 'island') setDrillFilter({})
    else if (tab === 'province') setDrillFilter(prev => ({ island: prev.island }))
    else if (tab === 'city') setDrillFilter(prev => ({ island: prev.island, province: prev.province }))
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
    const m = new Map<string, { rl_total: number; ledi_total: number; agdi: number }>()
    if (!leadsData?.rows) return m
    for (const r of leadsData.rows) {
      const key = `${r.kode_agen}|${r.nama_agen.trim()}`
      m.set(key, { rl_total: r.rl_total, ledi_total: r.ledi_total, agdi: r.agdi })
    }
    return m
  }, [leadsData])

  // Paid vs DM Agen vs Organic breakdown (RL + LEDI) — pre-aggregated by worker
  const leadBreakdown = useMemo(() => {
    const r = { paid: 0, dmag: 0, organic: 0, paidLedi: 0, dmagLedi: 0, organicLedi: 0 }
    if (!leadsData?.rows) return r
    for (const row of leadsData.rows) {
      r.paid += row.rl_paid; r.paidLedi += row.ledi_paid
      r.dmag += row.rl_dmag; r.dmagLedi += row.ledi_dmag
      r.organic += row.rl_organic; r.organicLedi += row.ledi_organic
    }
    return r
  }, [leadsData])

  // 4) Merge CMS + leads by code+name composite key
  const agents = useMemo((): MergedAgent[] => {
    if (!cmsData) return []
    return cmsData.map(c => {
      const key = `${c.newAgentCode}|${c.name.trim()}`
      const leads = leadsMap.get(key)
      return {
        code: c.newAgentCode, name: c.name, city: c.cityName, province: c.provinceName,
        island: getIsland(c.provinceName),
        isStarSeller: c.isStarSeller, type: c.type,
        latLng: parseLatLng(c.lat, c.lng, c.googleMapsUrl) ?? FALLBACK_COORDS[key] ?? null,
        rl_total: leads?.rl_total ?? 0, ledi_total: leads?.ledi_total ?? 0, agdi: leads?.agdi ?? 0,
      }
    }).sort((a, b) => b.rl_total - a.rl_total)
  }, [cmsData, leadsMap])

  // Search + drill filter
  const filtered = useMemo(() => {
    let list = agents
    // Apply drill filters
    if (drillFilter.island) list = list.filter(a => a.island === drillFilter.island)
    if (drillFilter.province) list = list.filter(a => a.province === drillFilter.province)
    if (drillFilter.city) list = list.filter(a => a.city === drillFilter.city)
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
  }, [agents, searchTerm, drillFilter])

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

  // Aggregation for each view level
  const aggRows = useMemo((): AggRow[] => {
    const map = new Map<string, { count: number; rl: number; ledi: number; agdi: number }>()
    for (const a of filtered) {
      const key = viewLevel === 'island' ? a.island
        : viewLevel === 'province' ? a.province
        : viewLevel === 'city' ? a.city
        : a.code + '|' + a.name
      let g = map.get(key)
      if (!g) { g = { count: 0, rl: 0, ledi: 0, agdi: 0 }; map.set(key, g) }
      g.count++
      g.rl += a.rl_total; g.ledi += a.ledi_total; g.agdi += a.agdi
    }
    const pvMap = viewLevel === 'island' ? pvByIsland : viewLevel === 'province' ? pvByProvince : pvByCity
    // Include PV-only entries (provinces/islands with page views but no agents)
    if (pvMap && (viewLevel === 'island' || viewLevel === 'province')) {
      for (const key of pvMap.keys()) {
        if (!map.has(key)) map.set(key, { count: 0, rl: 0, ledi: 0, agdi: 0 })
      }
    }
    return Array.from(map.entries())
      .map(([key, g]) => ({
        key, label: viewLevel === 'agent' ? key.split('|')[1] || key : key,
        count: g.count, rl_total: g.rl, ledi_total: g.ledi, agdi: g.agdi,
        leadsPerAgent: g.count > 0 ? g.rl / g.count / numDays : 0,
        pv: viewLevel !== 'agent' ? (pvMap.get(key) ?? 0) : 0,
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
          case 'leadsPerAgent': cmp = a.leadsPerAgent - b.leadsPerAgent; break
          case 'ledi_total': cmp = a.ledi_total - b.ledi_total; break
          case 'lediRate': cmp = lediRateA - lediRateB; break
          case 'agdi': cmp = a.agdi - b.agdi; break
          case 'agdiRate': cmp = agdiRateA - agdiRateB; break
        }
        return sortDir === 'desc' ? -cmp : cmp
      })
  }, [filtered, viewLevel, numDays, pvByIsland, pvByProvince, pvByCity, sortCol, sortDir])

  // Quick stats
  const totals = useMemo(() => {
    const t = { total: 0, rl_total: 0, ledi_total: 0, agdi: 0 }
    for (const a of filtered) { t.total++; t.rl_total += a.rl_total; t.ledi_total += a.ledi_total; t.agdi += a.agdi }
    return t
  }, [filtered])

  // Breadcrumb
  const breadcrumb = useMemo(() => {
    const parts: { label: string; onClick: () => void }[] = [
      { label: 'All', onClick: () => { setDrillFilter({}); setViewLevel('island') } },
    ]
    if (drillFilter.island) parts.push({
      label: drillFilter.island,
      onClick: () => { setDrillFilter({ island: drillFilter.island }); setViewLevel('province') },
    })
    if (drillFilter.province) parts.push({
      label: drillFilter.province,
      onClick: () => { setDrillFilter({ island: drillFilter.island, province: drillFilter.province }); setViewLevel('city') },
    })
    if (drillFilter.city) parts.push({
      label: drillFilter.city,
      onClick: () => { setDrillFilter(prev => prev); setViewLevel('agent') },
    })
    return parts
  }, [drillFilter])

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
          {leadsLoading ? 'Loading…' : `${totals.total} DPs`}
        </div>
      </div>

      {/* ── Real Leads Breakdown Card + Stats ── */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap', alignItems: 'flex-start' }}>

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
                {fmtNum(totals.rl_total)}
              </div>
            </div>

            {/* Lead Dispatch */}
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', color: 'rgba(255,255,255,0.50)', textTransform: 'uppercase', marginBottom: 3 }}>Lead Dispatch</div>
              <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: '-0.04em', color: '#fff', lineHeight: 1 }}>
                {fmtNum(totals.ledi_total)}
              </div>
            </div>

            {/* LEDI Rate */}
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', color: 'rgba(255,255,255,0.50)', textTransform: 'uppercase', marginBottom: 3 }}>LEDI Rate</div>
              <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: '-0.04em', color: 'rgba(255,255,255,0.72)', lineHeight: 1 }}>
                {totals.rl_total > 0 ? (totals.ledi_total / totals.rl_total * 100).toFixed(1) + '%' : '-'}
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
              const pct = totals.rl_total > 0 ? (ch.rl / totals.rl_total) * 100 : 0
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
                {fmtNum(totals.total)}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', color: 'rgba(255,255,255,0.50)', textTransform: 'uppercase', marginBottom: 3 }}>Agen Dispatch</div>
              <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: '-0.04em', color: '#fff', lineHeight: 1 }}>
                {fmtNum(totals.agdi)}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', color: 'rgba(255,255,255,0.50)', textTransform: 'uppercase', marginBottom: 3 }}>AGDI Rate</div>
              <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: '-0.04em', color: 'rgba(255,255,255,0.72)', lineHeight: 1 }}>
                {totals.rl_total > 0 ? (totals.agdi / totals.rl_total * 100).toFixed(1) + '%' : '-'}
              </div>
            </div>
          </div>

          {/* RIGHT: Daily RL/Agen */}
          <div style={{ flex: '1 1 auto', borderLeft: '1px solid rgba(255,255,255,0.06)', paddingLeft: 24, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', color: 'rgba(255,255,255,0.50)', textTransform: 'uppercase', marginBottom: 3 }}>Daily RL/Agen</div>
            <div style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-0.04em', color: '#34d399', lineHeight: 1 }}>
              {totals.total > 0 ? (totals.rl_total / totals.total / numDays).toFixed(2) : '0'}
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

      {/* Breadcrumb */}
      {breadcrumb.length > 1 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '8px 0', fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>
          {breadcrumb.map((b, i) => (
            <React.Fragment key={i}>
              {i > 0 && <span style={{ margin: '0 2px' }}>›</span>}
              <span onClick={b.onClick} style={{ cursor: 'pointer', color: i === breadcrumb.length - 1 ? '#e0e2e6' : 'rgba(255,255,255,0.4)',
                fontWeight: i === breadcrumb.length - 1 ? 700 : 500 }}>{b.label}</span>
            </React.Fragment>
          ))}
        </div>
      )}

      {/* Table */}
      <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '0 0 10px 10px', overflow: 'auto', height: 480 }}>
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
                  {sth('label', firstColLabel, 'left', { position: 'sticky', left: 0, zIndex: 3, background: '#111', minWidth: 220 })}
                  {viewLevel !== 'agent' && sth('count', 'Resellers', 'right')}
                  {(viewLevel === 'island' || viewLevel === 'province') && sth('pv', 'Page Views', 'right')}
                  {sth('rl_total', 'RL Total', 'right')}
                  {sth('leadsPerAgent', 'Daily RL/Agent', 'right')}
                  {sth('ledi_total', 'LEDI Total', 'right')}
                  {sth('lediRate', 'LEDI Rate', 'right')}
                  {sth('agdi', 'AGDI', 'right')}
                  {sth('agdiRate', 'AGDI Rate', 'right')}
                </>
              })()}
            </tr>
          </thead>
          <tbody>
            {aggRows.map((row, i) => {
              const bg = i % 2 === 0 ? '#0d0e12' : '#111215'
              const canDrill = viewLevel !== 'agent'
              return (
                <tr key={row.key} onClick={() => canDrill && drillDown(viewLevel, row.key)}
                  style={{ cursor: canDrill ? 'pointer' : 'default' }}
                  onMouseEnter={e => { if (canDrill) (e.currentTarget.style.background = 'rgba(129,140,248,0.06)') }}
                  onMouseLeave={e => { e.currentTarget.style.background = '' }}>
                  <td style={{ ...tdStyle, textAlign: 'left', position: 'sticky', left: 0, zIndex: 1, background: bg, minWidth: 220 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontWeight: 700, color: '#e0e2e6' }}>{row.label}</span>
                      {canDrill && <span style={{ fontSize: 8, color: 'rgba(255,255,255,0.2)' }}>›</span>}
                    </div>
                    {viewLevel === 'agent' && (
                      <div style={{ fontSize: 8, color: 'rgba(255,255,255,0.3)', marginTop: 1 }}>{row.key.split('|')[0]}</div>
                    )}
                  </td>
                  {viewLevel !== 'agent' && <td style={{ ...tdStyle, textAlign: 'right', color: 'rgba(255,255,255,0.5)' }}>{fmtNum(row.count)}</td>}
                  {(viewLevel === 'island' || viewLevel === 'province') && <td style={{ ...tdStyle, textAlign: 'right', color: row.pv > 0 ? '#f59e0b' : 'rgba(255,255,255,0.15)' }}>{row.pv > 0 ? fmtNum(row.pv) : '-'}</td>}
                  <td style={{ ...tdStyle, textAlign: 'right', color: row.rl_total > 0 ? '#818cf8' : 'rgba(255,255,255,0.15)', fontWeight: 800 }}>{fmtNum(row.rl_total)}</td>
                  <td style={{ ...tdStyle, textAlign: 'right', color: row.leadsPerAgent > 0 ? '#34d399' : 'rgba(255,255,255,0.15)' }}>{row.leadsPerAgent.toFixed(2)}</td>
                  <td style={{ ...tdStyle, textAlign: 'right', color: row.ledi_total > 0 ? '#818cf8' : 'rgba(255,255,255,0.15)', fontWeight: 800 }}>{fmtNum(row.ledi_total)}</td>
                  <td style={{ ...tdStyle, textAlign: 'right', color: row.rl_total > 0 ? '#34d399' : 'rgba(255,255,255,0.15)' }}>{row.rl_total > 0 ? (row.ledi_total / row.rl_total * 100).toFixed(1) + '%' : '-'}</td>
                  <td style={{ ...tdStyle, textAlign: 'right', color: row.agdi > 0 ? '#e0e2e6' : 'rgba(255,255,255,0.15)' }}>{fmtNum(row.agdi)}</td>
                  <td style={{ ...tdStyle, textAlign: 'right', color: row.rl_total > 0 ? '#fbbf24' : 'rgba(255,255,255,0.15)' }}>{row.rl_total > 0 ? (row.agdi / row.rl_total * 100).toFixed(1) + '%' : '-'}</td>
                </tr>
              )
            })}
          </tbody>
          {/* Sticky total row */}
          {aggRows.length > 1 && (
            <tfoot>
              <tr style={{ position: 'sticky', bottom: 0, zIndex: 2 }}>
                <td style={{ ...tdStyle, textAlign: 'left', position: 'sticky', left: 0, zIndex: 3, background: '#111', fontWeight: 800, color: 'rgba(255,255,255,0.5)', fontSize: 9, borderTop: '1px solid rgba(255,255,255,0.1)' }}>TOTAL</td>
                {viewLevel !== 'agent' && <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 800, color: 'rgba(255,255,255,0.5)', background: '#111', borderTop: '1px solid rgba(255,255,255,0.1)' }}>{fmtNum(totals.total)}</td>}
                {(viewLevel === 'island' || viewLevel === 'province') && <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 800, color: '#f59e0b', background: '#111', borderTop: '1px solid rgba(255,255,255,0.1)' }}>{fmtNum(aggRows.reduce((s, r) => s + r.pv, 0))}</td>}
                <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 800, color: '#818cf8', background: '#111', borderTop: '1px solid rgba(255,255,255,0.1)' }}>{fmtNum(totals.rl_total)}</td>
                <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 800, color: '#34d399', background: '#111', borderTop: '1px solid rgba(255,255,255,0.1)' }}>{totals.total > 0 ? (totals.rl_total / totals.total / numDays).toFixed(2) : '0'}</td>
                <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 800, color: '#818cf8', background: '#111', borderTop: '1px solid rgba(255,255,255,0.1)' }}>{fmtNum(totals.ledi_total)}</td>
                <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 800, color: '#34d399', background: '#111', borderTop: '1px solid rgba(255,255,255,0.1)' }}>{totals.rl_total > 0 ? (totals.ledi_total / totals.rl_total * 100).toFixed(1) + '%' : '-'}</td>
                <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 800, color: '#e0e2e6', background: '#111', borderTop: '1px solid rgba(255,255,255,0.1)' }}>{fmtNum(totals.agdi)}</td>
                <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 800, color: '#fbbf24', background: '#111', borderTop: '1px solid rgba(255,255,255,0.1)' }}>{totals.rl_total > 0 ? (totals.agdi / totals.rl_total * 100).toFixed(1) + '%' : '-'}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  )
}
