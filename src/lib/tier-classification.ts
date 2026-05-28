/**
 * Shared budget tier classification.
 *
 * SpendingSummaryCard and BudgetStructureDiagram both derive a
 * 'hard' | 'soft' | 'blind' tier from the same inputs. This module
 * consolidates that logic so it can be tested once and reused in both.
 *
 * BudgetCalculator has a slightly different variant (adds a `null` state
 * for disconnected mode) and is not yet migrated to this shared function.
 */

export type BudgetTier = 'hard' | 'soft' | 'blind'

/**
 * Classify the budget enforcement tier.
 *
 * - **hard** – `prevent_further_usage` is on AND every spending path is capped.
 * - **soft** – alerts are enabled but there is no hard cap, OR hard cap is
 *   undermined by uncapped cost centers (the "partial cap" scenario from PR #212).
 * - **blind** – no alerts, no cap.
 *
 * When cost center exclusion is ON, each cost center tracks its own charges
 * independently. If any CC has budget = 0 while exclusion is on, the
 * enterprise "stop usage" flag alone cannot cap total spend — so the tier
 * is downgraded from hard to soft.
 */
export function classifyBudgetTier({
  preventFurtherUsage,
  budgetAlertingEnabled,
  excludeCostCenters = false,
  uncappedCcCount = 0,
}: {
  preventFurtherUsage: boolean
  budgetAlertingEnabled: boolean | null
  excludeCostCenters?: boolean
  uncappedCcCount?: number
}): BudgetTier {
  if (preventFurtherUsage) {
    // Hard cap is only valid when ALL spending paths are capped.
    // With exclusion ON, any CC with budget=0 is completely uncapped.
    const hasUncappedGap = excludeCostCenters && uncappedCcCount > 0
    return hasUncappedGap ? 'soft' : 'hard'
  }
  return budgetAlertingEnabled === true ? 'soft' : 'blind'
}

/**
 * Count cost centers that are uncapped (budget = 0) when exclusion is ON.
 * Returns 0 when exclusion is OFF (all CCs share the enterprise budget).
 */
export function computeUncappedCcCount(
  costCenters: ReadonlyArray<{ name: string; budget: number }>,
  excludeCostCenters: boolean,
): number {
  if (!excludeCostCenters) return 0
  return costCenters.filter(cc => cc.budget === 0 && cc.name.trim().length > 0).length
}
