/**
 * Tests for the Step 4 protection logic that prevents silently overwriting
 * individual ULBs set elsewhere (e.g. Consumption Analysis Apply).
 *
 * These tests cover the pure derivations that drive the UI:
 *   - protectedLogins: who is excluded by default
 *   - selectedLogins filter: how protection + override compose
 *   - loweringSet: who would be lowered (drives the confirm dialog)
 *
 * Component-render coverage lives in tab-smoke.test.tsx (which exercises the
 * full BudgetCalculator render path) and tier-planner-connected.test.tsx.
 */

import { describe, it, expect } from 'vitest'

type UserBudget = { id: string; login: string; amount: number }

// -----------------------------------------------------------------------------
// Helpers — these mirror the derivations inside StepIndividualBudgets.tsx.
// Keeping them as standalone functions so we can test the rules in isolation
// without rendering the component.
// -----------------------------------------------------------------------------

function deriveProtectedLogins(liveUserBudgets: UserBudget[], effectiveAmount: number): Set<string> {
  const out = new Set<string>()
  for (const ub of liveUserBudgets) {
    if (ub.amount >= effectiveAmount) out.add(ub.login)
  }
  return out
}

function deriveSelectedLogins(
  members: Array<{ login: string }>,
  deselected: Set<string>,
  protectedLogins: Set<string>,
  protectedOverridden: Set<string>,
): Set<string> {
  return new Set(
    members
      .filter(m => !deselected.has(m.login))
      .filter(m => !protectedLogins.has(m.login) || protectedOverridden.has(m.login))
      .map(m => m.login),
  )
}

function deriveLoweringSet(
  applySet: Set<string>,
  liveUserBudgets: UserBudget[],
  effectiveAmount: number,
): Array<{ login: string; from: number; to: number }> {
  const out: Array<{ login: string; from: number; to: number }> = []
  for (const login of applySet) {
    const existing = liveUserBudgets.find(b => b.login === login)
    if (existing && existing.amount > effectiveAmount) {
      out.push({ login, from: existing.amount, to: effectiveAmount })
    }
  }
  return out
}

const ub = (login: string, amount: number): UserBudget => ({
  id: `b-${login}`,
  login,
  amount,
})

describe('Step 4 — protectedLogins derivation', () => {
  it('includes users with existing budget >= effectiveAmount', () => {
    const live = [ub('alice', 500), ub('bob', 300), ub('carol', 200)]
    const result = deriveProtectedLogins(live, 300)
    expect(result.has('alice')).toBe(true)
    expect(result.has('bob')).toBe(true) // exactly equal counts as protected (>=)
    expect(result.has('carol')).toBe(false)
  })

  it('is empty when effectiveAmount exceeds all existing budgets', () => {
    const live = [ub('alice', 500), ub('bob', 300)]
    const result = deriveProtectedLogins(live, 1000)
    expect(result.size).toBe(0)
  })

  it('includes everyone when effectiveAmount is 0', () => {
    // Edge: amount=0 means we are about to lower everyone to $0. Protect all.
    const live = [ub('alice', 500), ub('bob', 300), ub('carol', 1)]
    const result = deriveProtectedLogins(live, 0)
    expect(result.size).toBe(3)
  })

  it('is empty when there are no live user budgets (unconnected admin)', () => {
    const result = deriveProtectedLogins([], 300)
    expect(result.size).toBe(0)
  })

  it('recomputes correctly when effectiveAmount changes', () => {
    const live = [ub('alice', 500), ub('bob', 300), ub('carol', 200)]
    expect(deriveProtectedLogins(live, 200).size).toBe(3) // all protected
    expect(deriveProtectedLogins(live, 300).size).toBe(2) // alice + bob
    expect(deriveProtectedLogins(live, 500).size).toBe(1) // only alice
    expect(deriveProtectedLogins(live, 600).size).toBe(0) // none
  })
})

describe('Step 4 — selectedLogins filter (protection + override composition)', () => {
  const members = [
    { login: 'alice' },
    { login: 'bob' },
    { login: 'carol' },
  ]

  it('excludes protected logins by default', () => {
    const protectedLogins = new Set(['alice'])
    const selected = deriveSelectedLogins(members, new Set(), protectedLogins, new Set())
    expect(selected.has('alice')).toBe(false)
    expect(selected.has('bob')).toBe(true)
    expect(selected.has('carol')).toBe(true)
  })

  it('includes protected logins when explicitly overridden', () => {
    const protectedLogins = new Set(['alice'])
    const protectedOverridden = new Set(['alice'])
    const selected = deriveSelectedLogins(members, new Set(), protectedLogins, protectedOverridden)
    expect(selected.has('alice')).toBe(true)
    expect(selected.has('bob')).toBe(true)
    expect(selected.has('carol')).toBe(true)
  })

  it('deselected takes precedence over override (explicit uncheck wins)', () => {
    const protectedLogins = new Set(['alice'])
    const protectedOverridden = new Set(['alice'])
    const deselected = new Set(['alice'])
    const selected = deriveSelectedLogins(members, deselected, protectedLogins, protectedOverridden)
    expect(selected.has('alice')).toBe(false)
  })

  it('unconnected admin (empty protectedLogins) behaves identically to today', () => {
    const selected = deriveSelectedLogins(members, new Set(), new Set(), new Set())
    expect(selected.size).toBe(3)
    expect(selected.has('alice')).toBe(true)
    expect(selected.has('bob')).toBe(true)
    expect(selected.has('carol')).toBe(true)
  })

  it('handles all members protected without crashing', () => {
    const protectedLogins = new Set(['alice', 'bob', 'carol'])
    const selected = deriveSelectedLogins(members, new Set(), protectedLogins, new Set())
    expect(selected.size).toBe(0)
  })
})

describe('Step 4 — loweringSet (drives confirmation dialog)', () => {
  it('includes any user whose existing budget > effectiveAmount', () => {
    const live = [ub('alice', 500), ub('bob', 300), ub('carol', 100)]
    const applySet = new Set(['alice', 'bob', 'carol'])
    const lowering = deriveLoweringSet(applySet, live, 300)
    // Only alice ($500 > $300). bob is equal, carol is below.
    expect(lowering).toHaveLength(1)
    expect(lowering[0]).toEqual({ login: 'alice', from: 500, to: 300 })
  })

  it('covers manual-textarea entries (not gated on protectedOverridden)', () => {
    // This is the R2 case: admin types "dave" directly, dave has $800 existing,
    // cohort amount is $200. Even though dave was never "protected" via the
    // selection layer, the lowering set must catch this so the confirm dialog fires.
    const live = [ub('dave', 800)]
    const applySet = new Set(['dave']) // came from manual textarea
    const lowering = deriveLoweringSet(applySet, live, 200)
    expect(lowering).toHaveLength(1)
    expect(lowering[0]).toEqual({ login: 'dave', from: 800, to: 200 })
  })

  it('is empty when no users in apply set have higher budgets', () => {
    const live = [ub('alice', 100), ub('bob', 200)]
    const applySet = new Set(['alice', 'bob'])
    const lowering = deriveLoweringSet(applySet, live, 500)
    expect(lowering).toHaveLength(0)
  })

  it('is empty when apply set is empty', () => {
    const live = [ub('alice', 500)]
    const lowering = deriveLoweringSet(new Set(), live, 300)
    expect(lowering).toHaveLength(0)
  })

  it('ignores users in apply set that have no existing budget', () => {
    const live = [ub('alice', 500)]
    const applySet = new Set(['alice', 'newuser']) // newuser has no current budget
    const lowering = deriveLoweringSet(applySet, live, 300)
    expect(lowering).toHaveLength(1)
    expect(lowering[0].login).toBe('alice')
  })

  it('treats equal budgets as non-lowering (no-op PATCH)', () => {
    const live = [ub('alice', 300)]
    const applySet = new Set(['alice'])
    const lowering = deriveLoweringSet(applySet, live, 300)
    // Applying the same amount is a redundant PATCH but not a lowering;
    // we don't surface a confirm for it.
    expect(lowering).toHaveLength(0)
  })
})

describe('Step 4 — protection + override are independent of lowering detection', () => {
  // Sanity check: the selection layer uses (deselected, protectedLogins, protectedOverridden);
  // the lowering layer uses (applySet, liveUserBudgets, effectiveAmount).
  // They must compose correctly so that:
  //   - a protected user excluded via the banner does NOT appear in the lowering set
  //   - a protected user re-included via override DOES appear in the lowering set

  const members = [{ login: 'alice' }]
  const live = [ub('alice', 500)]
  const effectiveAmount = 300

  it('excluded protected user is absent from lowering set', () => {
    const protectedLogins = deriveProtectedLogins(live, effectiveAmount)
    const selected = deriveSelectedLogins(members, new Set(), protectedLogins, new Set())
    const lowering = deriveLoweringSet(selected, live, effectiveAmount)
    expect(selected.size).toBe(0)
    expect(lowering).toHaveLength(0)
  })

  it('overridden protected user is present in lowering set', () => {
    const protectedLogins = deriveProtectedLogins(live, effectiveAmount)
    const protectedOverridden = new Set(['alice'])
    const selected = deriveSelectedLogins(members, new Set(), protectedLogins, protectedOverridden)
    const lowering = deriveLoweringSet(selected, live, effectiveAmount)
    expect(selected.has('alice')).toBe(true)
    expect(lowering).toHaveLength(1)
    expect(lowering[0]).toEqual({ login: 'alice', from: 500, to: 300 })
  })
})
