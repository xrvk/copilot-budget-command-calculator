// --- Consumption Analysis Library ---
//
// Pure functions for analyzing per-user AIC consumption from billing CSV data.
// Used to identify power users, suggest thresholds, and pre-fill Tier Planner inputs.

import type { CsvUserUsage } from './chargeback'

// --- Types ---

export interface ConsumptionStats {
  totalUsers: number
  totalAICs: number
  mean: number
  median: number
  p75: number
  p90: number
  max: number
  stddev: number
  cbSeats: number
  ceSeats: number
}

export interface ThresholdResult {
  thresholdAICs: number
  powerUsers: CsvUserUsage[]
  regularUsers: CsvUserUsage[]
  powerUserCount: number
  regularUserCount: number
  powerUserAICShare: number
  suggestedPowerUserBudget: number
  suggestedULB: number
}

export type ThresholdMode = 'top-10' | 'top-20' | 'top-30' | 'custom'

// --- Distribution Statistics ---

function sortedValues(users: CsvUserUsage[]): number[] {
  return users.map(u => u.totalAICs).sort((a, b) => a - b)
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0
  if (sorted.length === 1) return sorted[0]
  const idx = (p / 100) * (sorted.length - 1)
  const lower = Math.floor(idx)
  const upper = Math.ceil(idx)
  if (lower === upper) return sorted[lower]
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (idx - lower)
}

export function calcConsumptionStats(users: CsvUserUsage[]): ConsumptionStats {
  if (users.length === 0) {
    return { totalUsers: 0, totalAICs: 0, mean: 0, median: 0, p75: 0, p90: 0, max: 0, stddev: 0, cbSeats: 0, ceSeats: 0 }
  }

  const sorted = sortedValues(users)
  const totalAICs = sorted.reduce((sum, v) => sum + v, 0)
  const mean = totalAICs / sorted.length
  const variance = sorted.reduce((sum, v) => sum + (v - mean) ** 2, 0) / sorted.length

  return {
    totalUsers: users.length,
    totalAICs,
    mean,
    median: percentile(sorted, 50),
    p75: percentile(sorted, 75),
    p90: percentile(sorted, 90),
    max: sorted[sorted.length - 1],
    stddev: Math.sqrt(variance),
    cbSeats: users.filter(u => u.totalMonthlyQuota === 300).length,
    ceSeats: users.filter(u => u.totalMonthlyQuota === 1000).length,
  }
}

// --- Threshold Application ---

export function applyThreshold(
  users: CsvUserUsage[],
  thresholdAICs: number,
): ThresholdResult {
  // Sort descending by consumption
  const sorted = [...users].sort((a, b) => b.totalAICs - a.totalAICs)
  const totalAICs = sorted.reduce((sum, u) => sum + u.totalAICs, 0)

  const powerUsers = sorted.filter(u => u.totalAICs >= thresholdAICs)
  const regularUsers = sorted.filter(u => u.totalAICs < thresholdAICs)

  const powerAICs = powerUsers.reduce((sum, u) => sum + u.totalAICs, 0)
  const powerUserAICShare = totalAICs > 0 ? powerAICs / totalAICs : 0

  // Suggest power user budget: median of power group's consumption
  const powerSorted = powerUsers.map(u => u.totalAICs).sort((a, b) => a - b)
  const suggestedPowerUserBudget = powerSorted.length > 0
    ? percentile(powerSorted, 50)
    : 0

  // Suggest ULB: P95 of regular group's consumption. Covers most base users
  // without inflating the cap to the very top outlier. Admins can drag down
  // for a tighter cap or up to cover everyone.
  const regularSorted = regularUsers.map(u => u.totalAICs).sort((a, b) => a - b)
  const suggestedULB = regularSorted.length > 0
    ? percentile(regularSorted, 95)
    : 0

  return {
    thresholdAICs,
    powerUsers,
    regularUsers,
    powerUserCount: powerUsers.length,
    regularUserCount: regularUsers.length,
    powerUserAICShare,
    suggestedPowerUserBudget: Math.ceil(suggestedPowerUserBudget),
    suggestedULB: Math.ceil(suggestedULB),
  }
}

// --- Threshold Calculation by Mode ---

export function calcThreshold(
  users: CsvUserUsage[],
  mode: ThresholdMode,
  customAICs?: number,
): ThresholdResult {
  if (users.length === 0) {
    return applyThreshold([], 0)
  }

  const sorted = [...users].sort((a, b) => b.totalAICs - a.totalAICs)

  switch (mode) {
    case 'top-10': {
      const count = Math.max(1, Math.ceil(sorted.length * 0.1))
      const threshold = sorted[count - 1].totalAICs
      return applyThreshold(users, threshold)
    }
    case 'top-20': {
      const count = Math.max(1, Math.ceil(sorted.length * 0.2))
      const threshold = sorted[count - 1].totalAICs
      return applyThreshold(users, threshold)
    }
    case 'top-30': {
      const count = Math.max(1, Math.ceil(sorted.length * 0.3))
      const threshold = sorted[count - 1].totalAICs
      return applyThreshold(users, threshold)
    }
    case 'custom': {
      return applyThreshold(users, customAICs ?? 0)
    }
  }
}

// --- License Detection from Quota ---

export function detectLicenseMix(users: CsvUserUsage[]): { cbSeats: number; ceSeats: number } {
  return {
    cbSeats: users.filter(u => u.totalMonthlyQuota === 300).length,
    ceSeats: users.filter(u => u.totalMonthlyQuota === 1000).length,
  }
}
