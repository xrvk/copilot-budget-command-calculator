import { createContext, useContext, useState, useCallback, useMemo, useRef, type ReactNode } from 'react'
import { parseEnterpriseUrl } from '@/lib/utils'
import { createDemoFetch, getDemoConnectResult, generateDemoCsvUsageData, type DemoVariant } from '@/lib/demo-data'
import { isCopilotBudget, fetchCostCenters, fetchBudgets, ApiError, type ApiFetchFn } from '@/lib/api'

// --- Types ---

import type { CsvParseResult } from '@/lib/chargeback'

export interface ApiCredentials {
  base: string
  ent: string
  token: string
}

export interface ImportState {
  loading: boolean
  error: string | null
  success: boolean
}

export interface EnterpriseBudgetMeta {
  entBudgetId: string | null
  apiEnterpriseBudget: number | null
  apiExcludeCostCenters: boolean | null
  apiPreventFurtherUsage: boolean | null
  budgetAlertingEnabled: boolean | null
}

/** Lightweight cost center record shared across tabs */
export interface SharedCostCenter {
  ccId: string
  name: string
  budgetAmount: number
  budgetId?: string
  members: string[]           // User-type resource logins from the CC API
  userCount: number           // count of User-type resources
  organizations: string[]     // Organization-type resource names (members not yet resolved)
  orgMemberLogins: string[]   // Logins resolved from Organization-type resources
  resolvedOrganizations: string[]  // Org names that were successfully resolved (persists after resolution)
  failedOrganizations: string[]    // Org names that failed to resolve
  orgFailureReason: 'scope' | 'membership' | null  // Why org resolution failed (403 = scope, other = membership)
}

export interface EnterpriseCredentialsValue {
  // Form inputs
  enterpriseUrl: string
  setEnterpriseUrl: (url: string) => void
  pat: string
  setPat: (pat: string) => void

  // Parsed helpers
  parsed: { base: string; ent: string }

  // Connection state
  credentials: ApiCredentials | null
  importState: ImportState

  // Demo mode
  isDemo: boolean
  demoVariant: DemoVariant
  demoDismissed: boolean
  connectDemo: (variant?: DemoVariant) => ConnectResult
  disconnectDemo: () => void

  // Enterprise budget metadata (set during import)
  budgetMeta: EnterpriseBudgetMeta
  setBudgetMeta: (meta: Partial<EnterpriseBudgetMeta>) => void

  // Shared cost center data (populated by BudgetPlanner, consumed by BudgetCalculator)
  sharedCostCenters: SharedCostCenter[]
  setSharedCostCenters: (ccs: SharedCostCenter[]) => void

  // Actions
  connect: () => Promise<ConnectResult>
  disconnect: () => void

  // Authenticated fetch helper
  apiFetch: (path: string, init?: RequestInit) => Promise<Response>

  // CSV usage data (uploaded billing CSV, parsed and aggregated)
  csvUsageData: CsvParseResult | null
  setCsvUsageData: (data: CsvParseResult | null) => void

  // CSV-derived suggestions for Tier Planner (one-shot: cleared after consumption)
  csvSuggestions: CsvTierSuggestions | null
  setCsvSuggestions: (s: CsvTierSuggestions | null) => void
  csvApplied: boolean
  setCsvApplied: (v: boolean) => void

  // One-shot handoff: list of logins to carry into Tier Planner Step 2 (StepCostCenter)
  // as candidate power user team members. Set by the Consumption Analysis
  // "Apply to Tier Planner" confirmation dialog (alongside `csvSuggestions`).
  // Consumed by `StepCostCenter` in a useEffect that prefills `manualInput`,
  // auto-expands the step, and triggers team/cost-center fetches.
  candidatePowerUserLogins: string[] | null
  setCandidatePowerUserLogins: (logins: string[] | null) => void

  // Derived readiness for "actual usage guidance" gating.
  // - 'demo': demo mode is active. Full app shows with sample data.
  // - 'live-incomplete': real connection in progress (missing API or CSV). Onboarding gate shown.
  // - 'live-ready': real connection + CSV uploaded. Full app shows with live data.
  dataReadiness: DataReadiness
}

export interface DataReadiness {
  mode: 'demo' | 'live-incomplete' | 'live-ready'
  hasApi: boolean
  hasCsv: boolean
  missing: Array<'api' | 'csv'>
}

/** Pre-computed, unit-converted suggestions from consumption analysis → Tier Planner. */
export interface CsvTierSuggestions {
  cbSeats: number
  ceSeats: number
  powerUsers: number
  universalULB: number      // USD (already converted from AICs)
  powerUserBudget: number   // USD (already converted from AICs)
}

export interface ConnectResult {
  ok: boolean
  credentials?: ApiCredentials
  budgets?: Array<{
    id: string
    budget_scope: string
    budget_type: string
    budget_product_sku: string
    budget_amount: number
    budget_entity_name: string
    exclude_cost_center_usage?: boolean
    prevent_further_usage?: boolean
    budget_alerting?: { will_alert: boolean }
  }>
  costCenters?: Array<{ id: string; name: string; state?: string; deleted_at?: string; resources?: Array<{ type: string; name: string }> }>
  error?: string
}

// --- Context ---

const EnterpriseCredentialsContext = createContext<EnterpriseCredentialsValue | null>(null)

export function useEnterpriseCredentials() {
  const ctx = useContext(EnterpriseCredentialsContext)
  if (!ctx) throw new Error('useEnterpriseCredentials must be used within EnterpriseCredentialsProvider')
  return ctx
}

// --- Provider ---

export function EnterpriseCredentialsProvider({ children }: { children: ReactNode }) {
  const [enterpriseUrl, setEnterpriseUrl] = useState(
    import.meta.env.VITE_DEV_ENTERPRISE_URL ?? ''
  )
  const [pat, setPat] = useState(
    import.meta.env.VITE_DEV_PAT ?? ''
  )
  const [credentials, setCredentials] = useState<ApiCredentials | null>(null)
  const [importState, setImportState] = useState<ImportState>({ loading: false, error: null, success: false })

  const [budgetMeta, setBudgetMetaFull] = useState<EnterpriseBudgetMeta>({
    entBudgetId: null,
    apiEnterpriseBudget: null,
    apiExcludeCostCenters: null,
    apiPreventFurtherUsage: null,
    budgetAlertingEnabled: null,
  })

  const setBudgetMeta = useCallback((partial: Partial<EnterpriseBudgetMeta>) => {
    setBudgetMetaFull(prev => ({ ...prev, ...partial }))
  }, [])

  const [sharedCostCenters, setSharedCostCenters] = useState<SharedCostCenter[]>([])
  const [csvUsageData, setCsvUsageData] = useState<CsvParseResult | null>(null)
  const [csvSuggestions, setCsvSuggestions] = useState<CsvTierSuggestions | null>(null)
  const [csvApplied, setCsvApplied] = useState(false)
  const [candidatePowerUserLogins, setCandidatePowerUserLogins] = useState<string[] | null>(null)

  // Demo mode
  const [isDemo, setIsDemo] = useState(false)
  const [demoVariant, setDemoVariant] = useState<DemoVariant>('cc')
  const [demoDismissed, setDemoDismissed] = useState(false)
  const demoFetchRef = useRef<((path: string, init?: RequestInit) => Promise<Response>) | null>(null)

  const parsed = useMemo(() => parseEnterpriseUrl(enterpriseUrl), [enterpriseUrl])

  const apiFetch = useCallback((path: string, init?: RequestInit): Promise<Response> => {
    if (isDemo && demoFetchRef.current) {
      return demoFetchRef.current(path, init)
    }
    if (!credentials) return Promise.reject(new Error('Not connected'))
    const url = `${credentials.base}${path}`
    return fetch(url, {
      ...init,
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${credentials.token}`,
        'X-GitHub-Api-Version': '2026-03-10',
        ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
        ...init?.headers,
      },
    })
  }, [credentials, isDemo])

  const connect = useCallback(async (): Promise<ConnectResult> => {
    const { base, ent } = parseEnterpriseUrl(enterpriseUrl)
    if (ent === 'your-enterprise-slug') {
      const err = 'Please enter a valid enterprise URL or slug.'
      setImportState({ loading: false, error: err, success: false })
      return { ok: false, error: err }
    }
    if (!pat.trim()) {
      const err = 'Please enter a classic PAT.'
      setImportState({ loading: false, error: err, success: false })
      return { ok: false, error: err }
    }

    setImportState({ loading: true, error: null, success: false })

    try {
      const headers = {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${pat.trim()}`,
        'X-GitHub-Api-Version': '2026-03-10',
      }

      // Build a local ApiFetchFn for the typed client helpers
      const localApiFetch: ApiFetchFn = (path, init) =>
        fetch(`${base}${path}`, { ...init, headers: { ...headers, ...init?.headers } })

      // Fetch cost centers + budgets using the centralized paginated client
      let allCostCenters: Awaited<ReturnType<typeof fetchCostCenters>>
      let budgets: Awaited<ReturnType<typeof fetchBudgets>>
      try {
        ;[allCostCenters, budgets] = await Promise.all([
          fetchCostCenters(localApiFetch, ent),
          fetchBudgets(localApiFetch, ent),
        ])
      } catch (err) {
        if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
          throw new Error('Insufficient token scopes. Ensure your classic PAT has manage_billing:enterprise and read:org scopes.', { cause: err })
        }
        throw err
      }

      const entBudget = budgets.find((b: { budget_scope: string; budget_type: string; budget_product_sku: string }) =>
        b.budget_scope === 'enterprise' && isCopilotBudget(b)
      )

      const creds: ApiCredentials = { base, ent, token: pat.trim() }
      setCredentials(creds)

      // Clear demo mode when transitioning to live
      setIsDemo(false)
      demoFetchRef.current = null
      setDemoDismissed(false)
      // Clear demo CSV data — it doesn't apply to the live enterprise
      setCsvUsageData(null)
      setCsvApplied(false)
      setCsvSuggestions(null)
      setCandidatePowerUserLogins(null)

      // Update enterprise budget metadata
      setBudgetMetaFull({
        entBudgetId: entBudget?.id ?? null,
        apiEnterpriseBudget: typeof entBudget?.budget_amount === 'number' ? entBudget.budget_amount : null,
        apiExcludeCostCenters: typeof entBudget?.exclude_cost_center_usage === 'boolean'
          ? entBudget.exclude_cost_center_usage : null,
        apiPreventFurtherUsage: typeof entBudget?.prevent_further_usage === 'boolean'
          ? entBudget.prevent_further_usage : null,
        budgetAlertingEnabled: entBudget?.budget_alerting?.will_alert ?? null,
      })

      setImportState({ loading: false, error: null, success: true })

      return { ok: true, credentials: creds, budgets, costCenters: allCostCenters }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Import failed'
      setImportState({ loading: false, error: msg, success: false })
      return { ok: false, error: msg }
    }
  }, [enterpriseUrl, pat])

  const disconnect = useCallback(() => {
    setCredentials(null)
    setIsDemo(false)
    demoFetchRef.current = null
    setPat('')
    setBudgetMetaFull({
      entBudgetId: null,
      apiEnterpriseBudget: null,
      apiExcludeCostCenters: null,
      apiPreventFurtherUsage: null,
      budgetAlertingEnabled: null,
    })
    setSharedCostCenters([])
    setCandidatePowerUserLogins(null)
    // Clear CSV state so re-entering the live flow always returns to the onboarding
    // gate in a clean state. Demo mode re-populates its own CSV via connectDemo().
    setCsvUsageData(null)
    setCsvSuggestions(null)
    setCsvApplied(false)
    setImportState({ loading: false, error: null, success: false })
  }, [])

  const connectDemo = useCallback((variant: DemoVariant = 'cc'): ConnectResult => {
    // Clear production state so no stale data leaks into demo mode
    setSharedCostCenters([])
    setDemoDismissed(false)
    setCandidatePowerUserLogins(null)

    const result = getDemoConnectResult(variant)
    const demoCreds = result.credentials!
    setCredentials(demoCreds)
    setIsDemo(true)
    setDemoVariant(variant)
    demoFetchRef.current = createDemoFetch(variant)

    const entBudget = result.budgets!.find(b => b.budget_scope === 'enterprise')
    setBudgetMetaFull({
      entBudgetId: entBudget?.id ?? null,
      apiEnterpriseBudget: entBudget?.budget_amount ?? null,
      apiExcludeCostCenters: entBudget?.exclude_cost_center_usage ?? null,
      apiPreventFurtherUsage: entBudget?.prevent_further_usage ?? null,
      budgetAlertingEnabled: entBudget?.budget_alerting?.will_alert ?? null,
    })
    setImportState({ loading: false, error: null, success: true })
    setCsvUsageData(generateDemoCsvUsageData(variant))

    // Populate sharedCostCenters so other tabs (Tier Planner) see them immediately
    const allCCs = result.costCenters ?? []
    const budgetByCcName = new Map(
      result.budgets!
        .filter(b => b.budget_scope === 'cost_center')
        .map(b => [b.budget_entity_name, b])
    )
    setSharedCostCenters(
      allCCs.map(cc => {
        const budget = budgetByCcName.get(cc.name)
        const resources = cc.resources ?? []
        const memberNames = resources.filter(r => r.type === 'User').map(r => r.name)
        const orgNames = resources.filter(r => r.type === 'Organization').map(r => r.name)
        return {
          ccId: cc.id,
          name: cc.name,
          budgetAmount: budget?.budget_amount ?? 0,
          budgetId: budget?.id,
          members: memberNames,
          userCount: memberNames.length,
          organizations: orgNames,
          orgMemberLogins: [],
          resolvedOrganizations: [],
          failedOrganizations: [],
          orgFailureReason: null,
        }
      })
    )

    return result
  }, [])

  const disconnectDemo = useCallback(() => {
    disconnect()
    setDemoDismissed(true)
    setCsvUsageData(null)
    setCsvSuggestions(null)
    setCsvApplied(false)
    setCandidatePowerUserLogins(null)
    setEnterpriseUrl(import.meta.env.VITE_DEV_ENTERPRISE_URL ?? '')
    setPat(import.meta.env.VITE_DEV_PAT ?? '')
  }, [disconnect])

  const dataReadiness = useMemo<DataReadiness>(() => {
    const hasApi = credentials !== null
    const hasCsv = csvUsageData !== null
    if (isDemo) {
      return { mode: 'demo', hasApi, hasCsv, missing: [] }
    }
    if (hasApi && hasCsv) {
      return { mode: 'live-ready', hasApi, hasCsv, missing: [] }
    }
    const missing: Array<'api' | 'csv'> = []
    if (!hasApi) missing.push('api')
    if (!hasCsv) missing.push('csv')
    return { mode: 'live-incomplete', hasApi, hasCsv, missing }
  }, [credentials, csvUsageData, isDemo])

  const value: EnterpriseCredentialsValue = useMemo(() => ({
    enterpriseUrl,
    setEnterpriseUrl,
    pat,
    setPat,
    parsed,
    credentials,
    importState,
    isDemo,
    demoVariant,
    demoDismissed,
    connectDemo,
    disconnectDemo,
    budgetMeta,
    setBudgetMeta,
    sharedCostCenters,
    setSharedCostCenters,
    csvUsageData,
    setCsvUsageData,
    csvSuggestions,
    setCsvSuggestions,
    csvApplied,
    setCsvApplied,
    candidatePowerUserLogins,
    setCandidatePowerUserLogins,
    connect,
    disconnect,
    apiFetch,
    dataReadiness,
  }), [enterpriseUrl, pat, parsed, credentials, importState, isDemo, demoVariant, demoDismissed, connectDemo, disconnectDemo, budgetMeta, setBudgetMeta, sharedCostCenters, csvUsageData, csvSuggestions, csvApplied, candidatePowerUserLogins, connect, disconnect, apiFetch, dataReadiness])

  return (
    <EnterpriseCredentialsContext.Provider value={value}>
      {children}
    </EnterpriseCredentialsContext.Provider>
  )
}
