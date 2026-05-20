// URL state encoding/decoding helpers for the Tier Planner.
//
// Pure budget math lives in `@copilot-budget/calculator-core`. This file keeps
// only the browser-coupled URL-param helpers and re-exports the math for
// backward compatibility. New code should import math directly from the package.

import type { ParamState } from '@copilot-budget/calculator-core'

// Re-export pure math for backward compatibility.
export {
  calcBudgetRecommendations,
  calcEnterpriseBudgetConstraint,
  calcCostCenterBudgetConstraint,
  calcMaxAffordableULB,
  calcMaxAffordablePowerBudget,
  calcMultiCCConstraints,
} from '@copilot-budget/calculator-core'

// --- URL param helpers ---
// State keys in fixed order: cb, ce, ulb, pu, pub, buf, exc, promo[, cap, cccap[, mid, midamt]]
export function encodeState(vals: { cb: number; ce: number; ulb: number; pu: number; pub: number; buf: number; exc: string; promo: string; cap?: number; cccap?: number; mid?: string; midamt?: number }): string {
  const parts = [vals.cb, vals.ce, vals.ulb, vals.pu, vals.pub, vals.buf, vals.exc, vals.promo]
  const hasCap = (vals.cap && vals.cap > 0) || (vals.cccap && vals.cccap > 0)
  const hasMid = vals.mid === '1' || (vals.midamt && vals.midamt > 0)
  // Append cap fields when non-zero, or when mid-cycle fields follow
  if (hasCap || hasMid) {
    parts.push(vals.cap ?? 0, vals.cccap ?? 0)
  }
  // Append mid-cycle fields when active
  if (hasMid) {
    parts.push(vals.mid ?? '0', vals.midamt ?? 0)
  }
  return btoa(parts.join(','))
}

export function decodeState(s: string): ParamState | null {
  try {
    const parts = atob(s).split(',')
    if (parts.length < 8) return null
    return {
      cbLicenses:             parseInt(parts[0], 10),
      ceLicenses:             parseInt(parts[1], 10),
      universalULB:           parseFloat(parts[2]),
      powerUsers:             parseInt(parts[3], 10),
      powerUserBudget:        parseFloat(parts[4]),
      enterpriseBufferPercent: parseInt(parts[5], 10),
      excludeCostCenterUsage: parts[6],
      promotionalPricing:     parts[7],
      cbFromUrl: true,
      ceFromUrl: true,
      ulbFromUrl: true,
      pubFromUrl: true,
      puFromUrl:  true,
      budgetCap:   parts.length > 8 ? parseInt(parts[8], 10) || 0 : 0,
      ccBudgetCap: parts.length > 9 ? parseInt(parts[9], 10) || 0 : 0,
      midCycleEnabled:       parts.length > 10 ? parts[10] : '0',
      midCyclePoolConsumed:  parts.length > 11 ? parseFloat(parts[11]) || 0 : 0,
    }
  } catch { return null }
}

export function readParams() {
  const raw = window.location.hash.slice(1)
  const qIndex = raw.indexOf('?')
  const hashQuery = qIndex === -1 ? '' : raw.slice(qIndex + 1)
  const p = new URLSearchParams(hashQuery)
  // Prefer compact `s` param, fall back to legacy individual params
  const encoded = p.get('s')
  if (encoded) {
    const decoded = decodeState(encoded)
    if (decoded) return decoded
  }
  return {
    cbLicenses:            parseInt(p.get('cb')    ?? '', 10),
    ceLicenses:            parseInt(p.get('ce')    ?? '', 10),
    universalULB:          parseFloat(p.get('ulb') ?? ''),
    powerUsers:            parseInt(p.get('pu')    ?? '', 10),
    powerUserBudget:       parseFloat(p.get('pub') ?? ''),
    enterpriseBufferPercent: parseInt(p.get('buf') ?? '', 10),
    excludeCostCenterUsage: p.get('exc'),
    promotionalPricing:    p.get('promo'),
    cbFromUrl:    p.has('cb'),
    ceFromUrl:    p.has('ce'),
    ulbFromUrl:   p.has('ulb'),
    pubFromUrl:   p.has('pub'),
    puFromUrl:    p.has('pu'),
    budgetCap:   parseInt(p.get('cap') ?? '', 10) || 0,
    ccBudgetCap: parseInt(p.get('cccap') ?? '', 10) || 0,
    midCycleEnabled:      p.get('mid') ?? '0',
    midCyclePoolConsumed: parseFloat(p.get('midamt') ?? '') || 0,
  }
}
