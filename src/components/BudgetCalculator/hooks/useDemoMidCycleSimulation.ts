/**
 * Demo-mode mid-cycle simulation hook.
 *
 * When the user enters demo mode, simulate a mid-billing-cycle scenario so
 * the Tier Planner shows "what's already consumed" annotations. Calendar-aware:
 * proportional to how far through the month we are.
 *
 * Extracted from `BudgetCalculator.tsx` to keep the orchestrator focused.
 */

import { useState } from 'react'

/**
 * Pure computation of the simulated mid-cycle pool consumption value.
 * Depends on the current date for proportion through the month.
 */
export function computeDemoMidCyclePool(now: Date = new Date()): number {
  const dayOfMonth = now.getDate()
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
  const proportionElapsed = dayOfMonth / daysInMonth
  // Demo pool: 130 CB × 3000 + 40 CE × 7000 = 670,000 AICs = $6,700
  const demoReservoirValue = (130 * 3000 + 40 * 7000) * 0.01
  return Math.round(demoReservoirValue * proportionElapsed * 0.85)
}

export interface UseDemoMidCycleSimulationOpts {
  isDemo: boolean
  midCycleDemoSimulated: boolean
  setMidCycleDemoSimulated: (v: boolean) => void
  setMidCycleEnabled: (v: boolean) => void
  setMidCyclePoolConsumed: (v: number) => void
  setMidCycleAutoFetched: (v: boolean) => void
  powerBudgetManuallySet: boolean
  setPowerUserBudget: (v: number) => void
}

/**
 * Run mid-cycle demo simulation when isDemo flips on (one-shot per session),
 * and reset the simulation gate when isDemo flips off.
 *
 * Uses the state-during-render pattern (track previous value via useState,
 * apply effects inside the render path when the value changes) to avoid the
 * useEffect-as-sync anti-pattern flagged by react-hooks/set-state-in-effect.
 */
export function useDemoMidCycleSimulation(opts: UseDemoMidCycleSimulationOpts): void {
  const [prevIsDemo, setPrevIsDemo] = useState(opts.isDemo)
  if (opts.isDemo === prevIsDemo) return

  setPrevIsDemo(opts.isDemo)
  if (opts.isDemo && !opts.midCycleDemoSimulated) {
    opts.setMidCycleDemoSimulated(true)
    opts.setMidCycleEnabled(true)
    if (!opts.powerBudgetManuallySet) {
      opts.setPowerUserBudget(75)
    }
    opts.setMidCyclePoolConsumed(computeDemoMidCyclePool())
    opts.setMidCycleAutoFetched(true)
  } else if (!opts.isDemo) {
    opts.setMidCycleDemoSimulated(false)
  }
}
