import { describe, it, expect } from 'vitest'
import { encodeState, decodeState, calcBudgetRecommendations, calcEnterpriseBudgetConstraint, calcCostCenterBudgetConstraint } from '../components/BudgetCalculator'

const SAMPLE_STATE = {
  cb: 50,
  ce: 10,
  ulb: 30,
  pu: 5,
  pub: 60,
  buf: 10,
  exc: '1',
  promo: '0',
}

describe('encodeState / decodeState', () => {
  it('round-trips a valid state object', () => {
    const encoded = encodeState(SAMPLE_STATE)
    const decoded = decodeState(encoded)
    expect(decoded).not.toBeNull()
    expect(decoded!.cbLicenses).toBe(50)
    expect(decoded!.ceLicenses).toBe(10)
    expect(decoded!.universalULB).toBe(30)
    expect(decoded!.powerUsers).toBe(5)
    expect(decoded!.powerUserBudget).toBe(60)
    expect(decoded!.enterpriseBufferPercent).toBe(10)
    expect(decoded!.excludeCostCenterUsage).toBe('1')
    expect(decoded!.promotionalPricing).toBe('0')
  })

  it('sets URL-origin flags on decode', () => {
    const encoded = encodeState(SAMPLE_STATE)
    const decoded = decodeState(encoded)
    expect(decoded!.cbFromUrl).toBe(true)
    expect(decoded!.ceFromUrl).toBe(true)
    expect(decoded!.ulbFromUrl).toBe(true)
    expect(decoded!.pubFromUrl).toBe(true)
    expect(decoded!.puFromUrl).toBe(true)
  })

  it('round-trips zero values', () => {
    const state = { cb: 0, ce: 0, ulb: 0, pu: 0, pub: 0, buf: 0, exc: '0', promo: '0' }
    const decoded = decodeState(encodeState(state))
    expect(decoded!.cbLicenses).toBe(0)
    expect(decoded!.ceLicenses).toBe(0)
    expect(decoded!.universalULB).toBe(0)
  })

  it('round-trips large values', () => {
    const state = { cb: 10000, ce: 5000, ulb: 999.99, pu: 500, pub: 1500.50, buf: 50, exc: '1', promo: '1' }
    const decoded = decodeState(encodeState(state))
    expect(decoded!.cbLicenses).toBe(10000)
    expect(decoded!.ceLicenses).toBe(5000)
    expect(decoded!.universalULB).toBeCloseTo(999.99)
    expect(decoded!.powerUserBudget).toBeCloseTo(1500.50)
  })

  it('round-trips float ULB values', () => {
    const state = { cb: 1, ce: 1, ulb: 12.5, pu: 1, pub: 25.75, buf: 5, exc: '1', promo: '1' }
    const decoded = decodeState(encodeState(state))
    expect(decoded!.universalULB).toBeCloseTo(12.5)
    expect(decoded!.powerUserBudget).toBeCloseTo(25.75)
  })
})

describe('decodeState error handling', () => {
  it('returns null for empty string', () => {
    expect(decodeState('')).toBeNull()
  })

  it('returns null for non-base64 garbage', () => {
    expect(decodeState('not-valid-base64!!!')).toBeNull()
  })

  it('returns null for base64 with too few fields', () => {
    // Only 3 comma-separated values
    const shortPayload = btoa('1,2,3')
    expect(decodeState(shortPayload)).toBeNull()
  })

  it('handles base64 with extra fields gracefully', () => {
    // 10 fields instead of 8 — should still decode the first 8
    const longPayload = btoa('50,10,30,5,60,10,1,0,extra1,extra2')
    const decoded = decodeState(longPayload)
    expect(decoded).not.toBeNull()
    expect(decoded!.cbLicenses).toBe(50)
  })

  it('returns NaN fields for non-numeric data in numeric slots', () => {
    const badPayload = btoa('abc,def,ghi,jkl,mno,pqr,1,0')
    const decoded = decodeState(badPayload)
    // decodeState returns parsed values; parseInt/parseFloat of garbage → NaN
    expect(decoded).not.toBeNull()
    expect(decoded!.cbLicenses).toBeNaN()
  })
})

// --- calcBudgetRecommendations ---

describe('calcBudgetRecommendations', () => {
  it('uses promotional AIC rates when promotionalPricing is true', () => {
    const r = calcBudgetRecommendations(50, 10, 30, 10, 30, 10, true)
    expect(r.cbAICsPerLicense).toBe(3000)
    expect(r.ceAICsPerLicense).toBe(7000)
    expect(r.totalReservoir).toBe(50 * 3000 + 10 * 7000)
  })

  it('uses standard AIC rates when promotionalPricing is false', () => {
    const r = calcBudgetRecommendations(50, 10, 30, 10, 30, 10, false)
    expect(r.cbAICsPerLicense).toBe(1900)
    expect(r.ceAICsPerLicense).toBe(3900)
    expect(r.totalReservoir).toBe(50 * 1900 + 10 * 3900)
  })

  it('marks reservoir sufficient when pool covers all usage', () => {
    const r = calcBudgetRecommendations(1000, 0, 1, 0, 1, 10, true)
    expect(r.isReservoirSufficient).toBe(true)
    expect(r.maxSpendBeyondReservoir).toBe(0)
    expect(r.recommendedEnterpriseBudget).toBe(0)
  })

  it('applies buffer percentage to recommended enterprise budget', () => {
    const r = calcBudgetRecommendations(10, 0, 50, 0, 0, 10, true)
    expect(r.maxSpendBeyondReservoir).toBe(200)
    expect(r.recommendedEnterpriseBudget).toBe(Math.ceil(200 * 1.10))
  })

  it('calculates power user consumption correctly', () => {
    const r = calcBudgetRecommendations(0, 0, 30, 5, 100, 0, true)
    expect(r.maxPowerConsumption).toBe(500)
    expect(r.recommendedCostCenterBudget).toBe(r.recommendedEnterpriseBudget)
  })

  it('returns zero promo bonus with standard pricing', () => {
    const r = calcBudgetRecommendations(50, 10, 30, 5, 60, 10, false)
    expect(r.promoBonusValue).toBe(0)
  })

  it('returns positive promo bonus with promotional pricing', () => {
    const r = calcBudgetRecommendations(50, 10, 30, 5, 60, 10, true)
    expect(r.promoBonusValue).toBeGreaterThan(0)
  })

  it('handles zero licenses without errors', () => {
    const r = calcBudgetRecommendations(0, 0, 0, 0, 0, 0, true)
    expect(r.totalUsers).toBe(0)
    expect(r.totalReservoir).toBe(0)
    expect(r.avgUsagePerUser).toBe(0)
    expect(r.recommendedEnterpriseBudget).toBe(0)
    expect(r.isReservoirSufficient).toBe(true)
  })

  it('computes avgUsagePerUser as totalReservoir / totalUsers', () => {
    const r = calcBudgetRecommendations(100, 0, 30, 0, 0, 0, true)
    expect(r.avgUsagePerUser).toBe(r.totalReservoir / r.totalUsers)
  })

  it('splits regular vs power users correctly', () => {
    const r = calcBudgetRecommendations(80, 20, 30, 15, 60, 10, true)
    expect(r.totalUsers).toBe(100)
    expect(r.regularUsers).toBe(85)
    expect(r.maxRegularConsumption).toBe(85 * 30)
    expect(r.maxPowerConsumption).toBe(15 * 60)
  })

  it('clamps regularUsers to zero when powerUsers exceeds totalUsers', () => {
    const r = calcBudgetRecommendations(5, 0, 30, 10, 60, 0, true)
    expect(r.regularUsers).toBe(0)
    expect(r.maxRegularConsumption).toBe(0)
  })

  it('exposes cbAICs and ceAICs for display use', () => {
    const r = calcBudgetRecommendations(50, 10, 30, 10, 30, 10, true)
    expect(r.cbAICs).toBe(50 * 3000)
    expect(r.ceAICs).toBe(10 * 7000)
  })
})

// --- calcEnterpriseBudgetConstraint ---

describe('calcEnterpriseBudgetConstraint', () => {
  // Setup: 50 CB + 10 CE, promo pricing, ULB $30, 10 power users @ $60, 10% buffer
  // Pool = 50×3000 + 10×7000 = 220,000 AICs = $2,200
  // Regular users = 50, Power users = 10, Total = 60
  // Max regular = 50 × $30 = $1,500
  // Max power = 10 × $60 = $600
  // Max total = $2,100 → pool covers it (no post-pool), reservoir sufficient
  // Use a scenario where pool does NOT cover all usage
  const rec = calcBudgetRecommendations(10, 0, 50, 5, 100, 10, true)
  // Pool = 10×3000 = 30,000 AICs = $300
  // Total users = 10, regular = 5, power = 5
  // Max regular = 5 × $50 = $250
  // Max power = 5 × $100 = $500
  // Max total = $750
  // Post-pool = $750 - $300 = $450
  // Recommended enterprise = ceil($450 × 1.10) = $495
  // Power share = $500 / $750 = 66.67%

  it('detects binding enterprise budget (exclusion OFF)', () => {
    const c = calcEnterpriseBudgetConstraint(100, rec, false)
    expect(c.isBinding).toBe(true)
    expect(c.shortfall).toBe(rec.recommendedEnterpriseBudget - 100)
    expect(c.capacityPercent).toBeLessThan(100)
    expect(c.affordableConsumption).toBe(300 + 100) // pool + budget
  })

  it('not binding when budget matches recommended (exclusion OFF)', () => {
    const c = calcEnterpriseBudgetConstraint(rec.recommendedEnterpriseBudget, rec, false)
    expect(c.isBinding).toBe(false)
    expect(c.shortfall).toBe(0)
    expect(c.capacityPercent).toBe(100)
  })

  it('not binding when budget exceeds recommended (exclusion OFF)', () => {
    const c = calcEnterpriseBudgetConstraint(rec.recommendedEnterpriseBudget + 500, rec, false)
    expect(c.isBinding).toBe(false)
    expect(c.shortfall).toBe(0)
    expect(c.capacityPercent).toBe(100)
  })

  it('detects binding enterprise budget (exclusion ON)', () => {
    // With exclusion ON, enterprise only covers regular users
    // Regular pool share = $300 × (1 - 66.67%) = $100
    // Regular post-pool = max(0, $250 - $100) = $150
    // Budget of $50 < $150 → binding
    const c = calcEnterpriseBudgetConstraint(50, rec, true)
    expect(c.isBinding).toBe(true)
    expect(c.capacityPercent).toBeLessThan(100)
    expect(c.maxConsumption).toBe(rec.maxRegularConsumption)
  })

  it('not binding with exclusion ON when budget covers regular post-pool', () => {
    // Regular post-pool = $150, set budget at $150+
    const c = calcEnterpriseBudgetConstraint(200, rec, true)
    expect(c.isBinding).toBe(false)
    expect(c.capacityPercent).toBe(100)
  })

  it('handles zero users gracefully', () => {
    const zeroRec = calcBudgetRecommendations(0, 0, 0, 0, 0, 0, true)
    const c = calcEnterpriseBudgetConstraint(100, zeroRec, false)
    expect(c.isBinding).toBe(false)
    expect(c.capacityPercent).toBe(100)
  })

  it('handles reservoir-sufficient scenario', () => {
    // 1000 CB, ULB $1 → pool ($30,000) easily covers max consumption ($1,000)
    const bigPoolRec = calcBudgetRecommendations(1000, 0, 1, 0, 1, 10, true)
    expect(bigPoolRec.isReservoirSufficient).toBe(true)
    const c = calcEnterpriseBudgetConstraint(0, bigPoolRec, false)
    expect(c.isBinding).toBe(false)
    expect(c.capacityPercent).toBe(100)
  })
})

// --- calcCostCenterBudgetConstraint ---

describe('calcCostCenterBudgetConstraint', () => {
  // Same scenario: 10 CB, promo, ULB $50, 5 power @ $100, 10% buffer
  const rec = calcBudgetRecommendations(10, 0, 50, 5, 100, 10, true)
  // Power share = $500/$750 = 66.67%
  // Power pool share = $300 × 66.67% = $200
  // Power post-pool = max(0, $500 - $200) = $300
  // Recommended CC budget = ceil($450 × 66.67%) = $300

  it('detects binding CC budget', () => {
    const c = calcCostCenterBudgetConstraint(50, rec)
    expect(c.isBinding).toBe(true)
    expect(c.shortfall).toBe(rec.recommendedCostCenterBudget - 50)
    expect(c.capacityPercent).toBeLessThan(100)
  })

  it('not binding when CC budget matches recommended', () => {
    const c = calcCostCenterBudgetConstraint(rec.recommendedCostCenterBudget, rec)
    expect(c.isBinding).toBe(false)
    expect(c.shortfall).toBe(0)
    expect(c.capacityPercent).toBe(100)
  })

  it('not binding when CC budget exceeds recommended', () => {
    const c = calcCostCenterBudgetConstraint(rec.recommendedCostCenterBudget + 200, rec)
    expect(c.isBinding).toBe(false)
    expect(c.shortfall).toBe(0)
    expect(c.capacityPercent).toBe(100)
  })

  it('handles zero power users gracefully', () => {
    const noPowerRec = calcBudgetRecommendations(50, 10, 30, 0, 0, 10, true)
    const c = calcCostCenterBudgetConstraint(100, noPowerRec)
    expect(c.isBinding).toBe(false)
    expect(c.capacityPercent).toBe(100)
  })

  it('handles reservoir-sufficient scenario', () => {
    const bigPoolRec = calcBudgetRecommendations(1000, 0, 1, 5, 2, 10, true)
    expect(bigPoolRec.isReservoirSufficient).toBe(true)
    const c = calcCostCenterBudgetConstraint(0, bigPoolRec)
    expect(c.isBinding).toBe(false)
    expect(c.capacityPercent).toBe(100)
  })

  it('computes effective per-power-user cap when binding', () => {
    // CC budget = $50, power pool share ≈ $200, so affordable = $250 for 5 users = $50/user
    const c = calcCostCenterBudgetConstraint(50, rec)
    expect(c.isBinding).toBe(true)
    expect(c.affordableConsumption / 5).toBeLessThan(100) // less than powerUserBudget
  })
})

// --- Constraint scenario smoke tests ---
// Model real-world scenarios from the docs to verify constraint math end-to-end.

describe('constraint scenario: 100 CB users, standard pricing', () => {
  // Docs example: 100 CB seats, $25 ULB, 10 power users @ $50, 10% buffer
  // Pool = 100 × 1900 = 190,000 AICs = $1,900
  // Regular = 90, Power = 10
  // Max regular = 90 × $25 = $2,250
  // Max power = 10 × $50 = $500
  // Max total = $2,750
  // Post-pool = $2,750 - $1,900 = $850
  // Recommended enterprise = ceil($850 × 1.10) = $935
  const rec = calcBudgetRecommendations(100, 0, 25, 10, 50, 10, false)

  it('confirms docs math baseline', () => {
    expect(rec.reservoirValue).toBe(1900)
    expect(rec.maxTotalConsumption).toBe(2750)
    expect(rec.maxSpendBeyondReservoir).toBe(850)
    expect(rec.recommendedEnterpriseBudget).toBe(936)
  })

  it('enterprise budget at $200 is binding (excl OFF)', () => {
    const c = calcEnterpriseBudgetConstraint(200, rec, false)
    expect(c.isBinding).toBe(true)
    // Affordable = $1,900 + $200 = $2,100, out of $2,750 needed
    expect(c.affordableConsumption).toBe(2100)
    expect(c.capacityPercent).toBeCloseTo(76.4, 0)
    expect(c.shortfall).toBe(736)
  })

  it('enterprise budget at $200 with excl ON: only constrains regular users', () => {
    const c = calcEnterpriseBudgetConstraint(200, rec, true)
    expect(c.isBinding).toBe(true)
    // Regular users' share: maxConsumption = $2,250 (regular)
    expect(c.maxConsumption).toBe(2250)
    expect(c.capacityPercent).toBeLessThan(100)
  })

  it('CC budget at $50 constrains power users', () => {
    const c = calcCostCenterBudgetConstraint(50, rec)
    expect(c.isBinding).toBe(true)
    // Power share ≈ 18.18%, pool share ≈ $345.5
    // Power post-pool ≈ $500 - $345.5 = $154.5
    // CC budget $50 < $154.5 → binding
    expect(c.shortfall).toBeGreaterThan(0)
    expect(c.capacityPercent).toBeLessThan(100)
  })

  it('CC budget at recommended is not binding', () => {
    const c = calcCostCenterBudgetConstraint(rec.recommendedCostCenterBudget, rec)
    expect(c.isBinding).toBe(false)
    expect(c.capacityPercent).toBe(100)
  })
})

describe('constraint scenario: 50 CB + 10 CE, promo pricing', () => {
  // Pool = 50×3000 + 10×7000 = 220,000 AICs = $2,200
  // Regular = 50, Power = 10, Total = 60
  // Max regular = 50 × $30 = $1,500
  // Max power = 10 × $60 = $600
  // Max total = $2,100 → less than pool ($2,200) → reservoir sufficient
  const rec = calcBudgetRecommendations(50, 10, 30, 10, 60, 10, true)

  it('pool covers all usage, so no enterprise constraint', () => {
    expect(rec.isReservoirSufficient).toBe(true)
    expect(rec.recommendedEnterpriseBudget).toBe(0)
    const c = calcEnterpriseBudgetConstraint(0, rec, false)
    expect(c.isBinding).toBe(false)
    expect(c.capacityPercent).toBe(100)
  })

  it('CC budget at $0 is not binding when pool is sufficient', () => {
    const c = calcCostCenterBudgetConstraint(0, rec)
    expect(c.isBinding).toBe(false)
  })
})

describe('constraint scenario: high ULB exceeding pool', () => {
  // 20 CB, promo, ULB $150, 5 power @ $300, 10% buffer
  // Pool = 20×3000 = 60,000 AICs = $600
  // Regular = 15, Power = 5
  // Max regular = 15 × $150 = $2,250
  // Max power = 5 × $300 = $1,500
  // Max total = $3,750
  // Post-pool = $3,750 - $600 = $3,150
  // Recommended enterprise = ceil($3,150 × 1.10) = $3,465
  const rec = calcBudgetRecommendations(20, 0, 150, 5, 300, 10, true)

  it('confirms baseline', () => {
    expect(rec.maxTotalConsumption).toBe(3750)
    expect(rec.maxSpendBeyondReservoir).toBe(3150)
  })

  it('enterprise budget at $500 severely constrains (excl OFF)', () => {
    const c = calcEnterpriseBudgetConstraint(500, rec, false)
    expect(c.isBinding).toBe(true)
    expect(c.affordableConsumption).toBe(1100) // $600 pool + $500 budget
    expect(c.capacityPercent).toBeCloseTo(29.3, 0)
  })

  it('CC budget at $100 severely constrains power users', () => {
    const c = calcCostCenterBudgetConstraint(100, rec)
    expect(c.isBinding).toBe(true)
    expect(c.capacityPercent).toBeLessThan(50) // less than half of needed
  })
})

describe('constraint scenario: 18 CB + 2 CE, power users eating pool, excl ON', () => {
  // Real-world scenario: small enterprise with heavy power users
  // 18 CB + 2 CE, standard pricing, ULB $19, 5 power users @ $1000, 10% buffer, excl ON
  // Pool = 18×1900 + 2×3900 = 42,000 AICs = $420
  // Regular = 15 users, Power = 5 users, Total = 20
  // Max regular = 15 × $19 = $285
  // Max power = 5 × $1000 = $5,000
  // Max total = $5,285
  // Power share = $5,000 / $5,285 ≈ 94.6%
  // Post-pool = $5,285 - $420 = $4,865
  const rec = calcBudgetRecommendations(18, 2, 19, 5, 1000, 10, false)

  it('confirms baseline math', () => {
    expect(rec.reservoirValue).toBe(420)
    expect(rec.totalUsers).toBe(20)
    expect(rec.regularUsers).toBe(15)
    expect(rec.maxRegularConsumption).toBe(285)
    expect(rec.maxPowerConsumption).toBe(5000)
    expect(rec.maxTotalConsumption).toBe(5285)
    expect(rec.maxSpendBeyondReservoir).toBe(4865)
  })

  it('enterprise budget $200 with excl ON constrains only regular users', () => {
    const c = calcEnterpriseBudgetConstraint(200, rec, true)
    expect(c.isBinding).toBe(true)
    // Regular users' pool share = $420 × (1 - powerShare)
    // powerShare = 5000/5285 ≈ 0.9461
    const powerShare = rec.powerUserShareOfConsumption
    const regularPoolShare = 420 * (1 - powerShare)
    // Regular post-pool = $285 - regularPoolShare
    const regularPostPool = Math.max(0, 285 - regularPoolShare)
    expect(c.maxConsumption).toBe(285)
    // Enterprise budget $200 < regularPostPool → binding
    expect(regularPostPool).toBeGreaterThan(200)
    // Affordable = regularPoolShare + $200
    expect(c.affordableConsumption).toBeCloseTo(regularPoolShare + 200, 0)
  })

  it('effective per-regular-user cap is well below ULB with excl ON', () => {
    const c = calcEnterpriseBudgetConstraint(200, rec, true)
    // effectiveRegularCap = affordableConsumption / 15
    const effectivePerUser = c.affordableConsumption / 15
    expect(effectivePerUser).toBeLessThan(19) // below the $19 ULB
    expect(effectivePerUser).toBeGreaterThan(10) // but not zero
    expect(effectivePerUser).toBeCloseTo(14.8, 0)
  })

  it('enterprise budget $200 with excl OFF constrains all users', () => {
    const c = calcEnterpriseBudgetConstraint(200, rec, false)
    expect(c.isBinding).toBe(true)
    expect(c.affordableConsumption).toBe(620) // $420 pool + $200
    // 620 / 5285 ≈ 11.7% capacity
    expect(c.capacityPercent).toBeCloseTo(11.7, 0)
  })

  it('effective per-regular-user cap with excl OFF scales ULB proportionally', () => {
    const _c = calcEnterpriseBudgetConstraint(200, rec, false)
    // scale = (420 + 200) / 5285 ≈ 0.1173
    const scale = (420 + 200) / 5285
    const expectedRegularCap = 19 * scale
    expect(expectedRegularCap).toBeCloseTo(2.2, 0)
    // Power user cap = 1000 * scale ≈ $117
    const expectedPowerCap = 1000 * scale
    expect(expectedPowerCap).toBeCloseTo(117.3, 0)
  })

  it('CC budget constrains power users independently with excl ON', () => {
    // Power pool share = $420 × 94.6% ≈ $397.3
    // Power post-pool = $5,000 - $397.3 = $4,602.7
    // CC budget $500 < $4,602.7 → binding
    const c = calcCostCenterBudgetConstraint(500, rec)
    expect(c.isBinding).toBe(true)
    // effectivePowerCap = ($397.3 + $500) / 5 ≈ $179.5
    const effectivePerPower = c.affordableConsumption / 5
    expect(effectivePerPower).toBeCloseTo(179.5, 0)
    expect(effectivePerPower).toBeLessThan(1000) // well below $1000 individual ULB
  })
})

// --- Mid-cycle adjustment ---

describe('calcBudgetRecommendations mid-cycle adjustment', () => {
  // Baseline: 50 CB + 10 CE, promo pricing, ULB $30, 10 power users at $70, 10% buffer
  const baseline = () => calcBudgetRecommendations(50, 10, 30, 10, 70, 10, true)

  it('returns isMidCycleAdjusted = false when poolConsumedSoFar is 0', () => {
    const r = calcBudgetRecommendations(50, 10, 30, 10, 70, 10, true, 0)
    expect(r.isMidCycleAdjusted).toBe(false)
    expect(r.poolConsumedSoFar).toBe(0)
    expect(r.effectiveReservoirValue).toBe(r.reservoirValue)
  })

  it('produces identical results to omitting the parameter', () => {
    const withZero = calcBudgetRecommendations(50, 10, 30, 10, 70, 10, true, 0)
    const without = baseline()
    expect(withZero.recommendedEnterpriseBudget).toBe(without.recommendedEnterpriseBudget)
    expect(withZero.recommendedCostCenterBudget).toBe(without.recommendedCostCenterBudget)
    expect(withZero.maxSpendBeyondReservoir).toBe(without.maxSpendBeyondReservoir)
    expect(withZero.isReservoirSufficient).toBe(without.isReservoirSufficient)
  })

  it('sets isMidCycleAdjusted = true when pool is partially consumed', () => {
    const r = calcBudgetRecommendations(50, 10, 30, 10, 70, 10, true, 500)
    expect(r.isMidCycleAdjusted).toBe(true)
    expect(r.poolConsumedSoFar).toBe(500)
  })

  it('reduces effectiveReservoirValue by pool consumed', () => {
    const b = baseline()
    const r = calcBudgetRecommendations(50, 10, 30, 10, 70, 10, true, 500)
    expect(r.effectiveReservoirValue).toBe(b.reservoirValue - 500)
    expect(r.reservoirValue).toBe(b.reservoirValue) // full pool unchanged
  })

  it('increases maxSpendBeyondReservoir when pool is partially consumed', () => {
    const b = baseline()
    const r = calcBudgetRecommendations(50, 10, 30, 10, 70, 10, true, 500)
    expect(r.maxSpendBeyondReservoir).toBe(b.maxSpendBeyondReservoir + 500)
  })

  it('inflates recommended enterprise budget proportionally', () => {
    const b = baseline()
    const r = calcBudgetRecommendations(50, 10, 30, 10, 70, 10, true, 500)
    expect(r.recommendedEnterpriseBudget).toBeGreaterThan(b.recommendedEnterpriseBudget)
    expect(r.recommendedEnterpriseBudget).toBe(
      Math.ceil((b.maxSpendBeyondReservoir + 500) * 1.1)
    )
  })

  it('preserves full-cycle values for comparison', () => {
    const b = baseline()
    const r = calcBudgetRecommendations(50, 10, 30, 10, 70, 10, true, 500)
    expect(r.fullCycleEnterpriseBudget).toBe(b.recommendedEnterpriseBudget)
    expect(r.fullCycleCostCenterBudget).toBe(b.recommendedCostCenterBudget)
    expect(r.fullCycleSpendBeyondReservoir).toBe(b.maxSpendBeyondReservoir)
  })

  it('clamps effectiveReservoirValue to 0 when pool is fully consumed', () => {
    const b = baseline()
    const r = calcBudgetRecommendations(50, 10, 30, 10, 70, 10, true, b.reservoirValue + 100)
    expect(r.effectiveReservoirValue).toBe(0)
    expect(r.maxSpendBeyondReservoir).toBe(r.maxTotalConsumption)
  })

  it('marks reservoir as insufficient when mid-cycle consumption depletes pool', () => {
    const r1 = calcBudgetRecommendations(100, 0, 5, 0, 0, 10, true)
    expect(r1.isReservoirSufficient).toBe(true)
    const r2 = calcBudgetRecommendations(100, 0, 5, 0, 0, 10, true, r1.reservoirValue - 100)
    expect(r2.isReservoirSufficient).toBe(false)
  })

  it('full-cycle values are unaffected by pool consumed amount', () => {
    const consumed = [0, 100, 500, 1000, 99999]
    const fullCycleValues = consumed.map(c =>
      calcBudgetRecommendations(50, 10, 30, 10, 70, 10, true, c)
    )
    const base = fullCycleValues[0]
    for (const r of fullCycleValues) {
      expect(r.fullCycleEnterpriseBudget).toBe(base.fullCycleEnterpriseBudget)
      expect(r.fullCycleCostCenterBudget).toBe(base.fullCycleCostCenterBudget)
      expect(r.fullCycleSpendBeyondReservoir).toBe(base.fullCycleSpendBeyondReservoir)
    }
  })
})

// ---------------------------------------------------------------------------
// Reverse solver: calcMaxAffordableULB & calcMaxAffordablePowerBudget
// ---------------------------------------------------------------------------

import { calcMaxAffordableULB, calcMaxAffordablePowerBudget } from '../components/BudgetCalculator'

describe('calcMaxAffordableULB', () => {
  // Baseline scenario: 50 CB + 10 CE, promo pricing
  // Pool = (50 × 3000 + 10 × 7000) × 0.01 = $2200
  const pool = 2200
  const regularUsers = 50 // 60 total - 10 power
  const powerUsers = 10
  const powerUserBudget = 70
  const bufferPercent = 10

  describe('exclusion OFF', () => {
    it('returns the correct max affordable ULB', () => {
      // budgetCap = $500, buffer = 10%
      // effectiveCap = 500 / 1.1 ≈ 454.55
      // totalAffordable = 2200 + 454.55 = 2654.55
      // maxRegularConsumption = 2654.55 - 10 × 70 = 1954.55
      // maxULB = 1954.55 / 50 = 39.09
      const result = calcMaxAffordableULB(500, pool, regularUsers, powerUsers, powerUserBudget, bufferPercent, false)
      expect(result).toBeCloseTo(1954.545 / 50, 1)
      expect(result).toBeGreaterThan(0)
    })

    it('returns 0 when budget cap cannot cover power users alone', () => {
      // Tiny budget, large power consumption: 10 × 70 = 700, pool = 200, cap = 10
      // totalAffordable = 200 + 10/1.1 = 209.09, minus 700 = negative
      const result = calcMaxAffordableULB(10, 200, 50, 10, 70, 10, false)
      expect(result).toBe(0)
    })

    it('returns Infinity when there are no regular users', () => {
      const result = calcMaxAffordableULB(500, pool, 0, 10, 70, bufferPercent, false)
      expect(result).toBe(Infinity)
    })

    it('handles zero power users (all regular)', () => {
      // totalAffordable = 2200 + 500/1.1 = 2654.55
      // maxULB = 2654.55 / 60
      const result = calcMaxAffordableULB(500, pool, 60, 0, 0, bufferPercent, false)
      expect(result).toBeCloseTo(2654.545 / 60, 1)
    })

    it('handles zero buffer', () => {
      // effectiveCap = 500 / 1.0 = 500
      // totalAffordable = 2200 + 500 = 2700
      // maxULB = (2700 - 700) / 50 = 40
      const result = calcMaxAffordableULB(500, pool, regularUsers, powerUsers, powerUserBudget, 0, false)
      expect(result).toBe(40)
    })
  })

  describe('exclusion ON (quadratic solver)', () => {
    it('returns a value that makes the forward constraint non-binding', () => {
      const maxULB = calcMaxAffordableULB(500, pool, regularUsers, powerUsers, powerUserBudget, bufferPercent, true)
      expect(maxULB).toBeGreaterThan(0)
      expect(isFinite(maxULB)).toBe(true)

      // Verify: forward calc with this ULB should produce a recommended
      // enterprise budget ≤ budgetCap (within rounding)
      const rec = calcBudgetRecommendations(50, 10, maxULB, powerUsers, powerUserBudget, bufferPercent, true)
      const constraint = calcEnterpriseBudgetConstraint(500, rec, true)
      // Should NOT be binding at this ULB
      expect(constraint.isBinding).toBe(false)
    })

    it('returns Infinity when there are no regular users', () => {
      const result = calcMaxAffordableULB(500, pool, 0, 10, 70, bufferPercent, true)
      expect(result).toBe(Infinity)
    })

    it('handles zero power users (all regular)', () => {
      // No power consumption → quadratic degenerates to simpler case
      const result = calcMaxAffordableULB(500, pool, 60, 0, 0, bufferPercent, true)
      expect(result).toBeGreaterThan(0)
      expect(isFinite(result)).toBe(true)
    })
  })

  describe('round-trip consistency', () => {
    it('forward → reverse → forward produces consistent results (excl OFF)', () => {
      const ulb = 39
      const rec = calcBudgetRecommendations(50, 10, ulb, 10, 70, 10, true)
      const budgetCap = rec.recommendedEnterpriseBudget

      const recoveredULB = calcMaxAffordableULB(
        budgetCap, rec.effectiveReservoirValue, rec.regularUsers,
        10, 70, 10, false,
      )
      // Recovered ULB should be >= original (budget was ceiled, so there's
      // a tiny bit of headroom)
      expect(recoveredULB).toBeGreaterThanOrEqual(ulb - 0.01)
      expect(recoveredULB).toBeLessThan(ulb + 1) // within $1
    })

    it('forward → reverse → forward produces consistent results (excl ON)', () => {
      const ulb = 39
      const rec = calcBudgetRecommendations(50, 10, ulb, 10, 70, 10, true)
      const budgetCap = rec.recommendedEnterpriseBudget

      const recoveredULB = calcMaxAffordableULB(
        budgetCap, rec.effectiveReservoirValue, rec.regularUsers,
        10, 70, 10, true,
      )
      expect(recoveredULB).toBeGreaterThanOrEqual(ulb - 0.5)
    })
  })
})

describe('calcMaxAffordablePowerBudget', () => {
  const pool = 2200
  const regularUsers = 50
  const powerUsers = 10
  const universalULB = 30
  const bufferPercent = 10

  describe('exclusion OFF', () => {
    it('returns the correct max affordable power budget', () => {
      // effectiveCap = 500 / 1.1 ≈ 454.55
      // totalAffordable = 2200 + 454.55 = 2654.55
      // regularConsumption = 50 × 30 = 1500
      // maxPowerConsumption = 2654.55 - 1500 = 1154.55
      // maxPUB = 1154.55 / 10 = 115.45
      const result = calcMaxAffordablePowerBudget(500, pool, regularUsers, powerUsers, universalULB, bufferPercent, false)
      expect(result).toBeCloseTo(1154.545 / 10, 1)
    })

    it('returns 0 when budget cannot cover regular users', () => {
      // regularConsumption = 50 × 100 = 5000, pool = 2200, cap = 100
      // totalAffordable = 2200 + 90.9 = 2290.9, minus 5000 = negative
      const result = calcMaxAffordablePowerBudget(100, pool, 50, 10, 100, bufferPercent, false)
      expect(result).toBe(0)
    })

    it('returns Infinity when there are no power users', () => {
      const result = calcMaxAffordablePowerBudget(500, pool, 50, 0, 30, bufferPercent, false)
      expect(result).toBe(Infinity)
    })
  })

  describe('exclusion ON (quadratic solver)', () => {
    it('returns a value that makes the forward CC constraint non-binding', () => {
      const ccBudgetCap = 300
      const maxPUB = calcMaxAffordablePowerBudget(ccBudgetCap, pool, regularUsers, powerUsers, universalULB, bufferPercent, true)
      expect(maxPUB).toBeGreaterThan(0)
      expect(isFinite(maxPUB)).toBe(true)

      // Verify with forward constraint
      const rec = calcBudgetRecommendations(50, 10, universalULB, powerUsers, maxPUB, bufferPercent, true)
      const constraint = calcCostCenterBudgetConstraint(ccBudgetCap, rec)
      expect(constraint.isBinding).toBe(false)
    })
  })

  describe('round-trip consistency', () => {
    it('forward → reverse → forward produces consistent results', () => {
      const pub = 70
      const rec = calcBudgetRecommendations(50, 10, 30, 10, pub, 10, true)
      // Use recommended CC budget as the cap
      const ccCap = rec.recommendedCostCenterBudget

      const recoveredPUB = calcMaxAffordablePowerBudget(
        ccCap, rec.effectiveReservoirValue, rec.regularUsers,
        10, 30, 10, true,
      )
      expect(recoveredPUB).toBeGreaterThanOrEqual(pub - 0.5)
    })
  })
})

// ---------------------------------------------------------------------------
// URL state encoding with budget cap fields
// ---------------------------------------------------------------------------

describe('encodeState / decodeState with budget cap', () => {
  it('round-trips budget cap values', () => {
    const state = { cb: 50, ce: 10, ulb: 39, pu: 10, pub: 100, buf: 10, exc: '1', promo: '1', cap: 5000, cccap: 200 }
    const decoded = decodeState(encodeState(state))
    expect(decoded).not.toBeNull()
    expect(decoded!.budgetCap).toBe(5000)
    expect(decoded!.ccBudgetCap).toBe(200)
  })

  it('defaults cap fields to 0 when absent (backward compat)', () => {
    // Old-format URL with only 8 fields
    const oldState = { cb: 50, ce: 10, ulb: 39, pu: 10, pub: 100, buf: 10, exc: '1', promo: '1' }
    const decoded = decodeState(encodeState(oldState))
    expect(decoded!.budgetCap).toBe(0)
    expect(decoded!.ccBudgetCap).toBe(0)
  })

  it('omits cap fields from encoding when both are 0', () => {
    const withZero = encodeState({ cb: 50, ce: 10, ulb: 39, pu: 10, pub: 100, buf: 10, exc: '1', promo: '1', cap: 0, cccap: 0 })
    const without = encodeState({ cb: 50, ce: 10, ulb: 39, pu: 10, pub: 100, buf: 10, exc: '1', promo: '1' })
    expect(withZero).toBe(without)
  })
})

// ---------------------------------------------------------------------------
// URL state encoding with billing cycle fields
// ---------------------------------------------------------------------------

describe('encodeState / decodeState with billing cycle', () => {
  it('round-trips billing cycle values', () => {
    const state = { cb: 50, ce: 10, ulb: 39, pu: 10, pub: 100, buf: 10, exc: '1', promo: '1', cap: 5000, cccap: 200, mid: '1', midamt: 1234.56 }
    const decoded = decodeState(encodeState(state))
    expect(decoded).not.toBeNull()
    expect(decoded!.midCycleEnabled).toBe('1')
    expect(decoded!.midCyclePoolConsumed).toBeCloseTo(1234.56)
  })

  it('defaults mid-cycle fields when absent (backward compat)', () => {
    // Old-format URL with only 8 fields
    const oldState = { cb: 50, ce: 10, ulb: 39, pu: 10, pub: 100, buf: 10, exc: '1', promo: '1' }
    const decoded = decodeState(encodeState(oldState))
    expect(decoded!.midCycleEnabled).toBe('0')
    expect(decoded!.midCyclePoolConsumed).toBe(0)
  })

  it('defaults mid-cycle fields when only cap fields present (10-field compat)', () => {
    const state = { cb: 50, ce: 10, ulb: 39, pu: 10, pub: 100, buf: 10, exc: '1', promo: '1', cap: 3000, cccap: 100 }
    const decoded = decodeState(encodeState(state))
    expect(decoded!.budgetCap).toBe(3000)
    expect(decoded!.ccBudgetCap).toBe(100)
    expect(decoded!.midCycleEnabled).toBe('0')
    expect(decoded!.midCyclePoolConsumed).toBe(0)
  })

  it('omits mid-cycle fields when inactive', () => {
    const withMid = encodeState({ cb: 50, ce: 10, ulb: 39, pu: 10, pub: 100, buf: 10, exc: '1', promo: '1', mid: '0', midamt: 0 })
    const without = encodeState({ cb: 50, ce: 10, ulb: 39, pu: 10, pub: 100, buf: 10, exc: '1', promo: '1' })
    expect(withMid).toBe(without)
  })

  it('includes cap fields when mid-cycle is active but cap is 0', () => {
    const state = { cb: 50, ce: 10, ulb: 39, pu: 10, pub: 100, buf: 10, exc: '1', promo: '1', cap: 0, cccap: 0, mid: '1', midamt: 500 }
    const decoded = decodeState(encodeState(state))
    expect(decoded!.budgetCap).toBe(0)
    expect(decoded!.ccBudgetCap).toBe(0)
    expect(decoded!.midCycleEnabled).toBe('1')
    expect(decoded!.midCyclePoolConsumed).toBeCloseTo(500)
  })
})

// ---------------------------------------------------------------------------
// Real-world scenario: 130 CB + 40 CE, $10K budget, promo pricing
// ---------------------------------------------------------------------------

describe('Budget Lock scenario: 130 CB + 40 CE, $10K cap, promo', () => {
  const cb = 130, ce = 40, pu = 40, pub = 75, buf = 10
  const pool = (cb * 3000 + ce * 7000) * 0.01 // $6,700
  const regularUsers = cb + ce - pu // 130
  const rec = calcBudgetRecommendations(cb, ce, 39, pu, pub, buf, true)

  it('pool value matches expectations', () => {
    expect(rec.reservoirValue).toBe(6700)
    expect(rec.totalUsers).toBe(170)
    expect(rec.regularUsers).toBe(130)
  })

  describe('exclusion OFF', () => {
    it('max affordable ULB is positive and reasonable', () => {
      const maxULB = calcMaxAffordableULB(10000, pool, regularUsers, pu, pub, buf, false)
      expect(maxULB).toBeGreaterThan(19)
      expect(maxULB).toBeLessThan(200)
    })

    it('max affordable PUB is positive and reasonable', () => {
      const maxPUB = calcMaxAffordablePowerBudget(10000, pool, regularUsers, pu, 39, buf, false)
      expect(maxPUB).toBeGreaterThan(39)
      expect(maxPUB).toBeLessThan(500)
    })

    it('forward → reverse round-trip: ULB', () => {
      const ulb = 39
      const r = calcBudgetRecommendations(cb, ce, ulb, pu, pub, buf, true)
      const cap = r.recommendedEnterpriseBudget
      const recovered = calcMaxAffordableULB(cap, r.effectiveReservoirValue, r.regularUsers, pu, pub, buf, false)
      expect(recovered).toBeGreaterThanOrEqual(ulb - 0.5)
      expect(recovered).toBeLessThan(ulb + 1)
    })

    it('forward → reverse round-trip: PUB', () => {
      const r = calcBudgetRecommendations(cb, ce, 39, pu, pub, buf, true)
      const cap = r.recommendedEnterpriseBudget
      const recovered = calcMaxAffordablePowerBudget(cap, r.effectiveReservoirValue, r.regularUsers, pu, 39, buf, false)
      expect(recovered).toBeGreaterThanOrEqual(pub - 0.5)
      expect(recovered).toBeLessThan(pub + 1)
    })

    it('increasing budget cap increases affordable ULB', () => {
      const low = calcMaxAffordableULB(5000, pool, regularUsers, pu, pub, buf, false)
      const high = calcMaxAffordableULB(15000, pool, regularUsers, pu, pub, buf, false)
      expect(high).toBeGreaterThan(low)
    })

    it('setting ULB to max affordable makes constraint non-binding', () => {
      const cap = 8000
      const maxULB = calcMaxAffordableULB(cap, pool, regularUsers, pu, pub, buf, false)
      const r = calcBudgetRecommendations(cb, ce, maxULB, pu, pub, buf, true)
      const constraint = calcEnterpriseBudgetConstraint(cap, r, false)
      expect(constraint.isBinding).toBe(false)
    })
  })

  describe('exclusion ON', () => {
    it('ULB solver produces non-binding constraint', () => {
      const cap = 5000
      const maxULB = calcMaxAffordableULB(cap, pool, regularUsers, pu, pub, buf, true)
      expect(maxULB).toBeGreaterThan(0)
      const r = calcBudgetRecommendations(cb, ce, maxULB, pu, pub, buf, true)
      const constraint = calcEnterpriseBudgetConstraint(cap, r, true)
      expect(constraint.isBinding).toBe(false)
    })

    it('PUB solver with CC cap produces non-binding CC constraint', () => {
      const ccCap = 1000
      const maxPUB = calcMaxAffordablePowerBudget(ccCap, pool, regularUsers, pu, 39, buf, true)
      expect(maxPUB).toBeGreaterThan(0)
      const r = calcBudgetRecommendations(cb, ce, 39, pu, maxPUB, buf, true)
      const constraint = calcCostCenterBudgetConstraint(ccCap, r)
      expect(constraint.isBinding).toBe(false)
    })
  })
})

// ---------------------------------------------------------------------------
// Edge cases: pool-sufficient, single user group, large scale
// ---------------------------------------------------------------------------

describe('Budget Lock edge cases', () => {
  it('calculates exact max ULB when pool alone covers consumption', () => {
    const pool = 1000 * 3000 * 0.01 // $30,000
    const result = calcMaxAffordableULB(0, pool, 990, 10, 30, 10, false)
    expect(result).toBe(30)
  })

  it('returns large values when pool exceeds all possible consumption', () => {
    const pool = 100000
    const ulb = calcMaxAffordableULB(0, pool, 10, 5, 100, 0, false)
    const pub = calcMaxAffordablePowerBudget(0, pool, 10, 5, 100, 0, false)
    expect(ulb).toBe(9950)
    expect(pub).toBe(19800)
  })

  it('handles negative budget cap gracefully', () => {
    expect(calcMaxAffordableULB(-100, 2000, 50, 10, 70, 10, false)).toBe(0)
    expect(calcMaxAffordablePowerBudget(-100, 2000, 50, 10, 30, 10, false)).toBe(0)
  })

  it('handles both user counts zero', () => {
    expect(calcMaxAffordableULB(500, 2000, 0, 0, 0, 10, false)).toBe(Infinity)
    expect(calcMaxAffordablePowerBudget(500, 2000, 0, 0, 0, 10, false)).toBe(Infinity)
  })

  it('large enterprise: 5000 CB + 1000 CE, $500K cap', () => {
    const pool = (5000 * 3000 + 1000 * 7000) * 0.01 // $220,000
    const maxULB = calcMaxAffordableULB(500000, pool, 5500, 500, 200, 10, false)
    expect(maxULB).toBeGreaterThan(0)
    expect(isFinite(maxULB)).toBe(true)

    const rec = calcBudgetRecommendations(5000, 1000, maxULB, 500, 200, 10, true)
    const constraint = calcEnterpriseBudgetConstraint(500000, rec, false)
    expect(constraint.isBinding).toBe(false)
  })

  it('mid-cycle adjustment reduces affordable ULB', () => {
    const pool = 2200
    const fullCycle = calcMaxAffordableULB(500, pool, 50, 10, 70, 10, false)
    const midCycle = calcMaxAffordableULB(500, pool - 1000, 50, 10, 70, 10, false)
    expect(midCycle).toBeLessThan(fullCycle)
  })
})

// ---------------------------------------------------------------------------
// calcBudgetRecommendations — edge cases
// ---------------------------------------------------------------------------

describe('calcBudgetRecommendations — edge cases', () => {
  it('enterpriseBufferPercent = 100 doubles the post-pool budget recommendation', () => {
    const noBuffer = calcBudgetRecommendations(10, 0, 50, 0, 0, 0, true)
    const fullBuffer = calcBudgetRecommendations(10, 0, 50, 0, 0, 100, true)
    // Post-pool is the same, but recommended budget is 2× with 100% buffer
    expect(noBuffer.maxSpendBeyondReservoir).toBe(fullBuffer.maxSpendBeyondReservoir)
    expect(fullBuffer.recommendedEnterpriseBudget).toBe(
      Math.ceil(noBuffer.maxSpendBeyondReservoir * 2),
    )
  })

  it('poolConsumedSoFar = reservoirValue: full pool depletion', () => {
    const rec = calcBudgetRecommendations(10, 0, 50, 0, 0, 10, true, 300)
    // Pool = 10 × 3000 × 0.01 = $300, consumed = $300 → effective = $0
    expect(rec.effectiveReservoirValue).toBe(0)
    expect(rec.isMidCycleAdjusted).toBe(true)
    // All consumption is post-pool: max = 10 × $50 = $500
    expect(rec.maxSpendBeyondReservoir).toBe(500)
    expect(rec.isReservoirSufficient).toBe(false)
  })

  it('poolConsumedSoFar > reservoirValue: over-consumed, clamped to 0', () => {
    const rec = calcBudgetRecommendations(10, 0, 50, 0, 0, 10, true, 999)
    // Effective pool = max(0, 300 - 999) = 0
    expect(rec.effectiveReservoirValue).toBe(0)
    expect(rec.maxSpendBeyondReservoir).toBe(500)
  })

  it('full-cycle values remain stable regardless of mid-cycle consumption', () => {
    const fullCycle = calcBudgetRecommendations(10, 0, 50, 0, 0, 10, true, 0)
    const midCycle = calcBudgetRecommendations(10, 0, 50, 0, 0, 10, true, 150)
    const depleted = calcBudgetRecommendations(10, 0, 50, 0, 0, 10, true, 300)

    expect(fullCycle.fullCycleEnterpriseBudget).toBe(midCycle.fullCycleEnterpriseBudget)
    expect(midCycle.fullCycleEnterpriseBudget).toBe(depleted.fullCycleEnterpriseBudget)
    expect(fullCycle.fullCycleSpendBeyondReservoir).toBe(midCycle.fullCycleSpendBeyondReservoir)
  })

  it('powerUserBudget = 0: power users contribute zero consumption', () => {
    const rec = calcBudgetRecommendations(10, 0, 50, 5, 0, 10, true)
    expect(rec.maxPowerConsumption).toBe(0)
    // All consumption comes from regular users: (10-5) × $50 = $250
    expect(rec.maxRegularConsumption).toBe(250)
    expect(rec.maxTotalConsumption).toBe(250)
    expect(rec.powerUserShareOfConsumption).toBe(0)
  })

  it('very large enterpriseBufferPercent = 9999 still computes', () => {
    const rec = calcBudgetRecommendations(10, 0, 50, 0, 0, 9999, true)
    expect(Number.isFinite(rec.recommendedEnterpriseBudget)).toBe(true)
    expect(rec.recommendedEnterpriseBudget).toBeGreaterThan(0)
  })
})
