/**
 * KPICard — Shared KPI metric card with sparkline area chart + trend line
 * Used across Central Dashboard and Main page.
 */

import { useId, useMemo } from 'react'
import {
  AreaChart, Area, Line, ReferenceLine,
  ResponsiveContainer, Tooltip,
} from 'recharts'

// ── Shared formatter ──────────────────────────────────────────────────────────

const fmtFull = (v: number) =>
  new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(v)

// ── Spark tooltip ─────────────────────────────────────────────────────────────

function SparkTooltip({ active, payload, fmt }: any) {
  if (!active || !payload?.length) return null
  const data = payload[0]?.payload
  if (!data) return null
  const fmtValue = (v: number) => {
    if (fmt === 'currency')    return fmtFull(v)
    if (fmt === 'multiplier')  return v.toFixed(2) + '×'
    if (fmt === 'percentage')  return v.toFixed(2) + '%'
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
    </div>
  )
}

// ── KPICard ───────────────────────────────────────────────────────────────────

export interface SparkPoint {
  v: number
  day?: string
}

export interface KPICardProps {
  label: string
  value: string
  sub?: string
  delta?: number | null
  deltaLabel?: string
  sparkline?: SparkPoint[]
  tooltipFmt?: 'currency' | 'multiplier' | 'number' | 'percentage'
  invertDelta?: boolean   // true = lower is better (e.g. CPRL)
}

export function KPICard({
  label, value, sub, delta, deltaLabel = 'vs prev period',
  sparkline, tooltipFmt, invertDelta = false,
}: KPICardProps) {
  const gradientId = useId()
  const isUp = (delta ?? 0) >= 0
  const isGood = invertDelta ? !isUp : isUp
  const textColor = delta == null ? 'text-surface-100' : isGood ? 'text-emerald-400' : 'text-red-400'
  const chartColor = delta == null ? '#818cf8' : isGood ? '#10b981' : '#ef4444'

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
        <p className={`text-[10px] font-semibold mt-1.5 tabular-nums ${isGood ? 'text-emerald-400' : 'text-red-400'}`}>
          {isUp ? '▲' : '▼'} {Math.abs(delta).toFixed(1)}% {deltaLabel}
        </p>
      )}
      {chartData && chartData.length > 1 && (
        <div className="mt-3 -mx-2 -mb-1">
          <ResponsiveContainer width="100%" height={100}>
            <AreaChart data={chartData} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%"   stopColor={chartColor} stopOpacity={0.3} />
                  <stop offset="100%" stopColor={chartColor} stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <Tooltip content={<SparkTooltip fmt={tooltipFmt || 'number'} />} cursor={false} />
              <ReferenceLine
                y={sparkline!.reduce((s, d) => s + d.v, 0) / sparkline!.length}
                stroke={chartColor}
                strokeDasharray="4 3"
                strokeOpacity={0.35}
                strokeWidth={1}
              />
              <Area
                type="monotone"
                dataKey="v"
                stroke={chartColor}
                strokeWidth={1.5}
                fill={`url(#${gradientId})`}
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
