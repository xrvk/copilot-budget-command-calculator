import { describe, it, expect } from 'vitest'
import {
  RawBudgetSchema,
  BudgetListResponseSchema,
  CostCenterListResponseSchema,
  OrgMembersResponseSchema,
  UsageResponseSchema,
} from '../lib/api-schemas'

describe('RawBudgetSchema', () => {
  it('accepts a minimal Copilot budget', () => {
    const data = {
      id: 'b1',
      budget_scope: 'enterprise',
      budget_type: 'BundlePricing',
      budget_product_sku: 'premium_requests',
      budget_amount: 500,
      budget_entity_name: 'acme',
    }
    expect(RawBudgetSchema.safeParse(data).success).toBe(true)
  })

  it('accepts optional alerting + flags', () => {
    const data = {
      id: 'b1',
      budget_scope: 'enterprise',
      budget_type: 'BundlePricing',
      budget_product_sku: 'premium_requests',
      budget_amount: 500,
      budget_entity_name: 'acme',
      exclude_cost_center_usage: true,
      prevent_further_usage: false,
      budget_alerting: { will_alert: true, alert_recipients: ['user@example.com'] },
    }
    expect(RawBudgetSchema.safeParse(data).success).toBe(true)
  })

  it('passes through unknown fields without error', () => {
    const data = {
      id: 'b1',
      budget_scope: 'enterprise',
      budget_type: 'BundlePricing',
      budget_product_sku: 'premium_requests',
      budget_amount: 500,
      budget_entity_name: 'acme',
      future_field_added_by_github: 'whatever',
    }
    const r = RawBudgetSchema.safeParse(data)
    expect(r.success).toBe(true)
    if (r.success) {
      expect((r.data as { future_field_added_by_github?: string }).future_field_added_by_github).toBe('whatever')
    }
  })

  it('rejects when a required field is missing', () => {
    const data = {
      id: 'b1',
      budget_scope: 'enterprise',
      // missing budget_type
      budget_product_sku: 'premium_requests',
      budget_amount: 500,
      budget_entity_name: 'acme',
    }
    expect(RawBudgetSchema.safeParse(data).success).toBe(false)
  })

  it('rejects when budget_amount is not a number', () => {
    const data = {
      id: 'b1',
      budget_scope: 'enterprise',
      budget_type: 'BundlePricing',
      budget_product_sku: 'premium_requests',
      budget_amount: '500', // string instead of number
      budget_entity_name: 'acme',
    }
    expect(RawBudgetSchema.safeParse(data).success).toBe(false)
  })
})

describe('BudgetListResponseSchema', () => {
  it('accepts an empty body (budgets undefined)', () => {
    expect(BudgetListResponseSchema.safeParse({}).success).toBe(true)
  })

  it('accepts an empty array', () => {
    expect(BudgetListResponseSchema.safeParse({ budgets: [] }).success).toBe(true)
  })
})

describe('CostCenterListResponseSchema', () => {
  it('accepts both camelCase and snake_case keys', () => {
    expect(CostCenterListResponseSchema.safeParse({ costCenters: [{ id: 'cc1', name: 'A' }] }).success).toBe(true)
    expect(CostCenterListResponseSchema.safeParse({ cost_centers: [{ id: 'cc1', name: 'A' }] }).success).toBe(true)
  })

  it('accepts cost centers with resources', () => {
    const data = {
      costCenters: [
        { id: 'cc1', name: 'Eng', resources: [{ type: 'User', name: 'alice' }] },
      ],
    }
    expect(CostCenterListResponseSchema.safeParse(data).success).toBe(true)
  })
})

describe('OrgMembersResponseSchema', () => {
  it('accepts an array of objects with login', () => {
    const r = OrgMembersResponseSchema.safeParse([{ login: 'a' }, { login: 'b', extra: 1 }])
    expect(r.success).toBe(true)
  })

  it('rejects a non-array body', () => {
    expect(OrgMembersResponseSchema.safeParse({ items: [] }).success).toBe(false)
  })
})

describe('UsageResponseSchema', () => {
  it('accepts a body with no usageItems', () => {
    expect(UsageResponseSchema.safeParse({}).success).toBe(true)
  })

  it('accepts items with optional numeric fields', () => {
    const data = {
      usageItems: [
        { product: 'copilot', grossAmount: 12.5, netAmount: 0 },
        { product: 'copilot' },
      ],
    }
    expect(UsageResponseSchema.safeParse(data).success).toBe(true)
  })
})
