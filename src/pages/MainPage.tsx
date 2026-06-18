/**
 * MainPage — Main MNC dashboard (built chunk by chunk)
 */

import { useMemo, useState } from 'react'
import { usePerformanceData } from '../hooks/usePerformanceData'
import { useSalesReportData } from '../hooks/useSalesReportData'
import { useChangelogData } from '../hooks/useChangelogData'
import type { ChangelogRow } from '../types/changelog'
import { CalendarRangePicker } from '../components/ui/CalendarRangePicker'
import {
  ResponsiveContainer,
  ComposedChart,
  AreaChart,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  Area,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
} from 'recharts'

// ── MTD date range ───────────────────────────────────────────────────────────

function getMTDRange() {
  const now = new Date()
  now.setDate(now.getDate() - 1)
  const from = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
  const to = now.toISOString().slice(0, 10)
  return { from, to }
}

function getLastMonthRange() {
  const now = new Date()
  const fmtLocal = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  const firstOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const lastOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0)
  return { from: fmtLocal(firstOfLastMonth), to: fmtLocal(lastOfLastMonth) }
}

function getLastNDays(n: number) {
  const now = new Date()
  now.setDate(now.getDate() - 1)
  const to = now.toISOString().slice(0, 10)
  const from = new Date(now)
  from.setDate(from.getDate() - (n - 1))
  return { from: from.toISOString().slice(0, 10), to }
}

type Preset = 'last_month' | 'mtd' | 'last_30' | 'last_14' | 'last_7' | 'custom'

function getPresetRange(preset: Preset, customFrom: string, customTo: string): { from: string; to: string } {
  switch (preset) {
    case 'last_month': return getLastMonthRange()
    case 'mtd':        return getMTDRange()
    case 'last_30':    return getLastNDays(30)
    case 'last_14':    return getLastNDays(14)
    case 'last_7':     return getLastNDays(7)
    case 'custom':     return { from: customFrom, to: customTo }
  }
}

const PRESETS: { key: Preset; label: string }[] = [
  { key: 'last_month', label: 'Last Month' },
  { key: 'mtd',        label: 'MTD' },
  { key: 'last_30',    label: 'Last 30 Days' },
  { key: 'last_14',   label: 'Last 2 Weeks' },
  { key: 'last_7',    label: 'Last 1 Week' },
  { key: 'custom',    label: 'Custom' },
]

function getPrevMTDRange() {
  const now = new Date()
  now.setDate(now.getDate() - 1)
  const dayOfMonth = now.getDate()
  const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const from = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}-01`
  const lastDay = new Date(prev.getFullYear(), prev.getMonth() + 1, 0).getDate()
  const toDay = Math.min(dayOfMonth, lastDay)
  const to = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}-${String(toDay).padStart(2, '0')}`
  return { from, to }
}

const fmtLocalDate = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

/** Previous period: same length, shifted back */
function getPreviousPeriod(from: string, to: string) {
  const f = new Date(from + 'T00:00:00')
  const t = new Date(to + 'T00:00:00')
  const days = Math.round((t.getTime() - f.getTime()) / 86400000) + 1
  const prevTo = new Date(f); prevTo.setDate(prevTo.getDate() - 1)
  const prevFrom = new Date(prevTo); prevFrom.setDate(prevFrom.getDate() - (days - 1))
  return { from: fmtLocalDate(prevFrom), to: fmtLocalDate(prevTo) }
}

/** Previous month: EDATE-style — subtract 1 month from both dates */
function getPreviousMonth(from: string, to: string) {
  const shiftMonth = (s: string) => {
    const d = new Date(s + 'T00:00:00')
    const targetYear  = d.getMonth() === 0 ? d.getFullYear() - 1 : d.getFullYear()
    const targetMonth = d.getMonth() === 0 ? 11 : d.getMonth() - 1
    // Clamp day to last day of target month BEFORE constructing the Date
    const lastDayOfTarget = new Date(targetYear, targetMonth + 1, 0).getDate()
    const targetDay = Math.min(d.getDate(), lastDayOfTarget)
    return fmtLocalDate(new Date(targetYear, targetMonth, targetDay))
  }
  return { from: shiftMonth(from), to: shiftMonth(to) }
}

type CompMode = 'previous_period' | 'previous_month'

// ── Number formatting ────────────────────────────────────────────────────────

const fmtShort = (v: number) => {
  if (v >= 1e9) return `${(v / 1e9).toFixed(1)}B`
  if (v >= 1e6) return `${(v / 1e6).toFixed(1)}M`
  if (v >= 1e3) return `${(v / 1e3).toFixed(0)}K`
  return String(Math.round(v))
}

const fmtFull = (v: number) =>
  new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(v)

// ── Custom tooltip ───────────────────────────────────────────────────────────

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  const spend = payload.find((p: any) => p.dataKey === 'ad_spend')?.value ?? 0
  const revenue = payload.find((p: any) => p.dataKey === 'sales_total')?.value ?? 0
  const roas = spend > 0 ? revenue / spend : 0

  return (
    <div className="rounded-xl bg-surface-800/95 border border-white/10 backdrop-blur-md px-4 py-3 shadow-xl">
      <p className="text-[11px] font-mono text-surface-200/50 mb-2">{label}</p>
      {payload.filter((e: any) => e.dataKey !== 'gap').map((entry: any) => (
        <div key={entry.dataKey} className="flex items-center gap-2 text-xs mb-1">
          <span className="w-2 h-2 rounded-full" style={{ background: entry.color }} />
          <span className="text-surface-200/60">{entry.name}</span>
          <span className="ml-auto font-mono font-semibold text-surface-100">
            {fmtFull(entry.value)}
          </span>
        </div>
      ))}
      <div className="flex items-center gap-2 text-xs mt-2 pt-2 border-t border-white/10">
        <span className="text-surface-200/60">Total ROAS</span>
        <span className={`ml-auto font-mono font-bold ${roas >= 4 ? 'text-emerald-400' : roas >= 2 ? 'text-amber-400' : 'text-red-400'}`}>
          {roas.toFixed(2)}×
        </span>
      </div>
    </div>
  )
}

function SparkTooltip({ active, payload, fmt }: any) {
  if (!active || !payload?.length) return null
  const data = payload[0]?.payload
  if (!data) return null
  const fmtValue = (v: number) => {
    if (fmt === 'currency') return fmtFull(v)
    if (fmt === 'multiplier') return v.toFixed(2) + '×'
    if (fmt === 'percentage') return v.toFixed(1) + '%'
    return v.toLocaleString('id-ID')
  }
  return (
    <div style={{
      background: 'rgba(15,15,25,.95)',
      border: '1px solid rgba(255,255,255,.1)',
      borderRadius: 8,
      padding: '6px 10px',
      fontSize: 10,
      lineHeight: 1.6,
      pointerEvents: 'none',
    }}>
      <p style={{ fontFamily: 'monospace', color: 'rgba(255,255,255,.4)' }}>{data.day}</p>
      <p style={{ color: '#f1f5f9', fontWeight: 600 }}>{fmtValue(data.v)}</p>
      {data.extra != null && (
        <p style={{ color: '#f1f5f9' }}>Sales CC: {fmtFull(data.extra)}</p>
      )}
    </div>
  )
}

function KPICard({ label, value, sub, delta, sparkline, tooltipFmt }: {
  label: string; value: string; sub?: string;
  delta?: number | null;
  sparkline?: { v: number; day?: string; extra?: number }[];
  tooltipFmt?: 'currency' | 'multiplier' | 'number' | 'percentage';
}) {
  const isUp = (delta ?? 0) >= 0
  const textColor = isUp ? 'text-emerald-400' : 'text-red-400'
  const chartColor = isUp ? '#10b981' : '#ef4444'

  // Compute linear regression and enrich data with trend values
  const chartData = useMemo(() => {
    if (!sparkline || sparkline.length < 2) return sparkline ?? []
    const n = sparkline.length
    const sumX = (n * (n - 1)) / 2
    const sumX2 = ((n - 1) * n * (2 * n - 1)) / 6
    const sumY = sparkline.reduce((s, d) => s + d.v, 0)
    const sumXY = sparkline.reduce((s, d, i) => s + i * d.v, 0)
    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX)
    const intercept = (sumY - slope * sumX) / n
    return sparkline.map((d, i) => ({ ...d, trend: intercept + slope * i }))
  }, [sparkline])

  return (
    <div className="rounded-xl bg-surface-900 border border-white/5 px-5 pt-4 pb-2 flex flex-col">
      <p className="text-[10px] text-surface-200/40 uppercase tracking-widest mb-1">{label}</p>
      <p className={`text-2xl font-bold tabular-nums ${textColor}`}>{value}</p>
      {sub && <p className="text-[10px] text-surface-200/30 mt-1">{sub}</p>}
      {delta != null && (
        <p className={`text-[10px] font-semibold mt-1.5 tabular-nums ${delta >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
          {delta >= 0 ? '▲' : '▼'} {Math.abs(delta).toFixed(1)}% vs prev MTD
        </p>
      )}
      {chartData && chartData.length > 1 && (
        <div className="mt-3 -mx-2 -mb-1">
          <ResponsiveContainer width="100%" height={120}>
            <AreaChart data={chartData} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id={`spark-${label.replace(/\s/g, '')}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={chartColor} stopOpacity={0.3} />
                  <stop offset="100%" stopColor={chartColor} stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <Tooltip content={<SparkTooltip fmt={tooltipFmt || 'number'} />} cursor={false} />
              <ReferenceLine
                y={sparkline!.reduce((s, d) => s + d.v, 0) / sparkline!.length}
                stroke={chartColor}
                strokeDasharray="4 3"
                strokeOpacity={0.4}
                strokeWidth={1}
              />
              <Area
                type="monotone"
                dataKey="v"
                stroke={chartColor}
                strokeWidth={1.5}
                fill={`url(#spark-${label.replace(/\s/g, '')})`}
                dot={false}
              />
              <Line
                type="linear"
                dataKey="trend"
                stroke="#f59e0b"
                strokeWidth={1.5}
                dot={false}
                strokeOpacity={0.7}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}

// ── Custom X-axis tick — click dot to open modal ─────────────────────────────

// Changelog dot rendered on the revenue line itself
function ChangelogDot({ cx, cy, payload, changelogMap, onClickDay }: any) {
  const day = payload?.day as string
  const entries: ChangelogRow[] = changelogMap?.get(day) ?? []
  if (entries.length === 0) return null
  const headline = entries[0].headline
  const truncated = headline.length > 24 ? headline.slice(0, 24) + '…' : headline

  return (
    <g onClick={() => onClickDay(day)} style={{ cursor: 'pointer' }}>
      {/* Glow ring */}
      <circle cx={cx} cy={cy} r={8} fill="rgba(245,158,11,.1)" />
      {/* Dot */}
      <circle cx={cx} cy={cy} r={4} fill="#f59e0b" stroke="rgba(15,15,25,.8)" strokeWidth={2} />
      {/* Tag */}
      <foreignObject x={cx - 60} y={cy - 36} width={120} height={28} style={{ overflow: 'visible', pointerEvents: 'none' }}>
        <div style={{
          background: 'rgba(15,15,25,.9)',
          border: '1px solid rgba(245,158,11,.3)',
          borderRadius: 6,
          padding: '2px 6px',
          fontSize: 8,
          color: '#fbbf24',
          textAlign: 'center',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          maxWidth: 120,
          lineHeight: 1.6,
        }}>
          {truncated}
        </div>
      </foreignObject>
    </g>
  )
}

function CustomTick({ x, y, payload, changelogMap, onClickDay }: any) {
  const [hovered, setHovered] = useState(false)
  const day = payload?.value as string
  const entries: ChangelogRow[] = changelogMap.get(day) ?? []
  const hasChangelog = entries.length > 0
  const dd = day ? `${day.slice(5, 7)}/${day.slice(8)}` : ''

  return (
    <g transform={`translate(${x},${y})`}>
      <text x={0} y={0} dy={14} textAnchor="middle" fill="rgba(255,255,255,.3)" fontSize={10}>
        {dd}
      </text>
      {hasChangelog && (
        <g
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
          onClick={() => onClickDay(day)}
          style={{ cursor: 'pointer' }}
        >
          <circle cx={0} cy={28} r={10} fill="transparent" />
          <circle cx={0} cy={28} r={5} fill="rgba(245,158,11,.25)" stroke="rgba(245,158,11,.7)" strokeWidth={1} />
          <text x={0} y={31} textAnchor="middle" fill="#f59e0b" fontSize={7} fontWeight="bold">△</text>

          {hovered && (
            <foreignObject
              x={-140} y={-140} width={280} height={130}
              style={{ overflow: 'visible', pointerEvents: 'none' }}
            >
              <div
                style={{
                  background: 'rgba(15,15,25,.97)',
                  border: '1px solid rgba(245,158,11,.2)',
                  borderRadius: 10,
                  padding: '10px 12px',
                  boxShadow: '0 8px 32px rgba(0,0,0,.5)',
                  pointerEvents: 'none',
                  width: 280,
                  boxSizing: 'border-box',
                }}
              >
                <p style={{ fontSize: 10, fontFamily: 'monospace', color: 'rgba(255,255,255,.35)', marginBottom: 6 }}>{day}</p>
                {entries.slice(0, 2).map(entry => (
                  <div key={entry.id} style={{ borderLeft: '2px solid rgba(245,158,11,.5)', paddingLeft: 8, marginBottom: 6 }}>
                    <p style={{ fontSize: 11, fontWeight: 600, color: '#f1f5f9', marginBottom: 1, wordBreak: 'break-word' }}>{entry.headline}</p>
                    {entry.description && (
                      <p style={{ fontSize: 10, color: 'rgba(255,255,255,.4)', lineHeight: 1.4, wordBreak: 'break-word' }}>
                        {entry.description.length > 60 ? entry.description.slice(0, 60) + '…' : entry.description}
                      </p>
                    )}
                  </div>
                ))}
                <p style={{ fontSize: 9, color: 'rgba(245,158,11,.5)', marginTop: 2 }}>Click for full details ↗</p>
              </div>
            </foreignObject>
          )}
        </g>
      )}
    </g>
  )
}

// ── Changelog modal ──────────────────────────────────────────────────────────

function ChangelogModal({ day, entries, onClose }: { day: string; entries: ChangelogRow[]; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className="relative bg-surface-800 border border-white/10 rounded-2xl shadow-2xl max-w-lg w-full mx-4 max-h-[70vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/5">
          <div>
            <p className="text-xs font-semibold text-surface-100">Changelog</p>
            <p className="text-[10px] font-mono text-amber-400/60 mt-0.5">{day}</p>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center text-surface-200/50 hover:text-surface-100 transition-colors text-xs"
          >✕</button>
        </div>
        <div className="overflow-y-auto px-5 py-4 space-y-5">
          {entries.map(entry => (
            <div key={entry.id} className="border-l-2 border-amber-500/40 pl-4">
              <p className="text-sm font-semibold text-surface-100">{entry.headline}</p>
              {entry.description && (
                <p className="text-xs text-surface-200/50 mt-2 whitespace-pre-wrap leading-relaxed">
                  {entry.description}
                </p>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Page ─────────────────────────────────────────────────────────────────────

export function MainPage() {
  const [selectedDay, setSelectedDay] = useState<string | null>(null)
  const [dpMode, setDpMode] = useState<'real' | 'event'>('real')
  const [mpMode, setMpMode] = useState<'real' | 'event'>('real')
  const [preset, setPreset] = useState<Preset>('mtd')
  const [customFrom, setCustomFrom] = useState(getMTDRange().from)
  const [customTo, setCustomTo] = useState(getMTDRange().to)

  const { from, to } = getPresetRange(preset, customFrom, customTo)
  const [compMode, setCompMode] = useState<CompMode>('previous_period')
  const { from: prevFrom, to: prevTo } = compMode === 'previous_month'
    ? getPreviousMonth(from, to)
    : getPreviousPeriod(from, to)

  const { data: adsData = [], isLoading: adsLoading } = usePerformanceData({
    from,
    to,
    brand: ['MNC'],
  })

  const { data: salesData = [], isLoading: salesLoading } = useSalesReportData({
    from,
    to,
    brand: ['MNC'],
  })

  // Previous month same period
  const { data: prevAdsData = [] } = usePerformanceData({
    from: prevFrom,
    to: prevTo,
    brand: ['MNC'],
  })

  const { data: prevSalesData = [] } = useSalesReportData({
    from: prevFrom,
    to: prevTo,
    brand: ['MNC'],
  })

  const { data: changelogAll = [] } = useChangelogData()

  const isLoading = adsLoading || salesLoading

  // Filter changelog for MNC and within MTD range, grouped by day
  const changelogMap = useMemo(() => {
    const map = new Map<string, ChangelogRow[]>()
    for (const entry of changelogAll) {
      if (entry.MNC !== 1) continue
      if (entry.day < from || entry.day > to) continue
      if (!map.has(entry.day)) map.set(entry.day, [])
      map.get(entry.day)!.push(entry)
    }
    return map
  }, [changelogAll, from, to])

  // Aggregate: ad_spend from ads_performance, sales_total from sales_report, joined on day
  const chartData = useMemo(() => {
    const byDay = new Map<string, { day: string; ad_spend: number; sales_total: number }>()

    for (const row of adsData) {
      if (!byDay.has(row.day)) byDay.set(row.day, { day: row.day, ad_spend: 0, sales_total: 0 })
      byDay.get(row.day)!.ad_spend += row.ad_spend ?? 0
    }

    for (const row of salesData) {
      if (!byDay.has(row.day)) byDay.set(row.day, { day: row.day, ad_spend: 0, sales_total: 0 })
      byDay.get(row.day)!.sales_total += row.sales_total ?? 0
    }

    const sorted = Array.from(byDay.values())
      .sort((a, b) => a.day.localeCompare(b.day))

    // 5-day moving average on revenue
    const window = 5
    return sorted.map((d, i) => {
      const start = Math.max(0, i - Math.floor(window / 2))
      const end = Math.min(sorted.length, i + Math.ceil(window / 2) + 1)
      const slice = sorted.slice(start, end)
      const ma = slice.reduce((s, r) => s + r.sales_total, 0) / slice.length
      return {
        ...d,
        gap: [d.ad_spend, d.sales_total] as [number, number],
        revenue_trend: ma,
      }
    })
  }, [adsData, salesData])

  // MTD totals
  const totals = useMemo(() => {
    const spend = chartData.reduce((s, d) => s + d.ad_spend, 0)
    const revenue = chartData.reduce((s, d) => s + d.sales_total, 0)
    const salesCC = salesData.reduce((s, r) => s + (r.sales_cc ?? 0), 0)
    const salesDP = salesData.reduce((s, r) => s + (r.sales_dp ?? 0), 0)
    const salesMP = salesData.reduce((s, r) => s + (r.sales_mp ?? 0), 0)
    const roas = spend > 0 ? revenue / spend : 0
    const roasCC = spend > 0 ? salesCC / spend : 0
    const realLeadCC = adsData.reduce((s, r) => s + (r.real_lead_cc ?? 0), 0)
    const realLeadDP = adsData.reduce((s, r) => s + (r.real_lead_dp ?? 0), 0)
    const realLeadMP = adsData.reduce((s, r) => s + (r.real_lead_mp ?? 0), 0)
    const leadEventDP = adsData.reduce((s, r) => s + (r.lead_event_dp ?? 0), 0)
    const leadEventMP = adsData.reduce((s, r) => s + (r.lead_event_mp ?? 0), 0)
    const leadEventCC = adsData.reduce((s, r) => s + (r.lead_event_cc ?? 0), 0)
    const salesCA = salesData.reduce((s, r) => s + (r.sales_ca ?? 0), 0)
    const salesCLR = salesData.reduce((s, r) => s + (r.sales_clr ?? 0), 0)
    const revenueCC = adsData.reduce((s, r) => s + (r.revenue_cc ?? 0), 0)
    const socrCC = adsData.reduce((s, r) => s + (r.socr_cc ?? 0), 0)
    const saleCC = adsData.reduce((s, r) => s + (r.sale_cc ?? 0), 0)
    const leadDispatchDP = adsData.reduce((s, r) => s + (r.lead_dispatch_dp ?? 0), 0)
    const leadDispatchMP = adsData.reduce((s, r) => s + (r.lead_dispatch_mp ?? 0), 0)
    const agenDispatchDP = adsData.reduce((s, r) => s + (r.agen_dispatch_dp ?? 0), 0)
    return { spend, revenue, salesCC, salesDP, salesMP, roas, roasCC, realLeadCC, realLeadDP, realLeadMP, leadEventDP, leadEventMP, leadEventCC, salesCA, salesCLR, revenueCC, socrCC, saleCC, leadDispatchDP, leadDispatchMP, agenDispatchDP }
  }, [chartData, salesData, adsData])

  // Daily sparkline data for each KPI
  const sparklines = useMemo(() => {
    // Build daily map with all metrics
    const byDay = new Map<string, { ad_spend: number; sales_total: number; sales_cc: number; sales_dp: number; sales_mp: number; real_lead_cc: number; real_lead_dp: number; real_lead_mp: number; lead_event_dp: number; lead_event_mp: number }>()
    for (const row of adsData) {
      if (!byDay.has(row.day)) byDay.set(row.day, { ad_spend: 0, sales_total: 0, sales_cc: 0, sales_dp: 0, sales_mp: 0, real_lead_cc: 0, real_lead_dp: 0, real_lead_mp: 0, lead_event_dp: 0, lead_event_mp: 0 })
      byDay.get(row.day)!.ad_spend += row.ad_spend ?? 0
      byDay.get(row.day)!.real_lead_cc += row.real_lead_cc ?? 0
      byDay.get(row.day)!.real_lead_dp += row.real_lead_dp ?? 0
      byDay.get(row.day)!.real_lead_mp += row.real_lead_mp ?? 0
      byDay.get(row.day)!.lead_event_dp += row.lead_event_dp ?? 0
      byDay.get(row.day)!.lead_event_mp += row.lead_event_mp ?? 0
      byDay.get(row.day)!.lead_event_cc = (byDay.get(row.day)!.lead_event_cc ?? 0) + (row.lead_event_cc ?? 0)
      byDay.get(row.day)!.lead_dispatch_dp = (byDay.get(row.day)!.lead_dispatch_dp ?? 0) + (row.lead_dispatch_dp ?? 0)
      byDay.get(row.day)!.lead_dispatch_mp = (byDay.get(row.day)!.lead_dispatch_mp ?? 0) + (row.lead_dispatch_mp ?? 0)
      byDay.get(row.day)!.agen_dispatch_dp = (byDay.get(row.day)!.agen_dispatch_dp ?? 0) + (row.agen_dispatch_dp ?? 0)
      byDay.get(row.day)!.revenue_cc = (byDay.get(row.day)!.revenue_cc ?? 0) + (row.revenue_cc ?? 0)
      byDay.get(row.day)!.socr_cc = (byDay.get(row.day)!.socr_cc ?? 0) + (row.socr_cc ?? 0)
      byDay.get(row.day)!.sale_cc = (byDay.get(row.day)!.sale_cc ?? 0) + (row.sale_cc ?? 0)
    }
    for (const row of salesData) {
      if (!byDay.has(row.day)) byDay.set(row.day, { ad_spend: 0, sales_total: 0, sales_cc: 0, sales_dp: 0, sales_mp: 0, real_lead_cc: 0, real_lead_dp: 0, real_lead_mp: 0, lead_event_dp: 0, lead_event_mp: 0 })
      byDay.get(row.day)!.sales_total += row.sales_total ?? 0
      byDay.get(row.day)!.sales_cc += row.sales_cc ?? 0
      byDay.get(row.day)!.sales_dp += row.sales_dp ?? 0
      byDay.get(row.day)!.sales_mp += row.sales_mp ?? 0
      byDay.get(row.day)!.sales_ca = (byDay.get(row.day)!.sales_ca ?? 0) + (row.sales_ca ?? 0)
      byDay.get(row.day)!.sales_clr = (byDay.get(row.day)!.sales_clr ?? 0) + (row.sales_clr ?? 0)
    }
    const days = Array.from(byDay.entries()).sort(([a], [b]) => a.localeCompare(b))

    return {
      adSpend:   days.map(([day, d]) => ({ v: d.ad_spend, day })),
      revenue:   days.map(([day, d]) => ({ v: d.sales_total, day })),
      roasTotal: days.map(([day, d]) => ({ v: d.ad_spend > 0 ? d.sales_total / d.ad_spend : 0, day })),
      roasCC:    days.map(([day, d]) => ({ v: d.ad_spend > 0 ? d.sales_cc / d.ad_spend : 0, day, extra: d.sales_cc })),
      salesCC:   days.map(([day, d]) => ({ v: d.sales_cc, day })),
      salesDP:   days.map(([day, d]) => ({ v: d.sales_dp, day })),
      salesMP:   days.map(([day, d]) => ({ v: d.sales_mp, day })),
      realLeadCC: days.map(([day, d]) => ({ v: d.real_lead_cc, day })),
      realLeadDP: days.map(([day, d]) => ({ v: d.real_lead_dp, day })),
      realLeadMP: days.map(([day, d]) => ({ v: d.real_lead_mp, day })),
      leadEventDP: days.map(([day, d]) => ({ v: d.lead_event_dp, day })),
      leadEventMP: days.map(([day, d]) => ({ v: d.lead_event_mp, day })),
      salesCA:     days.map(([day, d]) => ({ v: d.sales_ca ?? 0, day })),
      salesCLR:    days.map(([day, d]) => ({ v: d.sales_clr ?? 0, day })),
      revenueCC:   days.map(([day, d]) => ({ v: d.revenue_cc ?? 0, day })),
      socrCC:      days.map(([day, d]) => ({ v: d.socr_cc ?? 0, day })),
      saleCC:      days.map(([day, d]) => ({ v: d.sale_cc ?? 0, day })),
      soCreatedRate: days.map(([day, d]) => ({ v: d.real_lead_cc > 0 ? ((d.socr_cc ?? 0) / d.real_lead_cc) * 100 : 0, day })),
      closingRate:   days.map(([day, d]) => ({ v: d.real_lead_cc > 0 ? ((d.sale_cc ?? 0) / d.real_lead_cc) * 100 : 0, day })),
      roasCCAds:     days.map(([day, d]) => ({ v: d.ad_spend > 0 ? (d.revenue_cc ?? 0) / d.ad_spend : 0, day })),
      leadEventCC:   days.map(([day, d]) => ({ v: d.lead_event_cc ?? 0, day })),
      inboundRateCC: days.map(([day, d]) => ({ v: (d.lead_event_cc ?? 0) > 0 ? (d.real_lead_cc / (d.lead_event_cc ?? 1)) * 100 : 0, day })),
      inboundRateDP: days.map(([day, d]) => ({ v: d.lead_event_dp > 0 ? (d.real_lead_dp / d.lead_event_dp) * 100 : 0, day })),
      inboundRateMP: days.map(([day, d]) => ({ v: d.lead_event_mp > 0 ? (d.real_lead_mp / d.lead_event_mp) * 100 : 0, day })),
      leadDispatchDP: days.map(([day, d]) => ({ v: d.lead_dispatch_dp ?? 0, day })),
      leadDispatchMP: days.map(([day, d]) => ({ v: d.lead_dispatch_mp ?? 0, day })),
      dispatchRateDP: days.map(([day, d]) => ({ v: d.real_lead_dp > 0 ? ((d.lead_dispatch_dp ?? 0) / d.real_lead_dp) * 100 : 0, day })),
      dispatchRateMP: days.map(([day, d]) => ({ v: d.real_lead_mp > 0 ? ((d.lead_dispatch_mp ?? 0) / d.real_lead_mp) * 100 : 0, day })),
      agenDispatchDP: days.map(([day, d]) => ({ v: d.agen_dispatch_dp ?? 0, day })),
      agenDispatchRateDP: days.map(([day, d]) => ({ v: d.real_lead_dp > 0 ? ((d.agen_dispatch_dp ?? 0) / d.real_lead_dp) * 100 : 0, day })),
    }
  }, [adsData, salesData])

  // Previous month totals
  const prevTotals = useMemo(() => {
    const spend = prevAdsData.reduce((s, r) => s + (r.ad_spend ?? 0), 0)
    const revenue = prevSalesData.reduce((s, r) => s + (r.sales_total ?? 0), 0)
    const salesCC = prevSalesData.reduce((s, r) => s + (r.sales_cc ?? 0), 0)
    const salesDP = prevSalesData.reduce((s, r) => s + (r.sales_dp ?? 0), 0)
    const salesMP = prevSalesData.reduce((s, r) => s + (r.sales_mp ?? 0), 0)
    const roas = spend > 0 ? revenue / spend : 0
    const roasCC = spend > 0 ? salesCC / spend : 0
    const realLeadCC = prevAdsData.reduce((s, r) => s + (r.real_lead_cc ?? 0), 0)
    const realLeadDP = prevAdsData.reduce((s, r) => s + (r.real_lead_dp ?? 0), 0)
    const realLeadMP = prevAdsData.reduce((s, r) => s + (r.real_lead_mp ?? 0), 0)
    const leadEventDP = prevAdsData.reduce((s, r) => s + (r.lead_event_dp ?? 0), 0)
    const leadEventMP = prevAdsData.reduce((s, r) => s + (r.lead_event_mp ?? 0), 0)
    const leadEventCC = prevAdsData.reduce((s, r) => s + (r.lead_event_cc ?? 0), 0)
    const salesCA = prevSalesData.reduce((s, r) => s + (r.sales_ca ?? 0), 0)
    const salesCLR = prevSalesData.reduce((s, r) => s + (r.sales_clr ?? 0), 0)
    const revenueCC = prevAdsData.reduce((s, r) => s + (r.revenue_cc ?? 0), 0)
    const socrCC = prevAdsData.reduce((s, r) => s + (r.socr_cc ?? 0), 0)
    const saleCC = prevAdsData.reduce((s, r) => s + (r.sale_cc ?? 0), 0)
    const leadDispatchDP = prevAdsData.reduce((s, r) => s + (r.lead_dispatch_dp ?? 0), 0)
    const leadDispatchMP = prevAdsData.reduce((s, r) => s + (r.lead_dispatch_mp ?? 0), 0)
    const agenDispatchDP = prevAdsData.reduce((s, r) => s + (r.agen_dispatch_dp ?? 0), 0)
    return { spend, revenue, salesCC, salesDP, salesMP, roas, roasCC, realLeadCC, realLeadDP, realLeadMP, leadEventDP, leadEventMP, leadEventCC, salesCA, salesCLR, revenueCC, socrCC, saleCC, leadDispatchDP, leadDispatchMP, agenDispatchDP }
  }, [prevAdsData, prevSalesData])

  // % delta helper
  const pctDelta = (curr: number, prev: number) =>
    prev > 0 ? ((curr - prev) / prev) * 100 : null

  return (
    <div className="min-h-screen flex flex-col">
      <header className="sticky top-0 z-40 border-b border-white/5 bg-surface-950/90 backdrop-blur-md">
        <div className="px-6 py-4 flex items-center justify-between gap-6 flex-wrap">
          <div>
            <h1 className="text-sm font-semibold text-surface-100">Main MNC</h1>
            <p className="text-[10px] text-surface-200/40 mt-0.5 font-mono">
              {from} → {to}
            </p>
          </div>

          {/* Timeline controls */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex items-center gap-1 bg-white/5 rounded-xl p-1">
                {PRESETS.filter(p => p.key !== 'custom').map(p => (
                  <button
                    key={p.key}
                    onClick={() => { setPreset(p.key) }}
                    className={`px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all ${
                      preset === p.key
                        ? 'bg-brand-500 text-white shadow-sm'
                        : 'text-surface-200/50 hover:text-surface-100 hover:bg-white/5'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>

              {/* Calendar range picker for Custom */}
              <CalendarRangePicker
                from={preset === 'custom' ? customFrom : from}
                to={preset === 'custom' ? customTo : to}
                onChange={(f, t) => {
                  setPreset('custom')
                  setCustomFrom(f)
                  setCustomTo(t)
                }}
              />
            </div>

            {/* Comparison mode */}
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-surface-200/30 font-medium">Compare vs</span>
              <div className="flex items-center gap-0.5 bg-white/5 rounded-lg p-0.5">
                {([
                  { key: 'previous_period', label: 'Previous Period' },
                  { key: 'previous_month',  label: 'Previous Month' },
                ] as { key: CompMode; label: string }[]).map(opt => (
                  <button
                    key={opt.key}
                    onClick={() => setCompMode(opt.key)}
                    className={`px-2.5 py-1 rounded-md text-[10px] font-semibold transition-all ${
                      compMode === opt.key
                        ? 'bg-white/12 text-surface-100'
                        : 'text-surface-200/35 hover:text-surface-200/70'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              <span className="text-[10px] text-surface-200/20 font-mono">{prevFrom} → {prevTo}</span>
            </div>
          </div>
        </div>
      </header>

      <div className="flex-1 px-6 py-6 space-y-6">
        {/* ── Macro Ads Performance ── */}
        <h2 className="text-lg font-bold text-surface-100 tracking-tight">Macro Ads Performance</h2>

        {/* KPI Cards */}
        <div className="grid grid-cols-4 gap-4">
          <KPICard
            label="Total Ad Spend"
            value={fmtFull(totals.spend)}
            delta={pctDelta(totals.spend, prevTotals.spend)}
            sparkline={sparklines.adSpend}
            tooltipFmt="currency"
          />
          <KPICard
            label="Total Revenue"
            value={fmtFull(totals.revenue)}
            delta={pctDelta(totals.revenue, prevTotals.revenue)}
            sparkline={sparklines.revenue}
            tooltipFmt="currency"
          />
          <KPICard
            label="ROAS Total"
            value={`${totals.roas.toFixed(2)}×`}
            delta={pctDelta(totals.roas, prevTotals.roas)}
            sparkline={sparklines.roasTotal}
            tooltipFmt="multiplier"
          />
          <KPICard
            label="ROAS CC"
            value={`${totals.roasCC.toFixed(2)}×`}
            delta={pctDelta(totals.roasCC, prevTotals.roasCC)}
            sparkline={sparklines.roasCC}
            tooltipFmt="multiplier"
          />
        </div>

        {/* Chart */}
        <div className="rounded-2xl bg-surface-900 border border-white/5 p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xs font-semibold text-surface-200/50 uppercase tracking-widest">
              Daily Ad Spend vs Revenue
            </h2>
            <div className="flex items-center gap-1.5 text-[10px] text-surface-200/30">
              <span className="inline-block w-3 h-3 rounded-full bg-amber-500/25 border border-amber-500/60 text-center leading-3 text-[7px] text-amber-400">△</span>
              = changelog (click to view)
            </div>
          </div>

          {isLoading ? (
            <div className="h-80 flex items-center justify-center text-surface-200/30 text-sm">
              Loading chart…
            </div>
          ) : chartData.length === 0 ? (
            <div className="h-80 flex items-center justify-center text-surface-200/30 text-sm italic">
              No data for this period
            </div>
          ) : (
            <div style={{ outline: 'none' }}>
              <ResponsiveContainer width="100%" height={380}>
                <ComposedChart data={chartData} margin={{ top: 8, right: 16, left: 8, bottom: 20 }}>
                  <defs>
                    <linearGradient id="gapGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#10b981" stopOpacity={0.15} />
                      <stop offset="100%" stopColor="#10b981" stopOpacity={0.03} />
                    </linearGradient>
                    <linearGradient id="spendGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#8b5cf6" stopOpacity={0.25} />
                      <stop offset="100%" stopColor="#8b5cf6" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,.04)" />
                  <XAxis
                    dataKey="day"
                    tick={<CustomTick changelogMap={changelogMap} onClickDay={setSelectedDay} />}
                    axisLine={{ stroke: 'rgba(255,255,255,.06)' }}
                    tickLine={false}
                    height={52}
                    interval={0}
                  />
                  <YAxis
                    tick={{ fill: 'rgba(255,255,255,.3)', fontSize: 10 }}
                    tickFormatter={fmtShort}
                    axisLine={false}
                    tickLine={false}
                    width={52}
                  />
                  <Tooltip content={<ChartTooltip />} />
                  <Legend
                    wrapperStyle={{ fontSize: 11, paddingTop: 12 }}
                    iconType="circle"
                    iconSize={8}
                    payload={[
                      { value: 'Ad Spend', type: 'circle', color: '#8b5cf6' },
                      { value: 'Revenue (Sales Total)', type: 'circle', color: '#10b981' },
                    ]}
                  />
                  <Area
                    type="monotone"
                    dataKey="gap"
                    fill="url(#gapGradient)"
                    stroke="none"
                    legendType="none"
                    tooltipType="none"
                  />
                  <Area
                    type="monotone"
                    dataKey="ad_spend"
                    name="Ad Spend"
                    stroke="#8b5cf6"
                    strokeWidth={2}
                    fill="url(#spendGradient)"
                    dot={false}
                    activeDot={{ r: 4, strokeWidth: 0 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="sales_total"
                    name="Revenue (Sales Total)"
                    stroke="#10b981"
                    strokeWidth={2}
                    dot={<ChangelogDot changelogMap={changelogMap} onClickDay={setSelectedDay} />}
                    activeDot={{ r: 4, strokeWidth: 0 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="revenue_trend"
                    name="Revenue Trend (5d MA)"
                    stroke="#f59e0b"
                    strokeWidth={2}
                    strokeOpacity={0.35}
                    dot={false}
                    activeDot={false}
                    legendType="none"
                    tooltipType="none"
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* ── Sales Channel Analysis ── */}
        <h2 className="text-lg font-bold text-surface-100 tracking-tight pt-4">Sales Channel Analysis</h2>

        <div className="grid grid-cols-4 gap-4">
          <KPICard
            label="Sales CC"
            value={fmtFull(totals.salesCC)}
            delta={pctDelta(totals.salesCC, prevTotals.salesCC)}
            sparkline={sparklines.salesCC}
            tooltipFmt="currency"
          />
          <KPICard
            label="Sales DP"
            value={fmtFull(totals.salesDP)}
            delta={pctDelta(totals.salesDP, prevTotals.salesDP)}
            sparkline={sparklines.salesDP}
            tooltipFmt="currency"
          />
          <KPICard
            label="Sales MP"
            value={fmtFull(totals.salesMP)}
            delta={pctDelta(totals.salesMP, prevTotals.salesMP)}
            sparkline={sparklines.salesMP}
            tooltipFmt="currency"
          />
          {/* Revenue Share Pie */}
          <div className="rounded-xl bg-surface-900 border border-white/5 px-5 pt-4 pb-3 flex flex-col">
            <p className="text-[10px] text-surface-200/40 uppercase tracking-widest mb-1">Revenue Share</p>
            <div className="flex-1 flex items-center justify-center">
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie
                    data={[
                      { name: 'Chatcommerce', value: totals.salesCC },
                      { name: 'Distributor Partner', value: totals.salesDP },
                      { name: 'Marketplace', value: totals.salesMP },
                    ]}
                    cx="50%"
                    cy="50%"
                    innerRadius={36}
                    outerRadius={58}
                    paddingAngle={3}
                    dataKey="value"
                    label={({ x, y, name, percent }: any) => (
                      <text x={x} y={y} textAnchor="middle" dominantBaseline="central" fontSize={8} fill="rgba(255,255,255,.7)">
                        <tspan x={x} dy="-0.5em" fontWeight={600}>{name}</tspan>
                        <tspan x={x} dy="1.2em" fill="rgba(255,255,255,.45)">{(percent * 100).toFixed(0)}%</tspan>
                      </text>
                    )}
                    labelLine={false}
                  >
                    <Cell fill="#2563eb" />
                    <Cell fill="#7c3aed" />
                    <Cell fill="#c2410c" />
                  </Pie>
                  <Tooltip
                    formatter={(v: number) => fmtFull(v)}
                    contentStyle={{
                      background: 'rgba(15,15,25,.95)',
                      border: '1px solid rgba(255,255,255,.1)',
                      borderRadius: 8,
                      fontSize: 10,
                    }}
                    itemStyle={{ color: '#f1f5f9' }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-4 gap-4">
          <KPICard
            label="Real Leads CC"
            value={totals.realLeadCC.toLocaleString('id-ID')}
            delta={pctDelta(totals.realLeadCC, prevTotals.realLeadCC)}
            sparkline={sparklines.realLeadCC}
          />
          <div className="relative">
            <button
              onClick={() => setDpMode(m => m === 'real' ? 'event' : 'real')}
              className="absolute top-3 right-3 z-10 px-2 py-0.5 rounded-full text-[8px] font-semibold border transition-colors"
              style={{
                background: dpMode === 'real' ? 'rgba(16,185,129,.15)' : 'rgba(139,92,246,.15)',
                borderColor: dpMode === 'real' ? 'rgba(16,185,129,.3)' : 'rgba(139,92,246,.3)',
                color: dpMode === 'real' ? '#10b981' : '#a78bfa',
              }}
            >
              {dpMode === 'real' ? 'Real' : 'Event'}
            </button>
            <KPICard
              label={dpMode === 'real' ? 'Real Leads DP' : 'Leads Event DP'}
              value={(dpMode === 'real' ? totals.realLeadDP : totals.leadEventDP).toLocaleString('id-ID')}
              delta={pctDelta(
                dpMode === 'real' ? totals.realLeadDP : totals.leadEventDP,
                dpMode === 'real' ? prevTotals.realLeadDP : prevTotals.leadEventDP
              )}
              sparkline={dpMode === 'real' ? sparklines.realLeadDP : sparklines.leadEventDP}
            />
          </div>
          <div className="relative">
            <button
              onClick={() => setMpMode(m => m === 'real' ? 'event' : 'real')}
              className="absolute top-3 right-3 z-10 px-2 py-0.5 rounded-full text-[8px] font-semibold border transition-colors"
              style={{
                background: mpMode === 'real' ? 'rgba(16,185,129,.15)' : 'rgba(139,92,246,.15)',
                borderColor: mpMode === 'real' ? 'rgba(16,185,129,.3)' : 'rgba(139,92,246,.3)',
                color: mpMode === 'real' ? '#10b981' : '#a78bfa',
              }}
            >
              {mpMode === 'real' ? 'Real' : 'Event'}
            </button>
            <KPICard
              label={mpMode === 'real' ? 'Real Leads MP' : 'Leads Event MP'}
              value={(mpMode === 'real' ? totals.realLeadMP : totals.leadEventMP).toLocaleString('id-ID')}
              delta={pctDelta(
                mpMode === 'real' ? totals.realLeadMP : totals.leadEventMP,
                mpMode === 'real' ? prevTotals.realLeadMP : prevTotals.leadEventMP
              )}
              sparkline={mpMode === 'real' ? sparklines.realLeadMP : sparklines.leadEventMP}
            />
          </div>
          {/* Real Leads Share Pie */}
          <div className="rounded-xl bg-surface-900 border border-white/5 px-5 pt-4 pb-3 flex flex-col">
            <p className="text-[10px] text-surface-200/40 uppercase tracking-widest mb-1">Real Leads Share</p>
            <div className="flex-1 flex items-center justify-center">
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie
                    data={[
                      { name: 'Chatcommerce', value: totals.realLeadCC },
                      { name: 'Distributor Partner', value: totals.realLeadDP },
                      { name: 'Marketplace', value: totals.realLeadMP },
                    ]}
                    cx="50%"
                    cy="50%"
                    innerRadius={36}
                    outerRadius={58}
                    paddingAngle={3}
                    dataKey="value"
                    label={({ x, y, name, percent }: any) => (
                      <text x={x} y={y} textAnchor="middle" dominantBaseline="central" fontSize={8} fill="rgba(255,255,255,.7)">
                        <tspan x={x} dy="-0.5em" fontWeight={600}>{name}</tspan>
                        <tspan x={x} dy="1.2em" fill="rgba(255,255,255,.45)">{(percent * 100).toFixed(0)}%</tspan>
                      </text>
                    )}
                    labelLine={false}
                  >
                    <Cell fill="#2563eb" />
                    <Cell fill="#7c3aed" />
                    <Cell fill="#c2410c" />
                  </Pie>
                  <Tooltip
                    formatter={(v: number) => v.toLocaleString('id-ID')}
                    contentStyle={{
                      background: 'rgba(15,15,25,.95)',
                      border: '1px solid rgba(255,255,255,.1)',
                      borderRadius: 8,
                      fontSize: 10,
                    }}
                    itemStyle={{ color: '#f1f5f9' }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* ── Chatcommerce Analysis ── */}
        <h2 className="text-lg font-bold text-surface-100 tracking-tight pt-4">Chatcommerce Analysis</h2>

        <div className="grid grid-cols-3 gap-4">
          <KPICard
            label="Sales CA"
            value={fmtFull(totals.salesCA)}
            delta={pctDelta(totals.salesCA, prevTotals.salesCA)}
            sparkline={sparklines.salesCA}
            tooltipFmt="currency"
          />
          <KPICard
            label="Sales CLR"
            value={fmtFull(totals.salesCLR)}
            delta={pctDelta(totals.salesCLR, prevTotals.salesCLR)}
            sparkline={sparklines.salesCLR}
            tooltipFmt="currency"
          />
          <KPICard
            label="Sales Ads CC"
            value={fmtFull(totals.revenueCC)}
            delta={pctDelta(totals.revenueCC, prevTotals.revenueCC)}
            sparkline={sparklines.revenueCC}
            tooltipFmt="currency"
          />
        </div>

        {/* CC Funnel — Row 1: Absolute numbers */}
        <div className="grid grid-cols-3 gap-4">
          <KPICard
            label="Real Leads CC"
            value={totals.realLeadCC.toLocaleString('id-ID')}
            delta={pctDelta(totals.realLeadCC, prevTotals.realLeadCC)}
            sparkline={sparklines.realLeadCC}
          />
          <KPICard
            label="SO Created Ads CC"
            value={totals.socrCC.toLocaleString('id-ID')}
            delta={pctDelta(totals.socrCC, prevTotals.socrCC)}
            sparkline={sparklines.socrCC}
          />
          <KPICard
            label="Sales Number Ads CC"
            value={totals.saleCC.toLocaleString('id-ID')}
            delta={pctDelta(totals.saleCC, prevTotals.saleCC)}
            sparkline={sparklines.saleCC}
          />
        </div>

        {/* CC Funnel — Row 2: RoAS + Rates */}
        <div className="grid grid-cols-3 gap-4">
          <KPICard
            label="RoAS CC Ads"
            value={`${(totals.spend > 0 ? totals.revenueCC / totals.spend : 0).toFixed(2)}×`}
            delta={pctDelta(
              totals.spend > 0 ? totals.revenueCC / totals.spend : 0,
              prevTotals.spend > 0 ? prevTotals.revenueCC / prevTotals.spend : 0
            )}
            sparkline={sparklines.roasCCAds}
            tooltipFmt="multiplier"
          />
          <KPICard
            label="SO Created Rate"
            value={`${(totals.realLeadCC > 0 ? (totals.socrCC / totals.realLeadCC) * 100 : 0).toFixed(1)}%`}
            delta={pctDelta(
              totals.realLeadCC > 0 ? (totals.socrCC / totals.realLeadCC) * 100 : 0,
              prevTotals.realLeadCC > 0 ? (prevTotals.socrCC / prevTotals.realLeadCC) * 100 : 0
            )}
            sparkline={sparklines.soCreatedRate}
            tooltipFmt="percentage"
          />
          <KPICard
            label="Closing Rate"
            value={`${(totals.realLeadCC > 0 ? (totals.saleCC / totals.realLeadCC) * 100 : 0).toFixed(1)}%`}
            delta={pctDelta(
              totals.realLeadCC > 0 ? (totals.saleCC / totals.realLeadCC) * 100 : 0,
              prevTotals.realLeadCC > 0 ? (prevTotals.saleCC / prevTotals.realLeadCC) * 100 : 0
            )}
            sparkline={sparklines.closingRate}
            tooltipFmt="percentage"
          />
        </div>

        {/* ── Leads DP & MP Analysis ── */}
        <h2 className="text-lg font-bold text-surface-100 tracking-tight pt-4">Inbound Rate Analysis</h2>

        {/* CC Row */}
        <div className="grid grid-cols-3 gap-4">
          <KPICard
            label="Leads Event CC"
            value={totals.leadEventCC.toLocaleString('id-ID')}
            delta={pctDelta(totals.leadEventCC, prevTotals.leadEventCC)}
            sparkline={sparklines.leadEventCC}
          />
          <KPICard
            label="Real Leads CC"
            value={totals.realLeadCC.toLocaleString('id-ID')}
            delta={pctDelta(totals.realLeadCC, prevTotals.realLeadCC)}
            sparkline={sparklines.realLeadCC}
          />
          <KPICard
            label="Inbound Rate CC"
            value={`${(totals.leadEventCC > 0 ? (totals.realLeadCC / totals.leadEventCC) * 100 : 0).toFixed(1)}%`}
            delta={pctDelta(
              totals.leadEventCC > 0 ? (totals.realLeadCC / totals.leadEventCC) * 100 : 0,
              prevTotals.leadEventCC > 0 ? (prevTotals.realLeadCC / prevTotals.leadEventCC) * 100 : 0
            )}
            sparkline={sparklines.inboundRateCC}
            tooltipFmt="percentage"
          />
        </div>

        {/* DP Row */}
        <div className="grid grid-cols-3 gap-4">
          <KPICard
            label="Leads Event DP"
            value={totals.leadEventDP.toLocaleString('id-ID')}
            delta={pctDelta(totals.leadEventDP, prevTotals.leadEventDP)}
            sparkline={sparklines.leadEventDP}
          />
          <KPICard
            label="Real Leads DP"
            value={totals.realLeadDP.toLocaleString('id-ID')}
            delta={pctDelta(totals.realLeadDP, prevTotals.realLeadDP)}
            sparkline={sparklines.realLeadDP}
          />
          <KPICard
            label="Inbound Rate DP"
            value={`${(totals.leadEventDP > 0 ? (totals.realLeadDP / totals.leadEventDP) * 100 : 0).toFixed(1)}%`}
            delta={pctDelta(
              totals.leadEventDP > 0 ? (totals.realLeadDP / totals.leadEventDP) * 100 : 0,
              prevTotals.leadEventDP > 0 ? (prevTotals.realLeadDP / prevTotals.leadEventDP) * 100 : 0
            )}
            sparkline={sparklines.inboundRateDP}
            tooltipFmt="percentage"
          />
        </div>

        {/* MP Row */}
        <div className="grid grid-cols-3 gap-4">
          <KPICard
            label="Leads Event MP"
            value={totals.leadEventMP.toLocaleString('id-ID')}
            delta={pctDelta(totals.leadEventMP, prevTotals.leadEventMP)}
            sparkline={sparklines.leadEventMP}
          />
          <KPICard
            label="Real Leads MP"
            value={totals.realLeadMP.toLocaleString('id-ID')}
            delta={pctDelta(totals.realLeadMP, prevTotals.realLeadMP)}
            sparkline={sparklines.realLeadMP}
          />
          <KPICard
            label="Inbound Rate MP"
            value={`${(totals.leadEventMP > 0 ? (totals.realLeadMP / totals.leadEventMP) * 100 : 0).toFixed(1)}%`}
            delta={pctDelta(
              totals.leadEventMP > 0 ? (totals.realLeadMP / totals.leadEventMP) * 100 : 0,
              prevTotals.leadEventMP > 0 ? (prevTotals.realLeadMP / prevTotals.leadEventMP) * 100 : 0
            )}
            sparkline={sparklines.inboundRateMP}
            tooltipFmt="percentage"
          />
        </div>

        {/* ── Leads DP & MP Analysis ── */}
        <h2 className="text-lg font-bold text-surface-100 tracking-tight pt-4">Leads DP &amp; MP Analysis</h2>

        {/* DP Row */}
        <div className="grid grid-cols-3 gap-4">
          <KPICard
            label="Real Leads DP"
            value={totals.realLeadDP.toLocaleString('id-ID')}
            delta={pctDelta(totals.realLeadDP, prevTotals.realLeadDP)}
            sparkline={sparklines.realLeadDP}
          />
          <KPICard
            label="Lead Dispatch DP"
            value={totals.leadDispatchDP.toLocaleString('id-ID')}
            delta={pctDelta(totals.leadDispatchDP, prevTotals.leadDispatchDP)}
            sparkline={sparklines.leadDispatchDP}
          />
          <KPICard
            label="Dispatch Rate DP"
            value={`${(totals.realLeadDP > 0 ? (totals.leadDispatchDP / totals.realLeadDP) * 100 : 0).toFixed(1)}%`}
            delta={pctDelta(
              totals.realLeadDP > 0 ? (totals.leadDispatchDP / totals.realLeadDP) * 100 : 0,
              prevTotals.realLeadDP > 0 ? (prevTotals.leadDispatchDP / prevTotals.realLeadDP) * 100 : 0
            )}
            sparkline={sparklines.dispatchRateDP}
            tooltipFmt="percentage"
          />
        </div>

        {/* MP Row */}
        <div className="grid grid-cols-3 gap-4">
          <KPICard
            label="Real Leads MP"
            value={totals.realLeadMP.toLocaleString('id-ID')}
            delta={pctDelta(totals.realLeadMP, prevTotals.realLeadMP)}
            sparkline={sparklines.realLeadMP}
          />
          <KPICard
            label="Lead Dispatch MP"
            value={totals.leadDispatchMP.toLocaleString('id-ID')}
            delta={pctDelta(totals.leadDispatchMP, prevTotals.leadDispatchMP)}
            sparkline={sparklines.leadDispatchMP}
          />
          <KPICard
            label="Dispatch Rate MP"
            value={`${(totals.realLeadMP > 0 ? (totals.leadDispatchMP / totals.realLeadMP) * 100 : 0).toFixed(1)}%`}
            delta={pctDelta(
              totals.realLeadMP > 0 ? (totals.leadDispatchMP / totals.realLeadMP) * 100 : 0,
              prevTotals.realLeadMP > 0 ? (prevTotals.leadDispatchMP / prevTotals.realLeadMP) * 100 : 0
            )}
            sparkline={sparklines.dispatchRateMP}
            tooltipFmt="percentage"
          />
        </div>

        {/* ── Agen DP Dispatch Analysis ── */}
        <h2 className="text-lg font-bold text-surface-100 tracking-tight pt-4">Agen DP Dispatch Analysis</h2>

        <div className="grid grid-cols-3 gap-4">
          <KPICard
            label="Real Leads DP"
            value={totals.realLeadDP.toLocaleString('id-ID')}
            delta={pctDelta(totals.realLeadDP, prevTotals.realLeadDP)}
            sparkline={sparklines.realLeadDP}
          />
          <KPICard
            label="Agen Dispatch DP"
            value={totals.agenDispatchDP.toLocaleString('id-ID')}
            delta={pctDelta(totals.agenDispatchDP, prevTotals.agenDispatchDP)}
            sparkline={sparklines.agenDispatchDP}
          />
          <KPICard
            label="Agent Dispatch Rate"
            value={`${(totals.realLeadDP > 0 ? (totals.agenDispatchDP / totals.realLeadDP) * 100 : 0).toFixed(1)}%`}
            delta={pctDelta(
              totals.realLeadDP > 0 ? (totals.agenDispatchDP / totals.realLeadDP) * 100 : 0,
              prevTotals.realLeadDP > 0 ? (prevTotals.agenDispatchDP / prevTotals.realLeadDP) * 100 : 0
            )}
            sparkline={sparklines.agenDispatchRateDP}
            tooltipFmt="percentage"
          />
        </div>

        {/* ── Engine Analysis ── */}
        <h2 className="text-lg font-bold text-surface-100 tracking-tight pt-4">Engine Analysis</h2>

        {/* Ad Spend by Traffic Source — 100% Area + Pie */}
        {(() => {
          const SOURCE_COLORS: Record<string, string> = {
            META: '#4f8df5',   // Soft Facebook blue
            MSAL: '#93bbfd',   // Pastel blue
            DGEN: '#f59e42',   // Warm amber
          }
          const FALLBACK_COLORS = ['#a78bfa', '#38bdf8', '#34d399', '#fbbf24', '#f472b6', '#818cf8', '#2dd4bf', '#fb923c']
          const getColor = (src: string, i: number) => SOURCE_COLORS[src] ?? FALLBACK_COLORS[i % FALLBACK_COLORS.length]

          // Pivot: { day, [source]: spend }
          const sourcesSet = new Set<string>()
          const sourceTotal = new Map<string, number>()
          const byDaySource = new Map<string, Record<string, number>>()
          for (const row of adsData) {
            const src = row.traffic_source || 'Unknown'
            sourcesSet.add(src)
            sourceTotal.set(src, (sourceTotal.get(src) ?? 0) + (row.ad_spend ?? 0))
            if (!byDaySource.has(row.day)) byDaySource.set(row.day, {})
            const rec = byDaySource.get(row.day)!
            rec[src] = (rec[src] ?? 0) + (row.ad_spend ?? 0)
          }
          // Filter out sources with 0 total spend
          const sources = Array.from(sourcesSet).filter(s => (sourceTotal.get(s) ?? 0) > 0).sort()
          const stackData = Array.from(byDaySource.entries())
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([day, rec]) => {
              const total = sources.reduce((s, src) => s + (rec[src] ?? 0), 0)
              const pct: Record<string, number> = { day: 0 }
              for (const src of sources) pct[src] = total > 0 ? ((rec[src] ?? 0) / total) * 100 : 0
              return { ...pct, day, _total: total } as any
            })

          const pieData = sources.map(src => ({ name: src, value: sourceTotal.get(src) ?? 0 }))

          return (
            <div className="grid grid-cols-[1fr_280px] gap-4">
              {/* Area Chart */}
              <div className="rounded-2xl bg-surface-900 border border-white/5 p-5">
                <h3 className="text-xs font-semibold text-surface-200/50 uppercase tracking-widest mb-4">
                  Ad Spend by Traffic Source (%)
                </h3>
                <ResponsiveContainer width="100%" height={380}>
                  <BarChart data={stackData} margin={{ top: 16, right: 16, left: 8, bottom: 44 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,.04)" vertical={false} />
                    <XAxis
                      dataKey="day"
                      tick={<CustomTick changelogMap={changelogMap} onClickDay={setSelectedDay} />}
                      axisLine={{ stroke: 'rgba(255,255,255,.06)' }}
                      tickLine={false}
                      interval={0}
                    />
                    <YAxis
                      tick={{ fill: 'rgba(255,255,255,.3)', fontSize: 10 }}
                      tickFormatter={(v: number) => `${v}%`}
                      axisLine={false}
                      tickLine={false}
                      width={40}
                      domain={[0, 100]}
                    />
                    <Tooltip
                      content={({ active, payload, label }: any) => {
                        if (!active || !payload?.length) return null
                        return (
                          <div style={{
                            background: 'rgba(15,15,25,.95)',
                            border: '1px solid rgba(255,255,255,.1)',
                            borderRadius: 8,
                            padding: '8px 12px',
                            fontSize: 10,
                            lineHeight: 1.8,
                          }}>
                            <p style={{ fontFamily: 'monospace', color: 'rgba(255,255,255,.4)', marginBottom: 4 }}>{label}</p>
                            {payload.map((p: any) => (
                              <p key={p.dataKey} style={{ color: p.color }}>
                                {p.dataKey}: {p.value.toFixed(1)}%
                              </p>
                            ))}
                          </div>
                        )
                      }}
                    />
                    <Legend
                      wrapperStyle={{ fontSize: 10, paddingTop: 12 }}
                      iconType="circle"
                      iconSize={8}
                    />
                    {sources.map((src, i) => (
                      <Bar
                        key={src}
                        dataKey={src}
                        stackId="1"
                        fill={getColor(src, i)}
                        label={({ x, y, width, height, value }: any) => {
                          if (value < 5) return null
                          return (
                            <text
                              x={x + width / 2}
                              y={y + height / 2}
                              textAnchor="middle"
                              dominantBaseline="central"
                              fontSize={10}
                              fontWeight={700}
                              fill="#000"
                            >
                              {`${Math.round(value)}%`}
                            </text>
                          )
                        }}
                      />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Pie Chart */}
              <div className="rounded-2xl bg-surface-900 border border-white/5 p-5 flex flex-col">
                <h3 className="text-xs font-semibold text-surface-200/50 uppercase tracking-widest mb-2">
                  Ad Spend Share
                </h3>
                <div className="flex-1 flex items-center justify-center">
                  <ResponsiveContainer width="100%" height={240}>
                    <PieChart>
                      <Pie
                        data={pieData}
                        cx="50%"
                        cy="50%"
                        innerRadius={50}
                        outerRadius={80}
                        paddingAngle={3}
                        dataKey="value"
                        label={({ x, y, name, percent }: any) => (
                          <text x={x} y={y} textAnchor="middle" dominantBaseline="central" fontSize={9} fill="rgba(255,255,255,.7)">
                            <tspan x={x} dy="-0.5em" fontWeight={600}>{name}</tspan>
                            <tspan x={x} dy="1.2em" fill="rgba(255,255,255,.45)">{(percent * 100).toFixed(0)}%</tspan>
                          </text>
                        )}
                        labelLine={false}
                      >
                        {sources.map((src, i) => (
                          <Cell key={src} fill={getColor(src, i)} />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(v: number) => fmtFull(v)}
                        contentStyle={{
                          background: 'rgba(15,15,25,.95)',
                          border: '1px solid rgba(255,255,255,.1)',
                          borderRadius: 8,
                          fontSize: 10,
                        }}
                        itemStyle={{ color: '#f1f5f9' }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          )
        })()}

        {/* Bottom spacer for over-scroll */}
        <div className="h-[50vh]" />
      </div>

      {/* Changelog modal */}
      {selectedDay && changelogMap.has(selectedDay) && (
        <ChangelogModal
          day={selectedDay}
          entries={changelogMap.get(selectedDay)!}
          onClose={() => setSelectedDay(null)}
        />
      )}
    </div>
  )
}
