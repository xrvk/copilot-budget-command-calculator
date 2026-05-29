// --- Constants ---
const CB_AIC_VALUE = 3_000
const CE_AIC_VALUE = 7_000
const CB_COST = 19
const CE_COST = 39
const PAYG_RATE = 0.01 // $0.01 per AIC pay-as-you-go

export interface OptimizationResult {
  cbToceUpgrades: number
  newCbSeats: number
  newCeSeats: number
  seatCost: number
  aicsGained: number
  paygEquivalent: number
  savings: number
  reducedBudget: number
}

export function optimizeSeats(
  enterpriseBudget: number,
  freeGhecSlots: number,
  existingAics: number,
  existingCbSeats: number,
  existingCeSeats: number,
): OptimizationResult {
  // The enterprise budget covers pay-as-you-go spend at $0.01/AIC.
  // Entitlement AICs from seats are consumed first, reducing PAYG pressure.
  // Goal: gain enough AICs so entitlements cover the budget's worth of usage.

  const budgetAics = enterpriseBudget / PAYG_RATE
  const additionalNeeded = Math.max(0, budgetAics - existingAics)

  if (additionalNeeded === 0) {
    return {
      cbToceUpgrades: 0, newCbSeats: 0, newCeSeats: 0,
      seatCost: 0, aicsGained: 0, paygEquivalent: 0, savings: 0,
      reducedBudget: 0,
    }
  }

  let remaining = additionalNeeded
  let cbToceUpgrades = 0
  const newCeSeats = 0

  // Phase 1: If enterprise already has CE seats AND free GHEC headroom,
  // upgrade existing CB → CE first. This is the cheapest path:
  // +4K AICs per upgrade at only $20 incremental ($5/1K AICs).
  const canUpgradeCbToCe = existingCeSeats > 0 && freeGhecSlots > 0
  if (canUpgradeCbToCe) {
    const maxUpgrades = Math.min(existingCbSeats, freeGhecSlots)
    while (remaining > 0 && cbToceUpgrades < maxUpgrades) {
      cbToceUpgrades++
      remaining -= (CE_AIC_VALUE - CB_AIC_VALUE) // net +4K AICs per upgrade
    }
  }

  // Phase 2: New CB seats for remaining ($19 each, 3K AICs)
  const newCbSeats = remaining > 0 ? Math.ceil(remaining / CB_AIC_VALUE) : 0
  const aicsGained =
    cbToceUpgrades * (CE_AIC_VALUE - CB_AIC_VALUE) +
    newCeSeats * CE_AIC_VALUE +
    newCbSeats * CB_AIC_VALUE
  // CB→CE upgrade costs the difference ($39 - $19 = $20 incremental)
  const seatCost =
    cbToceUpgrades * (CE_COST - CB_COST) +
    newCeSeats * CE_COST +
    newCbSeats * CB_COST
  const paygEquivalent = aicsGained * PAYG_RATE

  const totalEntitlementAics = existingAics + aicsGained
  const entitlementBudgetValue = totalEntitlementAics * PAYG_RATE
  const reducedBudget = Math.max(0, enterpriseBudget - entitlementBudgetValue)

  return {
    cbToceUpgrades,
    newCbSeats,
    newCeSeats,
    seatCost,
    aicsGained,
    paygEquivalent,
    savings: paygEquivalent - seatCost,
    reducedBudget,
  }
}
