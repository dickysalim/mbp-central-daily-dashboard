/**
 * InsightReportPage — Lists & views HTML reports stored in KV
 *
 * Reports are stored via the worker's /v2/insight-reports endpoints.
 * Each report is a self-contained HTML document rendered in a sandboxed iframe.
 */
import React, { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { D1_WORKER_URL } from '../config/dataSource'
import { REPORT_BRAND } from '../config/domainConfig'

interface ReportMeta {
  slug: string
  report_id: string
  title: string
  description: string
  brand: string
  created_at: string
  updated_at: string
  _local?: boolean  // true for locally-served reports
}

export function InsightReportPage() {
  const [activeSlug, setActiveSlug] = useState<string | null>(null)

  // Fetch KV report list
  const { data: kvReports } = useQuery({
    queryKey: ['insight-reports'],
    queryFn: async () => {
      const res = await fetch(`${D1_WORKER_URL}/v2/insight-reports`)
      const json = await res.json() as { reports: ReportMeta[] }
      return json.reports
    },
  })

  // Fetch local report index (from public/local-reports/index.json)
  const { data: localReports } = useQuery({
    queryKey: ['local-reports'],
    queryFn: async () => {
      try {
        const res = await fetch(`/local-reports/index.json?t=${Date.now()}`)
        if (!res.ok) return []
        const list = await res.json() as ReportMeta[]
        return list.map(r => ({ ...r, _local: true as const }))
      } catch { return [] }
    },
    staleTime: 0, // always refetch for dev iteration
  })

  // Determine which slug is local
  const localSlugs = new Set((localReports ?? []).map(r => r.slug))
  const isLocalSlug = (slug: string) => localSlugs.has(slug)

  // Fetch report HTML when one is selected
  const { data: reportHtml, isLoading: loadingReport, refetch: refetchReport, dataUpdatedAt } = useQuery({
    queryKey: ['insight-report', activeSlug],
    queryFn: async () => {
      if (!activeSlug) return ''
      const url = isLocalSlug(activeSlug)
        ? `/local-reports/${activeSlug}.html?t=${Date.now()}`
        : `${D1_WORKER_URL}/v2/insight-reports/${activeSlug}?t=${Date.now()}`
      const res = await fetch(url)
      return res.text()
    },
    enabled: !!activeSlug,
    staleTime: 0,
  })

  // Merge: local reports first, then KV reports
  const allReports = [...(localReports ?? []), ...(kvReports ?? [])]

  // Filter by domain brand
  const reports = allReports.filter(r => {
    if (!REPORT_BRAND) return true
    return r.brand === REPORT_BRAND || r.brand === 'GLOBAL'
  })

  // ── Viewing a report ─────────────────────────────────────────────────────
  if (activeSlug) {
    return (
      <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: '#0a0a0a' }}>
        {/* Top bar */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12, padding: '10px 20px',
          borderBottom: '1px solid rgba(255,255,255,0.08)', background: '#111',
        }}>
          <button
            onClick={() => setActiveSlug(null)}
            style={{
              display: 'flex', alignItems: 'center', gap: 4,
              padding: '5px 10px', fontSize: 11, fontWeight: 600, borderRadius: 5,
              border: '1px solid rgba(255,255,255,0.12)', cursor: 'pointer',
              background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.7)',
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
            Back
          </button>
          <span style={{ fontSize: 13, fontWeight: 600, color: '#fff', flex: 1 }}>
            {reports.find(r => r.slug === activeSlug)?.title ?? activeSlug}
          </span>
          <button
            onClick={() => refetchReport()}
            style={{
              display: 'flex', alignItems: 'center', gap: 4,
              padding: '5px 10px', fontSize: 11, fontWeight: 600, borderRadius: 5,
              border: '1px solid rgba(255,255,255,0.12)', cursor: 'pointer',
              background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.7)',
            }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="23 4 23 10 17 10" /><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
            </svg>
            Refresh
          </button>
        </div>

        {/* Report iframe */}
        {loadingReport ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12 }}>Loading report…</span>
          </div>
        ) : reportHtml ? (
          <iframe
            key={dataUpdatedAt}
            srcDoc={reportHtml}
            sandbox="allow-scripts allow-same-origin"
            style={{
              flex: 1, width: '100%', border: 'none',
              background: '#fff', borderRadius: 0,
            }}
            title="Insight Report"
          />
        ) : null}
      </div>
    )
  }

  // ── Report listing ───────────────────────────────────────────────────────
  return (
    <div style={{ padding: 32, maxWidth: 1000 }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: '#fff', margin: 0 }}>
          Insight Reports
        </h1>
        <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginTop: 4 }}>
          Interactive data reports and presentations
        </p>
      </div>

      {!kvReports && !localReports ? (
        <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12 }}>Loading reports…</div>
      ) : reports.length === 0 ? (
        <div style={{
          padding: 40, textAlign: 'center', borderRadius: 10,
          border: '1px dashed rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.02)',
        }}>
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: 12 }}>
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
          </svg>
          <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.35)', margin: 0 }}>No reports yet</p>
          <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.2)', marginTop: 4 }}>
            Reports will appear here once created
          </p>
        </div>
      ) : (
        <div style={{ borderRadius: 8, border: '1px solid rgba(255,255,255,0.08)', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                <th style={{ padding: '8px 14px', fontSize: 9, fontWeight: 700, color: 'rgba(255,255,255,0.35)', textAlign: 'left', whiteSpace: 'nowrap' }}>Report ID</th>
                <th style={{ padding: '8px 14px', fontSize: 9, fontWeight: 700, color: 'rgba(255,255,255,0.35)', textAlign: 'left', whiteSpace: 'nowrap' }}>Date Created</th>
                <th style={{ padding: '8px 14px', fontSize: 9, fontWeight: 700, color: 'rgba(255,255,255,0.35)', textAlign: 'left', whiteSpace: 'nowrap' }}>Brand</th>
                <th style={{ padding: '8px 14px', fontSize: 9, fontWeight: 700, color: 'rgba(255,255,255,0.35)', textAlign: 'left' }}>Report Title</th>
              </tr>
            </thead>
            <tbody>
              {reports.map(r => (
                <tr
                  key={r.slug}
                  onClick={() => setActiveSlug(r.slug)}
                  style={{
                    cursor: 'pointer', borderBottom: '1px solid rgba(255,255,255,0.04)',
                    transition: 'background 0.1s',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)' }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
                >
                  <td style={{ padding: '10px 14px', fontSize: 11, fontWeight: 700, color: '#6366f1', whiteSpace: 'nowrap', verticalAlign: 'top' }}>
                    {r.report_id || '—'}
                    {(r as any)._local && <span style={{ marginLeft: 6, fontSize: 8, fontWeight: 700, padding: '1px 4px', borderRadius: 3, background: 'rgba(251,191,36,0.15)', color: '#fbbf24' }}>LOCAL</span>}
                  </td>
                  <td style={{ padding: '10px 14px', fontSize: 11, color: 'rgba(255,255,255,0.5)', whiteSpace: 'nowrap', verticalAlign: 'top' }}>
                    {new Date(r.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </td>
                  <td style={{ padding: '10px 14px', fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.7)', whiteSpace: 'nowrap', verticalAlign: 'top' }}>
                    {r.brand || '—'}
                  </td>
                  <td style={{ padding: '10px 14px', verticalAlign: 'top' }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: '#fff', lineHeight: 1.3 }}>
                      {r.title}
                    </div>
                    {r.description && (
                      <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', marginTop: 2, lineHeight: 1.4 }}>
                        {r.description}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
