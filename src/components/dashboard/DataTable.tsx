/**
 * DataTable — Placeholder paginated data table
 *
 * TODO: Wire columns once data schema is confirmed.
 */

import { useState } from 'react'
import type { PerformanceRow } from '../../types/performance'

interface DataTableProps {
  data?: PerformanceRow[]
  isLoading?: boolean
}

const PAGE_SIZE = 20

export function DataTable({ data = [], isLoading = false }: DataTableProps) {
  const [page, setPage] = useState(0)

  const totalPages = Math.max(1, Math.ceil(data.length / PAGE_SIZE))
  const pageData = data.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  return (
    <section aria-label="Data Table" className="rounded-2xl bg-surface-800 border border-white/5 overflow-hidden">
      {/* Table header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-white/5">
        <div>
          <h2 className="text-base font-semibold text-surface-100">Daily Data</h2>
          <p className="text-xs text-surface-200/40 mt-0.5">{data.length} rows</p>
        </div>
      </div>

      {/* Table body */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/5">
              <th className="px-6 py-3 text-left text-xs font-medium text-surface-200/40 uppercase tracking-wider">
                Date
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium text-surface-200/40 uppercase tracking-wider">
                — more columns after schema brief —
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.03]">
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i}>
                  <td className="px-6 py-3">
                    <div className="h-4 w-24 rounded bg-white/5 animate-pulse" />
                  </td>
                  <td className="px-6 py-3 text-right">
                    <div className="h-4 w-48 rounded bg-white/5 animate-pulse ml-auto" />
                  </td>
                </tr>
              ))
            ) : pageData.length === 0 ? (
              <tr>
                <td colSpan={2} className="px-6 py-12 text-center text-surface-200/30 text-xs italic">
                  No data for selected date range.
                </td>
              </tr>
            ) : (
              pageData.map((row, i) => (
                <tr key={i} className="hover:bg-white/[0.02] transition-colors">
                  <td className="px-6 py-3 font-mono text-xs text-surface-200/70">{row.day}</td>
                  <td className="px-6 py-3 text-right text-xs text-surface-200/30 italic">
                    {Object.keys(row).length - 1} more fields
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-6 py-3 border-t border-white/5">
          <span className="text-xs text-surface-200/40">
            Page {page + 1} of {totalPages}
          </span>
          <div className="flex gap-2">
            <button
              id="table-prev-page"
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              className="px-3 py-1 rounded-lg text-xs bg-surface-700 text-surface-200/60 disabled:opacity-30 hover:bg-surface-600 transition-colors"
            >
              ← Prev
            </button>
            <button
              id="table-next-page"
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
              className="px-3 py-1 rounded-lg text-xs bg-surface-700 text-surface-200/60 disabled:opacity-30 hover:bg-surface-600 transition-colors"
            >
              Next →
            </button>
          </div>
        </div>
      )}
    </section>
  )
}
