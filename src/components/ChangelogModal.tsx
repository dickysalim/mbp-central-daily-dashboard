import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import type { ChangelogRow } from '../types/changelog'

interface ChangelogModalProps {
  entries: ChangelogRow[]
  onClose: () => void
}

export function ChangelogModal({ entries, onClose }: ChangelogModalProps) {
  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  if (entries.length === 0) return null

  return createPortal(
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 10000,
        background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(6px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: 'Inter, system-ui, sans-serif',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'rgba(13,14,20,0.98)',
          border: '1px solid rgba(251,191,36,0.35)',
          borderRadius: 14, padding: '20px 24px',
          maxWidth: 420, width: '92vw',
          maxHeight: '70vh', overflowY: 'auto',
          boxShadow: '0 24px 80px rgba(0,0,0,0.7), 0 0 0 1px rgba(251,191,36,0.08)',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', color: '#fbbf24', textTransform: 'uppercase' }}>
            Changelog · {entries[0].date}
            {entries.length > 1 ? ` · ${entries.length} entries` : ''}
          </div>
          <button
            onClick={onClose}
            style={{
              all: 'unset', cursor: 'pointer',
              width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center',
              borderRadius: 6, background: 'rgba(255,255,255,0.06)',
              color: 'rgba(255,255,255,0.5)', fontSize: 14, fontWeight: 700,
            }}
          >
            ✕
          </button>
        </div>

        {/* Entries */}
        {entries.map((entry, idx) => (
          <div key={idx}>
            {idx > 0 && <div style={{ borderTop: '1px solid rgba(251,191,36,0.15)', margin: '14px 0' }} />}

            {/* Platform + SKU tags */}
            <div style={{ display: 'flex', gap: 6, marginBottom: 6, flexWrap: 'wrap' }}>
              {entry.platform && (
                <span style={{
                  fontSize: 9, fontWeight: 700, letterSpacing: '0.08em',
                  padding: '2px 6px', borderRadius: 4,
                  background: 'rgba(129,140,248,0.15)', color: '#818cf8',
                  textTransform: 'uppercase',
                }}>
                  {entry.platform}
                </span>
              )}
              {(entry.sku ?? '').trim() !== '' && (
                <span style={{
                  fontSize: 9, fontWeight: 700, letterSpacing: '0.08em',
                  padding: '2px 6px', borderRadius: 4,
                  background: 'rgba(52,211,153,0.15)', color: '#34d399',
                }}>
                  SKU: {entry.sku}
                </span>
              )}
            </div>

            {/* Title */}
            <div style={{ fontSize: 14, fontWeight: 700, color: '#fff', marginBottom: 8, lineHeight: 1.35 }}>
              {entry.title}
            </div>

            {/* Full changelist */}
            {entry.changelist && (
              <div style={{
                fontSize: 12, color: 'rgba(255,255,255,0.75)',
                lineHeight: 1.7, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
              }}>
                {entry.changelist}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>,
    document.body
  )
}
