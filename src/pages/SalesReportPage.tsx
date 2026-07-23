/**
 * SalesReportPage — sales_report table (raw D1 data integrity check)
 */

import { useMemo, useState, useEffect } from 'react'
import { useSalesReportData } from '../hooks/useSalesReportData'
import { useDateRange } from '../hooks/useDateRange'
import { DateRangePicker } from '../components/ui/DateRangePicker'
import { LoadingState } from '../components/ui/LoadingState'
import { ErrorState } from '../components/ui/ErrorState'
import { RawDataTable, type ColumnDef } from '../components/ui/RawDataTable'
import type { SalesReportRow } from '../types/salesReport'

const PAGE_SIZE = 50

const fmtDay = (v: unknown) => <span className="font-mono text-surface-200/70">{String(v)}</span>
const fmtBrand = (v: unknown) => <span className="font-medium text-brand-400">{String(v ?? '—')}</span>
const fmtNum = (v: unknown) => (
  <span className="text-surface-200/60 tabular-nums">
    {Number(v ?? 0).toLocaleString('id-ID')}
  </span>
)
const fmtTotal = (v: unknown) => (
  <span className="text-white font-bold tabular-nums">
    {Number(v ?? 0).toLocaleString('id-ID')}
  </span>
)

const COLUMNS: ColumnDef<SalesReportRow>[] = [
  { key: 'day',         label: 'Day',         render: fmtDay },
  { key: 'brand',       label: 'Brand',       render: fmtBrand },
  { key: 'sales_cc',    label: 'Sales CC',    align: 'right', render: fmtNum },
  { key: 'sales_ca',    label: 'Sales CA',    align: 'right', render: fmtNum },
  { key: 'sales_clr',   label: 'Sales CLR',   align: 'right', render: fmtNum },
  { key: 'sales_mp',    label: 'Sales MP',    align: 'right', render: fmtNum },
  { key: 'sales_dp',    label: 'Sales DP',    align: 'right', render: fmtNum },
  { key: 'sales_total', label: 'Sales Total', align: 'right', render: fmtTotal },
]

export function SalesReportPage() {
  const dateRange = useDateRange()
  const [page, setPage] = useState(0)

  // Default to last 30 days
  useEffect(() => { dateRange.setPreset('last30') }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const { data = [], isLoading, isError, error, refetch } = useSalesReportData({
    from: dateRange.from,
    to: dateRange.to,
  })

  const sorted = useMemo(() =>
    [...data].sort((a, b) => b.day.localeCompare(a.day)),
    [data]
  )

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE))
  const pageData = sorted.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  useEffect(() => { setPage(0) }, [dateRange.from, dateRange.to])

  if (isLoading) return <div className="min-h-screen flex items-center justify-center"><LoadingState message="Loading cdd.v1_sales_report…" /></div>
  if (isError) return <div className="min-h-screen flex items-center justify-center"><ErrorState title="Could not load data" message={error?.message} onRetry={() => refetch()} /></div>

  return (
    <RawDataTable
      title="cdd.v1_sales_report"
      totalRows={sorted.length}
      columns={COLUMNS}
      rows={pageData}
      rowKey={(row, i) => row.unique_key ?? i}
      page={page}
      totalPages={totalPages}
      onPageChange={setPage}
      pageSize={PAGE_SIZE}
      headerControls={<DateRangePicker {...dateRange} />}
    />
  )
}
