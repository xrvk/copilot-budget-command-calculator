import { describe, it, expect } from 'vitest'
import { encodeBudgetPlannerState, decodeBudgetPlannerState } from '../lib/budget-planner-state'

describe('encodeBudgetPlannerState / decodeBudgetPlannerState', () => {
  it('round-trips basic state', () => {
    const state = {
      enterpriseBudget: 5000,
      excludeCostCenters: true,
      preventFurtherUsage: false,
      costCenters: [
        { name: 'Engineering', budget: 500 },
        { name: 'Marketing', budget: 300 },
      ],
    }
    const decoded = decodeBudgetPlannerState(encodeBudgetPlannerState(state))
    expect(decoded).not.toBeNull()
    expect(decoded!.enterpriseBudget).toBe(5000)
    expect(decoded!.excludeCostCenters).toBe(true)
    expect(decoded!.preventFurtherUsage).toBe(false)
    expect(decoded!.costCenters).toEqual([
      { name: 'Engineering', budget: 500 },
      { name: 'Marketing', budget: 300 },
    ])
  })

  it('round-trips zero enterprise budget', () => {
    const state = { enterpriseBudget: 0, excludeCostCenters: false, preventFurtherUsage: true, costCenters: [] }
    const decoded = decodeBudgetPlannerState(encodeBudgetPlannerState(state))
    expect(decoded!.enterpriseBudget).toBe(0)
    expect(decoded!.excludeCostCenters).toBe(false)
    expect(decoded!.preventFurtherUsage).toBe(true)
    expect(decoded!.costCenters).toEqual([])
  })

  it('handles cost center names with special characters', () => {
    const state = {
      enterpriseBudget: 1000,
      excludeCostCenters: false,
      preventFurtherUsage: true,
      costCenters: [
        { name: 'R&D, Platform', budget: 200 },
        { name: 'Sales & Support (APAC)', budget: 100 },
      ],
    }
    const decoded = decodeBudgetPlannerState(encodeBudgetPlannerState(state))
    expect(decoded!.costCenters[0].name).toBe('R&D, Platform')
    expect(decoded!.costCenters[1].name).toBe('Sales & Support (APAC)')
  })

  it('filters empty cost center rows', () => {
    const state = {
      enterpriseBudget: 1000,
      excludeCostCenters: false,
      preventFurtherUsage: true,
      costCenters: [
        { name: '', budget: 0 },
        { name: 'Engineering', budget: 500 },
        { name: '  ', budget: 0 },
      ],
    }
    const decoded = decodeBudgetPlannerState(encodeBudgetPlannerState(state))
    expect(decoded!.costCenters).toHaveLength(1)
    expect(decoded!.costCenters[0].name).toBe('Engineering')
  })

  it('handles non-Latin1 / Unicode cost center names', () => {
    const state = {
      enterpriseBudget: 2000,
      excludeCostCenters: false,
      preventFurtherUsage: true,
      costCenters: [
        { name: 'Développement', budget: 300 },
        { name: '🚀 Rocket Team', budget: 400 },
        { name: '開発チーム', budget: 500 },
      ],
    }
    const decoded = decodeBudgetPlannerState(encodeBudgetPlannerState(state))
    expect(decoded).not.toBeNull()
    expect(decoded!.costCenters[0].name).toBe('Développement')
    expect(decoded!.costCenters[1].name).toBe('🚀 Rocket Team')
    expect(decoded!.costCenters[2].name).toBe('開発チーム')
  })

  it('returns null for empty string', () => {
    expect(decodeBudgetPlannerState('')).toBeNull()
  })

  it('returns null for non-base64 garbage', () => {
    expect(decodeBudgetPlannerState('not-valid!!!')).toBeNull()
  })

  it('returns null for base64 with invalid JSON', () => {
    const bad = btoa('not json at all')
    expect(decodeBudgetPlannerState(bad)).toBeNull()
  })

  it('returns null for JSON missing enterprise budget', () => {
    const bad = btoa(JSON.stringify({ x: 1, s: 1, c: [] }))
    expect(decodeBudgetPlannerState(bad)).toBeNull()
  })

  it('round-trips large cost center lists', () => {
    const costCenters = Array.from({ length: 50 }, (_, i) => ({
      name: `Team ${i + 1}`,
      budget: (i + 1) * 100,
    }))
    const state = { enterpriseBudget: 50000, excludeCostCenters: true, preventFurtherUsage: true, costCenters }
    const decoded = decodeBudgetPlannerState(encodeBudgetPlannerState(state))
    expect(decoded!.costCenters).toHaveLength(50)
    expect(decoded!.costCenters[49].name).toBe('Team 50')
    expect(decoded!.costCenters[49].budget).toBe(5000)
  })
})
