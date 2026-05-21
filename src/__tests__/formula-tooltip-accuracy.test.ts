import { describe, it, expect } from 'vitest'
import { calcBudgetRecommendations } from '../components/BudgetCalculator/calculations'

describe('FormulaTooltip accuracy — enterprise budget', () => {
  it('tooltip formula steps match recommendedEnterpriseBudget when pool is sufficient', () => {
    const rec = calcBudgetRecommendations(130, 40, 30, 40, 70, 10, true)

    // Step 1: max regular consumption = regularUsers × ULB
    const regularUsers = 130 + 40 - 40  // totalUsers - powerUsers = 130
    expect(rec.maxRegularConsumption).toBe(regularUsers * 30)

    // Step 2: max power consumption = powerUsers × powerUserBudget
    expect(rec.maxPowerConsumption).toBe(40 * 70)

    // Step 3: spend beyond pool = max(0, total - pool)
    expect(rec.maxSpendBeyondReservoir).toBe(
      Math.max(0, rec.maxTotalConsumption - rec.reservoirValue)
    )

    // Step 4: with buffer, rounded up
    expect(rec.recommendedEnterpriseBudget).toBe(
      Math.ceil(rec.maxSpendBeyondReservoir * 1.10)
    )

    // When pool is sufficient, recommended should be 0
    expect(rec.isReservoirSufficient).toBe(true)
    expect(rec.recommendedEnterpriseBudget).toBe(0)
  })

  it('tooltip formula steps match recommendedEnterpriseBudget when pool is insufficient', () => {
    // Use standard pricing (smaller pool) and many users to exceed pool
    const rec = calcBudgetRecommendations(100, 60, 30, 20, 70, 15, false)

    expect(rec.maxRegularConsumption).toBe((100 + 60 - 20) * 30)
    expect(rec.maxPowerConsumption).toBe(20 * 70)
    expect(rec.maxTotalConsumption).toBe(rec.maxRegularConsumption + rec.maxPowerConsumption)

    const spendBeyond = Math.max(0, rec.maxTotalConsumption - rec.reservoirValue)
    expect(rec.maxSpendBeyondReservoir).toBe(spendBeyond)

    const withBuffer = Math.ceil(spendBeyond * 1.15)
    expect(rec.recommendedEnterpriseBudget).toBe(withBuffer)
    expect(rec.isReservoirSufficient).toBe(false)
  })
})

describe('FormulaTooltip accuracy — cost center budget', () => {
  it('tooltip formula steps match recommendedCostCenterBudget', () => {
    const rec = calcBudgetRecommendations(100, 60, 30, 20, 70, 15, false)

    // Step 1: power user share = maxPowerConsumption / maxTotalConsumption
    const expectedShare = rec.maxPowerConsumption / rec.maxTotalConsumption
    expect(rec.powerUserShareOfConsumption).toBeCloseTo(expectedShare)

    // Step 2: applied to spend beyond pool, rounded up
    const expected = Math.ceil(rec.maxSpendBeyondReservoir * expectedShare)
    expect(rec.recommendedCostCenterBudget).toBe(expected)
  })

  it('cost center budget is 0 when pool is sufficient', () => {
    const rec = calcBudgetRecommendations(130, 40, 30, 40, 70, 10, true)
    expect(rec.isReservoirSufficient).toBe(true)
    expect(rec.recommendedCostCenterBudget).toBe(0)
  })
})
