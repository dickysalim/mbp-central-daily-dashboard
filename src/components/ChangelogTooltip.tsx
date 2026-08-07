import { createPortal } from 'react-dom'
import type { ChangelogRow } from '../types/changelog'

interface ChangelogTooltipProps {
  x: number
  y: number
  entries: ChangelogRow[]
}

/**
 * Shared changelog hover tooltip — portaled to document.body.
 * Shows a truncated preview (3-line clamp) with "Click for full details" hint.
 */
export function ChangelogTooltip({ x, y, entries }: ChangelogTooltipProps) {
  if (entries.length === 0) return null

  return createPortal(
    <div style={{
      position: 'fixed',
      top: (() => { const h = 140; let t = y + 18; if (t + h > window.innerHeight - 8) t = y - h - 8; return Math.max(8, t) })(),
      left: Math.max(8, Math.min(x + 14, window.innerWidth - 280)),
      zIndex: 9999,
      background: 'rgba(10,11,15,0.97)',
      border: '1px solid rgba(251,191,36,0.45)',
      borderRadius: 10,
      padding: '10px 14px',
      maxWidth: 280, maxHeight: 400, overflowY: 'auto' as const,
      pointerEvents: 'none',
      backdropFilter: 'blur(16px)',
      fontFamily: 'Inter, system-ui, sans-serif',
      boxShadow: '0 12px 40px rgba(0,0,0,0.6), 0 0 0 1px rgba(251,191,36,0.1)',
    }}>
      <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', color: '#fbbf24', textTransform: 'uppercase', marginBottom: 5 }}>
        Changelog · {entries[0].date}
        {entries.length > 1 ? ` · ${entries.length} entries` : ''}
      </div>
      {entries.map((entry, idx) => (
        <div key={idx}>
          {idx > 0 && <div style={{ borderTop: '1px solid rgba(251,191,36,0.20)', margin: '8px 0' }} />}
          <div style={{ fontSize: 12, fontWeight: 700, color: '#fff', marginBottom: 4, lineHeight: 1.3 }}>
            {entry.title}
          </div>
          {entry.changelist && (
            <div style={{
              fontSize: 10, color: 'rgba(255,255,255,0.72)', lineHeight: 1.5,
              whiteSpace: 'pre-wrap', wordBreak: 'break-word',
              display: '-webkit-box', WebkitLineClamp: 3,
              WebkitBoxOrient: 'vertical' as const, overflow: 'hidden',
            }}>
              {entry.changelist}
            </div>
          )}
        </div>
      ))}
      <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.35)', marginTop: 6, textAlign: 'center' }}>
        Click for full details
      </div>
    </div>,
    document.body
  )
}
