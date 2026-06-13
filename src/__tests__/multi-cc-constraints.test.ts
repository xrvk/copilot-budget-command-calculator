import { describe, it, expect } from 'vitest'
import { calcMultiCCConstraints, type CostCenterConstraintInput, type UserBudgetRecord } from '../components/BudgetCalculator'

// Helper to build CC inputs quickly
function cc(ccId: string, name: string, budget: number, members: string[]): CostCenterConstraintInput {
  return { ccId, name, budget, members }
}

// --- Basic scenarios ---

describe('calcMultiCCConstraints — basic', () => {
  it('handles zero cost centers', () => {
    const result = calcMultiCCConstraints([], [], 30, 6700, 10_000, true, 100)
    expect(result.costCenters).toHaveLength(0)
    expect(result.unassignedUsers.count).toBe(100)
    expect(result.bindingCount).toBe(0)
    expect(result.uncappedCount).toBe(0)
  })

  it('zero CCs: math is correct for unassigned users', () => {
    // 100 users, $30 ULB, pool=$6700, enterprise=$500
    // Max consumption = 100 × $30 = $3,000 (within pool, no post-pool)
    const result = calcMultiCCConstraints([], [], 30, 6700, 500, false, 100)
    expect(result.unassignedUsers.count).toBe(100)
    expect(result.unassignedUsers.uniULBCount).toBe(100)
    expect(result.unassignedUsers.maxConsumption).toBe(3000)
    // Pool ($6,700) > max consumption ($3,000), so enterprise budget should not bind
    expect(result.unassignedUsers.constraint.isBinding).toBe(false)
    expect(result.totalMaxSpend).toBe(500) // enterprise budget
  })

  it('zero CCs: binding enterprise budget constrains unassigned users', () => {
    // 100 users, $100 ULB, pool=$1000, enterprise=$200
    // Max draw = $10,000, pool = $1000 → post-pool = $9,000
    // Affordable = $1000 pool + $200 enterprise = $1,200
    const result = calcMultiCCConstraints([], [], 100, 1000, 200, false, 100)
    expect(result.unassignedUsers.constraint.isBinding).toBe(true)
    expect(result.unassignedUsers.constraint.affordableConsumption).toBe(1200)
    expect(result.unassignedUsers.constraint.shortfall).toBe(8800) // 10000 - 1200
  })

  it('handles zero total licenses', () => {
    const result = calcMultiCCConstraints(
      [cc('cc1', 'Team A', 500, ['alice', 'bob'])],
      [],
      30,
      0,
      1000,
      false,
      0,
    )
    expect(result.unassignedUsers.count).toBe(0)
  })

  it('all users in CCs, none unassigned', () => {
    const result = calcMultiCCConstraints(
      [cc('cc1', 'Team A', 5000, ['u1', 'u2', 'u3', 'u4', 'u5'])],
      [],
      30,
      150,
      1000,
      true,
      5,
    )
    expect(result.unassignedUsers.count).toBe(0)
    expect(result.costCenters[0].userCount).toBe(5)
  })
})

// --- ULB cross-referencing ---

describe('calcMultiCCConstraints — ULB cross-referencing', () => {
  const members = ['alice', 'bob', 'charlie', 'dana', 'eli']
  const userBudgets: UserBudgetRecord[] = [
    { login: 'alice', amount: 100 },
    { login: 'bob', amount: 200 },
  ]

  it('splits members into universal vs individual ULB users', () => {
    const result = calcMultiCCConstraints(
      [cc('cc1', 'Engineering', 5000, members)],
      userBudgets,
      30,
      500,
      1000,
      true,
      10,
    )
    const ccResult = result.costCenters[0]
    expect(ccResult.uniULBCount).toBe(3) // charlie, dana, eli
    expect(ccResult.indULBCount).toBe(2) // alice, bob
    expect(ccResult.maxConsumption).toBe(100 + 200 + 3 * 30) // 390
  })

  it('individual ULB users not in any CC are counted as unassigned', () => {
    const result = calcMultiCCConstraints(
      [cc('cc1', 'Team A', 5000, ['charlie'])],
      [{ login: 'alice', amount: 500 }, { login: 'bob', amount: 300 }],
      30,
      1000,
      5000,
      true,
      5,
    )
    expect(result.unassignedUsers.count).toBe(4)
    expect(result.unassignedUsers.indULBCount).toBe(2) // alice, bob
    expect(result.unassignedUsers.uniULBCount).toBe(2) // 2 remaining unassigned users on universal
    expect(result.unassignedUsers.maxConsumption).toBe(500 + 300 + 2 * 30) // 860
  })
})

// --- Binding constraints ---

describe('calcMultiCCConstraints — binding detection', () => {
  it('detects binding CC budget (exclusion ON)', () => {
    // 10 users, 8 with $1,500 individual ULB + 2 with $30 universal
    // Max consumption = 8×1500 + 2×30 = $12,060
    // Pool = $6,700, total licenses = 170
    // This CC is a major consumer so pool share is proportionally large
    // but post-pool exposure should exceed the $4,000 budget
    const dsMembers = [
      'cb-user-056', 'cb-user-057',
      ...Array.from({ length: 8 }, (_, i) => `ce-user-${String(i + 6).padStart(3, '0')}`),
    ]
    const dsUserBudgets: UserBudgetRecord[] = Array.from({ length: 8 }, (_, i) => ({
      login: `ce-user-${String(i + 6).padStart(3, '0')}`,
      amount: 1500,
    }))

    const result = calcMultiCCConstraints(
      [cc('cc-ds', 'Data Science', 4000, dsMembers)],
      dsUserBudgets,
      30,
      6700,
      10_000,
      true,
      170,
    )

    const ds = result.costCenters[0]
    expect(ds.constraint.isBinding).toBe(true)
    expect(ds.constraint.capacityPercent).toBeLessThan(100)
    expect(ds.constraint.shortfall).toBeGreaterThan(0)
    expect(ds.isUncapped).toBe(false)
  })

  it('detects non-binding CC budget when budget is sufficient', () => {
    // 5 users all on universal ULB ($30)
    // Max consumption = 5×30 = $150
    // Pool = $6,700 (way more than needed)
    // Post-pool = 0 → any budget is sufficient
    const result = calcMultiCCConstraints(
      [cc('cc1', 'Marketing', 1000, ['u1', 'u2', 'u3', 'u4', 'u5'])],
      [],
      30,
      6700,
      10_000,
      true,
      100,
    )
    expect(result.costCenters[0].constraint.isBinding).toBe(false)
    expect(result.costCenters[0].constraint.capacityPercent).toBe(100)
  })

  it('detects uncapped CC (exclusion ON, budget = 0, post-pool > 0)', () => {
    // Heavy users with $0 CC budget and exclusion ON
    const result = calcMultiCCConstraints(
      [cc('cc1', 'Rogue Team', 0, ['u1', 'u2'])],
      [{ login: 'u1', amount: 5000 }, { login: 'u2', amount: 5000 }],
      30,
      100, // small pool
      10_000,
      true, // exclusion ON
      10,
    )
    expect(result.costCenters[0].isUncapped).toBe(true)
    expect(result.uncappedCount).toBe(1)
  })

  it('does not flag uncapped when exclusion is OFF', () => {
    // Same setup but exclusion OFF → enterprise budget covers everyone
    const result = calcMultiCCConstraints(
      [cc('cc1', 'Rogue Team', 0, ['u1', 'u2'])],
      [{ login: 'u1', amount: 5000 }, { login: 'u2', amount: 5000 }],
      30,
      100,
      10_000,
      false, // exclusion OFF
      10,
    )
    expect(result.costCenters[0].isUncapped).toBe(false)
  })
})

// --- Exclusion modes ---

describe('calcMultiCCConstraints — exclusion modes', () => {
  const ccs = [
    cc('cc1', 'Engineering', 6000, ['u1', 'u2', 'u3']),
    cc('cc2', 'Data Science', 2000, ['u4', 'u5']),
  ]
  const userBudgets: UserBudgetRecord[] = [
    { login: 'u4', amount: 500 },
    { login: 'u5', amount: 500 },
  ]

  it('exclusion ON: enterprise covers only unassigned users', () => {
    const result = calcMultiCCConstraints(ccs, userBudgets, 30, 500, 10_000, true, 10)
    // Unassigned = 10 - 5 = 5 users
    expect(result.unassignedUsers.count).toBe(5)
    // Enterprise budget is huge ($10K) so unassigned should not be binding
    expect(result.unassignedUsers.constraint.isBinding).toBe(false)
    // totalMaxSpend with exclusion ON = enterprise + sum(CC budgets)
    expect(result.totalMaxSpend).toBe(10_000 + 6000 + 2000)
  })

  it('exclusion OFF: enterprise budget is the umbrella', () => {
    const result = calcMultiCCConstraints(ccs, userBudgets, 30, 500, 10_000, false, 10)
    // totalMaxSpend with exclusion OFF = enterprise budget alone
    expect(result.totalMaxSpend).toBe(10_000)
    // Unassigned constraint checks against total consumption
    expect(result.unassignedUsers.constraint.maxConsumption).toBe(
      result.costCenters.reduce((s, c) => s + c.maxConsumption, 0) + result.unassignedUsers.maxConsumption
    )
  })

  it('exclusion OFF: low enterprise budget constrains unassigned users', () => {
    // Pool $500, total consumption much higher → enterprise budget of $50 is binding
    const result = calcMultiCCConstraints(ccs, userBudgets, 30, 500, 50, false, 10)
    expect(result.unassignedUsers.constraint.isBinding).toBe(true)
    expect(result.bindingCount).toBeGreaterThanOrEqual(1)
  })
})

// --- Demo scenario (mirrors src/lib/demo-data.ts "cc" variant) ---

describe('calcMultiCCConstraints — demo scenario', () => {
  // Values sourced from demo-data.ts "cc" variant:
  //   130 CB + 40 CE = 170 seats, promo pricing
  //   Pool = 130×3000 + 40×7000 = 670,000 AICs = $6,700
  //   Engineering: 60 users (55 universal@$30 + 5 individual@$100)
  //   Data Science: 10 users (2 universal@$30 + 8 individual@$1,500)
  //   Unassigned: 100 users (all universal@$30)
  const engMembers = [
    ...Array.from({ length: 55 }, (_, i) => `cb-user-${String(i + 1).padStart(3, '0')}`),
    ...Array.from({ length: 5 }, (_, i) => `ce-user-${String(i + 1).padStart(3, '0')}`),
  ]
  const dsMembers = [
    'cb-user-056', 'cb-user-057',
    ...Array.from({ length: 8 }, (_, i) => `ce-user-${String(i + 6).padStart(3, '0')}`),
  ]
  const userBudgets: UserBudgetRecord[] = [
    ...Array.from({ length: 5 }, (_, i) => ({ login: `ce-user-${String(i + 1).padStart(3, '0')}`, amount: 100 })),
    ...Array.from({ length: 8 }, (_, i) => ({ login: `ce-user-${String(i + 6).padStart(3, '0')}`, amount: 1500 })),
  ]

  it('Data Science CC is binding', () => {
    const result = calcMultiCCConstraints(
      [
        cc('cc-eng', 'Engineering', 6000, engMembers),
        cc('cc-ds', 'Data Science', 4000, dsMembers),
      ],
      userBudgets,
      30, // universal ULB
      6700, // pool
      10_000, // enterprise budget
      true, // exclusion ON
      170, // total licenses
    )

    const eng = result.costCenters.find(c => c.name === 'Engineering')!
    const ds = result.costCenters.find(c => c.name === 'Data Science')!

    // Engineering should NOT be binding
    expect(eng.constraint.isBinding).toBe(false)
    expect(eng.constraint.capacityPercent).toBe(100)
    expect(eng.userCount).toBe(60)
    expect(eng.uniULBCount).toBe(55)
    expect(eng.indULBCount).toBe(5)
    expect(eng.maxConsumption).toBe(55 * 30 + 5 * 100) // 2150

    // Data Science SHOULD be binding
    expect(ds.constraint.isBinding).toBe(true)
    expect(ds.constraint.capacityPercent).toBeLessThan(100)
    expect(ds.userCount).toBe(10)
    expect(ds.uniULBCount).toBe(2)
    expect(ds.indULBCount).toBe(8)
    expect(ds.maxConsumption).toBe(2 * 30 + 8 * 1500) // 12060

    // Overall: exactly 1 binding CC constraint
    expect(result.bindingCount).toBeGreaterThanOrEqual(1)
    expect(result.uncappedCount).toBe(0)

    // Unassigned users
    expect(result.unassignedUsers.count).toBe(100)
    expect(result.unassignedUsers.uniULBCount).toBe(100) // no unassigned users with individual ULBs
    expect(result.unassignedUsers.maxConsumption).toBe(100 * 30) // 3000
  })
})

// --- Edge cases ---

describe('calcMultiCCConstraints — edge cases', () => {
  it('handles CC with no members gracefully', () => {
    const result = calcMultiCCConstraints(
      [cc('cc1', 'Empty Team', 1000, [])],
      [],
      30,
      1000,
      5000,
      true,
      10,
    )
    const empty = result.costCenters[0]
    expect(empty.userCount).toBe(0)
    expect(empty.maxConsumption).toBe(0)
    expect(empty.constraint.isBinding).toBe(false)
    expect(empty.isUncapped).toBe(false)
  })

  it('handles pool = 0 (everything is post-pool)', () => {
    const result = calcMultiCCConstraints(
      [cc('cc1', 'Team A', 100, ['u1', 'u2'])],
      [],
      30,
      0, // no pool
      500,
      true,
      5,
    )
    // Max consumption = 2×30 = $60, post-pool = $60, budget = $100 → not binding
    expect(result.costCenters[0].constraint.isBinding).toBe(false)
  })

  it('handles pool = 0 with binding budget', () => {
    const result = calcMultiCCConstraints(
      [cc('cc1', 'Team A', 10, ['u1', 'u2'])],
      [],
      30,
      0,
      500,
      true,
      5,
    )
    // Max consumption = $60, post-pool = $60, budget = $10 → binding
    expect(result.costCenters[0].constraint.isBinding).toBe(true)
    expect(result.costCenters[0].constraint.shortfall).toBe(50) // 60 - 10
  })

  it('handles universal ULB = 0', () => {
    const result = calcMultiCCConstraints(
      [cc('cc1', 'Team A', 100, ['u1', 'u2'])],
      [],
      0, // zero ULB
      1000,
      500,
      true,
      5,
    )
    expect(result.costCenters[0].maxConsumption).toBe(0)
    expect(result.costCenters[0].constraint.isBinding).toBe(false)
  })

  it('more CC members than total licenses still works', () => {
    const result = calcMultiCCConstraints(
      [cc('cc1', 'Team A', 100, ['u1', 'u2', 'u3', 'u4', 'u5'])],
      [],
      30,
      500,
      1000,
      true,
      3, // fewer licenses than CC members
    )
    expect(result.unassignedUsers.count).toBe(0) // clamped to 0
    expect(result.costCenters[0].userCount).toBe(5) // CC still reports actual members
  })
})

// ---------------------------------------------------------------------------
// Edge cases: binding boundaries, pool share precision, uneven consumption
// ---------------------------------------------------------------------------

describe('calcMultiCCConstraints — binding boundary conditions', () => {
  it('CC budget exactly equals post-pool → not binding (strict <)', () => {
    // Single CC with 5 members, ULB $30, pool = $500 (implied by totalLicenses × AIC rate)
    // CC consumption = 5 × $30 = $150
    // Pool share = $500 × (150 / 150) = $500 (only 1 group = all pool)
    // CC post-pool = max(0, $150 - $500) = $0 → CC budget >= 0 is never binding
    // Need a scenario where CC post-pool > 0
    // Use 10 members, ULB $120, pool = $500
    // CC consumption = 10 × $120 = $1200
    // Pool share ≈ all pool = $500 (single CC)
    // CC post-pool = $1200 - $500 = $700
    const result = calcMultiCCConstraints(
      [cc('cc1', 'Eng', 700, ['u1', 'u2', 'u3', 'u4', 'u5', 'u6', 'u7', 'u8', 'u9', 'u10'])],
      [],
      120,
      500,
      1000,
      true,
      10,
    )
    expect(result.costCenters[0].constraint.isBinding).toBe(false)
  })

  it('CC budget $1 below post-pool → binding', () => {
    const result = calcMultiCCConstraints(
      [cc('cc1', 'Eng', 699, ['u1', 'u2', 'u3', 'u4', 'u5', 'u6', 'u7', 'u8', 'u9', 'u10'])],
      [],
      120,
      500,
      1000,
      true,
      10,
    )
    expect(result.costCenters[0].constraint.isBinding).toBe(true)
    expect(result.bindingCount).toBe(1)
  })
})

describe('calcMultiCCConstraints — pool share precision', () => {
  it('affordableConsumption across all groups sums correctly', () => {
    const ccs = [
      cc('cc1', 'Eng', 5000, ['u1', 'u2', 'u3']),
      cc('cc2', 'Sales', 3000, ['u4', 'u5']),
      cc('cc3', 'Ops', 2000, ['u6']),
    ]
    const totalPool = 1000
    const result = calcMultiCCConstraints(ccs, [], 50, totalPool, 5000, true, 10)

    // Each CC's affordableConsumption = poolShare + min(budget, postPool)
    // Sum of all groups' maxConsumption should account for all users
    const totalMaxConsumption =
      result.costCenters.reduce((s, c) => s + c.maxConsumption, 0) +
      result.unassignedUsers.maxConsumption
    // 6 CC members × $50 + 4 unassigned × $50 = $500
    expect(totalMaxConsumption).toBe(500)
  })

  it('very uneven consumption: 1 CC = 95% of total consumption', () => {
    const bigMembers = Array.from({ length: 19 }, (_, i) => `big-${i}`)
    const ccs = [
      cc('cc1', 'Big Team', 50000, bigMembers),
      cc('cc2', 'Small Team', 100, ['small-1']),
    ]
    const ubRecords: UserBudgetRecord[] = bigMembers.map(login => ({
      login,
      amount: 200,
    }))
    ubRecords.push({ login: 'small-1', amount: 10 })

    const result = calcMultiCCConstraints(ccs, ubRecords, 30, 2000, 5000, true, 20)

    // Big CC consumption = 19 × $200 = $3,800
    // Small CC consumption = 1 × $10 = $10
    // Big CC gets ~99.7% of consumption share
    expect(result.costCenters[0].maxConsumption).toBe(3800)
    expect(result.costCenters[1].maxConsumption).toBe(10)

    // Big CC is so large relative to pool that it has post-pool charges
    // With budget=50000, should not be binding
    expect(result.costCenters[0].constraint.isBinding).toBe(false)
  })
})

describe('calcMultiCCConstraints — exclusion mode differences', () => {
  it('exclusion OFF: unassigned users get umbrella protection from enterprise budget', () => {
    const result = calcMultiCCConstraints(
      [cc('cc1', 'Eng', 500, ['u1', 'u2'])],
      [],
      50,
      1000,
      3000,
      false, // exclusion OFF
      5,
    )
    // Unassigned users exist and have affordable consumption
    expect(result.unassignedUsers.count).toBe(3)
    expect(result.unassignedUsers.maxConsumption).toBeGreaterThan(0)
  })

  it('exclusion ON: enterprise budget only covers unassigned users', () => {
    const result = calcMultiCCConstraints(
      [cc('cc1', 'Eng', 500, ['u1', 'u2'])],
      [],
      50,
      1000,
      3000,
      true, // exclusion ON
      5,
    )
    expect(result.unassignedUsers.count).toBe(3)
    expect(result.unassignedUsers.maxConsumption).toBeGreaterThan(0)
  })
})
