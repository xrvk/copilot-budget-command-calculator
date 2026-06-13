/**
 * Regression tests for PR #211: shared URL Budget Lock cap preservation.
 *
 * When a user shares a Tier Planner URL with Budget Lock caps (e.g.
 * `cap=1000&cccap=800`), the recipient should see those exact values.
 * Previously, auto-sync logic overwrote them. The fix checks whether
 * `budgetCap > 0` (i.e. `capFromUrl`) to skip auto-sync.
 *
 * These tests verify the URL parsing contract that the fix depends on:
 * - `readParams()` correctly extracts cap/cccap from the URL
 * - `encodeState()`/`decodeState()` round-trip preserves cap values
 * - The `capFromUrl` derivation (`budgetCap > 0`) is reliable
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { readParams, encodeState, decodeState } from '../components/BudgetCalculator/calculations'

// readParams() reads from window.location.hash, so we need to set it
function setHash(hash: string) {
  window.location.hash = hash
}

describe('URL cap preservation (PR #211 regression)', () => {
  let originalHash: string

  beforeEach(() => {
    originalHash = window.location.hash
  })

  afterEach(() => {
    window.location.hash = originalHash
  })

  // --- readParams with individual query params ---

  describe('readParams with individual params', () => {
    it('parses cap and cccap from hash query', () => {
      setHash('#tier-planner?cb=50&ce=10&cap=1000&cccap=800')
      const params = readParams()
      expect(params.budgetCap).toBe(1000)
      expect(params.ccBudgetCap).toBe(800)
    })

    it('returns budgetCap=0 when cap is absent', () => {
      setHash('#tier-planner?cb=50&ce=10')
      const params = readParams()
      expect(params.budgetCap).toBe(0)
      expect(params.ccBudgetCap).toBe(0)
    })

    it('returns budgetCap=0 for cap=0 (present in URL but treated as no cap)', () => {
      setHash('#tier-planner?cb=50&cap=0')
      const params = readParams()
      expect(params.budgetCap).toBe(0)
    })

    it('parses large cap values', () => {
      setHash('#tier-planner?cap=50000&cccap=25000')
      const params = readParams()
      expect(params.budgetCap).toBe(50000)
      expect(params.ccBudgetCap).toBe(25000)
    })

    it('handles cap without cccap', () => {
      setHash('#tier-planner?cap=5000')
      const params = readParams()
      expect(params.budgetCap).toBe(5000)
      expect(params.ccBudgetCap).toBe(0)
    })

    it('handles cccap without cap', () => {
      setHash('#tier-planner?cccap=800')
      const params = readParams()
      expect(params.budgetCap).toBe(0)
      expect(params.ccBudgetCap).toBe(800)
    })
  })

  // --- readParams with compact `s` param (encodeState) ---

  describe('readParams with compact s param', () => {
    it('decodes cap values from compact state', () => {
      const encoded = encodeState({
        cb: 50, ce: 10, ulb: 39, pu: 10, pub: 100,
        buf: 10, exc: '1', promo: '1',
        cap: 2500, cccap: 1200,
      })
      setHash(`#tier-planner?s=${encoded}`)
      const params = readParams()
      expect(params.budgetCap).toBe(2500)
      expect(params.ccBudgetCap).toBe(1200)
    })

    it('returns budgetCap=0 when compact state has no cap fields', () => {
      const encoded = encodeState({
        cb: 50, ce: 10, ulb: 39, pu: 10, pub: 100,
        buf: 10, exc: '1', promo: '1',
      })
      setHash(`#tier-planner?s=${encoded}`)
      const params = readParams()
      expect(params.budgetCap).toBe(0)
      expect(params.ccBudgetCap).toBe(0)
    })
  })

  // --- capFromUrl derivation ---

  describe('capFromUrl derivation (budgetCap > 0)', () => {
    it('cap=1000 → capFromUrl is true', () => {
      setHash('#tier-planner?cap=1000&cccap=800')
      const params = readParams()
      // This is the exact check BudgetCalculator uses:
      // const [capFromUrl] = useState(initialParams.budgetCap > 0)
      const capFromUrl = params.budgetCap > 0
      const ccCapFromUrl = params.ccBudgetCap > 0
      expect(capFromUrl).toBe(true)
      expect(ccCapFromUrl).toBe(true)
    })

    it('no cap in URL → capFromUrl is false', () => {
      setHash('#tier-planner?cb=50&ce=10')
      const params = readParams()
      const capFromUrl = params.budgetCap > 0
      const ccCapFromUrl = params.ccBudgetCap > 0
      expect(capFromUrl).toBe(false)
      expect(ccCapFromUrl).toBe(false)
    })

    it('cap=0 → capFromUrl is false (auto-sync should proceed)', () => {
      setHash('#tier-planner?cap=0&cccap=0')
      const params = readParams()
      const capFromUrl = params.budgetCap > 0
      expect(capFromUrl).toBe(false)
    })

    it('only cap set (not cccap) → only capFromUrl is true', () => {
      setHash('#tier-planner?cap=5000')
      const params = readParams()
      expect(params.budgetCap > 0).toBe(true)
      expect(params.ccBudgetCap > 0).toBe(false)
    })
  })

  // --- encodeState/decodeState round-trip with caps ---

  describe('encodeState/decodeState cap round-trip', () => {
    it('preserves both cap values through round-trip', () => {
      const state = {
        cb: 100, ce: 20, ulb: 50, pu: 5, pub: 200,
        buf: 15, exc: '1', promo: '0',
        cap: 9999, cccap: 4444,
      }
      const decoded = decodeState(encodeState(state))
      expect(decoded).not.toBeNull()
      expect(decoded!.budgetCap).toBe(9999)
      expect(decoded!.ccBudgetCap).toBe(4444)
    })

    it('preserves cap=0 through round-trip when mid-cycle forces encoding', () => {
      const state = {
        cb: 50, ce: 10, ulb: 39, pu: 10, pub: 100,
        buf: 10, exc: '1', promo: '1',
        cap: 0, cccap: 0, mid: '1', midamt: 500,
      }
      const decoded = decodeState(encodeState(state))
      expect(decoded!.budgetCap).toBe(0)
      expect(decoded!.ccBudgetCap).toBe(0)
    })

    it('cap fields survive backward compat (8-field legacy format)', () => {
      const legacy = {
        cb: 50, ce: 10, ulb: 39, pu: 10, pub: 100,
        buf: 10, exc: '1', promo: '1',
      }
      const decoded = decodeState(encodeState(legacy))
      expect(decoded!.budgetCap).toBe(0)
      expect(decoded!.ccBudgetCap).toBe(0)
    })
  })
})
