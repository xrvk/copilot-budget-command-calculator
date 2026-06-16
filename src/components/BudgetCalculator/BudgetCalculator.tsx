import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { ErrorBoundary } from 'react-error-boundary'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { NumericInput } from '@/components/ui/numeric-input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { 
  Calculator, 
  Users, 
  CurrencyDollar, 
  Buildings,
  Lightning,
  Stack,
  Info,
  User,
  ChartBar,
  Warning,
  Tag,
  Link,
  Check,
  CheckCircle,
  ArrowSquareOut,
  Trash,
  CloudArrowDown,
  FileArrowUp,
  HourglassMedium,
  CaretDown,
  CaretUp,
  BookOpen,
  Target,
  ArrowsClockwise,
} from '@phosphor-icons/react'
import { Switch } from '@/components/ui/switch'
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'
import { FormulaTooltip } from '@/components/FormulaTooltip'
import { licensingUrl, budgetEditUrl, settingsTokensUrl } from '@/lib/utils'
import { useEnterpriseCredentials } from '@/hooks/use-enterprise-credentials'
import { useEnterpriseTeams } from '@/hooks/use-enterprise-teams'
import { usePromoSeatData } from '@/hooks/use-promo-seat-data'
import { fetchEnterpriseSpend, isCopilotBudget } from '@/lib/api'
import { EntitlementPoolDiagram } from '@/components/EntitlementPoolDiagram'
import { StepErrorFallback } from '@/components/StepErrorFallback'
import {
  encodeState,
  readParams,
  calcBudgetRecommendations,
  calcEnterpriseBudgetConstraint,
  calcCostCenterBudgetConstraint,
  calcMultiCCConstraints,
  calcMaxAffordableULB,
  calcMaxAffordablePowerBudget,
} from './calculations'
import { calcForecast } from '@copilot-budget/calculator-core'
import type { CostCenterConstraintInput, UserBudgetRecord } from './types'
import { ReservoirCard } from './ReservoirCard'
import { UserBudgetsCard } from './UserBudgetsCard'
import { KeyTakeaways } from './KeyTakeaways'
import { TierPlannerContext, type TierPlannerContextValue } from './TierPlannerContext'
import { StepEnterpriseBudget } from './StepEnterpriseBudget'
import { StepCostCenter } from './StepCostCenter'
import { StepUniversalULB } from './StepUniversalULB'
import { StepIndividualBudgets } from './StepIndividualBudgets'
import { StepConstraintAnalysis } from './StepConstraintAnalysis'
import { useDemoMidCycleSimulation } from './hooks/useDemoMidCycleSimulation'
import { useSeatDataSync } from './hooks/useSeatDataSync'

export default function BudgetCalculator({ onNavigateToTab, onNavigateToImport }: { onNavigateToTab?: (tab: string) => void; onNavigateToImport?: () => void }) {
  const initialParams = readParams()
  const promoDefault = initialParams.promotionalPricing !== null
    ? initialParams.promotionalPricing === '1'
    : new Date() <= new Date('2026-08-31') // Promo ends August 2026
  const initialUniversalULB = !isNaN(initialParams.universalULB) ? initialParams.universalULB : (promoDefault ? 30 : 19)
  const initialPowerUserBudget = !isNaN(initialParams.powerUserBudget) ? initialParams.powerUserBudget : (promoDefault ? 70 : 39)

  const [cbLicenses, setCbLicenses] = useState(!isNaN(initialParams.cbLicenses) ? initialParams.cbLicenses : 50)
  const [ceLicenses, setCeLicenses] = useState(!isNaN(initialParams.ceLicenses) ? initialParams.ceLicenses : 10)
  const [universalULB, setUniversalULB] = useState(initialUniversalULB)
  const [powerUsers, setPowerUsers] = useState(!isNaN(initialParams.powerUsers) ? initialParams.powerUsers : 0)
  const [powerUserBudget, setPowerUserBudget] = useState(initialPowerUserBudget)
  const [enterpriseBufferPercent, setEnterpriseBufferPercent] = useState(!isNaN(initialParams.enterpriseBufferPercent) ? initialParams.enterpriseBufferPercent : 10)
  const [excludeCostCenterUsage, _setExcludeCostCenterUsage] = useState(initialParams.excludeCostCenterUsage !== null ? initialParams.excludeCostCenterUsage === '1' : true)
  const [promotionalPricing, setPromotionalPricing] = useState(promoDefault)
  const [powerUsersManuallySet, setPowerUsersManuallySet] = useState(initialParams.puFromUrl)
  const [cbManuallySet, setCbManuallySet] = useState(initialParams.cbFromUrl)
  const [ceManuallySet, setCeManuallySet] = useState(initialParams.ceFromUrl)
  const [ulbManuallySet, setUlbManuallySet] = useState(initialParams.ulbFromUrl)
  const [powerBudgetManuallySet, setPowerBudgetManuallySet] = useState(initialParams.pubFromUrl)
  const [copied, setCopied] = useState(false)
  const [configOpen, setConfigOpen] = useState(true)
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [stepsExpandedSignal, setStepsExpandedSignal] = useState(0)
  const [referenceOpen, setReferenceOpen] = useState(false)

  // Budget Lock: lock enterprise/CC budget cap and solve for affordable ULBs.
  // Default ON: the new Step 4 protection assumes budget caps are realistic, and the
  // Tier Planner is most useful when ULBs are constrained by the org's actual budget.
  // URL-shared sessions with `cap > 0` still preserve their cap. Sessions sharing an
  // explicit `cap=0` will now show BL on (and snap to the auto-synced API budget when connected).
  const [budgetCapEnabled, setBudgetCapEnabled] = useState(true)
  const [enterpriseBudgetCap, setEnterpriseBudgetCap] = useState(initialParams.budgetCap > 0 ? initialParams.budgetCap : 500)
  const [ccBudgetCap, setCcBudgetCap] = useState(initialParams.ccBudgetCap > 0 ? initialParams.ccBudgetCap : 200)
  // When caps come from a shared URL, skip auto-sync so the shared values are preserved
  const [capFromUrl] = useState(initialParams.budgetCap > 0)
  const [ccCapFromUrl] = useState(initialParams.ccBudgetCap > 0)

  // Billing cycle adjustment state
  const [midCycleEnabled, setMidCycleEnabled] = useState(initialParams.midCycleEnabled === '1')
  const [midCyclePoolConsumed, setMidCyclePoolConsumed] = useState(initialParams.midCyclePoolConsumed > 0 ? initialParams.midCyclePoolConsumed : 0)
  const [midCycleAutoFetched, setMidCycleAutoFetched] = useState(false)
  const [midCycleDemoSimulated, setMidCycleDemoSimulated] = useState(false)
  const spendFetchedRef = useRef(false)

  // Enterprise Teams integration
  const { credentials, apiFetch, budgetMeta, setBudgetMeta, sharedCostCenters, setSharedCostCenters, isDemo, csvSuggestions, setCsvSuggestions, csvApplied, setCsvApplied, csvUsageData } = useEnterpriseCredentials()

  // One-shot: apply CSV-derived suggestions when they arrive
  /* eslint-disable react-hooks/set-state-in-effect -- intentional one-shot apply on tab navigation from analysis panel */
  useEffect(() => {
    if (!csvSuggestions) return
    setCbLicenses(csvSuggestions.cbSeats)
    setCeLicenses(csvSuggestions.ceSeats)
    setPowerUsers(csvSuggestions.powerUsers)
    setUniversalULB(csvSuggestions.universalULB)
    setPowerUserBudget(csvSuggestions.powerUserBudget)
    setCsvSuggestions(null)
    setCsvApplied(true)
  }, [csvSuggestions, setCsvSuggestions, setCsvApplied])
  /* eslint-enable react-hooks/set-state-in-effect */

  const appliedFromCsv = csvApplied

  // Demo mode: auto-enable billing cycle toggle with date-based simulation
  useDemoMidCycleSimulation({
    isDemo,
    midCycleDemoSimulated,
    setMidCycleDemoSimulated,
    setMidCycleEnabled,
    setMidCyclePoolConsumed,
    setMidCycleAutoFetched,
    powerBudgetManuallySet,
    setPowerUserBudget,
  })

  const {
    teams, teamsLoading, teamsError, fetchTeams,
    members, membersLoading, membersError,
    selectedTeam, fetchMembers,
    clearTeams,
  } = useEnterpriseTeams()

  // Auto-import CB/CE seat counts when connected
  const { data: seatData, loading: seatLoading, fetchSeatData, clear: clearSeatData } = usePromoSeatData()
  useSeatDataSync({
    credentials,
    seatData,
    seatLoading,
    fetchSeatData,
    setCbLicenses,
    setCeLicenses,
    setPowerUsers,
    powerUsersManuallySet,
    cbManuallySet,
    ceManuallySet,
  })

  // Power CC designation: which imported CC is the "power user" group
  // null = "create new" (default optimizer behavior), string = ccId of existing CC
  const [powerCcId, setPowerCcId] = useState<string | null>(null)

  // Auto-designate the highest-budget CC as the power CC when CCs arrive
  const [prevAutoDesignateCcs, setPrevAutoDesignateCcs] = useState(sharedCostCenters)
  if (sharedCostCenters !== prevAutoDesignateCcs) {
    setPrevAutoDesignateCcs(sharedCostCenters)
    if (powerCcId === null && sharedCostCenters.length > 0) {
      const best = sharedCostCenters.reduce((a, b) => b.budgetAmount > a.budgetAmount ? b : a)
      setPowerCcId(best.ccId)
    }
  }

  const powerCc = useMemo(
    () => sharedCostCenters.find(cc => cc.ccId === powerCcId) ?? null,
    [sharedCostCenters, powerCcId]
  )
  const otherCostCenters = useMemo(
    () => sharedCostCenters.filter(cc => cc.ccId !== powerCcId),
    [sharedCostCenters, powerCcId]
  )

  const hasCostCenters = sharedCostCenters.length > 0


  // Live API state — shared with step components via context
  const [liveEntBudget, setLiveEntBudget] = useState<number | null>(budgetMeta.apiEnterpriseBudget)
  const [liveUlb, setLiveUlb] = useState<number | null>(null)
  const [ulbId, setUlbId] = useState<string | null>(null)
  const [ulbFetched, setUlbFetched] = useState(false)
  const [liveUserBudgets, setLiveUserBudgets] = useState<Array<{ id: string; login: string; amount: number }>>([])
  const [orgResolvingCcIds, setOrgResolvingCcIds] = useState<Set<string>>(new Set())
  const [orgResolveFailedCcIds, setOrgResolveFailedCcIds] = useState<Set<string>>(new Set())
  const [budgetFetchError, setBudgetFetchError] = useState<string | null>(null)
  // Sync liveEntBudget from shared budgetMeta when Budget Planner updates it
  const [prevApiEntBudget, setPrevApiEntBudget] = useState(budgetMeta.apiEnterpriseBudget)
  if (budgetMeta.apiEnterpriseBudget !== prevApiEntBudget) {
    setPrevApiEntBudget(budgetMeta.apiEnterpriseBudget)
    if (budgetMeta.apiEnterpriseBudget !== null) {
      setLiveEntBudget(budgetMeta.apiEnterpriseBudget)
    } else {
      setLiveEntBudget(null)
    }
  }




  // Shared: fetch all budgets and populate Steps 1, 3, 4
  const fetchAllBudgets = useCallback(async () => {
    if (!credentials) return
    setBudgetFetchError(null)
    try {
      // Paginate budgets — GHES may cap per_page
      const budgets: Array<{ id: string; budget_scope: string; budget_type: string; budget_product_sku: string; budget_amount: number; budget_entity_name: string }> = []
      let page = 1
      for (;;) {
        const res = await apiFetch(`/enterprises/${credentials.ent}/settings/billing/budgets?per_page=100&page=${page}`)
        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          const message = (body as { message?: string }).message || `HTTP ${res.status}`
          if (res.status === 429) {
            setBudgetFetchError('Rate limited by GitHub API. Wait a moment and try again.')
          } else if (res.status === 401 || res.status === 403) {
            setBudgetFetchError('Authentication failed. Check your PAT permissions and try reconnecting.')
          } else {
            setBudgetFetchError(message)
          }
          return
        }
        const data = await res.json()
        budgets.push(...(data.budgets ?? []))
        if (!data.has_next_page) break
        page++
      }

      // Enterprise budget
      const ent = budgets.find(b => b.budget_scope === 'enterprise' && isCopilotBudget(b))
      if (ent) {
        setLiveEntBudget(ent.budget_amount)
        setBudgetMeta({ entBudgetId: ent.id })
      }

      // Universal ULB (multi_user_customer — undocumented scope, consistent across all enterprise accounts)
      const ulb = budgets.find(b => b.budget_scope === 'multi_user_customer' && isCopilotBudget(b))
      if (ulb) {
        setLiveUlb(ulb.budget_amount)
        setUlbId(ulb.id)
      } else {
        setLiveUlb(null)
        setUlbId(null)
      }
      setUlbFetched(true)

      // User-level budgets
      const userBudgets = budgets
        .filter(b => b.budget_scope === 'user' && isCopilotBudget(b))
        .map(b => ({ id: b.id, login: b.budget_entity_name, amount: b.budget_amount }))
      setLiveUserBudgets(userBudgets)
    } catch (err) {
      setBudgetFetchError(err instanceof Error ? err.message : 'Failed to fetch budgets')
      console.error('Failed to fetch budgets:', err)
    }
  }, [credentials, apiFetch, setBudgetMeta])

  // Auto-fetch all budgets (ULBs, enterprise budget, user budgets) when connected
  const budgetsFetchedRef = useRef(false)
  useEffect(() => {
    if (credentials && !ulbFetched && !budgetsFetchedRef.current) {
      budgetsFetchedRef.current = true
      fetchAllBudgets()
    }
  }, [credentials, ulbFetched, fetchAllBudgets])

  // Resolve org members for a cost center: fetches GET /orgs/{org}/members for each org
  // and merges the results into sharedCostCenters members list.
  // Uses functional state updates to avoid stale-closure clobbering when multiple CCs resolve concurrently.
  const resolveOrgMembers = useCallback(async (ccId: string) => {
    if (!credentials) return
    const cc = sharedCostCenters.find(sc => sc.ccId === ccId)
    if (!cc || cc.organizations.length === 0) return

    setOrgResolvingCcIds(prev => new Set([...prev, ccId]))
    setOrgResolveFailedCcIds(prev => { const next = new Set(prev); next.delete(ccId); return next })
    let failed = false
    let failureReason: 'scope' | 'membership' | null = null
    try {
      const allOrgMembers: string[] = []
      const succeededOrgs: string[] = []
      const failedOrgs: string[] = []
      for (const orgName of cc.organizations) {
        try {
          const res = await apiFetch(`/orgs/${orgName}/members?per_page=100`)
          if (res.ok) {
            const members: Array<{ login: string }> = await res.json()
            allOrgMembers.push(...members.map(m => m.login))
            succeededOrgs.push(orgName)
          } else {
            failedOrgs.push(orgName)
            failed = true
            if (res.status === 403) failureReason = 'scope'
            else if (!failureReason) failureReason = 'membership'
          }
        } catch { failedOrgs.push(orgName); failed = true; if (!failureReason) failureReason = 'membership' }
      }
      const resolvedOrgLogins = [...new Set([...(cc.orgMemberLogins ?? []), ...allOrgMembers])]
      const uniqueNewLogins = allOrgMembers.length > 0 ? [...new Set(allOrgMembers)] : []
      if (uniqueNewLogins.length > 0) {
        // Functional update: merge against latest state to avoid clobbering concurrent resolutions
        setSharedCostCenters(prev => prev.map(sc => {
          if (sc.ccId !== ccId) return sc
          const existing = new Set(sc.members)
          const toAdd = uniqueNewLogins.filter(login => !existing.has(login))
          const merged = toAdd.length > 0 ? [...sc.members, ...toAdd] : sc.members
          return {
            ...sc, members: merged, userCount: merged.length, organizations: failedOrgs, orgMemberLogins: resolvedOrgLogins,
            resolvedOrganizations: [...new Set([...sc.resolvedOrganizations, ...succeededOrgs])],
            failedOrganizations: failedOrgs,
            orgFailureReason: failureReason,
          }
        }))
      } else if (!failed) {
        setSharedCostCenters(prev => prev.map(sc =>
          sc.ccId === ccId ? {
            ...sc, organizations: [], orgMemberLogins: resolvedOrgLogins,
            resolvedOrganizations: [...new Set([...sc.resolvedOrganizations, ...succeededOrgs])],
            failedOrganizations: failedOrgs,
            orgFailureReason: null,
          } : sc
        ))
      } else {
        // All orgs failed — clear organizations so UI shows failure indicators instead of "resolving"
        setSharedCostCenters(prev => prev.map(sc =>
          sc.ccId === ccId ? {
            ...sc, organizations: [],
            resolvedOrganizations: [...new Set([...sc.resolvedOrganizations, ...succeededOrgs])],
            failedOrganizations: failedOrgs,
            orgFailureReason: failureReason,
          } : sc
        ))
      }
    } catch { failed = true; if (!failureReason) failureReason = 'membership' }
    if (failed) setOrgResolveFailedCcIds(prev => new Set([...prev, ccId]))
    setOrgResolvingCcIds(prev => { const next = new Set(prev); next.delete(ccId); return next })
  }, [credentials, apiFetch, sharedCostCenters, setSharedCostCenters])

  // Clear cached production data when the enterprise changes (e.g. demo ↔ production, cc ↔ nocc)
  // IMPORTANT: Must be declared before auto-resolve effect so the orgResolvedRef reset
  // runs first when both effects fire in the same render (React runs effects in order).
  const orgResolvedRef = useRef(false)
  const prevEntRef = useRef(credentials?.ent)
  useEffect(() => {
    if (credentials?.ent !== prevEntRef.current) {
      prevEntRef.current = credentials?.ent
      clearTeams()
      clearSeatData()
      // useSeatDataSync resets its own fetched-once gate when ent changes
      budgetsFetchedRef.current = false
      spendFetchedRef.current = false
      setMidCycleAutoFetched(false)
      setMidCyclePoolConsumed(0)
      setOrgResolveFailedCcIds(new Set())
      orgResolvedRef.current = false
      // Re-sync from shared context if available, otherwise clear
      setLiveEntBudget(budgetMeta.apiEnterpriseBudget)
      setUlbFetched(false)
      setLiveUlb(null)
      setUlbId(null)
      setLiveUserBudgets([])
      // Clear URL-encoded state so stale params don't override fresh data
      const hashParams = new URLSearchParams(window.location.hash.slice(window.location.hash.indexOf('?') + 1))
      if (hashParams.has('s')) {
        hashParams.delete('s')
        const tab = window.location.hash.slice(1, window.location.hash.indexOf('?'))
        const remaining = hashParams.toString()
        window.history.replaceState(null, '', `${window.location.pathname}#${tab || 'tier-planner'}${remaining ? `?${remaining}` : ''}`)
      }
    }
  }, [credentials?.ent, clearTeams, clearSeatData, budgetMeta.apiEnterpriseBudget])

  // Auto-resolve org members for all CCs that have Organization-type resources
  useEffect(() => {
    if (!credentials || orgResolvedRef.current) return
    const ccsWithOrgs = sharedCostCenters.filter(sc => sc.organizations.length > 0)
    if (ccsWithOrgs.length === 0) return
    orgResolvedRef.current = true
    ccsWithOrgs.forEach(sc => resolveOrgMembers(sc.ccId))
  }, [credentials, sharedCostCenters, resolveOrgMembers])

  // Retry failed org resolution: re-populates organizations from failedOrganizations,
  // resets the guard ref so the auto-resolve effect re-fires on next render.
  const retryFailedOrgResolution = useCallback(() => {
    setSharedCostCenters(prev => prev.map(sc =>
      sc.failedOrganizations.length > 0
        ? { ...sc, organizations: [...sc.failedOrganizations], failedOrganizations: [], orgFailureReason: null }
        : sc
    ))
    orgResolvedRef.current = false
  }, [setSharedCostCenters])

  // Auto-fetch enterprise-wide pool consumption for billing cycle adjustment
  // Uses grossAmount from premium_request/usage to capture total consumption (pool + overage)
  useEffect(() => {
    if (!credentials || spendFetchedRef.current) return
    spendFetchedRef.current = true
    fetchEnterpriseSpend(apiFetch, credentials.ent)
      .then(total => {
        if (total > 0) {
          setMidCyclePoolConsumed(Math.round(total * 100) / 100)
          setMidCycleAutoFetched(true)
        }
      })
      .catch(() => { /* silently ignore — manual entry remains available */ })
  }, [credentials, apiFetch])

  // When connected, lock excludeCostCenterUsage to the API value
  const effectiveExcludeCostCenterUsage =
    credentials && budgetMeta.apiExcludeCostCenters !== null
      ? budgetMeta.apiExcludeCostCenters
      : excludeCostCenterUsage

  // Auto-fetch enterprise teams when connected
  useEffect(() => {
    if (credentials && !teams.length && !teamsLoading) {
      fetchTeams()
    }
  }, [credentials]) // eslint-disable-line react-hooks/exhaustive-deps

  // Entitlement floor values (not recommendations — just the minimum sensible starting point)
  const ULB_FLOOR = { promotional: 30, standard: 19 }
  const PUB_FLOOR = { promotional: 70, standard: 39 }

  // Core budget math — single source of truth (also tested in isolation)
  const recommendations = calcBudgetRecommendations(
    cbLicenses, ceLicenses, universalULB,
    powerUsers, powerUserBudget, enterpriseBufferPercent, promotionalPricing,
    midCycleEnabled ? midCyclePoolConsumed : 0,
  )
  const {
    cbAICsPerLicense, ceAICsPerLicense,
    totalUsers, cbAICs, ceAICs, totalReservoir, reservoirValue, promoBonusValue,
    avgUsagePerUser, regularUsers, maxRegularConsumption, maxPowerConsumption,
    maxTotalConsumption, maxSpendBeyondReservoir, recommendedEnterpriseBudget,
    powerUserShareOfConsumption, recommendedCostCenterBudget, isReservoirSufficient,
  } = recommendations

  // Realistic forecast from CSV consumption (null when no CSV present).
  // Uses effective ULBs (Budget Lock-aware), the effective pool (mid-cycle-aware),
  // and the current power CC membership when exclusion is ON.
  const forecast = (() => {
    if (!csvUsageData || csvUsageData.users.length === 0) return null
    // Approximate power threshold: anyone whose actual spend exceeds the base
    // ULB is treated as a power user. This matches the consumption-analysis
    // chart's split semantics and is robust without requiring the threshold
    // to be wired through from the panel.
    const baseULBDollars = liveUlb ?? universalULB
    const powerULBDollars = powerUserBudget
    const powerThresholdAICs = baseULBDollars / 0.01
    const ccMembers = effectiveExcludeCostCenterUsage && powerCc
      ? new Set(powerCc.members)
      : undefined
    return calcForecast({
      users: csvUsageData.users.map(u => ({ login: u.login, totalAICs: u.totalAICs })),
      baseULB: baseULBDollars,
      powerULB: powerULBDollars,
      powerThresholdAICs,
      pool: recommendations.effectiveReservoirValue,
      excludeCostCenterUsage: effectiveExcludeCostCenterUsage,
      costCenterMemberLogins: ccMembers,
    })
  })()

  // Forecast-aware primary headlines. When CSV is available we lead with
  // forecast × buffer; otherwise we fall back to the ceiling recommendation
  // (`recommendedEnterpriseBudget`). The previous explicit "high-water mark"
  // view mode was removed in May 2026; see docs/internal/architecture.md
  // § "Historical: high-water mark view mode (removed from UI)".
  const bufferMul = 1 + enterpriseBufferPercent / 100
  const forecastPrimaryEnt = forecast !== null
    ? Math.ceil(forecast.forecastEnterprise * bufferMul)
    : recommendedEnterpriseBudget
  const forecastPrimaryCc = forecast !== null
    ? Math.ceil(forecast.forecastCostCenter * bufferMul)
    : recommendedCostCenterBudget
  const primaryEnterpriseBudget = forecastPrimaryEnt
  const primaryCostCenterBudget = forecastPrimaryCc

  // Enterprise budget constraint detection (when connected and live budget is known)
  const entBudgetConstraint = liveEntBudget !== null
    ? calcEnterpriseBudgetConstraint(
        liveEntBudget,
        recommendations,
        effectiveExcludeCostCenterUsage,
        forecast !== null ? { forecastEnterprise: forecast.forecastEnterprise } : undefined,
      )
    : null

  // Cost center budget constraint detection (when a power CC is designated)
  const ccBudgetConstraint = powerCc
    ? calcCostCenterBudgetConstraint(
        powerCc.budgetAmount,
        recommendations,
        forecast !== null ? { forecastCostCenter: forecast.forecastCostCenter } : undefined,
      )
    : null

  // CCC-aware enterprise budget minimum: when multi-CC data is available,
  // use the full picture (actual per-user ULBs × CC membership) to derive the real
  // minimum enterprise budget. This replaces the simplified model's recommendation
  // so Step 1 never conflicts with Step 5.
  const cccEntBudgetMin = (() => {
    if (sharedCostCenters.length === 0 || !ulbFetched) return null
    const ccInputs: CostCenterConstraintInput[] = sharedCostCenters.map(sc => ({
      ccId: sc.ccId, name: sc.name, budget: sc.budgetAmount, members: sc.members,
    }))
    const ubRecords: UserBudgetRecord[] = liveUserBudgets.map(ub => ({ login: ub.login, amount: ub.amount }))
    const mr = calcMultiCCConstraints(ccInputs, ubRecords, liveUlb ?? universalULB, reservoirValue, 0, effectiveExcludeCostCenterUsage, totalUsers)
    const rawShortfall = mr.unassignedUsers.constraint.shortfall > 0 ? mr.unassignedUsers.constraint.shortfall : 0
    return Math.ceil(rawShortfall * (1 + enterpriseBufferPercent / 100))
  })()

  // The effective minimum enterprise budget: use CCC model when available (it has the real data),
  // fall back to the forecast-aware primary otherwise.
  const effectiveEntBudgetMin = cccEntBudgetMin !== null
    ? Math.max(primaryEnterpriseBudget, cccEntBudgetMin)
    : primaryEnterpriseBudget

  // Budget Lock: reverse solver outputs
  const effectivePool = recommendations.effectiveReservoirValue
  const maxAffordableULB = budgetCapEnabled
    ? calcMaxAffordableULB(
        enterpriseBudgetCap, effectivePool, regularUsers,
        powerUsers, powerUserBudget, enterpriseBufferPercent,
        effectiveExcludeCostCenterUsage,
      )
    : null
  const maxAffordablePUB = budgetCapEnabled
    ? calcMaxAffordablePowerBudget(
        effectiveExcludeCostCenterUsage ? ccBudgetCap : enterpriseBudgetCap,
        effectivePool, regularUsers,
        powerUsers, universalULB, enterpriseBufferPercent,
        effectiveExcludeCostCenterUsage,
      )
    : null
  const ulbExceedsCap = maxAffordableULB !== null && isFinite(maxAffordableULB) && universalULB > maxAffordableULB
  const pubExceedsCap = maxAffordablePUB !== null && isFinite(maxAffordablePUB) && powerUserBudget > maxAffordablePUB

  // Budget Lock: determine which field is the binding constraint and compute tradeoff hints.
  // "Headroom" = how far below the max affordable each field is (negative = exceeding).
  // The field with less headroom (or more overshoot) is the limiting factor.
  const budgetLockTradeoff = (() => {
    if (!budgetCapEnabled || maxAffordableULB === null || maxAffordablePUB === null) return null
    if (!isFinite(maxAffordableULB) && !isFinite(maxAffordablePUB)) return null
    // When exclusion is ON, ULB and PUB are constrained by independent budgets — no tradeoff
    if (effectiveExcludeCostCenterUsage) return null

    const ulbHeadroom = isFinite(maxAffordableULB) ? maxAffordableULB - universalULB : Infinity
    const pubHeadroom = isFinite(maxAffordablePUB) ? maxAffordablePUB - powerUserBudget : Infinity

    // Both within cap — no constraint to highlight
    if (ulbHeadroom >= 0 && pubHeadroom >= 0) return null

    // Determine which is binding and compute tradeoff
    const ulbIsBinding = ulbHeadroom < pubHeadroom
    if (ulbIsBinding && regularUsers > 0 && powerUsers > 0) {
      const ulbOvershoot = Math.max(0, universalULB - (isFinite(maxAffordableULB) ? maxAffordableULB : universalULB))
      const freedPerPowerUser = Math.floor((ulbOvershoot * regularUsers) / powerUsers)
      return { binding: 'ulb' as const, freedPerUser: freedPerPowerUser, overshoot: Math.ceil(ulbOvershoot) }
    } else if (!ulbIsBinding && regularUsers > 0 && powerUsers > 0) {
      const pubOvershoot = Math.max(0, powerUserBudget - (isFinite(maxAffordablePUB) ? maxAffordablePUB : powerUserBudget))
      const freedPerRegularUser = Math.floor((pubOvershoot * powerUsers) / regularUsers)
      return { binding: 'pub' as const, freedPerUser: freedPerRegularUser, overshoot: Math.ceil(pubOvershoot) }
    }
    return null
  })()

  // Sync budget cap from live enterprise/CC budget (Budget Planner → Budget Lock).
  // Skip auto-sync when caps were loaded from a shared URL so the shared values are preserved.
  const [prevBudgetCapPrefill, setPrevBudgetCapPrefill] = useState<number | null>(null)
  if (!capFromUrl && liveEntBudget !== null && liveEntBudget !== prevBudgetCapPrefill) {
    setPrevBudgetCapPrefill(liveEntBudget)
    setEnterpriseBudgetCap(liveEntBudget)
  }
  // Direct sync from budgetMeta (Budget Planner apply → Budget Lock cap).
  // The liveEntBudget sync above takes an extra render cycle; this catches
  // the budgetMeta change on the same render so the cap updates immediately.
  const [prevCapFromMeta, setPrevCapFromMeta] = useState(budgetMeta.apiEnterpriseBudget)
  if (!capFromUrl && budgetMeta.apiEnterpriseBudget !== null && budgetMeta.apiEnterpriseBudget !== prevCapFromMeta) {
    setPrevCapFromMeta(budgetMeta.apiEnterpriseBudget)
    setEnterpriseBudgetCap(budgetMeta.apiEnterpriseBudget)
    setPrevBudgetCapPrefill(budgetMeta.apiEnterpriseBudget)
  }
  const [prevCcCapPrefill, setPrevCcCapPrefill] = useState<number | null>(null)
  const powerCcBudget = powerCc?.budgetAmount ?? null
  if (!ccCapFromUrl && powerCcBudget !== null && powerCcBudget !== prevCcCapPrefill) {
    setPrevCcCapPrefill(powerCcBudget)
    setCcBudgetCap(powerCcBudget)
  }
  // Fallback: when no power CC is designated, keep CC cap in sync with the recommended value
  const [prevCcCapRecommended, setPrevCcCapRecommended] = useState<number | null>(null)
  if (!ccCapFromUrl && powerCcBudget === null && recommendedCostCenterBudget > 0 && recommendedCostCenterBudget !== prevCcCapRecommended) {
    setPrevCcCapRecommended(recommendedCostCenterBudget)
    setCcBudgetCap(recommendedCostCenterBudget)
  }


  // Sync all calculator state to URL hash on every change
  useEffect(() => {
    const hashTab = window.location.hash.slice(1).split('?')[0]
    if (hashTab !== 'tier-planner') return
    const encoded = encodeState({
      cb: cbLicenses, ce: ceLicenses, ulb: universalULB,
      pu: powerUsers, pub: powerUserBudget, buf: enterpriseBufferPercent,
      exc: effectiveExcludeCostCenterUsage ? '1' : '0', promo: promotionalPricing ? '1' : '0',
      cap: budgetCapEnabled ? enterpriseBudgetCap : 0,
      cccap: budgetCapEnabled ? ccBudgetCap : 0,
      mid: midCycleEnabled ? '1' : '0',
      midamt: midCycleEnabled ? midCyclePoolConsumed : 0,
    })
    // Preserve non-state hash params (e.g. popup=0) when syncing state to URL
    const qIdx = window.location.hash.indexOf('?')
    const existingParams = qIdx === -1 ? new URLSearchParams() : new URLSearchParams(window.location.hash.slice(qIdx + 1))
    existingParams.set('s', encoded)
    window.history.replaceState(null, '', `${window.location.pathname}#tier-planner?${existingParams.toString()}`)
  }, [cbLicenses, ceLicenses, universalULB, powerUsers, powerUserBudget, enterpriseBufferPercent, effectiveExcludeCostCenterUsage, promotionalPricing, budgetCapEnabled, enterpriseBudgetCap, ccBudgetCap, midCycleEnabled, midCyclePoolConsumed])

  const handleCopyLink = useCallback(() => {
    navigator.clipboard.writeText(window.location.href).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }, [])

  const handleCbLicensesChange = (val: number) => {
    setCbManuallySet(true)
    setCbLicenses(val)
  }

  const handleCeLicensesChange = (val: number) => {
    setCeManuallySet(true)
    setCeLicenses(val)
    if (!powerUsersManuallySet || powerUsers < val) {
      setPowerUsers(val)
    }
  }

  const handlePowerUsersChange = (val: number) => {
    setPowerUsersManuallySet(true)
    setPowerUsers(val)
  }

  const handleUniversalULBChange = (val: number) => {
    setUlbManuallySet(true)
    setUniversalULB(val)
  }

  const handlePowerUserBudgetChange = (val: number) => {
    setPowerBudgetManuallySet(true)
    setPowerUserBudget(val)
  }

  const handlePromotionalPricingChange = (val: boolean) => {
    setPromotionalPricing(val)
    // Only reset to entitlement floor if values weren't imported from CSV
    if (!appliedFromCsv) {
      const period = val ? 'promotional' : 'standard'
      if (!ulbManuallySet) {
        setUniversalULB(ULB_FLOOR[period])
      }
      if (!powerBudgetManuallySet) {
        setPowerUserBudget(PUB_FLOOR[period])
      }
    }
  }

  const cbCost = cbLicenses * 19
  const ceCost = ceLicenses * 39
  const totalMonthlyCost = cbCost + ceCost
  // Only auto-expand Advanced when the user manually enables mid-cycle,
  // not when demo mode initializes it on load.
  const [midCycleUserToggled, setMidCycleUserToggled] = useState(false)
  const handleMidCycleChange = (val: boolean) => {
    setMidCycleUserToggled(true)
    setMidCycleEnabled(val)
  }
  if (midCycleUserToggled && (midCycleEnabled || midCyclePoolConsumed > 0)) {
    // Auto-expand once, then stop tracking
    setMidCycleUserToggled(false)
    setAdvancedOpen(true)
  }

  const specificULBTotal = powerUserBudget
  const specificULBBorrowed = Math.max(0, specificULBTotal - universalULB)

  // Sum of non-power imported CC budgets (these are existing allocations from the API)
  const otherCcBudgetTotal = useMemo(
    () => otherCostCenters.reduce((sum, cc) => sum + cc.budgetAmount, 0),
    [otherCostCenters]
  )

  // When "exclude cost center usage" is checked, enterprise and cost center
  // budgets are additive (enterprise doesn't count cost center charges).
  // When unchecked, enterprise covers everything including cost centers.
  const maxPostPoolCharges = effectiveExcludeCostCenterUsage
    ? recommendedEnterpriseBudget + recommendedCostCenterBudget + otherCcBudgetTotal
    : recommendedEnterpriseBudget

  // Effective budget values: actual when connected and known, recommended as fallback.
  // These drive the summary, breakdown, and diagram to reflect reality.
  const effectiveEntBudget = liveEntBudget !== null ? liveEntBudget : recommendedEnterpriseBudget
  const effectiveCcBudget = powerCc ? powerCc.budgetAmount : recommendedCostCenterBudget
  const effectivePostPoolCharges = effectiveExcludeCostCenterUsage
    ? effectiveEntBudget + effectiveCcBudget + otherCcBudgetTotal
    : effectiveEntBudget
  // When forecast data is available, key the binding state off the forecast model
  // so the alert and its "Suggested: $X" stay aligned (applying the forecast-based
  // suggestion will actually clear the alert). Fall back to the ceiling model
  // (the previous behavior) when no CSV is present.
  const entBudgetIsBinding = entBudgetConstraint?.isBindingVsForecast
    ?? entBudgetConstraint?.isBinding
    ?? false
  const ccBudgetIsBinding = ccBudgetConstraint?.isBindingVsForecast
    ?? ccBudgetConstraint?.isBinding
    ?? false
  const entCapacityPercent = entBudgetConstraint?.forecastCapacityPercent
    ?? entBudgetConstraint?.capacityPercent
    ?? 100
  const ccCapacityPercent = ccBudgetConstraint?.forecastCapacityPercent
    ?? ccBudgetConstraint?.capacityPercent
    ?? 100

  // Budget enforcement tier — mirrors BudgetPlanner logic
  // null when disconnected or no enterprise budget exists yet
  const hasEntBudget = credentials !== null && budgetMeta.entBudgetId !== null
  const tier: 'hard' | 'soft' | 'blind' | null = hasEntBudget
    ? budgetMeta.apiPreventFurtherUsage === true
      ? 'hard'
      : budgetMeta.budgetAlertingEnabled === true
        ? 'soft'
        : 'blind'
    : null

  const tierCardClass = tier === 'soft'
    ? 'border-warning/30 bg-gradient-to-br from-warning/8 via-warning/3 to-transparent'
    : tier === 'blind'
    ? 'border-destructive/30 bg-gradient-to-br from-destructive/8 via-destructive/3 to-transparent'
    : 'border-success/30 bg-gradient-to-br from-success/8 via-success/3 to-transparent'
  const tierAccent = tier === 'soft' ? 'text-warning' : tier === 'blind' ? 'text-destructive' : 'text-success'
  const tierBorder = tier === 'soft' ? 'border-warning' : tier === 'blind' ? 'border-destructive/60' : 'border-success'
  const tierAmountClass = tier === 'blind' ? 'text-destructive/70 line-through' : tier === 'soft' ? 'text-warning' : 'text-success'

  // Display values: when connected with actual budgets, show reality; otherwise show recommended
  const displayPostPoolCharges = tier !== null ? effectivePostPoolCharges : maxPostPoolCharges
  const displayEntBudget = tier !== null ? effectiveEntBudget : recommendedEnterpriseBudget
  const displayCcBudget = tier !== null ? effectiveCcBudget : recommendedCostCenterBudget

  // --- Context value for step components ---
  const ctxValue: TierPlannerContextValue = useMemo(() => ({
    credentials, apiFetch, budgetMeta, setBudgetMeta,
    recommendations, universalULB, powerUsers, powerUserBudget,
    enterpriseBufferPercent, effectiveExcludeCostCenterUsage,
    totalUsers, regularUsers, reservoirValue, isReservoirSufficient,
    maxSpendBeyondReservoir, recommendedEnterpriseBudget, recommendedCostCenterBudget,
    maxPowerConsumption, maxTotalConsumption, maxRegularConsumption, powerUserShareOfConsumption,
    liveEntBudget, setLiveEntBudget, liveUlb, setLiveUlb, ulbId, setUlbId, ulbFetched,
    liveUserBudgets, setLiveUserBudgets,
    powerCcId, setPowerCcId, powerCc,
    sharedCostCenters, setSharedCostCenters, hasCostCenters,
    entBudgetConstraint, ccBudgetConstraint, effectiveEntBudgetMin,
    forecast, primaryEnterpriseBudget, primaryCostCenterBudget,
    teams, teamsLoading, teamsError, fetchTeams,
    members, membersLoading, membersError, selectedTeam, fetchMembers,
    fetchAllBudgets, resolveOrgMembers, retryFailedOrgResolution, orgResolvingCcIds, orgResolveFailedCcIds,
    budgetFetchError,
    tier, onNavigateToTab, onNavigateToImport,
    budgetCapEnabled, maxAffordableULB, maxAffordablePUB,
    stepsExpandedSignal,
  }), [
    credentials, apiFetch, budgetMeta, setBudgetMeta,
    recommendations, universalULB, powerUsers, powerUserBudget,
    enterpriseBufferPercent, effectiveExcludeCostCenterUsage,
    totalUsers, regularUsers, reservoirValue, isReservoirSufficient,
    maxSpendBeyondReservoir, recommendedEnterpriseBudget, recommendedCostCenterBudget,
    maxPowerConsumption, maxTotalConsumption, maxRegularConsumption, powerUserShareOfConsumption,
    liveEntBudget, liveUlb, ulbId, ulbFetched,
    liveUserBudgets,
    powerCcId, powerCc,
    sharedCostCenters, setSharedCostCenters, hasCostCenters,
    entBudgetConstraint, ccBudgetConstraint, effectiveEntBudgetMin,
    forecast, primaryEnterpriseBudget, primaryCostCenterBudget,
    teams, teamsLoading, teamsError, fetchTeams,
    members, membersLoading, membersError, selectedTeam, fetchMembers,
    fetchAllBudgets, resolveOrgMembers, retryFailedOrgResolution, orgResolvingCcIds, orgResolveFailedCcIds,
    budgetFetchError,
    tier, onNavigateToTab, onNavigateToImport,
    budgetCapEnabled, maxAffordableULB, maxAffordablePUB,
    stepsExpandedSignal,
  ])

  return (
    <TierPlannerContext.Provider value={ctxValue}>
    <div className="space-y-6 sm:min-w-[700px]">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Tier Planner</h2>
          <p className="text-muted-foreground mt-2">
            Model budget controls for a power user group and base user group, check constraints across all cost centers, and apply settings via the GitHub API
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleCopyLink}
          className="flex-shrink-0 gap-2"
        >
          {copied ? <Check size={16} weight="bold" className="text-success" /> : <Link size={16} weight="bold" />}
          {copied ? 'Copied!' : 'Copy Link'}
        </Button>
      </div>

      {!credentials && (
        <button
          onClick={onNavigateToImport}
          className="w-full flex items-center gap-3 rounded-lg border border-accent/30 bg-accent/5 px-4 py-3 text-left hover:bg-accent/10 transition-colors group"
        >
          <CloudArrowDown size={20} weight="duotone" className="text-accent flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium">Connect your Enterprise</p>
            <p className="text-xs text-muted-foreground">Import live budgets to view, edit, and apply changes directly from this planner</p>
          </div>
          <ArrowSquareOut size={16} weight="duotone" className="text-muted-foreground group-hover:text-accent flex-shrink-0 transition-colors" />
        </button>
      )}

      {budgetFetchError && (
        <Alert className="border-destructive/40 bg-destructive/5">
          <Warning size={16} weight="fill" className="text-destructive" />
          <AlertDescription className="text-sm flex items-center justify-between gap-2">
            <span>{budgetFetchError}</span>
            <Button variant="outline" size="sm" className="h-7 text-xs gap-1 flex-shrink-0" onClick={() => fetchAllBudgets()}>
              <ArrowsClockwise size={12} weight="duotone" />
              Retry
            </Button>
          </AlertDescription>
        </Alert>
      )}

      <Collapsible open={configOpen} onOpenChange={setConfigOpen}>

      {appliedFromCsv && (
        <Alert className="border-success/40 bg-success/5 mb-4">
          <CheckCircle size={16} weight="fill" className="text-success" />
          <AlertDescription className="text-sm">
            Values imported from consumption analysis.
          </AlertDescription>
        </Alert>
      )}

      {!appliedFromCsv && onNavigateToTab && (
        <button
          onClick={() => onNavigateToTab('budget-planner')}
          className="w-full flex items-center gap-3 rounded-lg border border-warning/30 bg-warning/5 px-4 py-3 mb-4 text-left hover:bg-warning/10 transition-colors group"
        >
          <FileArrowUp size={20} weight="duotone" className="text-warning flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium">Import billing CSV for recommendations</p>
            <p className="text-xs text-muted-foreground">Values below are set to included credit minimums. Upload your usage CSV in the Budget Planner tab to get data-driven ULB and power user recommendations.</p>
          </div>
          <ArrowSquareOut size={16} weight="duotone" className="text-muted-foreground group-hover:text-warning flex-shrink-0 transition-colors" />
        </button>
      )}

      <Card className="border-2 border-primary/20">
        <CollapsibleTrigger asChild>
        <CardHeader className="cursor-pointer select-none hover:bg-muted/40 transition-colors rounded-t-lg">
          <CardTitle className="flex items-center gap-2 text-base">
            <Calculator size={20} weight="duotone" className="text-primary" />
            Configuration
            {credentials && seatData && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <a
                    href={licensingUrl(credentials.base, credentials.ent)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center text-muted-foreground hover:text-primary transition-colors"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Info size={14} weight="fill" />
                  </a>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-64 text-xs">
                  <p>To purchase or manage licenses, visit your <span className="font-medium">enterprise licensing page</span></p>
                </TooltipContent>
              </Tooltip>
            )}
            <span className="ml-auto flex items-center gap-1 text-xs text-muted-foreground font-normal">
              {configOpen ? 'Collapse' : 'Expand'}
              {configOpen ? <CaretUp size={14} /> : <CaretDown size={14} />}
            </span>
          </CardTitle>
          {configOpen && (
          <CardDescription>
            {appliedFromCsv
              ? 'Pre-filled from your consumption analysis. Edit any value for modeling'
              : credentials && seatData
                ? 'Live license counts from your enterprise. Edit any value for modeling'
                : 'Enter your Copilot license details and budget parameters'
            }
          </CardDescription>
          )}
        </CardHeader>
        </CollapsibleTrigger>
        {!configOpen && (
          <CardContent className="pt-0 pb-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-md bg-muted px-2.5 py-1 text-xs">
                <span className="text-muted-foreground">Licenses</span>
                <span className="font-semibold text-foreground">{cbLicenses} CB</span>
                <span className="text-muted-foreground/60">+</span>
                <span className="font-semibold text-foreground">{ceLicenses} CE</span>
              </span>

              <span className="inline-flex items-center gap-1.5 rounded-md bg-muted px-2.5 py-1 text-xs">
                <span className="text-muted-foreground">ULB</span>
                <span className="font-semibold text-foreground">${universalULB}</span>
              </span>

              <span className="inline-flex items-center gap-1.5 rounded-md bg-muted px-2.5 py-1 text-xs">
                <span className="text-muted-foreground">Power users</span>
                <span className="font-semibold text-foreground">{powerUsers}</span>
                <span className="text-muted-foreground">@</span>
                <span className="font-semibold text-foreground">${powerUserBudget}</span>
              </span>

              <span className="inline-flex items-center gap-1.5 rounded-md bg-muted px-2.5 py-1 text-xs">
                <span className="text-muted-foreground">Buffer</span>
                <span className="font-semibold text-foreground">{enterpriseBufferPercent}%</span>
              </span>

              {promotionalPricing && (
                <Badge variant="outline" className="text-xs gap-1 py-0.5 px-2 border-primary/40 text-primary">
                  <Tag size={12} weight="fill" />
                  Promo
                </Badge>
              )}
              {midCycleEnabled && (
                <Badge variant="outline" className="text-xs gap-1 py-0.5 px-2 border-accent/40 text-accent">
                  <HourglassMedium size={12} weight="fill" />
                  Budget Cycle Adj.
                </Badge>
              )}
              {budgetCapEnabled && (
                <Badge variant="outline" className="text-xs gap-1 py-0.5 px-2 border-accent/40 text-accent">
                  <Target size={12} weight="fill" />
                  Cap ${enterpriseBudgetCap.toLocaleString()}
                </Badge>
              )}
            </div>
          </CardContent>
        )}
        <CollapsibleContent>
        <CardContent>
          <div className="grid lg:grid-cols-2 gap-6">
            {/* Left column: License Mix */}
            <div className="space-y-6 lg:border-r lg:pr-6">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
                <Users size={14} weight="duotone" />
                License Mix
              </h3>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="cb-licenses" className="flex items-center gap-2">
                    <Users size={16} weight="duotone" />
                    Total Copilot Business Licenses ($19/mo)
                    {credentials && seatData && (
                      cbLicenses === seatData.cbSeats ? (
                        <Badge variant="outline" className="text-xs border-success/50 text-success gap-1 py-0">
                          <span className="relative flex h-1.5 w-1.5">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75" />
                            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-success" />
                          </span>
                          Live
                        </Badge>
                      ) : (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-5 gap-1 px-1.5 text-[11px] hover:text-destructive hover:border-destructive/50"
                              onClick={() => { setCbManuallySet(false); setCbLicenses(seatData.cbSeats) }}
                            >
                              <Trash size={10} weight="duotone" />
                              Discard
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent side="bottom" className="max-w-56 text-xs">
                            <p>Reset to live count. To purchase or remove licenses, manage them in GitHub Enterprise</p>
                          </TooltipContent>
                        </Tooltip>
                      )
                    )}
                  </Label>
                  <NumericInput
                    id="cb-licenses"
                    min={0}
                    value={cbLicenses}
                    onValueChange={handleCbLicensesChange}
                    commas
                    className="text-lg mono"
                  />
                  <p className="text-sm text-muted-foreground">$19/mo · each license adds {cbAICsPerLicense.toLocaleString()} AICs to the shared pool</p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="ce-licenses" className="flex items-center gap-2">
                    <Lightning size={16} weight="duotone" />
                    Total Copilot Enterprise Licenses ($39/mo)
                    {credentials && seatData && (
                      ceLicenses === seatData.ceSeats ? (
                        <Badge variant="outline" className="text-xs border-success/50 text-success gap-1 py-0">
                          <span className="relative flex h-1.5 w-1.5">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75" />
                            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-success" />
                          </span>
                          Live
                        </Badge>
                      ) : (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-5 gap-1 px-1.5 text-[11px] hover:text-destructive hover:border-destructive/50"
                              onClick={() => { setCeManuallySet(false); setCeLicenses(seatData.ceSeats) }}
                            >
                              <Trash size={10} weight="duotone" />
                              Discard
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent side="bottom" className="max-w-56 text-xs">
                            <p>Reset to live count. To purchase or remove licenses, manage them in GitHub Enterprise</p>
                          </TooltipContent>
                        </Tooltip>
                      )
                    )}
                  </Label>
                  <NumericInput
                    id="ce-licenses"
                    min={0}
                    value={ceLicenses}
                    onValueChange={handleCeLicensesChange}
                    commas
                    className="text-lg mono"
                  />
                  <p className="text-sm text-muted-foreground">$39/mo · each license adds {ceAICsPerLicense.toLocaleString()} AICs to the shared pool</p>
                </div>
                {credentials && seatData && (
                  <a
                    href={licensingUrl(credentials.base, credentials.ent)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 transition-colors mt-1"
                  >
                    Manage licenses on GitHub
                    <ArrowSquareOut size={12} weight="duotone" />
                  </a>
                )}
              </div>
              {/* Budget Lock */}
              <div className={`rounded-lg border p-3 space-y-3 ${budgetCapEnabled ? 'border-accent bg-accent/5' : 'border-border bg-muted/40'}`}>
                <div className="flex items-start justify-between gap-2">
                  <Label htmlFor="budget-cap-toggle" className="flex items-start gap-2 cursor-pointer flex-1 min-w-0">
                    <Target size={16} weight="duotone" className={`mt-0.5 ${budgetCapEnabled ? 'text-accent' : 'text-muted-foreground'}`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium leading-none">Budget Lock</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {hasCostCenters
                          ? 'Lock enterprise (and power user cost center) budgets to model from fixed caps'
                          : 'Lock enterprise budget to model from a fixed cap'}
                      </p>
                    </div>
                  </Label>
                  <Switch
                    id="budget-cap-toggle"
                    checked={budgetCapEnabled}
                    onCheckedChange={setBudgetCapEnabled}
                  />
                </div>
                {budgetCapEnabled && (
                  <div className="space-y-3 pt-1">
                    <p className="text-xs text-muted-foreground">
                      Set caps and see the maximum affordable per-user limits below
                    </p>
                    <div className="space-y-2">
                      <Label htmlFor="enterprise-budget-cap" className="text-xs text-muted-foreground">
                        Enterprise Budget Cap
                      </Label>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">$</span>
                        <NumericInput
                          id="enterprise-budget-cap"
                          min={0}
                          value={enterpriseBudgetCap}
                          onValueChange={setEnterpriseBudgetCap}
                          commas
                          className="text-lg mono"
                        />
                      </div>
                    </div>
                    {effectiveExcludeCostCenterUsage && hasCostCenters && (
                      <div className="space-y-2">
                        <Label htmlFor="cc-budget-cap" className="text-xs text-muted-foreground">
                          Cost center budget cap (power users)
                        </Label>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium">$</span>
                          <NumericInput
                            id="cc-budget-cap"
                            min={0}
                            value={ccBudgetCap}
                            onValueChange={setCcBudgetCap}
                            commas
                            className="text-lg mono"
                          />
                        </div>
                        <p className="text-xs text-muted-foreground">
                          With cost center exclusion on, power users are capped independently by their CC budget
                        </p>
                      </div>
                    )}
                    <div className="rounded-md bg-muted/40 px-3 py-1.5">
                      <p className="text-xs mono text-muted-foreground">
                        ${enterpriseBudgetCap.toLocaleString()} cap · ${totalMonthlyCost.toLocaleString()} seats · <span className="font-medium text-foreground">${Math.max(0, enterpriseBudgetCap - totalMonthlyCost).toLocaleString()}</span> available for consumption
                      </p>
                    </div>
                  </div>
                )}
              </div>
              <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
                <CollapsibleTrigger asChild>
                  <button
                    type="button"
                    className="w-full flex items-center justify-between rounded-lg border border-border bg-muted/40 px-3 py-2.5 hover:bg-muted/60 transition-colors"
                  >
                    <span className="min-w-0 text-left">
                      <span className="block text-sm font-medium text-foreground">Advanced settings</span>
                      <span className="mt-1 flex flex-wrap items-center gap-1.5">
                        <Badge
                          variant="outline"
                          className={`text-[10px] py-0 px-1.5 ${promotionalPricing ? 'border-success/50 bg-success/10 text-success' : 'border-border bg-muted text-muted-foreground'}`}
                        >
                          Promo {promotionalPricing ? 'On' : 'Off'}
                        </Badge>
                        <Badge
                          variant="outline"
                          className={`text-[10px] py-0 px-1.5 ${midCycleEnabled ? 'border-success/50 bg-success/10 text-success' : 'border-border bg-muted text-muted-foreground'}`}
                        >
                          Budget Cycle Adj. {midCycleEnabled ? 'On' : 'Off'}
                        </Badge>
                      </span>
                    </span>
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      {advancedOpen ? 'Hide' : 'Show'}
                      {advancedOpen ? <CaretUp size={14} /> : <CaretDown size={14} />}
                    </span>
                  </button>
                </CollapsibleTrigger>
                <CollapsibleContent className="space-y-3 pt-3">
                  {/* Pricing period toggle */}
                  <div className={`flex items-center justify-between rounded-lg border p-3 ${promotionalPricing ? 'border-primary bg-primary/10' : 'border-border bg-muted/40'}`}>
                    <div className="flex items-center gap-2">
                      <Tag size={16} weight="duotone" className={promotionalPricing ? 'text-primary' : 'text-muted-foreground'} />
                      <div>
                        <p className="text-sm font-medium leading-none">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <a
                                href="https://github.blog/news-insights/company-news/github-copilot-is-moving-to-usage-based-billing/#:~:text=their%20annual%20plan.-,What%20this%20means%20for%20businesses%20and%20enterprises,-Copilot%20Business%20and"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="underline-offset-2 hover:underline"
                              >
                                {promotionalPricing ? 'Promotional Pricing' : 'Standard Pricing'}
                              </a>
                            </TooltipTrigger>
                            <TooltipContent side="bottom" className="max-w-56 text-xs">
                              <p>Promotional pricing runs through August 2026. Read the announcement</p>
                            </TooltipContent>
                          </Tooltip>
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {promotionalPricing
                            ? 'CB = $30 AIC value (3,000 AICs) · CE = $70 AIC value (7,000 AICs) · ends Aug 2026'
                            : 'CB = $19 AIC value (1,900 AICs) · CE = $39 AIC value (3,900 AICs)'}
                        </p>
                      </div>
                    </div>
                    <Switch
                      checked={promotionalPricing}
                      onCheckedChange={handlePromotionalPricingChange}
                    />
                  </div>
                  {/* Adjust for billing cycle */}
                  <div className={`rounded-lg border p-3 ${midCycleEnabled ? 'border-accent bg-accent/10' : 'border-border bg-muted/40'}`}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <HourglassMedium size={16} weight="duotone" className={`mt-0.5 ${midCycleEnabled ? 'text-accent' : 'text-muted-foreground'}`} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium leading-none flex items-center gap-1">
                            Adjust for Billing Cycle
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <button type="button" aria-label="Billing cycle adjustment info" className="inline-flex" onClick={e => e.stopPropagation()}>
                                  <Info size={13} weight="duotone" className="text-muted-foreground cursor-help flex-shrink-0" />
                                </button>
                              </TooltipTrigger>
                              <TooltipContent side="top" className="max-w-xs">
                                Accounts for included credits already consumed this cycle. Reduces the effective remaining pool, which increases budget recommendations to cover the higher likelihood of metered charges. Use when setting or adjusting budgets mid-cycle.
                              </TooltipContent>
                            </Tooltip>
                          </p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {midCycleEnabled
                              ? 'Adjusting recommendations for pool credits already consumed this billing cycle'
                              : 'Account for pool credits already consumed when creating or adjusting budgets during a billing cycle'}
                          </p>
                        </div>
                      </div>
                      <Switch
                        checked={midCycleEnabled}
                        onCheckedChange={handleMidCycleChange}
                      />
                    </div>
                    {midCycleEnabled && (
                          <div className="mt-3 space-y-2">
                            <Label htmlFor="mid-cycle-consumed" className="text-xs text-muted-foreground flex items-center gap-1">
                              Pool consumed this cycle ($)
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <button type="button" aria-label="Pool consumed info" className="inline-flex" onClick={e => e.stopPropagation()}>
                                    <Info size={11} weight="duotone" className="text-muted-foreground cursor-help flex-shrink-0" />
                                  </button>
                                </TooltipTrigger>
                                <TooltipContent side="top" className="max-w-xs">
                                  Total consumption from the billing API this cycle, including pool draws and any metered charges. Pool credits are consumed first, so this reliably approximates pool usage. If it exceeds the pool, remaining pool is treated as $0.
                                </TooltipContent>
                              </Tooltip>
                            </Label>
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium">$</span>
                              <NumericInput
                                id="mid-cycle-consumed"
                                min={0}
                                value={midCyclePoolConsumed}
                                onValueChange={setMidCyclePoolConsumed}
                                allowFloat
                                commas
                                className="text-lg mono"
                              />
                              {midCycleAutoFetched && midCyclePoolConsumed > 0 && !isDemo && (
                                <Badge variant="outline" className="text-xs gap-1 py-0 border-success/50 text-success">
                                  <span className="relative flex h-1.5 w-1.5">
                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 bg-success" />
                                    <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-success" />
                                  </span>
                                  Live
                                </Badge>
                              )}
                            </div>
                            {midCyclePoolConsumed > 0 && (
                              <p className="text-xs text-muted-foreground">
                                Remaining pool: <span className="font-medium text-accent">${Math.max(0, reservoirValue - midCyclePoolConsumed).toLocaleString()}</span> of ${reservoirValue.toLocaleString()} ({Math.round(Math.max(0, (1 - midCyclePoolConsumed / reservoirValue)) * 100)}% remaining)
                              </p>
                            )}
                            {isDemo && midCyclePoolConsumed > 0 && (() => {
                              const now = new Date()
                              return (
                                <p className="text-[11px] text-accent/70 italic">
                                  Simulated: day {now.getDate()} of {new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()} ({Math.round((now.getDate() / new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()) * 100)}% of cycle elapsed)
                                </p>
                              )
                            })()}
                            {midCyclePoolConsumed > 0 && onNavigateToTab && (
                              <div className="flex items-start gap-2 rounded-md border border-primary/30 bg-primary/5 px-3 py-2 mt-1">
                                <Info size={13} weight="fill" className="text-primary flex-shrink-0 mt-0.5" />
                                <p className="text-[11px] text-muted-foreground">
                                  Remember to reset budgets at the start of your next billing cycle.{' '}
                                  <button
                                    onClick={() => onNavigateToTab('api-tools')}
                                    className="text-primary underline underline-offset-2 font-medium hover:text-primary/80 transition-colors"
                                  >
                                    Generate a Cycle-Reset script →
                                  </button>
                                </p>
                              </div>
                            )}
                          </div>
                        )}
                  </div>
                </CollapsibleContent>
              </Collapsible>
            </div>

            {/* Right column: Budget Controls */}
            <div className="space-y-6">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
                <Stack size={14} weight="duotone" />
                Budget Controls
              </h3>

              <div className="space-y-2">
                <Label htmlFor="universal-ulb" className="flex items-center gap-2">
                  <User size={16} weight="duotone" />
                  Universal user-level budget (all users)
                  {credentials && liveUlb !== null && (
                    universalULB === liveUlb ? (
                      <Badge variant="outline" className="text-xs border-success/50 text-success gap-1 py-0">
                        <span className="relative flex h-1.5 w-1.5">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75" />
                          <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-success" />
                        </span>
                        Live
                      </Badge>
                    ) : (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-5 gap-1 px-1.5 text-[11px] hover:text-destructive hover:border-destructive/50"
                            onClick={() => handleUniversalULBChange(liveUlb)}
                          >
                            <Trash size={10} weight="duotone" />
                            Discard
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent side="bottom" className="max-w-56 text-xs">
                          <p>Reset to ${liveUlb.toLocaleString()} (live value from GitHub)</p>
                        </TooltipContent>
                      </Tooltip>
                    )
                  )}
                </Label>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">$</span>
                  <NumericInput
                    id="universal-ulb"
                    min={0}
                    emptyValue={initialUniversalULB}
                    step="1"
                    value={universalULB}
                    onValueChange={handleUniversalULBChange}
                    allowFloat
                    commas
                    className="text-lg mono"
                  />
                </div>
                <p className="text-sm text-muted-foreground">
                  {appliedFromCsv
                    ? 'Set from your consumption analysis (based on regular user patterns + growth buffer)'
                    : 'Per-user consumption limit (set to included credit value). Import your billing CSV in the Budget Planner tab for a data-driven recommendation.'
                  }
                </p>
                {universalULB > 0 && universalULB < 19 && (
                  <p className="text-sm text-destructive font-medium">
                    ⚠ A budget below $19 will seriously limit usage. Users may be throttled before meaningful work is possible.
                  </p>
                )}
                {maxAffordableULB !== null && (
                  <p className={`text-sm font-medium ${ulbExceedsCap ? 'text-warning' : 'text-success'}`}>
                    {isFinite(maxAffordableULB)
                      ? ulbExceedsCap
                        ? `⚠ Over budget. Set to $${Math.floor(maxAffordableULB).toLocaleString()} or lower to fit your cap`
                        : `✓ Within budget. You can set up to $${Math.floor(maxAffordableULB).toLocaleString()}/user`
                      : '✓ Pool covers all regular user consumption. No budget cap constraint'}
                  </p>
                )}
                {budgetLockTradeoff?.binding === 'ulb' && budgetLockTradeoff.overshoot > 0 && (
                  <p className="text-xs text-muted-foreground">
                    Tip: Setting ULB to ${Math.floor(maxAffordableULB!).toLocaleString()} would free ~${budgetLockTradeoff.freedPerUser.toLocaleString()}/user for your {powerUsers} power users
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="power-users" className="flex items-center gap-2">
                  <Lightning size={16} weight="fill" className="text-accent" />
                  # of Power Users
                </Label>
                <NumericInput
                  id="power-users"
                  min={0}
                  value={powerUsers}
                  onValueChange={handlePowerUsersChange}
                  commas
                  className="text-lg mono"
                />
                <p className="text-sm text-muted-foreground">
                  {appliedFromCsv
                    ? 'Set from your consumption analysis (users above your chosen cutoff)'
                    : 'Import your billing CSV to identify power users from actual consumption data. Set to 0 until you have evidence.'
                  }
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="power-budget" className="flex items-center gap-2">
                  <CurrencyDollar size={16} weight="duotone" />
                  Individual User-Level Budget (for power users)
                </Label>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">$</span>
                  <NumericInput
                    id="power-budget"
                    min={0}
                    step="1"
                    value={powerUserBudget}
                    onValueChange={handlePowerUserBudgetChange}
                    allowFloat
                    commas
                    className="text-lg mono"
                  />
                </div>
                <p className="text-sm text-muted-foreground">
                  {appliedFromCsv
                    ? 'Set from your consumption analysis (median of power users + growth buffer)'
                    : 'Individual limit for power users (set to CE included credit value). Import your billing CSV to size this based on actual consumption.'
                  }
                </p>
                {powerUserBudget > 0 && powerUserBudget < 19 && (
                  <p className="text-sm text-destructive font-medium">
                    ⚠ A budget below $19 will seriously limit usage. These power users may be throttled before meaningful work is possible.
                  </p>
                )}
                {maxAffordablePUB !== null && (
                  <p className={`text-sm font-medium ${pubExceedsCap ? 'text-warning' : 'text-success'}`}>
                    {isFinite(maxAffordablePUB)
                      ? pubExceedsCap
                        ? `⚠ Over budget. Set to $${Math.floor(maxAffordablePUB).toLocaleString()} or lower to fit your cap`
                        : `✓ Within budget. You can set up to $${Math.floor(maxAffordablePUB).toLocaleString()}/user`
                      : '✓ Pool covers all power user consumption. No budget cap constraint'}
                  </p>
                )}
                {budgetLockTradeoff?.binding === 'pub' && budgetLockTradeoff.overshoot > 0 && (
                  <p className="text-xs text-muted-foreground">
                    Tip: Setting to ${Math.floor(maxAffordablePUB!).toLocaleString()} would free ~${budgetLockTradeoff.freedPerUser.toLocaleString()}/user for your {regularUsers} regular users
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="enterprise-buffer" className="flex items-center gap-2">
                  <Buildings size={16} weight="duotone" />
                  Enterprise Budget Buffer
                </Label>
                <div className="flex items-center gap-2">
                  <NumericInput
                    id="enterprise-buffer"
                    min={0}
                    max={100}
                    step="1"
                    value={enterpriseBufferPercent}
                    onValueChange={setEnterpriseBufferPercent}
                    className="text-lg mono"
                  />
                  <span className="text-sm font-medium">%</span>
                </div>
                <p className="text-sm text-muted-foreground">
                  Additional headroom above calculated spend. Increase for additional forecasted usage
                </p>
              </div>
            </div>
          </div>

          <div className="flex justify-end mt-6">
            <Button
              variant="outline"
              size="sm"
              className="gap-2 text-muted-foreground hover:text-foreground"
              onClick={() => setConfigOpen(false)}
            >
              <Check size={14} weight="bold" />
              Done
            </Button>
          </div>
        </CardContent>
        </CollapsibleContent>
      </Card>
      </Collapsible>

      <div className="grid lg:grid-cols-2 gap-6">
      {/* Monthly Cost Summary */}
      <Card className={`border-2 ${tierCardClass}`}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <CurrencyDollar size={20} weight="duotone" className={tierAccent} />
              Monthly Cost Summary
              {tier === 'soft' && (
                <Badge variant="outline" className="text-[10px] border-warning/50 text-warning ml-1">Alert only</Badge>
              )}
              {tier === 'blind' && (
                <Badge variant="outline" className="text-[10px] border-destructive/50 text-destructive ml-1">Uncapped</Badge>
              )}
            </CardTitle>
            <CardDescription>
              Total projected monthly spend including licenses and AI Credit charges
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Max AIC Pool — primary focus */}
              <div className={`p-6 rounded-lg bg-card border-2 ${tierBorder} text-center`}>
                <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground mb-2">
                  {tier === 'hard' ? 'Max metered AIC spend' : tier === 'soft' ? 'AIC alert threshold' : tier === 'blind' ? 'AIC spend (uncapped)' : 'Suggested AIC cap'}
                  <FormulaTooltip
                    title="Max metered AIC spend"
                    side="bottom"
                    steps={[
                      {
                        label: tier === 'hard'
                          ? 'Max metered AI Credit charges (capped by budgets)'
                          : tier === 'soft'
                            ? 'Metered AI Credit charges (alert threshold only, not enforced)'
                            : tier === 'blind'
                              ? 'Metered AI Credit charges (no budget controls active)'
                              : 'Metered AI Credit charges (no enterprise budget set yet)',
                        formula: effectiveExcludeCostCenterUsage && hasCostCenters
                          ? `Enterprise $${displayEntBudget.toLocaleString()} + CC $${displayCcBudget.toLocaleString()}${otherCcBudgetTotal > 0 ? ` + Other CCs $${otherCcBudgetTotal.toLocaleString()}` : ''}`
                          : `Enterprise budget $${displayEntBudget.toLocaleString()} (covers all usage)`,
                        value: `$${displayPostPoolCharges.toLocaleString()}/mo`,
                      },
                      ...(entBudgetIsBinding ? [{
                        label: 'Recommended enterprise budget',
                        formula: `$${recommendedEnterpriseBudget.toLocaleString()}/mo (actual: $${effectiveEntBudget.toLocaleString()}/mo)`,
                        value: `$${(recommendedEnterpriseBudget - effectiveEntBudget).toLocaleString()} below`,
                      }] : []),
                    ]}
                    result={`$${displayPostPoolCharges.toLocaleString()}/mo`}
                  />
                </div>
                <div className={`text-4xl font-bold mono ${tierAmountClass}`}>${displayPostPoolCharges.toLocaleString()}<span className="text-xl font-normal text-muted-foreground">/mo</span></div>
                <div className="text-xs text-muted-foreground mt-2">
                  {tier === 'hard'
                    ? (entBudgetIsBinding ? 'Enterprise budget is the binding constraint' : 'Capped by budgets')
                    : tier === 'soft'
                      ? 'Alert threshold only. Usage continues beyond this'
                      : tier === 'blind'
                        ? 'Uncapped · no spending controls active'
                        : 'Suggested cap · set an enterprise budget to enforce'}
                </div>
                {forecast !== null && (
                  <div className="mt-2 text-[11px] text-muted-foreground">
                    <span className="font-medium">Forecast (CSV pattern): ${forecastPrimaryEnt.toLocaleString()}/mo</span>
                    {forecast.isFlooredToBaseline && (
                      <span className="block mt-0.5 italic">
                        Floored to last month's actual additional spend. Enforced ULBs could reduce to ~${Math.ceil(forecast.forecastWithCaps * bufferMul).toLocaleString()}/mo.
                      </span>
                    )}
                  </div>
                )}
                {tier !== null && entBudgetIsBinding && (
                  <div className="mt-2 text-[11px] text-warning font-medium">
                    Suggested: ${primaryEnterpriseBudget.toLocaleString()}/mo
                  </div>
                )}
                {promotionalPricing && promoBonusValue > 0 && (
                  <div className="mt-3 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/30 inline-flex items-center gap-1.5">
                    <Tag size={12} weight="fill" className="text-primary" />
                    <span className="text-xs font-medium text-primary">
                      ${promoBonusValue.toLocaleString()} extra AI Credits (promo)
                    </span>
                  </div>
                )}
                {budgetCapEnabled && (
                  <div className={`mt-3 px-3 py-1.5 rounded-full inline-flex items-center gap-1.5 ${ulbExceedsCap || pubExceedsCap ? 'bg-warning/10 border border-warning/30' : 'bg-success/10 border border-success/30'}`}>
                    <Target size={12} weight="fill" className={ulbExceedsCap || pubExceedsCap ? 'text-warning' : 'text-success'} />
                    <span className={`text-xs font-medium ${ulbExceedsCap || pubExceedsCap ? 'text-warning' : 'text-success'}`}>
                      {ulbExceedsCap || pubExceedsCap
                        ? 'Current limits exceed budget cap'
                        : `Within $${enterpriseBudgetCap.toLocaleString()} budget cap`}
                    </span>
                  </div>
                )}
              </div>
              {/* Monthly License Spend — sunk cost */}
              <div className="p-6 rounded-lg bg-card border text-center">
                <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground mb-2">
                  Monthly License Spend
                  <FormulaTooltip
                    title="Monthly License Spend"
                    side="bottom"
                    steps={[
                      {
                        label: 'License costs',
                        formula: `${cbLicenses} CB × $19 + ${ceLicenses} CE × $39`,
                        value: `$${totalMonthlyCost.toLocaleString()}/mo`,
                      },
                    ]}
                    result={`$${totalMonthlyCost.toLocaleString()}/mo`}
                  />
                </div>
                <div className="text-4xl font-bold mono text-muted-foreground">${totalMonthlyCost.toLocaleString()}<span className="text-xl font-normal">/mo</span></div>
                <div className="text-xs text-muted-foreground mt-2">
                  Copilot Business + Enterprise Licenses
                </div>
              </div>
            </div>
            <div className="text-center text-xs text-muted-foreground">
              Combined total: <span className="mono font-medium">${(totalMonthlyCost + displayPostPoolCharges).toLocaleString()}</span> /month
            </div>

            {tier === 'soft' && (
              <Alert className="border-warning/50 bg-warning/10">
                <Warning size={16} weight="fill" className="text-warning" />
                <AlertDescription className="text-xs">
                  <strong>Alerts are on, but usage is not capped.</strong> Enterprise billing managers are notified when spend reaches the budget amount, but charges continue beyond it. Review alert recipients in your{' '}
                  <a href={credentials && budgetMeta.entBudgetId ? budgetEditUrl(credentials.base, credentials.ent, budgetMeta.entBudgetId) : '#'} target="_blank" rel="noopener noreferrer" className="underline font-medium">enterprise budget</a>. Consider enabling <em>Stop usage</em> on the Enterprise Budget in <span className="font-medium">Budget Planner</span> to enforce a hard cap.
                </AlertDescription>
              </Alert>
            )}

            {tier === 'blind' && (
              <Alert className="border-destructive/50 bg-destructive/10">
                <Warning size={16} weight="fill" className="text-destructive" />
                <AlertDescription className="text-xs">
                  <strong>No spending controls active.</strong> No notifications or enterprise cap. Universal ULB (if set) is the only backstop, capping each user's total spend (pool + metered). At minimum, enable budget alerts in your{' '}
                  <a href={credentials && budgetMeta.entBudgetId ? budgetEditUrl(credentials.base, credentials.ent, budgetMeta.entBudgetId) : '#'} target="_blank" rel="noopener noreferrer" className="underline font-medium">enterprise billing settings</a> so you are notified when spend reaches the threshold.
                </AlertDescription>
              </Alert>
            )}

            {/* Constraint alerts — always visible */}
            {(entBudgetIsBinding || ccBudgetIsBinding) && (
              <Alert className="border-warning/50 bg-warning/10">
                <AlertDescription className="text-xs space-y-1.5">
                  {entBudgetIsBinding && (
                    <p>
                      ⚠️ <strong>Enterprise budget (${ effectiveEntBudget.toLocaleString()}) is the binding constraint.</strong>{' '}
                      {effectiveExcludeCostCenterUsage
                        ? `It caps the ${regularUsers} non-cost-center users at ${Math.round(entCapacityPercent)}% of their intended consumption. Suggested: $${primaryEnterpriseBudget.toLocaleString()}`
                        : `It caps all ${totalUsers} users at ${Math.round(entCapacityPercent)}% of their intended consumption. Suggested: $${primaryEnterpriseBudget.toLocaleString()}`
                      }
                    </p>
                  )}
                  {ccBudgetIsBinding && (
                    <p>
                      ⚠️ <strong>Cost center budget (${effectiveCcBudget.toLocaleString()}) is capping power users.</strong>{' '}
                      {effectiveExcludeCostCenterUsage
                        ? `It independently limits the ${powerUsers} power users to ${Math.round(ccCapacityPercent)}% of their $${powerUserBudget} individual budget. Suggested: $${primaryCostCenterBudget.toLocaleString()}`
                        : `As a sub-limit within the enterprise umbrella, it caps the ${powerUsers} power users to ${Math.round(ccCapacityPercent)}% of their $${powerUserBudget} individual budget. Suggested: $${primaryCostCenterBudget.toLocaleString()}`
                      }
                    </p>
                  )}
                </AlertDescription>
              </Alert>
            )}

            <div className="space-y-3 pt-2">
                  <div className="flex justify-between items-center p-3 rounded bg-muted">
                    <span className="text-base font-semibold">Licensing</span>
                    <span className="mono text-base font-semibold">${totalMonthlyCost.toLocaleString()}</span>
                  </div>
                  <div className="text-sm text-muted-foreground px-3 space-y-1">
                    <div className="flex justify-between">
                      <span>{cbLicenses} Copilot Business × $19</span>
                      <span className="mono">${cbCost.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>{ceLicenses} Copilot Enterprise × $39</span>
                      <span className="mono">${ceCost.toLocaleString()}</span>
                    </div>
                  </div>

                  <div className="flex justify-between items-center p-3 rounded bg-muted">
                    <div className="flex items-center gap-2 text-base font-semibold">
                      Max metered AIC charges
                      <FormulaTooltip
                        title="Max metered AIC charges"
                        steps={[
                          {
                            label: 'Max possible consumption by regular users',
                            formula: `${regularUsers} users × $${universalULB} ULB`,
                            value: `$${maxRegularConsumption.toLocaleString()}`,
                          },
                          {
                            label: 'Max possible consumption by power users',
                            formula: `${powerUsers} users × $${powerUserBudget} budget`,
                            value: `$${maxPowerConsumption.toLocaleString()}`,
                          },
                          {
                            label: 'Metered spend beyond the pre-paid pool',
                            formula: `$${maxTotalConsumption.toLocaleString()} total consumption − $${reservoirValue.toLocaleString()} pool`,
                            value: maxSpendBeyondReservoir === 0 ? 'None (pool covers all usage)' : `$${maxSpendBeyondReservoir.toLocaleString()}`,
                          },
                          {
                            label: tier !== null ? 'Enterprise budget (actual on GitHub)' : `Enterprise budget (+ ${enterpriseBufferPercent}% buffer, rounded up)`,
                            formula: tier !== null
                              ? `$${effectiveEntBudget.toLocaleString()}${entBudgetIsBinding ? ` (suggested: $${primaryEnterpriseBudget.toLocaleString()})` : ''}`
                              : `$${maxSpendBeyondReservoir.toLocaleString()} + ${enterpriseBufferPercent}% buffer, rounded up`,
                            value: `$${displayEntBudget.toLocaleString()}`,
                          },
                        ]}
                        result={`$${displayPostPoolCharges.toLocaleString()}`}
                      />
                    </div>
                    <span className="mono text-base font-semibold">${displayPostPoolCharges.toLocaleString()}</span>
                  </div>
                  <div className="text-sm text-muted-foreground px-3 space-y-1">
                    <div className="flex justify-between items-center">
                      <span className="flex items-center gap-1">Enterprise budget{entBudgetIsBinding && ' ⚠️'}</span>
                      <span className={`mono ${entBudgetIsBinding ? 'text-warning font-medium' : ''}`}>
                        ${displayEntBudget.toLocaleString()}
                        {entBudgetIsBinding && <span className="text-muted-foreground font-normal"> (suggested: ${primaryEnterpriseBudget.toLocaleString()})</span>}
                      </span>
                    </div>
                    {hasCostCenters && (
                      <div className="flex justify-between items-center">
                        <span className="flex items-center gap-1">Cost center limit (power users){effectiveExcludeCostCenterUsage ? ' · additive' : ' · included in enterprise'}{ccBudgetIsBinding && ' ⚠️'}</span>
                        <span className={`mono ${ccBudgetIsBinding ? 'text-warning font-medium' : ''}`}>
                          {effectiveExcludeCostCenterUsage ? `+$${displayCcBudget.toLocaleString()}` : `$${displayCcBudget.toLocaleString()}`}
                          {ccBudgetIsBinding && <span className="text-muted-foreground font-normal"> (suggested: ${primaryCostCenterBudget.toLocaleString()})</span>}
                        </span>
                      </div>
                    )}
                    {effectiveExcludeCostCenterUsage && otherCcBudgetTotal > 0 && (
                      <div className="flex justify-between">
                        <span>Other cost centers ({otherCostCenters.length}) · additive</span>
                        <span className="mono">+${otherCcBudgetTotal.toLocaleString()}</span>
                      </div>
                    )}
                    {maxSpendBeyondReservoir === 0 && (
                      <p className="text-success">Pool covers all usage. No metered charges expected</p>
                    )}
                  </div>
                </div>

          </CardContent>
      </Card>

      <Card className="border-2 border-border gap-3">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Stack size={20} weight="duotone" className="text-primary" />
            Budget Visualization
            {credentials && (
              <Badge variant="outline" className="text-xs py-0 border-success/50 text-success gap-1 ml-auto">
                <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
                Live
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <EntitlementPoolDiagram
            showHeader={false}
            totalReservoir={totalReservoir}
            reservoirValue={reservoirValue}
            cbAICs={cbAICs}
            ceAICs={ceAICs}
            universalULB={universalULB}
            powerUserBudget={powerUserBudget}
            regularUsers={regularUsers}
            powerUsers={powerUsers}
            maxRegularConsumption={maxRegularConsumption}
            maxPowerConsumption={maxPowerConsumption}
            maxTotalConsumption={maxTotalConsumption}
            recommendedEnterpriseBudget={recommendedEnterpriseBudget}
            recommendedCostCenterBudget={recommendedCostCenterBudget}
            actualEnterpriseBudget={liveEntBudget}
            actualCostCenterBudget={powerCc ? powerCc.budgetAmount : null}
            excludeCostCenterUsage={effectiveExcludeCostCenterUsage}
            isReservoirSufficient={isReservoirSufficient}
            maxSpendBeyondReservoir={maxSpendBeyondReservoir}
            isConnected={credentials !== null}
            entBudgetIsBinding={entBudgetIsBinding}
            ccBudgetIsBinding={ccBudgetIsBinding}
            otherCcBudgetTotal={otherCcBudgetTotal}
            otherCcCount={otherCostCenters.length}
            hasCostCenters={hasCostCenters}
          />
        </CardContent>
      </Card>
      </div>

      <Card className="border-2 border-success bg-gradient-to-br from-success/8 via-success/3 to-transparent">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ChartBar size={20} weight="duotone" className="text-success" />
            Suggested Actions
            <button
              className="ml-auto flex items-center gap-1 text-xs text-muted-foreground font-normal hover:text-foreground transition-colors"
              onClick={() => setStepsExpandedSignal(prev => prev + 1)}
            >
              {stepsExpandedSignal % 2 === 0 ? 'Expand all' : 'Collapse all'}
              {stepsExpandedSignal % 2 === 0 ? <CaretDown size={14} /> : <CaretUp size={14} />}
            </button>
          </CardTitle>
          <CardDescription>
            Based on your configuration, here's one way to set things up. Adjust to fit your team's needs.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <ErrorBoundary FallbackComponent={StepErrorFallback}>
              <StepEnterpriseBudget stepNumber={1} />
            </ErrorBoundary>
            {hasCostCenters && (
              <ErrorBoundary FallbackComponent={StepErrorFallback}>
                <StepCostCenter stepNumber={2} />
              </ErrorBoundary>
            )}
            <ErrorBoundary FallbackComponent={StepErrorFallback}>
              <StepUniversalULB stepNumber={hasCostCenters ? 3 : 2} />
            </ErrorBoundary>
            <ErrorBoundary FallbackComponent={StepErrorFallback}>
              <StepIndividualBudgets stepNumber={hasCostCenters ? 4 : 3} />
            </ErrorBoundary>
            {hasCostCenters && (
              <ErrorBoundary FallbackComponent={StepErrorFallback}>
                <StepConstraintAnalysis stepNumber={5} />
              </ErrorBoundary>
            )}
            {credentials && (
              <p className="text-xs text-muted-foreground pt-1">
                <Trash size={12} weight="duotone" className="inline mr-1 align-[-2px]" />
                Done? Consider{' '}
                <a
                  href={settingsTokensUrl(credentials.base)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary underline underline-offset-2 hover:text-primary/80 transition-colors"
                >
                  revoking your PAT
                </a>
                {' '}if no longer needed.
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      <KeyTakeaways
        reservoirValue={reservoirValue}
        totalUsers={totalUsers}
        isReservoirSufficient={isReservoirSufficient}
        maxSpendBeyondReservoir={maxSpendBeyondReservoir}
        powerUsers={powerUsers}
        specificULBTotal={specificULBTotal}
        specificULBBorrowed={specificULBBorrowed}
        universalULB={universalULB}
        tier={tier}
      />

      {/* Billing cycle reset warning */}
      {recommendations.isMidCycleAdjusted && (
        <Alert className="border-accent/50 bg-accent/10">
          <HourglassMedium size={16} weight="fill" className="text-accent" />
          <AlertDescription className="text-xs space-y-1.5">
            <p>
              <strong>Billing cycle adjustment is active.</strong> Recommendations are sized for the remaining pool (${Math.max(0, reservoirValue - midCyclePoolConsumed).toLocaleString()} of ${reservoirValue.toLocaleString()}).
            </p>
            <p className="text-muted-foreground">
              At the start of your next billing cycle, reset the enterprise budget to <strong className="text-foreground">${recommendations.fullCycleEnterpriseBudget.toLocaleString()}</strong> (full-cycle value).
              {recommendations.fullCycleCostCenterBudget > 0 && (
                <> The cost center budget should be reset to <strong className="text-foreground">${recommendations.fullCycleCostCenterBudget.toLocaleString()}</strong>.</>
              )}
            </p>
            {onNavigateToTab && (
              <button
                onClick={() => onNavigateToTab('api-tools')}
                className="text-xs text-accent underline underline-offset-2 font-medium hover:text-accent/80 transition-colors"
              >
                Generate reset script in API Tools →
              </button>
            )}
          </AlertDescription>
        </Alert>
      )}

      <Collapsible open={referenceOpen} onOpenChange={setReferenceOpen}>
        <CollapsibleTrigger asChild>
          <button className="w-full flex items-center justify-between text-sm text-muted-foreground hover:text-foreground transition-colors py-2 group">
            <span className="flex items-center gap-2">
              <BookOpen size={16} weight="duotone" />
              Reference Details
            </span>
            {referenceOpen ? <CaretUp size={14} /> : <CaretDown size={14} />}
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="grid lg:grid-cols-2 gap-6 pt-2">
            <ReservoirCard
              cbLicenses={cbLicenses}
              ceLicenses={ceLicenses}
              cbAICsPerLicense={cbAICsPerLicense}
              ceAICsPerLicense={ceAICsPerLicense}
              cbAICs={cbAICs}
              ceAICs={ceAICs}
              totalReservoir={totalReservoir}
              reservoirValue={reservoirValue}
              avgUsagePerUser={avgUsagePerUser}
              totalUsers={totalUsers}
              promotionalPricing={promotionalPricing}
              promoBonusValue={promoBonusValue}
            />

            <UserBudgetsCard
              universalULB={universalULB}
              powerUsers={powerUsers}
              powerUserBudget={powerUserBudget}
              specificULBBorrowed={specificULBBorrowed}
            />
          </div>
        </CollapsibleContent>
      </Collapsible>

      <p className="text-xs text-muted-foreground text-center px-4">
        This tool models monthly limits using ULB settings and a proportional shared-pool assumption. It does not model day-to-day usage volatility (spikes). All recommendations are based on data you provide. Review outputs carefully before applying changes to your enterprise billing configuration.
      </p>

    </div>
    </TierPlannerContext.Provider>
  )
}
