/**
 * End-to-end math smoke tests for the constraint system.
 *
 * These verify that License Configuration inputs flow correctly through:
 *   calcBudgetRecommendations → calcMultiCCConstraints
 * and that Steps 1, 2, and 5 produce consistent results.
 *
 * Reference: usage-based-billing-101.md and system-overview.md
 */
import { describe, it, expect } from 'vitest'
import {
  calcBudgetRecommendations,
  calcEnterpriseBudgetConstraint,
  calcMultiCCConstraints,
  type CostCenterConstraintInput,
  type UserBudgetRecord,
} from '../components/BudgetCalculator'

// --- License Config → Pool → Recommendations chain ---

describe('License Config affects pool and all downstream math', () => {
  it('changing CB/CE licenses changes pool and recommendations', () => {
    const small = calcBudgetRecommendations(10, 0, 30, 0, 0, 10, true)
    const large = calcBudgetRecommendations(100, 0, 30, 0, 0, 10, true)
    // More licenses = bigger pool
    expect(large.reservoirValue).toBeGreaterThan(small.reservoirValue)
    expect(large.totalUsers).toBeGreaterThan(small.totalUsers)
    // Same ULB but more users = higher total consumption
    expect(large.maxTotalConsumption).toBeGreaterThan(small.maxTotalConsumption)
  })

  it('promotional vs standard pricing changes pool size', () => {
    const promo = calcBudgetRecommendations(50, 10, 30, 5, 60, 10, true)
    const standard = calcBudgetRecommendations(50, 10, 30, 5, 60, 10, false)
    expect(promo.reservoirValue).toBeGreaterThan(standard.reservoirValue)
    expect(promo.cbAICsPerLicense).toBe(3000)
    expect(standard.cbAICsPerLicense).toBe(1900)
  })

  it('higher ULB increases post-pool exposure', () => {
    const low = calcBudgetRecommendations(50, 0, 19, 0, 0, 10, false)
    const high = calcBudgetRecommendations(50, 0, 100, 0, 0, 10, false)
    expect(high.maxSpendBeyondReservoir).toBeGreaterThan(low.maxSpendBeyondReservoir)
    expect(high.recommendedEnterpriseBudget).toBeGreaterThan(low.recommendedEnterpriseBudget)
  })

  it('buffer percentage scales the enterprise budget recommendation', () => {
    const noBuf = calcBudgetRecommendations(50, 0, 50, 5, 100, 0, true)
    const buf10 = calcBudgetRecommendations(50, 0, 50, 5, 100, 10, true)
    const buf50 = calcBudgetRecommendations(50, 0, 50, 5, 100, 50, true)
    expect(buf10.recommendedEnterpriseBudget).toBeGreaterThan(noBuf.recommendedEnterpriseBudget)
    expect(buf50.recommendedEnterpriseBudget).toBeGreaterThan(buf10.recommendedEnterpriseBudget)
    // 0% buffer = raw post-pool
    expect(noBuf.recommendedEnterpriseBudget).toBe(Math.ceil(noBuf.maxSpendBeyondReservoir))
  })
})

// --- Exclusion mode: enterprise vs CC budget scope ---

describe('Exclusion mode affects which budgets cover which users', () => {
  // Setup: 100 users, 80 in CC, 20 unassigned
  const ccMembers = Array.from({ length: 80 }, (_, i) => `user-${i}`)
  const ccInput: CostCenterConstraintInput[] = [
    { ccId: 'cc1', name: 'Engineering', budget: 2000, members: ccMembers },
  ]
  const universalULB = 30
  const poolValue = 1500 // small pool to force post-pool
  const totalLicenses = 100

  it('exclusion ON: enterprise budget covers only unassigned users', () => {
    const result = calcMultiCCConstraints(ccInput, [], universalULB, poolValue, 500, true, totalLicenses)
    // Unassigned: 20 users
    expect(result.unassignedUsers.count).toBe(20)
    // Unassigned constraint checks against enterprise budget
    expect(result.unassignedUsers.constraint.maxConsumption).toBe(20 * 30) // 600
    // CC constraint checks against CC budget independently
    expect(result.costCenters[0].constraint.maxConsumption).toBe(80 * 30) // 2400
    // totalMaxSpend = enterprise + CC budgets
    expect(result.totalMaxSpend).toBe(500 + 2000)
  })

  it('exclusion OFF: enterprise budget is umbrella for ALL users', () => {
    const result = calcMultiCCConstraints(ccInput, [], universalULB, poolValue, 500, false, totalLicenses)
    // Unassigned constraint uses total consumption (umbrella)
    expect(result.unassignedUsers.constraint.maxConsumption).toBe(100 * 30) // 3000
    // totalMaxSpend = enterprise budget alone
    expect(result.totalMaxSpend).toBe(500)
  })

  it('exclusion OFF: CC budget is sub-limit (can be binding even when enterprise is not)', () => {
    // Enterprise budget $5000 (enough for all), but CC budget $100 (too low)
    const result = calcMultiCCConstraints(
      [{ ccId: 'cc1', name: 'Team', budget: 100, members: ccMembers }],
      [], universalULB, poolValue, 5000, false, totalLicenses,
    )
    // Enterprise is not binding (huge budget)
    expect(result.unassignedUsers.constraint.isBinding).toBe(false)
    // But CC IS binding (sub-limit too low)
    expect(result.costCenters[0].constraint.isBinding).toBe(true)
  })
})

// --- Step 1 ↔ Step 5 consistency ---

describe('Step 1 and Step 5 enterprise budget consistency', () => {
  // Real-world scenario: individual ULBs make the CCC min higher than simplified model
  const ccMembers = Array.from({ length: 10 }, (_, i) => `user-${i}`)
  const userBudgets: UserBudgetRecord[] = [
    { login: 'heavy-1', amount: 500 },
    { login: 'heavy-2', amount: 500 },
  ]
  const poolValue = 500
  const universalULB = 30
  const totalLicenses = 20 // 10 in CC, 10 unassigned (2 with individual ULBs)

  it('CCC-derived min >= simplified model min (exclusion ON)', () => {
    const rec = calcBudgetRecommendations(20, 0, 30, 2, 500, 10, true)
    const ccInput: CostCenterConstraintInput[] = [
      { ccId: 'cc1', name: 'Team', budget: 1000, members: ccMembers },
    ]
    const mr = calcMultiCCConstraints(ccInput, userBudgets, universalULB, poolValue, 0, true, totalLicenses)
    const cccMin = Math.ceil(mr.unassignedUsers.constraint.shortfall * 1.10)
    const effectiveMin = Math.max(rec.recommendedEnterpriseBudget, cccMin)

    // The effective min should be at least as high as the simplified model
    expect(effectiveMin).toBeGreaterThanOrEqual(rec.recommendedEnterpriseBudget)

    // When Step 5 uses effectiveMin as enterprise budget, unassigned users should NOT be binding
    const mr2 = calcMultiCCConstraints(ccInput, userBudgets, universalULB, poolValue, effectiveMin, true, totalLicenses)
    expect(mr2.unassignedUsers.constraint.isBinding).toBe(false)
  })

  it('CCC-derived min >= simplified model min (exclusion OFF)', () => {
    const rec = calcBudgetRecommendations(20, 0, 30, 2, 500, 10, true)
    const ccInput: CostCenterConstraintInput[] = [
      { ccId: 'cc1', name: 'Team', budget: 1000, members: ccMembers },
    ]
    const mr = calcMultiCCConstraints(ccInput, userBudgets, universalULB, poolValue, 0, false, totalLicenses)
    const cccMin = Math.ceil(mr.unassignedUsers.constraint.shortfall * 1.10)
    const effectiveMin = Math.max(rec.recommendedEnterpriseBudget, cccMin)

    expect(effectiveMin).toBeGreaterThanOrEqual(rec.recommendedEnterpriseBudget)

    // With exclusion OFF and effectiveMin as budget, umbrella should not be binding
    const mr2 = calcMultiCCConstraints(ccInput, userBudgets, universalULB, poolValue, effectiveMin, false, totalLicenses)
    expect(mr2.unassignedUsers.constraint.isBinding).toBe(false)
  })
})

// --- Step 2 ↔ Step 5: CC budget changes flow through ---

describe('Step 2 CC budget changes affect Step 5 constraints', () => {
  const members = Array.from({ length: 10 }, (_, i) => `user-${i}`)
  const userBudgets: UserBudgetRecord[] = members.slice(0, 5).map(login => ({ login, amount: 200 }))
  const poolValue = 500
  const universalULB = 30

  it('lowering CC budget makes it binding', () => {
    const withHighBudget = calcMultiCCConstraints(
      [{ ccId: 'cc1', name: 'Team', budget: 5000, members }],
      userBudgets, universalULB, poolValue, 1000, true, 20,
    )
    const withLowBudget = calcMultiCCConstraints(
      [{ ccId: 'cc1', name: 'Team', budget: 10, members }],
      userBudgets, universalULB, poolValue, 1000, true, 20,
    )
    expect(withHighBudget.costCenters[0].constraint.isBinding).toBe(false)
    expect(withLowBudget.costCenters[0].constraint.isBinding).toBe(true)
  })

  it('step5BudgetOverrides scenario: override changes constraint result', () => {
    const ccInput: CostCenterConstraintInput[] = [
      { ccId: 'cc1', name: 'Team', budget: 10, members }, // low budget (as if overridden)
    ]
    const result = calcMultiCCConstraints(ccInput, userBudgets, universalULB, poolValue, 1000, true, 20)
    expect(result.costCenters[0].constraint.isBinding).toBe(true)

    // Simulate user overriding to the shortfall amount
    const shortfall = result.costCenters[0].constraint.shortfall
    const fixedInput: CostCenterConstraintInput[] = [
      { ccId: 'cc1', name: 'Team', budget: 10 + shortfall, members },
    ]
    const fixed = calcMultiCCConstraints(fixedInput, userBudgets, universalULB, poolValue, 1000, true, 20)
    expect(fixed.costCenters[0].constraint.isBinding).toBe(false)
  })
})

// --- Pool sharing proportionality ---

describe('Pool sharing is proportional to consumption', () => {
  it('CC with higher consumption gets larger pool share', () => {
    const heavyMembers = Array.from({ length: 10 }, (_, i) => `heavy-${i}`)
    const lightMembers = Array.from({ length: 10 }, (_, i) => `light-${i}`)
    const heavyBudgets: UserBudgetRecord[] = heavyMembers.map(login => ({ login, amount: 500 }))
    // Light users: no individual ULBs, universal ULB = $30
    const result = calcMultiCCConstraints(
      [
        { ccId: 'heavy', name: 'Heavy', budget: 5000, members: heavyMembers },
        { ccId: 'light', name: 'Light', budget: 5000, members: lightMembers },
      ],
      heavyBudgets, 30, 1000, 5000, true, 20,
    )
    const heavy = result.costCenters.find(c => c.ccId === 'heavy')!
    const light = result.costCenters.find(c => c.ccId === 'light')!

    // Heavy CC: 10×$500 = $5,000 max consumption
    // Light CC: 10×$30 = $300 max consumption
    expect(heavy.maxConsumption).toBe(5000)
    expect(light.maxConsumption).toBe(300)

    // Heavy gets proportionally more pool
    // Heavy share ≈ 5000/5300 ≈ 94.3%, Light share ≈ 300/5300 ≈ 5.7%
    // Heavy pool ≈ $943, Light pool ≈ $57
    // Heavy post-pool ≈ $4057, Light post-pool ≈ $243
    expect(heavy.constraint.affordableConsumption).toBeGreaterThan(light.constraint.affordableConsumption)
  })

  it('pool share sums to total pool value', () => {
    const result = calcMultiCCConstraints(
      [
        { ccId: 'a', name: 'A', budget: 5000, members: ['u1', 'u2', 'u3'] },
        { ccId: 'b', name: 'B', budget: 5000, members: ['u4', 'u5'] },
      ],
      [], 50, 1000, 5000, true, 10,
    )
    // Total affordable consumption when budgets are huge = pool + budgets (capped at max consumption)
    // Each CC's pool share should sum to approximately the total pool
    const totalMaxConsumption = result.costCenters.reduce((s, c) => s + c.maxConsumption, 0)
      + result.unassignedUsers.maxConsumption
    expect(totalMaxConsumption).toBe(10 * 50) // 500
    // Pool ($1000) > total consumption ($500), so pool covers everything
    result.costCenters.forEach(c => {
      expect(c.constraint.isBinding).toBe(false)
      expect(c.constraint.capacityPercent).toBe(100)
    })
  })
})

// --- Mixed individual + universal ULB accuracy ---

describe('Mixed ULB types compute consumption correctly', () => {
  it('individual ULBs override universal for specific users', () => {
    const members = ['alice', 'bob', 'charlie', 'dana']
    const userBudgets: UserBudgetRecord[] = [
      { login: 'alice', amount: 1000 },
      { login: 'bob', amount: 500 },
    ]
    const result = calcMultiCCConstraints(
      [{ ccId: 'cc1', name: 'Team', budget: 5000, members }],
      userBudgets, 30, 500, 1000, true, 4,
    )
    const cc = result.costCenters[0]
    // alice: $1000, bob: $500, charlie: $30, dana: $30
    expect(cc.maxConsumption).toBe(1000 + 500 + 30 + 30)
    expect(cc.uniULBCount).toBe(2) // charlie, dana
    expect(cc.indULBCount).toBe(2) // alice, bob
  })

  it('unassigned users with individual ULBs counted correctly', () => {
    const result = calcMultiCCConstraints(
      [{ ccId: 'cc1', name: 'Team', budget: 5000, members: ['alice'] }],
      [
        { login: 'bob', amount: 500 },   // unassigned, individual
        { login: 'charlie', amount: 300 }, // unassigned, individual
      ],
      30, 500, 1000, true, 5,
    )
    // Unassigned: 4 users (5 total - 1 in CC)
    // 2 with individual ULBs, 2 with universal
    expect(result.unassignedUsers.count).toBe(4)
    expect(result.unassignedUsers.indULBCount).toBe(2)
    expect(result.unassignedUsers.uniULBCount).toBe(2)
    expect(result.unassignedUsers.maxConsumption).toBe(500 + 300 + 2 * 30) // 860
  })
})

// --- Doc example verification ---

describe('Docs example: 100 CB, $25 ULB, 10 power @ $50', () => {
  // From usage-based-billing-101.md Part 2, Control 3
  const rec = calcBudgetRecommendations(100, 0, 25, 10, 50, 10, false)

  it('pool = $1,900', () => {
    expect(rec.reservoirValue).toBe(1900)
  })

  it('max draw = $2,750', () => {
    expect(rec.maxTotalConsumption).toBe(2750)
  })

  it('post-pool exposure = $850', () => {
    expect(rec.maxSpendBeyondReservoir).toBe(850)
  })

  it('enterprise limit with 10% buffer ≈ $935', () => {
    // ceil(850 * 1.10) = ceil(935) = 935... but 850*1.1=935.0 so ceil=935
    // Actually the test says 936 elsewhere — let me check: 850 * 1.1 = 935 exactly. ceil(935) = 935
    // But the existing test says 936... let me verify
    expect(rec.recommendedEnterpriseBudget).toBe(936)
    // This is because 850 * 1.10 = 935.0000...01 due to float precision
  })

  it('$200 enterprise limit is binding at ~76% capacity', () => {
    const c = calcEnterpriseBudgetConstraint(200, rec, false)
    expect(c.isBinding).toBe(true)
    expect(c.affordableConsumption).toBe(2100) // 1900 + 200
    expect(c.capacityPercent).toBeCloseTo(76.4, 0)
  })
})

// --- No-cost-center scenario (mirrors src/lib/demo-data.ts "nocc" variant) ---

describe('No cost centers: 130 CB + 40 CE, $39 ULB, 0 power users', () => {
  // Values sourced from demo-data.ts "nocc" variant: flat enterprise-wide billing
  const rec = calcBudgetRecommendations(130, 40, 39, 0, 0, 10, true)

  it('pool = $6,700 (promo: 130×3K + 40×7K AICs)', () => {
    expect(rec.reservoirValue).toBe(6700)
  })

  it('all 170 users are regular (0 power users)', () => {
    expect(rec.totalUsers).toBe(170)
    expect(rec.regularUsers).toBe(170)
    expect(rec.powerUserShareOfConsumption).toBe(0)
  })

  it('max draw = 170 × $39 = $6,630', () => {
    expect(rec.maxTotalConsumption).toBe(6630)
  })

  it('pool covers all usage (reservoir sufficient)', () => {
    expect(rec.isReservoirSufficient).toBe(true)
    expect(rec.maxSpendBeyondReservoir).toBe(0)
  })

  it('recommended enterprise budget = 0 (pool covers all)', () => {
    expect(rec.recommendedEnterpriseBudget).toBe(0)
  })

  it('recommended CC budget = 0 (no power users)', () => {
    expect(rec.recommendedCostCenterBudget).toBe(0)
  })

  it('constraint chain with zero CCs: all users unassigned', () => {
    const multi = calcMultiCCConstraints(
      [], [], rec.universalULB, rec.reservoirValue,
      10_000, false, rec.totalUsers,
    )
    expect(multi.costCenters).toHaveLength(0)
    expect(multi.unassignedUsers.count).toBe(170)
    expect(multi.unassignedUsers.uniULBCount).toBe(170)
    expect(multi.unassignedUsers.indULBCount).toBe(0)
    expect(multi.bindingCount).toBe(0)
    expect(multi.uncappedCount).toBe(0)
  })

  it('exclusion ON vs OFF produces same result with zero CCs', () => {
    const onResult = calcMultiCCConstraints(
      [], [], rec.universalULB, rec.reservoirValue, 500, true, rec.totalUsers,
    )
    const offResult = calcMultiCCConstraints(
      [], [], rec.universalULB, rec.reservoirValue, 500, false, rec.totalUsers,
    )
    // With no CCs, exclusion flag is irrelevant: both treat all users as unassigned
    expect(onResult.unassignedUsers.count).toBe(offResult.unassignedUsers.count)
    expect(onResult.unassignedUsers.maxConsumption).toBe(offResult.unassignedUsers.maxConsumption)
    expect(onResult.totalMaxSpend).toBe(offResult.totalMaxSpend)
  })

  it('low enterprise budget does not bind when pool covers all', () => {
    const entConstraint = calcEnterpriseBudgetConstraint(100, rec, false)
    expect(entConstraint.isBinding).toBe(false)
  })
})

describe('No cost centers: pool insufficient, enterprise budget binds', () => {
  // 50 CB, $50 ULB, 0 power users, standard pricing
  // Pool = 50 × $19 = $950, max draw = 50 × $50 = $2,500
  const rec = calcBudgetRecommendations(50, 0, 50, 0, 0, 10, false)

  it('pool does not cover all usage', () => {
    expect(rec.isReservoirSufficient).toBe(false)
    expect(rec.maxSpendBeyondReservoir).toBe(1550) // 2500 - 950
  })

  it('enterprise budget constraint detects binding', () => {
    const c = calcEnterpriseBudgetConstraint(500, rec, false)
    expect(c.isBinding).toBe(true)
    expect(c.affordableConsumption).toBe(1450) // 950 pool + 500 budget
    expect(c.maxConsumption).toBe(2500) // 50 × $50
    // shortfall = recommendedEnterpriseBudget - entBudget
    expect(c.shortfall).toBe(rec.recommendedEnterpriseBudget - 500)
  })

  it('multi-CC with zero CCs: unassigned users inherit enterprise constraint', () => {
    const multi = calcMultiCCConstraints(
      [], [], 50, rec.reservoirValue, 500, false, 50,
    )
    expect(multi.unassignedUsers.count).toBe(50)
    expect(multi.unassignedUsers.maxConsumption).toBe(2500)
    expect(multi.unassignedUsers.constraint.isBinding).toBe(true)
    expect(multi.unassignedUsers.constraint.affordableConsumption).toBe(1450)
  })
})
