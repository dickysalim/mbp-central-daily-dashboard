/**
 * TrendChart — Placeholder trend chart
 *
 * TODO: Replace ResponsiveContainer children with real chart lines
 * once data schema and metrics are confirmed.
 */

import { ResponsiveContainer, LineChart, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts'

// Flat placeholder data so the chart frame is visible
const PLACEHOLDER_DATA = Array.from({ length: 14 }, (_, i) => ({
  day: `Day ${i + 1}`,
}))

export function TrendChart() {
  return (
    <section aria-label="Trend Chart" className="rounded-2xl bg-surface-800 border border-white/5 p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-base font-semibold text-surface-100">Daily Trend</h2>
          <p className="text-xs text-surface-200/40 mt-0.5">Spend vs Revenue over time</p>
        </div>
        {/* Legend placeholder */}
        <div className="flex gap-4 text-xs text-surface-200/40">
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-0.5 bg-brand-400 rounded inline-block" />
            Ad Spend
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-0.5 bg-accent-400 rounded inline-block" />
            Revenue
          </span>
        </div>
      </div>

      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={PLACEHOLDER_DATA} margin={{ top: 4, right: 4, left: 0, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
            <XAxis
              dataKey="day"
              tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 11 }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              width={40}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: 'hsl(220 20% 12%)',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: '8px',
                fontSize: '12px',
                color: '#e2e8f0',
              }}
            />
            {/* TODO: Add <Line> elements once schema is known */}
          </LineChart>
        </ResponsiveContainer>
      </div>

      <p className="text-center text-xs text-surface-200/25 mt-4 italic">
        Chart data will appear after data schema is configured.
      </p>
    </section>
  )
}
