import { useState, useCallback, useId, useMemo, useEffect, useRef } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { NumericInput } from '@/components/ui/numeric-input'
import { Switch } from '@/components/ui/switch'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'
import {
  Buildings,
  Warning,
  CheckCircle,
  ArrowRight,
  SpinnerGap,
  ShieldCheck,
  Lightbulb,
  Info,
  CaretDown,
  CaretUp,
  Link,
  Check,
} from '@phosphor-icons/react'
import { useEnterpriseCredentials, type ConnectResult } from '@/hooks/use-enterprise-credentials'
import ImportPanel from '@/components/ImportPanel'
import { CsvUploadCard, ConsumptionAnalysisPanel } from '@/components/ConsumptionAnalysisPanel'
import CostCenterTable from '@/components/CostCenterTable'
import SpendingSummaryCard from '@/components/SpendingSummaryCard'
import BudgetStructureDiagram from '@/components/BudgetStructureDiagram'
import ApplyChangesDialog from '@/components/ApplyChangesDialog'
import { fetchCcSpend, isCopilotBudget, isOrgResource } from '@/lib/api'
import { costCentersUrl, budgetEditUrl } from '@/lib/utils'
import { detectDrift } from '@/lib/drift'
import { getHashParams } from '@/lib/hash-routing'
import { encodeBudgetPlannerState, decodeBudgetPlannerState } from '@/lib/budget-planner-state'

const MAX_COST_CENTERS = 250

export interface CostCenter {
  id: string
  name: string
  budget: number
  budgetId?: string        // GitHub budget UUID — present when a budget exists
  originalBudget?: number  // baseline at import time, for detecting edits
  ccId?: string            // GitHub cost center UUID — present when CC exists on GitHub
}

export type RowUpdateStatus = 'pending' | 'success' | 'error'

function generateId() {
  return crypto.randomUUID().slice(0, 8)
}

export default function BudgetPlanner({ onNavigateToTips, onNavigateToTierPlanner, highlightImport = false, onHighlightImportDone, autoConnect = false, onAutoConnectDone }: { onNavigateToTips?: () => void; onNavigateToTierPlanner?: () => void; highlightImport?: boolean; onHighlightImportDone?: () => void; autoConnect?: boolean; onAutoConnectDone?: () => void }) {
  const formId = useId()
  const { credentials, budgetMeta, setBudgetMeta, apiFetch, sharedCostCenters, setSharedCostCenters, csvUsageData, setCsvUsageData, isDemo } = useEnterpriseCredentials()

  // Read initial state from URL hash (only used for the initial render)
  const urlState = (() => {
    const hashTab = window.location.hash.slice(1).split('?')[0]
    if (hashTab !== 'budget-planner') return null
    const encoded = getHashParams().get('s')
    if (!encoded) return null
    return decodeBudgetPlannerState(encoded)
  })()

  // Clear external highlight flag after ImportPanel consumes it
  useEffect(() => {
    if (highlightImport) onHighlightImportDone?.()
  }, [highlightImport, onHighlightImportDone])

  // Global inputs
  const [enterpriseBudget, setEnterpriseBudget] = useState(urlState?.enterpriseBudget ?? 0)
  const [excludeCostCenters, setExcludeCostCenters] = useState(urlState?.excludeCostCenters ?? false)
  // Derived from shared credentials context
  const apiExcludeCostCenters = budgetMeta.apiExcludeCostCenters
  const apiPreventFurtherUsage = budgetMeta.apiPreventFurtherUsage
  const apiEnterpriseBudget = budgetMeta.apiEnterpriseBudget
  const budgetAlertingEnabled = budgetMeta.budgetAlertingEnabled
  const entBudgetId = budgetMeta.entBudgetId

  // Cost centers — start with URL-provided rows, example rows, or empty
  const [costCenters, setCostCenters] = useState<CostCenter[]>(
    urlState && urlState.costCenters.length > 0
      ? urlState.costCenters.map(cc => ({ id: generateId(), name: cc.name, budget: cc.budget }))
      : [
          { id: generateId(), name: 'Engineering', budget: 0 },
          { id: generateId(), name: 'Marketing', budget: 0 },
        ]
  )

  // prevent_further_usage: stops all usage when budget limit is reached
  const [preventFurtherUsage, setPreventFurtherUsage] = useState(urlState?.preventFurtherUsage ?? true)

  // Track whether initial state came from a shared URL link.
  // When true, skip the first demo sync so URL values aren't overwritten.
  const [urlStateConsumed, setUrlStateConsumed] = useState(urlState !== null)

  // Apply changes state
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [applyStatus, setApplyStatus] = useState<Record<string, RowUpdateStatus>>({})
  const [applying, setApplying] = useState(false)

  // Rows removed while credentials are active — tracked for API deletion (budgetId and/or ccId may be present)
  const [deletedRows, setDeletedRows] = useState<Array<{ id: string; name: string; budgetId?: string; ccId?: string }>>([])
  const [_deleteStatus, setDeleteStatus] = useState<Record<string, RowUpdateStatus>>({})
  // ccIds whose budgets were successfully deleted — filtered out of refreshes until disconnect
  const [_hiddenCcIds, setHiddenCcIds] = useState<Set<string>>(new Set())

  // After creation: map cc.id → GitHub cost center management URL
  const [createdLinks, setCreatedLinks] = useState<Record<string, string>>({})

  // Per-CC spend this billing month: ccId → dollar amount
  const [ccSpend, setCcSpend] = useState<Record<string, number>>({})

  // Sync local state from shared context when demo variant switches
  // (connectDemo updates budgetMeta and sharedCostCenters; BudgetPlanner must follow)
  const [prevBudgetMeta, setPrevBudgetMeta] = useState(budgetMeta)
  if (budgetMeta !== prevBudgetMeta) {
    setPrevBudgetMeta(budgetMeta)
    if (isDemo && urlStateConsumed) {
      // First demo sync after URL load: skip overwriting, clear the guard
      setUrlStateConsumed(false)
    } else if (isDemo) {
      if (budgetMeta.apiEnterpriseBudget !== null) setEnterpriseBudget(budgetMeta.apiEnterpriseBudget)
      if (budgetMeta.apiExcludeCostCenters !== null) setExcludeCostCenters(budgetMeta.apiExcludeCostCenters)
      if (budgetMeta.apiPreventFurtherUsage !== null) setPreventFurtherUsage(budgetMeta.apiPreventFurtherUsage)
      // Rebuild cost center table rows from sharedCostCenters
      const rows: CostCenter[] = sharedCostCenters.map(sc => ({
        id: generateId(),
        name: sc.name,
        budget: sc.budgetAmount,
        budgetId: sc.budgetId,
        originalBudget: sc.budgetAmount,
        ccId: sc.ccId,
      }))
      setCostCenters(rows.length > 0 ? rows : [{ id: generateId(), name: '', budget: 0 }])
    } else if (!credentials) {
      // Fully disconnected (demo dismissed) — reset to blank
      setEnterpriseBudget(0)
      setExcludeCostCenters(false)
      setPreventFurtherUsage(true)
      setCostCenters([{ id: generateId(), name: '', budget: 0 }])
      setApplyStatus({})
      setConfirmOpen(false)
      setApplying(false)
      setDeletedRows([])
      setDeleteStatus({})
      setHiddenCcIds(new Set())
      setCreatedLinks({})
      setCcSpend({})
    }
  }

  // Callback for BulkAddMembersPanel: update sharedCostCenters after immediate API assign
  const handleMembersAdded = useCallback((ccId: string, logins: string[]) => {
    setSharedCostCenters(prev =>
      prev.map(sc => {
        if (sc.ccId !== ccId) return sc
        const updated = [...new Set([...sc.members, ...logins])]
        return { ...sc, members: updated, userCount: updated.length }
      })
    )
  }, [setSharedCostCenters])

  // Collapsible UI sections
  const [controlsOpen, setControlsOpen] = useState(true)
  const [dataInputsOpen, setDataInputsOpen] = useState(true)

  // Copy Link state + handler
  const [copied, setCopied] = useState(false)
  const handleCopyLink = useCallback(() => {
    navigator.clipboard.writeText(window.location.href).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }, [])

  // Sync Budget Planner state to URL hash on every change
  useEffect(() => {
    const hashTab = window.location.hash.slice(1).split('?')[0]
    if (hashTab !== 'budget-planner') return
    const encoded = encodeBudgetPlannerState({
      enterpriseBudget,
      excludeCostCenters,
      preventFurtherUsage,
      costCenters: costCenters.map(cc => ({ name: cc.name, budget: cc.budget })),
    })
    const qIdx = window.location.hash.indexOf('?')
    const existingParams = qIdx === -1 ? new URLSearchParams() : new URLSearchParams(window.location.hash.slice(qIdx + 1))
    existingParams.set('s', encoded)
    window.history.replaceState(null, '', `${window.location.pathname}#budget-planner?${existingParams.toString()}`)
  }, [enterpriseBudget, excludeCostCenters, preventFurtherUsage, costCenters])

  // Ref for deep-linking to the consumption analysis section
  const consumptionRef = useRef<HTMLDivElement>(null)
  const initialScrollDone = useRef(false)

  useEffect(() => {
    if (initialScrollDone.current) return
    const section = getHashParams().get('section')
    if (section === 'consumption-analysis') {
      initialScrollDone.current = true
      // Give the panel time to render (it's conditional on csvUsageData)
      setTimeout(() => {
        const el = consumptionRef.current
        if (!el) return
        const stickyHeaderOffset = 80
        const top = el.getBoundingClientRect().top + window.scrollY - stickyHeaderOffset
        window.scrollTo({ top, behavior: 'smooth' })
      }, 100)
    }
  }, [csvUsageData])
  // --- Cost center mutations ---
  const addCostCenter = useCallback(() => {
    setCostCenters(prev =>
      prev.length < MAX_COST_CENTERS
        ? [...prev, { id: generateId(), name: '', budget: 0 }]
        : prev
    )
  }, [])

  const removeCostCenter = useCallback((id: string) => {
    setCostCenters(prev => {
      if (prev.length <= 1 && !credentials) return prev
      const target = prev.find(cc => cc.id === id)
      // Queue for API deletion if connected and the row has any GitHub identity
      if (credentials && (target?.budgetId || target?.ccId)) {
        setDeletedRows(d => [...d, { id: target!.id, name: target!.name, budgetId: target!.budgetId, ccId: target!.ccId }])
      }
      return prev.filter(cc => cc.id !== id)
    })
  }, [credentials])

  const updateCostCenter = useCallback((id: string, field: keyof Omit<CostCenter, 'id'>, value: string | number) => {
    setCostCenters(prev => prev.map(cc => cc.id === id ? { ...cc, [field]: value } : cc))
  }, [])

  // --- Derived row sets (memoized to avoid O(n) per render) ---
  const { dirtyRows, newRows, excludeIsDirty, stopUsageIsDirty, entBudgetAmountIsDirty, pendingCount, ccBudgetTotal, totalSpendingExposure, uncappedCcCount } = useMemo(() => {
    // Existing linked rows whose budget has changed
    const dirtyRows = costCenters.filter(
      cc => cc.budgetId !== undefined && cc.budget !== cc.originalBudget
    )
    // New rows: no budget yet, has a name and a non-zero budget amount, credentials active
    // Only counts when the user has explicitly set a budget > 0 (avoids flagging
    // freshly-imported CCs that have no budget as immediately "pending")
    const newRows = credentials
      ? costCenters.filter(cc => !cc.budgetId && cc.name.trim().length > 0 && cc.budget > 0)
      : []
    // Field-level drift: enterprise budget amount, exclude CC, prevent_further_usage.
    // All three share the same gate (connected + ent budget id known).
    const fieldDrift = detectDrift({
      enabled: credentials !== null && entBudgetId !== null,
      fields: [
        { key: 'excludeCostCenters', local: excludeCostCenters, api: apiExcludeCostCenters },
        { key: 'preventFurtherUsage', local: preventFurtherUsage, api: apiPreventFurtherUsage },
        { key: 'enterpriseBudget', local: enterpriseBudget, api: apiEnterpriseBudget },
      ],
    })
    const excludeIsDirty = fieldDrift.byKey.excludeCostCenters
    const stopUsageIsDirty = fieldDrift.byKey.preventFurtherUsage
    const entBudgetAmountIsDirty = fieldDrift.byKey.enterpriseBudget

    const pendingCount = dirtyRows.length + newRows.length + deletedRows.length + fieldDrift.pendingCount

    // --- Spending exposure calculation ---
    const ccBudgetTotal = costCenters.reduce((sum, cc) => sum + cc.budget, 0)
    const totalSpendingExposure = excludeCostCenters
      ? enterpriseBudget + ccBudgetTotal
      : enterpriseBudget
    const uncappedCcCount = excludeCostCenters
      ? costCenters.filter(cc => cc.budget === 0 && cc.name.trim().length > 0).length
      : 0

    return { dirtyRows, newRows, excludeIsDirty, stopUsageIsDirty, entBudgetAmountIsDirty, pendingCount, ccBudgetTotal, totalSpendingExposure, uncappedCcCount }
  }, [costCenters, credentials, entBudgetId, apiExcludeCostCenters, excludeCostCenters, apiPreventFurtherUsage, preventFurtherUsage, apiEnterpriseBudget, enterpriseBudget, deletedRows])

  // Memoize the gross CSV consumption (1 AIC = $0.01). BudgetPlanner re-renders
  // frequently as the user edits budgets/toggles, so the O(n) reduce should run
  // once per CSV change instead of every render.
  const csvActualConsumption = useMemo(() => {
    if (!csvUsageData?.users.length) return undefined
    return csvUsageData.users.reduce((sum, u) => sum + u.totalAICs * 0.01, 0)
  }, [csvUsageData])

  // --- Import handler (called by ImportPanel) ---
  const handleConnected = useCallback((result: ConnectResult) => {
    if (!result.ok || !result.budgets || !result.costCenters) return
    const budgets = result.budgets
    const allCCs = result.costCenters

    const entBudget = budgets.find(b => b.budget_scope === 'enterprise' && isCopilotBudget(b))
    // Always explicitly set these from the imported data so stale values from a
    // previous session (e.g. demo mode) never leak through.
    setEnterpriseBudget(entBudget?.budget_amount ?? 0)
    setExcludeCostCenters(entBudget?.exclude_cost_center_usage ?? false)
    setPreventFurtherUsage(entBudget?.prevent_further_usage ?? true)
    // Update all budgetMeta fields unconditionally so drift detection and
    // PATCH targeting stay accurate even if the enterprise budget disappears.
    setBudgetMeta({
      entBudgetId: entBudget?.id ?? null,
      apiEnterpriseBudget: entBudget?.budget_amount ?? null,
      apiExcludeCostCenters: entBudget?.exclude_cost_center_usage ?? null,
      apiPreventFurtherUsage: entBudget?.prevent_further_usage ?? null,
      budgetAlertingEnabled: entBudget?.budget_alerting?.will_alert ?? null,
    })
    const budgetByCcName = new Map(
      budgets
        .filter(b => b.budget_scope === 'cost_center' && isCopilotBudget(b))
        .map(b => [b.budget_entity_name, b])
    )

    const importedRows: CostCenter[] = allCCs.slice(0, MAX_COST_CENTERS).map(cc => {
      const budget = budgetByCcName.get(cc.name)
      return {
        id: generateId(),
        name: cc.name,
        budget: budget?.budget_amount ?? 0,
        budgetId: budget?.id,
        originalBudget: budget?.budget_amount,
        ccId: cc.id,
      }
    })
    setCostCenters(importedRows.length > 0 ? importedRows : [{ id: generateId(), name: '', budget: 0 }])
    // Populate shared cost center data for other tabs (e.g. Tier Planner)
    const ccResourceMap = new Map(allCCs.map(cc => [cc.id, cc.resources ?? []]))
    setSharedCostCenters(
      importedRows
        .filter(r => r.ccId)
        .map(r => {
          const resources = ccResourceMap.get(r.ccId!) ?? []
          const memberNames = resources.filter(res => res.type === 'User').map(res => res.name)
          const orgNames = resources.filter(res => isOrgResource(res.type)).map(res => res.name)
          return { ccId: r.ccId!, name: r.name, budgetAmount: r.budget, budgetId: r.budgetId, members: memberNames, userCount: memberNames.length, organizations: orgNames, orgMemberLogins: [], resolvedOrganizations: [], failedOrganizations: [], orgFailureReason: null }
        })
    )
    setApplyStatus({})
    setDeletedRows([])
    setDeleteStatus({})
    setHiddenCcIds(new Set())
    setCreatedLinks({})

    // Fire-and-forget: fetch spend data for each CC
    const creds = result.credentials
    if (creds) {
      const ccIds = importedRows.filter(r => r.ccId).map(r => r.ccId!)
      const directFetch = (path: string) =>
        fetch(`${creds.base}${path}`, {
          headers: {
            Accept: 'application/vnd.github+json',
            Authorization: `Bearer ${creds.token}`,
            'X-GitHub-Api-Version': '2026-03-10',
          },
        })
      Promise.all(
        ccIds.map(async ccId => {
          try {
            const spent = await fetchCcSpend(directFetch, creds.ent, ccId)
            return [ccId, spent] as const
          } catch { return null }
        })
      ).then(results => {
        const entries = results.filter(Boolean) as Array<readonly [string, number]>
        if (entries.length > 0) setCcSpend(Object.fromEntries(entries))
      })
    }
  }, [setBudgetMeta, setSharedCostCenters, setEnterpriseBudget, setExcludeCostCenters, setPreventFurtherUsage])

  const handleDisconnected = useCallback(() => {
    setEnterpriseBudget(0)
    setExcludeCostCenters(false)
    setPreventFurtherUsage(true)
    setCostCenters([{ id: generateId(), name: '', budget: 0 }])
    setApplyStatus({})
    setDeletedRows([])
    setDeleteStatus({})
    setHiddenCcIds(new Set())
    setCreatedLinks({})
    setCcSpend({})
  }, [setEnterpriseBudget, setExcludeCostCenters, setPreventFurtherUsage])

  // --- Apply changes: PATCH dirty rows + CREATE new rows + update exclude CC ---
  const handleApplyConfirm = async () => {
    if (!credentials || pendingCount === 0) return
    setApplying(true)
    setConfirmOpen(false)

    const nextStatus: Record<string, RowUpdateStatus> = { ...applyStatus }

    // PATCH enterprise budget amount if changed
    if (entBudgetAmountIsDirty && entBudgetId) {
      try {
        await apiFetch(
          `/enterprises/${credentials.ent}/settings/billing/budgets/${entBudgetId}`,
          { method: 'PATCH', body: JSON.stringify({ budget_amount: enterpriseBudget }) }
        )
        setBudgetMeta({ apiEnterpriseBudget: enterpriseBudget })
      } catch (err) { console.error('Failed to patch enterprise budget amount:', err) }
    }

    // PATCH enterprise budget exclude_cost_center_usage if changed
    if (excludeIsDirty && entBudgetId) {
      try {
        await apiFetch(
          `/enterprises/${credentials.ent}/settings/billing/budgets/${entBudgetId}`,
          { method: 'PATCH', body: JSON.stringify({ exclude_cost_center_usage: excludeCostCenters }) }
        )
        setBudgetMeta({ apiExcludeCostCenters: excludeCostCenters })
      } catch (err) { console.error('Failed to patch exclude_cost_center_usage:', err) }
    }

    // PATCH enterprise budget prevent_further_usage if changed
    if (stopUsageIsDirty && entBudgetId) {
      try {
        await apiFetch(
          `/enterprises/${credentials.ent}/settings/billing/budgets/${entBudgetId}`,
          { method: 'PATCH', body: JSON.stringify({ prevent_further_usage: preventFurtherUsage }) }
        )
        setBudgetMeta({ apiPreventFurtherUsage: preventFurtherUsage })
      } catch (err) { console.error('Failed to patch prevent_further_usage:', err) }
    }

    // PATCH existing dirty rows
    await Promise.all(
      dirtyRows.map(async cc => {
        nextStatus[cc.id] = 'pending'
        setApplyStatus({ ...nextStatus })
        try {
          const res = await apiFetch(
            `/enterprises/${credentials.ent}/settings/billing/budgets/${cc.budgetId}`,
            { method: 'PATCH', body: JSON.stringify({ budget_amount: cc.budget }) }
          )
          if (!res.ok) {
            const body = await res.json().catch(() => ({}))
            throw new Error(body.message || `HTTP ${res.status}`)
          }
          nextStatus[cc.id] = 'success'
          setCostCenters(prev =>
            prev.map(r => r.id === cc.id ? { ...r, originalBudget: cc.budget } : r)
          )
        } catch (err) {
          console.error(`Failed to patch budget for "${cc.name}":`, err)
          nextStatus[cc.id] = 'error'
        }
        setApplyStatus({ ...nextStatus })
      })
    )

    // DELETE budgets and/or cost centers for removed rows
    await Promise.all(
      deletedRows.map(async row => {
        setDeleteStatus(s => ({ ...s, [row.id]: 'pending' }))
        try {
          if (row.budgetId) {
            const res = await apiFetch(
              `/enterprises/${credentials.ent}/settings/billing/budgets/${row.budgetId}`,
              { method: 'DELETE' }
            )
            if (!res.ok && res.status !== 404) {
              const body = await res.json().catch(() => ({}))
              throw new Error(body.message || `HTTP ${res.status}`)
            }
          }
          if (row.ccId) {
            const res = await apiFetch(
              `/enterprises/${credentials.ent}/settings/billing/cost-centers/${row.ccId}`,
              { method: 'DELETE' }
            )
            if (!res.ok && res.status !== 404 && res.status !== 405) {
              const body = await res.json().catch(() => ({}))
              throw new Error(body.message || `HTTP ${res.status}`)
            }
          }
          setDeleteStatus(s => ({ ...s, [row.id]: 'success' }))
          setDeletedRows(d => d.filter(r => r.id !== row.id))
          if (row.ccId) setHiddenCcIds(s => new Set([...s, row.ccId!]))
        } catch (err) {
          console.error(`Failed to delete cost center "${row.name}":`, err)
          setDeleteStatus(s => ({ ...s, [row.id]: 'error' }))
        }
      })
    )

    // CREATE/budget new rows: POST cost center if needed → POST budget
    await Promise.all(
      newRows.map(async cc => {
        nextStatus[cc.id] = 'pending'
        setApplyStatus({ ...nextStatus })
        try {
          let resolvedCcId = cc.ccId

          if (!resolvedCcId) {
            const ccRes = await apiFetch(
              `/enterprises/${credentials.ent}/settings/billing/cost-centers`,
              { method: 'POST', body: JSON.stringify({ name: cc.name }) }
            )
            if (!ccRes.ok) {
              const body = await ccRes.json().catch(() => ({}))
              throw new Error(body.message || `HTTP ${ccRes.status}`)
            }
            const ccData = await ccRes.json()
            resolvedCcId = ccData.id
            setCostCenters(prev =>
              prev.map(r => r.id === cc.id ? { ...r, ccId: resolvedCcId } : r)
            )
          }

          const budgetRes = await apiFetch(
            `/enterprises/${credentials.ent}/settings/billing/budgets`,
            {
              method: 'POST',
              body: JSON.stringify({
                budget_amount: cc.budget,
                prevent_further_usage: true,
                budget_scope: 'cost_center',
                budget_entity_name: resolvedCcId,
                budget_type: 'BundlePricing',
                budget_product_sku: 'premium_requests',
                budget_alerting: { will_alert: false, alert_recipients: [] },
              }),
            }
          )
          if (!budgetRes.ok) {
            const body = await budgetRes.json().catch(() => ({}))
            throw new Error(body.message || `HTTP ${budgetRes.status}`)
          }
          const budgetData = await budgetRes.json()
          const newBudgetId: string = budgetData.budget?.id ?? resolvedCcId

          nextStatus[cc.id] = 'success'
          setCostCenters(prev =>
            prev.map(r => r.id === cc.id ? { ...r, budgetId: newBudgetId, originalBudget: cc.budget } : r)
          )
          setCreatedLinks(prev => ({ ...prev, [cc.id]: ccPageUrl! }))
        } catch (err) {
          console.error(`Failed to create cost center budget for "${cc.name}":`, err)
          nextStatus[cc.id] = 'error'
        }
        setApplyStatus({ ...nextStatus })
      })
    )

    setApplying(false)

    // Sync shared cost centers so other tabs see the latest state
    setCostCenters(prev => {
      const prevMemberMap = new Map(sharedCostCenters.map(sc => [sc.ccId, sc]))
      setSharedCostCenters(
        prev
          .filter(r => r.ccId)
          .map(r => {
            const existing = prevMemberMap.get(r.ccId!)
            return { ccId: r.ccId!, name: r.name, budgetAmount: r.budget, budgetId: r.budgetId, members: existing?.members ?? [], userCount: existing?.userCount ?? 0, organizations: existing?.organizations ?? [], orgMemberLogins: existing?.orgMemberLogins ?? [], resolvedOrganizations: existing?.resolvedOrganizations ?? [], failedOrganizations: existing?.failedOrganizations ?? [], orgFailureReason: existing?.orgFailureReason ?? null }
          })
      )
      return prev
    })
  }

  // --- Discard all pending local changes ---
  const handleDiscard = useCallback(() => {
    setCostCenters(prev => {
      const reset = prev
        // Reset dirty linked rows to their original budget
        .map(cc => cc.budgetId !== undefined
          ? { ...cc, budget: cc.originalBudget ?? cc.budget }
          // For CC-linked rows with no budget, reset to 0
          : cc.ccId !== undefined ? { ...cc, budget: 0 } : cc
        )
        // Remove purely manual new rows (no GitHub link at all) when credentials are active
        .filter(cc => cc.ccId !== undefined || !credentials || cc.name.trim() === '')
      // Restore rows that were queued for deletion
      const restored: CostCenter[] = deletedRows.map(r => ({
        id: r.id,
        name: r.name,
        budget: 0,
        budgetId: r.budgetId,
        originalBudget: 0,
        ccId: r.ccId,
      }))
      const merged = [...reset, ...restored]
      // Always keep at least one empty manual row
      return merged.length > 0 ? merged : [{ id: generateId(), name: '', budget: 0 }]
    })
    setDeletedRows([])
    setDeleteStatus({})
    // Also reset the exclude CC toggle and enterprise budget amount to their API values
    if (apiExcludeCostCenters !== null) setExcludeCostCenters(apiExcludeCostCenters)
    if (apiEnterpriseBudget !== null) setEnterpriseBudget(apiEnterpriseBudget)
    setApplyStatus({})
    setCreatedLinks({})
  }, [credentials, apiExcludeCostCenters, apiEnterpriseBudget, deletedRows, setExcludeCostCenters, setEnterpriseBudget])

  const linkedCount = costCenters.filter(cc => cc.ccId).length
  const ccPageUrl = credentials
    ? costCentersUrl(credentials.base, credentials.ent)
    : null

  return (
    <div className="space-y-6 pb-24 sm:min-w-[700px]">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Budget Planner</h2>
          <p className="text-muted-foreground mt-2">
            Model monthly spend across your Enterprise and Cost Centers
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

      {/* Tips hint */}
      <div className="flex items-start gap-3 rounded-lg border border-primary/20 bg-primary/5 px-4 py-3">
        <Lightbulb size={18} weight="duotone" className="text-primary flex-shrink-0 mt-0.5" />
        <p className="text-sm text-muted-foreground">
          Not sure how Copilot billing works?{' '}
          <button
            onClick={onNavigateToTips}
            className="font-medium text-primary underline underline-offset-2 hover:opacity-80 transition-opacity"
          >
            Tips &amp; Best Practices
          </button>
          {' '}covers how the included credit pool, budgets, and ULBs interact.
        </p>
      </div>

      {/* Data inputs */}
      <Card className={`relative overflow-hidden py-0 gap-0 transition-all duration-500 ${
        (credentials && !isDemo && !csvUsageData)
          ? 'border border-border'
          : 'border-2 border-primary/40 shadow-lg shadow-primary/20'
      }`}>
        {/* Collapse caret: top-right, aligned with heading row */}
        <button
          type="button"
          className="absolute right-3 top-2.5 z-10 inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted/60 hover:text-foreground transition-colors"
          onClick={() => setDataInputsOpen(prev => !prev)}
          aria-label={dataInputsOpen ? 'Collapse data inputs' : 'Expand data inputs'}
        >
          {dataInputsOpen ? <CaretUp size={16} /> : <CaretDown size={16} />}
        </button>
        <div className="grid lg:grid-cols-[2fr_1px_1fr]">
          <div>
            <ImportPanel
              onConnected={handleConnected}
              onDisconnected={handleDisconnected}
              linkedCount={linkedCount}
              highlight={highlightImport}
              autoConnect={autoConnect}
              onAutoConnectDone={onAutoConnectDone}
              embedded
              open={dataInputsOpen}
              onOpenChange={setDataInputsOpen}
              showCaret={false}
            />
          </div>
          <div className="hidden lg:block bg-border" />
          <div className="border-t border-border lg:border-t-0">
            <CsvUploadCard
              csvData={csvUsageData}
              onCsvParsed={setCsvUsageData}
              onClear={() => setCsvUsageData(null)}
              embedded
              fillHeight={dataInputsOpen}
              onHeaderClick={() => setDataInputsOpen(prev => !prev)}
              collapsed={!dataInputsOpen}
            />
          </div>
        </div>
      </Card>

      <div className="grid lg:grid-cols-2 gap-6">
          {/* Enterprise budget */}
          <Card className="border-2 border-primary/20 lg:order-1">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Buildings size={20} weight="duotone" className="text-primary" />
                Enterprise Budget
              </CardTitle>
              <CardDescription className="flex items-center gap-1.5">
                The enterprise-wide cap on metered AI Credit charges
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={onNavigateToTips}
                      className="inline-flex text-muted-foreground/60 hover:text-primary transition-colors"
                      aria-label="What are AI Credits?"
                    >
                      <Info size={14} weight="duotone" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="max-w-xs text-xs leading-relaxed">
                    <p>AI Credits (AICs) are pre-paid units of AI usage included with each Copilot license. All AICs pool enterprise-wide. This budget only caps charges after the pool is depleted</p>
                  </TooltipContent>
                </Tooltip>
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor={`${formId}-ent-budget`}>Enterprise Budget ($)</Label>
                <div className="rounded-lg border border-transparent p-3">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">$</span>
                    <NumericInput
                      id={`${formId}-ent-budget`}
                      min={0}
                      value={enterpriseBudget}
                      onValueChange={setEnterpriseBudget}
                      allowFloat
                      commas
                      className="text-lg mono"
                    />
                  </div>

                </div>
              </div>

              <Collapsible open={controlsOpen} onOpenChange={setControlsOpen}>
                <CollapsibleTrigger asChild>
                  <button className="w-full flex items-center justify-between text-sm font-medium py-2 hover:text-foreground transition-colors">
                    <span className="flex items-center gap-2">
                      Budget Controls
                    </span>
                    {controlsOpen ? <CaretUp size={14} className="text-muted-foreground" /> : <CaretDown size={14} className="text-muted-foreground" />}
                  </button>
                </CollapsibleTrigger>
                {!controlsOpen && (
                  <p className="text-xs text-muted-foreground pb-2">
                    {excludeCostCenters ? 'Additive mode' : 'Shared mode'} · {preventFurtherUsage ? (excludeCostCenters && uncappedCcCount > 0 ? 'Partial cap' : 'Hard cap') : 'Soft cap'}
                    {apiExcludeCostCenters !== null && !excludeIsDirty && !stopUsageIsDirty && ' · ✓ Synced'}
                  </p>
                )}
                <CollapsibleContent className="space-y-4">
                  {(() => {
                    const isDrifted = apiExcludeCostCenters !== null && excludeCostCenters !== apiExcludeCostCenters
                    return (
                      <div className={`space-y-2 rounded-lg border p-3 transition-colors ${isDrifted ? 'border-warning/60 bg-warning/10' : 'border-transparent bg-muted/50'}`}>
                        <div className="flex items-start gap-3">
                          <Switch
                            id={`${formId}-exclude`}
                            checked={excludeCostCenters}
                            onCheckedChange={setExcludeCostCenters}
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <Label htmlFor={`${formId}-exclude`} className="text-sm font-normal cursor-pointer leading-none">
                                Exclude cost center usage from enterprise budget
                              </Label>
                              {apiExcludeCostCenters !== null && !isDrifted && (
                                <Badge variant="outline" className="text-xs border-success/50 text-success gap-1 py-0">
                                  <CheckCircle size={10} weight="fill" />
                                  Synced from GitHub
                                </Badge>
                              )}
                              {isDrifted && (
                                <Badge variant="outline" className="text-xs border-warning/60 text-warning gap-1 py-0">
                                  <Warning size={10} weight="fill" />
                                  Differs from live GitHub setting
                                </Badge>
                              )}
                            </div>
                            <span className="block text-xs text-muted-foreground mt-1">
                              {excludeCostCenters
                                ? 'Additive: enterprise and each cost center cap charges independently. Total potential spend is the enterprise budget plus all cost center budgets combined'
                                : 'Shared: enterprise budget covers all charges including cost centers. Cost center budgets are sub-limits'}
                            </span>
                            {isDrifted && (
                              <div className="flex items-center gap-2 mt-2">
                                <span className="text-xs text-warning">
                                  GitHub has this set to <strong>{apiExcludeCostCenters ? 'ON' : 'OFF'}</strong>
                                </span>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-6 px-2 text-xs gap-1 border-warning/50 text-warning hover:text-warning"
                                  onClick={() => setExcludeCostCenters(apiExcludeCostCenters!)}
                                >
                                  Reset to GitHub value
                                </Button>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    )
                  })()}

                  {/* Stop usage when budget limit is reached */}
                  {(() => {
                    const stopDrifted = stopUsageIsDirty
                    return (
                      <div className={`space-y-2 rounded-lg border p-3 transition-colors ${stopDrifted ? 'border-warning/60 bg-warning/10' : 'border-transparent bg-muted/50'}`}>
                        <div className="flex items-start gap-3">
                          <Switch
                            id={`${formId}-stop-usage`}
                            checked={preventFurtherUsage}
                            onCheckedChange={setPreventFurtherUsage}
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <Label htmlFor={`${formId}-stop-usage`} className="text-sm font-normal cursor-pointer leading-none flex items-center gap-1.5">
                                <ShieldCheck size={14} weight="duotone" className={preventFurtherUsage ? 'text-success' : 'text-muted-foreground'} />
                                Stop usage when budget limit is reached
                              </Label>
                              {apiPreventFurtherUsage !== null && !stopDrifted && (
                                <Badge variant="outline" className="text-xs border-success/50 text-success gap-1 py-0">
                                  <CheckCircle size={10} weight="fill" />
                                  Synced from GitHub
                                </Badge>
                              )}
                              {stopDrifted && (
                                <Badge variant="outline" className="text-xs border-warning/60 text-warning gap-1 py-0">
                                  <Warning size={10} weight="fill" />
                                  Differs from live GitHub setting
                                </Badge>
                              )}
                            </div>
                            <span className="block text-xs text-muted-foreground mt-1">
                              {preventFurtherUsage
                                ? 'Hard cap: Copilot usage stops at this limit. Prevents runaway charges'
                                : 'Soft cap: triggers notifications only. Usage and charges continue past the limit'}
                            </span>
                            {stopDrifted && (
                              <div className="flex items-center gap-2 mt-2">
                                <span className="text-xs text-warning">
                                  GitHub has this set to <strong>{apiPreventFurtherUsage ? 'ON' : 'OFF'}</strong>
                                </span>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-6 px-2 text-xs gap-1 border-warning/50 text-warning hover:text-warning"
                                  onClick={() => setPreventFurtherUsage(apiPreventFurtherUsage!)}
                                >
                                  Reset to GitHub value
                                </Button>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    )
                  })()}
                </CollapsibleContent>
              </Collapsible>
            </CardContent>
          </Card>

          {/* Cost centers */}
          <div className="lg:order-3">
          <CostCenterTable
            costCenters={costCenters}
            maxCostCenters={MAX_COST_CENTERS}
            credentials={credentials}
            ccPageUrl={ccPageUrl}
            excludeCostCenters={excludeCostCenters}
            applyStatus={applyStatus}
            createdLinks={createdLinks}
            ccSpend={ccSpend}
            sharedCostCenters={sharedCostCenters}
            apiFetch={apiFetch}
            onAdd={addCostCenter}
            onRemove={removeCostCenter}
            onUpdate={updateCostCenter}
            onMembersAdded={handleMembersAdded}
          />
          </div>

          <div className="lg:order-2">
          <BudgetStructureDiagram
            enterpriseBudget={enterpriseBudget}
            costCenters={costCenters}
            excludeCostCenters={excludeCostCenters}
            preventFurtherUsage={preventFurtherUsage}
            budgetAlertingEnabled={budgetAlertingEnabled}
            alertSettingsUrl={credentials && entBudgetId ? budgetEditUrl(credentials.base, credentials.ent, entBudgetId) : undefined}
          />
          </div>
          <div className="lg:order-4">
          <SpendingSummaryCard
            enterpriseBudget={enterpriseBudget}
            excludeCostCenters={excludeCostCenters}
            ccBudgetTotal={ccBudgetTotal}
            totalSpendingExposure={totalSpendingExposure}
            preventFurtherUsage={preventFurtherUsage}
            budgetAlertingEnabled={budgetAlertingEnabled}
            credentials={credentials}
            entBudgetId={entBudgetId}
            uncappedCcCount={uncappedCcCount}
            csvActualConsumption={csvActualConsumption}
            onNavigateToTips={onNavigateToTips}
          />
          </div>
      </div>

      {/* Consumption Analysis Panel (from CSV data) */}
      {csvUsageData && csvUsageData.errors.length === 0 && csvUsageData.users.length > 0 && (
        <ConsumptionAnalysisPanel
          ref={consumptionRef}
          csvData={csvUsageData}
          enterpriseBudget={enterpriseBudget}
          onApplyToTierPlanner={onNavigateToTierPlanner}
        />
      )}

      {/* Sticky pending changes bar */}
      {credentials && pendingCount > 0 && !applying && (
        <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-warning/40 bg-warning/10 backdrop-blur-sm">
          <div className="max-w-7xl mx-auto px-4 py-2 sm:px-6 sm:py-3 flex items-center justify-between gap-3 sm:gap-4">
            <div className="flex items-center gap-2 text-sm min-w-0">
              <Warning size={16} weight="fill" className="text-warning flex-shrink-0" />
              {/* Mobile: compact summary */}
              <span className="font-medium sm:hidden">{pendingCount} pending change{pendingCount > 1 ? 's' : ''}</span>
              {/* Desktop: full detail */}
              <div className="hidden sm:flex sm:items-center sm:gap-2 sm:flex-wrap">
              {dirtyRows.length > 0 && (
                <span className="font-medium">{dirtyRows.length} budget update{dirtyRows.length > 1 ? 's' : ''}</span>
              )}
              {dirtyRows.length > 0 && newRows.length > 0 && <span className="text-muted-foreground">·</span>}
              {newRows.length > 0 && (
                <span className="font-medium">{newRows.length} new cost center{newRows.length > 1 ? 's' : ''} to create</span>
              )}
              {(dirtyRows.length > 0 || newRows.length > 0) && deletedRows.length > 0 && <span className="text-muted-foreground">·</span>}
              {deletedRows.length > 0 && (
                <span className="font-medium">{deletedRows.length} cost center budget{deletedRows.length > 1 ? 's' : ''} to delete</span>
              )}
              {(dirtyRows.length > 0 || newRows.length > 0 || deletedRows.length > 0) && excludeIsDirty && <span className="text-muted-foreground">·</span>}
              {excludeIsDirty && (
                <span className="font-medium">exclude CC setting changed</span>
              )}
              {(dirtyRows.length > 0 || newRows.length > 0 || deletedRows.length > 0 || excludeIsDirty) && stopUsageIsDirty && <span className="text-muted-foreground">·</span>}
              {stopUsageIsDirty && (
                <span className="font-medium">stop usage setting changed</span>
              )}
              {(dirtyRows.length > 0 || newRows.length > 0 || deletedRows.length > 0 || excludeIsDirty || stopUsageIsDirty) && entBudgetAmountIsDirty && <span className="text-muted-foreground">·</span>}
              {entBudgetAmountIsDirty && (
                <span className="font-medium">enterprise budget changed</span>
              )}
              </div>
            </div>
            <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
              <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground" onClick={handleDiscard}>
                <span className="sm:hidden">Discard</span>
                <span className="hidden sm:inline">Discard changes</span>
              </Button>
              <Button size="sm" className="gap-1.5 sm:gap-2 sm:size-default" onClick={() => setConfirmOpen(true)}>
                Review &amp; Apply
                <ArrowRight size={14} weight="bold" />
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Applying progress bar */}
      {applying && (
        <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-card">
          <div className="max-w-7xl mx-auto px-6 py-3 flex items-center gap-3 text-sm">
            <SpinnerGap size={16} className="animate-spin text-primary flex-shrink-0" />
            <span>Applying changes to GitHub…</span>
          </div>
        </div>
      )}

      {/* Confirmation dialog */}
      <ApplyChangesDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        onConfirm={handleApplyConfirm}
        pendingCount={pendingCount}
        dirtyRows={dirtyRows}
        newRows={newRows}
        deletedRows={deletedRows}
        excludeIsDirty={excludeIsDirty}
        stopUsageIsDirty={stopUsageIsDirty}
        entBudgetAmountIsDirty={entBudgetAmountIsDirty}
        excludeCostCenters={excludeCostCenters}
        apiExcludeCostCenters={apiExcludeCostCenters}
        preventFurtherUsage={preventFurtherUsage}
        apiPreventFurtherUsage={apiPreventFurtherUsage}
        enterpriseBudget={enterpriseBudget}
        apiEnterpriseBudget={apiEnterpriseBudget}
        credentials={credentials}
        costCenters={costCenters}
      />
    </div>
  )
}
