/**
 * Rupiah formatting utilities — single source of truth.
 */

/** Rp 1,234,567 */
export const fmtRp = (n: number): string =>
  'Rp ' + Math.round(n).toLocaleString('id-ID')

/** Rp 1.2M / Rp 3.4B / Rp 567K */
export const fmtRpM = (n: number): string => {
  if (n >= 1_000_000_000) return `Rp ${(n / 1_000_000_000).toFixed(1)}B`
  if (n >= 1_000_000)     return `Rp ${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000)         return `Rp ${(n / 1_000).toFixed(1)}K`
  return fmtRp(n)
}

/** 12.3% */
export const fmtPct = (n: number, decimals = 1): string =>
  `${n.toFixed(decimals)}%`

/** Short date: "5 Aug" */
export const shortDate = (d: string): string =>
  new Date(d + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
