import { useState, useMemo, useCallback, useEffect } from 'react'
import { NumericInput } from '@/components/ui/numeric-input'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { FormulaTooltip } from '@/components/FormulaTooltip'
import {
  Users,
  CurrencyDollar,
  ArrowRight,
  SpinnerGap,
  Plus,
  Check,
  UsersThree,
  ArrowSquareOut,
  ArrowsClockwise,
  CaretRight,
  Info,
  CaretDown,
  CaretUp,
} from '@phosphor-icons/react'
import { createCostCenter, createBudget, fetchCostCenters as apiFetchCostCenters, assignCostCenterResources, fetchBudgets, isCopilotBudget, patchBudget } from '@/lib/api'
import { teamsUrl, enterpriseTeamsNewUrl, budgetEditUrl, budgetsUrl } from '@/lib/utils'
import { calcCostCenterBudgetConstraint } from './calculations'
import { StepHeaderStatus } from './StepHeaderStatus'
import { useTierPlanner } from './TierPlannerContext'
import { useEnterpriseCredentials } from '@/hooks/use-enterprise-credentials'

export function StepCostCenter({ stepNumber = 2 }: { stepNumber?: number }) {
  const {
    credentials, apiFetch,
    teams, teamsLoading, teamsError, fetchTeams,
    members, membersLoading, membersError,
    selectedTeam, fetchMembers,
    sharedCostCenters, setSharedCostCenters,
    setPowerCcId, powerCc,
    recommendations, isReservoirSufficient, effectiveExcludeCostCenterUsage,
    ccBudgetConstraint, powerUsers, powerUserBudget,
    primaryCostCenterBudget,
    onNavigateToTab, onNavigateToImport,
    stepsExpandedSignal,
  } = useTierPlanner()

  const { maxPowerConsumption, maxTotalConsumption, maxSpendBeyondReservoir, powerUserShareOfConsumption } = recommendations
  // Local alias: routes Step 2 logic through the forecast-aware primary value.
  // In practice this is forecast × buffer when CSV is available; otherwise the
  // ceiling-based recommendedCostCenterBudget.
  const recommendedCostCenterBudget = primaryCostCenterBudget

  // Consume one-shot candidate power user logins handed off from Consumption Analysis.
  // Consumption is effect-based (see the useEffect below) because it triggers async
  // fetches and prefills `manualInput` — both side effects, not pure state sync.
  const { candidatePowerUserLogins, setCandidatePowerUserLogins, isDemo } = useEnterpriseCredentials()

  const [expanded, setExpanded] = useState(false)
  const [prevSignal, setPrevSignal] = useState(stepsExpandedSignal)
  if (stepsExpandedSignal !== prevSignal) {
    setPrevSignal(stepsExpandedSignal)
    setExpanded(stepsExpandedSignal % 2 === 1)
  }
  const [manualInput, setManualInput] = useState('')
  const manualLogins = useMemo(
    () => manualInput.split(/[,\n]/).map(s => s.trim()).filter(Boolean),
    [manualInput]
  )

  const [existingCCs, setExistingCCs] = useState<Array<{ id: string; name: string }>>([])
  const [ccsLoading, setCcsLoading] = useState(false)
  const [selectedCcId, setSelectedCcId] = useState<string | null>(null)
  const [creatingNew, setCreatingNew] = useState(false)
  const [newCcName, setNewCcName] = useState('')
  const [ccBudgetAmount, setCcBudgetAmount] = useState<number | null>(null)
  const [assignLoading, setAssignLoading] = useState(false)
  const [assignResult, setAssignResult] = useState<{ ok: boolean; message: string; budgetUrl?: string } | null>(null)

  const fetchCCs = useCallback(async () => {
    if (!credentials) return
    setCcsLoading(true)
    try {
      const ccs = await apiFetchCostCenters(apiFetch, credentials.ent)
      setExistingCCs(ccs.map(cc => ({ id: cc.id, name: cc.name })))
    } catch { /* non-fatal */ }
    setCcsLoading(false)
  }, [credentials, apiFetch])

  // Local mirror of the consumed candidate list so the carry-over banner stays visible
  // after the one-shot context value is cleared. The admin dismisses via the Clear button.
  const [consumedCandidates, setConsumedCandidates] = useState<string[] | null>(null)

  // Consume one-shot candidate power user logins handed off from Consumption Analysis.
  // useEffect (not state-during-render) because we trigger async API fetches and prefill
  // a textarea, both of which are side effects, not pure state synchronization.
  /* eslint-disable react-hooks/set-state-in-effect -- intentional one-shot apply on cross-tab handoff */
  useEffect(() => {
    if (!candidatePowerUserLogins || candidatePowerUserLogins.length === 0) return
    setExpanded(true)
    if (!teams.length && !teamsLoading) fetchTeams()
    if (!existingCCs.length && !ccsLoading) fetchCCs()
    setManualInput(prev => {
      const existing = new Set(prev.split(/[,\n]/).map(s => s.trim()).filter(Boolean))
      const merged = [...existing]
      for (const login of candidatePowerUserLogins) if (!existing.has(login)) merged.push(login)
      return merged.join(', ')
    })
    setConsumedCandidates(candidatePowerUserLogins)
    setCandidatePowerUserLogins(null)
  }, [candidatePowerUserLogins, setCandidatePowerUserLogins, fetchTeams, fetchCCs, teams.length, teamsLoading, existingCCs.length, ccsLoading])
  /* eslint-enable react-hooks/set-state-in-effect */

  const handleAssign = async () => {
    if (!credentials) return
    setAssignLoading(true)
    setAssignResult(null)
    const budgetAmt = ccBudgetAmount ?? (recommendedCostCenterBudget === 0 && isReservoirSufficient && powerCc ? powerCc.budgetAmount : recommendedCostCenterBudget)
    try {
      const teamLogins = members.map(m => m.login)
      const allLogins = [...new Set([...teamLogins, ...manualLogins])]
      let ccId = selectedCcId
      let ccLabel = existingCCs.find(c => c.id === ccId)?.name ?? ''

      if (creatingNew) {
        const result = await createCostCenter(apiFetch, credentials.ent, newCcName.trim())
        ccId = result.id
        ccLabel = newCcName.trim()
        fetchCCs()
      }

      await assignCostCenterResources(apiFetch, credentials.ent, ccId!, allLogins)

      let budgetMsg: string
      let budgetId: string | null = null
      try {
        const result = await createBudget(apiFetch, credentials.ent, {
          budget_amount: budgetAmt,
          prevent_further_usage: true,
          budget_scope: 'cost_center',
          budget_entity_name: ccId,
          budget_type: 'BundlePricing',
          budget_product_sku: 'premium_requests',
          budget_alerting: { will_alert: false, alert_recipients: [] },
        })
        budgetId = result.id
        budgetMsg = ` · budget set to $${budgetAmt}`
      } catch {
        // Budget creation failed — try patching existing
        try {
          const allBudgets = await fetchBudgets(apiFetch, credentials.ent)
          const existing = allBudgets.find(b =>
            b.budget_scope === 'cost_center' &&
            (b.budget_entity_name === ccId || b.budget_entity_name === ccLabel) &&
            isCopilotBudget(b)
          )
          if (existing) {
            budgetId = existing.id
            await patchBudget(apiFetch, credentials.ent, existing.id, { budget_amount: budgetAmt })
            budgetMsg = ` · budget updated to $${budgetAmt}`
          } else {
            budgetMsg = ' · could not update existing budget. Check it on GitHub.'
          }
        } catch {
          budgetMsg = ' · could not update existing budget. Check it on GitHub.'
        }
      }

      const budgetUrl = budgetId
        ? budgetEditUrl(credentials.base, credentials.ent, budgetId)
        : budgetsUrl(credentials.base, credentials.ent)

      if (ccId) {
        setPowerCcId(ccId)
        const budgetAmt_ = ccBudgetAmount ?? (recommendedCostCenterBudget === 0 && isReservoirSufficient && powerCc ? powerCc.budgetAmount : recommendedCostCenterBudget)
        const exists = sharedCostCenters.some(sc => sc.ccId === ccId)
        if (exists) {
          setSharedCostCenters(sharedCostCenters.map(sc =>
            sc.ccId === ccId ? { ...sc, budgetAmount: budgetAmt_, budgetId: budgetId ?? sc.budgetId } : sc
          ))
        } else {
          setSharedCostCenters([...sharedCostCenters, { ccId, name: ccLabel, budgetAmount: budgetAmt_, budgetId: budgetId ?? undefined, members: [], userCount: 0, organizations: [], orgMemberLogins: [], resolvedOrganizations: [], failedOrganizations: [], orgFailureReason: null }])
        }
      }

      setAssignResult({ ok: true, message: `✓ ${allLogins.length} users assigned to "${ccLabel}"${budgetMsg}`, budgetUrl })
      if (creatingNew) { setCreatingNew(false); setNewCcName('') }
    } catch (err) {
      setAssignResult({ ok: false, message: err instanceof Error ? err.message : 'Assignment failed' })
    }
    setAssignLoading(false)
  }
  const costCenterNoChangeNeeded = recommendedCostCenterBudget === 0 && isReservoirSufficient
  const livePowerCcBudget = powerCc?.budgetAmount ?? null
  const costCenterBudgetIsClear =
    credentials !== null &&
    livePowerCcBudget !== null &&
    (costCenterNoChangeNeeded || livePowerCcBudget >= recommendedCostCenterBudget)
  const costCenterNeedsReview = credentials !== null && !costCenterBudgetIsClear

  return (
    <div className="flex gap-3 items-start p-3 rounded-lg border border-border bg-card">
      <div className="w-6 h-6 rounded-full bg-success flex items-center justify-center flex-shrink-0 mt-0.5" aria-label={`Step ${stepNumber}`}>
        <span className="text-success-foreground text-xs font-bold" aria-hidden="true">{stepNumber}</span>
      </div>
      <div className="flex-1 space-y-3">
        <div
          className="flex justify-between items-center cursor-pointer select-none hover:bg-muted/40 -m-3 p-3 rounded-lg transition-colors"
          onClick={(e) => { e.stopPropagation(); setExpanded(prev => !prev); if (!expanded) { if (!teams.length && !teamsLoading) fetchTeams(); if (!existingCCs.length && !ccsLoading) fetchCCs() } }}
        >
          <div className="flex items-center gap-2 font-semibold">
            Set cost center budget for power users
          </div>
          <div className="flex items-center justify-end gap-2 min-w-[18rem]">
            <span className="text-sm text-muted-foreground mono">
              Suggested min ${recommendedCostCenterBudget.toLocaleString()}/mo
            </span>
            <FormulaTooltip
              title="Suggested cost center budget"
              steps={[
                {
                  label: 'Power users\' share of total consumption',
                  formula: `$${maxPowerConsumption.toLocaleString()} ÷ $${maxTotalConsumption.toLocaleString()}`,
                  value: `${(powerUserShareOfConsumption * 100).toFixed(1)}%`,
                },
                {
                  label: 'Applied to metered spend, rounded up',
                  formula: `$${maxSpendBeyondReservoir.toLocaleString()} × ${(powerUserShareOfConsumption * 100).toFixed(1)}%, rounded up`,
                  value: `$${recommendedCostCenterBudget.toLocaleString()}/mo`,
                },
              ]}
              result={`$${recommendedCostCenterBudget.toLocaleString()}/mo`}
            />
            {(costCenterBudgetIsClear || costCenterNeedsReview) && (
              <StepHeaderStatus tone={costCenterBudgetIsClear ? 'clear' : 'review'} />
            )}
            {expanded ? <CaretUp size={14} className="text-muted-foreground" /> : <CaretDown size={14} className="text-muted-foreground" />}
          </div>
        </div>
        {expanded && (
          <>
        {recommendations.isMidCycleAdjusted && (
          <p className="text-xs text-accent font-medium">
            Adjusted for billing cycle. Full-cycle value: ${recommendations.fullCycleCostCenterBudget.toLocaleString()}/mo
          </p>
        )}
        <p className="text-xs text-muted-foreground">
          {powerCc
            ? `"${powerCc.name}" is designated as the power user group (current budget: $${powerCc.budgetAmount.toLocaleString()}). Recommended: $${recommendedCostCenterBudget.toLocaleString()}`
            : `Caps the ${powerUsers} power users' share of metered charges. Assign them to a cost center first. Stays at $0 while the pool has capacity`
          }
        </p>

        {consumedCandidates && consumedCandidates.length > 0 && (
          <Alert className="border-primary/40 bg-primary/5">
            <Info size={14} weight="duotone" className="text-primary" />
            <AlertDescription>
              <div className="flex items-start gap-2 flex-wrap text-xs">
                <div className="flex-1 min-w-[200px]">
                  <span className="font-semibold text-foreground">
                    {consumedCandidates.length} candidate power {consumedCandidates.length === 1 ? 'user' : 'users'} carried over from Consumption Analysis.
                  </span>
                  <span className="text-muted-foreground">
                    {' '}Pick the enterprise team that contains {consumedCandidates.length === 1 ? 'them' : 'these users'}, or create a new team in GitHub then refresh below.
                  </span>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 text-[11px] text-muted-foreground hover:text-foreground"
                  onClick={() => setConsumedCandidates(null)}
                >
                  Clear
                </Button>
              </div>
            </AlertDescription>
          </Alert>
        )}

        {credentials && powerCc && (
          <div className="space-y-2 pt-1">
            {powerCc.budgetAmount < recommendedCostCenterBudget && recommendedCostCenterBudget > 0 && !ccBudgetConstraint?.isBinding && (
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-warning/10 border border-warning/30 text-xs">
                <span className="mt-0.5">⚠️</span>
                <span>
                  Current budget <span className="mono font-medium">${powerCc.budgetAmount.toLocaleString()}</span> is below the suggested minimum of <span className="mono font-medium">${recommendedCostCenterBudget.toLocaleString()}</span>.
                </span>
              </div>
            )}
            {ccBudgetConstraint?.isBinding && (
              <Alert className="border-warning/50 bg-warning/10 py-2">
                <AlertDescription className="text-xs space-y-1">
                  <p>
                    ⚠️ <strong>Cost center budget is significantly below recommended.</strong>{' '}
                    At ${powerCc.budgetAmount.toLocaleString()}, power users can only consume ${Math.ceil(ccBudgetConstraint.affordableConsumption).toLocaleString()} ({Math.round(ccBudgetConstraint.capacityPercent)}% of their ${Math.ceil(ccBudgetConstraint.maxConsumption).toLocaleString()} potential). They will be blocked before reaching their {'$'}{powerUserBudget} individual budget.
                  </p>
                  <p className="text-muted-foreground">
                    Recommended: ${recommendedCostCenterBudget.toLocaleString()}.{' '}
                    {effectiveExcludeCostCenterUsage
                      ? `With cost center exclusion on, this is the only budget covering these ${powerUsers} users' metered charges`
                      : `This cost center budget acts as a sub-limit within the enterprise umbrella, capping these ${powerUsers} users`
                    }
                  </p>
                </AlertDescription>
              </Alert>
            )}
            {powerCc.budgetAmount >= recommendedCostCenterBudget && recommendedCostCenterBudget > 0 && (
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-success/10 border border-success/30 text-xs">
                <Check size={14} weight="bold" className="text-success flex-shrink-0" />
                <span>Budget meets or exceeds the suggested minimum</span>
              </div>
            )}
          </div>
        )}

        {credentials ? (
          <div className="space-y-3 pt-2">
              <div className="space-y-3 rounded-lg border border-border p-3 bg-muted/30">
                {/* Teams list */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-semibold flex items-center gap-1.5">
                      <UsersThree size={13} weight="duotone" />
                      Enterprise Teams
                      <a
                        href={teamsUrl(credentials.base, credentials.ent)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-0.5 text-primary hover:opacity-80 font-normal"
                        title="Manage enterprise teams on GitHub"
                      >
                        <ArrowSquareOut size={12} weight="duotone" />
                      </a>
                    </Label>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 text-muted-foreground hover:text-foreground transition-colors"
                      onClick={fetchTeams}
                      disabled={teamsLoading}
                      title="Refresh teams"
                    >
                      <ArrowsClockwise
                        size={13}
                        weight="duotone"
                        className={`transition-transform ${teamsLoading ? 'animate-spin' : ''}`}
                      />
                    </Button>
                  </div>
                  {teamsError && <p className="text-xs text-destructive">{teamsError}</p>}
                  {teams.length > 0 && (
                    <div className="max-h-40 overflow-y-auto space-y-1">
                      {teams.map(team => (
                        <button
                          key={team.id}
                          onClick={() => fetchMembers(team)}
                          className={`w-full text-left px-2 py-1.5 rounded text-xs flex items-center justify-between gap-2 transition-colors ${
                            selectedTeam?.id === team.id
                              ? 'bg-accent/20 ring-1 ring-accent/40 font-medium'
                              : 'hover:bg-muted'
                          }`}
                        >
                          <span className="truncate">{team.name}</span>
                          <Badge variant="outline" className="text-[10px] py-0 px-1 flex-shrink-0">{team.slug}</Badge>
                        </button>
                      ))}
                    </div>
                  )}
                  {!teamsLoading && teams.length === 0 && !teamsError && (
                    <div className="space-y-1.5">
                      <p className="text-xs text-muted-foreground">No enterprise teams found.</p>
                      <Button asChild variant="outline" size="sm" className="h-7 text-xs gap-1.5">
                        <a
                          href={enterpriseTeamsNewUrl(credentials.base, credentials.ent)}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <Plus size={11} weight="duotone" />
                          Create enterprise team on GitHub
                          <ArrowSquareOut size={11} weight="duotone" />
                        </a>
                      </Button>
                      <p className="text-[11px] text-muted-foreground">
                        After creating the team in GitHub, click Refresh above.
                      </p>
                      {isDemo && (
                        <p className="text-[11px] text-muted-foreground italic">
                          Demo mode: link points to a synthetic enterprise that does not exist.
                        </p>
                      )}
                    </div>
                  )}
                </div>

                {/* Members list */}
                {selectedTeam && (
                  <>
                    <Separator />
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label className="text-xs font-semibold flex items-center gap-1.5">
                          <Users size={13} weight="duotone" />
                          Members of {selectedTeam.name}
                          {!membersLoading && <Badge variant="outline" className="text-[10px] py-0 px-1">{members.length}</Badge>}
                        </Label>
                        {membersLoading && <SpinnerGap size={16} className="animate-spin text-muted-foreground" />}
                      </div>
                      {membersError && <p className="text-xs text-destructive">{membersError}</p>}
                      {members.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {members.map(m => (
                            <Badge key={m.id} variant="outline" className="text-xs gap-1 py-0.5">
                              <img src={m.avatar_url} alt="" className="w-3.5 h-3.5 rounded-full" />
                              {m.login}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>
                  </>
                )}

                {/* Manual username input */}
                <Separator />
                <Collapsible>
                  <CollapsibleTrigger className="flex items-center gap-1.5 text-xs font-semibold cursor-pointer group w-full">
                    <CaretRight size={13} weight="bold" className="transition-transform group-data-[state=open]:rotate-90" />
                    <Users size={13} weight="duotone" />
                    Add Usernames Manually
                    {manualLogins.length > 0 && (
                      <Badge variant="outline" className="text-[10px] py-0 px-1 ml-1">{manualLogins.length}</Badge>
                    )}
                  </CollapsibleTrigger>
                  <CollapsibleContent className="space-y-2 pt-2">
                    <textarea
                      value={manualInput}
                      onChange={e => setManualInput(e.target.value)}
                      placeholder="Enter GitHub usernames, comma or newline separated"
                      className="w-full text-xs rounded-md border border-input bg-background px-3 py-2 min-h-[56px] resize-y placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    />
                    {manualLogins.length > 0 && (
                      <p className="text-[11px] text-muted-foreground">
                        {manualLogins.length} username{manualLogins.length !== 1 ? 's' : ''} entered
                      </p>
                    )}
                  </CollapsibleContent>
                </Collapsible>

                {/* Assign to cost center */}
                {(members.length > 0 || manualLogins.length > 0) && (
                  <div className="space-y-2 pt-1">
                    <Separator />
                    <Label className="text-xs font-semibold">
                      Assign {[...new Set([...members.map(m => m.login), ...manualLogins])].length} users to cost center
                    </Label>

                    {ccsLoading ? (
                      <div className="flex items-center gap-2 text-xs text-muted-foreground py-1">
                        <SpinnerGap size={12} className="animate-spin" />
                        Loading cost centers…
                      </div>
                    ) : existingCCs.length > 0 ? (
                      <div className="space-y-1.5">
                        <p className="text-[11px] text-muted-foreground">Select an existing cost center:</p>
                        <div className="max-h-32 overflow-y-auto space-y-1">
                          {existingCCs.map(cc => (
                            <button
                              key={cc.id}
                              onClick={() => {
                                setSelectedCcId(cc.id)
                                setCreatingNew(false)
                                setAssignResult(null)
                                const imported = sharedCostCenters.find(sc => sc.ccId === cc.id)
                                setCcBudgetAmount(imported?.budgetAmount ?? null)
                              }}
                              className={`w-full text-left px-2 py-1.5 rounded text-xs flex items-center justify-between transition-colors ${
                                selectedCcId === cc.id && !creatingNew
                                  ? 'bg-accent/20 ring-1 ring-accent/40 font-medium'
                                  : 'hover:bg-muted bg-muted/40'
                              }`}
                            >
                              <span className="truncate">{cc.name}</span>
                              <span className="flex items-center gap-1.5">
                                {(() => {
                                  const imported = sharedCostCenters.find(sc => sc.ccId === cc.id)
                                  return imported?.budgetAmount != null
                                    ? <span className="text-[10px] text-muted-foreground mono">${imported.budgetAmount.toLocaleString()}</span>
                                    : null
                                })()}
                                {selectedCcId === cc.id && !creatingNew && <Check size={12} weight="bold" className="text-accent flex-shrink-0" />}
                              </span>
                            </button>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <p className="text-[11px] text-muted-foreground">No existing cost centers found</p>
                    )}

                    {/* Create new option */}
                    <div className="space-y-1.5">
                      <button
                        onClick={() => { setCreatingNew(true); setSelectedCcId(null); setAssignResult(null) }}
                        className={`w-full text-left px-2 py-1.5 rounded text-xs flex items-center gap-1.5 transition-colors ${
                          creatingNew
                            ? 'bg-accent/20 ring-1 ring-accent/40 font-medium'
                            : 'hover:bg-muted bg-muted/40'
                        }`}
                      >
                        <Plus size={12} weight="bold" className="text-accent" />
                        Create new cost center
                      </button>
                      {creatingNew && (
                        <Input
                          placeholder="New cost center name"
                          value={newCcName}
                          onChange={e => setNewCcName(e.target.value)}
                          className="text-xs h-7 ml-5"
                          autoFocus
                        />
                      )}
                    </div>

                    {/* Budget amount */}
                    {(selectedCcId || (creatingNew && newCcName.trim())) && (
                      <div className="space-y-1.5 pt-1">
                        <Separator />
                        <Label className="text-xs font-semibold flex items-center gap-1.5">
                          <CurrencyDollar size={13} weight="duotone" />
                          Cost center budget
                        </Label>
                        {(() => {
                          const importedCc = sharedCostCenters.find(sc => sc.ccId === selectedCcId)
                          const liveCcBudget = importedCc?.budgetAmount ?? null
                          const noChangeNeeded = recommendedCostCenterBudget === 0 && isReservoirSufficient
                          const defaultValue = noChangeNeeded && liveCcBudget !== null ? liveCcBudget : recommendedCostCenterBudget

                          return (
                            <>
                              {liveCcBudget !== null ? (
                                <>
                                  <div className="grid grid-cols-3 gap-2">
                                    <div className="text-center p-2 rounded bg-muted/60 space-y-1">
                                      <div className="text-[10px] text-muted-foreground uppercase tracking-wide">Current on GitHub</div>
                                      <div className={`text-lg font-bold mono ${!noChangeNeeded && liveCcBudget < recommendedCostCenterBudget ? 'text-warning' : 'text-foreground'}`}>
                                        ${liveCcBudget.toLocaleString()}<span className="text-xs font-normal text-muted-foreground">/mo</span>
                                      </div>
                                    </div>
                                    <div className="text-center p-2 rounded bg-success/10 border border-success/20 space-y-1">
                                      <div className="text-[10px] text-muted-foreground uppercase tracking-wide">Suggested Minimum</div>
                                      {noChangeNeeded ? (
                                        <div className="text-sm font-medium text-success pt-1">No change needed</div>
                                      ) : (
                                        <div className="text-lg font-bold mono text-success">${recommendedCostCenterBudget.toLocaleString()}<span className="text-xs font-normal text-muted-foreground">/mo</span></div>
                                      )}
                                    </div>
                                    <div className="text-center p-2 rounded bg-primary/5 border border-primary/20 space-y-1">
                                      <div className="text-[10px] text-muted-foreground uppercase tracking-wide">Set to</div>
                                      <div className="flex items-center justify-center gap-1">
                                        <span className="text-xs text-muted-foreground">$</span>
                                        <NumericInput
                                          min={0}
                                          value={ccBudgetAmount ?? defaultValue}
                                          onValueChange={v => setCcBudgetAmount(v)}
                                          commas
                                          className="text-sm h-7 mono w-20 text-center"
                                        />
                                      </div>
                                      {ccBudgetAmount === null && !noChangeNeeded && (
                                        <div className="text-[10px] text-success font-medium">meets minimum</div>
                                      )}
                                    </div>
                                  </div>
                                  {!noChangeNeeded && liveCcBudget < recommendedCostCenterBudget && (
                                    <p className="text-[11px] text-warning">
                                      Current is ${(recommendedCostCenterBudget - liveCcBudget).toLocaleString()} below the suggested minimum. Consider increasing it.
                                    </p>
                                  )}
                                </>
                              ) : (
                                <div className="flex items-center gap-2">
                                  <span className="text-xs font-medium">$</span>
                                  <NumericInput
                                    min={0}
                                    value={ccBudgetAmount ?? defaultValue}
                                    onValueChange={v => setCcBudgetAmount(v)}
                                    commas
                                    className="text-xs h-7 mono w-24"
                                  />
                                  {recommendedCostCenterBudget > 0 && (
                                    <Badge variant="outline" className="text-[10px] py-0 px-1.5 border-success/50 text-success">
                                      min ${recommendedCostCenterBudget.toLocaleString()}
                                    </Badge>
                                  )}
                                </div>
                              )}
                              <p className="text-[11px] text-muted-foreground">
                                Caps metered charges for users in this cost center.
                                {recommendedCostCenterBudget > 0
                                  ? ` Suggested minimum: $${recommendedCostCenterBudget.toLocaleString()}/mo (based on your ULB settings)`
                                  : isReservoirSufficient
                                    ? ' Your pool currently covers all usage, so any amount here acts as a safety net'
                                    : ''}
                              </p>
                            </>
                          )
                        })()}
                        {(() => {
                          const inputBudget = ccBudgetAmount ?? (recommendedCostCenterBudget === 0 && isReservoirSufficient && powerCc ? powerCc.budgetAmount : recommendedCostCenterBudget)
                          const constraint = calcCostCenterBudgetConstraint(inputBudget, recommendations)
                          if (!constraint.isBinding) return null
                          return (
                            <Alert className="border-warning/50 bg-warning/10 py-2">
                              <AlertDescription className="text-xs space-y-1">
                                <p>
                                  ⚠️ <strong>This budget will cap power user usage.</strong>{' '}
                                  At ${inputBudget.toLocaleString()}, these users can only consume ${Math.ceil(constraint.affordableConsumption).toLocaleString()} ({Math.round(constraint.capacityPercent)}% of their ${Math.ceil(constraint.maxConsumption).toLocaleString()} potential). Recommended: ${recommendedCostCenterBudget.toLocaleString()}.
                                </p>
                              </AlertDescription>
                            </Alert>
                          )
                        })()}
                      </div>
                    )}

                    {/* Assign button */}
                    <Button
                      size="sm"
                      className="h-8 gap-1.5 text-xs w-full"
                      disabled={
                        assignLoading ||
                        (!selectedCcId && !creatingNew) ||
                        (creatingNew && !newCcName.trim())
                      }
                      onClick={handleAssign}
                    >
                      {assignLoading ? <SpinnerGap size={12} className="animate-spin" /> : <ArrowRight size={12} />}
                      Assign & Set Budget
                    </Button>

                    {assignResult && (
                      <div className="space-y-1.5">
                        <p className={`text-xs font-medium ${assignResult.ok ? 'text-success' : 'text-destructive'}`}>
                          {assignResult.message}
                        </p>
                        {assignResult.ok && assignResult.budgetUrl && (
                          <>
                            <Alert className="border-primary/40 bg-primary/5 py-2">
                              <Info size={14} weight="fill" className="text-primary" />
                              <AlertDescription className="text-xs">
                                <strong>Next:</strong> set up alert recipients so you're notified when this budget is reached →{' '}
                                <a
                                  href={assignResult.budgetUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="underline font-medium text-primary"
                                >
                                  Edit budget alerts on GitHub ↗
                                </a>
                              </AlertDescription>
                            </Alert>
                            <Alert className="border-accent/40 bg-accent/5 py-2">
                              <ArrowsClockwise size={14} weight="fill" className="text-accent" />
                              <AlertDescription className="text-xs">
                                <strong>Automate it:</strong> keep this cost center in sync with an enterprise team →{' '}
                                <button
                                  onClick={() => onNavigateToTab?.('team-sync')}
                                  className="underline font-medium text-accent hover:text-accent/80 transition-colors"
                                >
                                  Enterprise Team → Cost Center Sync script
                                </button>
                              </AlertDescription>
                            </Alert>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground/70 italic">
            <button onClick={onNavigateToImport} className="underline underline-offset-2 hover:text-foreground transition-colors">Connect your Enterprise</button> to pick users from an enterprise team here.
          </p>
        )}

          </>
        )}
      </div>
    </div>
  )
}
