/**
 * Runtime schemas for GitHub Billing API responses.
 *
 * Schemas are intentionally permissive (z.looseObject so unknown fields are
 * passed through) so that GitHub adding new fields does not break us. They
 * validate the *shape we depend on* — required fields must be present and
 * well-typed.
 *
 * Validation runs at the API boundary in `api.ts`. On failure, we throw an
 * `ApiError` with a diagnostic message instead of letting an undefined field
 * crash a deeply-nested component later.
 */

import { z } from 'zod'

// --- Budgets ---

export const RawBudgetSchema = z.looseObject({
  id: z.string(),
  budget_scope: z.string(),
  budget_type: z.string(),
  budget_product_sku: z.string(),
  budget_amount: z.number(),
  budget_entity_name: z.string(),
  exclude_cost_center_usage: z.boolean().optional(),
  prevent_further_usage: z.boolean().optional(),
  budget_alerting: z
    .looseObject({
      will_alert: z.boolean(),
      alert_recipients: z.array(z.string()).optional(),
    })
    .optional(),
})

export const BudgetListResponseSchema = z.looseObject({
  budgets: z.array(RawBudgetSchema).optional(),
  has_next_page: z.boolean().optional(),
})

// --- Cost centers ---

const CostCenterResourceSchema = z.looseObject({
  type: z.string(),
  name: z.string(),
})

const RawCostCenterSchema = z.looseObject({
  id: z.string(),
  name: z.string(),
  state: z.string().optional(),
  deleted_at: z.string().optional(),
  resources: z.array(CostCenterResourceSchema).optional(),
})

export const CostCenterListResponseSchema = z.looseObject({
  costCenters: z.array(RawCostCenterSchema).optional(),
  cost_centers: z.array(RawCostCenterSchema).optional(),
  has_next_page: z.boolean().optional(),
})

// --- Org members ---

const OrgMemberSchema = z.looseObject({
  login: z.string(),
})

export const OrgMembersResponseSchema = z.array(OrgMemberSchema)

// --- Usage items (chargeback / spend) ---

const UsageItemSchema = z.looseObject({
  product: z.string().optional(),
  sku: z.string().optional(),
  model: z.string().optional(),
  unitType: z.string().optional(),
  pricePerUnit: z.number().optional(),
  grossQuantity: z.number().optional(),
  grossAmount: z.number().optional(),
  discountQuantity: z.number().optional(),
  discountAmount: z.number().optional(),
  netQuantity: z.number().optional(),
  netAmount: z.number().optional(),
})

export const UsageResponseSchema = z.looseObject({
  usageItems: z.array(UsageItemSchema).optional(),
})
