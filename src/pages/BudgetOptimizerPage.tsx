/**
 * BudgetOptimizerPage — Campaign budget optimization per SKU
 *
 * Reuses CampaignBreakdownSection from ProductDeepDivePage
 * with its own brand/SKU/date toolbar (identical pattern to Deep Dive).
 */

import { useState, useMemo, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { D1_WORKER_URL } from '../config/dataSource'
import { PRESETS, dateStr } from './ProductPerformancePage'
import { CampaignBreakdownSection } from './ProductDeepDivePage'

// ── Main Page ────────────────────────────────────────────────────────────────

export function BudgetOptimizerPage() {
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

  // ── SKU list & state ──
  const SKU_ORDER = ['MSF', 'MTA', 'MNS', 'M3P']
  const allSkus = useMemo(() => {
    if (!activeBounds) return []
    const skus = activeBounds.skus.filter(s => s && s !== '-')
    return skus.sort((a, b) => {
      const ai = SKU_ORDER.indexOf(a)
      const bi = SKU_ORDER.indexOf(b)
      return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi)
    })
  }, [activeBounds])

  const [sku, setSku] = useState('')
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
      // Reset SKU to first available
      const skus = activeBounds.skus.filter(s => s && s !== '-')
      const sorted = skus.sort((a, b) => {
        const ai = SKU_ORDER.indexOf(a)
        const bi = SKU_ORDER.indexOf(b)
        return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi)
      })
      if (sorted.length > 0) setSku(sorted[0])
    }
  }, [activeBrand, activeBounds, lastBrand])

  const activeSku = sku || allSkus[0] || ''

  // ── Date state ──
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')

  const activeFrom = from || activeBounds?.earliest || ''
  const activeTo = to || activeBounds?.latest || ''

  const globalEarliest = activeBounds?.earliest || ''
  const globalLatest = activeBounds?.latest || ''

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

  return (
    <div className="dp-page">
      {/* Toolbar */}
      <div className="dp-toolbar">
        <div className="dp-toolbar-left">
          <h1 className="dp-title">Budget Setting</h1>
          <span className="dp-subtitle">{activeFrom} → {activeTo}</span>
        </div>
        <div className="dp-toolbar-right">
          {/* Brand picker */}
          <select className="dp-select" value={activeBrand} onChange={e => setBrand(e.target.value)}>
            {brands.map(b => <option key={b} value={b}>{b}</option>)}
          </select>

          {/* SKU picker */}
          <select
            className="dp-select"
            value={activeSku}
            onChange={e => setSku(e.target.value)}
          >
            {allSkus.map(s => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>

          {/* Date range */}
          <input
            type="date"
            className="dp-date-input"
            value={activeFrom}
            min={globalEarliest}
            max={globalLatest}
            onChange={e => {
              const v = e.target.value
              if (!v) return
              setFrom(v)
              if (v > activeTo) setTo(v)
            }}
          />
          <span className="dp-date-sep">→</span>
          <input
            type="date"
            className="dp-date-input"
            value={activeTo}
            min={globalEarliest}
            max={globalLatest}
            onChange={e => {
              const v = e.target.value
              if (!v) return
              setTo(v)
              if (v < activeFrom) setFrom(v)
            }}
          />
          <div className="tv-presets">
            {PRESETS.map(p => (
              <button key={p.label} className="tv-preset" onClick={() => applyPreset(p.days)}>
                {p.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Campaign Performance Breakdown */}
      <CampaignBreakdownSection
        from={activeFrom}
        to={activeTo}
        sku={activeSku}
      />

      {/* Data source note */}
      <div className="dp-footnote">
        📊 Campaign-level data from <strong>Meta API</strong> · Real Leads &amp; Purchases from <strong>MongoDB ground truth</strong>.
        Budget suggestions based on efficiency scoring with target CPRL ≤ Rp 150.000.
      </div>
    </div>
  )
}
