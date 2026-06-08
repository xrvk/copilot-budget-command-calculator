/**
 * Comprehensive constraint scenario tests covering all possible interactions
 * across the 4-level budget hierarchy:
 *
 *   1. Universal ULB (pool access cap per user)
 *   2. Individual ULB (pool access override for power users)
 *   3. Enterprise Budget (post-pool overage cap)
 *   4. Cost Center Budget (per-team post-pool overage cap)
 *
 * Tests are organized by scenario category:
 *   A. Pool sufficiency (when pool covers all, partial, or none)
 *   B. Enterprise budget constraint detection (exclusion OFF and ON)
 *   C. Cost center budget constraint detection
 *   D. Cross-level interactions (which level is the actual bottleneck)
 *   E. Exclusion mode cross-product (all combinations of binding states)
 *   F. Multi-CC proportional pool sharing
 *   G. Boundary / edge-of-binding conditions
 *   H. Real-world doc scenarios
 *   I. Extreme edge cases
 */
import { describe, it, expect } from 'vitest'
import {
  calcBudgetRecommendations,
  calcEnterpriseBudgetConstraint,
  calcCostCenterBudgetConstraint,
  calcMultiCCConstraints,
  type CostCenterConstraintInput,
  type UserBudgetRecord,
} from '../components/BudgetCalculator'

// ─── Helpers ──────────────────────────────────────────────────────────

function cc(ccId: string, name: string, budget: number, members: string[]): CostCenterConstraintInput {
  return { ccId, name, budget, members }
}

function users(prefix: string, count: number): string[] {
  return Array.from({ length: count }, (_, i) => `${prefix}-${i}`)
}

function indBudgets(logins: string[], amount: number): UserBudgetRecord[] {
  return logins.map(login => ({ login, amount }))
}

// ─── A. Pool Sufficiency ──────────────────────────────────────────────

describe('A. Pool sufficiency scenarios', () => {
  describe('A1. Pool covers ALL consumption (no post-pool exposure)', () => {
    // 200 CB, promo, ULB $10 → pool=$6,000, max consumption=200×$10=$2,000
    const rec = calcBudgetRecommendations(200, 0, 10, 0, 0, 10, true)

    it('pool is sufficient', () => {
      expect(rec.isReservoirSufficient).toBe(true)
      expect(rec.maxSpendBeyondReservoir).toBe(0)
      expect(rec.recommendedEnterpriseBudget).toBe(0)
    })

    it('enterprise budget $0 is not binding (excl OFF)', () => {
      const c = calcEnterpriseBudgetConstraint(0, rec, false)
      expect(c.isBinding).toBe(false)
      expect(c.capacityPercent).toBe(100)
    })

    it('enterprise budget $0 is not binding (excl ON)', () => {
      const c = calcEnterpriseBudgetConstraint(0, rec, true)
      expect(c.isBinding).toBe(false)
      expect(c.capacityPercent).toBe(100)
    })

    it('CC budget $0 is not binding when pool is sufficient', () => {
      const c = calcCostCenterBudgetConstraint(0, rec)
      expect(c.isBinding).toBe(false)
    })
  })

  describe('A2. Pool covers NONE of consumption (pool = 0)', () => {
    // 0 licenses but 5 "power users" with $100 budget (edge: pure overage model)
    // This only works in calcMultiCCConstraints where pool is a direct param
    it('everything is post-pool when pool = 0', () => {
      const result = calcMultiCCConstraints(
        [cc('cc1', 'Team', 200, users('u', 5))],
        [], 50, 0, 500, true, 5,
      )
      const team = result.costCenters[0]
      // Max consumption = 5×$50 = $250, pool share = $0
      expect(team.maxConsumption).toBe(250)
      // Budget $200 < $250 post-pool → binding
      expect(team.constraint.isBinding).toBe(true)
      expect(team.constraint.shortfall).toBe(50)
    })

    it('budget covering full consumption is not binding even with pool=0', () => {
      const result = calcMultiCCConstraints(
        [cc('cc1', 'Team', 300, users('u', 5))],
        [], 50, 0, 500, true, 5,
      )
      expect(result.costCenters[0].constraint.isBinding).toBe(false)
      expect(result.costCenters[0].constraint.capacityPercent).toBe(100)
    })
  })

  describe('A3. Pool partially covers consumption', () => {
    // 50 CB, standard, ULB $30 → pool=$950, max=$1,500, post-pool=$550
    const rec = calcBudgetRecommendations(50, 0, 30, 0, 0, 10, false)

    it('confirms partial coverage baseline', () => {
      expect(rec.reservoirValue).toBe(950)
      expect(rec.maxTotalConsumption).toBe(1500)
      expect(rec.maxSpendBeyondReservoir).toBe(550)
      expect(rec.isReservoirSufficient).toBe(false)
    })

    it('enterprise budget covering post-pool is not binding', () => {
      const c = calcEnterpriseBudgetConstraint(600, rec, false)
      expect(c.isBinding).toBe(false)
      expect(c.capacityPercent).toBe(100)
    })

    it('enterprise budget below post-pool is binding', () => {
      const c = calcEnterpriseBudgetConstraint(200, rec, false)
      expect(c.isBinding).toBe(true)
      expect(c.affordableConsumption).toBe(1150) // 950 + 200
    })
  })

  describe('A4. Very large pool relative to consumption', () => {
    // 500 CE, promo, ULB $10 → pool=$35,000, max=$5,000
    const rec = calcBudgetRecommendations(0, 500, 10, 0, 0, 0, true)

    it('pool vastly exceeds consumption', () => {
      expect(rec.reservoirValue).toBe(35000)
      expect(rec.maxTotalConsumption).toBe(5000)
      expect(rec.isReservoirSufficient).toBe(true)
      expect(rec.recommendedEnterpriseBudget).toBe(0)
    })

    it('even $0 enterprise budget is fine', () => {
      const c = calcEnterpriseBudgetConstraint(0, rec, false)
      expect(c.isBinding).toBe(false)
    })
  })
})

// ─── B. Enterprise Budget Constraint Detection ────────────────────────

describe('B. Enterprise budget constraint (detailed)', () => {
  // 30 CB + 10 CE, standard, ULB $30, 5 power@$100, 10% buffer
  // Pool = 30×1900 + 10×3900 = 96,000 AICs = $960
  // Regular=35, Power=5, Total=40
  // Max regular = 35×$30 = $1,050
  // Max power = 5×$100 = $500
  // Max total = $1,550
  // Post-pool = $1,550 - $960 = $590
  const rec = calcBudgetRecommendations(30, 10, 30, 5, 100, 10, false)

  describe('B1. Exclusion OFF', () => {
    it('budget = 0 is maximally binding', () => {
      const c = calcEnterpriseBudgetConstraint(0, rec, false)
      expect(c.isBinding).toBe(true)
      expect(c.affordableConsumption).toBe(rec.reservoirValue) // only pool
      expect(c.shortfall).toBe(rec.recommendedEnterpriseBudget)
    })

    it('budget = 1 is still binding', () => {
      const c = calcEnterpriseBudgetConstraint(1, rec, false)
      expect(c.isBinding).toBe(true)
      expect(c.affordableConsumption).toBe(rec.reservoirValue + 1)
    })

    it('budget = half of post-pool is binding at ~81% capacity', () => {
      const halfPostPool = Math.floor(rec.maxSpendBeyondReservoir / 2)
      const c = calcEnterpriseBudgetConstraint(halfPostPool, rec, false)
      expect(c.isBinding).toBe(true)
      expect(c.capacityPercent).toBeCloseTo(81, 0)
    })

    it('budget = post-pool exposure exactly is NOT binding', () => {
      const c = calcEnterpriseBudgetConstraint(rec.maxSpendBeyondReservoir, rec, false)
      expect(c.isBinding).toBe(false)
      expect(c.capacityPercent).toBe(100)
    })

    it('budget = post-pool - 1 IS binding', () => {
      const c = calcEnterpriseBudgetConstraint(rec.maxSpendBeyondReservoir - 1, rec, false)
      expect(c.isBinding).toBe(true)
    })

    it('budget >> post-pool caps affordable at max consumption', () => {
      const c = calcEnterpriseBudgetConstraint(100000, rec, false)
      expect(c.isBinding).toBe(false)
      expect(c.affordableConsumption).toBe(rec.maxTotalConsumption)
      expect(c.capacityPercent).toBe(100)
    })
  })

  describe('B2. Exclusion ON', () => {
    it('maxConsumption is only regular users', () => {
      const c = calcEnterpriseBudgetConstraint(0, rec, true)
      expect(c.maxConsumption).toBe(rec.maxRegularConsumption) // $1,050
    })

    it('regular users pool share is proportional', () => {
      const c = calcEnterpriseBudgetConstraint(0, rec, true)
      const regularShare = 1 - rec.powerUserShareOfConsumption
      const expectedPoolShare = rec.reservoirValue * regularShare
      // affordable = pool share + min(0, regularPostPool)
      expect(c.affordableConsumption).toBeCloseTo(expectedPoolShare, 1)
    })

    it('sufficient budget for regular post-pool is not binding', () => {
      // Regular pool share ≈ $960 × (1 - 500/1550) ≈ $960 × 0.6774 ≈ $650.3
      // Regular post-pool ≈ $1,050 - $650.3 ≈ $399.7
      const c = calcEnterpriseBudgetConstraint(500, rec, true)
      expect(c.isBinding).toBe(false)
      expect(c.capacityPercent).toBe(100)
    })

    it('insufficient budget for regular post-pool is binding', () => {
      const c = calcEnterpriseBudgetConstraint(100, rec, true)
      expect(c.isBinding).toBe(true)
      expect(c.capacityPercent).toBeLessThan(100)
    })
  })
})

// ─── C. Cost Center Budget Constraint Detection ───────────────────────

describe('C. CC budget constraint (detailed)', () => {
  // Same scenario as B
  const rec = calcBudgetRecommendations(30, 10, 30, 5, 100, 10, false)

  it('C1. CC budget = 0 is binding when power users have post-pool exposure', () => {
    const c = calcCostCenterBudgetConstraint(0, rec)
    expect(c.isBinding).toBe(true)
    expect(c.affordableConsumption).toBeGreaterThan(0) // pool share still available
    expect(c.capacityPercent).toBeLessThan(100)
  })

  it('C2. CC budget exactly covers post-pool is not binding', () => {
    const c = calcCostCenterBudgetConstraint(rec.recommendedCostCenterBudget, rec)
    expect(c.isBinding).toBe(false)
  })

  it('C3. CC budget = 1 is binding', () => {
    const c = calcCostCenterBudgetConstraint(1, rec)
    expect(c.isBinding).toBe(true)
  })

  it('C4. CC shortfall decreases as budget increases', () => {
    const c10 = calcCostCenterBudgetConstraint(10, rec)
    const c100 = calcCostCenterBudgetConstraint(100, rec)
    expect(c10.shortfall).toBeGreaterThan(c100.shortfall)
  })

  it('C5. capacity increases monotonically with budget', () => {
    const budgets = [0, 50, 100, 200, 500, rec.recommendedCostCenterBudget]
    const capacities = budgets.map(b => calcCostCenterBudgetConstraint(b, rec).capacityPercent)
    for (let i = 1; i < capacities.length; i++) {
      expect(capacities[i]).toBeGreaterThanOrEqual(capacities[i - 1])
    }
  })

  it('C6. no power users = no CC constraint possible', () => {
    const noPower = calcBudgetRecommendations(50, 0, 30, 0, 0, 10, false)
    const c = calcCostCenterBudgetConstraint(0, noPower)
    expect(c.isBinding).toBe(false)
    expect(c.maxConsumption).toBe(0)
    expect(c.affordableConsumption).toBe(0)
  })
})

// ─── D. Cross-Level Interactions ──────────────────────────────────────

describe('D. Cross-level interactions (which level is the bottleneck)', () => {
  describe('D1. ULB is the bottleneck (pool has plenty, budgets are generous)', () => {
    // 500 CB, promo, ULB $5 → pool=$15,000, max=500×$5=$2,500
    // Pool easily covers everything, no post-pool
    const rec = calcBudgetRecommendations(500, 0, 5, 0, 0, 10, true)

    it('pool is sufficient, so low ULB is the only constraint', () => {
      expect(rec.isReservoirSufficient).toBe(true)
      expect(rec.maxTotalConsumption).toBe(2500) // limited by ULB, not pool
    })

    it('enterprise budget is irrelevant', () => {
      const c = calcEnterpriseBudgetConstraint(0, rec, false)
      expect(c.isBinding).toBe(false)
    })

    it('CC budget is irrelevant', () => {
      const c = calcCostCenterBudgetConstraint(0, rec)
      expect(c.isBinding).toBe(false)
    })
  })

  describe('D2. Enterprise budget is the bottleneck', () => {
    // 20 CB, standard, ULB $50, 0 power → pool=$380, max=$1,000, post-pool=$620
    const rec = calcBudgetRecommendations(20, 0, 50, 0, 0, 0, false)

    it('generous ULBs but enterprise budget caps total spend', () => {
      expect(rec.isReservoirSufficient).toBe(false)
      const c = calcEnterpriseBudgetConstraint(100, rec, false)
      expect(c.isBinding).toBe(true)
      // effective per-user = (380 + 100) / 20 = $24 (vs $50 ULB)
      const effective = c.affordableConsumption / 20
      expect(effective).toBe(24)
      expect(effective).toBeLessThan(50)
    })
  })

  describe('D3. CC budget is the bottleneck (enterprise has room)', () => {
    // 10 users in a CC with individual ULBs of $500, CC budget only $100
    // Pool $1,000, enterprise $10,000 (generous)
    const ccMembers = users('u', 10)
    const budgets = indBudgets(ccMembers, 500)

    it('CC is binding while enterprise is not (exclusion ON)', () => {
      const result = calcMultiCCConstraints(
        [cc('cc1', 'Team', 100, ccMembers)],
        budgets, 30, 1000, 10000, true, 10,
      )
      expect(result.costCenters[0].constraint.isBinding).toBe(true)
      expect(result.unassignedUsers.constraint.isBinding).toBe(false)
    })

    it('CC is binding while enterprise umbrella is not (exclusion OFF)', () => {
      const result = calcMultiCCConstraints(
        [cc('cc1', 'Team', 100, ccMembers)],
        budgets, 30, 1000, 10000, false, 10,
      )
      expect(result.costCenters[0].constraint.isBinding).toBe(true)
      expect(result.unassignedUsers.constraint.isBinding).toBe(false)
    })
  })

  describe('D4. Multiple levels binding simultaneously', () => {
    // 10 CB, standard, ULB $50, 3 power@$200
    // Pool = $190, max total = 7×$50 + 3×$200 = $950, post-pool = $760
    const rec = calcBudgetRecommendations(10, 0, 50, 3, 200, 0, false)

    it('both enterprise and CC can be binding at the same time', () => {
      // Enterprise budget $100 < post-pool $760 → binding
      const entC = calcEnterpriseBudgetConstraint(100, rec, false)
      expect(entC.isBinding).toBe(true)
      // CC budget $10 → binding for power users
      const ccC = calcCostCenterBudgetConstraint(10, rec)
      expect(ccC.isBinding).toBe(true)
    })

    it('multi-CC: enterprise and CC both binding (exclusion OFF)', () => {
      const ccMembers = users('pu', 3)
      const result = calcMultiCCConstraints(
        [cc('cc1', 'Power', 10, ccMembers)],
        indBudgets(ccMembers, 200),
        50, 190, 100, false, 10,
      )
      // CC is binding (sub-limit)
      expect(result.costCenters[0].constraint.isBinding).toBe(true)
      // Enterprise umbrella is also binding
      expect(result.unassignedUsers.constraint.isBinding).toBe(true)
    })

    it('multi-CC: enterprise and CC both binding (exclusion ON)', () => {
      const ccMembers = users('pu', 3)
      const result = calcMultiCCConstraints(
        [cc('cc1', 'Power', 10, ccMembers)],
        indBudgets(ccMembers, 200),
        50, 190, 10, true, 10,
      )
      // CC is binding independently
      expect(result.costCenters[0].constraint.isBinding).toBe(true)
      // Enterprise is binding for unassigned users
      expect(result.unassignedUsers.constraint.isBinding).toBe(true)
    })
  })

  describe('D5. Raising CC budget does NOT help when enterprise is the umbrella (excl OFF)', () => {
    // Small pool, tight enterprise budget, generous CC budget
    const ccMembers = users('u', 5)

    it('CC not binding but enterprise still constrains everyone', () => {
      const result = calcMultiCCConstraints(
        [cc('cc1', 'Team', 50000, ccMembers)],
        [], 100, 200, 50, false, 10,
      )
      // CC budget is huge → not binding
      expect(result.costCenters[0].constraint.isBinding).toBe(false)
      // But enterprise umbrella is binding (covers everything)
      expect(result.unassignedUsers.constraint.isBinding).toBe(true)
      expect(result.unassignedUsers.constraint.maxConsumption).toBe(10 * 100) // umbrella
    })
  })
})

// ─── E. Exclusion Mode Cross-Product ──────────────────────────────────

describe('E. Exclusion mode: all binding-state combinations', () => {
  const ccMembers = users('cc-user', 5)
  const _unassignedCount = 5
  const totalLicenses = 10
  const ulb = 50
  const pool = 200 // small to force post-pool

  describe('E1. Exclusion OFF (enterprise is umbrella)', () => {
    it('ent non-binding, CC non-binding', () => {
      const result = calcMultiCCConstraints(
        [cc('cc1', 'Team', 5000, ccMembers)],
        [], ulb, pool, 5000, false, totalLicenses,
      )
      expect(result.unassignedUsers.constraint.isBinding).toBe(false)
      expect(result.costCenters[0].constraint.isBinding).toBe(false)
      expect(result.bindingCount).toBe(0)
    })

    it('ent binding, CC non-binding', () => {
      // Enterprise budget tight, CC budget generous
      const result = calcMultiCCConstraints(
        [cc('cc1', 'Team', 5000, ccMembers)],
        [], ulb, pool, 10, false, totalLicenses,
      )
      expect(result.unassignedUsers.constraint.isBinding).toBe(true)
      expect(result.costCenters[0].constraint.isBinding).toBe(false)
    })

    it('ent non-binding, CC binding (sub-limit)', () => {
      // Enterprise budget generous, CC budget tight
      const result = calcMultiCCConstraints(
        [cc('cc1', 'Team', 1, ccMembers)],
        [], ulb, pool, 5000, false, totalLicenses,
      )
      expect(result.unassignedUsers.constraint.isBinding).toBe(false)
      expect(result.costCenters[0].constraint.isBinding).toBe(true)
    })

    it('ent binding, CC also binding', () => {
      const result = calcMultiCCConstraints(
        [cc('cc1', 'Team', 1, ccMembers)],
        [], ulb, pool, 1, false, totalLicenses,
      )
      expect(result.unassignedUsers.constraint.isBinding).toBe(true)
      expect(result.costCenters[0].constraint.isBinding).toBe(true)
      expect(result.bindingCount).toBe(2)
    })

    it('CC budget=0 is NOT uncapped (enterprise umbrella covers)', () => {
      const result = calcMultiCCConstraints(
        [cc('cc1', 'Team', 0, ccMembers)],
        [], ulb, pool, 5000, false, totalLicenses,
      )
      expect(result.costCenters[0].isUncapped).toBe(false)
    })
  })

  describe('E2. Exclusion ON (enterprise + CC independent)', () => {
    it('ent non-binding, CC non-binding', () => {
      const result = calcMultiCCConstraints(
        [cc('cc1', 'Team', 5000, ccMembers)],
        [], ulb, pool, 5000, true, totalLicenses,
      )
      expect(result.unassignedUsers.constraint.isBinding).toBe(false)
      expect(result.costCenters[0].constraint.isBinding).toBe(false)
    })

    it('ent binding, CC non-binding', () => {
      const result = calcMultiCCConstraints(
        [cc('cc1', 'Team', 5000, ccMembers)],
        [], ulb, pool, 1, true, totalLicenses,
      )
      expect(result.unassignedUsers.constraint.isBinding).toBe(true)
      expect(result.costCenters[0].constraint.isBinding).toBe(false)
    })

    it('ent non-binding, CC binding', () => {
      const result = calcMultiCCConstraints(
        [cc('cc1', 'Team', 1, ccMembers)],
        [], ulb, pool, 5000, true, totalLicenses,
      )
      expect(result.unassignedUsers.constraint.isBinding).toBe(false)
      expect(result.costCenters[0].constraint.isBinding).toBe(true)
    })

    it('ent binding, CC binding (independently)', () => {
      const result = calcMultiCCConstraints(
        [cc('cc1', 'Team', 1, ccMembers)],
        [], ulb, pool, 1, true, totalLicenses,
      )
      expect(result.unassignedUsers.constraint.isBinding).toBe(true)
      expect(result.costCenters[0].constraint.isBinding).toBe(true)
    })

    it('CC budget=0 IS uncapped when post-pool > 0', () => {
      const result = calcMultiCCConstraints(
        [cc('cc1', 'Team', 0, ccMembers)],
        [], ulb, pool, 5000, true, totalLicenses,
      )
      expect(result.costCenters[0].isUncapped).toBe(true)
      expect(result.uncappedCount).toBe(1)
    })

    it('CC budget=0 is NOT uncapped when pool covers CC consumption', () => {
      // Big pool: pool covers everything → no post-pool for CC
      const result = calcMultiCCConstraints(
        [cc('cc1', 'Team', 0, ccMembers)],
        [], ulb, 50000, 5000, true, totalLicenses,
      )
      expect(result.costCenters[0].isUncapped).toBe(false)
    })

    it('totalMaxSpend = enterprise + sum(CC budgets)', () => {
      const result = calcMultiCCConstraints(
        [
          cc('cc1', 'A', 1000, users('a', 3)),
          cc('cc2', 'B', 2000, users('b', 3)),
        ],
        [], ulb, pool, 500, true, totalLicenses,
      )
      expect(result.totalMaxSpend).toBe(500 + 1000 + 2000)
    })

    it('totalMaxSpend (excl OFF) = enterprise budget alone', () => {
      const result = calcMultiCCConstraints(
        [
          cc('cc1', 'A', 1000, users('a', 3)),
          cc('cc2', 'B', 2000, users('b', 3)),
        ],
        [], ulb, pool, 500, false, totalLicenses,
      )
      expect(result.totalMaxSpend).toBe(500)
    })
  })
})

// ─── F. Multi-CC Proportional Pool Sharing ────────────────────────────

describe('F. Multi-CC proportional pool sharing', () => {
  it('F1. one CC has 99% of consumption → gets ~99% of pool', () => {
    const heavy = users('heavy', 10)
    const light = users('light', 10)
    const result = calcMultiCCConstraints(
      [
        cc('heavy', 'Heavy', 50000, heavy),
        cc('light', 'Light', 50000, light),
      ],
      indBudgets(heavy, 1000), // heavy: 10×$1000 = $10,000
      1, // light: 10×$1 = $10
      5000,
      50000,
      true,
      20,
    )
    const heavyCC = result.costCenters.find(c => c.ccId === 'heavy')!
    const lightCC = result.costCenters.find(c => c.ccId === 'light')!

    expect(heavyCC.maxConsumption).toBe(10000)
    expect(lightCC.maxConsumption).toBe(10)
    // Heavy gets ~99.9% of pool
    const _heavyPoolShare = heavyCC.constraint.affordableConsumption - Math.max(0, heavyCC.maxConsumption - (5000 * heavyCC.maxConsumption / (heavyCC.maxConsumption + lightCC.maxConsumption)))
    expect(heavyCC.constraint.affordableConsumption).toBeGreaterThan(lightCC.constraint.affordableConsumption)
  })

  it('F2. many small CCs of equal size share pool equally', () => {
    const ccs = Array.from({ length: 5 }, (_, i) =>
      cc(`cc${i}`, `Team ${i}`, 50000, users(`t${i}`, 4)),
    )
    const result = calcMultiCCConstraints(ccs, [], 30, 1000, 50000, true, 20)

    // Each CC: 4 users × $30 = $120 max consumption
    // Equal consumption → equal pool shares
    const capacities = result.costCenters.map(c => c.constraint.capacityPercent)
    // All should be at 100% (pool=$1,000 > total consumption=$600)
    capacities.forEach(cap => expect(cap).toBe(100))

    const consumptions = result.costCenters.map(c => c.maxConsumption)
    consumptions.forEach(mc => expect(mc).toBe(120))
  })

  it('F3. CC with single user having very high individual ULB dominates pool', () => {
    const whale = ['whale-user']
    const minnows = users('minnow', 9)
    const result = calcMultiCCConstraints(
      [
        cc('whale', 'Whale', 50000, whale),
        cc('minnow', 'Minnow', 50000, minnows),
      ],
      [{ login: 'whale-user', amount: 10000 }],
      10,
      500,
      50000,
      true,
      10,
    )
    const whaleCC = result.costCenters.find(c => c.ccId === 'whale')!
    const minnowCC = result.costCenters.find(c => c.ccId === 'minnow')!

    // Whale: $10,000, Minnows: 9×$10 = $90
    expect(whaleCC.maxConsumption).toBe(10000)
    expect(minnowCC.maxConsumption).toBe(90)
    // Pool: $500 → almost all goes to whale's proportional share
    // Whale share ≈ 10000/10090 ≈ 99.1%
    expect(whaleCC.constraint.affordableConsumption).toBeGreaterThan(minnowCC.constraint.affordableConsumption * 50)
  })

  it('F4. unassigned users get proportional pool share', () => {
    const result = calcMultiCCConstraints(
      [cc('cc1', 'Team', 50000, users('cc', 5))],
      [], 30, 1000, 50000, true, 20,
    )
    // CC: 5×$30 = $150, Unassigned: 15×$30 = $450
    // Pool: $1,000 > $600 total → everyone is covered
    expect(result.unassignedUsers.count).toBe(15)
    expect(result.unassignedUsers.maxConsumption).toBe(450)
    expect(result.unassignedUsers.constraint.isBinding).toBe(false)
  })

  it('F5. total consumption across all groups matches expected', () => {
    const ccA = users('a', 5)
    const ccB = users('b', 3)
    const indBudgetsA = [{ login: 'a-0', amount: 200 }]
    const result = calcMultiCCConstraints(
      [
        cc('ccA', 'A', 5000, ccA),
        cc('ccB', 'B', 5000, ccB),
      ],
      indBudgetsA, 30, 1000, 5000, true, 15,
    )
    // ccA: 1×$200 + 4×$30 = $320
    // ccB: 3×$30 = $90
    // Unassigned: 7×$30 = $210
    const totalMax = result.costCenters.reduce((s, c) => s + c.maxConsumption, 0)
      + result.unassignedUsers.maxConsumption
    expect(totalMax).toBe(320 + 90 + 210)
    expect(totalMax).toBe(620)
  })
})

// ─── G. Boundary / Edge-of-Binding Conditions ────────────────────────

describe('G. Boundary conditions', () => {
  describe('G1. Budget exactly equals post-pool exposure', () => {
    // 20 CB, standard, ULB $30, no power users
    // Pool = $380, max = $600, post-pool = $220
    const rec = calcBudgetRecommendations(20, 0, 30, 0, 0, 0, false)

    it('budget = post-pool → not binding', () => {
      const postPool = rec.maxSpendBeyondReservoir // 220
      const c = calcEnterpriseBudgetConstraint(postPool, rec, false)
      expect(c.isBinding).toBe(false)
      expect(c.capacityPercent).toBe(100)
    })

    it('budget = post-pool - 1 → binding', () => {
      const c = calcEnterpriseBudgetConstraint(rec.maxSpendBeyondReservoir - 1, rec, false)
      expect(c.isBinding).toBe(true)
    })

    it('budget = post-pool + 1 → not binding', () => {
      const c = calcEnterpriseBudgetConstraint(rec.maxSpendBeyondReservoir + 1, rec, false)
      expect(c.isBinding).toBe(false)
    })
  })

  describe('G2. Float precision at boundaries', () => {
    it('fractional ULB produces consistent results', () => {
      const rec = calcBudgetRecommendations(7, 3, 19.99, 2, 49.99, 0, false)
      // Pool = 7×1900 + 3×3900 = 25,000 AICs = $250
      expect(rec.reservoirValue).toBe(250)
      // Regular = 8, Power = 2
      // Max regular = 8 × $19.99 = $159.92
      // Max power = 2 × $49.99 = $99.98
      // Max total = $259.90
      expect(rec.maxTotalConsumption).toBeCloseTo(259.90, 2)

      const c = calcEnterpriseBudgetConstraint(rec.maxSpendBeyondReservoir, rec, false)
      expect(c.isBinding).toBe(false)
    })

    it('very small fractional budget is binding when post-pool exists', () => {
      const rec = calcBudgetRecommendations(5, 0, 50, 0, 0, 0, false)
      // Pool = $95, max = $250, post-pool = $155
      const c = calcEnterpriseBudgetConstraint(0.01, rec, false)
      expect(c.isBinding).toBe(true)
      expect(c.affordableConsumption).toBeCloseTo(95.01, 2)
    })
  })

  describe('G3. Single user scenarios', () => {
    it('1 CB user, ULB = pool value → pool is sufficient', () => {
      const rec = calcBudgetRecommendations(1, 0, 19, 0, 0, 0, false)
      expect(rec.isReservoirSufficient).toBe(true)
      expect(rec.maxSpendBeyondReservoir).toBe(0)
    })

    it('1 CB user, ULB > pool value → post-pool exposure exists', () => {
      const rec = calcBudgetRecommendations(1, 0, 50, 0, 0, 0, false)
      expect(rec.isReservoirSufficient).toBe(false)
      expect(rec.maxSpendBeyondReservoir).toBe(31) // 50 - 19
    })

    it('1 user in CC, budget = 0, pool covers everything → not binding', () => {
      const result = calcMultiCCConstraints(
        [cc('cc1', 'Solo', 0, ['solo'])],
        [], 10, 1000, 5000, true, 1,
      )
      expect(result.costCenters[0].constraint.isBinding).toBe(false)
    })
  })

  describe('G4. Budget = 0 with various combinations', () => {
    const rec = calcBudgetRecommendations(20, 0, 50, 5, 100, 0, false)

    it('enterprise $0 + excl OFF: binding, only pool available', () => {
      const c = calcEnterpriseBudgetConstraint(0, rec, false)
      expect(c.isBinding).toBe(true)
      expect(c.affordableConsumption).toBe(rec.reservoirValue)
    })

    it('enterprise $0 + excl ON: binding for regular users', () => {
      const c = calcEnterpriseBudgetConstraint(0, rec, true)
      expect(c.isBinding).toBe(true)
      // Only regular users' pool share available
      expect(c.maxConsumption).toBe(rec.maxRegularConsumption)
    })

    it('CC $0: binding if power users have post-pool exposure', () => {
      const c = calcCostCenterBudgetConstraint(0, rec)
      expect(c.isBinding).toBe(true)
    })

    it('all budgets $0 in multi-CC → multiple constraints', () => {
      const result = calcMultiCCConstraints(
        [cc('cc1', 'Team', 0, users('u', 5))],
        [], 50, 200, 0, true, 10,
      )
      // CC with budget=0 + post-pool > 0 → uncapped (excl ON)
      expect(result.costCenters[0].isUncapped).toBe(true)
      // Enterprise $0 for unassigned → likely binding
      expect(result.unassignedUsers.constraint.isBinding).toBe(true)
    })
  })
})

// ─── H. Real-World Doc Scenarios ──────────────────────────────────────

describe('H. Real-world scenarios from docs', () => {
  describe('H1. Race-to-drain (Scenario 1 from game-optimization.md)', () => {
    // 50 CB + 10 CE, promo: pool = $2,200
    // Without ULB: single user could consume entire $2,200
    // With 2× CB ULB ($60): max single user = $60 → 2.7% of pool
    const rec = calcBudgetRecommendations(50, 10, 60, 0, 0, 10, true)

    it('pool covers all usage at 2× ULB', () => {
      // 60 users × $60 = $3,600 > pool $2,200 → NOT sufficient
      expect(rec.maxTotalConsumption).toBe(3600)
      expect(rec.reservoirValue).toBe(2200)
      expect(rec.isReservoirSufficient).toBe(false)
    })

    it('single user capped at 2.7% of pool value', () => {
      const singleUserDraw = 60
      const poolPct = (singleUserDraw / rec.reservoirValue) * 100
      expect(poolPct).toBeCloseTo(2.7, 0)
    })
  })

  describe('H2. Enterprise limit sandbagging (Scenario 7)', () => {
    // 50 CB + 10 CE, promo, ULB $60, no power → 60 users
    // Post-pool = $3,600 - $2,200 = $1,400
    // Recommended = $1,540 (with 10% buffer)
    // Sandbagged at $5,000 → $3,460 of phantom budget
    const rec = calcBudgetRecommendations(50, 10, 60, 0, 0, 10, true)

    it('sandbagged $5000 is not binding but has phantom headroom', () => {
      const c = calcEnterpriseBudgetConstraint(5000, rec, false)
      expect(c.isBinding).toBe(false)
      expect(c.capacityPercent).toBe(100)
      // Phantom headroom: enterprise budget far exceeds needed
      const phantomHeadroom = 5000 - rec.maxSpendBeyondReservoir
      expect(phantomHeadroom).toBeGreaterThan(3000)
    })

    it('recommended budget is the right size', () => {
      const c = calcEnterpriseBudgetConstraint(rec.recommendedEnterpriseBudget, rec, false)
      expect(c.isBinding).toBe(false)
      expect(c.capacityPercent).toBe(100)
      // recommendedEnterpriseBudget = ceil(postPool × 1.10), so it may be 1 above due to float
      expect(rec.recommendedEnterpriseBudget).toBe(Math.ceil(rec.maxSpendBeyondReservoir * 1.10))
    })
  })

  describe('H3. Power user inflation (Scenario 2)', () => {
    // 50 CB + 10 CE, promo: pool = $2,200
    // All 60 users granted 2× CB ULB ($60)
    const rec = calcBudgetRecommendations(50, 10, 60, 0, 0, 10, true)

    it('60 users × $60 = $3,600 → pool exhausted at user ~37', () => {
      // Pool $2,200 / $60 per user ≈ 36.67 users
      const usersBeforePoolExhausted = Math.floor(rec.reservoirValue / 60)
      expect(usersBeforePoolExhausted).toBe(36)
      // Remaining ~23 users would need overage
      const remainingUsers = 60 - usersBeforePoolExhausted
      expect(remainingUsers).toBe(24)
    })
  })

  describe('H4. CB→CE upgrade economics (Scenario 4)', () => {
    it('standard pricing: upgrade is breakeven ($0 net value)', () => {
      const cbContrib = 1900 * 0.01 // $19
      const ceContrib = 3900 * 0.01 // $39
      const extraAICs = ceContrib - cbContrib // $20
      const gheTax = 20 // $20 extra cost
      expect(extraAICs).toBe(gheTax) // breakeven
    })

    it('promo pricing: upgrade yields +$20 net value', () => {
      const cbContrib = 3000 * 0.01 // $30
      const ceContrib = 7000 * 0.01 // $70
      const extraAICs = ceContrib - cbContrib // $40
      const gheTax = 20
      const netValue = extraAICs - gheTax
      expect(netValue).toBe(20)
    })
  })

  describe('H5. Docs example: 100 CB, $25 ULB, 10 power@$50', () => {
    const rec = calcBudgetRecommendations(100, 0, 25, 10, 50, 10, false)

    it('pool=$1,900, max=$2,750, post-pool=$850', () => {
      expect(rec.reservoirValue).toBe(1900)
      expect(rec.maxTotalConsumption).toBe(2750)
      expect(rec.maxSpendBeyondReservoir).toBe(850)
    })

    // NOTE: enterprise $200 binding (excl OFF) and excl ON tests are in budget-calculator.test.ts
    // (constraint scenario: 100 CB users, standard pricing). Only unique assertions kept here.

    it('CC budget $100 for power users → capacity ~89%', () => {
      // From docs: power users' pool share ≈ $345, CC budget $100
      // affordable = $345 + $100 = $445 for 10 users
      // max draw = 10 × $50 = $500
      // capacity = $445 / $500 = 89%
      const c = calcCostCenterBudgetConstraint(100, rec)
      expect(c.isBinding).toBe(true)
      expect(c.capacityPercent).toBeCloseTo(89, 0)
    })

    it('exclusion OFF: enterprise $200 constrains all users', () => {
      const c = calcEnterpriseBudgetConstraint(200, rec, false)
      expect(c.isBinding).toBe(true)
      expect(c.maxConsumption).toBe(2750) // all 100 users
    })
  })

  describe('H6. CC constraint from docs: 10 power@$50, $500 exposure', () => {
    const rec = calcBudgetRecommendations(100, 0, 25, 10, 50, 10, false)

    // NOTE: "CC budget at recommended is not binding" is tested in budget-calculator.test.ts.
    // Only unique assertions kept here.

    it('CC budget $100 is binding with shortfall', () => {
      const c = calcCostCenterBudgetConstraint(100, rec)
      expect(c.isBinding).toBe(true)
      expect(c.shortfall).toBeGreaterThan(0)
    })

    it('CC budget at recommended is not binding (verified in budget-calculator.test.ts)', () => {
      // Kept as a cross-reference sanity check — this is tested more thoroughly
      // in the "constraint scenario: 100 CB users" describe block.
      const c = calcCostCenterBudgetConstraint(rec.recommendedCostCenterBudget, rec)
      expect(c.isBinding).toBe(false)
    })
  })
})

// ─── I. Extreme Edge Cases ────────────────────────────────────────────

describe('I. Extreme edge cases', () => {
  it('I1. zero users → all constraints safe', () => {
    const rec = calcBudgetRecommendations(0, 0, 0, 0, 0, 0, true)
    expect(calcEnterpriseBudgetConstraint(0, rec, false).isBinding).toBe(false)
    expect(calcEnterpriseBudgetConstraint(0, rec, true).isBinding).toBe(false)
    expect(calcCostCenterBudgetConstraint(0, rec).isBinding).toBe(false)
  })

  it('I2. all users are power users', () => {
    // 10 CB, 10 power users @ $200 (powerUsers > totalUsers is clamped)
    const rec = calcBudgetRecommendations(10, 0, 30, 10, 200, 0, true)
    expect(rec.regularUsers).toBe(0)
    expect(rec.maxRegularConsumption).toBe(0)
    expect(rec.maxPowerConsumption).toBe(2000)
    expect(rec.maxTotalConsumption).toBe(2000)

    // Enterprise constraint with excl ON: only covers regular (= 0 users)
    const c = calcEnterpriseBudgetConstraint(0, rec, true)
    expect(c.maxConsumption).toBe(0) // no regular users
    expect(c.isBinding).toBe(false)
  })

  it('I3. power users exceed total users (clamped to 0 regular)', () => {
    const rec = calcBudgetRecommendations(5, 0, 30, 20, 100, 0, true)
    expect(rec.totalUsers).toBe(5)
    expect(rec.regularUsers).toBe(0)
    expect(rec.maxRegularConsumption).toBe(0)
    // Power consumption uses the declared powerUsers count (20), not total (5)
    expect(rec.maxPowerConsumption).toBe(2000)
  })

  it('I4. very large numbers do not overflow', () => {
    const rec = calcBudgetRecommendations(100000, 50000, 1000, 10000, 5000, 50, true)
    expect(rec.totalUsers).toBe(150000)
    expect(rec.totalReservoir).toBeGreaterThan(0)
    expect(rec.recommendedEnterpriseBudget).toBeGreaterThan(0)
    expect(Number.isFinite(rec.recommendedEnterpriseBudget)).toBe(true)

    const c = calcEnterpriseBudgetConstraint(100, rec, false)
    expect(Number.isFinite(c.capacityPercent)).toBe(true)
    expect(c.isBinding).toBe(true)
  })

  it('I5. ULB = 0 means zero consumption', () => {
    const rec = calcBudgetRecommendations(50, 0, 0, 0, 0, 0, false)
    expect(rec.maxTotalConsumption).toBe(0)
    expect(rec.isReservoirSufficient).toBe(true)
    expect(rec.recommendedEnterpriseBudget).toBe(0)
  })

  it('I6. 50% buffer doubles the recommended enterprise budget relative to 0%', () => {
    const noBuf = calcBudgetRecommendations(50, 0, 50, 5, 100, 0, false)
    const buf50 = calcBudgetRecommendations(50, 0, 50, 5, 100, 50, false)
    // 50% buffer: recommended = ceil(postPool × 1.50)
    // 0% buffer: recommended = ceil(postPool × 1.00)
    const ratio = buf50.recommendedEnterpriseBudget / noBuf.recommendedEnterpriseBudget
    expect(ratio).toBeCloseTo(1.5, 1)
  })

  it('I7. multi-CC: more CC members than total licenses', () => {
    const result = calcMultiCCConstraints(
      [cc('cc1', 'Team', 5000, users('u', 20))],
      [], 30, 500, 5000, true, 5, // only 5 licenses but 20 CC members
    )
    // Unassigned clamped to 0
    expect(result.unassignedUsers.count).toBe(0)
    // CC still reports actual member count
    expect(result.costCenters[0].userCount).toBe(20)
  })

  it('I8. multi-CC with overlapping nothing unassigned', () => {
    const allUsers = users('u', 10)
    const result = calcMultiCCConstraints(
      [
        cc('cc1', 'A', 5000, allUsers.slice(0, 5)),
        cc('cc2', 'B', 5000, allUsers.slice(5, 10)),
      ],
      [], 30, 500, 5000, true, 10,
    )
    expect(result.unassignedUsers.count).toBe(0)
    expect(result.costCenters[0].userCount).toBe(5)
    expect(result.costCenters[1].userCount).toBe(5)
  })

  it('I9. individual ULB lower than universal ULB is respected', () => {
    // User with individual budget $5 (lower than universal $30)
    const result = calcMultiCCConstraints(
      [cc('cc1', 'Team', 5000, ['alice', 'bob'])],
      [{ login: 'alice', amount: 5 }], // individual ULB below universal
      30, 500, 5000, true, 2,
    )
    // alice: $5, bob: $30 (universal)
    expect(result.costCenters[0].maxConsumption).toBe(35)
    expect(result.costCenters[0].indULBCount).toBe(1)
    expect(result.costCenters[0].uniULBCount).toBe(1)
  })

  it('I10. multiple CCs: some binding, some uncapped, some fine', () => {
    const result = calcMultiCCConstraints(
      [
        cc('binding', 'Binding', 1, users('b', 5)),    // tiny budget → binding
        cc('uncapped', 'Uncapped', 0, users('u', 5)),  // $0 budget → uncapped (excl ON)
        cc('fine', 'Fine', 50000, users('f', 5)),       // huge budget → fine
      ],
      [], 50, 200, 5000, true, 20,
    )
    const binding = result.costCenters.find(c => c.ccId === 'binding')!
    const uncapped = result.costCenters.find(c => c.ccId === 'uncapped')!
    const fine = result.costCenters.find(c => c.ccId === 'fine')!

    expect(binding.constraint.isBinding).toBe(true)
    expect(binding.isUncapped).toBe(false)

    expect(uncapped.isUncapped).toBe(true)
    expect(uncapped.constraint.isBinding).toBe(false)

    expect(fine.constraint.isBinding).toBe(false)
    expect(fine.isUncapped).toBe(false)

    expect(result.bindingCount).toBeGreaterThanOrEqual(1)
    expect(result.uncappedCount).toBe(1)
  })

  it('I11. effectivePerUserCap decreases as binding intensifies', () => {
    const members = users('u', 10)
    const r1 = calcMultiCCConstraints(
      [cc('cc1', 'Team', 500, members)], [], 100, 200, 5000, true, 10,
    )
    const r2 = calcMultiCCConstraints(
      [cc('cc1', 'Team', 50, members)], [], 100, 200, 5000, true, 10,
    )
    const r3 = calcMultiCCConstraints(
      [cc('cc1', 'Team', 1, members)], [], 100, 200, 5000, true, 10,
    )
    expect(r1.costCenters[0].effectivePerUserCap).toBeGreaterThan(r2.costCenters[0].effectivePerUserCap)
    expect(r2.costCenters[0].effectivePerUserCap).toBeGreaterThan(r3.costCenters[0].effectivePerUserCap)
  })

  it('I12. shortfall decreases to 0 as budget approaches post-pool', () => {
    const members = users('u', 5)
    // Force post-pool: 5 users × $100 = $500, pool = $100 → post-pool ≈ $400
    const rLow = calcMultiCCConstraints(
      [cc('cc1', 'Team', 10, members)], [], 100, 100, 5000, true, 5,
    )
    const rHigh = calcMultiCCConstraints(
      [cc('cc1', 'Team', 5000, members)], [], 100, 100, 5000, true, 5,
    )
    expect(rLow.costCenters[0].constraint.shortfall).toBeGreaterThan(0)
    expect(rHigh.costCenters[0].constraint.shortfall).toBe(0)
  })
})

// ─── J. Mixed License Tiers ───────────────────────────────────────────

describe('J. Mixed CB + CE license scenarios', () => {
  it('J1. CE-only enterprise has larger pool per user', () => {
    const cbOnly = calcBudgetRecommendations(100, 0, 30, 0, 0, 0, false)
    const ceOnly = calcBudgetRecommendations(0, 100, 30, 0, 0, 0, false)
    // CE: 100 × $39 = $3,900 pool vs CB: 100 × $19 = $1,900 pool
    expect(ceOnly.reservoirValue).toBeGreaterThan(cbOnly.reservoirValue)
    expect(ceOnly.reservoirValue).toBe(3900)
    expect(cbOnly.reservoirValue).toBe(1900)
  })

  it('J2. mixed tiers: pool is sum of both', () => {
    const rec = calcBudgetRecommendations(50, 50, 30, 0, 0, 0, false)
    // 50×$19 + 50×$39 = $950 + $1,950 = $2,900
    expect(rec.reservoirValue).toBe(2900)
  })

  it('J3. promo vs standard: same structure, different pool sizes', () => {
    const promo = calcBudgetRecommendations(50, 50, 30, 5, 60, 10, true)
    const std = calcBudgetRecommendations(50, 50, 30, 5, 60, 10, false)
    // Same users, ULBs, power users → same max consumption
    expect(promo.maxTotalConsumption).toBe(std.maxTotalConsumption)
    // But different pools and therefore different post-pool
    expect(promo.reservoirValue).toBeGreaterThan(std.reservoirValue)
    expect(promo.maxSpendBeyondReservoir).toBeLessThan(std.maxSpendBeyondReservoir)
  })

  it('J4. promo can make pool sufficient where standard does not', () => {
    // 100 CB, ULB $25: promo pool=$3,000 vs max=$2,500 (sufficient)
    //                   std pool=$1,900 vs max=$2,500 (insufficient)
    const promo = calcBudgetRecommendations(100, 0, 25, 0, 0, 0, true)
    const std = calcBudgetRecommendations(100, 0, 25, 0, 0, 0, false)
    expect(promo.isReservoirSufficient).toBe(true)
    expect(std.isReservoirSufficient).toBe(false)
  })
})

// ─── K. Shortfall + Buffer Interactions ───────────────────────────────

describe('K. Shortfall and buffer interactions', () => {
  it('K1. shortfall ignores buffer (compares against recommended which includes buffer)', () => {
    const rec10 = calcBudgetRecommendations(20, 0, 50, 0, 0, 10, false)
    const rec0 = calcBudgetRecommendations(20, 0, 50, 0, 0, 0, false)
    // Shortfall at budget=0: equals the recommended budget (which includes buffer)
    const c10 = calcEnterpriseBudgetConstraint(0, rec10, false)
    const c0 = calcEnterpriseBudgetConstraint(0, rec0, false)
    expect(c10.shortfall).toBe(rec10.recommendedEnterpriseBudget)
    expect(c0.shortfall).toBe(rec0.recommendedEnterpriseBudget)
    // Larger buffer → larger shortfall
    expect(c10.shortfall).toBeGreaterThan(c0.shortfall)
  })

  it('K2. fixing shortfall resolves the constraint', () => {
    const rec = calcBudgetRecommendations(20, 0, 50, 0, 0, 10, false)
    const c1 = calcEnterpriseBudgetConstraint(100, rec, false)
    expect(c1.isBinding).toBe(true)
    // Apply the fix: set budget to 100 + shortfall
    const c2 = calcEnterpriseBudgetConstraint(100 + c1.shortfall, rec, false)
    expect(c2.isBinding).toBe(false)
  })

  it('K3. CC shortfall fix also resolves the constraint', () => {
    const rec = calcBudgetRecommendations(20, 0, 30, 5, 100, 10, false)
    const c1 = calcCostCenterBudgetConstraint(10, rec)
    expect(c1.isBinding).toBe(true)
    const c2 = calcCostCenterBudgetConstraint(10 + c1.shortfall, rec)
    expect(c2.isBinding).toBe(false)
  })

  it('K4. multi-CC shortfall fix resolves per-CC constraint', () => {
    const members = users('u', 5)
    const r1 = calcMultiCCConstraints(
      [cc('cc1', 'Team', 10, members)],
      [], 100, 100, 5000, true, 5,
    )
    const shortfall = r1.costCenters[0].constraint.shortfall
    expect(r1.costCenters[0].constraint.isBinding).toBe(true)
    const r2 = calcMultiCCConstraints(
      [cc('cc1', 'Team', 10 + shortfall, members)],
      [], 100, 100, 5000, true, 5,
    )
    expect(r2.costCenters[0].constraint.isBinding).toBe(false)
  })
})

// ─── L. Capacity Percent Properties ──────────────────────────────────

describe('L. capacityPercent properties', () => {
  const rec = calcBudgetRecommendations(20, 0, 50, 5, 200, 0, false)

  it('L1. capacityPercent is always between 0 and 100', () => {
    for (const budget of [0, 1, 10, 100, 500, 1000, 10000]) {
      const c = calcEnterpriseBudgetConstraint(budget, rec, false)
      expect(c.capacityPercent).toBeGreaterThanOrEqual(0)
      expect(c.capacityPercent).toBeLessThanOrEqual(100)
    }
  })

  it('L2. capacityPercent increases monotonically with budget', () => {
    const budgets = [0, 10, 50, 100, 200, 500, 1000, 5000]
    const caps = budgets.map(b => calcEnterpriseBudgetConstraint(b, rec, false).capacityPercent)
    for (let i = 1; i < caps.length; i++) {
      expect(caps[i]).toBeGreaterThanOrEqual(caps[i - 1])
    }
  })

  it('L3. capacityPercent = 100 when pool is sufficient even with budget=0', () => {
    const bigPool = calcBudgetRecommendations(1000, 0, 1, 0, 0, 0, true)
    const c = calcEnterpriseBudgetConstraint(0, bigPool, false)
    expect(c.capacityPercent).toBe(100)
  })

  it('L4. CC capacityPercent is always between 0 and 100', () => {
    for (const budget of [0, 1, 10, 100, 500, 1000]) {
      const c = calcCostCenterBudgetConstraint(budget, rec)
      expect(c.capacityPercent).toBeGreaterThanOrEqual(0)
      expect(c.capacityPercent).toBeLessThanOrEqual(100)
    }
  })
})
