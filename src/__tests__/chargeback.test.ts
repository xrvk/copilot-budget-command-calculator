import { describe, it, expect } from 'vitest'
import {
  deduplicateSeats,
  getUserEntitlement,
  buildUserToCostCenterMap,
  calcChargeback,
  chargebackToCsv,
  fetchUsageInBatches,
  parseUsageCsv,
  csvToChargebackInput,
  normalizeUsageCsvRow,
  type CsvUserUsage,
} from '../lib/chargeback'
import type { SharedCostCenter } from '@/hooks/use-enterprise-credentials'

describe('deduplicateSeats', () => {
  it('deduplicates users appearing in multiple orgs', () => {
    const seats = [
      { plan_type: 'business', assignee: { login: 'alice' }, pending_cancellation_date: null },
      { plan_type: 'business', assignee: { login: 'alice' }, pending_cancellation_date: null },
      { plan_type: 'business', assignee: { login: 'bob' }, pending_cancellation_date: null },
    ]
    const result = deduplicateSeats(seats)
    expect(result).toHaveLength(2)
    expect(result.find(u => u.login === 'alice')?.planType).toBe('business')
  })

  it('takes highest tier when user has both CB and CE', () => {
    const seats = [
      { plan_type: 'business', assignee: { login: 'alice' }, pending_cancellation_date: null },
      { plan_type: 'enterprise', assignee: { login: 'alice' }, pending_cancellation_date: null },
    ]
    const result = deduplicateSeats(seats)
    expect(result).toHaveLength(1)
    expect(result[0].planType).toBe('enterprise')
  })

  it('skips seats with pending cancellation', () => {
    const seats = [
      { plan_type: 'business', assignee: { login: 'alice' }, pending_cancellation_date: '2026-05-01' },
      { plan_type: 'business', assignee: { login: 'bob' }, pending_cancellation_date: null },
    ]
    const result = deduplicateSeats(seats)
    expect(result).toHaveLength(1)
    expect(result[0].login).toBe('bob')
  })

  it('handles seats with missing assignee', () => {
    const seats = [
      { plan_type: 'business', pending_cancellation_date: null },
      { plan_type: 'business', assignee: { login: 'bob' }, pending_cancellation_date: null },
    ]
    const result = deduplicateSeats(seats)
    expect(result).toHaveLength(1)
  })
})

describe('getUserEntitlement', () => {
  it('returns standard CB entitlement', () => {
    expect(getUserEntitlement('business', false)).toBe(1_900)
  })

  it('returns standard CE entitlement', () => {
    expect(getUserEntitlement('enterprise', false)).toBe(3_900)
  })

  it('returns promo CB entitlement', () => {
    expect(getUserEntitlement('business', true)).toBe(3_000)
  })

  it('returns promo CE entitlement', () => {
    expect(getUserEntitlement('enterprise', true)).toBe(7_000)
  })
})

describe('buildUserToCostCenterMap', () => {
  const costCenters: SharedCostCenter[] = [
    {
      ccId: 'cc-1', name: 'Engineering', budgetAmount: 5000,
      members: ['alice', 'bob'], userCount: 2,
      organizations: [], orgMemberLogins: ['charlie'],
      resolvedOrganizations: [], failedOrganizations: [], orgFailureReason: null,
    },
    {
      ccId: 'cc-2', name: 'Sales', budgetAmount: 3000,
      members: ['dave'], userCount: 1,
      organizations: [], orgMemberLogins: ['eve'],
      resolvedOrganizations: [], failedOrganizations: [], orgFailureReason: null,
    },
  ]

  it('maps direct users to their CC', () => {
    const map = buildUserToCostCenterMap(costCenters)
    expect(map.get('alice')).toBe('Engineering')
    expect(map.get('dave')).toBe('Sales')
  })

  it('maps org members to their CC', () => {
    const map = buildUserToCostCenterMap(costCenters)
    expect(map.get('charlie')).toBe('Engineering')
    expect(map.get('eve')).toBe('Sales')
  })

  it('direct assignment takes priority over org membership', () => {
    const ccs: SharedCostCenter[] = [
      {
        ccId: 'cc-1', name: 'Engineering', budgetAmount: 5000,
        members: ['alice'], userCount: 1,
        organizations: [], orgMemberLogins: [],
        resolvedOrganizations: [], failedOrganizations: [], orgFailureReason: null,
      },
      {
        ccId: 'cc-2', name: 'Sales', budgetAmount: 3000,
        members: [], userCount: 0,
        organizations: [], orgMemberLogins: ['alice'],
        resolvedOrganizations: [], failedOrganizations: [], orgFailureReason: null,
      },
    ]
    const map = buildUserToCostCenterMap(ccs)
    expect(map.get('alice')).toBe('Engineering')
  })

  it('returns undefined for users not in any CC', () => {
    const map = buildUserToCostCenterMap(costCenters)
    expect(map.get('unknown')).toBeUndefined()
  })
})

describe('calcChargeback', () => {
  // TJ's spreadsheet example (standard pricing):
  // User 1: entitlement=1900, actual=1800, additional=0 → $0
  // User 2: entitlement=3900 (CE), actual=4600, additional=700 → scaled
  // User 3: entitlement=1900, actual=3000, additional=1100 → scaled
  // Enterprise billed: $17 netAmount
  it('matches TJ spreadsheet example', () => {
    const users = [
      { login: 'user1', planType: 'business' as const, grossAmount: 18.00, netAmount: 0 },
      { login: 'user2', planType: 'enterprise' as const, grossAmount: 46.00, netAmount: 0 },
      { login: 'user3', planType: 'business' as const, grossAmount: 30.00, netAmount: 0 },
    ]
    const userToCc = new Map<string, string>()

    const result = calcChargeback(users, 17.00, 94.00, false, userToCc)

    // User 1: under entitlement → $0
    expect(result.users[0].additionalUsageAICs).toBe(0)
    expect(result.users[0].rawChargeDollars).toBe(0)

    // User 2: additional = 4600 - 3900 = 700 AICs
    expect(result.users[1].additionalUsageAICs).toBe(700)

    // User 3: additional = 3000 - 1900 = 1100 AICs
    expect(result.users[2].additionalUsageAICs).toBe(1100)

    // Total additional = 1800
    expect(result.totalAdditionalUsage).toBe(1800)

    // Scaled: user2 = (17/1800)*700 ≈ 6.611, user3 = (17/1800)*1100 ≈ 10.389
    expect(result.users[1].rawChargeDollars).toBeCloseTo(6.611, 2)
    expect(result.users[2].rawChargeDollars).toBeCloseTo(10.389, 2)

    // Sum of charges = enterprise net
    expect(result.totalScaledCharge).toBeCloseTo(17.00, 2)
  })

  it('handles zero metered charges', () => {
    const users = [
      { login: 'user1', planType: 'business' as const, grossAmount: 10.00, netAmount: 0 },
    ]
    const result = calcChargeback(users, 0, 10.00, false, new Map())
    expect(result.users[0].rawChargeDollars).toBe(0)
    expect(result.totalScaledCharge).toBe(0)
  })

  it('handles all users under entitlement', () => {
    const users = [
      { login: 'user1', planType: 'business' as const, grossAmount: 10.00, netAmount: 0 },
      { login: 'user2', planType: 'enterprise' as const, grossAmount: 20.00, netAmount: 0 },
    ]
    const result = calcChargeback(users, 5.00, 30.00, false, new Map())
    expect(result.totalAdditionalUsage).toBe(0)
    expect(result.totalScaledCharge).toBe(0)
  })

  it('groups users by cost center', () => {
    const users = [
      { login: 'alice', planType: 'business' as const, grossAmount: 30.00, netAmount: 0 },
      { login: 'bob', planType: 'business' as const, grossAmount: 25.00, netAmount: 0 },
      { login: 'charlie', planType: 'business' as const, grossAmount: 30.00, netAmount: 0 },
    ]
    const userToCc = new Map([['alice', 'Engineering'], ['bob', 'Engineering']])
    const result = calcChargeback(users, 10.00, 85.00, false, userToCc)

    expect(result.departments).toHaveLength(2)
    const eng = result.departments.find(d => d.costCenterName === 'Engineering')!
    const unattr = result.departments.find(d => d.costCenterName === 'Unattributed')!
    expect(eng.userCount).toBe(2)
    expect(unattr.userCount).toBe(1)
  })

  it('uses promo entitlements when isPromo is true', () => {
    const users = [
      { login: 'user1', planType: 'business' as const, grossAmount: 25.00, netAmount: 0 },
    ]
    const result = calcChargeback(users, 0, 25.00, true, new Map())
    expect(result.users[0].entitlementAICs).toBe(3000)
    expect(result.users[0].additionalUsageAICs).toBe(0)
  })

  it('applies ACD discount matching TJ spreadsheet', () => {
    const users = [
      { login: 'user1', planType: 'business' as const, grossAmount: 18.00, netAmount: 0 },
      { login: 'user2', planType: 'enterprise' as const, grossAmount: 46.00, netAmount: 0 },
      { login: 'user3', planType: 'business' as const, grossAmount: 30.00, netAmount: 0 },
    ]
    const result = calcChargeback(users, 17.00, 94.00, false, new Map(), 10)

    expect(result.acdPercent).toBe(10)
    // User 1: $0
    expect(result.users[0].discountedChargeDollars).toBe(0)
    // User 2: $6.611 × 0.9 ≈ $5.95
    expect(result.users[1].discountedChargeDollars).toBeCloseTo(5.95, 1)
    // User 3: $10.389 × 0.9 ≈ $9.35
    expect(result.users[2].discountedChargeDollars).toBeCloseTo(9.35, 1)
    // Total discounted
    expect(result.totalDiscountedCharge).toBeCloseTo(15.30, 1)
  })

  it('ACD 0% results in discounted = raw', () => {
    const users = [
      { login: 'user1', planType: 'business' as const, grossAmount: 30.00, netAmount: 0 },
    ]
    const result = calcChargeback(users, 10.00, 30.00, false, new Map(), 0)
    expect(result.users[0].discountedChargeDollars).toBe(result.users[0].rawChargeDollars)
  })

  it('exclusion ON scales CC and enterprise pools independently', () => {
    // Two users: alice in Engineering CC, bob unattributed
    // alice: 3000 AICs actual, 1900 entitlement → 1100 additional
    // bob:   2500 AICs actual, 1900 entitlement → 600 additional
    // alice's net = $5, bob's net = $3
    const users = [
      { login: 'alice', planType: 'business' as const, grossAmount: 30.00, netAmount: 5.00 },
      { login: 'bob', planType: 'business' as const, grossAmount: 25.00, netAmount: 3.00 },
    ]
    const userToCc = new Map([['alice', 'Engineering']])

    const result = calcChargeback(users, 8.00, 55.00, false, userToCc, 0, true)

    // With exclusion ON:
    // Engineering pool: alice's additional=1100, CC net=5 → alice gets $5
    // Enterprise pool: bob's additional=600, ent net=(8-5)=3 → bob gets $3
    expect(result.users.find(u => u.login === 'alice')!.rawChargeDollars).toBeCloseTo(5.00, 2)
    expect(result.users.find(u => u.login === 'bob')!.rawChargeDollars).toBeCloseTo(3.00, 2)
    expect(result.excludeCostCenterUsage).toBe(true)
  })

  it('exclusion OFF distributes from single pool', () => {
    const users = [
      { login: 'alice', planType: 'business' as const, grossAmount: 30.00, netAmount: 5.00 },
      { login: 'bob', planType: 'business' as const, grossAmount: 25.00, netAmount: 3.00 },
    ]
    const userToCc = new Map([['alice', 'Engineering']])

    const result = calcChargeback(users, 8.00, 55.00, false, userToCc, 0, false)

    // Single pool: total additional = 1100 + 600 = 1700
    // alice: (8/1700)*1100 ≈ 5.176, bob: (8/1700)*600 ≈ 2.824
    expect(result.users.find(u => u.login === 'alice')!.rawChargeDollars).toBeCloseTo(5.176, 2)
    expect(result.users.find(u => u.login === 'bob')!.rawChargeDollars).toBeCloseTo(2.824, 2)
    expect(result.totalScaledCharge).toBeCloseTo(8.00, 2)
  })

  it('exclusion ON with ACD applies discount to independent pools', () => {
    const users = [
      { login: 'alice', planType: 'business' as const, grossAmount: 30.00, netAmount: 5.00 },
      { login: 'bob', planType: 'business' as const, grossAmount: 25.00, netAmount: 3.00 },
    ]
    const userToCc = new Map([['alice', 'Engineering']])

    const result = calcChargeback(users, 8.00, 55.00, false, userToCc, 10, true)

    // alice: raw $5 × 0.9 = $4.50
    // bob: raw $3 × 0.9 = $2.70
    expect(result.users.find(u => u.login === 'alice')!.discountedChargeDollars).toBeCloseTo(4.50, 2)
    expect(result.users.find(u => u.login === 'bob')!.discountedChargeDollars).toBeCloseTo(2.70, 2)
  })
})

describe('chargebackToCsv', () => {
  it('generates valid CSV', () => {
    const result = calcChargeback(
      [{ login: 'alice', planType: 'business', grossAmount: 30.00, netAmount: 0 }],
      10.00, 30.00, false, new Map([['alice', 'Engineering']]),
    )
    const csv = chargebackToCsv(result, 4, 2026)
    const lines = csv.split('\n')
    expect(lines[0]).toContain('User,License')
    expect(lines[1]).toContain('alice,CB')
    expect(lines[1]).toContain('Engineering')
  })
})

describe('fetchUsageInBatches', () => {
  it('fetches all users with progress callbacks', async () => {
    const logins = ['a', 'b', 'c', 'd', 'e']
    const fetchFn = async () => ({ grossAmount: 10, netAmount: 5 })
    const progressCalls: Array<[number, number]> = []

    const results = await fetchUsageInBatches(
      fetchFn, logins, 2,
      (completed, total) => progressCalls.push([completed, total]),
    )

    expect(results).toHaveLength(5)
    expect(progressCalls).toEqual([[2, 5], [4, 5], [5, 5]])
  })

  it('handles empty login list', async () => {
    const results = await fetchUsageInBatches(
      async () => ({ grossAmount: 0, netAmount: 0 }), [], 10,
    )
    expect(results).toEqual([])
  })
})

// Sample CSV matching the PRU export format
const SAMPLE_CSV = `"date","username","product","sku","model","quantity","unit_type","applied_cost_per_quantity","gross_amount","discount_amount","net_amount","total_monthly_quota","organization","cost_center_name","aic_quantity","aic_gross_amount"
"2026-03-01","alice-dev","spark","spark_premium_request","Claude Opus 4.5","4","requests","0.04","0.16","0.16","0","1000","engineering","","18.734","0.18734000000000003"
"2026-03-01","alice-dev","copilot","copilot_premium_request","Claude Opus 4.6","54","requests","0.04","2.16","2.16","0","1000","engineering","","11.797550000000001","0.1179755"
"2026-03-01","bob-eng","copilot","copilot_premium_request","Claude Opus 4.6","366","requests","0.04","14.639999999999995","14.639999999999995","0","1000","acme-corp","","47.6984","0.4769840000000001"
"2026-03-01","charlie-ops","copilot","copilot_premium_request","Claude Opus 4.6","3","requests","0.04","0.12","0.12","0","1000","acme-corp","","1.297","0.012969999999999999"
"2026-03-02","dana-pm","copilot","copilot_premium_request","Claude Opus 4.6","12","requests","0.04","0.48","0.48","0","1000","design-org","design-cc","5.2341","0.052341"`

describe('parseUsageCsv', () => {
  it('parses sample CSV and aggregates by username', () => {
    const result = parseUsageCsv(SAMPLE_CSV)
    expect(result.errors).toEqual([])
    expect(result.rowCount).toBe(5)
    expect(result.users).toHaveLength(4) // alice-dev appears 2x → aggregated

    const alice = result.users.find(u => u.login === 'alice-dev')!
    expect(alice.totalAICs).toBeCloseTo(18.734 + 11.79755, 3)
    expect(alice.costCenter).toBeNull() // empty string in CSV → null
    expect(alice.organization).toBe('engineering')
    expect(alice.totalMonthlyQuota).toBe(1000)
  })

  it('extracts cost center names', () => {
    const result = parseUsageCsv(SAMPLE_CSV)
    const dana = result.users.find(u => u.login === 'dana-pm')!
    expect(dana.costCenter).toBe('design-cc')
    expect(dana.totalMonthlyQuota).toBe(1000)

    const bob = result.users.find(u => u.login === 'bob-eng')!
    expect(bob.costCenter).toBeNull() // empty in CSV
    expect(bob.organization).toBe('acme-corp')
  })

  it('computes date range', () => {
    const result = parseUsageCsv(SAMPLE_CSV)
    expect(result.dateRange).toEqual({ earliest: '2026-03-01', latest: '2026-03-02' })
  })

  it('returns error for missing required columns', () => {
    const badCsv = `"date","user","amount"\n"2026-03-01","alice","10"`
    const result = parseUsageCsv(badCsv)
    expect(result.errors.length).toBeGreaterThan(0)
    expect(result.errors[0]).toContain('username')
  })

  it('returns error for empty CSV', () => {
    const result = parseUsageCsv('')
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0]).toContain('empty')
  })

  it('handles quoted fields with commas', () => {
    const csv = `"date","username","product","sku","model","quantity","unit_type","applied_cost_per_quantity","gross_amount","discount_amount","net_amount","total_monthly_quota","organization","cost_center_name","aic_quantity","aic_gross_amount"
"2026-03-01","alice","copilot","copilot_premium_request","GPT-5","1","requests","0.04","0.04","0.04","0","1000","my-org","Engineering, US","10","0.10"`
    const result = parseUsageCsv(csv)
    expect(result.users[0].costCenter).toBe('Engineering, US')
  })

  it('drops invalid duplicate rows in the April backfill window', () => {
    const csv = `"date","username","product","sku","model","quantity","unit_type","applied_cost_per_quantity","gross_amount","discount_amount","net_amount","total_monthly_quota","organization","cost_center_name","aic_quantity","aic_gross_amount"
"2026-04-25","mona","copilot","copilot_premium_request","GPT-5","0","requests","0.04","0","0","0","300","my-org","","0","0"
"2026-04-25","mona","copilot","copilot_premium_request","GPT-5","10","requests","0.04","0.40","0","0.40","0","my-org","","100","1.00"`
    const result = parseUsageCsv(csv)
    // The quantity=0/quota=300 row is dropped; the quota=0 row is halved
    expect(result.users).toHaveLength(1)
    expect(result.users[0].totalAICs).toBe(50) // 100 * 0.5
    expect(result.users[0].grossAmount).toBe(0.5) // 1.00 * 0.5
  })

  it('halves AIC values for request rows in the April backfill window', () => {
    const csv = `"date","username","product","sku","model","quantity","unit_type","applied_cost_per_quantity","gross_amount","discount_amount","net_amount","total_monthly_quota","organization","cost_center_name","aic_quantity","aic_gross_amount"
"2026-04-30","mona","copilot","copilot_premium_request","Claude Sonnet 4.5","12","requests","0.04","0.48","0","0.48","0","my-org","","120","1.20"`
    const result = parseUsageCsv(csv)
    expect(result.users[0].totalAICs).toBe(60)
    expect(result.users[0].grossAmount).toBe(0.6)
  })

  it('leaves rows outside the April backfill window unchanged', () => {
    const csv = `"date","username","product","sku","model","quantity","unit_type","applied_cost_per_quantity","gross_amount","discount_amount","net_amount","total_monthly_quota","organization","cost_center_name","aic_quantity","aic_gross_amount"
"2026-05-01","mona","copilot","copilot_premium_request","Claude Sonnet 4.5","12","requests","0.04","0.48","0","0.48","0","my-org","","120","1.20"`
    const result = parseUsageCsv(csv)
    expect(result.users[0].totalAICs).toBe(120)
    expect(result.users[0].grossAmount).toBe(1.2)
  })

  it('leaves ai-credit rows in the April backfill window unchanged', () => {
    const csv = `"date","username","product","sku","model","quantity","unit_type","applied_cost_per_quantity","gross_amount","discount_amount","net_amount","total_monthly_quota","organization","cost_center_name","aic_quantity","aic_gross_amount"
"2026-04-30","mona","copilot","copilot_ai_credit","Claude Sonnet 4.5","120","ai-credits","0.01","1.20","0","1.20","0","my-org","","120","1.20"`
    const result = parseUsageCsv(csv)
    expect(result.users[0].totalAICs).toBe(120)
    expect(result.users[0].grossAmount).toBe(1.2)
  })
})

describe('normalizeUsageCsvRow — April 2026 backfill', () => {
  const baseRow: Record<string, string> = {
    date: '2026-04-25', username: 'mona', product: 'copilot', sku: 'copilot_premium_request',
    model: 'GPT-5', quantity: '10', unit_type: 'requests', applied_cost_per_quantity: '0.04',
    gross_amount: '0.40', discount_amount: '0', net_amount: '0.40', total_monthly_quota: '0',
    organization: 'my-org', cost_center_name: '', aic_quantity: '100', aic_gross_amount: '1.00',
  }

  it('passes through rows outside the backfill window', () => {
    const row = { ...baseRow, date: '2026-05-01' }
    expect(normalizeUsageCsvRow(row)).toBe(row)
  })

  it('passes through rows before the backfill window', () => {
    const row = { ...baseRow, date: '2026-04-23' }
    expect(normalizeUsageCsvRow(row)).toBe(row)
  })

  it('drops invalid duplicate rows (quantity=0, quota≠0)', () => {
    const row = { ...baseRow, quantity: '0', total_monthly_quota: '300', aic_quantity: '0', aic_gross_amount: '0' }
    expect(normalizeUsageCsvRow(row)).toBeNull()
  })

  it('halves AIC values for request rows with quota=0', () => {
    const result = normalizeUsageCsvRow({ ...baseRow })!
    expect(result).not.toBeNull()
    expect(result.aic_quantity).toBe('50')
    expect(result.aic_gross_amount).toBe('0.5')
    expect(result.quantity).toBe('0')
    expect(result.gross_amount).toBe('0')
    expect(result.net_amount).toBe('0')
  })

  it('leaves ai-credit rows in the window unchanged', () => {
    const row = { ...baseRow, unit_type: 'ai-credits', sku: 'copilot_ai_credit' }
    expect(normalizeUsageCsvRow(row)).toBe(row)
  })

  it('leaves non-impacted rows (quota≠0, quantity≠0) unchanged', () => {
    const row = { ...baseRow, total_monthly_quota: '300' }
    expect(normalizeUsageCsvRow(row)).toBe(row)
  })
})

describe('csvToChargebackInput', () => {
  it('converts CSV users to chargeback input format', () => {
    const csvUsers: CsvUserUsage[] = [
      { login: 'alice', totalAICs: 2500, grossAmount: 25, netAmount: 6, costCenter: 'Engineering', organization: 'my-org', totalMonthlyQuota: 300 },
      { login: 'bob', totalAICs: 1500, grossAmount: 15, netAmount: 0, costCenter: null, organization: 'my-org', totalMonthlyQuota: 1000 },
    ]
    const seatMap = new Map<string, 'business' | 'enterprise'>([
      ['alice', 'business'],
      ['bob', 'enterprise'],
    ])

    const result = csvToChargebackInput(csvUsers, seatMap)

    expect(result.users).toHaveLength(2)
    expect(result.users[0].grossAmount).toBeCloseTo(25, 2) // 2500 * 0.01
    expect(result.users[1].planType).toBe('enterprise')
    expect(result.userToCostCenter.get('alice')).toBe('Engineering')
    expect(result.userToCostCenter.has('bob')).toBe(false)
  })

  it('defaults to business plan for unknown users', () => {
    const csvUsers: CsvUserUsage[] = [
      { login: 'unknown', totalAICs: 100, grossAmount: 1, netAmount: 0, costCenter: null, organization: null, totalMonthlyQuota: 0 },
    ]
    const result = csvToChargebackInput(csvUsers, new Map())
    expect(result.users[0].planType).toBe('business')
  })
})

// ---------------------------------------------------------------------------
// calcChargeback — edge cases
// ---------------------------------------------------------------------------

describe('calcChargeback — edge cases', () => {
  const baseUsers = [
    { login: 'alice', planType: 'business' as const, grossAmount: 50, netAmount: 20 },
    { login: 'bob', planType: 'enterprise' as const, grossAmount: 80, netAmount: 35 },
  ]
  const ccMap = new Map([['alice', 'Engineering']])

  it('acdPercent = 100: all charges discounted to $0', () => {
    const result = calcChargeback(baseUsers, 55, 130, true, ccMap, 100, false)
    for (const row of result.users) {
      expect(row.discountedChargeDollars).toBe(0)
    }
    for (const dept of result.departments) {
      expect(dept.totalDiscountedCharge).toBe(0)
    }
  })

  it('acdPercent > 100: produces negative discounted charges', () => {
    const result = calcChargeback(baseUsers, 55, 130, true, ccMap, 150, false)
    const hasNegative = result.users.some(r => r.discountedChargeDollars < 0)
    expect(hasNegative).toBe(true)
  })

  it('acdPercent = 0: no discount applied', () => {
    const result = calcChargeback(baseUsers, 55, 130, true, ccMap, 0, false)
    for (const row of result.users) {
      expect(row.discountedChargeDollars).toBe(row.rawChargeDollars)
    }
  })

  it('sum of scaled user charges ≈ enterprise net (exclusion OFF)', () => {
    const users = [
      { login: 'u1', planType: 'business' as const, grossAmount: 60, netAmount: 25 },
      { login: 'u2', planType: 'business' as const, grossAmount: 45, netAmount: 18 },
      { login: 'u3', planType: 'enterprise' as const, grossAmount: 100, netAmount: 40 },
    ]
    const enterpriseNet = 83
    const result = calcChargeback(users, enterpriseNet, 205, true, new Map(), 0, false)
    const totalScaled = result.users.reduce((sum, r) => sum + r.scaledUsageDollars, 0)
    expect(totalScaled).toBeCloseTo(enterpriseNet, 0)
  })

  it('sum of scaled user charges ≈ enterprise net (exclusion ON)', () => {
    const users = [
      { login: 'u1', planType: 'business' as const, grossAmount: 60, netAmount: 25 },
      { login: 'u2', planType: 'business' as const, grossAmount: 45, netAmount: 18 },
      { login: 'u3', planType: 'enterprise' as const, grossAmount: 100, netAmount: 40 },
    ]
    const enterpriseNet = 83
    const result = calcChargeback(users, enterpriseNet, 205, true, new Map([['u3', 'Team A']]), 0, true)
    const unattributed = result.users.filter(r => r.costCenter === null)
    const ccUsers = result.users.filter(r => r.costCenter !== null)
    const unattribScaled = unattributed.reduce((s, r) => s + r.scaledUsageDollars, 0)
    const ccScaled = ccUsers.reduce((s, r) => s + r.scaledUsageDollars, 0)
    expect(unattribScaled + ccScaled).toBeCloseTo(enterpriseNet, 0)
  })

  it('zero additional usage: no charges allocated', () => {
    const users = [
      { login: 'u1', planType: 'business' as const, grossAmount: 20, netAmount: 0 },
      { login: 'u2', planType: 'business' as const, grossAmount: 15, netAmount: 0 },
    ]
    const result = calcChargeback(users, 0, 35, true, new Map(), 0, false)
    for (const row of result.users) {
      expect(row.additionalUsageAICs).toBe(0)
      expect(row.scaledUsageDollars).toBe(0)
    }
  })
})
