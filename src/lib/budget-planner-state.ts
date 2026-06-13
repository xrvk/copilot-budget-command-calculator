/**
 * URL state encoding/decoding for the Budget Planner tab.
 *
 * Format: base64(JSON) with compact keys:
 *   { e: enterpriseBudget, x: excludeCostCenters (0|1), s: preventFurtherUsage (0|1),
 *     c: [[name, budget], ...] }
 *
 * Cost center names can contain any characters — JSON handles escaping.
 */

export interface BudgetPlannerUrlState {
  enterpriseBudget: number
  excludeCostCenters: boolean
  preventFurtherUsage: boolean
  costCenters: Array<{ name: string; budget: number }>
}

interface CompactState {
  e: number
  x: 0 | 1
  s: 0 | 1
  c: Array<[string, number]>
}

export function encodeBudgetPlannerState(state: BudgetPlannerUrlState): string {
  const compact: CompactState = {
    e: state.enterpriseBudget,
    x: state.excludeCostCenters ? 1 : 0,
    s: state.preventFurtherUsage ? 1 : 0,
    c: state.costCenters
      .filter(cc => cc.name.trim() || cc.budget > 0)
      .map(cc => [cc.name, cc.budget]),
  }
  // UTF-8 safe: encode to bytes first so non-Latin1 characters (accents, emoji) don't throw
  const bytes = new TextEncoder().encode(JSON.stringify(compact))
  return btoa(String.fromCharCode(...bytes))
}

export function decodeBudgetPlannerState(encoded: string): BudgetPlannerUrlState | null {
  try {
    const binary = atob(encoded)
    const bytes = Uint8Array.from(binary, c => c.charCodeAt(0))
    const raw = JSON.parse(new TextDecoder().decode(bytes)) as CompactState
    if (typeof raw.e !== 'number') return null
    return {
      enterpriseBudget: raw.e,
      excludeCostCenters: raw.x === 1,
      preventFurtherUsage: raw.s === 1,
      costCenters: Array.isArray(raw.c)
        ? raw.c.map(([name, budget]) => ({ name: String(name), budget: Number(budget) || 0 }))
        : [],
    }
  } catch {
    return null
  }
}
