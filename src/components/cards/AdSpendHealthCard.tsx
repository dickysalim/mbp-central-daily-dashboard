/**
 * AdSpendHealthCard — v6
 * Right panel: SVG donut pie (ad spend share) + vertical bar charts (CPRL, CPA CC, CC RoAS)
 */
import { fmtRp as fmtFull, fmtRpM as fmtIDR } from '../../utils/format'
import { SKU_COLORS } from '../../utils/skuColors'

export interface SkuSpendRow { sku: string; spend: number; target: number }
export interface PlatformSpendRow {
  platform: string; label: string; color: string; spend: number
  cprl?: number; cpaCC?: number; ccRoas?: number
}

export interface AdSpendHealthCardProps {
  totalSpend: number
  periodBudget: number
  dailyBudget: number
  campaignBudgetTotal: number
  budgetDate?: string
  skuSpend?: SkuSpendRow[]
  platformBreakdown?: PlatformSpendRow[]
}

const T = {
  cardTitle: { fontSize: 14, fontWeight: 800, letterSpacing: '-0.02em', color: '#fff' } as const,
  section:   { fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase' as const },
  headline:  { fontSize: 24, fontWeight: 800, letterSpacing: '-0.04em', color: '#fff', lineHeight: 1, whiteSpace: 'nowrap' as const },
  metaLabel: { fontSize: 10, fontWeight: 600, color: 'rgba(255,255,255,0.45)', letterSpacing: '0.03em' },
  barTrack:  { height: 4, background: 'rgba(255,255,255,0.07)', borderRadius: 2 } as const,
  pill:      (c: string) => ({
    display: 'inline-flex' as const, alignItems: 'center' as const, gap: 5, marginTop: 6,
    background: `${c}15`, border: `1px solid ${c}30`, borderRadius: 5, padding: '3px 8px',
  }),
  divider: { borderLeft: '1px solid rgba(255,255,255,0.06)', paddingLeft: 28 } as const,
}

// ── SVG Donut Pie with callout arrows ───────────────────────────────────────────
function DonutPie({ data, totalSpend }: { data: PlatformSpendRow[]; totalSpend: number }) {
  // Pie circle is 280x280 in viewBox coords; extra margin handles callout labels
  const CX = 140, CY = 140, R = 108, INNER = 66
  const CALLOUT_R = R + 16
  const CALLOUT_END = R + 40
  let cumAngle = -Math.PI / 2

  const slices = data.map(p => {
    const frac = totalSpend > 0 ? p.spend / totalSpend : 0
    const start = cumAngle
    const end = start + frac * 2 * Math.PI
    cumAngle = end
    return { ...p, frac, start, end, mid: (start + end) / 2 }
  })

  function arc(r: number, start: number, end: number, inner: number) {
    if (Math.abs(end - start) < 0.001) return ''
    const x1 = CX + r * Math.cos(start), y1 = CY + r * Math.sin(start)
    const x2 = CX + r * Math.cos(end),   y2 = CY + r * Math.sin(end)
    const ix1 = CX + inner * Math.cos(end),   iy1 = CY + inner * Math.sin(end)
    const ix2 = CX + inner * Math.cos(start), iy2 = CY + inner * Math.sin(start)
    const large = end - start > Math.PI ? 1 : 0
    return `M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} L ${ix1} ${iy1} A ${inner} ${inner} 0 ${large} 0 ${ix2} ${iy2} Z`
  }

  return (
    // Fixed pixel size = viewBox size, so fonts render at true scale
    <svg width={520} height={260} viewBox="-120 10 520 260" style={{ overflow: 'visible', flexShrink: 0 }}>
      {slices.map(s => {
        const mx = CX + CALLOUT_R * Math.cos(s.mid)
        const my = CY + CALLOUT_R * Math.sin(s.mid)
        const ex = CX + CALLOUT_END * Math.cos(s.mid)
        const ey = CY + CALLOUT_END * Math.sin(s.mid)
        const right = Math.cos(s.mid) > 0
        const lx = ex + (right ? 12 : -12)
        const anchor = right ? 'start' : 'end'
        const tx = lx + (right ? 3 : -3)
        return (
          <g key={s.platform}>
            <path d={arc(R, s.start, s.end, INNER)} fill={s.color} opacity={0.85} stroke="rgba(0,0,0,0.25)" strokeWidth={2} />
            {s.frac > 0.03 && (
              <g>
                <line x1={mx} y1={my} x2={ex} y2={ey} stroke={s.color} strokeWidth={1.2} opacity={0.55} />
                <line x1={ex} y1={ey} x2={lx} y2={ey} stroke={s.color} strokeWidth={1.2} opacity={0.55} />
                <text x={tx} y={ey - 17} fill={s.color} fontSize={12} fontWeight={700} textAnchor={anchor} fontFamily="Inter,sans-serif">{s.label}</text>
                <text x={tx} y={ey - 1}  fill={s.color} fontSize={16} fontWeight={800} textAnchor={anchor} fontFamily="Inter,sans-serif">{(s.frac * 100).toFixed(1)}%</text>
                <text x={tx} y={ey + 15} fill={s.color} fontSize={12} fontWeight={500} textAnchor={anchor} opacity={0.65} fontFamily="Inter,sans-serif">{fmtIDR(s.spend)}</text>
              </g>
            )}
          </g>
        )
      })}
      <text x={CX} y={CY - 12} textAnchor="middle" fill="rgba(255,255,255,0.4)" fontSize={13} fontWeight={600} fontFamily="Inter,sans-serif">Total</text>
      <text x={CX} y={CY + 14} textAnchor="middle" fill="rgba(255,255,255,0.9)" fontSize={18} fontWeight={800} fontFamily="Inter,sans-serif">{fmtIDR(totalSpend)}</text>
    </svg>
  )
}

// ── Vertical bar chart (SVG) for a metric ─────────────────────────────────
function MetricBarChart({
  label, platforms, getValue, lowerIsBetter, fmt,
}: {
  label: string
  platforms: PlatformSpendRow[]
  getValue: (p: PlatformSpendRow) => number
  lowerIsBetter: boolean
  fmt: (v: number) => string
}) {
  const BAR_MAX_H = 160
  const LABEL_H   = 28
  const PLAT_H    = 18
  const SVG_H     = LABEL_H + BAR_MAX_H + PLAT_H

  const values = platforms
    .map(p => ({ platform: p.platform, color: p.color, v: getValue(p) }))
    .filter(x => x.v > 0)
  if (values.length === 0) return null

  const maxV = Math.max(...values.map(x => x.v))
  const best = lowerIsBetter
    ? values.reduce((a, b) => a.v < b.v ? a : b).platform
    : values.reduce((a, b) => a.v > b.v ? a : b).platform

  // Always scale from 0 → maxV, no inversion. Lower bar = lower value.
  const barH = (v: number) => maxV > 0 ? Math.max(6, Math.round((v / maxV) * BAR_MAX_H)) : 6

  // Each bar gets equal share of the available width
  const n = values.length

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, height: '100%', alignItems: 'center' }}>
      <svg width="100%" height={SVG_H} viewBox={`0 0 ${n * 100} ${SVG_H}`} preserveAspectRatio="xMidYMid meet" style={{ overflow: 'visible' }}>
        {/* Baseline */}
        <line x1={0} y1={LABEL_H + BAR_MAX_H} x2={n * 100} y2={LABEL_H + BAR_MAX_H} stroke="rgba(255,255,255,0.06)" strokeWidth={1} />
        {values.map((x, i) => {
          const h = barH(x.v)
          const cx = i * 100 + 50  // centre of each slot
          const bw = 44
          const bx = cx - bw / 2
          const by = LABEL_H + BAR_MAX_H - h
          const isBest = x.platform === best
          return (
            <g key={x.platform}>
              {/* Value above bar */}
              <text x={cx} y={by - 6} textAnchor="middle" fontFamily="Inter,sans-serif" fontSize={12} fontWeight={800} fill={isBest ? x.color : 'rgba(255,255,255,0.55)'}>{fmt(x.v)}</text>
              {/* BEST badge */}
              {isBest && <text x={cx} y={by - 20} textAnchor="middle" fontSize={9} fontWeight={700} fill={x.color} fontFamily="Inter,sans-serif">BEST</text>}
              {/* Bar */}
              <rect x={bx} y={by} width={bw} height={h} rx={4} fill={isBest ? x.color : `${x.color}50`} stroke={isBest ? x.color : 'none'} strokeWidth={0.5} />
              {/* Platform name */}
              <text x={cx} y={LABEL_H + BAR_MAX_H + 14} textAnchor="middle" fontFamily="Inter,sans-serif" fontSize={11} fontWeight={600} fill={x.color} opacity={0.8}>{x.platform}</text>
            </g>
          )
        })}
      </svg>
      <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.06em', color: 'rgba(255,255,255,0.50)', textTransform: 'uppercase', textAlign: 'center' }}>{label}</div>
    </div>
  )
}

// ── Main card ───────────────────────────────────────────────────────────────
export function AdSpendHealthCard({
  totalSpend, periodBudget, dailyBudget, campaignBudgetTotal, budgetDate,
  skuSpend = [], platformBreakdown,
}: AdSpendHealthCardProps) {
  const pct    = periodBudget > 0 ? Math.min((totalSpend / periodBudget) * 100, 100) : 0
  const color  = pct === 0 ? '#818cf8' : pct > 115 ? '#f87171' : pct >= 105 ? '#fbbf24' : pct >= 95 ? '#34d399' : pct >= 85 ? '#fbbf24' : '#f87171'
  const label  = pct === 0 ? 'No Data' : pct > 115 ? '🔴 Over Budget' : pct >= 105 ? '🟡 Slightly Over' : pct >= 95 ? '🟢 On Track' : pct >= 85 ? '🟡 Slightly Under' : '🔴 Far Behind'
  const delta    = campaignBudgetTotal > 0 && dailyBudget > 0 ? campaignBudgetTotal - dailyBudget : 0
  const deltaPct = dailyBudget > 0 ? (delta / dailyBudget) * 100 : 0

  return (
    <div style={{
      flex: '1 1 340px', minWidth: 0,
      background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)',
      borderRadius: 14, padding: '20px 24px',
    }}>
      {platformBreakdown && platformBreakdown.length > 0 ? (
        /* ── Platform mode: single horizontal row ── */
        <div style={{ display: 'flex', gap: 0, alignItems: 'stretch' }}>

          {/* Col 1 — Ad Spend Health */}
          <div style={{ flex: '0 0 auto', minWidth: 170, paddingRight: 24, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={T.section}>Ad Spend Health</div>
            <div style={{ ...T.headline, fontSize: 20 }}>{fmtFull(Math.round(totalSpend))}</div>
            {periodBudget > 0 && (
              <>
                <div style={{ ...T.metaLabel }}>Target {fmtFull(Math.round(periodBudget))}</div>
                <div style={{ ...T.barTrack, marginTop: 2 }}>
                  <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 2, transition: 'width 0.5s ease' }} />
                </div>
                <div style={T.pill(color)}>
                  <div style={{ width: 5, height: 5, borderRadius: '50%', background: color }} />
                  <span style={{ fontSize: 11, fontWeight: 700, color }}>{label}</span>
                  <span style={{ fontSize: 11, color, opacity: 0.8 }}>{(totalSpend / periodBudget * 100).toFixed(1)}%</span>
                </div>
              </>
            )}
            {(campaignBudgetTotal > 0 || dailyBudget > 0) && (
              <div style={{ borderTop: '1px solid rgba(255,255,255,0.09)', paddingTop: 8, marginTop: 4 }}>
                <div style={T.section}>Daily Budget / Target</div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginTop: 4 }}>
                  <span style={{ fontSize: 13, fontWeight: 800, color: '#fff', letterSpacing: '-0.02em' }}>{fmtIDR(campaignBudgetTotal)}</span>
                  <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', fontWeight: 600 }}>/</span>
                  <span style={{ fontSize: 13, fontWeight: 800, color: 'rgba(255,255,255,0.7)', letterSpacing: '-0.02em' }}>{fmtIDR(dailyBudget)}</span>
                </div>
                {campaignBudgetTotal > 0 && dailyBudget > 0 && (
                  <div style={{ fontSize: 10, marginTop: 3, fontWeight: 600, color: delta < 0 ? '#f87171' : '#34d399' }}>
                    {delta < 0 ? '▼' : '▲'} {fmtIDR(Math.abs(delta))} ({Math.abs(deltaPct).toFixed(1)}%) {delta < 0 ? 'below' : 'above'} target
                  </div>
                )}
                {budgetDate && <div style={{ ...T.metaLabel, marginTop: 3 }}>as of {budgetDate}</div>}
              </div>
            )}
          </div>

          {/* Col 2 — Donut pie */}
          <div style={{ borderLeft: '1px solid rgba(255,255,255,0.06)', paddingLeft: 24, paddingRight: 24, display: 'flex', flexDirection: 'column', gap: 8, flex: '0 0 auto' }}>
            <div style={T.section}>Ad Spend Share</div>
            <DonutPie data={platformBreakdown} totalSpend={totalSpend} />
          </div>

          {/* Col 3 — CPRL bar */}
          <div style={{ borderLeft: '1px solid rgba(255,255,255,0.06)', paddingLeft: 16, paddingRight: 8, flex: '1 1 0' }}>
            <MetricBarChart
              label="CPRL"
              platforms={platformBreakdown}
              getValue={p => p.cprl ?? 0}
              lowerIsBetter={true}
              fmt={v => fmtIDR(Math.round(v))}
            />
          </div>

          {/* Col 4 — CPA CC bar */}
          <div style={{ borderLeft: '1px solid rgba(255,255,255,0.06)', paddingLeft: 16, paddingRight: 8, flex: '1 1 0' }}>
            <MetricBarChart
              label="CPA CC"
              platforms={platformBreakdown}
              getValue={p => p.cpaCC ?? 0}
              lowerIsBetter={true}
              fmt={v => fmtIDR(Math.round(v))}
            />
          </div>

          {/* Col 5 — CC RoAS bar */}
          <div style={{ borderLeft: '1px solid rgba(255,255,255,0.06)', paddingLeft: 16, flex: '1 1 0' }}>
            <MetricBarChart
              label="CC RoAS"
              platforms={platformBreakdown}
              getValue={p => p.ccRoas ?? 0}
              lowerIsBetter={false}
              fmt={v => v.toFixed(2) + '×'}
            />
          </div>

        </div>
      ) : (
        /* ── SKU mode: original stacked layout ── */
        <>
          <div style={{ ...T.cardTitle, marginBottom: 16 }}>Ad Spend Health</div>
          <div style={{ display: 'flex', gap: 32, alignItems: 'flex-start' }}>
            <div style={{ flex: '0 0 auto', minWidth: 190, display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <div style={T.section}>Total Ad Spend</div>
                <div style={{ ...T.headline, marginTop: 6 }}>{fmtFull(Math.round(totalSpend))}</div>
                {periodBudget > 0 && (
                  <>
                    <div style={{ ...T.metaLabel, marginTop: 6 }}>Target {fmtFull(Math.round(periodBudget))}</div>
                    <div style={{ ...T.barTrack, marginTop: 5 }}>
                      <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 2, transition: 'width 0.5s ease' }} />
                    </div>
                    <div style={T.pill(color)}>
                      <div style={{ width: 5, height: 5, borderRadius: '50%', background: color }} />
                      <span style={{ fontSize: 11, fontWeight: 700, color }}>{label}</span>
                      <span style={{ fontSize: 11, color, opacity: 0.8 }}>{(periodBudget > 0 ? (totalSpend / periodBudget) * 100 : 0).toFixed(1)}%</span>
                    </div>
                  </>
                )}
              </div>
              {(campaignBudgetTotal > 0 || dailyBudget > 0) && (
                <div style={{ borderTop: '1px solid rgba(255,255,255,0.09)', paddingTop: 10 }}>
                  <div style={T.section}>Daily Budget / Target</div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 5, marginTop: 5 }}>
                    <span style={{ fontSize: 15, fontWeight: 800, color: '#fff', letterSpacing: '-0.02em' }}>{fmtIDR(campaignBudgetTotal)}</span>
                    <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)', fontWeight: 600 }}>/</span>
                    <span style={{ fontSize: 15, fontWeight: 800, color: 'rgba(255,255,255,0.8)', letterSpacing: '-0.02em' }}>{fmtIDR(dailyBudget)}</span>
                  </div>
                  {campaignBudgetTotal > 0 && dailyBudget > 0 && (
                    <div style={{ fontSize: 10, marginTop: 4, fontWeight: 600, color: delta < 0 ? '#f87171' : '#34d399' }}>
                      {delta < 0 ? '▼' : '▲'} {fmtIDR(Math.abs(delta))} ({Math.abs(deltaPct).toFixed(1)}%) {delta < 0 ? 'below' : 'above'} target
                    </div>
                  )}
                  {budgetDate && <div style={{ ...T.metaLabel, marginTop: 4 }}>as of {budgetDate}</div>}
                </div>
              )}
            </div>
            {skuSpend.length > 0 && (
              <div style={{ flex: '1 1 auto', borderLeft: '1px solid rgba(255,255,255,0.06)', paddingLeft: 24, display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={T.section}>Breakdown by Product</div>
                {skuSpend.map(s => {
                  const skuColor = SKU_COLORS[s.sku] ?? 'rgba(255,255,255,0.68)'
                  const skuDelta = s.spend - s.target
                  const skuDeltaPct = s.target > 0 ? (skuDelta / s.target) * 100 : 0
                  const barPct = s.target > 0 ? Math.min((s.spend / s.target) * 100, 100) : 0
                  const dc = s.target === 0 ? 'rgba(255,255,255,0.4)' : Math.abs(skuDeltaPct) <= 10 ? '#34d399' : Math.abs(skuDeltaPct) <= 20 ? '#fbbf24' : '#f87171'
                  return (
                    <div key={s.sku}>
                      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 4 }}>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                          <span style={{ fontSize: 13, fontWeight: 700, color: skuColor }}>{s.sku}</span>
                          <span style={{ fontSize: 10, fontWeight: 600, color: 'rgba(255,255,255,0.45)' }}>{fmtIDR(s.spend)}</span>
                        </div>
                        {s.target > 0 && <span style={{ fontSize: 13, fontWeight: 800, color: dc }}>{skuDelta >= 0 ? '+' : ''}{skuDeltaPct.toFixed(0)}%</span>}
                      </div>
                      {s.target > 0 && (
                        <div style={T.barTrack}>
                          <div style={{ height: '100%', width: `${barPct}%`, background: dc, borderRadius: 2, transition: 'width 0.4s ease' }} />
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
