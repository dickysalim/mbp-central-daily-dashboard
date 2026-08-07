/**
 * Design tokens — shared card typography & layout.
 * Used by all dashboard card components.
 */
export const T = {
  cardTitle: { fontSize: 14, fontWeight: 800, letterSpacing: '-0.02em', color: '#fff' } as const,
  headline:  { fontSize: 24, fontWeight: 800, letterSpacing: '-0.04em', color: '#fff', lineHeight: 1, whiteSpace: 'nowrap' as const },
  section:   { fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', color: 'rgba(255,255,255,0.50)', textTransform: 'uppercase' as const },
  label:     { fontSize: 9,  fontWeight: 600, letterSpacing: '0.09em', color: 'rgba(255,255,255,0.62)', textTransform: 'uppercase' as const },
  tiny:      { fontSize: 9,  fontWeight: 600, color: 'rgba(255,255,255,0.76)', letterSpacing: '0.05em', textTransform: 'uppercase' as const },
  divider:   { borderLeft: '1px solid rgba(255,255,255,0.06)', paddingLeft: 24 } as const,
}
