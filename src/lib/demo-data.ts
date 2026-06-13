import type { ConnectResult } from '@/hooks/use-enterprise-credentials'

// --- Demo variants ---
export type DemoVariant = 'cc' | 'nocc'

// --- Demo enterprise identity ---
export const DEMO_ENTERPRISE = 'acme-corp'
const DEMO_ENTERPRISE_NOCC = 'acme-inc'
export const DEMO_BASE = 'https://api.github.com'

// --- Demo sample inputs for API Tools tab ---
export const DEMO_API_TOOLS = {
  usernames: 'ce-user-001, ce-user-002, ce-user-003',
  userBudgetAmount: 100,
  teamSlug: 'engineering-core',
  ccName: 'Engineering',
} as const

// --- Demo seat counts ---
// 150 GHEC purchased, 135 consumed → 15 free GHEC slots for CB→CE upgrades
// 130 CB + 40 CE = 170 Copilot seats
// Entitlement AICs: 130×3K + 40×7K = 670K → $6,700 PAYG-equivalent
// Enterprise budget $10K → optimizer shows meaningful upgrade/savings path
const GHEC_PURCHASED = 150
const GHEC_CONSUMED = 135
const CB_SEATS = 130
const CE_SEATS = 40

// ========================================
// Variant: CC (with cost centers)
// ========================================

// Engineering: 60 users (55 universal ULB + 5 with individual ULBs at $100)
// Data Science & Infra: 10 users (2 universal ULB + 8 heavy with individual ULBs at $1,500)
// Sales Enablement: 8 users, NO budget set → flagged as uncapped with exclusion ON
// Remaining users are unassigned (not in any CC)
const DEMO_CC_ENG_MEMBERS = [
  ...Array.from({ length: 55 }, (_, i) => `cb-user-${String(i + 1).padStart(3, '0')}`),
  ...Array.from({ length: 5 }, (_, i) => `ce-user-${String(i + 1).padStart(3, '0')}`),
]
const DEMO_CC_DS_MEMBERS = [
  'cb-user-056', 'cb-user-057',
  ...Array.from({ length: 8 }, (_, i) => `ce-user-${String(i + 6).padStart(3, '0')}`),
]
const DEMO_CC_SALES_MEMBERS = Array.from({ length: 8 }, (_, i) => `cb-user-${String(i + 58).padStart(3, '0')}`)

const CC_COST_CENTERS = [
  {
    id: 'cc-eng-001',
    name: 'Engineering',
    state: 'active',
    resources: DEMO_CC_ENG_MEMBERS.map(name => ({ type: 'User' as const, name })),
  },
  {
    id: 'cc-infra-002',
    name: 'Data Science & Infra',
    state: 'active',
    resources: [
      ...DEMO_CC_DS_MEMBERS.map(name => ({ type: 'User' as const, name })),
      { type: 'Organization' as const, name: 'acme-data-org' },
    ],
  },
  {
    id: 'cc-sales-003',
    name: 'Sales Enablement',
    state: 'active',
    resources: [
      ...DEMO_CC_SALES_MEMBERS.map(name => ({ type: 'User' as const, name })),
      { type: 'Organization' as const, name: 'acme-sales-org' },
    ],
  },
]

const CC_BUDGETS: NonNullable<ConnectResult['budgets']> = [
  {
    id: 'budget-ent-001',
    budget_scope: 'enterprise',
    budget_type: 'BundlePricing',
    budget_product_sku: 'premium_requests',
    budget_amount: 2_500,
    budget_entity_name: 'acme-corp',
    exclude_cost_center_usage: true,
    prevent_further_usage: true,
    budget_alerting: { will_alert: true },
  },
  {
    id: 'budget-ulb-001',
    budget_scope: 'multi_user_customer',
    budget_type: 'BundlePricing',
    budget_product_sku: 'premium_requests',
    budget_amount: 39,
    budget_entity_name: 'acme-corp',
  },
  {
    id: 'budget-cc-001',
    budget_scope: 'cost_center',
    budget_type: 'BundlePricing',
    budget_product_sku: 'premium_requests',
    budget_amount: 500,
    budget_entity_name: 'Engineering',
  },
  {
    id: 'budget-cc-002',
    budget_scope: 'cost_center',
    budget_type: 'BundlePricing',
    budget_product_sku: 'premium_requests',
    budget_amount: 400,
    budget_entity_name: 'Data Science & Infra',
  },
  // Individual ULBs — Engineering power users ($100 each)
  ...Array.from({ length: 5 }, (_, i) => ({
    id: `budget-user-eng-${i + 1}`,
    budget_scope: 'user' as const,
    budget_type: 'BundlePricing' as const,
    budget_product_sku: 'premium_requests' as const,
    budget_amount: 100,
    budget_entity_name: `ce-user-${String(i + 1).padStart(3, '0')}`,
  })),
  // Individual ULBs — Data Science heavy users ($1,500 each, AI agent operators)
  ...Array.from({ length: 8 }, (_, i) => ({
    id: `budget-user-ds-${i + 1}`,
    budget_scope: 'user' as const,
    budget_type: 'BundlePricing' as const,
    budget_product_sku: 'premium_requests' as const,
    budget_amount: 1500,
    budget_entity_name: `ce-user-${String(i + 6).padStart(3, '0')}`,
  })),
]

// ========================================
// Variant: No CC (flat enterprise billing)
// Customer with tight budget: $300 enterprise, $25 ULB, individual ULBs at $100
// ========================================

const NOCC_COST_CENTERS: typeof CC_COST_CENTERS = []

const NOCC_BUDGETS: NonNullable<ConnectResult['budgets']> = [
  {
    id: 'budget-ent-001',
    budget_scope: 'enterprise',
    budget_type: 'BundlePricing',
    budget_product_sku: 'premium_requests',
    budget_amount: 300,
    budget_entity_name: DEMO_ENTERPRISE_NOCC,
    exclude_cost_center_usage: false,
    prevent_further_usage: true,
    budget_alerting: { will_alert: true },
  },
  {
    id: 'budget-ulb-001',
    budget_scope: 'multi_user_customer',
    budget_type: 'BundlePricing',
    budget_product_sku: 'premium_requests',
    budget_amount: 25,
    budget_entity_name: DEMO_ENTERPRISE_NOCC,
  },
  // Individual ULBs — power users at $100 each (no cost center, just user-scope)
  ...Array.from({ length: 10 }, (_, i) => ({
    id: `budget-user-nocc-${i + 1}`,
    budget_scope: 'user' as const,
    budget_type: 'BundlePricing' as const,
    budget_product_sku: 'premium_requests' as const,
    budget_amount: 100,
    budget_entity_name: `ce-user-${String(i + 1).padStart(3, '0')}`,
  })),
]

// --- Variant selector ---
function getVariantData(variant: DemoVariant) {
  return variant === 'cc'
    ? { budgets: CC_BUDGETS, costCenters: CC_COST_CENTERS }
    : { budgets: NOCC_BUDGETS, costCenters: NOCC_COST_CENTERS }
}

// --- Demo teams (for Tier Planner team picker) ---
const DEMO_TEAMS = [
  { id: 1, name: 'Engineering Core', slug: 'engineering-core', description: 'Core backend and services team', members_url: '', html_url: '' },
  { id: 2, name: 'ML Platform', slug: 'ml-platform', description: 'Machine learning and AI infrastructure', members_url: '', html_url: '' },
  { id: 3, name: 'Frontend', slug: 'frontend', description: 'Frontend and UI development', members_url: '', html_url: '' },
  { id: 4, name: 'DevOps', slug: 'devops', description: 'Infrastructure and deployment', members_url: '', html_url: '' },
  { id: 5, name: 'Security', slug: 'security', description: 'Application and infrastructure security', members_url: '', html_url: '' },
]

function member(login: string, id: number) {
  return { login, id, avatar_url: '', html_url: '' }
}

const DEMO_MEMBERS: Record<string, Array<{ login: string; id: number; avatar_url: string; html_url: string }>> = {
  'engineering-core': [
    member('alice-dev', 1001), member('bob-eng', 1002), member('charlie-code', 1003),
    member('dana-sys', 1004), member('eli-arch', 1005), member('fiona-dev', 1006),
    member('george-api', 1007), member('helen-ops', 1008), member('ivan-test', 1009),
    member('julia-sre', 1010), member('kevin-db', 1011), member('lisa-net', 1012),
    member('mike-cloud', 1013), member('nina-perf', 1014), member('oscar-build', 1015),
  ],
  'ml-platform': [
    member('alice-dev', 1001), member('dana-sys', 1004),
    member('pat-ml', 1016), member('quinn-data', 1017), member('rachel-ai', 1018),
    member('sam-nlp', 1019), member('tina-vision', 1020), member('uma-infra', 1021),
  ],
  'frontend': [
    member('charlie-code', 1003), member('fiona-dev', 1006),
    member('vic-ui', 1022), member('wendy-css', 1023), member('xander-react', 1024),
    member('yara-design', 1025), member('zach-a11y', 1026), member('amy-ux', 1027),
    member('ben-motion', 1028), member('cara-web', 1029), member('derek-perf', 1030),
    member('emma-test', 1031),
  ],
  'devops': [
    member('helen-ops', 1008), member('ivan-test', 1009), member('julia-sre', 1010),
    member('mike-cloud', 1013), member('uma-infra', 1021),
  ],
  'security': [
    member('eli-arch', 1005), member('nina-perf', 1014),
    member('frank-sec', 1032), member('grace-audit', 1033),
  ],
}

// --- Seat & license generation (for Promo Optimizer) ---
// Generate numbered users for Copilot seats and consumed licenses.
// Named team members above are a subset used for the team picker UI.

function makeLogin(prefix: string, n: number) {
  return `${prefix}-${String(n).padStart(3, '0')}`
}

function generateDemoConsumedLicenses() {
  // 135 GHEC users: 40 CE holders + 85 CB holders + 10 non-Copilot members
  const users: Array<{ github_com_login: string; github_com_name: string; license_type: string; github_com_user: boolean }> = []
  for (let i = 1; i <= CE_SEATS; i++) {
    users.push({ github_com_login: makeLogin('ce-user', i), github_com_name: `CE User ${i}`, license_type: 'enterprise', github_com_user: true })
  }
  const cbGhecCount = GHEC_CONSUMED - CE_SEATS - 10
  for (let i = 1; i <= cbGhecCount; i++) {
    users.push({ github_com_login: makeLogin('cb-user', i), github_com_name: `CB User ${i}`, license_type: 'enterprise', github_com_user: true })
  }
  for (let i = 1; i <= 10; i++) {
    users.push({ github_com_login: makeLogin('member', i), github_com_name: `Member ${i}`, license_type: 'enterprise', github_com_user: true })
  }
  return users
}

function generateDemoCopilotSeats() {
  const seats: Array<{ plan_type: string; assignee: { login: string }; pending_cancellation_date: null }> = []
  for (let i = 1; i <= CE_SEATS; i++) {
    seats.push({ plan_type: 'enterprise', assignee: { login: makeLogin('ce-user', i) }, pending_cancellation_date: null })
  }
  // 85 CB users with GHEC + 45 CB users on org-level plans
  const cbGhecCount = GHEC_CONSUMED - CE_SEATS - 10
  for (let i = 1; i <= cbGhecCount; i++) {
    seats.push({ plan_type: 'business', assignee: { login: makeLogin('cb-user', i) }, pending_cancellation_date: null })
  }
  const cbOrgCount = CB_SEATS - cbGhecCount
  for (let i = 1; i <= cbOrgCount; i++) {
    seats.push({ plan_type: 'business', assignee: { login: makeLogin('cb-ext', i) }, pending_cancellation_date: null })
  }
  return seats
}

// --- Mock response helper ---
function jsonResponse(data: unknown, status = 200): Response {
  if (status === 204) return new Response(null, { status })
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function delay(ms = 300): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/** Extract per_page and page from a URL query string for paginated mock responses. */
function parsePagination(path: string): { perPage: number; page: number } {
  const qs = path.split('?')[1] ?? ''
  const params = new URLSearchParams(qs)
  return {
    perPage: Math.max(1, parseInt(params.get('per_page') ?? '100', 10)),
    page: Math.max(1, parseInt(params.get('page') ?? '1', 10)),
  }
}

/** Return a slice of items for the requested page. */
function paginate<T>(items: T[], perPage: number, page: number): T[] {
  const start = (page - 1) * perPage
  return items.slice(start, start + perPage)
}

let nextCcId = 100
let nextBudgetId = 100

/**
 * Creates a mock apiFetch that handles all endpoints used by the app.
 * Maintains mutable state so edits, creates, and deletes persist within the session.
 */
export function createDemoFetch(variant: DemoVariant = 'cc') {
  const { budgets: varBudgets, costCenters: varCostCenters } = getVariantData(variant)
  const budgets = varBudgets.map(b => ({ ...b }))
  const costCenters = varCostCenters.map(cc => ({ ...cc }))

  return async (path: string, init?: RequestInit): Promise<Response> => {
    await delay()
    const method = (init?.method ?? 'GET').toUpperCase()
    const body = init?.body ? JSON.parse(init.body as string) : {}

    // --- Budgets ---
    if (method === 'GET' && /\/budgets(\?|$)/.test(path)) {
      return jsonResponse({ budgets })
    }
    if (method === 'PATCH' && path.includes('/budgets/')) {
      const id = path.split('/budgets/')[1].split('?')[0]
      const idx = budgets.findIndex(b => b.id === id)
      if (idx >= 0) {
        Object.assign(budgets[idx], body)
        return jsonResponse({ budget: budgets[idx] })
      }
      return jsonResponse({ message: 'Not found' }, 404)
    }
    if (method === 'POST' && /\/budgets$/.test(path)) {
      const newBudget = { id: `budget-demo-${nextBudgetId++}`, ...body }
      budgets.push(newBudget)
      return jsonResponse({ budget: newBudget }, 201)
    }
    if (method === 'DELETE' && path.includes('/budgets/')) {
      const id = path.split('/budgets/')[1].split('?')[0]
      const idx = budgets.findIndex(b => b.id === id)
      if (idx >= 0) budgets.splice(idx, 1)
      return jsonResponse({}, 204)
    }

    // --- Cost centers ---
    if (method === 'GET' && /\/cost-centers(\?|$)/.test(path)) {
      return jsonResponse({ cost_centers: costCenters })
    }
    if (method === 'GET' && /\/cost-centers\/[^/]+$/.test(path) && !path.includes('/resource')) {
      const id = path.split('/cost-centers/')[1].split('?')[0]
      const cc = costCenters.find(c => c.id === id)
      if (cc) return jsonResponse(cc)
      return jsonResponse({ message: 'Not found' }, 404)
    }
    if (method === 'POST' && /\/cost-centers$/.test(path)) {
      const newCc = { id: `cc-demo-${nextCcId++}`, name: body.name, state: 'active', resources: [] as Array<{ type: 'User'; name: string }> }
      costCenters.push(newCc)
      return jsonResponse(newCc, 201)
    }
    if (method === 'DELETE' && /\/cost-centers\/[^/]+$/.test(path)) {
      const id = path.split('/cost-centers/')[1].split('?')[0]
      const idx = costCenters.findIndex(cc => cc.id === id)
      if (idx >= 0) costCenters.splice(idx, 1)
      return jsonResponse({}, 204)
    }
    if (method === 'POST' && path.includes('/resource')) {
      return jsonResponse({ ok: true }, 200)
    }

    // --- Consumed licenses (Promo Optimizer) ---
    if (method === 'GET' && path.includes('/consumed-licenses')) {
      const allUsers = generateDemoConsumedLicenses()
      const { perPage, page } = parsePagination(path)
      return jsonResponse({
        total_seats_purchased: GHEC_PURCHASED,
        total_seats_consumed: GHEC_CONSUMED,
        users: paginate(allUsers, perPage, page),
      })
    }

    // --- Copilot seats (Promo Optimizer) ---
    if (method === 'GET' && path.includes('/copilot/billing/seats')) {
      const allSeats = generateDemoCopilotSeats()
      const { perPage, page } = parsePagination(path)
      return jsonResponse({ total_seats: allSeats.length, seats: paginate(allSeats, perPage, page) })
    }

    // --- Enterprise teams ---
    if (method === 'GET' && /\/teams(\?|$)/.test(path) && !path.includes('/memberships')) {
      return jsonResponse(DEMO_TEAMS)
    }

    // --- Team memberships ---
    if (method === 'GET' && path.includes('/memberships')) {
      const teamSlug = path.match(/\/teams\/([^/]+)\//)?.[1] ?? ''
      return jsonResponse(DEMO_MEMBERS[teamSlug] ?? [])
    }

    // --- Add/remove members (team membership mutations) ---
    if (method === 'POST' && path.includes('/memberships/')) {
      return jsonResponse({ ok: true })
    }

    // --- Premium request usage (for billing cycle adjustment + chargeback) ---
    if (method === 'GET' && path.includes('/premium_request/usage')) {
      const qs = path.split('?')[1] ?? ''
      const params = new URLSearchParams(qs)
      const userFilter = params.get('user')

      if (userFilter) {
        // Per-user usage for chargeback: simulate realistic consumption
        const allSeats = generateDemoCopilotSeats()
        const seat = allSeats.find(s => s.assignee.login === userFilter)
        if (!seat) return jsonResponse({ usageItems: [] })

        const isCE = seat.plan_type === 'enterprise'
        // Simulate varied usage: ~60-140% of entitlement
        // Use a deterministic hash of the login for consistency across calls
        const hash = userFilter.split('').reduce((h, c) => ((h << 5) - h + c.charCodeAt(0)) | 0, 0)
        const utilizationRate = 0.6 + (Math.abs(hash) % 80) / 100 // 0.60 - 1.40
        const entitlement = isCE ? 7000 : 3000 // promo values for demo
        const aicsUsed = Math.round(entitlement * utilizationRate)
        const grossAmount = aicsUsed * 0.01
        const netAmount = Math.max(0, (aicsUsed - entitlement) * 0.01)

        return jsonResponse({
          usageItems: aicsUsed > 0 ? [{
            product: 'Copilot',
            sku: 'Copilot Premium Request',
            grossQuantity: aicsUsed,
            grossAmount,
            netQuantity: Math.max(0, aicsUsed - entitlement),
            netAmount,
          }] : [],
        })
      }

      // Enterprise-wide usage (no user filter)
      const now = new Date()
      const dayOfMonth = now.getDate()
      const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
      const proportionElapsed = dayOfMonth / daysInMonth
      const demoReservoirValue = (CB_SEATS * 3000 + CE_SEATS * 7000) * 0.01
      const simulated = Math.round(demoReservoirValue * proportionElapsed * 0.85 * 100) / 100
      // Simulate some net charges (15% of users go over entitlement)
      const netSimulated = Math.round(simulated * 0.08 * 100) / 100
      return jsonResponse({ usageItems: [{ grossAmount: simulated, netAmount: netSimulated }] })
    }

    // --- Org members (for resolving Organization-type CC resources) ---
    if (method === 'GET' && /\/orgs\/[^/]+\/members/.test(path)) {
      const orgSlug = path.match(/\/orgs\/([^/]+)\//)?.[1] ?? ''
      const orgMembers: Record<string, Array<{ login: string }>> = {
        'acme-sales-org': [
          { login: 'cb-user-066' }, { login: 'cb-user-067' }, { login: 'cb-user-068' },
          { login: 'cb-user-069' }, { login: 'cb-user-070' },
        ],
        'acme-data-org': [
          { login: 'ds-analyst-001' }, { login: 'ds-analyst-002' }, { login: 'ds-engineer-001' },
          { login: 'ml-researcher-001' }, { login: 'data-lead-001' }, { login: 'aiops-eng-001' },
        ],
      }
      return jsonResponse(orgMembers[orgSlug] ?? [])
    }

    // Fallback
    return jsonResponse({})
  }
}

/** Build a ConnectResult from the demo data (used for initial connect). */
export function getDemoConnectResult(variant: DemoVariant = 'cc'): ConnectResult {
  const { budgets, costCenters } = getVariantData(variant)
  const ent = variant === 'cc' ? DEMO_ENTERPRISE : DEMO_ENTERPRISE_NOCC
  return {
    ok: true,
    credentials: { base: DEMO_BASE, ent, token: 'demo' },
    budgets: budgets.map(b => ({ ...b })),
    costCenters: costCenters.map(cc => ({ ...cc })),
  }
}

// --- Demo CSV usage data ---
// Generates a plausible consumption distribution for demo purposes.
// CB and CE users have independent distributions with per-user jitter to keep
// the curve noisy.

import type { CsvParseResult, CsvUserUsage } from './chargeback'

/** Simple seeded PRNG (mulberry32) for deterministic demo data */
function seededRandom(seed: number): () => number {
  let s = seed | 0
  return () => {
    s = (s + 0x6d2b79f5) | 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function generateDemoCsvUsageData(variant: DemoVariant = 'cc'): CsvParseResult {
  const rand = seededRandom(42)
  const users: CsvUserUsage[] = []
  const totalUsers = CB_SEATS + CE_SEATS // 170

  // Build cost center assignments from variant data
  const costCenterAssignments: Record<string, string> = {}
  if (variant === 'cc') {
    for (const m of DEMO_CC_ENG_MEMBERS) costCenterAssignments[m] = 'Engineering'
    for (const m of DEMO_CC_DS_MEMBERS) costCenterAssignments[m] = 'Data Science & Infra'
    for (const m of DEMO_CC_SALES_MEMBERS) costCenterAssignments[m] = 'Sales Enablement'
  }

  for (let i = 0; i < totalUsers; i++) {
    const isCe = i < CE_SEATS
    const login = isCe ? makeLogin('ce-user', i + 1) : makeLogin('cb-user', i - CE_SEATS + 1)
    const quota = isCe ? 1000 : 300

    // Generate a plausible but noisy consumption distribution.
    // Intentionally irregular bucket boundaries and per-user jitter.
    const r = rand()
    let aics: number
    if (isCe) {
      if (r < 0.13) {
        aics = Math.round(30 + rand() * 420)
      } else if (r < 0.27) {
        aics = Math.round(380 + rand() * 2900)
      } else if (r < 0.48) {
        aics = Math.round(2700 + rand() * 3500)
      } else if (r < 0.73) {
        aics = Math.round(5800 + rand() * 2200)             // mid-power (5,800–8,000)
      } else if (r < 0.88) {
        aics = Math.round(7000 + rand() * 2000)             // power (7,000–9,000)
      } else if (r < 0.95) {
        aics = Math.round(8000 + rand() * 1500)             // top power (8,000–9,500)
      } else {
        aics = Math.round(8500 + rand() * 1500)             // tail (8,500–10,000)
      }
    } else {
      if (r < 0.19) {
        aics = Math.round(5 + rand() * 90)
      } else if (r < 0.36) {
        aics = Math.round(70 + rand() * 380)
      } else if (r < 0.55) {
        aics = Math.round(350 + rand() * 1300)
      } else if (r < 0.74) {
        aics = Math.round(1400 + rand() * 2800)
      } else if (r < 0.88) {
        aics = Math.round(3800 + rand() * 1700)             // power-ish CB (3,800–5,500)
      } else if (r < 0.96) {
        aics = Math.round(5000 + rand() * 1500)             // top CB (5,000–6,500)
      } else {
        aics = Math.round(5500 + rand() * 1500)             // tail CB (5,500–7,000)
      }
    }

    // Per-user jitter to add noise
    const jitter = 0.7 + rand() * 0.6
    aics = Math.round(aics * jitter)

    const grossAmount = Math.round(aics * 0.01 * 100) / 100
    const overPool = Math.max(0, aics - quota)
    const netAmount = Math.round(overPool * 0.01 * 100) / 100

    users.push({
      login,
      totalAICs: aics,
      grossAmount,
      netAmount,
      costCenter: costCenterAssignments[login] ?? null,
      organization: isCe ? 'acme-corp' : (costCenterAssignments[login] ? 'acme-corp' : null),
      totalMonthlyQuota: quota,
    })
  }

  const totalGrossAmount = users.reduce((s, u) => s + u.grossAmount, 0)
  const totalNetAmount = users.reduce((s, u) => s + u.netAmount, 0)

  return {
    users,
    totalGrossAmount: Math.round(totalGrossAmount * 100) / 100,
    totalNetAmount: Math.round(totalNetAmount * 100) / 100,
    rowCount: totalUsers * 4, // simulate ~4 rows per user (multiple days/products)
    dateRange: { earliest: '2026-04-01', latest: '2026-04-28' },
    errors: [],
  }
}

// --- Demo Billing Report data (650 users, enterprise-scale) ---

import { csvToChargebackInput, calcChargeback, type ChargebackResult } from './chargeback'

const BILLING_REPORT_COST_CENTERS = [
  'Engineering', 'Platform', 'Data Science', 'Product',
  'Security', 'DevOps', 'Sales Engineering', 'IT',
]

// Usage multiplier per cost center — Data Science and Engineering types consume more
const CC_USAGE_BIAS: Record<string, number> = {
  'Engineering': 1.6,
  'Platform': 1.4,
  'Data Science': 2.2,
  'DevOps': 1.3,
  'Security': 1.1,
  'Product': 0.7,
  'Sales Engineering': 0.6,
  'IT': 0.7,
}

export function generateDemoBillingReportData(): { csvData: CsvParseResult; result: ChargebackResult } {
  const rand = seededRandom(7777)
  const users: CsvUserUsage[] = []
  const totalUsers = 650
  const ceCount = Math.round(totalUsers * 0.25)

  for (let i = 0; i < totalUsers; i++) {
    const isCe = i < ceCount
    const login = isCe ? `user-ce-${String(i + 1).padStart(3, '0')}` : `user-cb-${String(i - ceCount + 1).padStart(3, '0')}`
    const quota = isCe ? 1000 : 300

    const ccIdx = rand() < 0.80 ? Math.floor(rand() * BILLING_REPORT_COST_CENTERS.length) : -1
    const costCenter = ccIdx >= 0 ? BILLING_REPORT_COST_CENTERS[ccIdx] : null

    const r = rand()
    let aics: number
    if (r < 0.08) {
      // 8% barely use it
      aics = Math.round(10 + rand() * 100)
    } else if (r < 0.37) {
      // 29% low-moderate
      aics = Math.round(150 + rand() * 700)
    } else if (r < 0.57) {
      // 20% moderate (below CB quota)
      aics = Math.round(1000 + rand() * 1500)
    } else if (r < 0.78) {
      // 20% high (around CB quota boundary)
      aics = Math.round(2500 + rand() * 2500)
    } else if (r < 0.92) {
      // 14% very high
      aics = Math.round(4500 + rand() * 3500)
    } else {
      // 8% whales
      aics = Math.round(7000 + rand() * 8000)
    }
    if (isCe) aics = Math.round(aics * (1.4 + rand() * 0.6))

    // Bias by department — Data Science and Engineering users consume more
    if (costCenter && CC_USAGE_BIAS[costCenter]) {
      aics = Math.round(aics * CC_USAGE_BIAS[costCenter])
    }

    const grossAmount = Math.round(aics * 0.01 * 100) / 100
    const overPool = Math.max(0, aics - (isCe ? 7000 : 3000))
    const netAmount = Math.round(overPool * 0.01 * 100) / 100

    users.push({
      login,
      totalAICs: aics,
      grossAmount,
      netAmount,
      costCenter,
      organization: costCenter ? 'acme-corp' : null,
      totalMonthlyQuota: quota,
    })
  }

  const totalGross = users.reduce((s, u) => s + u.grossAmount, 0)
  const totalNet = users.reduce((s, u) => s + u.netAmount, 0)

  const csvData: CsvParseResult = {
    users,
    totalGrossAmount: Math.round(totalGross * 100) / 100,
    totalNetAmount: Math.round(totalNet * 100) / 100,
    rowCount: totalUsers * 5,
    dateRange: { earliest: '2026-04-01', latest: '2026-04-28' },
    errors: [],
  }

  const seatMap = new Map<string, 'business' | 'enterprise'>(
    users.map(u => [u.login, u.totalMonthlyQuota === 1000 ? 'enterprise' : 'business'])
  )

  const { users: chargebackUsers, userToCostCenter, enterpriseGrossAmount, enterpriseNetAmount } =
    csvToChargebackInput(csvData.users, seatMap)

  const result = calcChargeback(
    chargebackUsers, enterpriseNetAmount, enterpriseGrossAmount,
    true, userToCostCenter, 0, true,
  )

  return { csvData, result }
}
