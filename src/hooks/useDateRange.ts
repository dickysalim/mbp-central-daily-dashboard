/**
 * useDateRange — Date range state hook
 *
 * Manages the selected date range for all dashboard queries.
 * Defaults to the current calendar month (1st → today).
 *
 * Usage:
 *   const { from, to, setFrom, setTo, setPreset } = useDateRange()
 */

import { useState, useCallback } from 'react'
import { startOfMonth, endOfDay, format } from 'date-fns'

const fmt = (d: Date) => format(d, 'yyyy-MM-dd')

export type DateRangePreset = 'thisMonth' | 'lastMonth' | 'last7' | 'last14' | 'last30' | 'custom'

export interface UseDateRangeReturn {
  from: string
  to: string
  preset: DateRangePreset
  setFrom: (date: string) => void
  setTo: (date: string) => void
  setPreset: (preset: DateRangePreset) => void
}

export function useDateRange(): UseDateRangeReturn {
  const today = new Date()
  const [from, setFrom] = useState<string>(fmt(startOfMonth(today)))
  const [to, setTo] = useState<string>(fmt(endOfDay(today)))
  const [preset, setPresetState] = useState<DateRangePreset>('thisMonth')

  const setPreset = useCallback((p: DateRangePreset) => {
    const now = new Date()
    setPresetState(p)

    switch (p) {
      case 'thisMonth':
        setFrom(fmt(startOfMonth(now)))
        setTo(fmt(now))
        break
      case 'lastMonth': {
        const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)
        const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0)
        setFrom(fmt(lastMonth))
        setTo(fmt(endOfLastMonth))
        break
      }
      case 'last7': {
        const d = new Date(now)
        d.setDate(d.getDate() - 6)
        setFrom(fmt(d))
        setTo(fmt(now))
        break
      }
      case 'last14': {
        const d = new Date(now)
        d.setDate(d.getDate() - 13)
        setFrom(fmt(d))
        setTo(fmt(now))
        break
      }
      case 'last30': {
        const d = new Date(now)
        d.setDate(d.getDate() - 29)
        setFrom(fmt(d))
        setTo(fmt(now))
        break
      }
      case 'custom':
        // keep current values; user will set manually
        break
    }
  }, [])

  return { from, to, preset, setFrom, setTo, setPreset }
}
