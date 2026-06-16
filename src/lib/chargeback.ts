// --- Chargeback calculation library ---
//
// Pure functions for computing per-user and per-department chargebacks
// using TJ's scaled usage model. No side effects; fully testable.

import type { SharedCostCenter } from '@/hooks/use-enterprise-credentials'

// --- Types ---

export interface CopilotSeatInfo {
  login: string
  planType: 'business' | 'enterprise'
}

export interface UserChargebackRow {
  login: string
  planType: 'business' | 'enterprise'
  entitlementAICs: number
  actualUsageAICs: number
  additionalUsageAICs: number
  scaledUsageDollars: number
  rawChargeDollars: number
  discountedChargeDollars: number
  costCenter: string | null
}

export interface DepartmentSummary {
  costCenterId: string | null
  costCenterName: string
  users: UserChargebackRow[]
  totalCharge: number
  totalDiscountedCharge: number
  userCount: number
}

export interface ChargebackResult {
  users: UserChargebackRow[]
  departments: DepartmentSummary[]
  enterpriseNetAmount: number
  enterpriseGrossAmount: number
  totalAdditionalUsage: number
  totalScaledCharge: number
  totalDiscountedCharge: number
  acdPercent: number
  excludeCostCenterUsage: boolean
  unattributedUsage: number
}

// --- Entitlement constants ---

// 1 AIC = $0.01
const AIC_DOLLAR_VALUE = 0.01

const STANDARD_ENTITLEMENTS = {
  business: 1_900,
  enterprise: 3_900,
} as const

const PROMO_ENTITLEMENTS = {
  business: 3_000,
  enterprise: 7_000,
} as const

// --- Pure functions ---

/** Deduplicate Copilot seats by login. If a user appears with multiple plan types,
 * the highest tier wins (enterprise > business). */
export function deduplicateSeats(
  seats: Array<{ plan_type?: string; assignee?: { login: string }; pending_cancellation_date?: string | null }>,
): CopilotSeatInfo[] {
  const byLogin = new Map<string, 'business' | 'enterprise'>()

  for (const seat of seats) {
    const login = seat.assignee?.login
    if (!login) continue
    // Skip pending cancellations
    if (seat.pending_cancellation_date) continue

    const planType = seat.plan_type === 'enterprise' ? 'enterprise' : 'business'
    const existing = byLogin.get(login)

    // Highest tier wins
    if (!existing || (planType === 'enterprise' && existing === 'business')) {
      byLogin.set(login, planType)
    }
  }

  return Array.from(byLogin.entries()).map(([login, planType]) => ({ login, planType }))
}

/** Get AIC entitlement for a license type. */
export function getUserEntitlement(planType: 'business' | 'enterprise', isPromo: boolean): number {
  return isPromo ? PROMO_ENTITLEMENTS[planType] : STANDARD_ENTITLEMENTS[planType]
}

/** Build a user→costCenterName map from shared cost centers.
 * Direct user assignment takes priority over org-level membership.
 * Each user can only be in one cost center. */
export function buildUserToCostCenterMap(
  costCenters: SharedCostCenter[],
): Map<string, string> {
  const userToCc = new Map<string, string>()

  // First pass: org-level membership (lower priority)
  for (const cc of costCenters) {
    for (const login of cc.orgMemberLogins) {
      userToCc.set(login, cc.name)
    }
  }

  // Second pass: direct user assignment (higher priority, overwrites org-level)
  for (const cc of costCenters) {
    for (const login of cc.members) {
      userToCc.set(login, cc.name)
    }
  }

  return userToCc
}

/** Core chargeback calculation.
 *
 * For each user:
 *   additionalUsage = max(0, actualUsage - entitlement)
 *
 * For users with additionalUsage > 0:
 *   scaledUsage = (netAmount / sumAdditionalUsage) × additionalUsage
 *   discountedCharge = scaledUsage × (1 - acdPercent/100)
 *
 * When excludeCostCenterUsage is ON, scaling happens in independent pools:
 *   - Enterprise pool: non-CC users only
 *   - Per-CC pool: each CC's users independently
 *
 * Users under their entitlement get $0 chargeback. */
export function calcChargeback(
  users: Array<{
    login: string
    planType: 'business' | 'enterprise'
    grossAmount: number
    netAmount: number
  }>,
  enterpriseNetAmount: number,
  enterpriseGrossAmount: number,
  isPromo: boolean,
  userToCostCenter: Map<string, string>,
  acdPercent = 0,
  excludeCostCenterUsage = false,
): ChargebackResult {
  const acdMultiplier = 1 - acdPercent / 100

  // Step 1: Calculate per-user entitlement and additional usage
  const rows: UserChargebackRow[] = users.map(u => {
    const entitlementAICs = getUserEntitlement(u.planType, isPromo)
    const actualUsageAICs = Math.round(u.grossAmount / AIC_DOLLAR_VALUE)
    const additionalUsageAICs = Math.max(0, actualUsageAICs - entitlementAICs)

    return {
      login: u.login,
      planType: u.planType,
      entitlementAICs,
      actualUsageAICs,
      additionalUsageAICs,
      scaledUsageDollars: 0,
      rawChargeDollars: 0,
      discountedChargeDollars: 0,
      costCenter: userToCostCenter.get(u.login) ?? null,
    }
  })

  if (excludeCostCenterUsage) {
    // Exclusion ON: scale each pool independently
    // Partition users into CC groups + unattributed
    const ccGroups = new Map<string | null, UserChargebackRow[]>()
    for (const row of rows) {
      const key = row.costCenter
      const list = ccGroups.get(key) ?? []
      list.push(row)
      ccGroups.set(key, list)
    }

    // For each group, compute its net amount share and scale independently
    // Non-CC users (costCenter=null) use enterprise net minus all CC net
    const ccNetAmounts = new Map<string, number>()
    let totalCcNet = 0

    // Compute each CC's net from its users' net amounts
    for (const [key, groupRows] of ccGroups.entries()) {
      if (key === null) continue
      const ccNet = groupRows.reduce((sum, r) => {
        const user = users.find(u => u.login === r.login)
        return sum + (user?.netAmount ?? 0)
      }, 0)
      ccNetAmounts.set(key, ccNet)
      totalCcNet += ccNet
    }

    // Enterprise-only net = total enterprise - sum of all CC nets
    const enterpriseOnlyNet = Math.max(0, enterpriseNetAmount - totalCcNet)

    // Scale each group independently
    for (const [key, groupRows] of ccGroups.entries()) {
      const poolNet = key === null ? enterpriseOnlyNet : (ccNetAmounts.get(key) ?? 0)
      const groupAdditional = groupRows.reduce((sum, r) => sum + r.additionalUsageAICs, 0)

      if (groupAdditional > 0 && poolNet > 0) {
        const scaleFactor = poolNet / groupAdditional
        for (const row of groupRows) {
          if (row.additionalUsageAICs > 0) {
            row.scaledUsageDollars = row.additionalUsageAICs * scaleFactor
            row.rawChargeDollars = row.scaledUsageDollars
            row.discountedChargeDollars = row.rawChargeDollars * acdMultiplier
          }
        }
      }
    }
  } else {
    // Exclusion OFF: single pool (original behavior)
    const totalAdditionalUsage = rows.reduce((sum, r) => sum + r.additionalUsageAICs, 0)

    if (totalAdditionalUsage > 0 && enterpriseNetAmount > 0) {
      const scaleFactor = enterpriseNetAmount / totalAdditionalUsage
      for (const row of rows) {
        if (row.additionalUsageAICs > 0) {
          row.scaledUsageDollars = row.additionalUsageAICs * scaleFactor
          row.rawChargeDollars = row.scaledUsageDollars
          row.discountedChargeDollars = row.rawChargeDollars * acdMultiplier
        }
      }
    }
  }

  // Step 4: Group by cost center for department summaries
  const deptMap = new Map<string, UserChargebackRow[]>()
  for (const row of rows) {
    const key = row.costCenter ?? '__unattributed__'
    const list = deptMap.get(key) ?? []
    list.push(row)
    deptMap.set(key, list)
  }

  const departments: DepartmentSummary[] = []
  for (const [key, deptUsers] of deptMap.entries()) {
    departments.push({
      costCenterId: key === '__unattributed__' ? null : key,
      costCenterName: key === '__unattributed__' ? 'Unattributed' : key,
      users: deptUsers,
      totalCharge: deptUsers.reduce((sum, u) => sum + u.rawChargeDollars, 0),
      totalDiscountedCharge: deptUsers.reduce((sum, u) => sum + u.discountedChargeDollars, 0),
      userCount: deptUsers.length,
    })
  }

  // Sort departments: named CCs first (alphabetical), unattributed last
  departments.sort((a, b) => {
    if (a.costCenterId === null) return 1
    if (b.costCenterId === null) return -1
    return a.costCenterName.localeCompare(b.costCenterName)
  })

  const totalAdditionalUsage = rows.reduce((sum, r) => sum + r.additionalUsageAICs, 0)
  const totalScaledCharge = rows.reduce((sum, r) => sum + r.rawChargeDollars, 0)
  const totalDiscountedCharge = rows.reduce((sum, r) => sum + r.discountedChargeDollars, 0)

  // Unattributed usage = enterprise total - sum of all per-user gross
  const totalUserGross = users.reduce((sum, u) => sum + u.grossAmount, 0)
  const unattributedUsage = Math.max(0, enterpriseGrossAmount - totalUserGross)

  return {
    users: rows,
    departments,
    enterpriseNetAmount,
    enterpriseGrossAmount,
    totalAdditionalUsage,
    totalScaledCharge,
    totalDiscountedCharge,
    acdPercent,
    excludeCostCenterUsage,
    unattributedUsage,
  }
}

/** Generate CSV content from chargeback results. */
export function chargebackToCsv(result: ChargebackResult, month: number, year: number): string {
  const header = [
    'User',
    'License',
    'Entitlement (AICs)',
    'Actual Usage (AICs)',
    'Additional Usage (AICs)',
    'Raw Charge ($)',
    ...(result.acdPercent > 0 ? [`Discounted Charge ($) (ACD ${result.acdPercent}%)`] : []),
    'Cost Center',
    'Month',
    'Year',
  ].join(',')

  const rows = result.users.map(u => [
    u.login,
    u.planType === 'enterprise' ? 'CE' : 'CB',
    u.entitlementAICs,
    u.actualUsageAICs,
    u.additionalUsageAICs,
    u.rawChargeDollars.toFixed(2),
    ...(result.acdPercent > 0 ? [u.discountedChargeDollars.toFixed(2)] : []),
    u.costCenter ?? 'Unattributed',
    month,
    year,
  ].join(','))

  return [header, ...rows].join('\n')
}

/** Run fetches for all users in parallel batches to avoid overwhelming the API.
 * Returns per-user usage results in the same order as the input logins.
 * Calls onProgress after each batch completes. */
export async function fetchUsageInBatches(
  fetchFn: (login: string) => Promise<{ grossAmount: number; netAmount: number }>,
  logins: string[],
  concurrency: number,
  onProgress?: (completed: number, total: number) => void,
): Promise<Array<{ login: string; grossAmount: number; netAmount: number }>> {
  const results: Array<{ login: string; grossAmount: number; netAmount: number }> = []
  let completed = 0

  for (let i = 0; i < logins.length; i += concurrency) {
    const batch = logins.slice(i, i + concurrency)
    const batchResults = await Promise.all(
      batch.map(async login => {
        const usage = await fetchFn(login)
        return { login, ...usage }
      }),
    )
    results.push(...batchResults)
    completed += batch.length
    onProgress?.(completed, logins.length)
  }

  return results
}

// --- CSV Row Normalization (April 2026 backfill) ---
//
// GitHub's billing export for April 24–30, 2026 contained duplicated rows.
// The export was not corrected server-side, so clients must normalize on
// ingestion. This mirrors the logic in github/copilot-billing-preview
// (src/pipeline/parser.ts → normalizeTokenUsageRecord).
//
// Three rules applied in order:
//   1. Rows outside the affected window pass through unchanged.
//   2. Rows with quantity=0 and a non-zero quota are phantom duplicates
//      created by the backfill. These carry zero usage but inflate row
//      counts. They are dropped (any unit_type, matching the upstream).
//   3. Request-type rows with quota=0 had their AIC values doubled by the
//      backfill. AIC fields are halved; PRU billing fields (quantity,
//      gross_amount, discount_amount, net_amount) are zeroed because the
//      duplication only affected the AIC calculation path, not PRU billing.

const BACKFILL_START = '2026-04-24'
const BACKFILL_END = '2026-04-30'

function isBackfillDate(date: string): boolean {
  const d = date.slice(0, 10)
  return d >= BACKFILL_START && d <= BACKFILL_END
}

/** Normalize a raw CSV row from the billing export.
 *  Returns the (possibly corrected) row, or null if the row should be dropped. */
export function normalizeUsageCsvRow(row: Record<string, string>): Record<string, string> | null {
  const date = row.date?.trim() ?? ''
  if (!isBackfillDate(date)) return row

  const quantity = parseFloat(row.quantity || '0') || 0
  const quota = parseFloat(row.total_monthly_quota || '0') || 0
  const unitType = row.unit_type?.trim() ?? ''

  // Invalid duplicate: zero-quantity row with a non-zero quota
  if (quantity === 0 && quota !== 0) return null

  // Request rows with quota=0 had doubled AIC values
  if (quota === 0 && unitType === 'requests') {
    const aicQty = parseFloat(row.aic_quantity || '0') || 0
    const aicGross = parseFloat(row.aic_gross_amount || '0') || 0
    return {
      ...row,
      quantity: '0',
      gross_amount: '0',
      discount_amount: '0',
      net_amount: '0',
      aic_quantity: String(aicQty * 0.5),
      aic_gross_amount: String(aicGross * 0.5),
    }
  }

  return row
}

// --- CSV Import (Alpha) ---

/** Aggregated per-user usage from a CSV import. */
export interface CsvUserUsage {
  login: string
  totalAICs: number
  grossAmount: number
  netAmount: number
  costCenter: string | null
  organization: string | null
  totalMonthlyQuota: number
}

/** Result of parsing and aggregating a usage CSV. */
export interface CsvParseResult {
  users: CsvUserUsage[]
  totalGrossAmount: number
  totalNetAmount: number
  rowCount: number
  dateRange: { earliest: string; latest: string } | null
  errors: string[]
  /** Number of rows dropped by April 2026 backfill normalization. */
  normalizedRowsDropped: number
  /** Number of rows modified (AIC values halved) by April 2026 backfill normalization. */
  normalizedRowsModified: number
}

/** Parse a raw CSV string. Handles quoted fields and newlines within quotes. */
function parseCsvRows(text: string): Array<Record<string, string>> {
  const lines = text.split('\n')
  if (lines.length < 2) return []

  // Parse header
  const headerLine = lines[0].trim()
  const headers = parseCsvLine(headerLine)

  const rows: Array<Record<string, string>> = []
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue
    const values = parseCsvLine(line)
    const row: Record<string, string> = {}
    for (let j = 0; j < headers.length; j++) {
      row[headers[j]] = values[j] ?? ''
    }
    rows.push(row)
  }
  return rows
}

/** Parse a single CSV line, handling quoted fields. */
function parseCsvLine(line: string): string[] {
  const fields: string[] = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"'
          i++ // skip escaped quote
        } else {
          inQuotes = false
        }
      } else {
        current += ch
      }
    } else if (ch === '"') {
      inQuotes = true
    } else if (ch === ',') {
      fields.push(current)
      current = ''
    } else {
      current += ch
    }
  }
  fields.push(current)
  return fields
}

/** Parse and aggregate a PRU/AIC usage CSV export into per-user totals.
 *
 * The CSV contains one row per request. This function:
 * 1. Validates required columns exist
 * 2. Aggregates aic_quantity by username
 * 3. Extracts cost_center_name per user (first non-empty value wins)
 * 4. Computes enterprise-wide totals
 */
export function parseUsageCsv(csvText: string): CsvParseResult {
  const errors: string[] = []
  const rawRows = parseCsvRows(csvText)

  if (rawRows.length === 0) {
    return { users: [], totalGrossAmount: 0, totalNetAmount: 0, rowCount: 0, dateRange: null, errors: ['CSV file is empty or has no data rows.'], normalizedRowsDropped: 0, normalizedRowsModified: 0 }
  }

  // Validate required columns
  const firstRow = rawRows[0]
  const requiredCols = ['username', 'aic_quantity']
  for (const col of requiredCols) {
    if (!(col in firstRow)) {
      errors.push(`Missing required column: "${col}". Expected columns: ${requiredCols.join(', ')}`)
    }
  }
  if (errors.length > 0) {
    return { users: [], totalGrossAmount: 0, totalNetAmount: 0, rowCount: 0, dateRange: null, errors, normalizedRowsDropped: 0, normalizedRowsModified: 0 }
  }

  // Aggregate by username
  const userMap = new Map<string, { totalAICs: number; grossAmount: number; netAmount: number; costCenter: string | null; organization: string | null; totalMonthlyQuota: number }>()
  const dates: string[] = []
  let normalizedRowsDropped = 0
  let normalizedRowsModified = 0

  for (const rawRow of rawRows) {
    const normalized = normalizeUsageCsvRow(rawRow)
    if (!normalized) {
      normalizedRowsDropped++
      continue
    }
    if (normalized !== rawRow) normalizedRowsModified++

    const username = normalized.username?.trim()
    if (!username) continue

    const aicQty = parseFloat(normalized.aic_quantity || '0') || 0
    const gross = parseFloat(normalized.aic_gross_amount || normalized.gross_amount || '0') || 0
    const net = parseFloat(normalized.net_amount || '0') || 0
    const ccName = normalized.cost_center_name?.trim() || null
    const org = normalized.organization?.trim() || null
    const quota = parseFloat(normalized.total_monthly_quota || '0') || 0

    if (normalized.date) dates.push(normalized.date)

    const existing = userMap.get(username)
    if (existing) {
      existing.totalAICs += aicQty
      existing.grossAmount += gross
      existing.netAmount += net
      // Keep first non-null cost center
      if (!existing.costCenter && ccName) existing.costCenter = ccName
      if (!existing.organization && org) existing.organization = org
      // Keep highest quota (determines plan tier)
      if (quota > existing.totalMonthlyQuota) existing.totalMonthlyQuota = quota
    } else {
      userMap.set(username, { totalAICs: aicQty, grossAmount: gross, netAmount: net, costCenter: ccName, organization: org, totalMonthlyQuota: quota })
    }
  }

  const users: CsvUserUsage[] = Array.from(userMap.entries()).map(([login, data]) => ({
    login,
    totalAICs: data.totalAICs,
    grossAmount: data.grossAmount,
    netAmount: data.netAmount,
    costCenter: data.costCenter,
    organization: data.organization,
    totalMonthlyQuota: data.totalMonthlyQuota,
  }))

  const totalGrossAmount = users.reduce((sum, u) => sum + u.grossAmount, 0)
  const totalNetAmount = users.reduce((sum, u) => sum + u.netAmount, 0)

  // Date range
  const sortedDates = dates.filter(Boolean).sort()
  const dateRange = sortedDates.length > 0
    ? { earliest: sortedDates[0], latest: sortedDates[sortedDates.length - 1] }
    : null

  return { users, totalGrossAmount, totalNetAmount, rowCount: rawRows.length, dateRange, errors, normalizedRowsDropped, normalizedRowsModified }
}

/** Convert CSV parsed data into the format expected by calcChargeback.
 * Uses aic_quantity (AICs) converted to dollar value for grossAmount,
 * and builds a cost center map from the CSV's cost_center_name field. */
export function csvToChargebackInput(
  csvUsers: CsvUserUsage[],
  seatMap: Map<string, 'business' | 'enterprise'>,
): {
  users: Array<{ login: string; planType: 'business' | 'enterprise'; grossAmount: number; netAmount: number }>
  userToCostCenter: Map<string, string>
  enterpriseGrossAmount: number
  enterpriseNetAmount: number
} {
  const AIC_VALUE = 0.01

  const users = csvUsers.map(u => ({
    login: u.login,
    planType: seatMap.get(u.login) ?? 'business' as const,
    grossAmount: u.totalAICs * AIC_VALUE,
    netAmount: u.netAmount,
  }))

  const userToCostCenter = new Map<string, string>()
  for (const u of csvUsers) {
    if (u.costCenter) userToCostCenter.set(u.login, u.costCenter)
  }

  const enterpriseGrossAmount = users.reduce((sum, u) => sum + u.grossAmount, 0)
  const enterpriseNetAmount = users.reduce((sum, u) => sum + u.netAmount, 0)

  return { users, userToCostCenter, enterpriseGrossAmount, enterpriseNetAmount }
}
