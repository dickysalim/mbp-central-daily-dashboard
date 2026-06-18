/**
 * ChangelogPage — changelog table (raw D1 data integrity check)
 */

import { useMemo, useState } from 'react'
import { useChangelogData } from '../hooks/useChangelogData'
import { RawDataTable, type ColumnDef } from '../components/ui/RawDataTable'
import type { ChangelogRow } from '../types/changelog'

const PAGE_SIZE = 50

const BRAND_TAGS = ['MNC', 'GOL', 'MCI', 'MNC-B2B', 'GOL-B2B'] as const

const tagColor: Record<string, string> = {
  MNC:       'rgba(139, 92, 246, .85)',
  GOL:       'rgba(16, 185, 129, .85)',
  MCI:       'rgba(59, 130, 246, .85)',
  'MNC-B2B': 'rgba(245, 158, 11, .85)',
  'GOL-B2B': 'rgba(236, 72, 153, .85)',
}

const fmtDay = (v: unknown) => <span className="font-mono text-surface-200/70">{String(v)}</span>
const fmtHeadline = (v: unknown) => <span className="font-semibold text-surface-100">{String(v)}</span>
const fmtDesc = (v: unknown) => (
  <span className="text-surface-200/50 whitespace-pre-wrap break-words" style={{ maxWidth: '500px', display: 'inline-block', lineHeight: 1.45 }}>
    {String(v || '—')}
  </span>
)
const fmtBrands = (_v: unknown, row: ChangelogRow) => {
  const active = BRAND_TAGS.filter(t => (row as any)[t] === 1)
  return (
    <div className="flex gap-1 flex-wrap">
      {active.map(tag => (
        <span
          key={tag}
          className="px-1.5 py-0.5 rounded-full text-[10px] font-bold"
          style={{
            background: `${tagColor[tag]}22`,
            color: tagColor[tag],
            border: `1px solid ${tagColor[tag]}44`,
          }}
        >{tag}</span>
      ))}
    </div>
  )
}

const COLUMNS: ColumnDef<ChangelogRow>[] = [
  { key: 'day',         label: 'Day',         render: fmtDay },
  { key: 'headline',    label: 'Headline',    render: fmtHeadline },
  { key: 'description', label: 'Description', render: fmtDesc },
  { key: 'MNC',         label: 'Brands',      render: fmtBrands as any }, // uses full row
]

export function ChangelogPage() {
  const { data = [], isLoading, isError, error, refetch } = useChangelogData()
  const [search, setSearch] = useState('')
  const [brandFilter, setBrandFilter] = useState<string | null>(null)
  const [page, setPage] = useState(0)

  const filtered = useMemo(() => {
    let rows = [...data]
    if (brandFilter) {
      rows = rows.filter((r: any) => r[brandFilter] === 1)
    }
    if (search.trim()) {
      const q = search.toLowerCase()
      rows = rows.filter(r =>
        r.headline.toLowerCase().includes(q) ||
        r.description.toLowerCase().includes(q) ||
        r.day.includes(q)
      )
    }
    // Already DESC from API, but ensure it
    rows.sort((a, b) => b.day.localeCompare(a.day))
    return rows
  }, [data, search, brandFilter])

  useMemo(() => { setPage(0) }, [search, brandFilter])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const pageData = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-surface-200/40 text-sm">Loading changelog…</div>
      </div>
    )
  }
  if (isError) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-400 font-semibold">Could not load changelog</p>
          <p className="text-xs text-surface-200/40 mt-1">{(error as Error).message}</p>
          <button onClick={() => refetch()} className="mt-3 px-4 py-1.5 rounded-lg bg-brand-500/20 border border-brand-500/30 text-brand-400 text-xs font-semibold">
            Try again
          </button>
        </div>
      </div>
    )
  }

  return (
    <RawDataTable
      title="changelog"
      totalRows={filtered.length}
      columns={COLUMNS}
      rows={pageData}
      rowKey={(row) => row.id}
      page={page}
      totalPages={totalPages}
      onPageChange={setPage}
      pageSize={PAGE_SIZE}
      headerControls={
        <div className="flex items-center gap-2 flex-wrap">
          {/* Brand filter pills */}
          <button
            onClick={() => setBrandFilter(null)}
            className={`px-2.5 py-1 rounded-full text-[10px] font-semibold border transition-colors ${
              brandFilter === null
                ? 'bg-brand-500/20 border-brand-500/30 text-brand-400'
                : 'border-white/10 text-surface-200/40 hover:text-surface-200/60'
            }`}
          >All</button>
          {BRAND_TAGS.map(tag => (
            <button
              key={tag}
              onClick={() => setBrandFilter(brandFilter === tag ? null : tag)}
              className="px-2.5 py-1 rounded-full text-[10px] font-semibold border transition-colors"
              style={{
                borderColor: brandFilter === tag ? `${tagColor[tag]}66` : 'rgba(255,255,255,.08)',
                background: brandFilter === tag ? `${tagColor[tag]}22` : 'transparent',
                color: brandFilter === tag ? tagColor[tag] : 'rgba(255,255,255,.35)',
              }}
            >{tag}</button>
          ))}

          {/* Search */}
          <div className="relative">
            <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 text-surface-200/30 w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
            </svg>
            <input
              type="text"
              placeholder="Search…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-8 pr-3 py-1.5 rounded-lg bg-surface-700 border border-white/10 text-xs text-surface-100 placeholder:text-surface-200/25 focus:outline-none focus:border-brand-500/50 w-40"
            />
          </div>
        </div>
      }
    />
  )
}
