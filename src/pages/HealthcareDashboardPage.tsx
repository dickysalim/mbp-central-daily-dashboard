/**
 * HealthcareDashboardPage — MCI-only business dashboard
 * Currently empty — placeholder for future healthcare metrics
 */

const F: React.CSSProperties = { fontFamily: 'Inter, system-ui, sans-serif' }

export function HealthcareDashboardPage() {
  return (
    <div style={{
      minHeight: '100vh',
      background: '#0d0e12',
      padding: '32px 32px 80px',
      color: '#ffffff',
      zoom: 0.8,
      ...F,
    }}>
      {/* ── Toolbar ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 40, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginRight: 8 }}>
          <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#34d399', boxShadow: '0 0 6px #34d399aa' }} />
          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', color: '#34d399', textTransform: 'uppercase' }}>
            Healthcare Dashboard
          </span>
        </div>

        {/* Brand — MCI only */}
        <div style={{
          background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: 8, color: 'rgba(255,255,255,0.85)', padding: '6px 12px', fontSize: 13, fontWeight: 600,
        }}>
          MCI
        </div>
      </div>

      {/* ── Empty state ── */}
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        minHeight: 400, gap: 16,
      }}>
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.12)"
          strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
        </svg>
        <div style={{ fontSize: 15, fontWeight: 700, color: 'rgba(255,255,255,0.25)', letterSpacing: '-0.01em' }}>
          Healthcare Dashboard
        </div>
        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.15)', textAlign: 'center', maxWidth: 280, lineHeight: 1.6 }}>
          MCI-specific metrics and charts will appear here.
        </div>
      </div>
    </div>
  )
}
