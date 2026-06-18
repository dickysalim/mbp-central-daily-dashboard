/**
 * RawPage — ads_performance table (raw D1 data integrity check)
 */
import { useState } from 'react'
import { useDateRange } from '../hooks/useDateRange'
import { usePerformanceData } from '../hooks/usePerformanceData'
import { DateRangePicker } from '../components/ui/DateRangePicker'
import { LoadingState } from '../components/ui/LoadingState'
import { ErrorState } from '../components/ui/ErrorState'
import { RawDataTable, type ColumnDef } from '../components/ui/RawDataTable'
import type { AdPerformanceRow } from '../types/performance'

const PAGE_SIZE = 50

const fmtCurrency = (v: unknown) => (
  <span className="text-surface-200/60 tabular-nums font-mono">
    {new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(Number(v ?? 0))}
  </span>
)
const fmtNum = (v: unknown) => (
  <span className="text-surface-200/60 tabular-nums">
    {new Intl.NumberFormat('id-ID').format(Math.round(Number(v ?? 0)))}
  </span>
)
const fmtDay = (v: unknown) => <span className="font-mono text-surface-200/70">{String(v)}</span>
const fmtBrand = (v: unknown) => <span className="font-medium text-brand-400">{String(v ?? '—')}</span>
const fmtSource = (v: unknown) => <span className="text-accent-400">{String(v ?? '—')}</span>

const COLUMNS: ColumnDef<AdPerformanceRow>[] = [
  { key: 'day',               label: 'Day',        render: fmtDay },
  { key: 'brand',             label: 'Brand',      render: fmtBrand },
  { key: 'traffic_source',    label: 'Source',      render: fmtSource },
  { key: 'sku',               label: 'SKU' },
  { key: 'ad_spend',          label: 'Ad Spend',    align: 'right', render: fmtCurrency },
  { key: 'impressions',       label: 'Impressions', align: 'right', render: fmtNum },
  { key: 'link_clicks',       label: 'Link Clicks', align: 'right', render: fmtNum },
  { key: 'lp_view',           label: 'LP View',     align: 'right', render: fmtNum },
  { key: 'view_offer',        label: 'View Offer',  align: 'right', render: fmtNum },
  { key: 'lead_event_cc',     label: 'Ev CC',       align: 'right', render: fmtNum },
  { key: 'lead_event_dp',     label: 'Ev DP',       align: 'right', render: fmtNum },
  { key: 'lead_event_mp',     label: 'Ev MP',       align: 'right', render: fmtNum },
  { key: 'lead_event_os',     label: 'Ev OS',       align: 'right', render: fmtNum },
  { key: 'real_lead_cc',      label: 'Lead CC',     align: 'right', render: fmtNum },
  { key: 'real_lead_dp',      label: 'Lead DP',     align: 'right', render: fmtNum },
  { key: 'real_lead_mp',      label: 'Lead MP',     align: 'right', render: fmtNum },
  { key: 'lead_dispatch_dp',  label: 'Disp DP',     align: 'right', render: fmtNum },
  { key: 'lead_dispatch_mp',  label: 'Disp MP',     align: 'right', render: fmtNum },
  { key: 'agen_dispatch_dp',  label: 'Agen DP',     align: 'right', render: fmtNum },
  { key: 'socr_cc',           label: 'SoCR CC',     align: 'right', render: fmtNum },
  { key: 'sale_cc',           label: 'Sale CC',     align: 'right', render: fmtNum },
  { key: 'revenue_cc',        label: 'Revenue CC',  align: 'right', render: fmtCurrency },
  { key: 'form_submission',   label: 'Form Sub',    align: 'right', render: fmtNum },
  { key: 'visit',             label: 'Visit',       align: 'right', render: fmtNum },
]

export function RawPage() {
  const dateRange = useDateRange()
  const [page, setPage] = useState(0)
  const { data = [], isLoading, isError, error, refetch } = usePerformanceData({
    from: dateRange.from,
    to: dateRange.to,
  })

  const sorted = [...data].sort((a, b) => b.day.localeCompare(a.day))
  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE))
  const pageData = sorted.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  const handleDateChange = () => setPage(0)

  if (isLoading) return <div className="min-h-screen flex items-center justify-center"><LoadingState message="Loading ads_performance…" /></div>
  if (isError) return <div className="min-h-screen flex items-center justify-center"><ErrorState title="Could not load data" message={error?.message} onRetry={() => refetch()} /></div>

  return (
    <RawDataTable
      title="ads_performance"
      totalRows={sorted.length}
      columns={COLUMNS}
      rows={pageData}
      rowKey={(row) => row.unique_key}
      page={page}
      totalPages={totalPages}
      onPageChange={setPage}
      pageSize={PAGE_SIZE}
      headerControls={
        <DateRangePicker
          {...dateRange}
          setFrom={(v) => { dateRange.setFrom(v); handleDateChange() }}
          setTo={(v) => { dateRange.setTo(v); handleDateChange() }}
          setPreset={(p) => { dateRange.setPreset(p); handleDateChange() }}
        />
      }
    />
  )
}
