import { describe, it, expect } from 'vitest'
import { computeDemoMidCyclePool } from '../components/BudgetCalculator/hooks/useDemoMidCycleSimulation'

describe('computeDemoMidCyclePool', () => {
  // Demo pool value: 130 CB × 3000 + 40 CE × 7000 = 670,000 AICs = $6,700
  // Simulated consumption is 85% of the proportion-elapsed pool value.

  it('returns 0 on day 0 (impossible, but lower bound)', () => {
    // Use 1st of a 31-day month → 1/31 of pool consumed × 0.85
    const r = computeDemoMidCyclePool(new Date(2026, 0, 1)) // Jan 1
    expect(r).toBe(Math.round(6700 * (1 / 31) * 0.85))
  })

  it('returns approximately full simulated value on the last day of a 30-day month', () => {
    const r = computeDemoMidCyclePool(new Date(2026, 3, 30)) // April 30 (30-day month)
    expect(r).toBe(Math.round(6700 * (30 / 30) * 0.85))
    expect(r).toBe(Math.round(6700 * 0.85))
  })

  it('returns approximately half the simulated value mid-month', () => {
    const r = computeDemoMidCyclePool(new Date(2026, 0, 16)) // Jan 16, 31-day month
    expect(r).toBe(Math.round(6700 * (16 / 31) * 0.85))
  })

  it('handles February (28 or 29 days) correctly', () => {
    const r = computeDemoMidCyclePool(new Date(2026, 1, 14)) // Feb 14, 2026 = 28-day month
    expect(r).toBe(Math.round(6700 * (14 / 28) * 0.85))
  })

  it('rounds the result to an integer dollar amount', () => {
    const r = computeDemoMidCyclePool(new Date(2026, 5, 17)) // arbitrary mid-month
    expect(Number.isInteger(r)).toBe(true)
  })
})
