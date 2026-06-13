import { describe, it, expect } from 'vitest'
import { calcForecast, type ForecastUser } from '@copilot-budget/calculator-core'

const AIC = 0.01  // 1 AIC = $0.01

// Convert dollars to AICs for test fixtures (cleaner to think in dollars).
const d = (dollars: number): number => dollars / AIC

function makeUsers(consumptions: number[]): ForecastUser[] {
  return consumptions.map((dollars, i) => ({ login: `user${i}`, totalAICs: d(dollars) }))
}

describe('calcForecast', () => {
  it('returns null for empty user list', () => {
    const result = calcForecast({
      users: [],
      baseULB: 200,
      powerULB: 500,
      powerThresholdAICs: d(300),
      pool: 1000,
    })
    expect(result).toBeNull()
  })

  it('with loose ULBs (above every actual): forecast == billingBaseline', () => {
    const users = makeUsers([50, 80, 120, 150, 200])
    const result = calcForecast({
      users,
      baseULB: 500,         // way above everyone
      powerULB: 1000,
      powerThresholdAICs: d(10_000),
      pool: 100,
    })!
    // total actual = 600, pool = 100, billingBaseline = 500
    expect(result.totalActualConsumption).toBeCloseTo(600)
    expect(result.billingBaseline).toBeCloseTo(500)
    expect(result.forecastWithCaps).toBeCloseTo(500)
    expect(result.forecastSpend).toBeCloseTo(500)
    expect(result.isFlooredToBaseline).toBe(false)
    expect(result.cappedUserCount).toBe(0)
  })

  it('with tight ULBs (caps users): forecast floored to billingBaseline', () => {
    const users = makeUsers([50, 200, 400, 600])
    const result = calcForecast({
      users,
      baseULB: 150,         // caps everyone except user0
      powerULB: 150,
      powerThresholdAICs: d(99_999),  // no power users
      pool: 100,
    })!
    // total actual = 1250, capped = 50+150+150+150 = 500
    // pool = 100, baseline = 1150, withCaps = 400
    expect(result.totalActualConsumption).toBeCloseTo(1250)
    expect(result.billingBaseline).toBeCloseTo(1150)
    expect(result.forecastWithCaps).toBeCloseTo(400)
    // The floor invariant: forecast >= baseline
    expect(result.forecastSpend).toBeCloseTo(1150)
    expect(result.isFlooredToBaseline).toBe(true)
    expect(result.cappedUserCount).toBe(3)
  })

  it('pool covers all consumption: forecast == 0', () => {
    const users = makeUsers([50, 80, 120])
    const result = calcForecast({
      users,
      baseULB: 100,
      powerULB: 100,
      powerThresholdAICs: d(99_999),
      pool: 1000,
    })!
    expect(result.billingBaseline).toBe(0)
    expect(result.forecastWithCaps).toBe(0)
    expect(result.forecastSpend).toBe(0)
    expect(result.isFlooredToBaseline).toBe(false)
  })

  it('power users get the power ULB', () => {
    const users = makeUsers([100, 200, 500, 1000])
    const result = calcForecast({
      users,
      baseULB: 150,            // caps user1
      powerULB: 800,           // caps user3 (still above user2)
      powerThresholdAICs: d(400),  // user2 (500) and user3 (1000) are power
      pool: 0,
    })!
    // user0 actual=100, base ULB 150 -> 100
    // user1 actual=200, base ULB 150 -> 150 (capped)
    // user2 actual=500, power ULB 800 -> 500
    // user3 actual=1000, power ULB 800 -> 800 (capped)
    // total actual = 1800, capped = 100+150+500+800 = 1550
    expect(result.totalActualConsumption).toBeCloseTo(1800)
    expect(result.billingBaseline).toBeCloseTo(1800)
    expect(result.forecastWithCaps).toBeCloseTo(1550)
    expect(result.forecastSpend).toBeCloseTo(1800)  // floored to baseline
    expect(result.cappedUserCount).toBe(2)
  })

  it('exclusion ON splits forecast per scope, each independently floored', () => {
    const users: ForecastUser[] = [
      { login: 'base1', totalAICs: d(100) },
      { login: 'base2', totalAICs: d(200) },
      { login: 'power1', totalAICs: d(500) },
      { login: 'power2', totalAICs: d(800) },
    ]
    const ccMembers = new Set(['power1', 'power2'])
    const result = calcForecast({
      users,
      baseULB: 150,        // caps base2
      powerULB: 600,       // caps power2
      powerThresholdAICs: d(99_999),  // power CC membership decides scope, not threshold
      pool: 100,
      excludeCostCenterUsage: true,
      costCenterMemberLogins: ccMembers,
    })!
    // ent scope (base users): actual=300, capped=100+150=250
    // cc scope: actual=1300, capped=500+600=1100  (wait - base users get baseULB)
    // Actually with no power threshold met, all 4 use baseULB. Re-think:
    // power1 actual=500, baseULB=150 -> 150 (since not above power threshold)
    // power2 actual=800, baseULB=150 -> 150
    // ent actual=300, ent capped=250 (since base2 capped at 150)
    // cc actual=1300, cc capped=150+150=300
    // pool split proportionally to actual: ent share = 100*300/1600=18.75, cc share = 81.25
    // entBaseline = 300-18.75 = 281.25, entWithCaps = 250-18.75 = 231.25
    // ccBaseline = 1300-81.25 = 1218.75, ccWithCaps = 300-81.25 = 218.75
    expect(result.forecastEnterprise).toBeCloseTo(281.25)  // floored
    expect(result.forecastCostCenter).toBeCloseTo(1218.75) // floored
    expect(result.forecastSpend).toBeCloseTo(281.25 + 1218.75)
    expect(result.isFlooredToBaseline).toBe(true)
  })

  it('mid-cycle: pass reduced effective pool', () => {
    const users = makeUsers([100, 100, 100])
    const fullPool = 200
    const consumed = 150
    const result = calcForecast({
      users,
      baseULB: 200,
      powerULB: 200,
      powerThresholdAICs: d(99_999),
      pool: fullPool - consumed,   // effective pool = 50
    })!
    // total actual = 300, effective pool = 50, baseline = 250
    expect(result.billingBaseline).toBeCloseTo(250)
    expect(result.forecastSpend).toBeCloseTo(250)
  })

  // --- Property: floor invariant ---

  it('PROPERTY: forecastSpend >= billingBaseline for all inputs', () => {
    // Sample 20 random scenarios
    const seed = 42
    let s = seed
    const rand = () => {
      s = (s * 1664525 + 1013904223) >>> 0
      return s / 0xFFFFFFFF
    }

    for (let i = 0; i < 20; i++) {
      const userCount = 1 + Math.floor(rand() * 20)
      const users = Array.from({ length: userCount }, (_, j) => ({
        login: `u${j}`,
        totalAICs: d(rand() * 2000),
      }))
      const baseULB = 50 + rand() * 500
      const powerULB = baseULB + rand() * 500
      const result = calcForecast({
        users,
        baseULB,
        powerULB,
        powerThresholdAICs: d(rand() * 1500),
        pool: rand() * 3000,
      })!
      expect(result.forecastSpend).toBeGreaterThanOrEqual(result.billingBaseline - 1e-9)
      expect(result.forecastSpend).toBeGreaterThanOrEqual(result.forecastWithCaps - 1e-9)
    }
  })
})
