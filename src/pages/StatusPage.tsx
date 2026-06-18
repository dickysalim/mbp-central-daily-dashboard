/**
 * StatusPage — Funnel Health Prototype
 * Answers: Awareness problem? Engagement problem? Offer/CVR problem?
 */

import { useMemo, useState } from 'react'
import { usePerformanceData } from '../hooks/usePerformanceData'

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmtLocal = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

function getMTDRange() {
  const now = new Date()
  now.setDate(now.getDate() - 1)
  const from = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
  const to = fmtLocal(now)
  return { from, to }
}

function getPreviousPeriod(from: string, to: string) {
  const f = new Date(from + 'T00:00:00')
  const t = new Date(to + 'T00:00:00')
  const days = Math.round((t.getTime() - f.getTime()) / 86400000) + 1
  const prevTo = new Date(f); prevTo.setDate(prevTo.getDate() - 1)
  const prevFrom = new Date(prevTo); prevFrom.setDate(prevFrom.getDate() - (days - 1))
  return { from: fmtLocal(prevFrom), to: fmtLocal(prevTo) }
}

function getPreviousMonth(from: string, to: string) {
  const shift = (s: string) => {
    const d = new Date(s + 'T00:00:00')
    const ty = d.getMonth() === 0 ? d.getFullYear() - 1 : d.getFullYear()
    const tm = d.getMonth() === 0 ? 11 : d.getMonth() - 1
    const last = new Date(ty, tm + 1, 0).getDate()
    return fmtLocal(new Date(ty, tm, Math.min(d.getDate(), last)))
  }
  return { from: shift(from), to: shift(to) }
}

type CompMode = 'previous_period' | 'previous_month'

const fmtNum = (v: number) =>
  v >= 1e6 ? `${(v / 1e6).toFixed(2)}M`
  : v >= 1e3 ? `${(v / 1e3).toFixed(1)}K`
  : v.toLocaleString()

const fmtPct = (v: number) => `${(v * 100).toFixed(1)}%`
const fmtIDR = (v: number) =>
  new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(v)

// ── Delta badge ───────────────────────────────────────────────────────────────

function Delta({ curr, prev, invert = false }: { curr: number; prev: number; invert?: boolean }) {
  if (!prev) return <span className="text-surface-200/25 text-[10px]">—</span>
  const pct = ((curr - prev) / prev) * 100
  const up = pct >= 0
  const good = invert ? !up : up
  return (
    <span className={`text-[10px] font-semibold tabular-nums ${good ? 'text-emerald-400' : 'text-red-400'}`}>
      {up ? '▲' : '▼'} {Math.abs(pct).toFixed(1)}%
    </span>
  )
}

// ── Funnel Stage types ────────────────────────────────────────────────────────

interface FunnelStage {
  key: string
  label: string
  value: number
  prevValue: number
  convRate?: number       // rate FROM previous stage to this stage
  prevConvRate?: number
  color: string
  isRate?: boolean        // display value as % instead of number
}

// ── Waterfall component ───────────────────────────────────────────────────────

function FunnelWaterfall({ stages }: { stages: FunnelStage[] }) {
  const maxVal = Math.max(...stages.map(s => s.value), 1)

  return (
    <div className="space-y-0">
      {stages.map((stage, i) => {
        const pct = stage.value / maxVal
        const rateUp = stage.convRate !== undefined && stage.prevConvRate !== undefined
          ? stage.convRate >= stage.prevConvRate
          : null
        const valUp = stage.prevValue ? stage.value >= stage.prevValue : null

        return (
          <div key={stage.key} className="group">
            {/* Conversion rate arrow between stages */}
            {i > 0 && stage.convRate !== undefined && (
              <div className="flex items-center gap-3 py-1.5 pl-4">
                <div className="flex items-center gap-1.5">
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none"
                    className={rateUp === true ? 'text-emerald-400' : rateUp === false ? 'text-red-400' : 'text-surface-200/20'}>
                    <path d="M6 2v8M3 7l3 3 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  <span className={`text-[11px] font-mono font-semibold ${
                    rateUp === true ? 'text-emerald-400' : rateUp === false ? 'text-red-400' : 'text-surface-200/30'
                  }`}>
                    {fmtPct(stage.convRate)}
                  </span>
                  <span className="text-[10px] text-surface-200/25">{stage.key}</span>
                  {stage.prevConvRate !== undefined && (
                    <span className="text-[10px] text-surface-200/20 font-mono">
                      prev {fmtPct(stage.prevConvRate)}
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* Stage bar */}
            <div className="flex items-center gap-4 px-4 py-2.5 rounded-xl hover:bg-white/3 transition-colors">
              {/* Label */}
              <div className="w-28 shrink-0">
                <p className="text-[11px] font-semibold text-surface-200/60 uppercase tracking-wider">{stage.label}</p>
              </div>

              {/* Bar */}
              <div className="flex-1 relative h-9 flex items-center">
                {/* Background track */}
                <div className="absolute inset-y-0 left-0 right-0 rounded-lg bg-white/3" />
                {/* Filled bar */}
                <div
                  className="absolute inset-y-1 left-0 rounded-md transition-all duration-500"
                  style={{
                    width: `${Math.max(pct * 100, 0.5)}%`,
                    background: stage.color,
                    opacity: 0.85,
                  }}
                />
                {/* Value on bar */}
                <span className="relative z-10 pl-3 text-[12px] font-bold font-mono text-white drop-shadow">
                  {stage.isRate ? fmtPct(stage.value) : fmtNum(stage.value)}
                </span>
              </div>

              {/* Delta */}
              <div className="w-20 shrink-0 text-right">
                <Delta curr={stage.value} prev={stage.prevValue} invert={stage.isRate === false} />
                {stage.prevValue > 0 && (
                  <p className="text-[9px] text-surface-200/20 font-mono mt-0.5">
                    prev {stage.isRate ? fmtPct(stage.prevValue) : fmtNum(stage.prevValue)}
                  </p>
                )}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── Diagnostic signal card ────────────────────────────────────────────────────

type Health = 'healthy' | 'watch' | 'action'

interface Signal {
  label: string
  value: string
  curr: number
  prev: number
  invert?: boolean
}

function DiagnosticCard({
  title, icon, signals, description,
}: {
  title: string
  icon: React.ReactNode
  signals: Signal[]
  description: string
}) {
  const declining = signals.filter(s => s.prev > 0 && s.curr < s.prev).length
  const health: Health = declining === 0 ? 'healthy' : declining === 1 ? 'watch' : 'action'

  const healthStyle = {
    healthy: { border: 'border-emerald-500/20', bg: 'bg-emerald-500/5', badge: 'bg-emerald-500/15 text-emerald-400', label: '✅ Healthy' },
    watch:   { border: 'border-amber-500/20',   bg: 'bg-amber-500/5',   badge: 'bg-amber-500/15 text-amber-400',   label: '⚠ Watch' },
    action:  { border: 'border-red-500/20',      bg: 'bg-red-500/5',     badge: 'bg-red-500/15 text-red-400',       label: '🔴 Action Needed' },
  }[health]

  return (
    <div className={`rounded-2xl border ${healthStyle.border} ${healthStyle.bg} p-5 flex flex-col gap-4`}>
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2">
          <span className="text-surface-200/50">{icon}</span>
          <p className="text-xs font-bold text-surface-100 uppercase tracking-wider">{title}</p>
        </div>
        <span className={`text-[10px] font-bold px-2 py-1 rounded-lg ${healthStyle.badge}`}>
          {healthStyle.label}
        </span>
      </div>

      <p className="text-[11px] text-surface-200/40 leading-relaxed">{description}</p>

      <div className="space-y-2">
        {signals.map(sig => (
          <div key={sig.label} className="flex items-center justify-between">
            <span className="text-[11px] text-surface-200/50">{sig.label}</span>
            <div className="flex items-center gap-2">
              <span className="text-[12px] font-mono font-semibold text-surface-100">{sig.value}</span>
              <Delta curr={sig.curr} prev={sig.prev} invert={sig.invert} />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Page ─────────────────────────────────────────────────────────────────────

export function StatusPage() {
  const [compMode, setCompMode] = useState<CompMode>('previous_period')
  const { from, to } = getMTDRange()
  const { from: prevFrom, to: prevTo } = compMode === 'previous_month'
    ? getPreviousMonth(from, to)
    : getPreviousPeriod(from, to)

  const { data: curr = [], isLoading } = usePerformanceData({ from, to, brand: ['MNC'] })
  const { data: prev = [] } = usePerformanceData({ from: prevFrom, to: prevTo, brand: ['MNC'] })

  // ── Aggregate current + previous ──────────────────────────────────────────
  const agg = useMemo(() => {
    const sum = (rows: typeof curr) => ({
      ad_spend:        rows.reduce((s, r) => s + (r.ad_spend ?? 0), 0),
      impressions:     rows.reduce((s, r) => s + (r.impressions ?? 0), 0),
      link_clicks:     rows.reduce((s, r) => s + (r.link_clicks ?? 0), 0),
      lp_view:         rows.reduce((s, r) => s + (r.lp_view ?? 0), 0),
      view_offer:      rows.reduce((s, r) => s + (r.view_offer ?? 0), 0),
      real_lead_cc:    rows.reduce((s, r) => s + (r.real_lead_cc ?? 0), 0),
      real_lead_dp:    rows.reduce((s, r) => s + (r.real_lead_dp ?? 0), 0),
      real_lead_mp:    rows.reduce((s, r) => s + (r.real_lead_mp ?? 0), 0),
      lead_dispatch_dp:rows.reduce((s, r) => s + (r.lead_dispatch_dp ?? 0), 0),
      lead_dispatch_mp:rows.reduce((s, r) => s + (r.lead_dispatch_mp ?? 0), 0),
      sale_cc:         rows.reduce((s, r) => s + (r.sale_cc ?? 0), 0),
      revenue_cc:      rows.reduce((s, r) => s + (r.revenue_cc ?? 0), 0),
    })
    const c = sum(curr)
    const p = sum(prev)
    const real_leads     = c.real_lead_cc + c.real_lead_dp + c.real_lead_mp
    const prev_real_leads = p.real_lead_cc + p.real_lead_dp + p.real_lead_mp
    return { c, p, real_leads, prev_real_leads }
  }, [curr, prev])

  const { c, p, real_leads, prev_real_leads } = agg

  // ── Funnel stages ─────────────────────────────────────────────────────────
  const sharedFunnel: FunnelStage[] = [
    {
      key: 'impressions', label: 'Impressions',
      value: c.impressions, prevValue: p.impressions,
      color: 'linear-gradient(90deg, #818cf8, #6366f1)',
    },
    {
      key: 'CTR', label: 'Link Clicks',
      value: c.link_clicks, prevValue: p.link_clicks,
      convRate:     c.impressions ? c.link_clicks / c.impressions : 0,
      prevConvRate: p.impressions ? p.link_clicks / p.impressions : 0,
      color: 'linear-gradient(90deg, #38bdf8, #0ea5e9)',
    },
    {
      key: 'OCLP', label: 'LP View',
      value: c.lp_view, prevValue: p.lp_view,
      convRate:     c.link_clicks ? c.lp_view / c.link_clicks : 0,
      prevConvRate: p.link_clicks ? p.lp_view / p.link_clicks : 0,
      color: 'linear-gradient(90deg, #34d399, #10b981)',
    },
    {
      key: 'LPVO', label: 'View Offer',
      value: c.view_offer, prevValue: p.view_offer,
      convRate:     c.lp_view ? c.view_offer / c.lp_view : 0,
      prevConvRate: p.lp_view ? p.view_offer / p.lp_view : 0,
      color: 'linear-gradient(90deg, #fbbf24, #f59e0b)',
    },
    {
      key: 'VO2L', label: 'Real Leads',
      value: real_leads, prevValue: prev_real_leads,
      convRate:     c.view_offer ? real_leads / c.view_offer : 0,
      prevConvRate: p.view_offer ? prev_real_leads / p.view_offer : 0,
      color: 'linear-gradient(90deg, #f97316, #ea580c)',
    },
  ]

  const ciFunnel: FunnelStage[] = [
    {
      key: 'CI RL', label: 'CI Leads',
      value: c.real_lead_cc, prevValue: p.real_lead_cc,
      convRate:     real_leads ? c.real_lead_cc / real_leads : 0,
      prevConvRate: prev_real_leads ? p.real_lead_cc / prev_real_leads : 0,
      color: 'linear-gradient(90deg, #4f8df5, #3b82f6)',
    },
    {
      key: 'CI CVR', label: 'CI Txn',
      value: c.sale_cc, prevValue: p.sale_cc,
      convRate:     c.real_lead_cc ? c.sale_cc / c.real_lead_cc : 0,
      prevConvRate: p.real_lead_cc ? p.sale_cc / p.real_lead_cc : 0,
      color: 'linear-gradient(90deg, #818cf8, #6366f1)',
    },
  ]

  const dpFunnel: FunnelStage[] = [
    {
      key: 'DP RL', label: 'DP Leads',
      value: c.real_lead_dp, prevValue: p.real_lead_dp,
      convRate:     real_leads ? c.real_lead_dp / real_leads : 0,
      prevConvRate: prev_real_leads ? p.real_lead_dp / prev_real_leads : 0,
      color: 'linear-gradient(90deg, #34d399, #10b981)',
    },
    {
      key: 'DP LEDI', label: 'DP Dispatch',
      value: c.lead_dispatch_dp, prevValue: p.lead_dispatch_dp,
      convRate:     c.real_lead_dp ? c.lead_dispatch_dp / c.real_lead_dp : 0,
      prevConvRate: p.real_lead_dp ? p.lead_dispatch_dp / p.real_lead_dp : 0,
      color: 'linear-gradient(90deg, #6ee7b7, #34d399)',
    },
  ]

  const mpFunnel: FunnelStage[] = [
    {
      key: 'MP RL', label: 'MP Leads',
      value: c.real_lead_mp, prevValue: p.real_lead_mp,
      convRate:     real_leads ? c.real_lead_mp / real_leads : 0,
      prevConvRate: prev_real_leads ? p.real_lead_mp / prev_real_leads : 0,
      color: 'linear-gradient(90deg, #fbbf24, #f59e0b)',
    },
    {
      key: 'MP LEDI', label: 'MP Dispatch',
      value: c.lead_dispatch_mp, prevValue: p.lead_dispatch_mp,
      convRate:     c.real_lead_mp ? c.lead_dispatch_mp / c.real_lead_mp : 0,
      prevConvRate: p.real_lead_mp ? p.lead_dispatch_mp / p.real_lead_mp : 0,
      color: 'linear-gradient(90deg, #fde68a, #fbbf24)',
    },
  ]

  // ── Diagnostic signals ────────────────────────────────────────────────────
  const ctr  = c.impressions ? c.link_clicks / c.impressions : 0
  const pCtr = p.impressions ? p.link_clicks / p.impressions : 0
  const oclp = c.link_clicks ? c.lp_view / c.link_clicks : 0
  const pOclp = p.link_clicks ? p.lp_view / p.link_clicks : 0
  const lpvo = c.lp_view ? c.view_offer / c.lp_view : 0
  const pLpvo = p.lp_view ? p.view_offer / p.lp_view : 0
  const vo2l = c.view_offer ? real_leads / c.view_offer : 0
  const pVo2l = p.view_offer ? prev_real_leads / p.view_offer : 0
  const ciCvr = c.real_lead_cc ? c.sale_cc / c.real_lead_cc : 0
  const pCiCvr = p.real_lead_cc ? p.sale_cc / p.real_lead_cc : 0
  const dpLedi = c.real_lead_dp ? c.lead_dispatch_dp / c.real_lead_dp : 0
  const pDpLedi = p.real_lead_dp ? p.lead_dispatch_dp / p.real_lead_dp : 0
  const mpLedi = c.real_lead_mp ? c.lead_dispatch_mp / c.real_lead_mp : 0
  const pMpLedi = p.real_lead_mp ? p.lead_dispatch_mp / p.real_lead_mp : 0
  const cpm  = c.impressions ? (c.ad_spend / c.impressions) * 1000 : 0
  const pCpm = p.impressions ? (p.ad_spend / p.impressions) * 1000 : 0

  return (
    <div className="min-h-screen flex flex-col text-surface-100">
      <header className="sticky top-0 z-40 border-b border-white/5 bg-surface-950/90 backdrop-blur-md">
        <div className="px-6 py-4 flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-sm font-semibold text-surface-100">Funnel Health</h1>
            <p className="text-[10px] text-surface-200/40 mt-0.5 font-mono">
              {from} → {to} · MNC
            </p>
          </div>

          {/* Comparison toggle */}
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-surface-200/30">Compare vs</span>
            <div className="flex items-center gap-0.5 bg-white/5 rounded-lg p-0.5">
              {([
                { key: 'previous_period', label: 'Previous Period' },
                { key: 'previous_month',  label: 'Previous Month' },
              ] as { key: CompMode; label: string }[]).map(opt => (
                <button
                  key={opt.key}
                  onClick={() => setCompMode(opt.key)}
                  className={`px-2.5 py-1 rounded-md text-[10px] font-semibold transition-all ${
                    compMode === opt.key
                      ? 'bg-white/12 text-surface-100'
                      : 'text-surface-200/35 hover:text-surface-200/70'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <span className="text-[10px] text-surface-200/20 font-mono">{prevFrom} → {prevTo}</span>
          </div>
        </div>
      </header>

      <div className="flex-1 px-6 py-6 space-y-6">

        {isLoading ? (
          <div className="h-64 rounded-2xl bg-white/5 animate-pulse" />
        ) : (
          <>
            {/* ── Diagnostic Cards ── */}
            <div>
              <h2 className="text-xs font-semibold text-surface-200/30 uppercase tracking-widest mb-3">
                Where's the bottleneck?
              </h2>
              <div className="grid grid-cols-3 gap-4">
                <DiagnosticCard
                  title="Awareness"
                  icon={
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/>
                    </svg>
                  }
                  description="Not enough people are seeing your ads. Increase budget, broaden targeting, or improve creative reach."
                  signals={[
                    { label: 'Impressions', value: fmtNum(c.impressions), curr: c.impressions, prev: p.impressions },
                    { label: 'CPM', value: fmtIDR(cpm), curr: cpm, prev: pCpm, invert: true },
                    { label: 'Ad Spend', value: fmtIDR(c.ad_spend), curr: c.ad_spend, prev: p.ad_spend },
                  ]}
                />
                <DiagnosticCard
                  title="Engagement"
                  icon={
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5"/>
                    </svg>
                  }
                  description="People see your ads but don't reach the offer. Fix the ad creative, landing page copy, or offer page layout."
                  signals={[
                    { label: 'CTR', value: fmtPct(ctr), curr: ctr, prev: pCtr },
                    { label: 'OCLP', value: fmtPct(oclp), curr: oclp, prev: pOclp },
                    { label: 'LPVO', value: fmtPct(lpvo), curr: lpvo, prev: pLpvo },
                  ]}
                />
                <DiagnosticCard
                  title="Offer / Conversion"
                  icon={
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                    </svg>
                  }
                  description="People see the offer but don't convert. Rethink pricing, urgency, or channel experience for DP/MP."
                  signals={[
                    { label: 'VO2L', value: fmtPct(vo2l), curr: vo2l, prev: pVo2l },
                    { label: 'CI CVR', value: fmtPct(ciCvr), curr: ciCvr, prev: pCiCvr },
                    { label: 'DP LEDI Rate', value: fmtPct(dpLedi), curr: dpLedi, prev: pDpLedi },
                    { label: 'MP LEDI Rate', value: fmtPct(mpLedi), curr: mpLedi, prev: pMpLedi },
                  ]}
                />
              </div>
            </div>

            {/* ── Funnel Waterfall ── */}
            <div>
              <h2 className="text-xs font-semibold text-surface-200/30 uppercase tracking-widest mb-3">
                Funnel Waterfall
              </h2>

              {/* Top shared funnel */}
              <div className="rounded-2xl bg-surface-900 border border-white/5 p-5 mb-4">
                <p className="text-[10px] text-surface-200/30 uppercase tracking-widest font-semibold mb-4">
                  Shared Top Funnel
                </p>
                <FunnelWaterfall stages={sharedFunnel} />
              </div>

              {/* Channel split */}
              <div className="grid grid-cols-3 gap-4">
                {/* CI */}
                <div className="rounded-2xl bg-surface-900 border border-white/5 p-5">
                  <div className="flex items-center gap-2 mb-4">
                    <div className="w-2 h-2 rounded-full bg-blue-400" />
                    <p className="text-[10px] text-surface-200/40 uppercase tracking-widest font-semibold">
                      CI — Chat-commerce
                    </p>
                  </div>
                  <FunnelWaterfall stages={ciFunnel} />
                  {/* CI Revenue */}
                  <div className="mt-4 pt-4 border-t border-white/5">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] text-surface-200/40">CI Revenue</span>
                      <div className="text-right">
                        <p className="text-sm font-bold font-mono text-surface-100">{fmtIDR(c.revenue_cc)}</p>
                        <Delta curr={c.revenue_cc} prev={p.revenue_cc} />
                      </div>
                    </div>
                    <div className="flex items-center justify-between mt-2">
                      <span className="text-[11px] text-surface-200/40">CI RoAS</span>
                      <div className="text-right">
                        <p className="text-sm font-bold font-mono text-surface-100">
                          {c.ad_spend ? (c.revenue_cc / c.ad_spend).toFixed(2) : '—'}×
                        </p>
                        <Delta
                          curr={c.ad_spend ? c.revenue_cc / c.ad_spend : 0}
                          prev={p.ad_spend ? p.revenue_cc / p.ad_spend : 0}
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* DP */}
                <div className="rounded-2xl bg-surface-900 border border-white/5 p-5">
                  <div className="flex items-center gap-2 mb-4">
                    <div className="w-2 h-2 rounded-full bg-emerald-400" />
                    <p className="text-[10px] text-surface-200/40 uppercase tracking-widest font-semibold">
                      DP — Distributor Partner
                    </p>
                  </div>
                  <FunnelWaterfall stages={dpFunnel} />
                  <div className="mt-4 pt-4 border-t border-white/5">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] text-surface-200/40">LEDI Rate</span>
                      <div className="text-right">
                        <p className="text-sm font-bold font-mono text-surface-100">{fmtPct(dpLedi)}</p>
                        <Delta curr={dpLedi} prev={pDpLedi} />
                      </div>
                    </div>
                    <div className="flex items-center justify-between mt-2">
                      <span className="text-[11px] text-surface-200/40">CPRL (DP)</span>
                      <div className="text-right">
                        <p className="text-sm font-bold font-mono text-surface-100">
                          {c.real_lead_dp ? fmtIDR(c.ad_spend / c.real_lead_dp) : '—'}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* MP */}
                <div className="rounded-2xl bg-surface-900 border border-white/5 p-5">
                  <div className="flex items-center gap-2 mb-4">
                    <div className="w-2 h-2 rounded-full bg-amber-400" />
                    <p className="text-[10px] text-surface-200/40 uppercase tracking-widest font-semibold">
                      MP — Marketplace Pusat
                    </p>
                  </div>
                  <FunnelWaterfall stages={mpFunnel} />
                  <div className="mt-4 pt-4 border-t border-white/5">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] text-surface-200/40">LEDI Rate</span>
                      <div className="text-right">
                        <p className="text-sm font-bold font-mono text-surface-100">{fmtPct(mpLedi)}</p>
                        <Delta curr={mpLedi} prev={pMpLedi} />
                      </div>
                    </div>
                    <div className="flex items-center justify-between mt-2">
                      <span className="text-[11px] text-surface-200/40">CPRL (MP)</span>
                      <div className="text-right">
                        <p className="text-sm font-bold font-mono text-surface-100">
                          {c.real_lead_mp ? fmtIDR(c.ad_spend / c.real_lead_mp) : '—'}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* ── Summary KPIs ── */}
            <div>
              <h2 className="text-xs font-semibold text-surface-200/30 uppercase tracking-widest mb-3">
                Period Summary
              </h2>
              <div className="grid grid-cols-5 gap-4">
                {[
                  { label: 'Ad Spend',    value: fmtIDR(c.ad_spend),   curr: c.ad_spend,   prev: p.ad_spend },
                  { label: 'Real Leads',  value: fmtNum(real_leads),   curr: real_leads,    prev: prev_real_leads },
                  { label: 'CPRL',        value: real_leads ? fmtIDR(c.ad_spend / real_leads) : '—',
                                          curr: real_leads ? c.ad_spend / real_leads : 0,
                                          prev: prev_real_leads ? p.ad_spend / prev_real_leads : 0, invert: true },
                  { label: 'CI Revenue',  value: fmtIDR(c.revenue_cc), curr: c.revenue_cc, prev: p.revenue_cc },
                  { label: 'CI RoAS',     value: c.ad_spend ? `${(c.revenue_cc / c.ad_spend).toFixed(2)}×` : '—',
                                          curr: c.ad_spend ? c.revenue_cc / c.ad_spend : 0,
                                          prev: p.ad_spend ? p.revenue_cc / p.ad_spend : 0 },
                ].map(kpi => (
                  <div key={kpi.label} className="rounded-2xl bg-surface-900 border border-white/5 p-4">
                    <p className="text-[10px] text-surface-200/35 uppercase tracking-widest mb-2">{kpi.label}</p>
                    <p className="text-lg font-bold tabular-nums font-mono text-surface-100">{kpi.value}</p>
                    <div className="mt-1">
                      <Delta curr={kpi.curr} prev={kpi.prev} invert={'invert' in kpi ? kpi.invert : false} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
