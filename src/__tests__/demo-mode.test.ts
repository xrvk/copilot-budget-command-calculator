import { describe, it, expect } from 'vitest'
import { getDemoConnectResult, createDemoFetch, DEMO_ENTERPRISE, DEMO_BASE } from '../lib/demo-data'

describe('getDemoConnectResult', () => {
  it('returns a successful result with credentials', () => {
    const result = getDemoConnectResult()
    expect(result.ok).toBe(true)
    expect(result.credentials).toBeDefined()
    expect(result.credentials!.ent).toBe(DEMO_ENTERPRISE)
    expect(result.credentials!.base).toBe(DEMO_BASE)
    expect(result.credentials!.token).toBe('demo')
  })

  it('includes an enterprise-scoped Copilot budget', () => {
    const result = getDemoConnectResult()
    const entBudget = result.budgets!.find(b => b.budget_scope === 'enterprise')
    expect(entBudget).toBeDefined()
    expect(entBudget!.budget_amount).toBeGreaterThan(0)
    expect(entBudget!.budget_type).toBe('BundlePricing')
    expect(entBudget!.budget_product_sku).toBe('premium_requests')
  })

  it('has no cost-center-scoped budgets', () => {
    const result = getDemoConnectResult('nocc')
    const ccBudgets = result.budgets!.filter(b => b.budget_scope === 'cost_center')
    expect(ccBudgets.length).toBe(0)
  })

  it('has no cost centers', () => {
    const result = getDemoConnectResult('nocc')
    expect(result.costCenters!.length).toBe(0)
  })

  it('returns independent copies (no shared references)', () => {
    const a = getDemoConnectResult()
    const b = getDemoConnectResult()
    a.budgets![0].budget_amount = 999_999
    expect(b.budgets![0].budget_amount).not.toBe(999_999)
  })
})

describe('createDemoFetch', () => {
  it('returns budgets on GET /budgets', async () => {
    const fetch = createDemoFetch()
    const res = await fetch('/enterprises/acme-corp/settings/billing/budgets?per_page=100')
    expect(res.ok).toBe(true)
    const data = await res.json()
    expect(data.budgets).toBeDefined()
    expect(data.budgets.length).toBeGreaterThanOrEqual(2)
  })

  it('returns empty cost centers on GET /cost-centers (nocc)', async () => {
    const fetch = createDemoFetch('nocc')
    const res = await fetch('/enterprises/acme-corp/settings/billing/cost-centers?per_page=100&state=active')
    expect(res.ok).toBe(true)
    const data = await res.json()
    expect(data.cost_centers).toBeDefined()
    expect(data.cost_centers.length).toBe(0)
  })

  it('patches a budget and persists the change', async () => {
    const fetch = createDemoFetch()
    const patchRes = await fetch('/enterprises/acme-corp/settings/billing/budgets/budget-ent-001', {
      method: 'PATCH',
      body: JSON.stringify({ budget_amount: 20_000 }),
    })
    expect(patchRes.ok).toBe(true)

    const listRes = await fetch('/enterprises/acme-corp/settings/billing/budgets?per_page=100')
    const data = await listRes.json()
    const patched = data.budgets.find((b: { id: string }) => b.id === 'budget-ent-001')
    expect(patched.budget_amount).toBe(20_000)
  })

  it('creates a new budget via POST', async () => {
    const fetch = createDemoFetch()
    const res = await fetch('/enterprises/acme-corp/settings/billing/budgets', {
      method: 'POST',
      body: JSON.stringify({ budget_scope: 'user', budget_amount: 50, budget_entity_name: 'test-user' }),
    })
    expect(res.status).toBe(201)
    const data = await res.json()
    expect(data.budget.id).toBeTruthy()
    expect(data.budget.budget_entity_name).toBe('test-user')
  })

  it('deletes a budget via DELETE', async () => {
    const fetch = createDemoFetch()
    const delRes = await fetch('/enterprises/acme-corp/settings/billing/budgets/budget-ulb-001', {
      method: 'DELETE',
    })
    expect(delRes.ok).toBe(true)

    const listRes = await fetch('/enterprises/acme-corp/settings/billing/budgets?per_page=100')
    const data = await listRes.json()
    const found = data.budgets.find((b: { id: string }) => b.id === 'budget-ulb-001')
    expect(found).toBeUndefined()
  })

  it('creates and deletes cost centers', async () => {
    const fetch = createDemoFetch()

    const createRes = await fetch('/enterprises/acme-corp/settings/billing/cost-centers', {
      method: 'POST',
      body: JSON.stringify({ name: 'New Team' }),
    })
    expect(createRes.status).toBe(201)
    const created = await createRes.json()
    expect(created.name).toBe('New Team')

    const delRes = await fetch(`/enterprises/acme-corp/settings/billing/cost-centers/${created.id}`, {
      method: 'DELETE',
    })
    expect(delRes.ok).toBe(true)

    const listRes = await fetch('/enterprises/acme-corp/settings/billing/cost-centers?per_page=100')
    const data = await listRes.json()
    const found = data.cost_centers.find((cc: { id: string }) => cc.id === created.id)
    expect(found).toBeUndefined()
  })

  it('returns teams on GET /teams', async () => {
    const fetch = createDemoFetch()
    const res = await fetch('/enterprises/acme-corp/teams?per_page=100')
    expect(res.ok).toBe(true)
    const data = await res.json()
    expect(Array.isArray(data)).toBe(true)
    expect(data.length).toBeGreaterThanOrEqual(1)
    expect(data[0].slug).toBeTruthy()
  })

  it('returns team members on GET /teams/:slug/memberships', async () => {
    const fetch = createDemoFetch()
    const res = await fetch('/enterprises/acme-corp/teams/engineering-core/memberships?per_page=100')
    expect(res.ok).toBe(true)
    const data = await res.json()
    expect(Array.isArray(data)).toBe(true)
    expect(data.length).toBeGreaterThanOrEqual(1)
    expect(data[0].login).toBeTruthy()
  })

  it('returns consumed licenses with pagination', async () => {
    const fetch = createDemoFetch()
    const res = await fetch('/enterprises/acme-corp/consumed-licenses?per_page=10&page=1')
    expect(res.ok).toBe(true)
    const data = await res.json()
    expect(data.total_seats_purchased).toBeGreaterThan(0)
    expect(data.total_seats_consumed).toBeGreaterThan(0)
    expect(data.users.length).toBeLessThanOrEqual(10)
  })

  it('returns copilot seats with pagination', async () => {
    const fetch = createDemoFetch()
    const res = await fetch('/enterprises/acme-corp/copilot/billing/seats?per_page=10&page=1')
    expect(res.ok).toBe(true)
    const data = await res.json()
    expect(data.total_seats).toBeGreaterThan(0)
    expect(data.seats.length).toBeLessThanOrEqual(10)
    expect(data.seats[0].plan_type).toBeTruthy()
  })

  it('maintains independent state across instances', async () => {
    const fetch1 = createDemoFetch()
    const fetch2 = createDemoFetch()

    await fetch1('/enterprises/acme-corp/settings/billing/budgets/budget-ulb-001', {
      method: 'DELETE',
    })

    const res = await fetch2('/enterprises/acme-corp/settings/billing/budgets?per_page=100')
    const data = await res.json()
    const found = data.budgets.find((b: { id: string }) => b.id === 'budget-ulb-001')
    expect(found).toBeDefined()
  })
})

describe('demo data — no cost centers scenario', () => {
  it('has zero cost centers', () => {
    const result = getDemoConnectResult('nocc')
    expect(result.costCenters!.length).toBe(0)
  })

  it('has 10 user-scope budgets at $100 each', () => {
    const result = getDemoConnectResult('nocc')
    const userBudgets = result.budgets!.filter(b => b.budget_scope === 'user')
    expect(userBudgets.length).toBe(10)
    userBudgets.forEach(b => expect(b.budget_amount).toBe(100))
  })

  it('has enterprise budget of $300 with exclude_cost_center_usage=false', () => {
    const result = getDemoConnectResult('nocc')
    const entBudget = result.budgets!.find(b => b.budget_scope === 'enterprise')!
    expect(entBudget.budget_amount).toBe(300)
    expect(entBudget.exclude_cost_center_usage).toBe(false)
  })

  it('has universal ULB of $25', () => {
    const result = getDemoConnectResult('nocc')
    const ulb = result.budgets!.find(b => b.budget_scope === 'multi_user_customer')!
    expect(ulb.budget_amount).toBe(25)
  })

  it('demo fetch returns empty cost centers', async () => {
    const fetch = createDemoFetch('nocc')
    const res = await fetch('/enterprises/acme-corp/settings/billing/cost-centers?per_page=100&state=active')
    const data = await res.json()
    expect(data.cost_centers.length).toBe(0)
  })

  it('demo fetch returns 404 for unknown CC ID', async () => {
    const fetch = createDemoFetch('nocc')
    const res = await fetch('/enterprises/acme-corp/settings/billing/cost-centers/nonexistent-cc')
    expect(res.status).toBe(404)
  })

  it('demo fetch returns 10 user-scope budgets', async () => {
    const fetch = createDemoFetch('nocc')
    const res = await fetch('/enterprises/acme-corp/settings/billing/budgets?per_page=100')
    const data = await res.json()
    const userBudgets = data.budgets.filter((b: { budget_scope: string }) => b.budget_scope === 'user')
    expect(userBudgets.length).toBe(10)
  })
})
