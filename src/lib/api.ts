// --- Centralized API client for GitHub Billing API ---
//
// Typed wrappers around apiFetch. Each method throws ApiError on failure
// instead of silently swallowing errors. Components choose how to handle.
//
// Responses are runtime-validated against schemas in `api-schemas.ts`. This
// catches upstream contract drift (renamed fields, missing required values)
// at the boundary instead of letting an `undefined` propagate into the UI.

import { z } from 'zod'
import {
  BudgetListResponseSchema,
  CostCenterListResponseSchema,
  OrgMembersResponseSchema,
  UsageResponseSchema,
} from './api-schemas'

// --- Types ---

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

export interface RawBudget {
  id: string
  budget_scope: string
  budget_type: string
  budget_product_sku: string
  budget_amount: number
  budget_entity_name: string
  exclude_cost_center_usage?: boolean
  prevent_further_usage?: boolean
  budget_alerting?: { will_alert: boolean; alert_recipients?: string[] }
}

export interface RawCostCenter {
  id: string
  name: string
  state?: string
  deleted_at?: string
  resources?: Array<{ type: string; name: string }>
}

/** The fetch signature matching `apiFetch` from the credentials context */
export type ApiFetchFn = (path: string, init?: RequestInit) => Promise<Response>

// --- Helpers ---

/** Returns true if a cost center resource type represents an Organization.
 *  The API may return "Organization", "Org", or lowercase variants. */
export function isOrgResource(type: string): boolean {
  const t = type.toLowerCase()
  return t === 'organization' || t === 'org'
}

/** Returns true for Copilot-related budgets across legacy and current API SKUs. */
export function isCopilotBudget(b: { budget_type: string; budget_product_sku: string }): boolean {
  const type = b.budget_type.toLowerCase()
  const sku = b.budget_product_sku.toLowerCase()
  return (
    (type === 'bundlepricing' && (sku === 'premium_requests' || sku === 'ai_credits')) ||
    ((type === 'productpricing' || type === 'skupricing') &&
      (sku === 'copilot' || sku === 'copilot_ai_credits'))
  )
}

async function throwOnError(res: Response): Promise<void> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new ApiError(
      (body as { message?: string }).message || `HTTP ${res.status}`,
      res.status,
    )
  }
}

/**
 * Retry a function on 429 (rate limited) responses.
 * Waits 60 seconds before retrying (ApiError does not carry response headers,
 * so Retry-After is not available; 60s is a safe default for GitHub's primary
 * rate limit reset). Calls onWaiting so UI can show a status message.
 */
export async function withRateLimitRetry<T>(
  fn: () => Promise<T>,
  opts?: { maxRetries?: number; onWaiting?: (seconds: number) => void },
): Promise<T> {
  const maxRetries = opts?.maxRetries ?? 2
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn()
    } catch (err) {
      if (err instanceof ApiError && err.status === 429 && attempt < maxRetries) {
        const waitSeconds = 60
        opts?.onWaiting?.(waitSeconds)
        await new Promise(r => setTimeout(r, waitSeconds * 1000))
        continue
      }
      throw err
    }
  }
}

/** Validate a response body against a schema. Throws ApiError on mismatch. */
function validateResponse<T>(schema: z.ZodSchema<T>, data: unknown, context: string): T {
  const parsed = schema.safeParse(data)
  if (!parsed.success) {
    const issues = parsed.error.issues.slice(0, 3).map(i => `${i.path.join('.')}: ${i.message}`).join('; ')
    throw new ApiError(`Invalid response shape from ${context}: ${issues}`, 0)
  }
  return parsed.data
}

// --- Budget APIs ---

/**
 * Fetch all budget pages. Some GHES instances cap per_page (e.g. 10 items
 * regardless of the requested per_page), so we follow `has_next_page` until
 * all pages are consumed.
 */
export async function fetchBudgets(
  apiFetch: ApiFetchFn,
  ent: string,
): Promise<RawBudget[]> {
  const all: RawBudget[] = []
  let page = 1
  for (;;) {
    const res = await apiFetch(`/enterprises/${ent}/settings/billing/budgets?per_page=100&page=${page}`)
    await throwOnError(res)
    const data = await res.json()
    const validated = validateResponse(BudgetListResponseSchema, data, `GET /budgets (page ${page})`)
    all.push(...(validated.budgets ?? []) as RawBudget[])
    if (!validated.has_next_page) break
    page++
  }
  return all
}

export async function patchBudget(
  apiFetch: ApiFetchFn,
  ent: string,
  budgetId: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const res = await apiFetch(
    `/enterprises/${ent}/settings/billing/budgets/${budgetId}`,
    { method: 'PATCH', body: JSON.stringify(payload) },
  )
  await throwOnError(res)
}

export async function createBudget(
  apiFetch: ApiFetchFn,
  ent: string,
  payload: Record<string, unknown>,
): Promise<{ id: string }> {
  const res = await apiFetch(
    `/enterprises/${ent}/settings/billing/budgets`,
    { method: 'POST', body: JSON.stringify(payload) },
  )
  await throwOnError(res)
  const data = await res.json()
  return { id: data.budget?.id ?? data.id ?? '' }
}

export async function deleteBudget(
  apiFetch: ApiFetchFn,
  ent: string,
  budgetId: string,
): Promise<void> {
  const res = await apiFetch(
    `/enterprises/${ent}/settings/billing/budgets/${budgetId}`,
    { method: 'DELETE' },
  )
  // 404 is acceptable (already deleted)
  if (!res.ok && res.status !== 404) {
    await throwOnError(res)
  }
}

// --- Cost Center APIs ---

export async function fetchCostCenters(
  apiFetch: ApiFetchFn,
  ent: string,
): Promise<RawCostCenter[]> {
  const all: RawCostCenter[] = []
  let page = 1
  for (;;) {
    const res = await apiFetch(
      `/enterprises/${ent}/settings/billing/cost-centers?per_page=100&page=${page}&state=active`,
    )
    await throwOnError(res)
    const data = await res.json()
    const validated = validateResponse(CostCenterListResponseSchema, data, `GET /cost-centers (page ${page})`)
    const raw = validated.costCenters ?? validated.cost_centers ?? []
    all.push(...(raw as RawCostCenter[]).filter(
      cc => (!cc.state || cc.state === 'active') && !cc.deleted_at,
    ))
    if (!validated.has_next_page) break
    page++
  }
  return all
}

export async function createCostCenter(
  apiFetch: ApiFetchFn,
  ent: string,
  name: string,
): Promise<{ id: string }> {
  const res = await apiFetch(
    `/enterprises/${ent}/settings/billing/cost-centers`,
    { method: 'POST', body: JSON.stringify({ name }) },
  )
  await throwOnError(res)
  const data = await res.json()
  return { id: data.id }
}

export async function deleteCostCenter(
  apiFetch: ApiFetchFn,
  ent: string,
  ccId: string,
): Promise<void> {
  const res = await apiFetch(
    `/enterprises/${ent}/settings/billing/cost-centers/${ccId}`,
    { method: 'DELETE' },
  )
  // 404 and 405 are acceptable
  if (!res.ok && res.status !== 404 && res.status !== 405) {
    await throwOnError(res)
  }
}

export async function assignCostCenterResources(
  apiFetch: ApiFetchFn,
  ent: string,
  ccId: string,
  users: string[],
): Promise<void> {
  const res = await apiFetch(
    `/enterprises/${ent}/settings/billing/cost-centers/${ccId}/resource`,
    { method: 'POST', body: JSON.stringify({ users, organizations: [], repositories: [] }) },
  )
  await throwOnError(res)
}

export async function removeCostCenterResources(
  apiFetch: ApiFetchFn,
  ent: string,
  ccId: string,
  users: string[],
): Promise<void> {
  const res = await apiFetch(
    `/enterprises/${ent}/settings/billing/cost-centers/${ccId}/resource`,
    { method: 'DELETE', body: JSON.stringify({ users, organizations: [], repositories: [] }) },
  )
  await throwOnError(res)
}

// --- Org member APIs ---

export async function fetchOrgMembers(
  apiFetch: ApiFetchFn,
  org: string,
): Promise<string[]> {
  const res = await apiFetch(`/orgs/${org}/members?per_page=100`)
  await throwOnError(res)
  const data = await res.json()
  const validated = validateResponse(OrgMembersResponseSchema, data, `GET /orgs/${org}/members`)
  return validated.map(m => m.login)
}

/** Fetch Copilot premium request usage for a cost center (current billing month).
 * Uses grossAmount to capture total consumption value (pool + overage),
 * not just post-pool billed charges (netAmount). */
export async function fetchCcSpend(
  apiFetch: ApiFetchFn,
  ent: string,
  costCenterId: string,
): Promise<number> {
  const now = new Date()
  const params = new URLSearchParams({
    year: String(now.getFullYear()),
    month: String(now.getMonth() + 1),
    cost_center_id: costCenterId,
  })
  const res = await apiFetch(
    `/enterprises/${ent}/settings/billing/premium_request/usage?${params}`,
  )
  await throwOnError(res)
  const data = await res.json()
  const validated = validateResponse(UsageResponseSchema, data, 'GET /premium_request/usage (cc)')
  const items = validated.usageItems ?? []
  return items.reduce((sum, item) => sum + (item.grossAmount ?? 0), 0)
}

/** Fetch enterprise-wide Copilot premium request usage (current billing month, all cost centers).
 * Uses grossAmount to capture total consumption value (pool + overage). */
export async function fetchEnterpriseSpend(
  apiFetch: ApiFetchFn,
  ent: string,
): Promise<number> {
  const now = new Date()
  const params = new URLSearchParams({
    year: String(now.getFullYear()),
    month: String(now.getMonth() + 1),
  })
  const res = await apiFetch(
    `/enterprises/${ent}/settings/billing/premium_request/usage?${params}`,
  )
  await throwOnError(res)
  const data = await res.json()
  const validated = validateResponse(UsageResponseSchema, data, 'GET /premium_request/usage (enterprise)')
  const items = validated.usageItems ?? []
  return items.reduce((sum, item) => sum + (item.grossAmount ?? 0), 0)
}

// --- Chargeback APIs ---

/** Fetch premium request usage for a specific user (given billing month).
 * Returns both grossAmount (total consumption value) and netAmount (metered charges only). */
export async function fetchUserSpend(
  apiFetch: ApiFetchFn,
  ent: string,
  login: string,
  year?: number,
  month?: number,
): Promise<{ grossAmount: number; netAmount: number }> {
  const now = new Date()
  const params = new URLSearchParams({
    year: String(year ?? now.getFullYear()),
    month: String(month ?? now.getMonth() + 1),
    user: login,
  })
  const res = await apiFetch(
    `/enterprises/${ent}/settings/billing/premium_request/usage?${params}`,
  )
  await throwOnError(res)
  const data = await res.json()
  const validated = validateResponse(UsageResponseSchema, data, 'GET /premium_request/usage (user)')
  const items = validated.usageItems ?? []
  return {
    grossAmount: items.reduce((sum, item) => sum + (item.grossAmount ?? 0), 0),
    netAmount: items.reduce((sum, item) => sum + (item.netAmount ?? 0), 0),
  }
}

/** Fetch enterprise-wide premium request usage for a given billing month.
 * Returns both grossAmount and netAmount. */
export async function fetchEnterpriseBilled(
  apiFetch: ApiFetchFn,
  ent: string,
  year?: number,
  month?: number,
): Promise<{ grossAmount: number; netAmount: number }> {
  const now = new Date()
  const params = new URLSearchParams({
    year: String(year ?? now.getFullYear()),
    month: String(month ?? now.getMonth() + 1),
  })
  const res = await apiFetch(
    `/enterprises/${ent}/settings/billing/premium_request/usage?${params}`,
  )
  await throwOnError(res)
  const data = await res.json()
  const validated = validateResponse(UsageResponseSchema, data, 'GET /premium_request/usage (enterprise billed)')
  const items = validated.usageItems ?? []
  return {
    grossAmount: items.reduce((sum, item) => sum + (item.grossAmount ?? 0), 0),
    netAmount: items.reduce((sum, item) => sum + (item.netAmount ?? 0), 0),
  }
}

// --- Budget classification helpers ---

/** Find the enterprise-scope Copilot budget from a raw budget list */
export function findEnterpriseBudget(budgets: RawBudget[]): RawBudget | undefined {
  return budgets.find(b => b.budget_scope === 'enterprise' && isCopilotBudget(b))
}

/** Find the universal ULB (multi_user_customer scope) from a raw budget list */
export function findUniversalULB(budgets: RawBudget[]): RawBudget | undefined {
  return budgets.find(b => b.budget_scope === 'multi_user_customer' && isCopilotBudget(b))
}

/** Extract user-scope Copilot budgets from a raw budget list */
export function filterUserBudgets(budgets: RawBudget[]): Array<{ id: string; login: string; amount: number }> {
  return budgets
    .filter(b => b.budget_scope === 'user' && isCopilotBudget(b))
    .map(b => ({ id: b.id, login: b.budget_entity_name, amount: b.budget_amount }))
}


