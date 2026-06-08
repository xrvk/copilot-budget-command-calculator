import { useState } from 'react'
import { NumericInput } from '@/components/ui/numeric-input'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'
import {
  Warning,
  ArrowRight,
  SpinnerGap,
  Trash,
  CaretDown,
  CaretUp,
  Buildings,
  CheckCircle,
  ArrowsClockwise,
} from '@phosphor-icons/react'
import { patchBudget, withRateLimitRetry, ApiError } from '@/lib/api'
import { costCenterUrl, unaffiliatedOrgsUrl, settingsTokensUrl } from '@/lib/utils'
import { calcMultiCCConstraints } from './calculations'
import type { CostCenterConstraintInput, UserBudgetRecord } from './types'
import { StepHeaderStatus } from './StepHeaderStatus'
import { useTierPlanner } from './TierPlannerContext'

export function StepConstraintAnalysis({ stepNumber = 5 }: { stepNumber?: number }) {
  const {
    credentials, apiFetch,
    sharedCostCenters, setSharedCostCenters,
    liveUserBudgets,
    liveUlb, universalULB, liveEntBudget,
    reservoirValue, recommendedEnterpriseBudget,
    effectiveExcludeCostCenterUsage, totalUsers,
    ulbFetched,
    orgResolvingCcIds,
    retryFailedOrgResolution,
    onNavigateToImport,
    stepsExpandedSignal,
  } = useTierPlanner()

  const [expanded, setExpanded] = useState(false)
  const [prevSignal, setPrevSignal] = useState(stepsExpandedSignal)
  if (stepsExpandedSignal !== prevSignal) {
    setPrevSignal(stepsExpandedSignal)
    setExpanded(stepsExpandedSignal % 2 === 1)
  }
  const [budgetOverrides, setBudgetOverrides] = useState<Record<string, number>>({})
  const [applying, setApplying] = useState(false)
  const [applyResult, setApplyResult] = useState<{ ok: boolean; message: string } | null>(null)
  const [failedCcIds, setFailedCcIds] = useState<string[]>([])

  // Clear stale overrides when shared CC data changes
  const [prevSharedCCs, setPrevSharedCCs] = useState(sharedCostCenters)
  if (sharedCostCenters !== prevSharedCCs) {
    setPrevSharedCCs(sharedCostCenters)
    if (Object.keys(budgetOverrides).length > 0) {
      const updated: Record<string, number> = {}
      for (const [ccId, override] of Object.entries(budgetOverrides)) {
        const oldCc = prevSharedCCs.find(sc => sc.ccId === ccId)
        const newCc = sharedCostCenters.find(sc => sc.ccId === ccId)
        if (oldCc && newCc && oldCc.budgetAmount !== newCc.budgetAmount) {
          continue
        }
        updated[ccId] = override
      }
      setBudgetOverrides(updated)
    }
  }

  const applyBudgetsForCCs = async (ccs: typeof sharedCostCenters) => {
    if (!credentials) return
    const dirtyBudgets = ccs.filter(sc =>
      budgetOverrides[sc.ccId] !== undefined && budgetOverrides[sc.ccId] !== sc.budgetAmount
    )
    if (dirtyBudgets.length === 0) return

    setApplying(true)
    setApplyResult(null)
    setFailedCcIds([])
    let successCount = 0
    const failed: string[] = []
    let rateLimited = false
    for (const sc of dirtyBudgets) {
      if (!sc.budgetId) { failed.push(sc.ccId); continue }
      try {
        await withRateLimitRetry(() => patchBudget(apiFetch, credentials.ent, sc.budgetId!, { budget_amount: budgetOverrides[sc.ccId] }))
        setSharedCostCenters(prev => prev.map(p =>
          p.ccId === sc.ccId ? { ...p, budgetAmount: budgetOverrides[sc.ccId] } : p
        ))
        successCount++
      } catch (err) {
        failed.push(sc.ccId)
        if (err instanceof ApiError && err.status === 429) rateLimited = true
      }
    }
    setBudgetOverrides(prev => {
      const next = { ...prev }
      for (const sc of dirtyBudgets) {
        if (!failed.includes(sc.ccId)) delete next[sc.ccId]
      }
      return next
    })
    setApplying(false)
    setFailedCcIds(failed)

    const failedNames = failed.map(id => sharedCostCenters.find(sc => sc.ccId === id)?.name ?? id)
    let message = failed.length === 0
      ? `✓ Updated ${successCount} budget${successCount !== 1 ? 's' : ''}`
      : `Updated ${successCount}, failed ${failed.length}: ${failedNames.join(', ')}`
    if (rateLimited) message += ' (rate limited)'
    setApplyResult({ ok: failed.length === 0, message })
  }

  const handleApplyBudgets = () => applyBudgetsForCCs(sharedCostCenters)

  const handleRetryFailed = () => {
    const failedCCs = sharedCostCenters.filter(sc => failedCcIds.includes(sc.ccId))
    applyBudgetsForCCs(failedCCs)
  }

  // Compute constraints once — used for header badges and expanded table
  const ccInputs: CostCenterConstraintInput[] = sharedCostCenters.map(sc => ({
    ccId: sc.ccId, name: sc.name, budget: budgetOverrides[sc.ccId] ?? sc.budgetAmount, members: sc.members,
  }))
  const ubRecords: UserBudgetRecord[] = liveUserBudgets.map(ub => ({ login: ub.login, amount: ub.amount }))
  const constraintResult = calcMultiCCConstraints(ccInputs, ubRecords, liveUlb ?? universalULB, reservoirValue, liveEntBudget ?? recommendedEnterpriseBudget, effectiveExcludeCostCenterUsage, totalUsers)
  // O(1) lookup instead of repeated .find() per row
  const ccBudgetByIdMap = new Map(sharedCostCenters.map(sc => [sc.ccId, sc]))
  const hasConstraintData = sharedCostCenters.length > 0 && ulbFetched
  const step5IsClear = hasConstraintData && constraintResult.bindingCount === 0 && constraintResult.uncappedCount === 0

  return (
    <div className="flex gap-3 items-start p-3 rounded-lg border border-border bg-card">
      <div className="w-6 h-6 rounded-full bg-success flex items-center justify-center flex-shrink-0 mt-0.5" aria-label={`Step ${stepNumber}`}>
        <span className="text-success-foreground text-xs font-bold" aria-hidden="true">{stepNumber}</span>
      </div>
      <div className="flex-1 space-y-3">
        <div
          className="flex justify-between items-center cursor-pointer select-none hover:bg-muted/40 -m-3 p-3 rounded-lg transition-colors"
          onClick={(e) => { e.stopPropagation(); setExpanded(prev => !prev) }}
        >
          <div className="flex items-center gap-2 font-semibold">
            Cost Center Constraint Analysis
          </div>
          <div className="flex items-center justify-end gap-2 min-w-[18rem]">
            {constraintResult.bindingCount > 0 && (
              <Badge variant="outline" className="animate-pulse border-warning/50 text-warning text-[10px] py-0">{constraintResult.bindingCount} binding</Badge>
            )}
            {constraintResult.uncappedCount > 0 && (
              <Badge variant="outline" className="animate-pulse border-destructive/50 text-destructive text-[10px] py-0">{constraintResult.uncappedCount} uncapped</Badge>
            )}
            <StepHeaderStatus tone={step5IsClear ? 'clear' : 'review'} />
            {expanded ? <CaretUp size={14} className="text-muted-foreground" /> : <CaretDown size={14} className="text-muted-foreground" />}
          </div>
        </div>
        {expanded && (
          <>
        <p className="text-xs text-muted-foreground">
          Checks each cost center's budget against its users' actual ULBs to detect binding constraints
        </p>

        {(sharedCostCenters.length > 0 || !credentials) ? (
          <div className="space-y-3 pt-1">
            {(() => {
              const multiResult = constraintResult
              return (
                <div className="space-y-4">
                  {/* Summary bar */}
                  <div className="grid grid-cols-3 gap-3">
                    <div className="rounded-lg border border-border bg-muted/30 p-3 text-center">
                      <div className="text-[11px] text-muted-foreground mb-0.5">Total Max Additional Spend /mo</div>
                      <div className="mono text-lg font-bold">${multiResult.totalMaxSpend.toLocaleString()}</div>
                    </div>
                    <div className="rounded-lg border border-border bg-muted/30 p-3 text-center">
                      <div className="text-[11px] text-muted-foreground mb-0.5">Binding Constraints</div>
                      <div className={`mono text-lg font-bold ${multiResult.bindingCount > 0 ? 'text-warning' : 'text-success'}`}>{multiResult.bindingCount}</div>
                    </div>
                    <div className="rounded-lg border border-border bg-muted/30 p-3 text-center">
                      <div className="text-[11px] text-muted-foreground mb-0.5">Uncapped CCs</div>
                      <div className={`mono text-lg font-bold ${multiResult.uncappedCount > 0 ? 'text-destructive' : 'text-success'}`}>{multiResult.uncappedCount}</div>
                    </div>
                  </div>

                  {/* CC table */}
                  <div className="rounded-lg border border-border overflow-hidden">
                    <table className="w-full text-xs" aria-label="Cost center budget constraints">
                      <thead>
                        <tr className="bg-muted/50 border-b border-border">
                          <th scope="col" className="text-center py-2 px-2 font-medium w-[70px]">Status</th>
                          <th scope="col" className="text-left py-2 px-3 font-medium">Cost Center</th>
                          <th scope="col" className="text-right py-2 px-2 font-medium">Users</th>
                          <th scope="col" className="text-right py-2 px-3 font-medium">Max Draw</th>
                          <th scope="col" className="text-right py-2 px-2 font-medium">Capacity</th>
                          <th scope="col" className="text-right py-2 px-3 font-medium">Budget</th>
                        </tr>
                      </thead>
                      <tbody>
                        {multiResult.costCenters.map(cc => {
                          const ccPostPool = cc.maxConsumption > 0 ? Math.ceil(cc.constraint.shortfall + (budgetOverrides[cc.ccId] ?? ccBudgetByIdMap.get(cc.ccId)?.budgetAmount ?? 0)) : 0
                          const needsMinHint = cc.constraint.isBinding || cc.isUncapped
                          return (
                          <tr key={cc.ccId} className={`border-b border-border last:border-0 transition-colors ${
                            cc.isUncapped ? 'bg-destructive/5' :
                            cc.constraint.isBinding ? 'bg-warning/5' : ''
                          }`}>
                            <td className="py-2 px-2 text-center">
                              {cc.isUncapped ? (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Badge variant="outline" className="animate-pulse border-destructive/50 text-destructive text-[10px] py-0 px-1.5 cursor-help">Uncapped</Badge>
                                  </TooltipTrigger>
                                  <TooltipContent side="right" className="max-w-xs text-xs">
                                    <p>No budget set while exclusion is enabled. Metered charges are completely uncapped</p>
                                  </TooltipContent>
                                </Tooltip>
                              ) : cc.constraint.isBinding ? (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Badge variant="outline" className="animate-pulse border-warning/50 text-warning text-[10px] py-0 px-1.5 cursor-help">Binding</Badge>
                                  </TooltipTrigger>
                                  <TooltipContent side="right" className="max-w-xs text-xs">
                                    <p>Budget is capping users below their ULBs. Adjusting budget is advised</p>
                                  </TooltipContent>
                                </Tooltip>
                              ) : (
                                <Badge variant="outline" className="border-success/50 text-success text-[10px] py-0 px-1.5">OK</Badge>
                              )}
                            </td>
                            <td className="py-2 px-3 font-medium">
                              {credentials ? (
                                <a
                                  href={costCenterUrl(credentials.base, credentials.ent, cc.ccId)}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  aria-label={`${cc.name} (opens in new tab)`}
                                  className="underline underline-offset-2 decoration-muted-foreground/40 hover:decoration-primary hover:text-primary transition-colors"
                                >
                                  {cc.name} ↗
                                </a>
                              ) : cc.name}
                            </td>
                            <td className="py-2 px-2 text-right mono">
                              {cc.userCount}
                              {(() => {
                                const sc = ccBudgetByIdMap.get(cc.ccId)
                                if (!sc) return null
                                const orgs = sc.organizations ?? []
                                const isResolving = orgResolvingCcIds.has(cc.ccId)
                                // Resolving: orgs still pending
                                if (orgs.length > 0 && isResolving) return (
                                  <Badge variant="outline" className="ml-1 px-1 py-0 text-[10px] leading-tight font-normal text-muted-foreground border-border animate-pulse">
                                    <SpinnerGap weight="duotone" className="size-3 mr-0.5 animate-spin" />
                                    +{orgs.length} org{orgs.length > 1 ? 's' : ''}
                                  </Badge>
                                )
                                // Resolved: show persistent "via org" badge
                                if (sc.orgMemberLogins.length > 0) return (
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <span className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground cursor-default ml-1">
                                        <Buildings weight="duotone" className="size-3" />
                                        {sc.orgMemberLogins.length} via org
                                      </span>
                                    </TooltipTrigger>
                                    <TooltipContent side="bottom" className="bg-popover text-popover-foreground border shadow-md max-w-64 text-xs">
                                      <p className="font-medium mb-1">{sc.orgMemberLogins.length} member{sc.orgMemberLogins.length !== 1 ? 's' : ''} resolved from {sc.resolvedOrganizations.length} org{sc.resolvedOrganizations.length !== 1 ? 's' : ''}:</p>
                                      <ul className="list-none space-y-0.5 text-muted-foreground">
                                        {sc.resolvedOrganizations.map(org => (
                                          <li key={org} className="flex items-center gap-1">
                                            <CheckCircle weight="fill" className="size-3 text-success shrink-0" />
                                            {org}
                                          </li>
                                        ))}
                                      </ul>
                                    </TooltipContent>
                                  </Tooltip>
                                )
                                // Unresolved orgs still present (not resolving) — show count
                                if (orgs.length > 0) return (
                                  <span className="text-[10px] ml-0.5 text-warning" title={`Includes org${orgs.length > 1 ? 's' : ''}: ${orgs.join(', ')}`}>
                                    +{orgs.length} org{orgs.length > 1 ? 's' : ''}
                                  </span>
                                )
                                return null
                              })()}
                              {(() => {
                                const sc = ccBudgetByIdMap.get(cc.ccId)
                                if (!sc || sc.failedOrganizations.length === 0) return null
                                return (
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <span className="inline-flex items-center cursor-default ml-0.5">
                                        <Warning weight="fill" className="size-3.5 text-warning" />
                                      </span>
                                    </TooltipTrigger>
                                    <TooltipContent side="left" className="bg-popover text-popover-foreground border shadow-md max-w-72 text-xs leading-relaxed">
                                      <p className="font-medium mb-1">{sc.failedOrganizations.length} org{sc.failedOrganizations.length !== 1 ? 's' : ''} could not be resolved:</p>
                                      <ul className="list-none space-y-0.5">
                                        {sc.failedOrganizations.map(org => (
                                          <li key={org} className="flex items-center gap-1">
                                            <Warning weight="fill" className="size-3 text-warning shrink-0" />
                                            <span className="font-medium">{org}</span>
                                          </li>
                                        ))}
                                      </ul>
                                      {sc.orgFailureReason === 'scope' ? (
                                        <p className="mt-1.5 text-muted-foreground">
                                          Your PAT may be missing <code className="bg-muted px-0.5 rounded">read:org</code> scope, or you may not be a member of {sc.failedOrganizations.length === 1 ? 'this org' : 'these orgs'}.
                                        </p>
                                      ) : (
                                        <p className="mt-1.5 text-muted-foreground">
                                          You may not be a member of {sc.failedOrganizations.length === 1 ? 'this org' : 'these orgs'}, or your PAT may be missing <code className="bg-muted px-0.5 rounded">read:org</code> scope.
                                        </p>
                                      )}
                                      {credentials && (
                                        <p className="mt-1 flex gap-2">
                                          <a href={unaffiliatedOrgsUrl(credentials.base, credentials.ent)} target="_blank" rel="noopener noreferrer" className="underline font-medium text-primary text-[10px]">Review orgs →</a>
                                          <a href={settingsTokensUrl(credentials.base)} target="_blank" rel="noopener noreferrer" className="underline font-medium text-primary text-[10px]">Manage tokens →</a>
                                        </p>
                                      )}
                                    </TooltipContent>
                                  </Tooltip>
                                )
                              })()}
                            </td>
                            <td className="py-2 px-3 text-right mono">${Math.ceil(cc.maxConsumption).toLocaleString()}</td>
                            <td className="py-2 px-2 text-right mono">
                              {cc.isUncapped
                                ? <span className="text-destructive font-medium">∞</span>
                                : <span className={cc.constraint.isBinding ? 'text-warning font-medium' : ''}>{Math.round(cc.constraint.capacityPercent)}%</span>
                              }
                            </td>
                            <td className="py-2 px-3 text-right">
                              <div className="flex flex-col items-end gap-0.5">
                                <NumericInput
                                  min={0}
                                  value={budgetOverrides[cc.ccId] ?? ccBudgetByIdMap.get(cc.ccId)?.budgetAmount ?? 0}
                                  onValueChange={v => setBudgetOverrides(prev => ({ ...prev, [cc.ccId]: v }))}
                                  commas
                                  className={`text-xs h-7 mono w-24 ${needsMinHint ? 'border-warning' : ''}`}
                                />
                                {needsMinHint && ccPostPool > 0 && (
                                  <button
                                    className="text-[10px] text-muted-foreground hover:text-primary transition-colors cursor-pointer whitespace-nowrap"
                                    title={`Set budget to $${ccPostPool.toLocaleString()} to resolve this constraint`}
                                    onClick={() => setBudgetOverrides(prev => ({ ...prev, [cc.ccId]: ccPostPool }))}
                                  >
                                    Suggested: ${ccPostPool.toLocaleString()}
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                          )
                        })}
                        {/* Unassigned users row */}
                        <tr className={`transition-colors ${
                          multiResult.unassignedUsers.constraint.isBinding ? 'bg-warning/5' : 'bg-muted/20'
                        }`}>
                          <td className="py-2 px-2 text-center">
                            {multiResult.unassignedUsers.constraint.isBinding ? (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Badge
                                    variant="outline"
                                    className="animate-pulse border-warning/50 text-warning text-[10px] py-0 px-1.5 cursor-pointer"
                                    onClick={() => document.getElementById('step-1-enterprise-budget')?.scrollIntoView({ behavior: 'smooth', block: 'center' })}
                                  >Binding</Badge>
                                </TooltipTrigger>
                                <TooltipContent side="right" className="max-w-xs text-xs">
                                  <p>Enterprise budget is capping unassigned users below their ULBs. Click to jump to Step 1</p>
                                </TooltipContent>
                              </Tooltip>
                            ) : (
                              <Badge variant="outline" className="border-success/50 text-success text-[10px] py-0 px-1.5">OK</Badge>
                            )}
                          </td>
                          <td className="py-2 px-3 font-medium text-muted-foreground italic">Unassigned users</td>
                          <td className="py-2 px-2 text-right mono">{multiResult.unassignedUsers.count}</td>
                          <td className="py-2 px-3 text-right mono">${Math.ceil(multiResult.unassignedUsers.maxConsumption).toLocaleString()}</td>
                          <td className="py-2 px-2 text-right mono">
                            <span className={multiResult.unassignedUsers.constraint.isBinding ? 'text-warning font-medium' : ''}>
                              {Math.round(multiResult.unassignedUsers.constraint.capacityPercent)}%
                            </span>
                          </td>
                          <td className="py-2 px-3 text-right mono text-muted-foreground">
                            ${(liveEntBudget ?? recommendedEnterpriseBudget).toLocaleString()}
                            <span className="text-[10px] ml-0.5">(ent)</span>
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  {/* Apply changed budgets */}
                  {(() => {
                    const dirtyBudgets = sharedCostCenters.filter(sc =>
                      budgetOverrides[sc.ccId] !== undefined && budgetOverrides[sc.ccId] !== sc.budgetAmount
                    )
                    if (dirtyBudgets.length === 0) return null
                    return (
                      <div className="space-y-2 pt-2 border-t border-border">
                        <div className="flex gap-2">
                        <Button
                          size="sm"
                          className="h-8 gap-1.5 text-xs flex-1"
                          disabled={applying || !credentials}
                          onClick={handleApplyBudgets}
                        >
                          {applying ? <SpinnerGap size={12} className="animate-spin" /> : <ArrowRight size={12} />}
                          Apply {dirtyBudgets.length} Budget Change{dirtyBudgets.length !== 1 ? 's' : ''} ({dirtyBudgets.map(sc => sc.name).join(', ')})
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 gap-1.5 text-xs hover:text-destructive hover:border-destructive/50"
                          disabled={applying}
                          onClick={() => { setBudgetOverrides({}); setApplyResult(null) }}
                        >
                          <Trash size={12} weight="duotone" />
                          Discard
                        </Button>
                        </div>
                        {applyResult && (
                          <div className="space-y-1.5">
                            <p className={`text-xs font-medium ${applyResult.ok ? 'text-success' : 'text-warning'}`}>
                              {applyResult.message}
                            </p>
                            {failedCcIds.length > 0 && (
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-6 text-xs gap-1"
                                onClick={handleRetryFailed}
                                disabled={applying}
                              >
                                <ArrowsClockwise size={12} weight="duotone" />
                                Retry {failedCcIds.length} failed
                              </Button>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })()}
                </div>
              )
            })()}

            {/* Org resolution failure alert */}
            {sharedCostCenters.some(sc => sc.failedOrganizations.length > 0) && (() => {
              const failedCCs = sharedCostCenters.filter(sc => sc.failedOrganizations.length > 0)
              return (
                <Alert className="border-warning/40 bg-warning/5 py-2">
                  <Warning size={14} weight="fill" className="text-warning" />
                  <AlertDescription className="text-xs space-y-1">
                    <p>
                      Could not resolve org members for {failedCCs.length} cost center{failedCCs.length !== 1 ? 's' : ''}.
                      {' '}Your PAT may need <code className="bg-muted px-0.5 rounded">read:org</code> scope, or you may not be a member of those orgs.
                      {credentials && (
                        <>
                          {' '}
                          <a href={unaffiliatedOrgsUrl(credentials.base, credentials.ent)} target="_blank" rel="noopener noreferrer" className="underline font-medium text-primary">Review orgs →</a>
                          {' · '}
                          <a href={settingsTokensUrl(credentials.base)} target="_blank" rel="noopener noreferrer" className="underline font-medium text-primary">Manage tokens →</a>
                        </>
                      )}
                    </p>
                    <button
                      className="underline underline-offset-2 text-primary hover:text-primary/80 transition-colors font-medium"
                      onClick={retryFailedOrgResolution}
                    >
                      Try again ↗
                    </button>
                  </AlertDescription>
                </Alert>
              )
            })()}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground/70 italic">
            <button onClick={onNavigateToImport} className="underline underline-offset-2 hover:text-foreground transition-colors">Connect your Enterprise</button> to analyze cost center constraints.
          </p>
        )}
          </>
        )}
      </div>
    </div>
  )
}
