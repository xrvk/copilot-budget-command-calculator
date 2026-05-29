import { describe, it, expect } from 'vitest'
import { classifyBudgetTier, computeUncappedCcCount } from '../lib/tier-classification'

// ---------------------------------------------------------------------------
// classifyBudgetTier
// ---------------------------------------------------------------------------

describe('classifyBudgetTier', () => {
  // --- Hard cap scenarios ---

  it('returns hard when preventFurtherUsage is true', () => {
    expect(classifyBudgetTier({
      preventFurtherUsage: true,
      budgetAlertingEnabled: true,
    })).toBe('hard')
  })

  it('returns hard when preventFurtherUsage is true and alerts are off', () => {
    expect(classifyBudgetTier({
      preventFurtherUsage: true,
      budgetAlertingEnabled: false,
    })).toBe('hard')
  })

  it('returns hard when preventFurtherUsage is true and alerts are null', () => {
    expect(classifyBudgetTier({
      preventFurtherUsage: true,
      budgetAlertingEnabled: null,
    })).toBe('hard')
  })

  // --- PR #212 regression: hard → soft downgrade with uncapped CCs ---

  it('downgrades to soft when exclusion ON and uncapped CCs exist', () => {
    expect(classifyBudgetTier({
      preventFurtherUsage: true,
      budgetAlertingEnabled: true,
      excludeCostCenters: true,
      uncappedCcCount: 3,
    })).toBe('soft')
  })

  it('downgrades to soft with a single uncapped CC', () => {
    expect(classifyBudgetTier({
      preventFurtherUsage: true,
      budgetAlertingEnabled: true,
      excludeCostCenters: true,
      uncappedCcCount: 1,
    })).toBe('soft')
  })

  it('stays hard when exclusion ON but all CCs are capped', () => {
    expect(classifyBudgetTier({
      preventFurtherUsage: true,
      budgetAlertingEnabled: true,
      excludeCostCenters: true,
      uncappedCcCount: 0,
    })).toBe('hard')
  })

  it('stays hard when exclusion OFF even with uncapped CCs', () => {
    // Exclusion OFF means the enterprise budget is the umbrella —
    // CC budgets are sub-limits, so uncapped CCs don't bypass the enterprise cap.
    expect(classifyBudgetTier({
      preventFurtherUsage: true,
      budgetAlertingEnabled: true,
      excludeCostCenters: false,
      uncappedCcCount: 5,
    })).toBe('hard')
  })

  // --- Soft cap scenarios ---

  it('returns soft when preventFurtherUsage is false and alerts are on', () => {
    expect(classifyBudgetTier({
      preventFurtherUsage: false,
      budgetAlertingEnabled: true,
    })).toBe('soft')
  })

  it('returns soft when preventFurtherUsage is false and alerts true, with exclusion params', () => {
    expect(classifyBudgetTier({
      preventFurtherUsage: false,
      budgetAlertingEnabled: true,
      excludeCostCenters: true,
      uncappedCcCount: 2,
    })).toBe('soft')
  })

  // --- Blind (uncapped) scenarios ---

  it('returns blind when preventFurtherUsage is false and no alerts', () => {
    expect(classifyBudgetTier({
      preventFurtherUsage: false,
      budgetAlertingEnabled: false,
    })).toBe('blind')
  })

  it('returns blind when preventFurtherUsage is false and alerts null', () => {
    expect(classifyBudgetTier({
      preventFurtherUsage: false,
      budgetAlertingEnabled: null,
    })).toBe('blind')
  })

  // --- Defaults ---

  it('treats omitted excludeCostCenters as false (no downgrade)', () => {
    expect(classifyBudgetTier({
      preventFurtherUsage: true,
      budgetAlertingEnabled: true,
      // excludeCostCenters omitted
      uncappedCcCount: 5,
    })).toBe('hard')
  })

  it('treats omitted uncappedCcCount as 0 (no downgrade)', () => {
    expect(classifyBudgetTier({
      preventFurtherUsage: true,
      budgetAlertingEnabled: true,
      excludeCostCenters: true,
      // uncappedCcCount omitted
    })).toBe('hard')
  })
})

// ---------------------------------------------------------------------------
// computeUncappedCcCount
// ---------------------------------------------------------------------------

describe('computeUncappedCcCount', () => {
  it('returns 0 when exclusion is OFF regardless of CC budgets', () => {
    const ccs = [
      { name: 'Engineering', budget: 0 },
      { name: 'Marketing', budget: 0 },
    ]
    expect(computeUncappedCcCount(ccs, false)).toBe(0)
  })

  it('counts CCs with budget=0 when exclusion is ON', () => {
    const ccs = [
      { name: 'Engineering', budget: 500 },
      { name: 'Marketing', budget: 0 },
      { name: 'Sales', budget: 0 },
      { name: 'Support', budget: 200 },
    ]
    expect(computeUncappedCcCount(ccs, true)).toBe(2)
  })

  it('returns 0 when all CCs have budgets', () => {
    const ccs = [
      { name: 'Engineering', budget: 500 },
      { name: 'Marketing', budget: 300 },
    ]
    expect(computeUncappedCcCount(ccs, true)).toBe(0)
  })

  it('returns 0 for empty array', () => {
    expect(computeUncappedCcCount([], true)).toBe(0)
  })

  it('ignores blank-named rows (empty input placeholders)', () => {
    const ccs = [
      { name: '', budget: 0 },
      { name: '  ', budget: 0 },
      { name: 'Engineering', budget: 0 },
    ]
    expect(computeUncappedCcCount(ccs, true)).toBe(1)
  })

  it('does not count CCs with budget > 0 as uncapped', () => {
    const ccs = [
      { name: 'Engineering', budget: 1 },
      { name: 'Marketing', budget: 0 },
    ]
    expect(computeUncappedCcCount(ccs, true)).toBe(1)
  })
})
