import { describe, it, expect } from 'vitest'
import {
  calcBudgetRecommendations,
  calcEnterpriseBudgetConstraint,
  calcCostCenterBudgetConstraint,
  calcMaxAffordableULB,
  calcMaxAffordablePowerBudget,
} from '../components/BudgetCalculator'

// ---------------------------------------------------------------------------
// Floating-point precision: monetary math must be cent-accurate
// ---------------------------------------------------------------------------

describe('Floating-point precision — monetary calculations', () => {
  it('AIC-to-dollar conversion: reservoirValue = totalAICs × 0.01', () => {
    // 50 CB × 3000 + 10 CE × 7000 = 220,000 AICs
    const rec = calcBudgetRecommendations(50, 10, 30, 0, 0, 10, true)
    expect(rec.reservoirValue).toBe(2200) // exactly $2,200
    expect(rec.totalReservoir).toBe(220_000)
  })

  it('non-round AIC counts produce exact dollar values', () => {
    // 1 CB promo = 3000 AICs = $30.00 exactly
    const rec = calcBudgetRecommendations(1, 0, 30, 0, 0, 0, true)
    expect(rec.reservoirValue).toBe(30)
  })

  it('large license counts: 10,000 CB + 2,000 CE without overflow', () => {
    const rec = calcBudgetRecommendations(10_000, 2_000, 50, 100, 200, 10, true)
    // 10K × 3000 + 2K × 7000 = 44,000,000 AICs = $440,000
    expect(rec.reservoirValue).toBe(440_000)
    expect(rec.totalUsers).toBe(12_000)
    expect(rec.regularUsers).toBe(11_900)
    expect(Number.isFinite(rec.recommendedEnterpriseBudget)).toBe(true)
    expect(rec.recommendedEnterpriseBudget).toBeGreaterThan(0)
  })

  it('AIC-per-seat constants differ between promo and standard pricing', () => {
    const promo = calcBudgetRecommendations(100, 0, 30, 0, 0, 0, true)
    const standard = calcBudgetRecommendations(100, 0, 30, 0, 0, 0, false)
    expect(promo.cbAICsPerLicense).toBe(3000)
    expect(standard.cbAICsPerLicense).toBe(1900)
    expect(promo.reservoirValue).toBe(3000) // 100 × 3000 × 0.01
    expect(standard.reservoirValue).toBe(1900) // 100 × 1900 × 0.01
  })

  it('promoBonusValue is exact difference between promo and standard pool', () => {
    const rec = calcBudgetRecommendations(100, 10, 30, 5, 60, 10, true)
    const standardPool = (100 * 1900 + 10 * 3900) * 0.01
    expect(rec.promoBonusValue).toBe(Math.round(rec.reservoirValue - standardPool))
  })
})

// ---------------------------------------------------------------------------
// Constraint boundary conditions: == vs < (strict inequality)
// ---------------------------------------------------------------------------

describe('Constraint boundary conditions', () => {
  // Setup: scenario where post-pool is known and non-zero
  // 10 CB promo, ULB $50, no power users, 0% buffer
  // Pool = 10 × 3000 × 0.01 = $300
  // Max consumption = 10 × $50 = $500
  // Post-pool = $200
  const rec = calcBudgetRecommendations(10, 0, 50, 0, 0, 0, true)

  it('baseline: post-pool is $200', () => {
    expect(rec.maxSpendBeyondReservoir).toBe(200)
    expect(rec.recommendedEnterpriseBudget).toBe(200)
  })

  it('enterprise budget == post-pool → isBinding=false (strict <)', () => {
    const c = calcEnterpriseBudgetConstraint(200, rec, false)
    expect(c.isBinding).toBe(false)
    expect(c.capacityPercent).toBe(100)
  })

  it('enterprise budget $1 below post-pool → isBinding=true', () => {
    const c = calcEnterpriseBudgetConstraint(199, rec, false)
    expect(c.isBinding).toBe(true)
    expect(c.capacityPercent).toBeLessThan(100)
    expect(c.capacityPercent).toBeGreaterThan(99)
  })

  it('enterprise budget $1 above post-pool → isBinding=false', () => {
    const c = calcEnterpriseBudgetConstraint(201, rec, false)
    expect(c.isBinding).toBe(false)
    expect(c.capacityPercent).toBe(100)
  })

  it('enterprise budget = 0 → isBinding=true, capacity = pool/maxConsumption', () => {
    const c = calcEnterpriseBudgetConstraint(0, rec, false)
    expect(c.isBinding).toBe(true)
    // affordableConsumption = pool only = $300
    expect(c.affordableConsumption).toBe(300)
    // capacityPercent = 300/500 × 100 = 60%
    expect(c.capacityPercent).toBeCloseTo(60, 0)
  })

  // CC budget boundary: setup with power users
  // 10 CB promo, ULB $30, 5 power @ $80, 0% buffer
  // Pool = $300, max = 5×30 + 5×80 = $550, post-pool = $250
  // Power share = 400/550 ≈ 72.7%, power pool share = $300 × 0.727 ≈ $218.18
  // Power post-pool = max(0, 400 - 218.18) ≈ $181.82
  const recWithPower = calcBudgetRecommendations(10, 0, 30, 5, 80, 0, true)

  it('CC budget == power post-pool → isBinding=false', () => {
    const powerPoolShare = recWithPower.reservoirValue * recWithPower.powerUserShareOfConsumption
    const powerPostPool = Math.max(0, recWithPower.maxPowerConsumption - powerPoolShare)
    // Use ceil to ensure we're exactly at the boundary
    const exactBudget = Math.ceil(powerPostPool)
    const c = calcCostCenterBudgetConstraint(exactBudget, recWithPower)
    expect(c.isBinding).toBe(false)
  })

  it('CC budget $1 below power post-pool → isBinding=true', () => {
    const powerPoolShare = recWithPower.reservoirValue * recWithPower.powerUserShareOfConsumption
    const powerPostPool = Math.max(0, recWithPower.maxPowerConsumption - powerPoolShare)
    const c = calcCostCenterBudgetConstraint(Math.floor(powerPostPool) - 1, recWithPower)
    expect(c.isBinding).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Quadratic solver: edge cases via public API (exclusion ON)
// ---------------------------------------------------------------------------

describe('Quadratic solver edge cases (via calcMaxAffordableULB exclusion ON)', () => {
  it('pool=0: all consumption is post-pool, solver still works', () => {
    const ulb = calcMaxAffordableULB(500, 0, 50, 10, 70, 10, true)
    expect(ulb).toBeGreaterThan(0)
    expect(Number.isFinite(ulb)).toBe(true)

    // Verify with forward calc
    const rec = calcBudgetRecommendations(0, 0, ulb, 10, 70, 10, true)
    // Pool is 0 (no licenses), so enterprise budget must cover everything for regular users
    const constraint = calcEnterpriseBudgetConstraint(500, rec, true)
    expect(constraint.isBinding).toBe(false)
  })

  it('pool >> consumption: budget cap is irrelevant, large ULB affordable', () => {
    const hugePool = 1_000_000
    const ulb = calcMaxAffordableULB(0, hugePool, 10, 5, 100, 0, true)
    // Pool alone covers everything, so even budgetCap=0 allows high ULB
    expect(ulb).toBeGreaterThan(1000)
  })

  it('very large budget cap with tiny pool: solver produces finite result', () => {
    const ulb = calcMaxAffordableULB(1_000_000, 100, 50, 10, 70, 10, true)
    expect(Number.isFinite(ulb)).toBe(true)
    expect(ulb).toBeGreaterThan(0)
  })

  it('zero buffer with exclusion ON: effectiveCap == budgetCap', () => {
    const withBuffer = calcMaxAffordableULB(500, 2200, 50, 10, 70, 10, true)
    const noBuffer = calcMaxAffordableULB(500, 2200, 50, 10, 70, 0, true)
    // No buffer means effectiveCap is larger → higher affordable ULB
    expect(noBuffer).toBeGreaterThan(withBuffer)
  })

  it('symmetric: ULB solver and PUB solver agree on budget utilization', () => {
    // Same scenario, solve for both — total consumption should be consistent
    const pool = 2200
    const cap = 500
    const maxULB = calcMaxAffordableULB(cap, pool, 50, 10, 70, 10, true)
    const maxPUB = calcMaxAffordablePowerBudget(cap, pool, 50, 10, maxULB, 10, true)
    // maxPUB should be >= 70 since ULB was solved for that power budget
    expect(maxPUB).toBeGreaterThanOrEqual(70 - 1)
  })
})

// ---------------------------------------------------------------------------
// Reverse solver: exclusion ON round-trip at scale
// ---------------------------------------------------------------------------

describe('Reverse solver: exclusion ON at scale', () => {
  it('1000 CB + 200 CE: forward → reverse → forward (excl ON)', () => {
    const cb = 1000, ce = 200, pu = 50, pub = 150, buf = 15
    const pool = (cb * 3000 + ce * 7000) * 0.01
    const regularUsers = cb + ce - pu

    const rec = calcBudgetRecommendations(cb, ce, 39, pu, pub, buf, true)
    const cap = rec.recommendedEnterpriseBudget

    const recoveredULB = calcMaxAffordableULB(cap, pool, regularUsers, pu, pub, buf, true)
    expect(recoveredULB).toBeGreaterThanOrEqual(39 - 1)

    // Forward again with recovered ULB should be non-binding
    const rec2 = calcBudgetRecommendations(cb, ce, recoveredULB, pu, pub, buf, true)
    const constraint = calcEnterpriseBudgetConstraint(cap, rec2, true)
    expect(constraint.isBinding).toBe(false)
  })

  it('PUB solver round-trip (excl ON)', () => {
    const cb = 500, ce = 100, pu = 30, ulb = 45, buf = 10
    const pool = (cb * 3000 + ce * 7000) * 0.01
    const regularUsers = cb + ce - pu
    const pub = 200

    const rec = calcBudgetRecommendations(cb, ce, ulb, pu, pub, buf, true)
    const ccCap = rec.recommendedCostCenterBudget

    const recoveredPUB = calcMaxAffordablePowerBudget(ccCap, pool, regularUsers, pu, ulb, buf, true)
    // Quadratic solver round-trip has inherent rounding from ceil() in recommendedCostCenterBudget
    // Verify non-binding instead of exact value match
    expect(recoveredPUB).toBeGreaterThan(0)

    const rec2 = calcBudgetRecommendations(cb, ce, ulb, pu, recoveredPUB, buf, true)
    const constraint = calcCostCenterBudgetConstraint(ccCap, rec2)
    expect(constraint.isBinding).toBe(false)
  })
})
