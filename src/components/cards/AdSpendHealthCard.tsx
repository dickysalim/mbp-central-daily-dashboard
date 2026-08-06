/**
 * AdSpendHealthCard — v4
 * Unified design system with TotalRoasCard
 * Structure: Card Title → [Left: metrics | Right: breakdown]
 */
const fmtFull = (n: number) => 'Rp ' + Math.round(n).toLocaleString('id-ID')
const fmtIDR  = (n: number) => {
  if (n >= 1_000_000_000) return `Rp ${(n / 1_000_000_000).toFixed(1)}B`
  if (n >= 1_000_000)     return `Rp ${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000)         return `Rp ${(n / 1_000).toFixed(0)}K`
  return fmtFull(n)
}

export interface SkuSpendRow { sku: string; spend: number; target: number }

export interface AdSpendHealthCardProps {
  totalSpend: number
  periodBudget: number
  dailyBudget: number
  campaignBudgetTotal: number
  budgetDate?: string
  skuSpend?: SkuSpendRow[]
}

const SKU_COLORS: Record<string, string> = {
  MTA: '#fdba74',
  MSF: '#f97316',
  M3P: '#34d399',
  MNS: '#60a5fa',
}

/* ── Shared design tokens (identical to TotalRoasCard) ─────────────────────── */
const T = {
  cardTitle:  { fontSize: 14, fontWeight: 800, letterSpacing: '-0.02em', color: '#fff' } as const,
  section:    { fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', color: 'rgba(255,255,255,0.50)', textTransform: 'uppercase' as const },
  headline:   { fontSize: 24, fontWeight: 800, letterSpacing: '-0.04em', color: '#fff', lineHeight: 1, whiteSpace: 'nowrap' as const },
  metaLabel:  { fontSize: 10, fontWeight: 600, color: 'rgba(255,255,255,0.55)', letterSpacing: '0.03em' },
  skuCode:    { fontSize: 13, fontWeight: 700, letterSpacing: '0.07em', minWidth: 32 } as const,
  skuMeta:    { fontSize: 10, fontWeight: 600, color: 'rgba(255,255,255,0.45)' } as const,
  skuValue:   { fontSize: 13, fontWeight: 800, letterSpacing: '-0.02em' } as const,
  pill:       (c: string) => ({
    display: 'inline-flex' as const, alignItems: 'center' as const, gap: 5, marginTop: 6,
    background: `${c}15`, border: `1px solid ${c}30`,
    borderRadius: 5, padding: '3px 8px',
  }),
  barTrack:   { height: 4, background: 'rgba(255,255,255,0.07)', borderRadius: 2 } as const,
  divider:    { borderLeft: '1px solid rgba(255,255,255,0.06)', paddingLeft: 24 } as const,
}

export function AdSpendHealthCard({
  totalSpend, periodBudget, dailyBudget, campaignBudgetTotal, budgetDate,
  skuSpend = [],
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
      flex: '1 1 280px', minWidth: 280,
      background: 'rgba(255,255,255,0.04)',
      border: '1px solid rgba(255,255,255,0.09)',
      borderRadius: 14, padding: '24px 28px',
      display: 'flex', flexDirection: 'column', gap: 16,
      fontFamily: 'Inter, system-ui, sans-serif',
      overflow: 'hidden',
    }}>

      {/* Card title */}
      <div style={T.cardTitle}>Ad Spend Health</div>

      {/* Content row */}
      <div style={{ display: 'flex', flexDirection: 'row', gap: 0 }}>

        {/* LEFT — metrics */}
        <div style={{ flex: '0 0 280px', display: 'flex', flexDirection: 'column', gap: 12, paddingRight: 24 }}>

          <div>
            <div style={T.section}>Total Ad Spend</div>
            <div style={{ ...T.headline, marginTop: 4 }}>{fmtFull(totalSpend)}</div>
            {periodBudget > 0 && (
              <div style={{ ...T.section, marginTop: 6 }}>Target {fmtFull(periodBudget)}</div>
            )}

            {/* Progress bar */}
            <div style={{ marginTop: 8 }}>
              <div style={{ height: 5, background: 'rgba(255,255,255,0.1)', borderRadius: 4 }}>
                <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 4, transition: 'width 0.5s ease' }} />
              </div>
              <div style={T.pill(color)}>
                <div style={{ width: 4, height: 4, borderRadius: '50%', background: color }} />
                <span style={{ fontSize: 10, fontWeight: 700, color }}>{label}</span>
                <span style={{ fontSize: 10, color, opacity: 0.75 }}>{pct.toFixed(1)}%</span>
              </div>
            </div>
          </div>

          {/* Budget Config / Target */}
          {(campaignBudgetTotal > 0 || dailyBudget > 0) && (
            <div style={{ borderTop: '1px solid rgba(255,255,255,0.09)', paddingTop: 10 }}>
              <div style={T.section}>Daily Budget Config / Target</div>
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
                <div style={{ ...T.metaLabel, marginTop: 4 }}>as of {budgetDate}</div>
              )}
            </div>
          )}
        </div>

        {/* RIGHT — per-SKU spend breakdown */}
        {skuSpend.length > 0 && (
          <div style={{
            flex: '1 1 auto',
            ...T.divider,
            display: 'flex', flexDirection: 'column', gap: 10,
          }}>
            <div style={T.section}>Breakdown by Product</div>
            {skuSpend.map(s => {
              const skuColor = SKU_COLORS[s.sku] ?? 'rgba(255,255,255,0.68)'
              const skuDelta = s.spend - s.target
              const skuDeltaPct = s.target > 0 ? (skuDelta / s.target) * 100 : 0
              const barPct = s.target > 0 ? Math.min((s.spend / s.target) * 100, 100) : 0
              const dc = s.target === 0 ? 'rgba(255,255,255,0.4)'
                       : Math.abs(skuDeltaPct) <= 10 ? '#34d399'
                       : Math.abs(skuDeltaPct) <= 20 ? '#fbbf24'
                       : '#f87171'
              return (
                <div key={s.sku}>
                  <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 4 }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                      <span style={{ ...T.skuCode, color: skuColor }}>{s.sku}</span>
                      <span style={T.skuMeta}>{fmtIDR(s.spend)}</span>
                    </div>
                    {s.target > 0 && (
                      <span style={{ ...T.skuValue, color: dc }}>
                        {skuDelta >= 0 ? '+' : ''}{skuDeltaPct.toFixed(0)}%
                      </span>
                    )}
                  </div>
                  {s.target > 0 && (
                    <div style={T.barTrack}>
                      <div style={{
                        height: '100%', width: `${barPct}%`,
                        background: dc, borderRadius: 2,
                        transition: 'width 0.4s ease',
                      }} />
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
