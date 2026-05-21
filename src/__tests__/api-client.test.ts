import { describe, it, expect, vi } from 'vitest'
import {
  ApiError,
  isCopilotBudget,
  findEnterpriseBudget,
  findUniversalULB,
  filterUserBudgets,
  fetchBudgets,
  patchBudget,
  createBudget,
  deleteBudget,
  fetchCostCenters,
  createCostCenter,
  deleteCostCenter,
  assignCostCenterResources,
  removeCostCenterResources,
  fetchOrgMembers,
  fetchCcSpend,
  type RawBudget,
  type ApiFetchFn,
} from '../lib/api'

// --- Helpers ---

function mockFetch(body: unknown, status = 200): ApiFetchFn {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  })
}

function mockFetchError(message: string, status: number): ApiFetchFn {
  return vi.fn().mockResolvedValue({
    ok: false,
    status,
    json: () => Promise.resolve({ message }),
  })
}

const COPILOT_BUNDLE: Pick<RawBudget, 'budget_type' | 'budget_product_sku'> = {
  budget_type: 'BundlePricing',
  budget_product_sku: 'premium_requests',
}

const COPILOT_BUNDLE_AI_CREDITS: Pick<RawBudget, 'budget_type' | 'budget_product_sku'> = {
  budget_type: 'BundlePricing',
  budget_product_sku: 'ai_credits',
}

const COPILOT_PRODUCT: Pick<RawBudget, 'budget_type' | 'budget_product_sku'> = {
  budget_type: 'ProductPricing',
  budget_product_sku: 'copilot',
}

const COPILOT_SKU_PRICING: Pick<RawBudget, 'budget_type' | 'budget_product_sku'> = {
  budget_type: 'SkuPricing',
  budget_product_sku: 'copilot_ai_credits',
}

function makeBudget(overrides: Partial<RawBudget> = {}): RawBudget {
  return {
    id: 'budget-1',
    budget_scope: 'enterprise',
    budget_amount: 500,
    budget_entity_name: 'acme',
    ...COPILOT_BUNDLE,
    ...overrides,
  }
}

// --- isCopilotBudget ---

describe('isCopilotBudget', () => {
  it('matches BundlePricing/premium_requests', () => {
    expect(isCopilotBudget(COPILOT_BUNDLE)).toBe(true)
  })

  it('matches BundlePricing/ai_credits', () => {
    expect(isCopilotBudget(COPILOT_BUNDLE_AI_CREDITS)).toBe(true)
  })

  it('matches ProductPricing/copilot', () => {
    expect(isCopilotBudget(COPILOT_PRODUCT)).toBe(true)
  })

  it('matches SkuPricing/copilot_ai_credits', () => {
    expect(isCopilotBudget(COPILOT_SKU_PRICING)).toBe(true)
  })

  it('rejects non-Copilot budget types', () => {
    expect(isCopilotBudget({ budget_type: 'BundlePricing', budget_product_sku: 'actions' })).toBe(false)
    expect(isCopilotBudget({ budget_type: 'ProductPricing', budget_product_sku: 'packages' })).toBe(false)
    expect(isCopilotBudget({ budget_type: 'Other', budget_product_sku: 'premium_requests' })).toBe(false)
  })
})

// --- Budget classification helpers ---

describe('findEnterpriseBudget', () => {
  it('finds enterprise-scope Copilot budget', () => {
    const budgets = [
      makeBudget({ id: 'ent-1', budget_scope: 'enterprise' }),
      makeBudget({ id: 'user-1', budget_scope: 'user' }),
    ]
    expect(findEnterpriseBudget(budgets)?.id).toBe('ent-1')
  })

  it('finds enterprise BundlePricing/ai_credits budgets', () => {
    const budgets = [
      makeBudget({
        id: 'ent-ai-1',
        budget_scope: 'enterprise',
        budget_type: 'BundlePricing',
        budget_product_sku: 'ai_credits',
      }),
    ]
    expect(findEnterpriseBudget(budgets)?.id).toBe('ent-ai-1')
  })

  it('returns undefined when no enterprise Copilot budget exists', () => {
    const budgets = [
      makeBudget({ budget_scope: 'user' }),
      makeBudget({ budget_scope: 'enterprise', budget_type: 'Other', budget_product_sku: 'actions' }),
    ]
    expect(findEnterpriseBudget(budgets)).toBeUndefined()
  })

  it('returns undefined for empty list', () => {
    expect(findEnterpriseBudget([])).toBeUndefined()
  })
})

describe('findUniversalULB', () => {
  it('finds multi_user_customer scope Copilot budget', () => {
    const budgets = [
      makeBudget({ id: 'ulb-1', budget_scope: 'multi_user_customer' }),
      makeBudget({ id: 'ent-1', budget_scope: 'enterprise' }),
    ]
    expect(findUniversalULB(budgets)?.id).toBe('ulb-1')
  })

  it('returns undefined when no ULB exists', () => {
    expect(findUniversalULB([makeBudget({ budget_scope: 'enterprise' })])).toBeUndefined()
  })
})

describe('filterUserBudgets', () => {
  it('extracts user-scope Copilot budgets with login and amount', () => {
    const budgets = [
      makeBudget({ id: 'u1', budget_scope: 'user', budget_entity_name: 'alice', budget_amount: 100 }),
      makeBudget({ id: 'u2', budget_scope: 'user', budget_entity_name: 'bob', budget_amount: 200 }),
      makeBudget({ id: 'ent', budget_scope: 'enterprise' }),
    ]
    const result = filterUserBudgets(budgets)
    expect(result).toEqual([
      { id: 'u1', login: 'alice', amount: 100 },
      { id: 'u2', login: 'bob', amount: 200 },
    ])
  })

  it('returns empty array for no user budgets', () => {
    expect(filterUserBudgets([makeBudget({ budget_scope: 'enterprise' })])).toEqual([])
  })

  it('ignores non-Copilot user budgets', () => {
    const budgets = [
      makeBudget({ budget_scope: 'user', budget_type: 'Other', budget_product_sku: 'actions' }),
    ]
    expect(filterUserBudgets(budgets)).toEqual([])
  })
})

// --- API methods ---

describe('fetchBudgets', () => {
  it('returns budgets array from response', async () => {
    const apiFetch = mockFetch({ budgets: [makeBudget()] })
    const result = await fetchBudgets(apiFetch, 'acme')
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('budget-1')
    expect(apiFetch).toHaveBeenCalledWith('/enterprises/acme/settings/billing/budgets?per_page=100&page=1')
  })

  it('returns empty array when budgets field is missing', async () => {
    const apiFetch = mockFetch({})
    const result = await fetchBudgets(apiFetch, 'acme')
    expect(result).toEqual([])
  })

  it('paginates when has_next_page is true', async () => {
    const page1Budget = makeBudget({ id: 'b1' })
    const page2Budget = makeBudget({ id: 'b2' })
    const apiFetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true, status: 200,
        json: () => Promise.resolve({ budgets: [page1Budget], has_next_page: true }),
      })
      .mockResolvedValueOnce({
        ok: true, status: 200,
        json: () => Promise.resolve({ budgets: [page2Budget], has_next_page: false }),
      })
    const result = await fetchBudgets(apiFetch, 'acme')
    expect(result).toHaveLength(2)
    expect(result[0].id).toBe('b1')
    expect(result[1].id).toBe('b2')
    expect(apiFetch).toHaveBeenCalledTimes(2)
    expect(apiFetch).toHaveBeenCalledWith('/enterprises/acme/settings/billing/budgets?per_page=100&page=1')
    expect(apiFetch).toHaveBeenCalledWith('/enterprises/acme/settings/billing/budgets?per_page=100&page=2')
  })

  it('throws ApiError on HTTP error', async () => {
    const apiFetch = mockFetchError('Forbidden', 403)
    await expect(fetchBudgets(apiFetch, 'acme')).rejects.toThrow(ApiError)
    await expect(fetchBudgets(apiFetch, 'acme')).rejects.toThrow('Forbidden')
  })
})

describe('patchBudget', () => {
  it('sends PATCH with JSON body', async () => {
    const apiFetch = mockFetch({})
    await patchBudget(apiFetch, 'acme', 'budget-1', { budget_amount: 1000 })
    expect(apiFetch).toHaveBeenCalledWith(
      '/enterprises/acme/settings/billing/budgets/budget-1',
      { method: 'PATCH', body: JSON.stringify({ budget_amount: 1000 }) },
    )
  })

  it('throws ApiError on failure', async () => {
    const apiFetch = mockFetchError('Not found', 404)
    await expect(patchBudget(apiFetch, 'acme', 'bad-id', {})).rejects.toThrow(ApiError)
  })
})

describe('createBudget', () => {
  it('returns new budget id from nested response', async () => {
    const apiFetch = mockFetch({ budget: { id: 'new-budget-1' } })
    const result = await createBudget(apiFetch, 'acme', { budget_amount: 500 })
    expect(result.id).toBe('new-budget-1')
  })

  it('returns id from flat response', async () => {
    const apiFetch = mockFetch({ id: 'flat-id' })
    const result = await createBudget(apiFetch, 'acme', {})
    expect(result.id).toBe('flat-id')
  })

  it('returns empty string when no id in response', async () => {
    const apiFetch = mockFetch({})
    const result = await createBudget(apiFetch, 'acme', {})
    expect(result.id).toBe('')
  })

  it('throws ApiError on failure', async () => {
    const apiFetch = mockFetchError('Validation failed', 422)
    await expect(createBudget(apiFetch, 'acme', {})).rejects.toThrow(ApiError)
  })
})

describe('deleteBudget', () => {
  it('succeeds on 2xx', async () => {
    const apiFetch = mockFetch({}, 204)
    await expect(deleteBudget(apiFetch, 'acme', 'budget-1')).resolves.toBeUndefined()
  })

  it('silently accepts 404 (already deleted)', async () => {
    const apiFetch = mockFetch({}, 404) as ReturnType<typeof vi.fn>
    // Override ok to be false for 404
    apiFetch.mockResolvedValue({ ok: false, status: 404, json: () => Promise.resolve({}) })
    await expect(deleteBudget(apiFetch, 'acme', 'gone')).resolves.toBeUndefined()
  })

  it('throws on non-404 errors', async () => {
    const apiFetch = mockFetchError('Server error', 500)
    await expect(deleteBudget(apiFetch, 'acme', 'x')).rejects.toThrow(ApiError)
  })
})

describe('fetchCostCenters', () => {
  it('returns active cost centers, filtering deleted', async () => {
    const apiFetch = mockFetch({
      costCenters: [
        { id: 'cc-1', name: 'Engineering', state: 'active' },
        { id: 'cc-2', name: 'Deleted', state: 'active', deleted_at: '2024-01-01' },
        { id: 'cc-3', name: 'Inactive', state: 'inactive' },
      ],
    })
    const result = await fetchCostCenters(apiFetch, 'acme')
    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('Engineering')
  })

  it('handles cost_centers key (snake_case)', async () => {
    const apiFetch = mockFetch({ cost_centers: [{ id: 'cc-1', name: 'Team A' }] })
    const result = await fetchCostCenters(apiFetch, 'acme')
    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('Team A')
  })

  it('returns empty array when no cost centers', async () => {
    const apiFetch = mockFetch({})
    const result = await fetchCostCenters(apiFetch, 'acme')
    expect(result).toEqual([])
  })

  it('throws ApiError on failure', async () => {
    const apiFetch = mockFetchError('Unauthorized', 401)
    await expect(fetchCostCenters(apiFetch, 'acme')).rejects.toThrow(ApiError)
  })
})

describe('createCostCenter', () => {
  it('returns new cost center id', async () => {
    const apiFetch = mockFetch({ id: 'cc-new' })
    const result = await createCostCenter(apiFetch, 'acme', 'New Team')
    expect(result.id).toBe('cc-new')
    expect(apiFetch).toHaveBeenCalledWith(
      '/enterprises/acme/settings/billing/cost-centers',
      { method: 'POST', body: JSON.stringify({ name: 'New Team' }) },
    )
  })
})

describe('deleteCostCenter', () => {
  it('succeeds on 2xx', async () => {
    const apiFetch = mockFetch({}, 204)
    await expect(deleteCostCenter(apiFetch, 'acme', 'cc-1')).resolves.toBeUndefined()
  })

  it('silently accepts 404', async () => {
    const apiFetch = vi.fn().mockResolvedValue({ ok: false, status: 404, json: () => Promise.resolve({}) })
    await expect(deleteCostCenter(apiFetch, 'acme', 'gone')).resolves.toBeUndefined()
  })

  it('silently accepts 405 (not allowed)', async () => {
    const apiFetch = vi.fn().mockResolvedValue({ ok: false, status: 405, json: () => Promise.resolve({}) })
    await expect(deleteCostCenter(apiFetch, 'acme', 'x')).resolves.toBeUndefined()
  })

  it('throws on other errors', async () => {
    const apiFetch = mockFetchError('Internal', 500)
    await expect(deleteCostCenter(apiFetch, 'acme', 'x')).rejects.toThrow(ApiError)
  })
})

describe('assignCostCenterResources', () => {
  it('sends POST with users array', async () => {
    const apiFetch = mockFetch({})
    await assignCostCenterResources(apiFetch, 'acme', 'cc-1', ['alice', 'bob'])
    expect(apiFetch).toHaveBeenCalledWith(
      '/enterprises/acme/settings/billing/cost-centers/cc-1/resource',
      {
        method: 'POST',
        body: JSON.stringify({ users: ['alice', 'bob'], organizations: [], repositories: [] }),
      },
    )
  })
})

describe('removeCostCenterResources', () => {
  it('sends DELETE with users array', async () => {
    const apiFetch = mockFetch({})
    await removeCostCenterResources(apiFetch, 'acme', 'cc-1', ['alice'])
    expect(apiFetch).toHaveBeenCalledWith(
      '/enterprises/acme/settings/billing/cost-centers/cc-1/resource',
      {
        method: 'DELETE',
        body: JSON.stringify({ users: ['alice'], organizations: [], repositories: [] }),
      },
    )
  })

  it('throws ApiError on failure', async () => {
    const apiFetch = mockFetchError('Forbidden', 403)
    await expect(removeCostCenterResources(apiFetch, 'acme', 'cc-1', ['alice'])).rejects.toThrow(ApiError)
  })
})

describe('fetchOrgMembers', () => {
  it('returns login strings', async () => {
    const apiFetch = mockFetch([{ login: 'alice' }, { login: 'bob' }])
    const result = await fetchOrgMembers(apiFetch, 'my-org')
    expect(result).toEqual(['alice', 'bob'])
    expect(apiFetch).toHaveBeenCalledWith('/orgs/my-org/members?per_page=100')
  })

  it('throws ApiError on failure', async () => {
    const apiFetch = mockFetchError('Not Found', 404)
    await expect(fetchOrgMembers(apiFetch, 'bad-org')).rejects.toThrow(ApiError)
  })
})

describe('fetchCcSpend', () => {
  it('sums grossAmount from usage items', async () => {
    const apiFetch = mockFetch({
      usageItems: [
        { grossAmount: 10.5 },
        { grossAmount: 20.25 },
        { grossAmount: 5.0 },
      ],
    })
    const result = await fetchCcSpend(apiFetch, 'acme', 'cc-1')
    expect(result).toBeCloseTo(35.75)
  })

  it('returns 0 for empty usage', async () => {
    const apiFetch = mockFetch({ usageItems: [] })
    expect(await fetchCcSpend(apiFetch, 'acme', 'cc-1')).toBe(0)
  })

  it('returns 0 when usageItems is missing', async () => {
    const apiFetch = mockFetch({})
    expect(await fetchCcSpend(apiFetch, 'acme', 'cc-1')).toBe(0)
  })

  it('handles items with missing grossAmount', async () => {
    const apiFetch = mockFetch({
      usageItems: [{ grossAmount: 10 }, {}, { grossAmount: 5 }],
    })
    expect(await fetchCcSpend(apiFetch, 'acme', 'cc-1')).toBe(15)
  })
})

// --- ApiError ---

describe('ApiError', () => {
  it('has name, message, and status', () => {
    const err = new ApiError('Not Found', 404)
    expect(err.name).toBe('ApiError')
    expect(err.message).toBe('Not Found')
    expect(err.status).toBe(404)
    expect(err).toBeInstanceOf(Error)
  })

  it('works without status', () => {
    const err = new ApiError('Unknown error')
    expect(err.status).toBeUndefined()
  })

  it('falls back to HTTP status when JSON body has no message', async () => {
    const apiFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 502,
      json: () => Promise.resolve({}),
    })
    await expect(fetchBudgets(apiFetch, 'acme')).rejects.toThrow('HTTP 502')
  })

  it('falls back to HTTP status when JSON parsing fails', async () => {
    const apiFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: () => Promise.reject(new Error('not json')),
    })
    await expect(fetchBudgets(apiFetch, 'acme')).rejects.toThrow('HTTP 500')
  })
})
