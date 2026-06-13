// --- Pure budget calculation functions ---

import type {
  BudgetRecommendations,
  BudgetConstraint,
  CostCenterConstraintInput,
  UserBudgetRecord,
  CCConstraintResult,
  MultiCCConstraintResult,
} from './types'

// --- Pure budget calculation (exported for testing) ---

export function calcBudgetRecommendations(
  cbLicenses: number,
  ceLicenses: number,
  universalULB: number,
  powerUsers: number,
  powerUserBudget: number,
  enterpriseBufferPercent: number,
  promotionalPricing: boolean,
  poolConsumedSoFar = 0,
): BudgetRecommendations {
  const cbAICsPerLicense = promotionalPricing ? 3000 : 1900
  const ceAICsPerLicense = promotionalPricing ? 7000 : 3900
  const totalUsers = cbLicenses + ceLicenses
  const cbAICs = cbLicenses * cbAICsPerLicense
  const ceAICs = ceLicenses * ceAICsPerLicense
  const totalReservoir = cbAICs + ceAICs
  const reservoirValue = totalReservoir * 0.01
  const standardReservoirValue = (cbLicenses * 1900 + ceLicenses * 3900) * 0.01
  const promoBonusValue = promotionalPricing ? Math.round(reservoirValue - standardReservoirValue) : 0
  const avgUsagePerUser = totalUsers > 0 ? totalReservoir / totalUsers : 0
  const regularUsers = Math.max(0, totalUsers - powerUsers)
  const maxRegularConsumption = regularUsers * universalULB
  const maxPowerConsumption = powerUsers * powerUserBudget
  const maxTotalConsumption = maxRegularConsumption + maxPowerConsumption
  // Mid-cycle: adjust pool for already-consumed credits
  const isMidCycleAdjusted = poolConsumedSoFar > 0
  const effectiveReservoirValue = Math.max(0, reservoirValue - poolConsumedSoFar)
  // Full-cycle values (for comparison when mid-cycle is active)
  const fullCycleSpendBeyondReservoir = Math.max(0, maxTotalConsumption - reservoirValue)
  const fullCycleEnterpriseBudget = Math.ceil(fullCycleSpendBeyondReservoir * (1 + enterpriseBufferPercent / 100))
  const powerUserShareOfConsumption = maxTotalConsumption > 0 ? maxPowerConsumption / maxTotalConsumption : 0
  const fullCycleCostCenterBudget = Math.ceil(fullCycleSpendBeyondReservoir * powerUserShareOfConsumption)
  // Active values: use effective (remaining) pool
  const maxSpendBeyondReservoir = Math.max(0, maxTotalConsumption - effectiveReservoirValue)
  const recommendedEnterpriseBudget = Math.ceil(maxSpendBeyondReservoir * (1 + enterpriseBufferPercent / 100))
  const recommendedCostCenterBudget = Math.ceil(maxSpendBeyondReservoir * powerUserShareOfConsumption)
  const isReservoirSufficient = maxTotalConsumption <= effectiveReservoirValue
  return {
    cbAICsPerLicense, ceAICsPerLicense,
    totalUsers, cbAICs, ceAICs, totalReservoir, reservoirValue, promoBonusValue,
    avgUsagePerUser, regularUsers, maxRegularConsumption, maxPowerConsumption,
    maxTotalConsumption, maxSpendBeyondReservoir, recommendedEnterpriseBudget,
    powerUserShareOfConsumption, recommendedCostCenterBudget, isReservoirSufficient,
    poolConsumedSoFar, effectiveReservoirValue, isMidCycleAdjusted,
    fullCycleEnterpriseBudget, fullCycleCostCenterBudget, fullCycleSpendBeyondReservoir,
  }
}

// --- Constraint detection helpers (exported for testing) ---

/**
 * Detects whether a given enterprise budget is the binding constraint that
 * limits user consumption below what their ULBs would otherwise allow.
 *
 * - Exclusion OFF: enterprise budget covers ALL post-pool charges.
 *   affordableConsumption = pool + entBudget (for all users).
 * - Exclusion ON: enterprise budget only covers non-cost-center users' charges.
 *   affordableConsumption = regular users' pool share + entBudget.
 */
export function calcEnterpriseBudgetConstraint(
  entBudget: number,
  rec: BudgetRecommendations,
  excludeCostCenterUsage: boolean,
  forecast?: { forecastEnterprise: number; billingBaselineEnterprise?: number },
): BudgetConstraint {
  const { reservoirValue, maxTotalConsumption, totalUsers,
          recommendedEnterpriseBudget, maxRegularConsumption,
          powerUserShareOfConsumption } = rec

  const shortfall = Math.max(0, recommendedEnterpriseBudget - entBudget)

  // Build base result (ceiling-based, unchanged behavior)
  let base: BudgetConstraint
  if (totalUsers === 0 || maxTotalConsumption === 0) {
    base = { isBinding: false, affordableConsumption: 0, maxConsumption: 0, capacityPercent: 100, shortfall }
  } else if (excludeCostCenterUsage) {
    const regularPoolShare = reservoirValue * (1 - powerUserShareOfConsumption)
    const regularPostPool = Math.max(0, maxRegularConsumption - regularPoolShare)
    const affordableConsumption = regularPoolShare + Math.min(entBudget, regularPostPool)
    const maxConsumption = maxRegularConsumption
    const isBinding = maxConsumption > 0 && entBudget < regularPostPool
    const capacityPercent = maxConsumption > 0 ? Math.min(100, (affordableConsumption / maxConsumption) * 100) : 100
    base = { isBinding, affordableConsumption, maxConsumption, capacityPercent, shortfall }
  } else {
    const postPool = Math.max(0, maxTotalConsumption - reservoirValue)
    const affordableConsumption = reservoirValue + Math.min(entBudget, postPool)
    const maxConsumption = maxTotalConsumption
    const isBinding = entBudget < postPool
    const capacityPercent = maxConsumption > 0 ? Math.min(100, (affordableConsumption / maxConsumption) * 100) : 100
    base = { isBinding, affordableConsumption, maxConsumption, capacityPercent, shortfall }
  }

  // Augment with forecast-aware fields when forecast input is provided
  if (forecast) {
    const f = forecast.forecastEnterprise
    base.forecast = f
    base.isBindingVsForecast = entBudget < f
    base.forecastShortfall = Math.max(0, f - entBudget)
    base.forecastCapacityPercent = f > 0 ? Math.min(100, (entBudget / f) * 100) : 100
  }

  return base
}

/**
 * Detects whether a given cost center budget is the binding constraint that
 * limits power user consumption below their individual ULBs.
 *
 * The math is the same for both exclusion modes from the power users'
 * perspective: the CC budget caps their post-pool charges.
 * The difference is messaging:
 * - Exclusion OFF: CC is a sub-limit within the enterprise umbrella.
 * - Exclusion ON: CC is independent; enterprise doesn't cover these users.
 */
export function calcCostCenterBudgetConstraint(
  ccBudget: number,
  rec: BudgetRecommendations,
  forecast?: { forecastCostCenter: number },
): BudgetConstraint {
  const { reservoirValue, powerUsers, maxPowerConsumption,
          recommendedCostCenterBudget, powerUserShareOfConsumption } = rec

  const shortfall = Math.max(0, recommendedCostCenterBudget - ccBudget)

  let base: BudgetConstraint
  if (powerUsers === 0 || maxPowerConsumption === 0) {
    base = { isBinding: false, affordableConsumption: 0, maxConsumption: 0, capacityPercent: 100, shortfall }
  } else {
    const powerPoolShare = reservoirValue * powerUserShareOfConsumption
    const powerPostPool = Math.max(0, maxPowerConsumption - powerPoolShare)
    const affordableConsumption = powerPoolShare + Math.min(ccBudget, powerPostPool)
    const maxConsumption = maxPowerConsumption
    const isBinding = ccBudget < powerPostPool
    const capacityPercent = maxConsumption > 0 ? Math.min(100, (affordableConsumption / maxConsumption) * 100) : 100
    base = { isBinding, affordableConsumption, maxConsumption, capacityPercent, shortfall }
  }

  if (forecast) {
    const f = forecast.forecastCostCenter
    base.forecast = f
    base.isBindingVsForecast = ccBudget < f
    base.forecastShortfall = Math.max(0, f - ccBudget)
    base.forecastCapacityPercent = f > 0 ? Math.min(100, (ccBudget / f) * 100) : 100
  }

  return base
}

// --- Reverse solver: budget-first mode (exported for testing) ---

/**
 * Solves a pool-proportional sharing quadratic for the "budget-first" reverse calc.
 *
 * When exclusion is ON, the pool is shared proportionally by consumption.
 * Finding the max affordable consumption for one group (given the other group's
 * fixed consumption) requires solving:
 *
 *   x × (x + otherConsumption − pool) / (x + otherConsumption) = budgetCap
 *
 * Rearranging: x² + x(otherConsumption − pool − budgetCap) − budgetCap × otherConsumption = 0
 *
 * Returns the max total consumption for the target group (x), or Infinity if the
 * pool alone covers everything.
 */
function solvePoolShareQuadratic(
  budgetCap: number,
  pool: number,
  otherGroupConsumption: number,
): number {
  const a = 1
  const b = otherGroupConsumption - pool - budgetCap
  const c = -budgetCap * otherGroupConsumption
  const discriminant = b * b - 4 * a * c

  if (discriminant < 0) return 0
  // Take the positive root
  return (-b + Math.sqrt(discriminant)) / (2 * a)
}

/**
 * Given a fixed enterprise budget cap, calculates the maximum affordable
 * Universal ULB (per regular user) that keeps the budget non-binding.
 *
 * Exclusion OFF: Enterprise budget covers all users' post-pool charges.
 *   totalAffordable = pool + budgetCap / (1 + buffer%)
 *   maxULB = (totalAffordable − powerUsers × powerUserBudget) / regularUsers
 *
 * Exclusion ON: Enterprise budget only covers regular users. Pool is shared
 *   proportionally by consumption, requiring a quadratic solve.
 */
export function calcMaxAffordableULB(
  budgetCap: number,
  pool: number,
  regularUsers: number,
  powerUsers: number,
  powerUserBudget: number,
  bufferPercent: number,
  excludeCostCenters: boolean,
): number {
  if (regularUsers <= 0) return Infinity
  if (budgetCap < 0) return 0

  const effectiveCap = budgetCap / (1 + bufferPercent / 100)
  const powerConsumption = powerUsers * powerUserBudget

  if (!excludeCostCenters) {
    // Exclusion OFF: enterprise budget covers all users
    const totalAffordable = pool + effectiveCap
    const maxRegularConsumption = totalAffordable - powerConsumption
    if (maxRegularConsumption <= 0) return 0
    return maxRegularConsumption / regularUsers
  }

  // Exclusion ON: enterprise budget only covers regular users
  // Pool shared proportionally — solve quadratic
  const maxRegularConsumption = solvePoolShareQuadratic(effectiveCap, pool, powerConsumption)
  if (maxRegularConsumption <= 0) return 0
  if (!isFinite(maxRegularConsumption)) return Infinity
  return maxRegularConsumption / regularUsers
}

/**
 * Given a fixed budget cap, calculates the maximum affordable power user budget
 * that keeps the budget non-binding.
 *
 * Exclusion OFF: Enterprise budget covers all users. Same as ULB solver with
 *   roles swapped.
 *
 * Exclusion ON: Power users are constrained by the CC budget (not enterprise).
 *   Uses the same quadratic with the CC budget cap and regular consumption.
 *
 * @param budgetCap - Enterprise budget cap (exclusion OFF) or CC budget cap (exclusion ON)
 */
export function calcMaxAffordablePowerBudget(
  budgetCap: number,
  pool: number,
  regularUsers: number,
  powerUsers: number,
  universalULB: number,
  bufferPercent: number,
  excludeCostCenters: boolean,
): number {
  if (powerUsers <= 0) return Infinity
  if (budgetCap < 0) return 0

  const effectiveCap = budgetCap / (1 + bufferPercent / 100)
  const regularConsumption = regularUsers * universalULB

  if (!excludeCostCenters) {
    // Exclusion OFF: enterprise budget covers all users
    const totalAffordable = pool + effectiveCap
    const maxPowerConsumption = totalAffordable - regularConsumption
    if (maxPowerConsumption <= 0) return 0
    return maxPowerConsumption / powerUsers
  }

  // Exclusion ON: CC budget covers power users independently
  // Pool shared proportionally — solve quadratic
  const maxPowerConsumption = solvePoolShareQuadratic(effectiveCap, pool, regularConsumption)
  if (maxPowerConsumption <= 0) return 0
  if (!isFinite(maxPowerConsumption)) return Infinity
  return maxPowerConsumption / powerUsers
}

// --- Multi-CC constraint analysis (exported for testing) ---

/**
 * Analyzes budget constraints across all cost centers simultaneously.
 *
 * For each CC, cross-references its member list against individual ULB records
 * to compute per-CC consumption using actual per-user ULBs. Users without an
 * individual ULB use the universal ULB.
 *
 * Pool sharing is proportional to each group's consumption share.
 *
 * Exclusion-aware:
 * - OFF: Enterprise budget is the umbrella covering all post-pool charges.
 *   CC budgets are sub-limits within it.
 * - ON: Enterprise budget covers only unassigned users. Each CC budget
 *   independently covers its own users. A CC with budget=0 is flagged as uncapped.
 */
export function calcMultiCCConstraints(
  costCenterInputs: CostCenterConstraintInput[],
  userBudgets: UserBudgetRecord[],
  universalULB: number,
  poolValue: number,
  enterpriseBudget: number,
  excludeCostCenterUsage: boolean,
  totalLicenses: number,
): MultiCCConstraintResult {
  const userBudgetMap = new Map(userBudgets.map(ub => [ub.login, ub.amount]))

  const ccResults: Array<{
    ccId: string; name: string; budget: number
    members: string[]; userCount: number
    uniULBCount: number; indULBCount: number
    maxConsumption: number
  }> = costCenterInputs.map(cc => {
    const userCount = cc.members.length
    let uniCount = 0
    let indCount = 0
    let maxConsumption = 0
    for (const login of cc.members) {
      const indBudget = userBudgetMap.get(login)
      if (indBudget !== undefined) {
        indCount++
        maxConsumption += indBudget
      } else {
        uniCount++
        maxConsumption += universalULB
      }
    }
    return { ccId: cc.ccId, name: cc.name, budget: cc.budget, members: cc.members, userCount, uniULBCount: uniCount, indULBCount: indCount, maxConsumption }
  })

  const assignedLogins = new Set(costCenterInputs.flatMap(cc => cc.members))
  const unassignedCount = Math.max(0, totalLicenses - assignedLogins.size)
  const unassignedIndUsers = userBudgets.filter(ub => !assignedLogins.has(ub.login))
  const unassignedIndCount = Math.min(unassignedIndUsers.length, unassignedCount)
  const unassignedUniCount = Math.max(0, unassignedCount - unassignedIndCount)
  const unassignedIndConsumption = unassignedIndUsers.slice(0, unassignedCount).reduce((s, ub) => s + ub.amount, 0)
  const unassignedMaxConsumption = (unassignedUniCount * universalULB) + unassignedIndConsumption

  const totalMaxConsumption = ccResults.reduce((s, cc) => s + cc.maxConsumption, 0) + unassignedMaxConsumption

  const ccConstraints: CCConstraintResult[] = ccResults.map(cc => {
    if (cc.userCount === 0 || cc.maxConsumption === 0) {
      return {
        ccId: cc.ccId, name: cc.name, userCount: 0, uniULBCount: 0, indULBCount: 0,
        maxConsumption: 0,
        constraint: { isBinding: false, affordableConsumption: 0, maxConsumption: 0, capacityPercent: 100, shortfall: 0 },
        isUncapped: false, effectivePerUserCap: 0,
      }
    }

    const consumptionShare = totalMaxConsumption > 0 ? cc.maxConsumption / totalMaxConsumption : 0
    const ccPoolShare = poolValue * consumptionShare
    const ccPostPool = Math.max(0, cc.maxConsumption - ccPoolShare)
    const isUncapped = excludeCostCenterUsage && cc.budget === 0 && ccPostPool > 0
    const isBinding = cc.budget < ccPostPool && !isUncapped
    const affordableConsumption = ccPoolShare + Math.min(cc.budget, ccPostPool)
    const capacityPercent = cc.maxConsumption > 0 ? Math.min(100, (affordableConsumption / cc.maxConsumption) * 100) : 100
    const shortfall = Math.max(0, Math.ceil(ccPostPool) - cc.budget)
    const effectivePerUserCap = cc.userCount > 0 ? affordableConsumption / cc.userCount : 0

    return {
      ccId: cc.ccId, name: cc.name, userCount: cc.userCount,
      uniULBCount: cc.uniULBCount, indULBCount: cc.indULBCount,
      maxConsumption: cc.maxConsumption,
      constraint: { isBinding, affordableConsumption, maxConsumption: cc.maxConsumption, capacityPercent, shortfall },
      isUncapped, effectivePerUserCap,
    }
  })

  let unassignedConstraint: BudgetConstraint
  if (unassignedCount === 0 || unassignedMaxConsumption === 0) {
    unassignedConstraint = { isBinding: false, affordableConsumption: 0, maxConsumption: 0, capacityPercent: 100, shortfall: 0 }
  } else if (excludeCostCenterUsage) {
    const unassignedShare = totalMaxConsumption > 0 ? unassignedMaxConsumption / totalMaxConsumption : 0
    const unassignedPoolShare = poolValue * unassignedShare
    const unassignedPostPool = Math.max(0, unassignedMaxConsumption - unassignedPoolShare)
    const isBinding = enterpriseBudget < unassignedPostPool
    const affordableConsumption = unassignedPoolShare + Math.min(enterpriseBudget, unassignedPostPool)
    const capacityPercent = Math.min(100, (affordableConsumption / unassignedMaxConsumption) * 100)
    unassignedConstraint = { isBinding, affordableConsumption, maxConsumption: unassignedMaxConsumption, capacityPercent, shortfall: Math.max(0, Math.ceil(unassignedPostPool) - enterpriseBudget) }
  } else {
    const postPool = Math.max(0, totalMaxConsumption - poolValue)
    const isBinding = enterpriseBudget < postPool
    const affordableConsumption = poolValue + Math.min(enterpriseBudget, postPool)
    const capacityPercent = totalMaxConsumption > 0 ? Math.min(100, (affordableConsumption / totalMaxConsumption) * 100) : 100
    unassignedConstraint = { isBinding, affordableConsumption, maxConsumption: totalMaxConsumption, capacityPercent, shortfall: Math.max(0, Math.ceil(postPool) - enterpriseBudget) }
  }

  const unassignedEffectiveCap = unassignedCount > 0 ? unassignedConstraint.affordableConsumption / unassignedCount : 0

  const bindingCount = ccConstraints.filter(c => c.constraint.isBinding).length + (unassignedConstraint.isBinding ? 1 : 0)
  const uncappedCount = ccConstraints.filter(c => c.isUncapped).length
  const totalMaxSpend = excludeCostCenterUsage
    ? enterpriseBudget + ccResults.reduce((s, cc) => s + cc.budget, 0)
    : enterpriseBudget

  return {
    costCenters: ccConstraints,
    unassignedUsers: {
      count: unassignedCount, uniULBCount: unassignedUniCount, indULBCount: unassignedIndCount,
      maxConsumption: unassignedMaxConsumption,
      constraint: unassignedConstraint, effectivePerUserCap: unassignedEffectiveCap,
    },
    totalMaxSpend, bindingCount, uncappedCount,
  }
}
