/**
 * DateRangePicker — Date range selector with preset shortcuts
 *
 * Props mirror UseDateRangeReturn from useDateRange hook.
 */
import type { UseDateRangeReturn, DateRangePreset } from '../../hooks/useDateRange'

const PRESETS: { label: string; value: DateRangePreset }[] = [
  { label: 'This Month', value: 'thisMonth' },
  { label: 'Last Month', value: 'lastMonth' },
  { label: 'Last 7 Days', value: 'last7' },
  { label: 'Last 30 Days', value: 'last30' },
  { label: 'Custom', value: 'custom' },
]

type Props = Pick<UseDateRangeReturn, 'from' | 'to' | 'preset' | 'setFrom' | 'setTo' | 'setPreset'>

export function DateRangePicker({ from, to, preset, setFrom, setTo, setPreset }: Props) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Preset buttons */}
      <div className="flex gap-1 p-1 rounded-lg bg-surface-800 border border-white/5">
        {PRESETS.map((p) => (
          <button
            key={p.value}
            id={`preset-${p.value}`}
            onClick={() => setPreset(p.value)}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
              preset === p.value
                ? 'bg-brand-500 text-white shadow-sm'
                : 'text-surface-200/60 hover:text-surface-100 hover:bg-white/5'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Manual date inputs — always visible, editable in custom mode */}
      <div className="flex items-center gap-2">
        <input
          id="date-range-from"
          type="date"
          value={from}
          onChange={(e) => { setPreset('custom'); setFrom(e.target.value) }}
          className="px-3 py-1.5 rounded-lg bg-surface-800 border border-white/5 text-surface-100 text-xs focus:outline-none focus:ring-1 focus:ring-brand-500"
        />
        <span className="text-surface-200/40 text-xs">→</span>
        <input
          id="date-range-to"
          type="date"
          value={to}
          onChange={(e) => { setPreset('custom'); setTo(e.target.value) }}
          className="px-3 py-1.5 rounded-lg bg-surface-800 border border-white/5 text-surface-100 text-xs focus:outline-none focus:ring-1 focus:ring-brand-500"
        />
      </div>
    </div>
  )
}
