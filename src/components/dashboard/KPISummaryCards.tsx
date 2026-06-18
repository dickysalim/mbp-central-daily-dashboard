/**
 * KPISummaryCards — Placeholder KPI metric cards
 *
 * TODO: Wire real metrics once data schema is confirmed.
 * Currently renders skeleton card slots so the layout is visible.
 */

interface KPICardProps {
  id: string
  label: string
  value: string
  change?: string
  positive?: boolean
  icon?: string
}

function KPICard({ id, label, value, change, positive, icon }: KPICardProps) {
  return (
    <div
      id={id}
      className="relative overflow-hidden rounded-2xl bg-surface-800 border border-white/5 p-6 group hover:border-brand-500/30 transition-all duration-300"
    >
      {/* Background glow on hover */}
      <div className="absolute inset-0 bg-gradient-to-br from-brand-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />

      <div className="relative">
        <div className="flex items-center justify-between mb-4">
          <p className="text-xs font-medium text-surface-200/50 uppercase tracking-wider">{label}</p>
          {icon && <span className="text-lg">{icon}</span>}
        </div>
        <p className="text-2xl font-bold text-surface-100 tabular-nums">{value}</p>
        {change && (
          <p className={`mt-1 text-xs font-medium ${positive ? 'text-accent-400' : 'text-red-400'}`}>
            {positive ? '↑' : '↓'} {change} vs prev period
          </p>
        )}
      </div>
    </div>
  )
}

// Placeholder data — replace with real computed values once schema is known
const PLACEHOLDER_KPIS: KPICardProps[] = [
  { id: 'kpi-spend', label: 'Total Ad Spend', value: '—', icon: '💸' },
  { id: 'kpi-leads', label: 'Total Real Leads', value: '—', icon: '🎯' },
  { id: 'kpi-revenue', label: 'Total Sales', value: '—', icon: '💰' },
  { id: 'kpi-roas', label: 'ROAS', value: '—', icon: '📈' },
  { id: 'kpi-cpl', label: 'Cost per Lead', value: '—', icon: '🧮' },
]

export function KPISummaryCards() {
  return (
    <section aria-label="KPI Summary">
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
        {PLACEHOLDER_KPIS.map((kpi) => (
          <KPICard key={kpi.id} {...kpi} />
        ))}
      </div>
    </section>
  )
}
