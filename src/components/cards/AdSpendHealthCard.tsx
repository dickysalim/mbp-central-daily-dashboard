/**
 * AdSpendHealthCard — v2
 * Design system: 8-pt grid, 14px radius, compact type scale
 */
const fmtFull = (n: number) => 'Rp ' + Math.round(n).toLocaleString('id-ID')
const fmtIDR  = (n: number) => {
  if (n >= 1_000_000_000) return `Rp ${(n / 1_000_000_000).toFixed(1)}B`
  if (n >= 1_000_000)     return `Rp ${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000)         return `Rp ${(n / 1_000).toFixed(1)}K`
  return fmtFull(n)
}

export interface AdSpendHealthCardProps {
  totalSpend: number
  periodBudget: number
  dailyBudget: number
  campaignBudgetTotal: number
  budgetDate?: string
}

// ── shared design tokens ─────────────────────────────────────────────────────
const T = {
  label:  { fontSize: 9,  fontWeight: 700, letterSpacing: '0.1em',  color: 'rgba(255,255,255,0.65)', textTransform: 'uppercase' as const },
  head:   { fontSize: 24, fontWeight: 800, letterSpacing: '-0.04em', color: '#fff', lineHeight: 1, whiteSpace: 'nowrap' as const },
  sub:    { fontSize: 13, fontWeight: 700, letterSpacing: '-0.02em', color: 'rgba(255,255,255,0.76)' },
  tiny:   { fontSize: 10, fontWeight: 600, color: 'rgba(255,255,255,0.76)', letterSpacing: '0.05em', textTransform: 'uppercase' as const },
  divider:{ borderTop: '1px solid rgba(255,255,255,0.09)', marginTop: 12, paddingTop: 10 },
}

export function AdSpendHealthCard({
  totalSpend, periodBudget, dailyBudget, campaignBudgetTotal, budgetDate,
}: AdSpendHealthCardProps) {
  const pct    = periodBudget > 0 ? Math.min((totalSpend / periodBudget) * 100, 100) : 0
  const color  = pct === 0    ? '#818cf8'
               : pct > 115   ? '#f87171'
               : pct >= 105  ? '#fbbf24'
               : pct >= 95   ? '#34d399'
               : pct >= 85   ? '#fbbf24'
               :                '#f87171'
  const label  = pct === 0    ? 'No Data'
               : pct > 115   ? '🔴 Over Budget'
               : pct >= 105  ? '🟡 Slightly Over'
               : pct >= 95   ? '🟢 On Track'
               : pct >= 85   ? '🟡 Slightly Under'
               :                '🔴 Far Behind'

  const delta    = campaignBudgetTotal - dailyBudget
  const deltaPct = dailyBudget > 0 ? (delta / dailyBudget) * 100 : 0

  return (
    <div style={{
      flex: '1 1 220px', minWidth: 220,
      background: 'rgba(255,255,255,0.04)',
      border: '1px solid rgba(255,255,255,0.09)',
      borderRadius: 14, padding: '24px 28px',
      display: 'flex', flexDirection: 'column', gap: 12,
      fontFamily: 'Inter, system-ui, sans-serif',
    }}>
      {/* Label */}
      <div style={T.label}>Ad Spend Health</div>

      {/* Headline */}
      <div>
        <div style={T.head}>{fmtIDR(totalSpend)}</div>
        <div style={{ ...T.tiny, marginTop: 4, color: 'rgba(255,255,255,0.55)' }}>{fmtFull(totalSpend)}</div>
        {periodBudget > 0 && (
          <div style={{ ...T.tiny, marginTop: 2 }}>target {fmtIDR(periodBudget)}</div>
        )}

        {/* Progress bar */}
        <div style={{ marginTop: 10 }}>
          <div style={{ height: 5, background: 'rgba(255,255,255,0.1)', borderRadius: 4 }}>
            <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 4, transition: 'width 0.5s ease' }} />
          </div>
          {/* Status pill */}
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 5, marginTop: 7,
            background: `${color}15`, border: `1px solid ${color}30`,
            borderRadius: 5, padding: '3px 7px',
          }}>
            <div style={{ width: 4, height: 4, borderRadius: '50%', background: color }} />
            <span style={{ fontSize: 10, fontWeight: 700, color }}>{label}</span>
            <span style={{ fontSize: 10, color, opacity: 0.75 }}>{pct.toFixed(1)}%</span>
          </div>
        </div>
      </div>

      {/* Budget Config / Target */}
      {(campaignBudgetTotal > 0 || dailyBudget > 0) && (
        <div style={T.divider}>
          <div style={{ ...T.label, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>Daily Budget Config / Target</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 5, marginTop: 5 }}>
            <span style={{ fontSize: 15, fontWeight: 800, color: '#fff', letterSpacing: '-0.02em' }}>{fmtIDR(campaignBudgetTotal)}</span>
            <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)', fontWeight: 600 }}>/</span>
            <span style={{ fontSize: 15, fontWeight: 800, color: 'rgba(255,255,255,0.8)', letterSpacing: '-0.02em' }}>{fmtIDR(dailyBudget)}</span>
          </div>
          {campaignBudgetTotal > 0 && dailyBudget > 0 && (
            <div style={{ fontSize: 10, marginTop: 4, fontWeight: 600, color: delta < 0 ? '#f87171' : '#34d399' }}>
              {delta < 0 ? '▼' : '▲'} {fmtIDR(Math.abs(delta))} ({Math.abs(deltaPct).toFixed(1)}%) {delta < 0 ? 'below target' : 'above target'}
            </div>
          )}
          {budgetDate && (
            <div style={{ ...T.tiny, marginTop: 4 }}>as of {budgetDate}</div>
          )}
        </div>
      )}
    </div>
  )
}
