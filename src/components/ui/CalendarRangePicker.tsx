/**
 * CalendarRangePicker — Custom date range picker with inline calendar
 */

import { useState, useRef, useEffect } from 'react'

interface Props {
  from: string   // 'YYYY-MM-DD'
  to: string
  onChange: (from: string, to: string) => void
}

const DAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function fmtLocal(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function parseLocal(s: string): Date {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}

function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

function displayDate(s: string) {
  if (!s) return '—'
  const d = parseLocal(s)
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`
}

function Calendar({
  year, month,
  rangeFrom, rangeTo, hovered,
  onSelect, onHover,
}: {
  year: number; month: number
  rangeFrom: Date | null; rangeTo: Date | null; hovered: Date | null
  onSelect: (d: Date) => void
  onHover: (d: Date | null) => void
}) {
  const firstDay = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const cells: (Date | null)[] = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => new Date(year, month, i + 1)),
  ]

  const effectiveTo = rangeTo ?? hovered

  return (
    <div>
      <div className="grid grid-cols-7 mb-1">
        {DAYS.map(d => (
          <div key={d} className="text-center text-[10px] text-surface-200/30 font-semibold py-1">{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-y-0.5">
        {cells.map((date, i) => {
          if (!date) return <div key={i} />
          const isStart  = rangeFrom && sameDay(date, rangeFrom)
          const isEnd    = effectiveTo && sameDay(date, effectiveTo)
          const inRange  = rangeFrom && effectiveTo && date > rangeFrom && date < effectiveTo
          const today    = sameDay(date, new Date())

          return (
            <button
              key={i}
              onMouseEnter={() => onHover(date)}
              onMouseLeave={() => onHover(null)}
              onClick={() => onSelect(date)}
              className={[
                'relative text-[11px] h-7 w-full flex items-center justify-center transition-all select-none',
                isStart || isEnd
                  ? 'bg-brand-500 text-white font-bold rounded-lg z-10'
                  : inRange
                  ? 'bg-brand-500/15 text-surface-100 rounded-none'
                  : 'text-surface-200/70 hover:text-white hover:bg-white/8 rounded-lg',
                isStart && effectiveTo && !sameDay(rangeFrom!, effectiveTo) ? 'rounded-r-none' : '',
                isEnd && rangeFrom && !sameDay(rangeFrom, effectiveTo!) ? 'rounded-l-none' : '',
              ].join(' ')}
            >
              {date.getDate()}
              {today && !isStart && !isEnd && (
                <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-brand-400" />
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}

export function CalendarRangePicker({ from, to, onChange }: Props) {
  const [open, setOpen] = useState(false)
  const [rangeFrom, setRangeFrom] = useState<Date | null>(from ? parseLocal(from) : null)
  const [rangeTo, setRangeTo] = useState<Date | null>(to ? parseLocal(to) : null)
  const [hovered, setHovered] = useState<Date | null>(null)
  const [selecting, setSelecting] = useState<'from' | 'to'>('from')

  const now = new Date()
  const [leftYear, setLeftYear] = useState(now.getFullYear())
  const [leftMonth, setLeftMonth] = useState(now.getMonth() - 1 < 0 ? 11 : now.getMonth() - 1)
  const [rightYear, setRightYear] = useState(now.getFullYear())
  const [rightMonth, setRightMonth] = useState(now.getMonth())

  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // Sync external values in
  useEffect(() => {
    setRangeFrom(from ? parseLocal(from) : null)
    setRangeTo(to ? parseLocal(to) : null)
  }, [from, to])

  function handleSelect(date: Date) {
    if (selecting === 'from' || (rangeFrom && rangeTo)) {
      setRangeFrom(date)
      setRangeTo(null)
      setSelecting('to')
    } else {
      if (rangeFrom && date < rangeFrom) {
        setRangeTo(rangeFrom)
        setRangeFrom(date)
      } else {
        setRangeTo(date)
      }
      setSelecting('from')
      // Commit
      const f = rangeFrom && date < rangeFrom ? fmtLocal(date) : fmtLocal(rangeFrom!)
      const t = rangeFrom && date < rangeFrom ? fmtLocal(rangeFrom!) : fmtLocal(date)
      onChange(f, t)
      setTimeout(() => setOpen(false), 120)
    }
  }

  function shiftLeft(dir: -1 | 1) {
    let m = leftMonth + dir
    let y = leftYear
    if (m < 0) { m = 11; y-- }
    if (m > 11) { m = 0; y++ }
    setLeftMonth(m); setLeftYear(y)

    let rm = m + 1
    let ry = y
    if (rm > 11) { rm = 0; ry++ }
    setRightMonth(rm); setRightYear(ry)
  }

  return (
    <div ref={ref} className="relative">
      {/* Trigger */}
      <button
        onClick={() => setOpen(v => !v)}
        className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-[11px] font-semibold border transition-all ${
          open
            ? 'bg-brand-500/15 border-brand-500/40 text-brand-300'
            : 'bg-white/5 border-white/10 text-surface-200/60 hover:text-surface-100 hover:border-white/20'
        }`}
      >
        <svg width="12" height="12" viewBox="0 0 16 16" fill="none" className="shrink-0">
          <rect x="1" y="3" width="14" height="12" rx="2" stroke="currentColor" strokeWidth="1.5" />
          <path d="M5 1v4M11 1v4M1 7h14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
        <span>{from ? displayDate(from) : 'From'}</span>
        <span className="text-surface-200/30">→</span>
        <span>{to ? displayDate(to) : 'To'}</span>
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute top-full right-0 mt-2 z-50 bg-surface-900 border border-white/10 rounded-2xl shadow-2xl p-4 w-[560px]">
          {/* Selecting hint */}
          <p className="text-[10px] text-surface-200/35 mb-3 text-center">
            {selecting === 'from' || (rangeFrom && rangeTo)
              ? 'Select start date'
              : `Start: ${displayDate(fmtLocal(rangeFrom!))} — select end date`}
          </p>

          <div className="grid grid-cols-2 gap-6">
            {/* Left calendar */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <button onClick={() => shiftLeft(-1)} className="w-6 h-6 flex items-center justify-center rounded-lg hover:bg-white/8 text-surface-200/50 hover:text-white transition-colors text-sm">‹</button>
                <span className="text-xs font-semibold text-surface-100">
                  {MONTHS[leftMonth]} {leftYear}
                </span>
                <div className="w-6" />
              </div>
              <Calendar
                year={leftYear} month={leftMonth}
                rangeFrom={rangeFrom} rangeTo={rangeTo} hovered={hovered}
                onSelect={handleSelect} onHover={setHovered}
              />
            </div>

            {/* Right calendar */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <div className="w-6" />
                <span className="text-xs font-semibold text-surface-100">
                  {MONTHS[rightMonth]} {rightYear}
                </span>
                <button onClick={() => shiftLeft(1)} className="w-6 h-6 flex items-center justify-center rounded-lg hover:bg-white/8 text-surface-200/50 hover:text-white transition-colors text-sm">›</button>
              </div>
              <Calendar
                year={rightYear} month={rightMonth}
                rangeFrom={rangeFrom} rangeTo={rangeTo} hovered={hovered}
                onSelect={handleSelect} onHover={setHovered}
              />
            </div>
          </div>

          {/* Footer */}
          {rangeFrom && rangeTo && (
            <div className="mt-4 pt-3 border-t border-white/5 flex items-center justify-between">
              <p className="text-[10px] text-surface-200/40 font-mono">
                {fmtLocal(rangeFrom)} → {fmtLocal(rangeTo)}
              </p>
              <button
                onClick={() => setOpen(false)}
                className="px-3 py-1 rounded-lg bg-brand-500 text-white text-[11px] font-semibold hover:bg-brand-400 transition-colors"
              >
                Apply
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
