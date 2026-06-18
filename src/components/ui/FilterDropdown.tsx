/**
 * FilterDropdown — Single-select and Multi-select dropdown for filter controls
 */

import { useState, useRef, useEffect } from 'react'

// ── Single Select ─────────────────────────────────────────────────────────────

interface SingleSelectProps {
  label: string
  options: string[]
  value: string
  onChange: (v: string) => void
  placeholder?: string
}

export function SingleSelect({ label, options, value, onChange, placeholder = 'Select…' }: SingleSelectProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  return (
    <div ref={ref} className="relative">
      <p className="text-[9px] text-surface-200/30 uppercase tracking-widest font-semibold mb-1">{label}</p>
      <button
        onClick={() => setOpen(v => !v)}
        className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-[11px] font-semibold border transition-all min-w-[110px] ${
          open
            ? 'bg-brand-500/15 border-brand-500/40 text-brand-300'
            : 'bg-white/5 border-white/10 text-surface-200/70 hover:text-surface-100 hover:border-white/20'
        }`}
      >
        <span className="flex-1 text-left truncate">{value || placeholder}</span>
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" className={`shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}>
          <path d="M2 3.5l3 3 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1.5 z-50 bg-surface-800 border border-white/10 rounded-xl shadow-2xl py-1 min-w-[140px] max-h-60 overflow-y-auto">
          {options.map(opt => (
            <button
              key={opt}
              onClick={() => { onChange(opt); setOpen(false) }}
              className={`w-full text-left px-3 py-2 text-[11px] font-medium transition-colors ${
                value === opt
                  ? 'text-brand-300 bg-brand-500/10'
                  : 'text-surface-200/70 hover:text-surface-100 hover:bg-white/5'
              }`}
            >
              {opt}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Multi Select ──────────────────────────────────────────────────────────────

interface MultiSelectProps {
  label: string
  options: string[]
  value: string[]
  onChange: (v: string[]) => void
  placeholder?: string
}

export function MultiSelect({ label, options, value, onChange, placeholder = 'All' }: MultiSelectProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const toggle = (opt: string) => {
    onChange(value.includes(opt) ? value.filter(v => v !== opt) : [...value, opt])
  }

  const displayLabel = value.length === 0
    ? placeholder
    : value.length === 1
    ? value[0]
    : `${value.length} selected`

  return (
    <div ref={ref} className="relative">
      <p className="text-[9px] text-surface-200/30 uppercase tracking-widest font-semibold mb-1">{label}</p>
      <button
        onClick={() => setOpen(v => !v)}
        className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-[11px] font-semibold border transition-all min-w-[130px] ${
          open
            ? 'bg-brand-500/15 border-brand-500/40 text-brand-300'
            : value.length > 0
            ? 'bg-brand-500/8 border-brand-500/25 text-brand-300/80 hover:border-brand-500/40'
            : 'bg-white/5 border-white/10 text-surface-200/70 hover:text-surface-100 hover:border-white/20'
        }`}
      >
        <span className="flex-1 text-left truncate">{displayLabel}</span>
        <div className="flex items-center gap-1">
          {value.length > 0 && (
            <span
              onClick={e => { e.stopPropagation(); onChange([]) }}
              className="w-3.5 h-3.5 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-[8px] text-surface-200/60 hover:text-surface-100 transition-colors cursor-pointer"
            >
              ✕
            </span>
          )}
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" className={`shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}>
            <path d="M2 3.5l3 3 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1.5 z-50 bg-surface-800 border border-white/10 rounded-xl shadow-2xl py-1 min-w-[160px] max-h-72 overflow-y-auto">
          {/* Select all / clear */}
          <div className="flex items-center gap-2 px-3 py-1.5 border-b border-white/5 mb-1">
            <button
              onClick={() => onChange(options)}
              className="text-[10px] text-brand-400/70 hover:text-brand-300 transition-colors font-semibold"
            >
              All
            </button>
            <span className="text-surface-200/20 text-[10px]">·</span>
            <button
              onClick={() => onChange([])}
              className="text-[10px] text-surface-200/40 hover:text-surface-200/70 transition-colors font-semibold"
            >
              Clear
            </button>
          </div>

          {options.map(opt => {
            const checked = value.includes(opt)
            return (
              <button
                key={opt}
                onClick={() => toggle(opt)}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-[11px] font-medium transition-colors hover:bg-white/5 group"
              >
                {/* Checkbox */}
                <span className={`w-3.5 h-3.5 rounded flex items-center justify-center border transition-all shrink-0 ${
                  checked
                    ? 'bg-brand-500 border-brand-500'
                    : 'border-white/20 group-hover:border-white/40'
                }`}>
                  {checked && (
                    <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                      <path d="M1.5 4l2 2 3-3" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  )}
                </span>
                <span className={checked ? 'text-surface-100' : 'text-surface-200/60 group-hover:text-surface-100'}>
                  {opt}
                </span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
