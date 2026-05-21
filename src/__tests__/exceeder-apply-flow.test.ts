/**
 * Smoke test for the "Apply individual ULBs" flow added to the Consumption Analysis section.
 *
 * This doesn't render the React component — it exercises the same primitives the apply handler
 * uses (`patchBudget`, `createBudget`, `filterUserBudgets`, `withRateLimitRetry`) so we can
 * verify the request shape, the PATCH-vs-POST decision, and partial-failure handling.
 */

import { describe, it, expect, vi } from 'vitest'
import {
  filterUserBudgets,
  patchBudget,
  createBudget,
  withRateLimitRetry,
  ApiError,
  type RawBudget,
  type ApiFetchFn,
} from '../lib/api'

function makeMockApi(handlers: Map<string, (init?: RequestInit) => { ok: boolean; status: number; body: unknown }>): ApiFetchFn {
  return vi.fn().mockImplementation(async (path: string, init?: RequestInit) => {
    const key = `${(init?.method ?? 'GET').toUpperCase()} ${path}`
    const handler = handlers.get(key)
    if (!handler) throw new Error(`Unmocked: ${key}`)
    const { ok, status, body } = handler(init)
    return { ok, status, json: () => Promise.resolve(body) } as Response
  })
}

const COPILOT_USER_BUDGET = (login: string, id: string, amount: number): RawBudget => ({
  id,
  budget_amount: amount,
  budget_scope: 'user',
  budget_type: 'BundlePricing',
  budget_product_sku: 'premium_requests',
  budget_entity_name: login,
  prevent_further_usage: true,
} as unknown as RawBudget)

describe('Apply individual ULBs flow (Consumption Analysis section)', () => {
  it('filterUserBudgets returns user-scope Copilot budgets with normalized shape', () => {
    const raw: RawBudget[] = [
      COPILOT_USER_BUDGET('alice', 'b-1', 50),
      COPILOT_USER_BUDGET('bob', 'b-2', 75),
      // Non-Copilot user budget should be filtered out
      { id: 'b-3', budget_amount: 100, budget_scope: 'user', budget_type: 'ProductPricing', budget_product_sku: 'actions', budget_entity_name: 'carol' } as unknown as RawBudget,
      // Enterprise-scope budget should be filtered out
      { id: 'b-4', budget_amount: 500, budget_scope: 'enterprise', budget_type: 'BundlePricing', budget_product_sku: 'premium_requests' } as unknown as RawBudget,
    ]
    const result = filterUserBudgets(raw)
    expect(result).toHaveLength(2)
    expect(result[0]).toMatchObject({ id: 'b-1', login: 'alice', amount: 50 })
    expect(result[1]).toMatchObject({ id: 'b-2', login: 'bob', amount: 75 })
  })

  it('PATCH path for existing user budget sends correct request', async () => {
    const handlers = new Map<string, (init?: RequestInit) => { ok: boolean; status: number; body: unknown }>([
      ['PATCH /enterprises/acme/settings/billing/budgets/b-1', (init) => {
        const body = JSON.parse(init!.body as string)
        expect(body).toEqual({ budget_amount: 250 })
        return { ok: true, status: 200, body: {} }
      }],
    ])
    const apiFetch = makeMockApi(handlers)
    await patchBudget(apiFetch, 'acme', 'b-1', { budget_amount: 250 })
    expect(apiFetch).toHaveBeenCalledTimes(1)
  })

  it('POST path for new user budget sends correct shape (matches StepIndividualBudgets pattern)', async () => {
    const handlers = new Map<string, (init?: RequestInit) => { ok: boolean; status: number; body: unknown }>([
      ['POST /enterprises/acme/settings/billing/budgets', (init) => {
        const body = JSON.parse(init!.body as string)
        // Critical: must match the exact shape StepIndividualBudgets uses
        expect(body).toMatchObject({
          budget_amount: 300,
          prevent_further_usage: true,
          budget_scope: 'user',
          budget_entity_name: 'newuser',
          user: 'newuser',
          budget_type: 'BundlePricing',
          budget_product_sku: 'premium_requests',
        })
        expect(body.budget_alerting).toEqual({ will_alert: false, alert_recipients: [] })
        return { ok: true, status: 201, body: { id: 'b-new' } }
      }],
    ])
    const apiFetch = makeMockApi(handlers)
    await createBudget(apiFetch, 'acme', {
      budget_amount: 300,
      prevent_further_usage: true,
      budget_scope: 'user',
      budget_entity_name: 'newuser',
      user: 'newuser',
      budget_type: 'BundlePricing',
      budget_product_sku: 'premium_requests',
      budget_alerting: { will_alert: false, alert_recipients: [] },
    })
    expect(apiFetch).toHaveBeenCalledTimes(1)
  })

  it('partial failure: continues with remaining users and collects failed logins', async () => {
    // Simulate the apply loop: 3 users, middle one fails with a non-429 error
    const selectedUsers = [
      { login: 'alice', totalAICs: 5000 }, // → $50 ULB → PATCH existing
      { login: 'bob', totalAICs: 8000 },   // → $80 ULB → POST new, fails
      { login: 'carol', totalAICs: 6000 }, // → $60 ULB → POST new, succeeds
    ]
    const liveUserBudgets = [{ id: 'b-1', login: 'alice', amount: 30 }]

    // For POST: track call count to fail the first POST (bob) and succeed the second (carol)
    let postCount = 0
    const apiFetch = vi.fn().mockImplementation(async (path: string, init?: RequestInit) => {
      const method = (init?.method ?? 'GET').toUpperCase()
      if (method === 'PATCH') {
        return { ok: true, status: 200, json: () => Promise.resolve({}) } as Response
      }
      if (method === 'POST' && path === '/enterprises/acme/settings/billing/budgets') {
        postCount++
        const body = JSON.parse(init!.body as string)
        if (body.user === 'bob') {
          return { ok: false, status: 500, json: () => Promise.resolve({ message: 'boom' }) } as Response
        }
        return { ok: true, status: 201, json: () => Promise.resolve({ id: `b-${postCount}` }) } as Response
      }
      throw new Error(`Unexpected: ${method} ${path}`)
    })

    // Mirror the actual apply loop from ConsumptionAnalysisPanel.handleApply
    let created = 0
    let updated = 0
    const failed: string[] = []
    for (const user of selectedUsers) {
      const amt = Math.max(1, Math.ceil(user.totalAICs / 100))
      const existing = liveUserBudgets.find(b => b.login === user.login)
      try {
        if (existing) {
          await withRateLimitRetry(() => patchBudget(apiFetch, 'acme', existing.id, { budget_amount: amt }))
          updated++
        } else {
          await withRateLimitRetry(() => createBudget(apiFetch, 'acme', {
            budget_amount: amt,
            prevent_further_usage: true,
            budget_scope: 'user',
            budget_entity_name: user.login,
            user: user.login,
            budget_type: 'BundlePricing',
            budget_product_sku: 'premium_requests',
            budget_alerting: { will_alert: false, alert_recipients: [] },
          }))
          created++
        }
      } catch (err) {
        failed.push(user.login)
        // We expect ApiError for non-429 5xx
        expect(err).toBeInstanceOf(ApiError)
      }
    }

    expect(updated).toBe(1)     // alice
    expect(created).toBe(1)     // carol
    expect(failed).toEqual(['bob'])
  })

  it('correct PATCH vs POST decision based on liveUserBudgets lookup', () => {
    // Verifies the decision logic that the handler uses
    const liveUserBudgets = [
      { id: 'b-1', login: 'alice', amount: 30 },
      { id: 'b-2', login: 'bob', amount: 50 },
    ]
    const decideAction = (login: string) => {
      const existing = liveUserBudgets.find(b => b.login === login)
      return existing ? { action: 'PATCH', id: existing.id } : { action: 'POST' }
    }
    expect(decideAction('alice')).toEqual({ action: 'PATCH', id: 'b-1' })
    expect(decideAction('bob')).toEqual({ action: 'PATCH', id: 'b-2' })
    expect(decideAction('newuser')).toEqual({ action: 'POST' })
  })

  it('suggested amount formula: ceil(totalAICs / 100 * (1 + buffer/100)), min 1', () => {
    const suggestedAmountFor = (totalAICs: number, bufferPct: number) =>
      Math.max(1, Math.ceil((totalAICs / 100) * (1 + bufferPct / 100)))

    // P100 with no buffer
    expect(suggestedAmountFor(15703, 0)).toBe(158) // ceil(157.03) = 158
    expect(suggestedAmountFor(43431, 0)).toBe(435) // ceil(434.31) = 435

    // With 15% buffer
    expect(suggestedAmountFor(15703, 15)).toBe(181) // ceil(157.03 * 1.15) = 181
    expect(suggestedAmountFor(43431, 15)).toBe(500) // ceil(434.31 * 1.15) = 500

    // Edge case: very low usage still produces min 1
    expect(suggestedAmountFor(50, 0)).toBe(1)
    expect(suggestedAmountFor(0, 0)).toBe(1)
  })
})
