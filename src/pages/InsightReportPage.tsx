/**
 * InsightReportPage — Lists & views HTML reports stored in KV
 *
 * Reports are stored via the worker's /v2/insight-reports endpoints.
 * Each report is a self-contained HTML document rendered in a sandboxed iframe.
 */
import React, { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { D1_WORKER_URL } from '../config/dataSource'

interface ReportMeta {
  slug: string
  title: string
  description: string
  created_at: string
  updated_at: string
}

export function InsightReportPage() {
  const [activeSlug, setActiveSlug] = useState<string | null>(null)

  // Fetch report list
  const { data, isLoading } = useQuery({
    queryKey: ['insight-reports'],
    queryFn: async () => {
      const res = await fetch(`${D1_WORKER_URL}/v2/insight-reports`)
      const json = await res.json() as { reports: ReportMeta[] }
      return json.reports
    },
  })

  // Fetch report HTML when one is selected
  const { data: reportHtml, isLoading: loadingReport, refetch: refetchReport, dataUpdatedAt } = useQuery({
    queryKey: ['insight-report', activeSlug],
    queryFn: async () => {
      const res = await fetch(`${D1_WORKER_URL}/v2/insight-reports/${activeSlug}?t=${Date.now()}`)
      return res.text()
    },
    enabled: !!activeSlug,
    staleTime: 0,
  })

  const reports = data ?? []

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

      {isLoading ? (
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
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
          {reports.map(r => (
            <button
              key={r.slug}
              onClick={() => setActiveSlug(r.slug)}
              style={{
                display: 'flex', flexDirection: 'column', gap: 6,
                padding: 16, borderRadius: 10, cursor: 'pointer', textAlign: 'left',
                border: '1px solid rgba(255,255,255,0.09)',
                background: 'rgba(255,255,255,0.03)',
                transition: 'all 0.15s',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.15)' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.03)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.09)' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="rgba(99,102,241,0.7)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                  <line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" />
                </svg>
                <span style={{ fontSize: 13, fontWeight: 600, color: '#fff', lineHeight: 1.3 }}>
                  {r.title}
                </span>
              </div>
              {r.description && (
                <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', margin: 0, lineHeight: 1.4 }}>
                  {r.description}
                </p>
              )}
              <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.25)', marginTop: 2 }}>
                {new Date(r.updated_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
