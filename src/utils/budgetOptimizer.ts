/**
 * Budget Optimizer v3
 *
 * Distributes a new total budget across campaigns to minimise CPRL or CPA CC.
 *
 * Key design decision:
 *   Campaigns with metric = 0 (e.g. spent money but got 0 purchases) are
 *   treated as the WORST performers, not as "unknown". They receive a
 *   penalty score = 2× the worst measured campaign, so they get minimal budget.
 *
 * Core rules:
 *   1. Lower-metric campaigns get more budget (inverse-metric weighting).
 *   2. Diminishing returns: scaling a campaign up increases its metric
 *      following a power-law decay  predicted = current × (new/old)^α.
 *   3. Funnel hierarchy: total spend per funnel must be non-increasing
 *      (ToFU00 ≥ MoFU25 ≥ BoFU50 ≥ BoFU75).
 *   4. CPRL guard (CPA CC mode only): predicted blended CPRL must not
 *      exceed CPRL_TARGET (150k). If it does, the allocation is blended
 *      toward a CPRL-optimised allocation until the constraint is met.
 */

// ── Types ─────────────────────────────────────────────────────────────

export interface CampaignInput {
  name: string
  ts: string       // traffic source (META / DGEN)
  funnel: string   // '00' | '25' | '50' | '75'
  cprl: number
  cpaCC: number
  dailyBudget: number
  spend: number
}

export interface OptResult {
  name: string
  ts: string
  funnel: string
  suggestedBudget: number
  predictedCprl: number
  predictedCpaCC: number
}

// ── Constants ─────────────────────────────────────────────────────────

/** Power-law exponent for diminishing returns.  0.12 ≈ +8 % metric per 2× budget */
const DECAY_EXPONENT = 0.12
/** CPRL ceiling when optimising for CPA CC */
const CPRL_TARGET = 150_000
/** Funnel ordering (descending priority) */
const FUNNEL_ORDER = ['00', '25', '50', '75']
/** Minimum share any single campaign keeps (prevents zeroing out) */
const MIN_SHARE = 0.02
/** Penalty multiplier for campaigns with 0 metric (treated as 2× worst) */
const ZERO_PENALTY_MULTIPLIER = 2

// ── Helpers ───────────────────────────────────────────────────────────

/** Predict a metric after budget change, using power-law decay */
function predictMetric(
  current: number,
  oldBudget: number,
  newBudget: number,
): number {
  if (current <= 0 || oldBudget <= 0 || newBudget <= 0) return current
  return current * Math.pow(newBudget / oldBudget, DECAY_EXPONENT)
}

/** Sum a numeric field for an array of objects */
function sum<T>(arr: T[], fn: (t: T) => number): number {
  return arr.reduce((s, t) => s + fn(t), 0)
}

// ── Core allocation ───────────────────────────────────────────────────

interface Alloc extends CampaignInput {
  effectiveMetric: number  // the metric used for scoring (including penalty)
  score: number
  suggestedBudget: number
}

function coreAllocate(
  campaigns: CampaignInput[],
  newTotal: number,
  metric: 'cprl' | 'cpaCC',
): Alloc[] {
  const currentTotal = sum(campaigns, c => c.dailyBudget)
  if (currentTotal <= 0) return campaigns.map(c => ({
    ...c, effectiveMetric: 0, score: 0, suggestedBudget: 0,
  }))

  // Step 1 — Find the worst (highest) metric among campaigns that have data
  const rawMetrics = campaigns
    .map(c => metric === 'cprl' ? c.cprl : c.cpaCC)
    .filter(m => m > 0)

  if (rawMetrics.length === 0) {
    // Absolutely no metric data at all → proportional fallback
    return campaigns.map(c => ({
      ...c,
      effectiveMetric: 0,
      score: 0,
      suggestedBudget: c.dailyBudget * (newTotal / currentTotal),
    }))
  }

  const worstMetric = Math.max(...rawMetrics)
  // Penalty value for 0-metric campaigns: 2× the worst measured value
  const penaltyMetric = worstMetric * ZERO_PENALTY_MULTIPLIER

  // Step 2 — Assign effective metric to all campaigns
  // 0 metric (no conversions despite spending) → penalized as worst offender
  let allocs: Alloc[] = campaigns.map(c => {
    const rawM = metric === 'cprl' ? c.cprl : c.cpaCC
    const effectiveMetric = rawM > 0 ? rawM : penaltyMetric
    const score = 1 / effectiveMetric  // always > 0 now
    return { ...c, effectiveMetric, score, suggestedBudget: 0 }
  })

  console.log(`  Worst measured ${metric}: ${Math.round(worstMetric)}, penalty for 0s: ${Math.round(penaltyMetric)}`)

  // Step 3 — Iterative refinement with decay (5 rounds)
  for (let iter = 0; iter < 5; iter++) {
    for (const a of allocs) {
      const bud = iter === 0 ? a.dailyBudget : Math.max(a.suggestedBudget, 1)
      const predicted = predictMetric(a.effectiveMetric, a.dailyBudget || bud, bud)
      a.score = predicted > 0 ? 1 / predicted : 0
    }

    const totalScore = sum(allocs, a => a.score)
    if (totalScore <= 0) break

    for (const a of allocs) {
      a.suggestedBudget = (a.score / totalScore) * newTotal
    }
  }

  // Step 4 — Enforce minimum share (no campaign drops below MIN_SHARE of total)
  const minBudget = newTotal * MIN_SHARE
  for (const a of allocs) {
    if (a.suggestedBudget < minBudget && a.dailyBudget > 0) {
      a.suggestedBudget = minBudget
    }
  }
  // Re-normalise
  const allocSum = sum(allocs, a => a.suggestedBudget)
  if (allocSum > 0 && Math.abs(allocSum - newTotal) > 1) {
    const factor = newTotal / allocSum
    for (const a of allocs) a.suggestedBudget *= factor
  }

  // Step 5 — Enforce funnel hierarchy
  enforceFunnelHierarchy(allocs, newTotal)

  return allocs
}

// ── Funnel hierarchy enforcement ──────────────────────────────────────

function enforceFunnelHierarchyForGroup(allocs: Alloc[]): void {
  for (let pass = 0; pass < 3; pass++) {
    let changed = false
    for (let i = 1; i < FUNNEL_ORDER.length; i++) {
      const upperFunnel = FUNNEL_ORDER[i - 1]
      const lowerFunnel = FUNNEL_ORDER[i]

      const upperCamps = allocs.filter(a => a.funnel === upperFunnel)
      const lowerCamps = allocs.filter(a => a.funnel === lowerFunnel)
      if (lowerCamps.length === 0 || upperCamps.length === 0) continue

      const upperTotal = sum(upperCamps, a => a.suggestedBudget)
      const lowerTotal = sum(lowerCamps, a => a.suggestedBudget)

      if (lowerTotal > upperTotal) {
        const scale = upperTotal / lowerTotal
        const excess = lowerTotal - upperTotal
        for (const a of lowerCamps) a.suggestedBudget *= scale

        // Push excess to all upper funnels
        const upperAll = allocs.filter(a => {
          const idx = FUNNEL_ORDER.indexOf(a.funnel)
          return idx >= 0 && idx < i
        })
        const upperAllTotal = sum(upperAll, a => a.suggestedBudget)
        if (upperAllTotal > 0) {
          for (const a of upperAll) {
            a.suggestedBudget += excess * (a.suggestedBudget / upperAllTotal)
          }
        }
        changed = true
      }
    }
    if (!changed) break
  }
}

function enforceFunnelHierarchy(allocs: Alloc[], newTotal: number): void {
  // Step A — enforce per-platform first (prevents inverted funnels within one platform)
  const platforms = [...new Set(allocs.map(a => a.ts.toUpperCase()))]
  for (const plat of platforms) {
    const platAllocs = allocs.filter(a => a.ts.toUpperCase() === plat)
    enforceFunnelHierarchyForGroup(platAllocs)
  }

  // Step B — enforce globally (across all platforms combined)
  enforceFunnelHierarchyForGroup(allocs)

  // Final normalisation
  const allocSum = sum(allocs, a => a.suggestedBudget)
  if (allocSum > 0) {
    const factor = newTotal / allocSum
    for (const a of allocs) a.suggestedBudget *= factor
  }
}

// ── Blended CPRL prediction ───────────────────────────────────────────

function predictBlendedCprl(allocs: Alloc[]): number {
  const totalSpend = sum(allocs, a => a.suggestedBudget)
  const totalLeads = allocs.reduce((s, a) => {
    const pCprl = predictMetric(a.cprl, a.dailyBudget, a.suggestedBudget)
    return pCprl > 0 ? s + a.suggestedBudget / pCprl : s
  }, 0)
  return totalLeads > 0 ? totalSpend / totalLeads : 0
}

// ── Public API ────────────────────────────────────────────────────────

export function optimizeBudget(
  campaigns: CampaignInput[],
  newTotalBudget: number,
  optimizeFor: 'cprl' | 'cpaCC',
  strength: number = 1,  // 0 = proportional, 1 = fully optimized
): OptResult[] {
  if (campaigns.length === 0 || newTotalBudget <= 0) return []

  const currentTotal = sum(campaigns, c => c.dailyBudget)
  if (currentTotal <= 0) return []

  console.log(`\n=== OPTIMIZER v3 (${optimizeFor}) ===`)
  console.log(`  Total campaigns: ${campaigns.length}, current budget: ${Math.round(currentTotal)}, new budget: ${Math.round(newTotalBudget)}`)

  // Run core allocation
  let allocs = coreAllocate(campaigns, newTotalBudget, optimizeFor)

  // Log per-platform allocation
  const platforms = [...new Set(allocs.map(a => a.ts.toUpperCase()))]
  for (const p of platforms) {
    const pAllocs = allocs.filter(a => a.ts.toUpperCase() === p)
    const curBudget = sum(pAllocs, a => a.dailyBudget)
    const newBudget = sum(pAllocs, a => a.suggestedBudget)
    console.log(`  ${p}: current=${Math.round(curBudget)} → new=${Math.round(newBudget)} (${((newBudget / curBudget - 1) * 100).toFixed(1)}%)`)
  }

  // CPRL guard — only when optimising for CPA CC
  if (optimizeFor === 'cpaCC') {
    const predictedCprl = predictBlendedCprl(allocs)
    console.log(`  Predicted CPRL: ${Math.round(predictedCprl)}, target: ${CPRL_TARGET}`)

    if (predictedCprl > CPRL_TARGET) {
      // Get a CPRL-optimised allocation as the "safe" baseline
      const cprlAllocs = coreAllocate(campaigns, newTotalBudget, 'cprl')

      // Binary-search for blend factor
      let lo = 0
      let hi = 1
      for (let iter = 0; iter < 20; iter++) {
        const mid = (lo + hi) / 2
        const blended: Alloc[] = allocs.map((a, idx) => ({
          ...a,
          suggestedBudget:
            a.suggestedBudget * (1 - mid) +
            cprlAllocs[idx].suggestedBudget * mid,
        }))
        const bCprl = predictBlendedCprl(blended)
        if (bCprl > CPRL_TARGET) lo = mid
        else hi = mid
      }

      const blend = Math.min((lo + hi) / 2 + 0.02, 1)
      for (let i = 0; i < allocs.length; i++) {
        allocs[i].suggestedBudget =
          allocs[i].suggestedBudget * (1 - blend) +
          cprlAllocs[i].suggestedBudget * blend
      }
      enforceFunnelHierarchy(allocs, newTotalBudget)

      console.log(`  CPRL guard applied: blend=${(blend * 100).toFixed(1)}% toward CPRL-optimised`)
    }
  }
  // ── Strength blending ──
  // Blend between proportional distribution (gentle) and full optimization (aggressive)
  const s = Math.max(0, Math.min(1, strength))
  if (s < 1) {
    const proportional = campaigns.map(c => c.dailyBudget * (newTotalBudget / currentTotal))
    for (let i = 0; i < allocs.length; i++) {
      allocs[i].suggestedBudget =
        proportional[i] * (1 - s) + allocs[i].suggestedBudget * s
    }
    // Re-normalise after blending
    const blendSum = sum(allocs, a => a.suggestedBudget)
    if (blendSum > 0) {
      const factor = newTotalBudget / blendSum
      for (const a of allocs) a.suggestedBudget *= factor
    }
    console.log(`  Strength: ${(s * 100).toFixed(0)}% — blended with proportional`)
  }

  // Build final results with predicted metrics
  return allocs.map(a => ({
    name: a.name,
    ts: a.ts,
    funnel: a.funnel,
    suggestedBudget: Math.round(a.suggestedBudget),
    predictedCprl: predictMetric(a.cprl, a.dailyBudget, a.suggestedBudget),
    predictedCpaCC: predictMetric(a.cpaCC, a.dailyBudget, a.suggestedBudget),
  }))
}
