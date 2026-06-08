import { useState, useMemo } from 'react'
import { NumericInput } from '@/components/ui/numeric-input'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Checkbox } from '@/components/ui/checkbox'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Buildings,
  ArrowRight,
  SpinnerGap,
  Plus,
  Trash,
  Info,
  UsersThree,
  ArrowsClockwise,
  CaretDown,
  CaretUp,
  Lock,
  Warning,
} from '@phosphor-icons/react'
import { patchBudget, createBudget, withRateLimitRetry, ApiError } from '@/lib/api'
import { budgetEditUrl, memberUrl } from '@/lib/utils'
import { StepHeaderStatus } from './StepHeaderStatus'
import { useTierPlanner } from './TierPlannerContext'

export function StepIndividualBudgets({ stepNumber = 4 }: { stepNumber?: number }) {
  const {
    credentials, apiFetch,
    members, selectedTeam,
    teams, teamsLoading, teamsError, fetchTeams, fetchMembers,
    liveUserBudgets,
    powerUserBudget,
    sharedCostCenters, hasCostCenters,
    fetchAllBudgets, onNavigateToImport,
    budgetCapEnabled, maxAffordablePUB,
    stepsExpandedSignal,
  } = useTierPlanner()

  const basePub = Math.round(powerUserBudget)
  const budgetLockMaxPub = maxAffordablePUB !== null && isFinite(maxAffordablePUB) ? Math.floor(maxAffordablePUB) : null
  const cappedByBudgetLock = budgetCapEnabled && budgetLockMaxPub !== null && budgetLockMaxPub < basePub
  const specificULBTotal = cappedByBudgetLock ? budgetLockMaxPub : basePub

  const [expanded, setExpanded] = useState(false)
  const [prevSignal, setPrevSignal] = useState(stepsExpandedSignal)
  if (stepsExpandedSignal !== prevSignal) {
    setPrevSignal(stepsExpandedSignal)
    setExpanded(stepsExpandedSignal % 2 === 1)
  }
  const [usernames, setUsernames] = useState('')
  const [amount, setAmount] = useState<number | null>(null)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null)
  const [failedLogins, setFailedLogins] = useState<string[]>([])
  const [deselected, setDeselected] = useState<Set<string>>(new Set())
  const [manualExpanded, setManualExpanded] = useState(false)
  // Logins explicitly opted in by the admin despite being protected (have a higher existing budget than `effectiveAmount`).
  // Sticky across amount changes; reset when the underlying members list changes.
  const [protectedOverridden, setProtectedOverridden] = useState<Set<string>>(new Set())
  const [showLowerConfirm, setShowLowerConfirm] = useState(false)

  // Reset deselections when members list changes
  const [prevMembers, setPrevMembers] = useState(members)
  if (prevMembers !== members && members.length > 0) {
    setPrevMembers(members)
    if (deselected.size > 0) {
      setDeselected(new Set())
    }
    if (protectedOverridden.size > 0) {
      setProtectedOverridden(new Set())
    }
  }

  // Effective amount the admin is about to apply. Falls back to the recommended power-user ULB until the admin types one.
  const effectiveAmount = amount ?? specificULBTotal

  // Users whose existing budget on GitHub is >= what the admin is about to apply.
  // Excluding them by default prevents silently lowering custom amounts set elsewhere (e.g. Consumption Analysis Apply).
  const protectedLogins = useMemo(() => {
    const out = new Set<string>()
    for (const ub of liveUserBudgets) {
      if (ub.amount >= effectiveAmount) out.add(ub.login)
    }
    return out
  }, [liveUserBudgets, effectiveAmount])

  const selectedLogins = useMemo(
    () => new Set(
      members
        .filter(m => !deselected.has(m.login))
        .filter(m => !protectedLogins.has(m.login) || protectedOverridden.has(m.login))
        .map(m => m.login)
    ),
    [members, deselected, protectedLogins, protectedOverridden]
  )

  // Org-imported members
  const orgMembers = useMemo(() => {
    const seen = new Set<string>()
    const result: Array<{ login: string; ccName: string }> = []
    for (const sc of sharedCostCenters) {
      if (!sc.orgMemberLogins || sc.orgMemberLogins.length === 0) continue
      for (const login of sc.orgMemberLogins) {
        if (!seen.has(login)) {
          seen.add(login)
          result.push({ login, ccName: sc.name })
        }
      }
    }
    return result
  }, [sharedCostCenters])

  const [orgDeselected, setOrgDeselected] = useState<Set<string>>(new Set())
  const orgSelectedLogins = useMemo(
    () => new Set(
      orgMembers
        .filter(m => !orgDeselected.has(m.login))
        .filter(m => !protectedLogins.has(m.login) || protectedOverridden.has(m.login))
        .map(m => m.login)
    ),
    [orgMembers, orgDeselected, protectedLogins, protectedOverridden]
  )

  const applyForUsers = async (users: string[]) => {
    if (!credentials || users.length === 0) return
    setLoading(true)
    setResult(null)
    setFailedLogins([])
    const amt = amount ?? specificULBTotal

    let created = 0
    let updated = 0
    const failed: string[] = []
    let rateLimited = false
    for (const login of users) {
      const existing = liveUserBudgets.find(b => b.login === login)
      try {
        if (existing) {
          await withRateLimitRetry(() => patchBudget(apiFetch, credentials.ent, existing.id, { budget_amount: amt }))
          updated++
        } else {
          await withRateLimitRetry(() => createBudget(apiFetch, credentials.ent, {
            budget_amount: amt,
            prevent_further_usage: true,
            budget_scope: 'user',
            budget_entity_name: login,
            user: login,
            budget_type: 'BundlePricing',
            budget_product_sku: 'premium_requests',
            budget_alerting: { will_alert: false, alert_recipients: [] },
          }))
          created++
        }
      } catch (err) {
        failed.push(login)
        if (err instanceof ApiError && err.status === 429) rateLimited = true
      }
    }

    fetchAllBudgets()
    setFailedLogins(failed)

    const parts = []
    if (created > 0) parts.push(`${created} created`)
    if (updated > 0) parts.push(`${updated} updated`)
    if (failed.length > 0) parts.push(`${failed.length} failed`)
    let message = `${failed.length === 0 ? '✓' : '⚠'} ${parts.join(', ')} at $${amt}/user`
    if (failed.length > 0) {
      message += `. Failed: ${failed.join(', ')}`
      if (rateLimited) message += ' (rate limited)'
    }
    setResult({ ok: failed.length === 0, message })
    setLoading(false)
  }

  const handleApply = async () => {
    const fromMembers = members.length > 0 ? Array.from(selectedLogins) : []
    const fromOrg = Array.from(orgSelectedLogins)
    const fromManual = usernames.split(',').map(u => u.trim()).filter(u => u.length > 0)
    const users = [...new Set([...fromMembers, ...fromOrg, ...fromManual])]
    await applyForUsers(users)
  }

  // Final users that will be sent to Apply. Used to compute the lowering set (for the confirm dialog).
  const finalApplySet = useMemo(() => {
    const fromMembers = members.length > 0 ? Array.from(selectedLogins) : []
    const fromOrg = Array.from(orgSelectedLogins)
    const fromManual = usernames.split(',').map(u => u.trim()).filter(u => u.length > 0)
    return new Set([...fromMembers, ...fromOrg, ...fromManual])
  }, [members, selectedLogins, orgSelectedLogins, usernames])

  // Users whose existing budget is strictly higher than what we're about to apply.
  // Triggers the confirmation dialog so admins don't silently lower custom amounts (e.g. from Consumption Analysis Apply).
  const loweringSet = useMemo(() => {
    const out: Array<{ login: string; from: number; to: number }> = []
    for (const login of finalApplySet) {
      const existing = liveUserBudgets.find(b => b.login === login)
      if (existing && existing.amount > effectiveAmount) {
        out.push({ login, from: existing.amount, to: effectiveAmount })
      }
    }
    return out
  }, [finalApplySet, liveUserBudgets, effectiveAmount])

  const handleApplyClick = () => {
    if (loweringSet.length > 0) {
      setShowLowerConfirm(true)
    } else {
      handleApply()
    }
  }

  const handleConfirmLower = async () => {
    setShowLowerConfirm(false)
    await handleApply()
  }

  const handleRetryFailed = () => applyForUsers([...failedLogins])

  return (
    <div className="flex gap-3 items-start p-3 rounded-lg border border-border bg-card">
      <div className="w-6 h-6 rounded-full bg-success flex items-center justify-center flex-shrink-0 mt-0.5" aria-label={`Step ${stepNumber}`}>
        <span className="text-success-foreground text-xs font-bold" aria-hidden="true">{stepNumber}</span>
      </div>
      <div className="flex-1 space-y-3">
        <div
          className="flex justify-between items-center cursor-pointer select-none hover:bg-muted/40 -m-3 p-3 rounded-lg transition-colors"
          onClick={(e) => { e.stopPropagation(); setExpanded(prev => !prev); if (!expanded) fetchAllBudgets() }}
        >
          <span className="font-semibold">Set Individual User-Level Budgets</span>
          <div className="flex items-center justify-end gap-2 min-w-[18rem]">
            {cappedByBudgetLock && (
              <span className="text-sm mono text-accent">
                Budget Lock max ${specificULBTotal.toLocaleString()}/mo
              </span>
            )}
            <StepHeaderStatus tone="review" />
            {expanded ? <CaretUp size={14} className="text-muted-foreground" /> : <CaretDown size={14} className="text-muted-foreground" />}
          </div>
        </div>
        {expanded && (
          <>
        <p className="text-xs text-muted-foreground">
          {hasCostCenters
            ? 'Overrides the universal budget for power users. Pick members from the enterprise team or cost center selected in Step 2, or enter usernames manually below'
            : 'Overrides the universal budget for power users. Pick members from an enterprise team, or enter usernames manually below'}
        </p>

        {credentials ? (
          <div className="space-y-3 pt-1">
              <div className="space-y-3 rounded-lg border border-border p-3 bg-muted/30">
                {/* Existing budgets */}
                {(() => {
                  const memberLogins = new Set(members.map(m => m.login))
                  const nonMemberBudgets = liveUserBudgets.filter(ub => !memberLogins.has(ub.login))
                  if (nonMemberBudgets.length === 0) return null
                  return (
                    <div className="space-y-1.5">
                      <div className="grid grid-cols-3 gap-1 text-[10px] text-muted-foreground uppercase tracking-wide px-1">
                        <span>User</span>
                        <span className="text-center">Current</span>
                        <span className="text-center">Suggested Min</span>
                      </div>
                      <div className="max-h-36 overflow-y-auto space-y-1">
                        {nonMemberBudgets.map(ub => {
                          const editUrl = budgetEditUrl(credentials.base, credentials.ent, ub.id)
                          const isBelow = ub.amount < specificULBTotal
                          return (
                            <a
                              key={ub.id}
                              href={editUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="grid grid-cols-3 items-center px-2 py-1 rounded bg-muted/40 text-xs hover:bg-accent/10 transition-colors"
                            >
                              <span className="font-medium truncate underline underline-offset-2 decoration-muted-foreground/40">{ub.login} ↗</span>
                              <span className={`mono text-center ${isBelow ? 'text-warning' : 'text-foreground'}`}>${ub.amount.toLocaleString()}</span>
                              {isBelow ? (
                                <span className="mono text-center text-success">${specificULBTotal.toLocaleString()} ↗</span>
                              ) : (
                                <span className="text-center text-success text-[10px]">✓ meets min</span>
                              )}
                            </a>
                          )
                        })}
                      </div>
                    </div>
                  )
                })()}
                {liveUserBudgets.length === 0 && (
                  <p className="text-[11px] text-muted-foreground">No individual user-level budgets found</p>
                )}

                <Separator />

                {/* Bulk create/update */}
                <div className="space-y-2">
                  <Label className="text-xs font-semibold">Bulk Create / Update</Label>

                  {/* Inline team picker when no cost centers (team picker normally lives in Step 2) */}
                  {!hasCostCenters && members.length === 0 && (
                    <div className="space-y-2">
                      {teams.length === 0 ? (
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-xs h-7 gap-1.5"
                          onClick={fetchTeams}
                          disabled={teamsLoading}
                        >
                          {teamsLoading ? <SpinnerGap size={12} className="animate-spin" /> : <UsersThree size={12} weight="duotone" />}
                          Load enterprise teams
                        </Button>
                      ) : (
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between">
                            <Label className="text-[11px] text-muted-foreground">Select a team to pick members from</Label>
                            <Button variant="ghost" size="sm" className="h-5 px-1.5 text-[10px] gap-1" onClick={fetchTeams} disabled={teamsLoading}>
                              <ArrowsClockwise size={10} className={teamsLoading ? 'animate-spin' : ''} />
                              Refresh
                            </Button>
                          </div>
                          <div className="space-y-0.5 max-h-28 overflow-y-auto">
                            {teams.map(team => (
                              <button
                                key={team.id}
                                className="w-full text-left px-2 py-1 rounded text-xs hover:bg-accent/10 transition-colors flex items-center gap-2"
                                onClick={() => fetchMembers(team)}
                              >
                                <UsersThree size={12} weight="duotone" className="text-muted-foreground" />
                                <span className="font-medium">{team.name}</span>
                                {team.description && <span className="text-muted-foreground truncate">· {team.description}</span>}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                      {teamsError && <p className="text-[11px] text-destructive">{teamsError}</p>}
                    </div>
                  )}

                  {members.length > 0 ? (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                          <UsersThree size={12} weight="duotone" />
                          {selectedTeam ? `${selectedTeam.name} members` : 'Team members'} ({members.length})
                        </Label>
                        <div className="flex gap-1">
                          <Button variant="ghost" size="sm" className="h-5 px-1.5 text-[10px]"
                            onClick={() => {
                              setDeselected(new Set())
                              setProtectedOverridden(prev => {
                                const next = new Set(prev)
                                for (const m of members) {
                                  if (protectedLogins.has(m.login)) next.add(m.login)
                                }
                                return next
                              })
                            }}>
                            All
                          </Button>
                          <Button variant="ghost" size="sm" className="h-5 px-1.5 text-[10px]"
                            onClick={() => {
                              setDeselected(new Set(members.map(m => m.login)))
                              setProtectedOverridden(prev => {
                                const next = new Set(prev)
                                for (const m of members) next.delete(m.login)
                                return next
                              })
                            }}>
                            None
                          </Button>
                        </div>
                      </div>
                      {protectedLogins.size > 0 && members.some(m => protectedLogins.has(m.login)) && (() => {
                        const teamProtected = members.filter(m => protectedLogins.has(m.login)).map(m => m.login)
                        const teamOverridden = teamProtected.filter(l => protectedOverridden.has(l))
                        const allTeamOverridden = teamOverridden.length === teamProtected.length
                        return (
                        <Alert className="py-2 border-warning/40 bg-warning/5">
                          <Lock size={14} weight="duotone" className="text-warning" />
                          <AlertDescription className="text-[11px] space-y-1">
                            <div>
                              <span className="font-semibold text-foreground">
                                {teamProtected.length} user{teamProtected.length === 1 ? '' : 's'}
                              </span>{' '}
                              already have a custom budget ≥ ${effectiveAmount.toLocaleString()} (e.g. from Consumption Analysis). Excluded by default to avoid lowering them.
                              {teamOverridden.length > 0 && (
                                <span className="text-muted-foreground"> Their amounts are hidden from the cohort summary below.</span>
                              )}
                            </div>
                            <div className="flex gap-2 pt-0.5">
                              {!allTeamOverridden && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-6 px-2 text-[10px] border-warning/50 hover:bg-warning/10"
                                  onClick={() => setProtectedOverridden(prev => {
                                    const next = new Set(prev)
                                    for (const l of teamProtected) next.add(l)
                                    return next
                                  })}
                                >
                                  Include all anyway
                                </Button>
                              )}
                              {teamOverridden.length > 0 && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-6 px-2 text-[10px]"
                                  onClick={() => setProtectedOverridden(prev => {
                                    const next = new Set(prev)
                                    for (const l of teamProtected) next.delete(l)
                                    return next
                                  })}
                                >
                                  Re-protect
                                </Button>
                              )}
                            </div>
                          </AlertDescription>
                        </Alert>
                        )
                      })()}
                      <div className="space-y-0.5 max-h-40 overflow-y-auto rounded border border-border bg-background/50 p-1">
                        {members.map(m => {
                          const hasExisting = liveUserBudgets.find(b => b.login === m.login)
                          const isProtected = protectedLogins.has(m.login)
                          const isOverridden = protectedOverridden.has(m.login)
                          return (
                            <label key={m.login} className="flex items-center gap-2 px-2 py-1 rounded hover:bg-accent/10 cursor-pointer text-xs select-none">
                              <Checkbox
                                checked={selectedLogins.has(m.login)}
                                onCheckedChange={(checked) => {
                                  if (isProtected) {
                                    setProtectedOverridden(prev => {
                                      const next = new Set(prev)
                                      if (checked) next.add(m.login)
                                      else next.delete(m.login)
                                      return next
                                    })
                                    // Also clear from deselected — a login can have been
                                    // unchecked before it became protected (or via None);
                                    // without this clear, checking it as a protected user
                                    // would still leave it filtered out by `deselected`.
                                    if (checked) {
                                      setDeselected(prev => {
                                        if (!prev.has(m.login)) return prev
                                        const next = new Set(prev)
                                        next.delete(m.login)
                                        return next
                                      })
                                    }
                                  } else {
                                    setDeselected(prev => {
                                      const next = new Set(prev)
                                      if (checked) next.delete(m.login)
                                      else next.add(m.login)
                                      return next
                                    })
                                  }
                                }}
                              />
                              {credentials ? (
                                <a
                                  href={hasExisting
                                    ? budgetEditUrl(credentials.base, credentials.ent, hasExisting.id)
                                    : memberUrl(credentials.base, credentials.ent, m.login)
                                  }
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  onClick={e => e.stopPropagation()}
                                  className="font-medium mono underline underline-offset-2 decoration-muted-foreground/40 hover:decoration-primary hover:text-primary transition-colors"
                                >
                                  {m.login} ↗
                                </a>
                              ) : (
                                <span className="font-medium mono">{m.login}</span>
                              )}
                              <span className="flex-1" />
                              {isProtected && !isOverridden && (
                                <Badge variant="outline" className="text-[9px] py-0 px-1 border-warning/60 text-warning gap-0.5">
                                  <Lock size={8} weight="duotone" />
                                  protected
                                </Badge>
                              )}
                              {isProtected && isOverridden && (
                                <Badge variant="outline" className="text-[9px] py-0 px-1 border-destructive/60 text-destructive gap-0.5">
                                  <Warning size={8} weight="duotone" />
                                  will lower
                                </Badge>
                              )}
                              {hasExisting && (
                                <Badge variant="outline" className="text-[9px] py-0 px-1 border-warning/50 text-warning">
                                  ${hasExisting.amount}
                                </Badge>
                              )}
                            </label>
                          )
                        })}
                      </div>

                      <button
                        className="text-[11px] text-muted-foreground hover:text-foreground flex items-center gap-1 w-full pt-0.5"
                        onClick={() => setManualExpanded(e => !e)}
                      >
                        <Plus size={10} />
                        {manualExpanded ? 'Hide manual input' : 'Or add usernames manually'}
                      </button>
                      {manualExpanded && (
                        <Input
                          placeholder="dev-lead-1, architect-1"
                          value={usernames}
                          onChange={e => setUsernames(e.target.value)}
                          className="text-xs h-7 mono"
                        />
                      )}
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      <Label className="text-[11px] text-muted-foreground">Usernames (comma-separated)</Label>
                      <Input
                        placeholder="dev-lead-1, architect-1, principal-eng"
                        value={usernames}
                        onChange={e => setUsernames(e.target.value)}
                        className="text-xs h-7 mono"
                      />
                    </div>
                  )}

                  {/* Org-imported members */}
                  {orgMembers.length > 0 && (
                    <div className="space-y-2 pt-1">
                      <Separator />
                      <div className="flex items-center justify-between">
                        <Label className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                          <Buildings size={12} weight="duotone" />
                          Org-imported members ({orgMembers.length})
                        </Label>
                        <div className="flex gap-1">
                          <Button variant="ghost" size="sm" className="h-5 px-1.5 text-[10px]"
                            onClick={() => {
                              setOrgDeselected(new Set())
                              setProtectedOverridden(prev => {
                                const next = new Set(prev)
                                for (const m of orgMembers) {
                                  if (protectedLogins.has(m.login)) next.add(m.login)
                                }
                                return next
                              })
                            }}>
                            All
                          </Button>
                          <Button variant="ghost" size="sm" className="h-5 px-1.5 text-[10px]"
                            onClick={() => {
                              setOrgDeselected(new Set(orgMembers.map(m => m.login)))
                              setProtectedOverridden(prev => {
                                const next = new Set(prev)
                                for (const m of orgMembers) next.delete(m.login)
                                return next
                              })
                            }}>
                            None
                          </Button>
                        </div>
                      </div>
                      <div className="space-y-0.5 max-h-36 overflow-y-auto rounded border border-border bg-background/50 p-1">
                        {orgMembers.map(m => {
                          const hasExisting = liveUserBudgets.find(b => b.login === m.login)
                          const isProtected = protectedLogins.has(m.login)
                          const isOverridden = protectedOverridden.has(m.login)
                          return (
                            <label key={m.login} className="flex items-center gap-2 px-2 py-1 rounded hover:bg-accent/10 cursor-pointer text-xs select-none">
                              <Checkbox
                                checked={orgSelectedLogins.has(m.login)}
                                onCheckedChange={(checked) => {
                                  if (isProtected) {
                                    setProtectedOverridden(prev => {
                                      const next = new Set(prev)
                                      if (checked) next.add(m.login)
                                      else next.delete(m.login)
                                      return next
                                    })
                                    // Clear any stale orgDeselected entry so the visual
                                    // checkbox state matches the include behavior.
                                    if (checked) {
                                      setOrgDeselected(prev => {
                                        if (!prev.has(m.login)) return prev
                                        const next = new Set(prev)
                                        next.delete(m.login)
                                        return next
                                      })
                                    }
                                  } else {
                                    setOrgDeselected(prev => {
                                      const next = new Set(prev)
                                      if (checked) next.delete(m.login)
                                      else next.add(m.login)
                                      return next
                                    })
                                  }
                                }}
                              />
                              {credentials ? (
                                <a
                                  href={hasExisting
                                    ? budgetEditUrl(credentials.base, credentials.ent, hasExisting.id)
                                    : memberUrl(credentials.base, credentials.ent, m.login)
                                  }
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  onClick={e => e.stopPropagation()}
                                  className="font-medium mono underline underline-offset-2 decoration-muted-foreground/40 hover:decoration-primary hover:text-primary transition-colors"
                                >
                                  {m.login} ↗
                                </a>
                              ) : (
                                <span className="font-medium mono">{m.login}</span>
                              )}
                              <span className="flex-1" />
                              <Badge variant="outline" className="text-[9px] py-0 px-1.5 border-primary/40 text-primary/80 flex-shrink-0">
                                org
                              </Badge>
                              <span className="text-[9px] text-muted-foreground flex-shrink-0 hidden sm:inline">{m.ccName}</span>
                              {isProtected && !isOverridden && (
                                <Badge variant="outline" className="text-[9px] py-0 px-1 border-warning/60 text-warning gap-0.5 flex-shrink-0">
                                  <Lock size={8} weight="duotone" />
                                  protected
                                </Badge>
                              )}
                              {isProtected && isOverridden && (
                                <Badge variant="outline" className="text-[9px] py-0 px-1 border-destructive/60 text-destructive gap-0.5 flex-shrink-0">
                                  <Warning size={8} weight="duotone" />
                                  will lower
                                </Badge>
                              )}
                              {hasExisting && (
                                <Badge variant="outline" className="text-[9px] py-0 px-1 border-warning/50 text-warning flex-shrink-0">
                                  ${hasExisting.amount}
                                </Badge>
                              )}
                            </label>
                          )
                        })}
                      </div>
                      <p className="text-[10px] text-muted-foreground">
                        Members resolved from Organization-type cost center resources. Budget will apply to all selected.
                      </p>
                    </div>
                  )}

                  <div className="space-y-1.5">
                    <Label className="text-[11px] text-muted-foreground">Budget per user ($)</Label>
                    {(() => {
                      const selectedUserBudgets = liveUserBudgets.filter(ub =>
                        selectedLogins.has(ub.login) ||
                        orgSelectedLogins.has(ub.login) ||
                        usernames.split(',').map(u => u.trim()).includes(ub.login)
                      )
                      const hasExisting = selectedUserBudgets.length > 0
                      const minExisting = hasExisting ? Math.min(...selectedUserBudgets.map(b => b.amount)) : null
                      const maxExisting = hasExisting ? Math.max(...selectedUserBudgets.map(b => b.amount)) : null
                      const suggestedMin = cappedByBudgetLock ? Math.floor(maxAffordablePUB!) : Math.round(powerUserBudget)
                      const anyBelow = hasExisting && minExisting! < suggestedMin

                      return hasExisting ? (
                        <>
                          <div className="grid grid-cols-3 gap-2">
                            <div className="text-center p-2 rounded bg-muted/60 space-y-1">
                              <div className="text-[10px] text-muted-foreground uppercase tracking-wide">Current on GitHub</div>
                              <div className={`text-lg font-bold mono ${anyBelow ? 'text-warning' : 'text-foreground'}`}>
                                {minExisting === maxExisting
                                  ? `$${minExisting!.toLocaleString()}`
                                  : `$${minExisting!.toLocaleString()} - $${maxExisting!.toLocaleString()}`}<span className="text-xs font-normal text-muted-foreground">/mo</span>
                              </div>
                            </div>
                            <div className={`text-center p-2 rounded space-y-1 ${cappedByBudgetLock ? 'bg-accent/10 border border-accent/20' : 'bg-success/10 border border-success/20'}`}>
                              <div className="text-[10px] text-muted-foreground uppercase tracking-wide">
                                {cappedByBudgetLock ? 'Budget Lock Max' : 'Suggested Minimum'}
                              </div>
                              <div className={`text-lg font-bold mono ${cappedByBudgetLock ? 'text-accent' : 'text-success'}`}>${suggestedMin.toLocaleString()}<span className="text-xs font-normal text-muted-foreground">/mo</span></div>
                              {cappedByBudgetLock && (
                                <div className="text-[10px] text-muted-foreground">was ${basePub.toLocaleString()}</div>
                              )}
                            </div>
                            <div className="text-center p-2 rounded bg-primary/5 border border-primary/20 space-y-1">
                              <div className="text-[10px] text-muted-foreground uppercase tracking-wide">Set to</div>
                              <div className="flex items-center justify-center gap-1">
                                <span className="text-xs text-muted-foreground">$</span>
                                <NumericInput
                                  min={0}
                                  value={amount ?? suggestedMin}
                                  onValueChange={v => setAmount(v)}
                                  allowFloat
                                  commas
                                  className="text-sm h-7 mono w-20 text-center"
                                />
                              </div>
                              {amount === null && (
                                <div className="text-[10px] text-success font-medium">meets minimum</div>
                              )}
                            </div>
                          </div>
                          {anyBelow && (
                            <p className="text-[11px] text-warning">
                              {selectedUserBudgets.filter(b => b.amount < suggestedMin).length} user{selectedUserBudgets.filter(b => b.amount < suggestedMin).length !== 1 ? 's' : ''} below the suggested minimum. Consider increasing.
                            </p>
                          )}
                        </>
                      ) : (
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-medium">$</span>
                          <NumericInput
                            min={0}
                            value={amount ?? suggestedMin}
                            onValueChange={v => setAmount(v)}
                            allowFloat
                            commas
                            className="text-xs h-7 mono w-24"
                          />
                          <Badge variant="outline" className={`text-[10px] py-0 px-1.5 ${cappedByBudgetLock ? 'border-accent/50 text-accent' : 'border-success/50 text-success'}`}>
                            {cappedByBudgetLock ? `max $${suggestedMin.toLocaleString()}/mo` : `min $${suggestedMin.toLocaleString()}/mo`}
                          </Badge>
                        </div>
                      )
                    })()}
                  </div>
                </div>

                <div className="flex gap-2">
                <Button
                  size="sm"
                  className={`h-8 gap-1.5 text-xs flex-1 ${loweringSet.length > 0 ? 'bg-destructive hover:bg-destructive/90 text-destructive-foreground' : ''}`}
                  disabled={loading || (members.length > 0 || orgMembers.length > 0 ? selectedLogins.size === 0 && orgSelectedLogins.size === 0 && !usernames.trim() : !usernames.trim())}
                  onClick={handleApplyClick}
                >
                  {loading ? <SpinnerGap size={12} className="animate-spin" /> : (loweringSet.length > 0 ? <Warning size={12} weight="duotone" /> : <ArrowRight size={12} />)}
                  {(() => {
                    const count = finalApplySet.size
                    if (loweringSet.length > 0) {
                      return `Apply (lowers ${loweringSet.length} custom budget${loweringSet.length === 1 ? '' : 's'})`
                    }
                    return `Set Budgets for ${count} User${count !== 1 ? 's' : ''}`
                  })()}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 gap-1.5 text-xs hover:text-destructive hover:border-destructive/50"
                  disabled={loading}
                  onClick={() => { setAmount(null); setResult(null) }}
                >
                  <Trash size={12} weight="duotone" />
                  Discard
                </Button>
                </div>

                {result && (
                  <div className="space-y-1.5">
                    <p className={`text-xs font-medium ${result.ok ? 'text-success' : 'text-warning'}`}>
                      {result.message}
                    </p>
                    {failedLogins.length > 0 && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-6 text-xs gap-1"
                        onClick={handleRetryFailed}
                        disabled={loading}
                      >
                        <ArrowsClockwise size={12} weight="duotone" />
                        Retry {failedLogins.length} failed
                      </Button>
                    )}
                  </div>
                )}

                <Alert className="border-primary/40 bg-primary/5 py-2">
                  <Info size={14} weight="fill" className="text-primary" />
                  <AlertDescription className="text-xs">
                    Creates new user budgets or updates existing ones. Each overrides the universal ULB for that user.
                  </AlertDescription>
                </Alert>
              </div>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground/70 italic">
            <button onClick={onNavigateToImport} className="underline underline-offset-2 hover:text-foreground transition-colors">Connect your Enterprise</button> to manage individual user-level budgets here.
          </p>
        )}
          </>
        )}
      </div>

      <AlertDialog open={showLowerConfirm} onOpenChange={setShowLowerConfirm}>
        <AlertDialogContent className="sm:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>
              Lower {loweringSet.length} custom budget{loweringSet.length === 1 ? '' : 's'}?
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm">
                <p>
                  The following user{loweringSet.length === 1 ? ' has' : 's have'} a custom budget higher than the
                  ${' '}<span className="font-semibold text-foreground">${effectiveAmount.toLocaleString()}</span> cohort amount.
                  Applying will lower {loweringSet.length === 1 ? 'it' : 'them'}.
                </p>
                <p className="text-xs text-muted-foreground">
                  Custom amounts may have been set in Budget Planner → Consumption Analysis. To keep them, uncheck those users (or click <span className="font-semibold">Re-protect</span> in the protection banner) and apply only to the rest.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="max-h-[280px] overflow-y-auto border border-border/60 rounded-md">
            <div className="grid grid-cols-[1fr_80px_80px] gap-2 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground border-b border-border/60 bg-muted/30 sticky top-0">
              <span>Login</span>
              <span className="text-right">From</span>
              <span className="text-right">To</span>
            </div>
            <div className="divide-y divide-border/40 text-xs">
              {loweringSet.map(row => (
                <div key={row.login} className="grid grid-cols-[1fr_80px_80px] gap-2 px-3 py-1.5 items-center">
                  <span className="truncate font-medium mono">{row.login}</span>
                  <span className="text-right tabular-nums text-muted-foreground">${row.from.toLocaleString()}</span>
                  <span className="text-right tabular-nums font-semibold text-destructive">${row.to.toLocaleString()}</span>
                </div>
              ))}
            </div>
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel disabled={loading}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmLower}
              disabled={loading}
              className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
            >
              {loading ? 'Applying…' : `Yes, lower ${loweringSet.length}`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
