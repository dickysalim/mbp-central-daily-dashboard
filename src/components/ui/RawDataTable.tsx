/**
 * RawDataTable — Shared table component for all raw D1 data pages
 *
 * Provides consistent styling: header, table, pagination across
 * ads_performance, sales_report, and changelog pages.
 */

import type { ReactNode } from 'react'

// ── Types ────────────────────────────────────────────────────────────────────

export interface ColumnDef<T> {
  key: keyof T & string
  label: string
  align?: 'left' | 'right'
  /** Custom render for the cell. Falls back to default formatting. */
  render?: (value: unknown, row: T) => ReactNode
}

interface RawDataTableProps<T> {
  /** Table name shown in header (monospace) */
  title: string
  /** Total row count (before pagination) */
  totalRows: number
  /** Columns config */
  columns: ColumnDef<T>[]
  /** Paginated rows to display */
  rows: T[]
  /** Unique key extractor */
  rowKey: (row: T, index: number) => string | number
  /** Current page (0-indexed) */
  page: number
  /** Total pages */
  totalPages: number
  /** Page change handler */
  onPageChange: (page: number) => void
  /** Page size for display purposes */
  pageSize: number
  /** Optional controls rendered in the header (right side) */
  headerControls?: ReactNode
  /** Optional slot above the table */
  aboveTable?: ReactNode
}

// ── Format helpers ───────────────────────────────────────────────────────────

function defaultFormat(key: string, value: unknown): ReactNode {
  if (value == null) return <span className="text-surface-200/20">—</span>

  if (typeof value === 'string') {
    return <span className="text-surface-200/80">{value}</span>
  }

  if (typeof value === 'number') {
    return (
      <span className="text-surface-200/60 tabular-nums">
        {Number.isInteger(value)
          ? value.toLocaleString('id-ID')
          : value.toLocaleString('id-ID', { maximumFractionDigits: 2 })}
      </span>
    )
  }

  return <span className="text-surface-200/60">{String(value)}</span>
}

// ── Component ────────────────────────────────────────────────────────────────

export function RawDataTable<T extends Record<string, unknown>>({
  title,
  totalRows,
  columns,
  rows,
  rowKey,
  page,
  totalPages,
  onPageChange,
  pageSize,
  headerControls,
  aboveTable,
}: RawDataTableProps<T>) {
  return (
    <div className="min-h-screen flex flex-col">
      {/* ── Header ─────────────────────────────────────────────── */}
      <header className="sticky top-0 z-40 border-b border-white/5 bg-surface-950/90 backdrop-blur-md">
        <div className="px-6 py-4 flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-sm font-semibold text-surface-100 font-mono">{title}</h1>
            <p className="text-[10px] text-surface-200/40 mt-0.5">
              {totalRows.toLocaleString('id-ID')} rows · Page {page + 1} of {totalPages}
            </p>
          </div>
          {headerControls && (
            <div className="flex items-center gap-3 flex-wrap">
              {headerControls}
            </div>
          )}
        </div>
      </header>

      {/* ── Content ────────────────────────────────────────────── */}
      <div className="flex-1 px-6 py-6">
        {aboveTable}

        <div className="rounded-2xl bg-surface-900 border border-white/5 overflow-hidden">
          {/* Scrollable table */}
          <div className="overflow-x-auto">
            <table className="w-full text-xs whitespace-nowrap">
              <thead className="sticky top-0 z-10">
                <tr className="bg-surface-800 border-b border-white/5">
                  {columns.map((col) => (
                    <th
                      key={col.key}
                      className={`px-3 py-3 font-medium text-surface-200/50 uppercase tracking-wider text-[10px] ${
                        col.align === 'right' ? 'text-right' : 'text-left'
                      }`}
                    >
                      {col.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.03]">
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={columns.length} className="px-6 py-16 text-center text-surface-200/30 italic">
                      No data for selected range.
                    </td>
                  </tr>
                ) : (
                  rows.map((row, i) => (
                    <tr key={rowKey(row, i)} className="hover:bg-white/[0.02] transition-colors">
                      {columns.map((col) => {
                        const v = row[col.key]
                        return (
                          <td
                            key={col.key}
                            className={`px-3 py-2.5 ${
                              col.align === 'right' ? 'text-right' : 'text-left'
                            }`}
                          >
                            {col.render ? col.render(v, row) : defaultFormat(col.key, v)}
                          </td>
                        )
                      })}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between px-4 py-3 border-t border-white/5 bg-surface-900">
            <span className="text-xs text-surface-200/30">
              Showing {page * pageSize + 1}–{Math.min((page + 1) * pageSize, totalRows)} of{' '}
              {totalRows.toLocaleString('id-ID')} rows
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => onPageChange(0)}
                disabled={page === 0}
                className="px-2 py-1.5 rounded-md text-xs text-surface-200/50 disabled:opacity-20 hover:bg-white/5 transition-colors"
              >«</button>
              <button
                onClick={() => onPageChange(Math.max(0, page - 1))}
                disabled={page === 0}
                className="px-3 py-1.5 rounded-md text-xs text-surface-200/60 disabled:opacity-20 hover:bg-white/5 transition-colors"
              >← Prev</button>
              <span className="px-3 py-1.5 text-xs text-surface-200/40">
                {page + 1} / {totalPages}
              </span>
              <button
                onClick={() => onPageChange(Math.min(totalPages - 1, page + 1))}
                disabled={page >= totalPages - 1}
                className="px-3 py-1.5 rounded-md text-xs text-surface-200/60 disabled:opacity-20 hover:bg-white/5 transition-colors"
              >Next →</button>
              <button
                onClick={() => onPageChange(totalPages - 1)}
                disabled={page >= totalPages - 1}
                className="px-2 py-1.5 rounded-md text-xs text-surface-200/50 disabled:opacity-20 hover:bg-white/5 transition-colors"
              >»</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
