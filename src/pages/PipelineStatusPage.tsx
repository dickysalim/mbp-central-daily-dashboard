/**
 * PipelineStatusPage — ETL Pipeline health dashboard
 * Shows at-a-glance status of all data pipelines with run history
 */
import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'

const D1_WORKER_URL = 'https://central-daily-dashboard-worker.mganik-group.workers.dev'

interface PipelineRun {
  pipeline_id: string
  run_type: string
  status: string
  rows_processed: number
  duration_ms: number
  target_date: string | null
  error_message: string | null
  warning: string | null
  created_at: string
}

const PIPELINE_LABELS: Record<string, string> = {
  'ad-dimension': 'Ad Dimension',
  'ad-performance-google': 'Ad Perf — Google',
  'ad-performance-mci-google': 'Ad Perf — MCI Google',
  'ad-performance-mci-meta': 'Ad Perf — MCI Meta',
  'ad-performance-meta': 'Ad Perf — Meta',
  'bridge-page-table': 'Bridge Page Table',
  'campaign-budget': 'Campaign Budget',
  'campaign-dimension': 'Campaign Dimension',
  'ga4-lp-performance': 'GA4 LP Performance',
  'media-buying-changelog': 'Media Buying Changelog',
  'mongodb-conversion': 'MongoDB Conversion',
  'pv3-bsp-conversion': 'PV3 BSP Conversion',
  'pv3-ga4-events': 'PV3 GA4 Events',
  'sales-performance': 'Sales Performance',
  'sales-performance-gol': 'Sales Perf — GOL',
}

function fmtDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`
  return `${(ms / 60_000).toFixed(1)}m`
}

function timeAgo(utcStr: string): string {
  const now = Date.now()
  const then = new Date(utcStr + 'Z').getTime()
  const diff = now - then
  const mins = Math.floor(diff / 60_000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  return `${days}d ago`
}

function isStale(utcStr: string): boolean {
  const then = new Date(utcStr + 'Z').getTime()
  const diff = Date.now() - then
  return diff > 26 * 60 * 60 * 1000 // >26 hours = missed a daily run
}

function fmtDateTime(utcStr: string): string {
  return new Date(utcStr + 'Z').toLocaleString('en-GB', {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false,
  })
}

export function PipelineStatusPage() {
  const { data, isFetching, refetch } = useQuery({
    queryKey: ['pipeline-status'],
    queryFn: async () => {
      const res = await fetch(`${D1_WORKER_URL}/v2/pipeline-status`)
      if (!res.ok) throw new Error()
      return res.json() as Promise<{ latest: PipelineRun[]; history: PipelineRun[] }>
    },
    refetchInterval: 60_000,
  })

  const [selectedPipeline, setSelectedPipeline] = useState<string | null>(null)

  const latest = data?.latest ?? []
  const history = data?.history ?? []

  const allOk = latest.length > 0 && latest.every(p => p.status === 'success' && !isStale(p.created_at))
  const failCount = latest.filter(p => p.status !== 'success').length
  const staleCount = latest.filter(p => p.status === 'success' && isStale(p.created_at)).length

  const filteredHistory = useMemo(() =>
    selectedPipeline ? history.filter(h => h.pipeline_id === selectedPipeline) : history,
    [history, selectedPipeline],
  )

  return (
    <div style={{
      padding: '28px 32px', fontFamily: 'Inter, system-ui, sans-serif', color: '#fff',
      minHeight: '100vh', maxWidth: 1100, fontSize: '85%',
    }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 28 }}>
        <div style={{
          padding: '5px 14px', borderRadius: 20,
          background: allOk ? 'linear-gradient(135deg, #059669, #34d399)' : 'linear-gradient(135deg, #dc2626, #f87171)',
          fontSize: 12, fontWeight: 700, letterSpacing: '0.04em',
          color: '#fff', textTransform: 'uppercase',
        }}>
          {allOk ? '✓ All Systems Operational' : `⚠ ${failCount + staleCount} Issue${failCount + staleCount > 1 ? 's' : ''}`}
        </div>
        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', fontWeight: 500 }}>
          {latest.length} pipelines · Auto-refreshes every 60s
        </div>
        <button
          onClick={() => refetch()}
          style={{
            marginLeft: 'auto', padding: '5px 12px', fontSize: 10, fontWeight: 600,
            borderRadius: 6, border: '1px solid rgba(255,255,255,0.1)',
            background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.6)',
            cursor: 'pointer',
          }}
        >
          {isFetching ? '⟳ Loading…' : '↻ Refresh'}
        </button>
      </div>

      {/* Summary pills */}
      {(failCount > 0 || staleCount > 0) && (
        <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
          {failCount > 0 && (
            <div style={{
              padding: '6px 12px', borderRadius: 8, background: 'rgba(248,113,113,0.12)',
              border: '1px solid rgba(248,113,113,0.25)', fontSize: 11, fontWeight: 600, color: '#f87171',
            }}>
              🔴 {failCount} Failed
            </div>
          )}
          {staleCount > 0 && (
            <div style={{
              padding: '6px 12px', borderRadius: 8, background: 'rgba(251,191,36,0.12)',
              border: '1px solid rgba(251,191,36,0.25)', fontSize: 11, fontWeight: 600, color: '#fbbf24',
            }}>
              🟡 {staleCount} Stale (no run in 26h+)
            </div>
          )}
        </div>
      )}

      {/* Pipeline grid */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
        gap: 14, marginBottom: 32,
      }}>
        {latest.map(p => {
          const ok = p.status === 'success'
          const stale = ok && isStale(p.created_at)
          const sc = !ok ? '#f87171' : stale ? '#fbbf24' : '#34d399'
          const bg = !ok ? 'rgba(248,113,113,0.06)' : stale ? 'rgba(251,191,36,0.04)' : 'rgba(52,211,153,0.03)'
          const border = !ok ? 'rgba(248,113,113,0.2)' : stale ? 'rgba(251,191,36,0.15)' : 'rgba(255,255,255,0.07)'
          const isSelected = selectedPipeline === p.pipeline_id

          return (
            <div
              key={p.pipeline_id}
              onClick={() => setSelectedPipeline(isSelected ? null : p.pipeline_id)}
              style={{
                background: bg, border: `1px solid ${isSelected ? sc : border}`,
                borderRadius: 10, padding: '14px 16px', cursor: 'pointer',
                transition: 'all 0.15s', position: 'relative',
                boxShadow: isSelected ? `0 0 12px ${sc}20` : 'none',
              }}
            >
              {/* Status dot + name */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <div style={{
                  width: 10, height: 10, borderRadius: '50%', background: sc,
                  boxShadow: `0 0 6px ${sc}60`,
                  animation: ok && !stale ? undefined : 'pulse 2s infinite',
                }} />
                <div style={{ fontSize: 12, fontWeight: 700, color: '#fff', flex: 1 }}>
                  {PIPELINE_LABELS[p.pipeline_id] ?? p.pipeline_id}
                </div>
                <div style={{ fontSize: 9, fontWeight: 600, color: sc, textTransform: 'uppercase' }}>
                  {!ok ? 'FAILED' : stale ? 'STALE' : 'OK'}
                </div>
              </div>

              {/* Meta row */}
              <div style={{ display: 'flex', gap: 16, fontSize: 10, color: 'rgba(255,255,255,0.45)', fontWeight: 500 }}>
                <span title="Last run">{timeAgo(p.created_at)}</span>
                <span title="Duration">⏱ {fmtDuration(p.duration_ms)}</span>
                <span title="Rows processed">{p.rows_processed.toLocaleString()} rows</span>
                <span title="Run type" style={{ marginLeft: 'auto', opacity: 0.6 }}>{p.run_type}</span>
              </div>

              {/* Error message if failed */}
              {!ok && p.error_message && (
                <div style={{
                  marginTop: 8, padding: '6px 8px', borderRadius: 6,
                  background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.15)',
                  fontSize: 9, color: '#f87171', lineHeight: 1.4,
                  maxHeight: 60, overflow: 'hidden', textOverflow: 'ellipsis',
                }}>
                  {p.error_message}
                </div>
              )}

              {/* Warning */}
              {p.warning && (
                <div style={{
                  marginTop: 6, fontSize: 9, color: '#fbbf24', opacity: 0.8,
                }}>
                  ⚠ {p.warning}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Run history table */}
      <div style={{
        background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)',
        borderRadius: 12, overflow: 'hidden',
      }}>
        <div style={{
          padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)',
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>
            Run History
          </div>
          {selectedPipeline && (
            <div style={{
              padding: '2px 8px', borderRadius: 4, fontSize: 10, fontWeight: 600,
              background: 'rgba(99,102,241,0.15)', color: '#818cf8', border: '1px solid rgba(99,102,241,0.25)',
            }}>
              {PIPELINE_LABELS[selectedPipeline] ?? selectedPipeline}
              <span
                onClick={(e) => { e.stopPropagation(); setSelectedPipeline(null) }}
                style={{ marginLeft: 6, cursor: 'pointer', opacity: 0.6 }}
              >✕</span>
            </div>
          )}
          <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', marginLeft: 'auto' }}>
            {filteredHistory.length} runs
          </div>
        </div>

        <div style={{ maxHeight: 400, overflowY: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                {['Status', 'Pipeline', 'Type', 'Rows', 'Duration', 'Target Date', 'Ran At'].map(h => (
                  <th key={h} style={{
                    padding: '8px 12px', textAlign: 'left', fontWeight: 700,
                    color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: '0.06em',
                    fontSize: 9, position: 'sticky', top: 0,
                    background: 'rgba(13,14,18,0.95)', backdropFilter: 'blur(8px)',
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredHistory.map((r, i) => {
                const ok = r.status === 'success'
                return (
                  <tr
                    key={`${r.pipeline_id}-${r.created_at}-${i}`}
                    style={{
                      borderBottom: '1px solid rgba(255,255,255,0.03)',
                      background: !ok ? 'rgba(248,113,113,0.04)' : 'transparent',
                    }}
                    onClick={() => setSelectedPipeline(
                      selectedPipeline === r.pipeline_id ? null : r.pipeline_id
                    )}
                  >
                    <td style={{ padding: '7px 12px' }}>
                      <span style={{
                        display: 'inline-block', width: 8, height: 8, borderRadius: '50%',
                        background: ok ? '#34d399' : '#f87171',
                      }} />
                    </td>
                    <td style={{ padding: '7px 12px', fontWeight: 600, color: '#fff' }}>
                      {PIPELINE_LABELS[r.pipeline_id] ?? r.pipeline_id}
                    </td>
                    <td style={{ padding: '7px 12px', color: 'rgba(255,255,255,0.4)' }}>{r.run_type}</td>
                    <td style={{ padding: '7px 12px', color: 'rgba(255,255,255,0.5)', fontWeight: 600 }}>
                      {r.rows_processed.toLocaleString()}
                    </td>
                    <td style={{ padding: '7px 12px', color: 'rgba(255,255,255,0.4)' }}>{fmtDuration(r.duration_ms)}</td>
                    <td style={{ padding: '7px 12px', color: 'rgba(255,255,255,0.35)' }}>{r.target_date ?? '—'}</td>
                    <td style={{ padding: '7px 12px', color: 'rgba(255,255,255,0.4)' }}>{fmtDateTime(r.created_at)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pulse animation */}
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>
    </div>
  )
}
