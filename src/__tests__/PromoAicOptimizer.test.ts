import { describe, it, expect } from 'vitest'
import { optimizeSeats } from '../lib/promo-optimizer'

// CB = $19/seat → 3K AICs, CE = $39/seat → 7K AICs, PAYG = $0.01/AIC
// CB→CE upgrade: +$20 incremental, +4K AICs ($5/1K — cheapest path)

describe('optimizeSeats', () => {
  it('returns zero seats when existing AICs already cover budget', () => {
    const result = optimizeSeats(100, 10, 10_000, 50, 10)
    expect(result.cbToceUpgrades).toBe(0)
    expect(result.newCbSeats).toBe(0)
    expect(result.aicsGained).toBe(0)
    expect(result.reducedBudget).toBe(0)
  })

  it('returns zero seats for zero budget', () => {
    const result = optimizeSeats(0, 10, 0, 50, 10)
    expect(result.cbToceUpgrades).toBe(0)
    expect(result.newCbSeats).toBe(0)
    expect(result.aicsGained).toBe(0)
  })

  it('prioritizes CB→CE upgrades when enterprise has CE and free GHEC', () => {
    // $80 budget = 8K AICs needed. 50 CB, 5 CE, 10 free GHEC.
    // 2 CB→CE upgrades = +8K AICs at $40 ($20 each). Covered.
    const result = optimizeSeats(80, 10, 0, 50, 5)
    expect(result.cbToceUpgrades).toBe(2)
    expect(result.newCbSeats).toBe(0)
    expect(result.aicsGained).toBe(8_000)
    expect(result.seatCost).toBe(40) // 2 × $20
    expect(result.reducedBudget).toBe(0)
  })

  it('falls back to new CB when no existing CE seats', () => {
    // $90 budget = 9K AICs. 50 CB, 0 CE, 10 free GHEC.
    // No CE seats → can't upgrade CB→CE. 3 new CB = 9K AICs.
    const result = optimizeSeats(90, 10, 0, 50, 0)
    expect(result.cbToceUpgrades).toBe(0)
    expect(result.newCbSeats).toBe(3)
    expect(result.aicsGained).toBe(9_000)
    expect(result.seatCost).toBe(57) // 3 × $19
  })

  it('falls back to new CB when no free GHEC seats', () => {
    // $90 budget = 9K AICs. 50 CB, 5 CE, 0 free GHEC.
    // No GHEC headroom → can't upgrade. 3 new CB = 9K AICs.
    const result = optimizeSeats(90, 0, 0, 50, 5)
    expect(result.cbToceUpgrades).toBe(0)
    expect(result.newCbSeats).toBe(3)
    expect(result.aicsGained).toBe(9_000)
  })

  it('mixes CB→CE upgrades with new CB for remaining', () => {
    // $100 budget = 10K AICs. 3 CB, 2 CE, 5 free GHEC.
    // 3 CB→CE upgrades (limited by CB count) = +12K > 10K. Covered.
    const result = optimizeSeats(100, 5, 0, 3, 2)
    expect(result.cbToceUpgrades).toBe(3) // limited by existing CB
    expect(result.newCbSeats).toBe(0)
    expect(result.reducedBudget).toBe(0)
  })

  it('shows savings vs pay-as-you-go', () => {
    // $100 budget = 10K AICs. 0 CB, 0 CE, 0 GHEC.
    // No upgrades possible. 4 new CB = 12K AICs = $76 seat cost
    // PAYG equivalent: 12K × $0.01 = $120
    const result = optimizeSeats(100, 0, 0, 0, 0)
    expect(result.seatCost).toBe(76)
    expect(result.paygEquivalent).toBe(120)
    expect(result.savings).toBe(44)
  })

  it('limits CB→CE upgrades to available GHEC headroom', () => {
    // 50 CB, 5 CE, but only 2 free GHEC. Max 2 upgrades.
    const result = optimizeSeats(200, 2, 0, 50, 5)
    expect(result.cbToceUpgrades).toBeLessThanOrEqual(2)
  })
})

// --- Edge cases ---

describe('optimizeSeats edge cases', () => {
  it('handles budget exactly at entitlement threshold (no surplus)', () => {
    // 10 CB × 3K = 30K AICs. Budget = 30K × $0.01 = $300.
    // Existing AICs exactly cover budget → no action needed.
    const result = optimizeSeats(300, 10, 30_000, 10, 5)
    expect(result.cbToceUpgrades).toBe(0)
    expect(result.newCbSeats).toBe(0)
    expect(result.aicsGained).toBe(0)
    expect(result.reducedBudget).toBe(0)
  })

  it('handles budget one cent above entitlement threshold', () => {
    // Existing AICs = 30K → covers $300. Budget = $300.01 → needs 1 more AIC.
    // 1 CB→CE upgrade = +4K AICs (overkill, but minimum action).
    const result = optimizeSeats(300.01, 10, 30_000, 10, 5)
    expect(result.aicsGained).toBeGreaterThan(0)
  })

  it('handles very large budget requiring many seats', () => {
    // $10K budget = 1M AICs needed. 0 existing.
    // 1M / 3K = 334 new CB seats.
    const result = optimizeSeats(10_000, 0, 0, 0, 0)
    expect(result.newCbSeats).toBe(334)
    expect(result.aicsGained).toBe(334 * 3_000)
    expect(result.seatCost).toBe(334 * 19)
  })

  it('handles single CB seat, single CE seat', () => {
    // 1 CB, 1 CE, 1 free GHEC. $40 budget = 4K AICs.
    // 1 CB→CE upgrade = +4K AICs. Perfect fit.
    const result = optimizeSeats(40, 1, 0, 1, 1)
    expect(result.cbToceUpgrades).toBe(1)
    expect(result.newCbSeats).toBe(0)
    expect(result.aicsGained).toBe(4_000)
  })

  it('savings are always non-negative', () => {
    // Seat cost should never exceed PAYG equivalent
    const result = optimizeSeats(500, 5, 0, 100, 10)
    expect(result.savings).toBeGreaterThanOrEqual(0)
  })

  it('PAYG equivalent matches AIC gain at $0.01 rate', () => {
    const result = optimizeSeats(200, 0, 0, 0, 0)
    expect(result.paygEquivalent).toBeCloseTo(result.aicsGained * 0.01)
  })

  it('reducedBudget is zero when entitlements fully cover budget', () => {
    // 50 CB × 3K = 150K AICs. Budget $100 = 10K AICs.
    // Already covered. No action, no residual budget.
    const result = optimizeSeats(100, 0, 150_000, 50, 0)
    expect(result.reducedBudget).toBe(0)
  })

  it('handles negative existing AICs gracefully (treated as zero)', () => {
    // Shouldn't happen in practice, but the function should not crash.
    const result = optimizeSeats(100, 5, -1000, 10, 5)
    expect(result.aicsGained).toBeGreaterThan(0)
  })
})
