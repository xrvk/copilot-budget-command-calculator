// --- Realistic spend forecast from CSV data ---
//
// Pure functions for projecting monthly additional spend (post-pool) from
// real per-user consumption data, given a proposed ULB configuration.
//
// Key invariant (the "billing baseline floor"):
//   forecastSpend >= billingBaseline
// where billingBaseline = max(0, sum(actualConsumption) - pool).
//
// This guarantees CCC's forecast never undercuts what the customer already
// paid for last month's actual usage as reported by GitHub's billing preview.
// Tighter ULBs can in principle reduce spend (when prevent_further_usage is
// enabled), but assuming users will simply consume less is optimistic. The
// floor anchors the headline; the pre-floor value is exposed separately for
// annotations like "enforced ULBs could reduce to ~$X."

import type { ForecastResult, ForecastUser } from './types'

const AIC_DOLLAR_VALUE = 0.01

export interface CalcForecastInput {
  users: ForecastUser[]
  baseULB: number              // dollars (universal ULB)
  powerULB: number             // dollars (power user budget)
  powerThresholdAICs: number   // a user with totalAICs >= threshold is a power user
  pool: number                 // dollars; effective (mid-cycle-aware)
  excludeCostCenterUsage?: boolean
  costCenterMemberLogins?: Set<string>  // members of the power CC, for exclusion-on splits
}

/**
 * Compute realistic spend forecast from per-user CSV consumption.
 *
 * Returns null when the input has no users (no CSV uploaded).
 */
export function calcForecast(input: CalcForecastInput): ForecastResult | null {
  const {
    users,
    baseULB,
    powerULB,
    powerThresholdAICs,
    pool,
    excludeCostCenterUsage = false,
    costCenterMemberLogins,
  } = input

  if (users.length === 0) return null

  // Per-user breakdown into raw vs capped dollars, partitioned by scope
  // when exclusion is on.
  let totalActualConsumption = 0
  let totalCapped = 0
  let cappedUserCount = 0
  let entActual = 0
  let entCapped = 0
  let ccActual = 0
  let ccCapped = 0

  for (const u of users) {
    const actualDollars = u.totalAICs * AIC_DOLLAR_VALUE
    const isPower = u.totalAICs >= powerThresholdAICs
    const ulb = isPower ? powerULB : baseULB
    const capped = Math.min(actualDollars, ulb)
    if (capped < actualDollars) cappedUserCount += 1
    totalActualConsumption += actualDollars
    totalCapped += capped

    const inCc = excludeCostCenterUsage && costCenterMemberLogins?.has(u.login) === true
    if (inCc) {
      ccActual += actualDollars
      ccCapped += capped
    } else {
      entActual += actualDollars
      entCapped += capped
    }
  }

  if (excludeCostCenterUsage) {
    // Each scope gets its own pool share + independent floor.
    // We split the pool proportionally to actual consumption when both
    // scopes have usage; otherwise the active scope gets the full pool.
    // The pool only meaningfully reduces spend that exists; an empty
    // scope can't burn pool credits regardless.
    const denom = entActual + ccActual
    const entPoolShare = denom > 0 ? pool * (entActual / denom) : pool
    const ccPoolShare = denom > 0 ? pool * (ccActual / denom) : 0

    const entWithCaps = Math.max(0, entCapped - entPoolShare)
    const entBaseline = Math.max(0, entActual - entPoolShare)
    const ccWithCaps = Math.max(0, ccCapped - ccPoolShare)
    const ccBaseline = Math.max(0, ccActual - ccPoolShare)

    const forecastEnterprise = Math.max(entWithCaps, entBaseline)
    const forecastCostCenter = Math.max(ccWithCaps, ccBaseline)
    const forecastSpend = forecastEnterprise + forecastCostCenter
    const forecastWithCaps = entWithCaps + ccWithCaps
    const billingBaseline = entBaseline + ccBaseline

    return {
      forecastSpend,
      forecastWithCaps,
      billingBaseline,
      isFlooredToBaseline: forecastWithCaps + 1e-9 < billingBaseline,
      forecastEnterprise,
      forecastCostCenter,
      cappedUserCount,
      totalActualConsumption,
    }
  }

  // Exclusion OFF: enterprise budget is the umbrella.
  const withCaps = Math.max(0, totalCapped - pool)
  const baseline = Math.max(0, totalActualConsumption - pool)
  const forecastSpend = Math.max(withCaps, baseline)

  return {
    forecastSpend,
    forecastWithCaps: withCaps,
    billingBaseline: baseline,
    isFlooredToBaseline: withCaps + 1e-9 < baseline,
    forecastEnterprise: forecastSpend,
    forecastCostCenter: 0,
    cappedUserCount,
    totalActualConsumption,
  }
}
