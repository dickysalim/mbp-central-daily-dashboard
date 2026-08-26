/**
 * CsvDownloaderPage — Aggregated data table with CSV export
 */
import React, { useState, useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { D1_WORKER_URL } from '../config/dataSource'
import { DOMAIN_BRAND } from '../config/domainConfig'

const ALL_BRANDS = ['MNC', 'GOL', 'MCI'] as const
const BRANDS = DOMAIN_BRAND === 'ALL' ? ALL_BRANDS : ALL_BRANDS.filter(b => b === DOMAIN_BRAND || (DOMAIN_BRAND === 'GOLO' && b === 'GOL'))

function today() { return new Date().toISOString().slice(0, 10) }
function daysAgo(n: number) { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10) }

// ISO week number
function isoWeek(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  d.setDate(d.getDate() + 4 - (d.getDay() || 7))
  const yearStart = new Date(d.getFullYear(), 0, 1)
  const weekNo = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7)
  return `${d.getFullYear()}-W${String(weekNo).padStart(2, '0')}`
}

function dateKey(date: string, breakdown: 'daily' | 'isoweek' | 'monthly'): string {
  if (breakdown === 'monthly') return date.slice(0, 7)
  if (breakdown === 'isoweek') return isoWeek(date)
  return date
}

function fmtNum(n: number) { return Math.round(n).toLocaleString('id-ID') }
function fmtRp(n: number) { return 'Rp ' + Math.round(n).toLocaleString('id-ID') }

function toCsv(headers: string[], rows: (string | number)[][]): string {
  const h = headers.join(',')
  const body = rows.map(r => r.map(v => {
    const s = String(v)
    return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s
  }).join(',')).join('\n')
  return h + '\n' + body
}

function downloadCsv(filename: string, csv: string) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = filename; a.click()
  URL.revokeObjectURL(url)
}

const inputStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,0.06)',
  border: '1px solid rgba(255,255,255,0.12)',
  borderRadius: 6, padding: '6px 10px',
  color: '#fff', fontSize: 12, fontFamily: 'Inter, system-ui, sans-serif',
  outline: 'none',
}

const thStyle: React.CSSProperties = {
  padding: '6px 10px', fontSize: 9, fontWeight: 700,
  color: 'rgba(255,255,255,0.4)', textAlign: 'right',
  whiteSpace: 'nowrap', borderBottom: '1px solid rgba(255,255,255,0.08)',
  position: 'sticky' as const, top: 0, background: '#111',
}

const tdStyle: React.CSSProperties = {
  padding: '5px 10px', fontSize: 11, fontWeight: 600,
  color: 'rgba(255,255,255,0.7)', textAlign: 'right',
  whiteSpace: 'nowrap', borderBottom: '1px solid rgba(255,255,255,0.04)',
}

interface PerfRow { date: string; traffic_source: string; sku: string; ad_spend: number; impressions: number; link_click: number }
interface Ga4Row { date: string; traffic_source: string; sku: string; ga4_page_view: number; ga4_view_offer: number }
interface ConvRow {
  date: string; traffic_source: string; sku: string
  mongo_real_lead_ccom: number; mongo_real_lead_d2or: number; mongo_real_lead_mpsh: number; mongo_real_lead_ofls: number
  mongo_lead_dispatch_d2or: number; mongo_lead_dispatch_mpsh: number
  mongo_so_created_ccom: number
  mongo_purchase_ccom: number; mongo_purchase_ccom_revenue: number
}

interface AggRow {
  period: string; traffic_source: string; product: string
  ad_spend: number; impressions: number; link_click: number
  lp_view: number; view_offer: number
  rl_ccom: number; rl_d2or: number; rl_mpsh: number; rl_ofls: number
  ledi_d2or: number; ledi_mpsh: number; socr_ccom: number
  purchase_ccom: number; revenue_ccom: number
  form_submission: number; visit: number
}

export function CsvDownloaderPage() {
  const queryClient = useQueryClient()
  const [brand, setBrand] = useState<string>(BRANDS[0])
  const [dateFrom, setDateFrom] = useState(daysAgo(30))
  const [dateTo, setDateTo] = useState(daysAgo(2))
  const [dateBreakdown, setDateBreakdown] = useState<'daily' | 'isoweek' | 'monthly'>('daily')
  const [dateSortDir, setDateSortDir] = useState<'asc' | 'desc'>('asc')
  const [dimensions, setDimensions] = useState<{ trafficSource: boolean; product: boolean }>({ trafficSource: false, product: false })

  const toggleDim = (key: 'trafficSource' | 'product') =>
    setDimensions(prev => ({ ...prev, [key]: !prev[key] }))

  const { data, isLoading } = useQuery({
    queryKey: ['csv-data', brand, dateFrom, dateTo],
    queryFn: async () => {
      const res = await fetch(`${D1_WORKER_URL}/v2/consumer-goods?brand=${brand}&from=${dateFrom}&to=${dateTo}`)
      return res.json() as Promise<{ performance: PerfRow[]; ga4: Ga4Row[]; conversions: ConvRow[] }>
    },
    enabled: !!dateFrom && !!dateTo,
  })

  // Aggregate data
  const rows = useMemo((): AggRow[] => {
    if (!data) return []
    const map = new Map<string, AggRow>()

    const getKey = (date: string, ts: string, sku: string) => {
      const parts = [dateKey(date, dateBreakdown)]
      if (dimensions.trafficSource) parts.push(ts)
      if (dimensions.product) parts.push(sku)
      return parts.join('|')
    }

    const ensure = (date: string, ts: string, sku: string): AggRow => {
      const k = getKey(date, ts, sku)
      let r = map.get(k)
      if (!r) {
        r = {
          period: dateKey(date, dateBreakdown),
          traffic_source: dimensions.trafficSource ? ts : 'ALL',
          product: dimensions.product ? sku : 'ALL',
          ad_spend: 0, impressions: 0, link_click: 0,
          lp_view: 0, view_offer: 0,
          rl_ccom: 0, rl_d2or: 0, rl_mpsh: 0, rl_ofls: 0,
          ledi_d2or: 0, ledi_mpsh: 0, socr_ccom: 0,
          purchase_ccom: 0, revenue_ccom: 0,
          form_submission: 0, visit: 0,
        }
        map.set(k, r)
      }
      return r
    }

    const isB2B = (sku: string) => sku?.toUpperCase().includes('B2B')

    for (const p of data.performance) {
      if (isB2B(p.sku)) continue
      const r = ensure(p.date, p.traffic_source, p.sku)
      r.ad_spend += p.ad_spend ?? 0
      r.impressions += p.impressions ?? 0
      r.link_click += p.link_click ?? 0
    }

    for (const g of (data.ga4 ?? [])) {
      if (isB2B(g.sku)) continue
      const r = ensure(g.date, g.traffic_source, g.sku)
      r.lp_view += g.ga4_page_view ?? 0
      r.view_offer += g.ga4_view_offer ?? 0
    }

    for (const c of (data.conversions ?? [])) {
      if (isB2B(c.sku)) continue
      const r = ensure(c.date, c.traffic_source, c.sku)
      r.rl_ccom += c.mongo_real_lead_ccom ?? 0
      r.rl_d2or += c.mongo_real_lead_d2or ?? 0
      r.rl_mpsh += c.mongo_real_lead_mpsh ?? 0
      r.rl_ofls += c.mongo_real_lead_ofls ?? 0
      r.ledi_d2or += c.mongo_lead_dispatch_d2or ?? 0
      r.ledi_mpsh += c.mongo_lead_dispatch_mpsh ?? 0
      r.socr_ccom += c.mongo_so_created_ccom ?? 0
      r.purchase_ccom += c.mongo_purchase_ccom ?? 0
      r.revenue_ccom += c.mongo_purchase_ccom_revenue ?? 0
      r.form_submission += (c as any).mongo_form_submission ?? 0
      r.visit += (c as any).mongo_form_conversion ?? 0
    }

    const dir = dateSortDir === 'asc' ? 1 : -1
    return Array.from(map.values()).filter(r => r.ad_spend > 0).sort((a, b) => dir * a.period.localeCompare(b.period) || a.traffic_source.localeCompare(b.traffic_source) || a.product.localeCompare(b.product))
  }, [data, dateBreakdown, dateSortDir, dimensions])

  const isMCI = brand === 'MCI'

  // Build headers
  const dimHeaders: string[] = []
  if (dimensions.trafficSource) dimHeaders.push('Traffic Source')
  if (dimensions.product) dimHeaders.push('Product')

  const metricHeaders = isMCI
    ? ['Ad Spend', 'Impressions', 'Link Click', 'LP View', 'View Offer', 'Form Submission', 'Visit']
    : ['Ad Spend', 'Impressions', 'Link Click', 'LP View', 'View Offer', 'RL CCOM', 'RL D2OR', 'RL MPSH', 'RL OFLS', 'LEDI D2OR', 'LEDI MPSH', 'SOCR CCOM', 'Purchase CCOM', 'Revenue CCOM']
  const allHeaders = [dateBreakdown === 'isoweek' ? 'ISO Week' : dateBreakdown === 'monthly' ? 'Month' : 'Date', ...dimHeaders, ...metricHeaders]

  const handleDownload = () => {
    const csvRows = rows.map(r => {
      const dims: (string | number)[] = []
      if (dimensions.trafficSource) dims.push(r.traffic_source)
      if (dimensions.product) dims.push(r.product)
      const metrics = isMCI
        ? [r.ad_spend, r.impressions, r.link_click, r.lp_view, r.view_offer, r.form_submission, r.visit]
        : [r.ad_spend, r.impressions, r.link_click, r.lp_view, r.view_offer, r.rl_ccom, r.rl_d2or, r.rl_mpsh, r.rl_ofls, r.ledi_d2or, r.ledi_mpsh, r.socr_ccom, r.purchase_ccom, r.revenue_ccom]
      return [r.period, ...dims, ...metrics]
    })
    const csv = toCsv(allHeaders, csvRows)
    downloadCsv(`${brand}_data_${dateBreakdown}_${dateFrom}_${dateTo}.csv`, csv)
  }

  return (
    <div style={{ padding: '32px 40px', fontFamily: 'Inter, system-ui, sans-serif', color: '#fff' }}>
      <h1 style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.03em', marginBottom: 8 }}>CSV Downloader</h1>
      <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginBottom: 28 }}>
        Aggregated performance data table with CSV export.
      </p>

      {/* Controls */}
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', marginBottom: 24, flexWrap: 'wrap' }}>
        {/* Brand */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label style={{ fontSize: 9, fontWeight: 700, color: 'rgba(255,255,255,0.4)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Brand</label>
          <select value={brand} onChange={e => setBrand(e.target.value)} style={{ ...inputStyle, minWidth: 80 }}>
            {BRANDS.map(b => <option key={b} value={b}>{b}</option>)}
          </select>
        </div>

        {/* Date range */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label style={{ fontSize: 9, fontWeight: 700, color: 'rgba(255,255,255,0.4)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>From</label>
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} style={inputStyle} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label style={{ fontSize: 9, fontWeight: 700, color: 'rgba(255,255,255,0.4)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>To</label>
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} style={inputStyle} />
        </div>

        {/* Date Breakdown */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label style={{ fontSize: 9, fontWeight: 700, color: 'rgba(255,255,255,0.4)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Date Breakdown</label>
          <div style={{ display: 'flex', gap: 2 }}>
            {(['daily', 'isoweek', 'monthly'] as const).map(v => (
              <button key={v} onClick={() => setDateBreakdown(v)} style={{
                padding: '5px 10px', fontSize: 10, fontWeight: 700, borderRadius: 4,
                border: 'none', cursor: 'pointer', letterSpacing: '0.03em',
                background: dateBreakdown === v ? 'rgba(129,140,248,0.25)' : 'rgba(255,255,255,0.06)',
                color: dateBreakdown === v ? '#818cf8' : 'rgba(255,255,255,0.4)',
                transition: 'all 0.15s',
              }}>{v === 'isoweek' ? 'Isoweek' : v === 'monthly' ? 'Monthly' : 'Daily'}</button>
            ))}
          </div>
        </div>

        {/* Date Sorting */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label style={{ fontSize: 9, fontWeight: 700, color: 'rgba(255,255,255,0.4)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Date Sorting</label>
          <div style={{ display: 'flex', gap: 2 }}>
            {(['asc', 'desc'] as const).map(v => (
              <button key={v} onClick={() => setDateSortDir(v)} style={{
                padding: '5px 10px', fontSize: 10, fontWeight: 700, borderRadius: 4,
                border: 'none', cursor: 'pointer', letterSpacing: '0.03em',
                background: dateSortDir === v ? 'rgba(129,140,248,0.25)' : 'rgba(255,255,255,0.06)',
                color: dateSortDir === v ? '#818cf8' : 'rgba(255,255,255,0.4)',
                transition: 'all 0.15s',
              }}>{v === 'asc' ? '↑ Ascending' : '↓ Descending'}</button>
            ))}
          </div>
        </div>

        {/* Dimensions */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label style={{ fontSize: 9, fontWeight: 700, color: 'rgba(255,255,255,0.4)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Dimensions</label>
          <div style={{ display: 'flex', gap: 6 }}>
            {([{ key: 'trafficSource' as const, label: 'Traffic Source' }, { key: 'product' as const, label: 'Product' }]).map(d => (
              <button key={d.key} onClick={() => toggleDim(d.key)} style={{
                padding: '5px 10px', fontSize: 10, fontWeight: 700, borderRadius: 4,
                border: 'none', cursor: 'pointer', letterSpacing: '0.03em', display: 'flex', alignItems: 'center', gap: 5,
                background: dimensions[d.key] ? 'rgba(52,211,153,0.2)' : 'rgba(255,255,255,0.06)',
                color: dimensions[d.key] ? '#34d399' : 'rgba(255,255,255,0.4)',
                transition: 'all 0.15s',
              }}>
                <span style={{ display: 'inline-block', width: 12, height: 12, borderRadius: 3, border: dimensions[d.key] ? '2px solid #34d399' : '2px solid rgba(255,255,255,0.2)', background: dimensions[d.key] ? '#34d399' : 'transparent', textAlign: 'center', lineHeight: '10px', fontSize: 9, color: '#111', fontWeight: 900 }}>{dimensions[d.key] ? '✓' : ''}</span>
                {d.label}
              </button>
            ))}
          </div>
        </div>

        {/* Refresh button */}
        <button onClick={() => queryClient.invalidateQueries({ queryKey: ['csv-data', brand, dateFrom, dateTo] })} style={{
          padding: '8px 12px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.12)', cursor: 'pointer',
          fontWeight: 700, fontSize: 12, letterSpacing: '0.03em',
          background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.6)',
          transition: 'all 0.15s',
        }}>⟳ Refresh</button>

        {/* Download button */}
        <button onClick={handleDownload} disabled={rows.length === 0} style={{
          padding: '8px 16px', borderRadius: 6, border: 'none', cursor: rows.length > 0 ? 'pointer' : 'default',
          fontWeight: 700, fontSize: 12, letterSpacing: '0.03em',
          background: rows.length > 0 ? '#818cf8' : 'rgba(255,255,255,0.1)',
          color: rows.length > 0 ? '#fff' : 'rgba(255,255,255,0.3)',
          transition: 'all 0.15s',
        }}>↓ Download CSV</button>
      </div>

      {/* Loading */}
      {isLoading && <div style={{ padding: 20, color: 'rgba(255,255,255,0.4)', fontSize: 12 }}>Loading data...</div>}

      {/* Table */}
      {rows.length > 0 && (
        <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, overflow: 'auto', maxHeight: 'calc(100vh - 260px)' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
            <thead>
              <tr>
                {allHeaders.map((h, i) => (
                  <th key={h} style={{ ...thStyle, textAlign: i <= dimHeaders.length ? 'left' : 'right' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} style={{ background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)' }}>
                  <td style={{ ...tdStyle, textAlign: 'left', color: '#fff', fontWeight: 700 }}>{r.period}</td>
                  {dimensions.trafficSource && <td style={{ ...tdStyle, textAlign: 'left' }}>{r.traffic_source}</td>}
                  {dimensions.product && <td style={{ ...tdStyle, textAlign: 'left' }}>{r.product}</td>}
                  <td style={tdStyle}>{fmtRp(r.ad_spend)}</td>
                  <td style={tdStyle}>{fmtNum(r.impressions)}</td>
                  <td style={tdStyle}>{fmtNum(r.link_click)}</td>
                  <td style={tdStyle}>{fmtNum(r.lp_view)}</td>
                  <td style={tdStyle}>{fmtNum(r.view_offer)}</td>
                  {isMCI ? <>
                    <td style={tdStyle}>{fmtNum(r.form_submission)}</td>
                    <td style={tdStyle}>{fmtNum(r.visit)}</td>
                  </> : <>
                    <td style={tdStyle}>{fmtNum(r.rl_ccom)}</td>
                    <td style={tdStyle}>{fmtNum(r.rl_d2or)}</td>
                    <td style={tdStyle}>{fmtNum(r.rl_mpsh)}</td>
                    <td style={tdStyle}>{fmtNum(r.rl_ofls)}</td>
                    <td style={tdStyle}>{fmtNum(r.ledi_d2or)}</td>
                    <td style={tdStyle}>{fmtNum(r.ledi_mpsh)}</td>
                    <td style={tdStyle}>{fmtNum(r.socr_ccom)}</td>
                    <td style={tdStyle}>{fmtNum(r.purchase_ccom)}</td>
                    <td style={tdStyle}>{fmtRp(r.revenue_ccom)}</td>
                  </>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!isLoading && rows.length === 0 && data && (
        <div style={{ padding: 20, color: 'rgba(255,255,255,0.3)', fontSize: 12 }}>No data for selected range.</div>
      )}

      {/* Row count */}
      {rows.length > 0 && (
        <div style={{ marginTop: 8, fontSize: 10, color: 'rgba(255,255,255,0.3)' }}>{rows.length} rows</div>
      )}
    </div>
  )
}
