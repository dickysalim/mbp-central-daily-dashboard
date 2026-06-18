/**
 * Dashboard — Main page content
 *
 * Orchestrates the date range state and passes it to all child components.
 * Layout shell (sidebar) is handled by AppLayout.
 */

import { useDateRange } from '../../hooks/useDateRange'
import { usePerformanceData } from '../../hooks/usePerformanceData'
import { DateRangePicker } from '../ui/DateRangePicker'
import { LoadingState } from '../ui/LoadingState'
import { ErrorState } from '../ui/ErrorState'
import { KPISummaryCards } from './KPISummaryCards'
import { TrendChart } from './TrendChart'
import { DataTable } from './DataTable'

export function Dashboard() {
  const dateRange = useDateRange()
  const { data, isLoading, isError, error, refetch } = usePerformanceData({
    from: dateRange.from,
    to: dateRange.to,
  })

  return (
    <div className="min-h-screen flex flex-col text-surface-100">
      {/* Top bar */}
      <header className="sticky top-0 z-40 border-b border-white/5 bg-surface-950/90 backdrop-blur-md">
        <div className="px-6 py-4 flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-sm font-semibold text-surface-100">Main</h1>
            <p className="text-[10px] text-surface-200/40 mt-0.5">Overview · All brands</p>
          </div>
          <DateRangePicker {...dateRange} />
        </div>
      </header>

      {/* Content */}
      <div className="flex-1 px-6 py-8 space-y-6">
        {isLoading && <LoadingState message="Fetching performance data…" />}

        {isError && !isLoading && (
          <ErrorState
            title="Could not load data"
            message={error?.message ?? 'An unexpected error occurred.'}
            onRetry={() => refetch()}
          />
        )}

        {!isLoading && (
          <>
            <KPISummaryCards />
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
              <div className="xl:col-span-2">
                <TrendChart />
              </div>
              <div className="rounded-2xl bg-surface-800 border border-white/5 p-6 flex items-center justify-center">
                <p className="text-xs text-surface-200/25 italic text-center">
                  Platform breakdown<br />coming soon
                </p>
              </div>
            </div>
            <DataTable data={data} isLoading={isLoading} />
          </>
        )}
      </div>

      <footer className="border-t border-white/5 py-4 px-6 text-xs text-surface-200/20">
        Central Daily Dashboard · Cloudflare D1
      </footer>
    </div>
  )
}
