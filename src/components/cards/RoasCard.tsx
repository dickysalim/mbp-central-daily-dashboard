/**
 * RoasCard — Return on Ad Spend
 * Displays CC Ads Revenue, Total Sales Revenue, Ad Spend, RoAS ratios,
 * and a 7-day MA sparkline chart.
 */

import { fmtRp as fmtFull, fmtRpM as fmtRp } from '../../utils/format'

const T = {
  label: {
    fontSize: 9, fontWeight: 700, letterSpacing: '0.1em',
    color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase' as const,
  },
  sectionLabel: {
    fontSize: 9, fontWeight: 700, letterSpacing: '0.09em',
    color: 'rgba(255,255,255,0.38)', textTransform: 'uppercase' as const,
    marginBottom: 6,
  },
  value: {
    fontSize: 28, fontWeight: 800, letterSpacing: '-0.04em',
    color: '#fff', lineHeight: 1, whiteSpace: 'nowrap' as const,
  },
  sub: {
    fontSize: 10, fontWeight: 600, color: 'rgba(255,255,255,0.45)',
    marginTop: 4, letterSpacing: '0.02em',
  },
}

interface RoasSeriesPoint { date: string; value: number }

interface RoasCardProps {
  ccAdsRevenue?:      number
  totalSalesRevenue?: number
  totalAdSpend?:      number
  ccRoasSeries?:      RoasSeriesPoint[]
}

/* ── Sparkline renderer ──────────────────────────────────────────────────── */
function RoasSparkline({ data, gradId = 'roas-fill-grad', lineColor }: { data: RoasSeriesPoint[]; gradId?: string; lineColor?: string }) {
  if (data.length < 2) return null

  const W = 600, H = 120, PX = 36, PY = 18
  const values = data.map(d => d.value)
  const minV = Math.min(...values) * 0.92
  const maxV = Math.max(...values) * 1.08
  const rangeV = maxV - minV || 1

  const x = (i: number) => PX + (i / (data.length - 1)) * (W - PX * 2)
  const y = (v: number) => PY + (1 - (v - minV) / rangeV) * (H - PY * 2)

  // Build path
  const pts = data.map((d, i) => `${x(i)},${y(d.value)}`)
  const linePath = 'M' + pts.join('L')

  // Gradient fill under line
  const fillPath = linePath + `L${x(data.length - 1)},${H - PY}L${x(0)},${H - PY}Z`

  // 1× reference line
  const oneY = y(1)
  const oneVisible = oneY > PY && oneY < H - PY

  // Date labels
  const firstDate = data[0].date
  const lastDate  = data[data.length - 1].date
  const fmtDate = (d: string) => {
    const dt = new Date(d + 'T00:00:00')
    return dt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
  }

  const latest = data[data.length - 1].value
  const latestColor = lineColor ?? (latest >= 1 ? '#34d399' : '#f87171')

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: H, display: 'block' }}>
      <defs>
        <linearGradient id={gradId} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={latestColor} stopOpacity="0.18" />
          <stop offset="100%" stopColor={latestColor} stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* Fill */}
      <path d={fillPath} fill={`url(#${gradId})`} />

      {/* 1× reference line */}
      {oneVisible && (
        <>
          <line x1={PX} x2={W - PX} y1={oneY} y2={oneY}
            stroke="rgba(255,255,255,0.12)" strokeWidth="1" strokeDasharray="4 3" />
          <text x={W - PX + 4} y={oneY + 3} fill="rgba(255,255,255,0.3)" fontSize="9" fontWeight="600">1×</text>
        </>
      )}

      {/* Line */}
      <path d={linePath} fill="none" stroke={latestColor} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />

      {/* Latest dot */}
      <circle cx={x(data.length - 1)} cy={y(latest)} r="3.5" fill={latestColor} />
      <circle cx={x(data.length - 1)} cy={y(latest)} r="6" fill={latestColor} fillOpacity="0.2" />

      {/* Latest value label */}
      <text x={x(data.length - 1)} y={y(latest) - 10} fill={latestColor}
        fontSize="11" fontWeight="700" textAnchor="middle">
        {latest.toFixed(2)}×
      </text>

      {/* Date labels */}
      <text x={PX} y={H - 2} fill="rgba(255,255,255,0.3)" fontSize="9">{fmtDate(firstDate)}</text>
      <text x={W - PX} y={H - 2} fill="rgba(255,255,255,0.3)" fontSize="9" textAnchor="end">{fmtDate(lastDate)}</text>
    </svg>
  )
}

/* ── Card ─────────────────────────────────────────────────────────────────── */
export function RoasCard({
  ccAdsRevenue     = 0,
  totalSalesRevenue = 0,
  totalAdSpend     = 0,
  ccRoasSeries     = [],
}: RoasCardProps) {

  const ccRoas    = totalAdSpend > 0 ? ccAdsRevenue    / totalAdSpend : null
  const totalRoas = totalAdSpend > 0 ? totalSalesRevenue / totalAdSpend : null

  const Metric = ({
    label, value, sub, color = '#fff',
    borderLeft = false,
  }: {
    label: string; value: string; sub?: string; color?: string; borderLeft?: boolean
  }) => (
    <div style={{
      flex: 1, minWidth: 140,
      paddingLeft: borderLeft ? 24 : 0,
      borderLeft: borderLeft ? '1px solid rgba(255,255,255,0.07)' : 'none',
    }}>
      <div style={T.sectionLabel}>{label}</div>
      <div style={{ ...T.value, color }}>{value}</div>
      {sub && <div style={T.sub}>{sub}</div>}
    </div>
  )

  return (
    <div style={{
      background: 'rgba(255,255,255,0.04)',
      border: '1px solid rgba(255,255,255,0.09)',
      borderRadius: 14,
      padding: '20px 24px',
      fontFamily: 'Inter, system-ui, sans-serif',
      display: 'flex',
      flexDirection: 'column',
      gap: 20,
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
        <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#34d399', boxShadow: '0 0 6px #34d39988' }} />
        <div style={T.label}>RoAS</div>
      </div>

      {/* Metrics row */}
      <div style={{ display: 'flex', gap: 0, flexWrap: 'wrap' }}>

        <Metric
          label="CC Ads Revenue"
          value={ccAdsRevenue > 0 ? fmtRp(ccAdsRevenue) : '—'}
          sub={ccAdsRevenue > 0 ? fmtFull(ccAdsRevenue) : undefined}
          color="#34d399"
        />

        <Metric
          label="Total Sales Revenue"
          value={totalSalesRevenue > 0 ? fmtRp(totalSalesRevenue) : '—'}
          sub={totalSalesRevenue > 0 ? fmtFull(totalSalesRevenue) : undefined}
          color="#818cf8"
          borderLeft
        />

        <Metric
          label="Ad Spend"
          value={totalAdSpend > 0 ? fmtRp(totalAdSpend) : '—'}
          sub={totalAdSpend > 0 ? fmtFull(totalAdSpend) : undefined}
          color="rgba(255,255,255,0.7)"
          borderLeft
        />

        {ccRoas !== null && (
          <Metric
            label="CC RoAS"
            value={ccRoas.toFixed(2) + '×'}
            sub={`Rp ${fmtRp(ccAdsRevenue)} on Rp ${fmtRp(totalAdSpend)}`}
            color={ccRoas >= 1 ? '#34d399' : '#f87171'}
            borderLeft
          />
        )}

        {totalRoas !== null && (
          <Metric
            label="Total RoAS"
            value={totalRoas.toFixed(2) + '×'}
            sub={`Rp ${fmtRp(totalSalesRevenue)} on Rp ${fmtRp(totalAdSpend)}`}
            color={totalRoas >= 1 ? '#818cf8' : '#f87171'}
            borderLeft
          />
        )}
      </div>

      {/* CC RoAS chart */}
      {ccRoasSeries.length >= 2 && (
        <div>
          <div style={{ ...T.sectionLabel, marginBottom: 8 }}>CC RoAS · 7-Day Moving Average</div>
          <RoasSparkline data={ccRoasSeries} gradId="cc-roas-fill" lineColor="#34d399" />
        </div>
      )}
    </div>
  )
}
