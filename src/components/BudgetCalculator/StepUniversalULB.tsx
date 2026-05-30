import { useState } from 'react'
import { NumericInput } from '@/components/ui/numeric-input'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Warning,
  ArrowRight,
  SpinnerGap,
  Trash,
  CaretDown,
  CaretUp,
} from '@phosphor-icons/react'
import { patchBudget, createBudget } from '@/lib/api'

import { StepHeaderStatus } from './StepHeaderStatus'
import { useTierPlanner } from './TierPlannerContext'

export function StepUniversalULB({ stepNumber = 3 }: { stepNumber?: number }) {
  const {
    credentials, apiFetch, universalULB,
    liveUlb, setLiveUlb, ulbId, setUlbId, ulbFetched,
    fetchAllBudgets, onNavigateToImport,
    budgetCapEnabled, maxAffordableULB,
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
  const baseUlb = Math.round(universalULB)
  const budgetLockMaxUlb = maxAffordableULB !== null && isFinite(maxAffordableULB) ? Math.floor(maxAffordableULB) : null
  const cappedByBudgetLock = budgetCapEnabled && budgetLockMaxUlb !== null && budgetLockMaxUlb < baseUlb
  const suggestedUniversalUlb = cappedByBudgetLock ? budgetLockMaxUlb : baseUlb
  const universalUlbIsClear =
    credentials !== null &&
    ulbFetched &&
    liveUlb !== null &&
    liveUlb >= suggestedUniversalUlb
  const universalUlbNeedsReview =
    credentials !== null &&
    ulbFetched &&
    !universalUlbIsClear

  const handleApply = async () => {
    if (!credentials) return
    setLoading(true)
    setResult(null)
    const amt = input ?? suggestedUniversalUlb
    try {
      if (ulbId) {
        await patchBudget(apiFetch, credentials.ent, ulbId, { budget_amount: amt })
        setLiveUlb(amt)
        setResult({ ok: true, message: `✓ Universal ULB updated to $${amt}` })
      } else {
        const { id: newId } = await createBudget(apiFetch, credentials.ent, {
          budget_amount: amt,
          prevent_further_usage: true,
          budget_scope: 'multi_user_customer',
          budget_entity_name: credentials.ent,
          budget_type: 'BundlePricing',
          budget_product_sku: 'premium_requests',
          budget_alerting: { will_alert: false, alert_recipients: [] },
        })
        setUlbId(newId || null)
        setLiveUlb(amt)
        setResult({ ok: true, message: `✓ Universal ULB created at $${amt}` })
      }
    } catch (err) {
      setResult({ ok: false, message: err instanceof Error ? err.message : 'Update failed' })
    }
    setLoading(false)
  }

  return (
    <div className="flex gap-3 items-start p-3 rounded-lg border border-border bg-card">
      <div className="w-6 h-6 rounded-full bg-success flex items-center justify-center flex-shrink-0 mt-0.5" aria-label={`Step ${stepNumber}`}>
        <span className="text-success-foreground text-xs font-bold" aria-hidden="true">{stepNumber}</span>
      </div>
      <div className="flex-1 space-y-3">
        <div
          className="flex justify-between items-center cursor-pointer select-none hover:bg-muted/40 -m-3 p-3 rounded-lg transition-colors"
          onClick={(e) => { e.stopPropagation(); setExpanded(prev => !prev); if (!expanded && !ulbFetched) fetchAllBudgets() }}
        >
          <span className="font-semibold">Set Universal User-Level Budget</span>
          <div className="flex items-center justify-end gap-2 min-w-[18rem]">
            <span className={`text-sm mono ${cappedByBudgetLock ? 'text-accent' : 'text-muted-foreground'}`}>
              {cappedByBudgetLock ? `Budget Lock max $${suggestedUniversalUlb.toLocaleString()}/mo` : `Suggested min $${suggestedUniversalUlb.toLocaleString()}/mo`}
            </span>
            {(universalUlbIsClear || universalUlbNeedsReview) && (
              <StepHeaderStatus tone={universalUlbIsClear ? 'clear' : 'review'} />
            )}
            {expanded ? <CaretUp size={14} className="text-muted-foreground" /> : <CaretDown size={14} className="text-muted-foreground" />}
          </div>
        </div>
        {expanded && (
          <>
        <p className="text-xs text-muted-foreground">
          Limits each user's consumption from the shared pool. Without this, a single user could drain the entire pool
        </p>

        {credentials ? (
          <div className="space-y-3 pt-1">
              <div className="space-y-3 rounded-lg border border-border p-3 bg-muted/30">
                {!ulbFetched ? (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground py-1">
                    <SpinnerGap size={12} className="animate-spin" />
                    Loading ULB…
                  </div>
                ) : (
                  <>
                    {liveUlb === null && (
                      <Alert className="border-warning/40 bg-warning/5 py-2">
                        <Warning size={14} weight="fill" className="text-warning" />
                        <AlertDescription className="text-xs">
                          No universal ULB is set. Without it, any single user can consume the entire pool.
                        </AlertDescription>
                      </Alert>
                    )}
                    <div className="grid grid-cols-3 gap-2">
                      <div className="text-center p-2 rounded bg-muted/60 space-y-1">
                        <div className="text-[10px] text-muted-foreground uppercase tracking-wide">Current on GitHub</div>
                        <div className={`text-lg font-bold mono ${liveUlb !== null && liveUlb < suggestedUniversalUlb ? 'text-warning' : 'text-foreground'}`}>
                          {liveUlb !== null ? `$${liveUlb.toLocaleString()}` : 'None'}<span className="text-xs font-normal text-muted-foreground">{liveUlb !== null ? '/mo' : ''}</span>
                        </div>
                      </div>
                      <div className={`text-center p-2 rounded space-y-1 ${cappedByBudgetLock ? 'bg-accent/10 border border-accent/20' : 'bg-success/10 border border-success/20'}`}>
                        <div className="text-[10px] text-muted-foreground uppercase tracking-wide">
                          {cappedByBudgetLock ? 'Budget Lock Max' : 'Suggested Minimum'}
                        </div>
                        <div className={`text-lg font-bold mono ${cappedByBudgetLock ? 'text-accent' : 'text-success'}`}>${suggestedUniversalUlb.toLocaleString()}<span className="text-xs font-normal text-muted-foreground">/mo</span></div>
                        {cappedByBudgetLock && (
                          <div className="text-[10px] text-muted-foreground">was ${baseUlb.toLocaleString()}</div>
                        )}
                      </div>
                      <div className="text-center p-2 rounded bg-primary/5 border border-primary/20 space-y-1">
                        <div className="text-[10px] text-muted-foreground uppercase tracking-wide">Set to</div>
                        <div className="flex items-center justify-center gap-1">
                          <span className="text-xs text-muted-foreground">$</span>
                          <NumericInput
                            min={0}
                            value={input ?? suggestedUniversalUlb}
                            onValueChange={v => setInput(v)}
                            allowFloat
                            commas
                            className="text-sm h-7 mono w-20 text-center"
                          />
                        </div>
                        {input === null && (
                          <div className="text-[10px] text-success font-medium">meets minimum</div>
                        )}
                      </div>
                    </div>
                    {liveUlb !== null && liveUlb < suggestedUniversalUlb && (
                      <p className="text-[11px] text-warning">
                        Current is ${(suggestedUniversalUlb - liveUlb).toLocaleString()} below the suggested minimum. Consider increasing it.
                      </p>
                    )}
                    <div className="flex gap-2">
                    <Button
                      size="sm"
                      className="h-8 gap-1.5 text-xs flex-1"
                      disabled={loading}
                      onClick={handleApply}
                    >
                      {loading ? <SpinnerGap size={12} className="animate-spin" /> : <ArrowRight size={12} />}
                      {ulbId ? 'Update Universal ULB' : 'Create Universal ULB'}
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
                      <p className={`text-xs font-medium ${result.ok ? 'text-success' : 'text-destructive'}`}>
                        {result.message}
                      </p>
                    )}
                  </>
                )}
              </div>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground/70 italic">
            <button onClick={onNavigateToImport} className="underline underline-offset-2 hover:text-foreground transition-colors">Connect your Enterprise</button> to view and edit the live ULB here.
          </p>
        )}
          </>
        )}
      </div>
    </div>
  )
}
