import { useState } from 'react'
import { NumericInput } from '@/components/ui/numeric-input'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { FormulaTooltip } from '@/components/FormulaTooltip'
import {
  Warning,
  ArrowRight,
  SpinnerGap,
  Trash,
  ShieldCheck,
  CaretDown,
  CaretUp,
} from '@phosphor-icons/react'
import { patchBudget } from '@/lib/api'
import { StepHeaderStatus } from './StepHeaderStatus'
import { useTierPlanner } from './TierPlannerContext'

export function StepEnterpriseBudget({ stepNumber = 1 }: { stepNumber?: number }) {
  const {
    credentials, apiFetch, budgetMeta,
    recommendations, effectiveEntBudgetMin, entBudgetConstraint,
    effectiveExcludeCostCenterUsage, tier,
    liveEntBudget, setLiveEntBudget,
    isReservoirSufficient, maxSpendBeyondReservoir,
    reservoirValue, regularUsers, totalUsers,
    universalULB, powerUserBudget, powerUsers,
    maxRegularConsumption, maxPowerConsumption, maxTotalConsumption,
    enterpriseBufferPercent,
    forecast, primaryEnterpriseBudget,
    fetchAllBudgets, onNavigateToTab, onNavigateToImport,
    stepsExpandedSignal,
  } = useTierPlanner()

  const [expanded, setExpanded] = useState(false)
  const [prevSignal, setPrevSignal] = useState(stepsExpandedSignal)
  if (stepsExpandedSignal !== prevSignal) {
    setPrevSignal(stepsExpandedSignal)
    setExpanded(stepsExpandedSignal % 2 === 1)
  }
  const [input, setInput] = useState<number | null>(null)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null)
  const enterpriseNoChangeNeeded = effectiveEntBudgetMin === 0 && isReservoirSufficient
  const enterpriseBudgetIsClear =
    credentials !== null &&
    liveEntBudget !== null &&
    (enterpriseNoChangeNeeded || liveEntBudget >= effectiveEntBudgetMin)
  const enterpriseNeedsReview =
    credentials !== null &&
    liveEntBudget !== null &&
    !enterpriseBudgetIsClear

  const handleApply = async () => {
    if (!credentials || !budgetMeta.entBudgetId) return
    setLoading(true)
    setResult(null)
    const amt = input ?? effectiveEntBudgetMin
    try {
      await patchBudget(apiFetch, credentials.ent, budgetMeta.entBudgetId, { budget_amount: amt })
      setLiveEntBudget(amt)
      setResult({ ok: true, message: `✓ Enterprise budget updated to $${amt}` })
    } catch (err) {
      setResult({ ok: false, message: err instanceof Error ? err.message : 'Update failed' })
    }
    setLoading(false)
  }

  return (
    <div id="step-1-enterprise-budget" className="flex gap-3 items-start p-3 rounded-lg border border-border bg-card">
      <div className="w-6 h-6 rounded-full bg-success flex items-center justify-center flex-shrink-0 mt-0.5" aria-label={`Step ${stepNumber}`}>
        <span className="text-success-foreground text-xs font-bold" aria-hidden="true">{stepNumber}</span>
      </div>
      <div className="flex-1 space-y-3">
        <div
          className="flex justify-between items-center cursor-pointer select-none hover:bg-muted/40 -m-3 p-3 rounded-lg transition-colors"
          onClick={(e) => { e.stopPropagation(); setExpanded(prev => !prev); if (!expanded) fetchAllBudgets() }}
        >
          <div className="flex items-center gap-2 font-semibold">
            Set Enterprise Budget
          </div>
          <div className="flex items-center justify-end gap-2 min-w-[18rem]">
            <span className="text-sm text-muted-foreground mono">
              Suggested min ${effectiveEntBudgetMin.toLocaleString()}/mo
            </span>
            <FormulaTooltip
              title="Suggested Enterprise Budget"
              steps={[
                {
                  label: 'Max regular user consumption',
                  formula: `${regularUsers} users × $${universalULB} ULB`,
                  value: `$${maxRegularConsumption.toLocaleString()}/mo`,
                },
                {
                  label: 'Max power user consumption',
                  formula: `${powerUsers} users × $${powerUserBudget} budget`,
                  value: `$${maxPowerConsumption.toLocaleString()}/mo`,
                },
                {
                  label: 'Additional spend beyond the pre-paid pool',
                  formula: `$${maxTotalConsumption.toLocaleString()} total consumption − $${reservoirValue.toLocaleString()} pool`,
                  value: maxSpendBeyondReservoir === 0 ? 'None (pool covers all usage)' : `$${maxSpendBeyondReservoir.toLocaleString()}/mo`,
                },
                {
                  label: `With ${enterpriseBufferPercent}% buffer, rounded up`,
                  formula: forecast !== null
                    ? `Forecast $${Math.ceil(forecast.forecastEnterprise).toLocaleString()} + ${enterpriseBufferPercent}% buffer`
                    : `$${maxSpendBeyondReservoir.toLocaleString()} + ${enterpriseBufferPercent}% buffer`,
                  value: `$${primaryEnterpriseBudget.toLocaleString()}/mo`,
                },
                ...(effectiveEntBudgetMin > primaryEnterpriseBudget ? [{
                  label: 'Adjusted for cost center constraints',
                  formula: `Higher of $${primaryEnterpriseBudget.toLocaleString()} and $${effectiveEntBudgetMin.toLocaleString()} (from CC analysis)`,
                  value: `$${effectiveEntBudgetMin.toLocaleString()}/mo`,
                }] : []),
              ]}
              result={`$${effectiveEntBudgetMin.toLocaleString()}/mo`}
            />
            {(enterpriseBudgetIsClear || enterpriseNeedsReview) && (
              <StepHeaderStatus tone={enterpriseBudgetIsClear ? 'clear' : 'review'} />
            )}
            {expanded ? <CaretUp size={14} className="text-muted-foreground" /> : <CaretDown size={14} className="text-muted-foreground" />}
          </div>
        </div>
        {expanded && (
          <>
        {recommendations.isMidCycleAdjusted && (
          <p className="text-xs text-accent font-medium">
            Adjusted for billing cycle. Full-cycle value: ${recommendations.fullCycleEnterpriseBudget.toLocaleString()}/mo
          </p>
        )}
        <p className="text-xs text-muted-foreground">
          {tier === 'hard'
            ? `Prevents runaway charges beyond your $${reservoirValue.toLocaleString()} included credit pool. This is your primary safety net (it does not affect pool consumption)`
            : tier === 'soft'
              ? `Set to alert when post-pool charges reach this amount. Enable Stop usage to enforce a hard cap`
              : tier === 'blind'
                ? `A budget is set but has no enforcement. Enable Stop usage in Budget Planner to make this a hard cap`
                : `Configure this as your primary safety net against runaway charges. Set the enterprise budget on the Budget Planner tab, then enable Stop usage to enforce a hard cap`}
        </p>
        {tier === null && (
          <button
            onClick={() => onNavigateToTab?.('budget-planner')}
            className="text-xs text-primary underline underline-offset-2 font-medium hover:text-primary/80 transition-colors"
          >
            Go to Budget Planner to set enterprise budget →
          </button>
        )}
        {tier === 'hard' && (
          <div className="flex items-center gap-1.5">
            <Badge variant="outline" className="text-[10px] border-success/50 text-success gap-1">
              <ShieldCheck size={10} weight="fill" />
              Stop usage enabled
            </Badge>
          </div>
        )}
        {tier === 'soft' && !isReservoirSufficient && (
          <Alert className="border-warning/50 bg-warning/10 py-2">
            <Warning size={14} weight="fill" className="text-warning" />
            <AlertDescription className="text-xs">
              <strong>Alert only.</strong> You'll be notified at this amount, but charges continue beyond it. Enable <em>Stop usage</em> in Budget Planner to enforce a hard limit.
            </AlertDescription>
          </Alert>
        )}
        {tier === 'soft' && isReservoirSufficient && (
          <div className="flex items-center gap-1.5">
            <Badge variant="outline" className="text-[10px] border-warning/50 text-warning gap-1">
              <Warning size={10} weight="fill" />
              Alert only · consider enabling Stop usage
            </Badge>
          </div>
        )}
        {tier === 'blind' && !isReservoirSufficient && (
          <Alert className="border-destructive/50 bg-destructive/10 py-2">
            <Warning size={14} weight="fill" className="text-destructive" />
            <AlertDescription className="text-xs">
              <strong>Not enforced.</strong> Neither alerts nor stop usage are enabled, so post-pool charges are uncapped. Enable <em>Stop usage</em> in Budget Planner.
            </AlertDescription>
          </Alert>
        )}
        {tier === 'blind' && isReservoirSufficient && (
          <Alert className="border-destructive/50 bg-destructive/10 py-2">
            <Warning size={14} weight="fill" className="text-destructive" />
            <AlertDescription className="text-xs">
              <strong>Not enforced.</strong> Neither alerts nor stop usage are enabled. Enable <em>Stop usage</em> in Budget Planner so this budget protects you if usage patterns change.
            </AlertDescription>
          </Alert>
        )}
        {isReservoirSufficient && (
          <p className="text-xs text-success font-medium">
            Your reservoir fully covers all user budgets.
            {tier === 'hard'
              ? ' This budget is purely a safety net'
              : tier === 'soft'
                ? ' Enable Stop usage so this budget acts as a safety net'
                : tier === 'blind'
                  ? ' Enable Stop usage and alerts so this budget acts as a safety net'
                  : ' Set an enterprise budget on the Budget Planner tab as a safety net'}
          </p>
        )}
        {!isReservoirSufficient && (
          <p className={`text-xs font-medium ${tier === 'blind' || tier === 'soft' ? 'text-warning' : 'text-warning'}`}>
            Up to ${maxSpendBeyondReservoir.toLocaleString()}/mo in charges may occur after the pool is depleted.
            {tier === 'hard'
              ? ' This budget caps those charges'
              : tier === 'soft'
                ? ' This budget only sends alerts. It does not cap charges'
                : tier === 'blind'
                  ? ' This budget is not enforced. Charges are uncapped'
                  : ' No enterprise budget is configured yet to cap those charges'}
          </p>
        )}

        {credentials ? (
          <div className="space-y-3 pt-1">
            <div className="space-y-3 rounded-lg border border-border p-3 bg-muted/30">
              {liveEntBudget !== null ? (
                <>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="text-center p-2 rounded bg-muted/60 space-y-1">
                      <div className="text-[10px] text-muted-foreground uppercase tracking-wide">Current on GitHub</div>
                      <div className={`text-lg font-bold mono ${liveEntBudget < effectiveEntBudgetMin ? 'text-warning' : 'text-foreground'}`}>
                        ${liveEntBudget.toLocaleString()}<span className="text-xs font-normal text-muted-foreground">/mo</span>
                      </div>
                    </div>
                    <div className="text-center p-2 rounded bg-success/10 border border-success/20 space-y-1">
                      <div className="text-[10px] text-muted-foreground uppercase tracking-wide">Suggested Minimum</div>
                      {enterpriseNoChangeNeeded ? (
                        <div className="text-sm font-medium text-success pt-1">No change needed</div>
                      ) : (
                        <div className="text-lg font-bold mono text-success">${effectiveEntBudgetMin.toLocaleString()}<span className="text-xs font-normal text-muted-foreground">/mo</span></div>
                      )}
                    </div>
                    <div className="text-center p-2 rounded bg-primary/5 border border-primary/20 space-y-1">
                      <div className="text-[10px] text-muted-foreground uppercase tracking-wide">Set to</div>
                      <div className="flex items-center justify-center gap-1">
                        <span className="text-xs text-muted-foreground">$</span>
                        <NumericInput
                          min={0}
                          value={input ?? effectiveEntBudgetMin}
                          onValueChange={v => setInput(v)}
                          commas
                          className="text-sm h-7 mono w-20 text-center"
                        />
                      </div>
                    </div>
                  </div>
                  {entBudgetConstraint?.isBinding && (
                    <Alert className="border-warning/50 bg-warning/10 py-2">
                      <AlertDescription className="text-xs space-y-1">
                        <p>
                          ⚠️ <strong>Enterprise budget is the limiting factor.</strong>{' '}
                          At ${liveEntBudget.toLocaleString()}, total consumption is capped at ${Math.ceil(entBudgetConstraint.affordableConsumption).toLocaleString()} ({Math.round(entBudgetConstraint.capacityPercent)}% of what user budgets allow).
                        </p>
                        <p className="text-muted-foreground">
                          {effectiveExcludeCostCenterUsage
                            ? `With cost center exclusion on, this budget only covers ${regularUsers} non-cost-center users. Their post-pool charges are capped at $${liveEntBudget.toLocaleString()}, which may block them before they reach their $${universalULB} ULB`
                            : `This budget caps all ${totalUsers} users' post-pool charges. Users may be blocked before reaching their ULB ($${universalULB}) or individual budgets ($${powerUserBudget})`
                          }
                        </p>
                      </AlertDescription>
                    </Alert>
                  )}
                  <div className="flex gap-2">
                  <Button
                    size="sm"
                    className="h-8 gap-1.5 text-xs flex-1"
                    disabled={loading}
                    onClick={handleApply}
                  >
                    {loading ? <SpinnerGap size={12} className="animate-spin" /> : <ArrowRight size={12} />}
                    Update Enterprise Budget
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 gap-1.5 text-xs hover:text-destructive hover:border-destructive/50"
                    disabled={loading}
                    onClick={() => { setInput(null); setResult(null) }}
                  >
                    <Trash size={12} weight="duotone" />
                    Discard
                  </Button>
                  </div>
                  {result && (
                    <div className="space-y-1.5">
                      <p className={`text-xs font-medium ${result.ok ? 'text-success' : 'text-destructive'}`}>
                        {result.message}
                      </p>

                    </div>
                  )}
                </>
              ) : (
                <div className="flex items-center gap-2 text-xs text-muted-foreground py-1">
                  <SpinnerGap size={12} className="animate-spin" />
                  Loading enterprise budget…
                </div>
              )}
            </div>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground/70 italic">
            <button onClick={onNavigateToImport} className="underline underline-offset-2 hover:text-foreground transition-colors">Connect your Enterprise</button> to view and edit the live enterprise budget here.
          </p>
        )}
          </>
        )}
      </div>
    </div>
  )
}
