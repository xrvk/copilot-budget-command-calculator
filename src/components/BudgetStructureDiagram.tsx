import { useMemo } from 'react'
import { classifyBudgetTier } from '@/lib/tier-classification'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  Buildings,
  Stack,
  ShieldCheck,
  Warning,
  TreeStructure,
  ArrowSquareOut,
} from '@phosphor-icons/react'
import type { CostCenter } from '@/components/BudgetPlanner'

interface BudgetStructureDiagramProps {
  enterpriseBudget: number
  costCenters: CostCenter[]
  excludeCostCenters: boolean
  preventFurtherUsage: boolean
  budgetAlertingEnabled: boolean | null
  /** URL to enterprise budget settings page (for "enable alerts" link) */
  alertSettingsUrl?: string
}

export default function BudgetStructureDiagram({
  enterpriseBudget,
  costCenters,
  excludeCostCenters,
  preventFurtherUsage,
  budgetAlertingEnabled,
  alertSettingsUrl,
}: BudgetStructureDiagramProps) {
  const { namedCenters, ccTotal, uncappedCount } = useMemo(() => {
    const named = costCenters.filter(cc => cc.name.trim().length > 0)
    const total = named.reduce((sum, cc) => sum + cc.budget, 0)
    const uncapped = named.filter(cc => cc.budget === 0).length
    return { namedCenters: named, ccTotal: total, uncappedCount: uncapped }
  }, [costCenters])

  // Bar scale: largest single value determines 100%
  const maxBar = Math.max(enterpriseBudget, ccTotal, 1)

  const entBarPercent = Math.max(2, (enterpriseBudget / maxBar) * 100)

  // Per-CC segment widths
  // When exclusion is ON, uncapped CCs (budget=0) represent unlimited risk
  // and need a guaranteed visible share rather than 0%.
  const ccSegments = useMemo(() => {
    if (namedCenters.length === 0) return []

    const cappedCount = namedCenters.filter(cc => cc.budget > 0).length

    // With exclusion ON and uncapped CCs, give each uncapped CC a meaningful share.
    // Ensure widths always sum to 100% by computing uncapped pool first, then capped pool.
    if (excludeCostCenters && uncappedCount > 0 && cappedCount > 0) {
      const minCappedPool = 10
      const uncappedMinEach = 15
      const uncappedPool = Math.min(100 - minCappedPool, uncappedCount * uncappedMinEach)
      const uncappedEach = uncappedPool / uncappedCount
      const cappedPool = 100 - uncappedPool
      const cappedBudgetTotal = namedCenters.reduce((s, cc) => s + (cc.budget > 0 ? cc.budget : 0), 0)

      return namedCenters.map(cc => ({
        id: cc.id,
        name: cc.name,
        budget: cc.budget,
        percent: cc.budget === 0
          ? uncappedEach
          : cappedBudgetTotal > 0
            ? (cc.budget / cappedBudgetTotal) * cappedPool
            : cappedPool / cappedCount,
        uncapped: cc.budget === 0,
      }))
    }

    // Default: proportional by budget
    return namedCenters.map(cc => ({
      id: cc.id,
      name: cc.name,
      budget: cc.budget,
      percent: ccTotal > 0 ? (cc.budget / ccTotal) * 100 : 100 / Math.max(namedCenters.length, 1),
      uncapped: cc.budget === 0,
    }))
  }, [namedCenters, ccTotal, excludeCostCenters, uncappedCount])

  const tier = classifyBudgetTier({ preventFurtherUsage, budgetAlertingEnabled, excludeCostCenters, uncappedCcCount: uncappedCount })
  const hasUncappedGap = excludeCostCenters && uncappedCount > 0

  return (
    <TooltipProvider delayDuration={300} skipDelayDuration={150}>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <TreeStructure size={20} weight="duotone" className="text-primary" />
            Budget Structure
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
        {/* Shared mode: CC bars nested inside enterprise */}
        {!excludeCostCenters ? (
          <div className="space-y-3">
            {/* Enterprise budget container */}
            <div className="rounded-xl border-2 border-primary/30 bg-primary/5 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-sm font-semibold text-primary">
                  <Buildings size={14} weight="duotone" />
                  Enterprise Budget
                </div>
                <span className="mono text-sm font-bold text-primary">
                  ${enterpriseBudget.toLocaleString()}
                </span>
              </div>

              {/* Enterprise bar */}
              <div className="h-6 rounded-lg bg-primary/15 overflow-hidden">
                <div
                  className="h-full rounded-lg bg-primary/30 transition-all duration-300"
                  style={{ width: '100%' }}
                />
              </div>

              {/* CC sub-limits nested inside */}
              {namedCenters.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Stack size={12} weight="duotone" />
                    Cost center sub-limits (within enterprise cap)
                  </div>
                  <div className="flex h-5 rounded-lg overflow-hidden border border-primary/15 gap-px">
                    {ccSegments.map((seg, i) => (
                      <Tooltip key={seg.id}>
                        <TooltipTrigger asChild>
                          <div
                            className={`h-full flex items-center justify-center text-[10px] font-medium cursor-help transition-all duration-200 ${
                              seg.uncapped
                                ? 'bg-destructive/20 text-destructive'
                                : 'bg-accent/30 text-foreground/70'
                            }`}
                            style={{
                              width: `${seg.percent}%`,
                              minWidth: namedCenters.length <= 6 ? '2rem' : '0.5rem',
                              borderRadius: i === 0 ? '0.5rem 0 0 0.5rem' : i === ccSegments.length - 1 ? '0 0.5rem 0.5rem 0' : 0,
                            }}
                          >
                            {seg.percent > 15 && (seg.uncapped ? '—' : `$${seg.budget.toLocaleString()}`)}
                          </div>
                        </TooltipTrigger>
                        <TooltipContent side="bottom" className="text-xs max-w-48">
                          <p className="font-semibold">{seg.name}</p>
                          <p>{seg.uncapped ? 'No sub-limit set' : `$${seg.budget.toLocaleString()} sub-limit`}</p>
                        </TooltipContent>
                      </Tooltip>
                    ))}
                  </div>
                  <div className="flex justify-between text-[10px] text-muted-foreground">
                    <span>{namedCenters.length} cost center{namedCenters.length !== 1 ? 's' : ''}</span>
                    <span>Σ ${ccTotal.toLocaleString()} in sub-limits</span>
                  </div>
                </div>
              )}
            </div>


          </div>
        ) : (
          /* Additive mode: enterprise and CC bars side by side */
          <div className="space-y-3">
            {/* Enterprise budget */}
            <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-sm font-semibold text-primary">
                  <Buildings size={14} weight="duotone" />
                  Enterprise Budget
                </div>
                <span className="mono text-sm font-bold text-primary">
                  ${enterpriseBudget.toLocaleString()}
                </span>
              </div>
              <div className="h-5 rounded-lg bg-primary/10 overflow-hidden">
                <div
                  className="h-full rounded-lg bg-primary/30 transition-all duration-300"
                  style={{ width: `${entBarPercent}%` }}
                />
              </div>
              <p className="text-[10px] text-muted-foreground">Covers usage outside of cost centers only</p>
            </div>

            {/* Plus connector */}
            <div className="flex items-center justify-center text-muted-foreground">
              <div className="h-px flex-1 bg-border" />
              <span className="px-3 text-xs font-medium">+ independent</span>
              <div className="h-px flex-1 bg-border" />
            </div>

            {/* Cost center budgets */}
            {namedCenters.length > 0 && (
              <div className="rounded-lg border border-accent/30 bg-accent/5 p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                    <Stack size={14} weight="duotone" />
                    Cost center budgets
                  </div>
                  <span className="mono text-sm font-bold text-foreground">
                    ${ccTotal.toLocaleString()}+
                  </span>
                </div>
                <div className="flex h-5 rounded-lg overflow-hidden border border-accent/15 gap-px">
                  {ccSegments.map((seg, i) => (
                    <Tooltip key={seg.id}>
                      <TooltipTrigger asChild>
                        <div
                          className={`h-full flex items-center justify-center text-[10px] font-medium cursor-help transition-all duration-200 ${
                            seg.uncapped
                              ? 'text-destructive'
                              : 'bg-accent/30 text-foreground/70'
                          }`}
                          style={{
                            width: `${seg.percent}%`,
                            minWidth: namedCenters.length <= 6 ? '2rem' : '0.5rem',
                            borderRadius: i === 0 ? '0.5rem 0 0 0.5rem' : i === ccSegments.length - 1 ? '0 0.5rem 0.5rem 0' : 0,
                            ...(seg.uncapped ? {
                              background: 'repeating-linear-gradient(135deg, color-mix(in oklch, var(--destructive) 25%, transparent), color-mix(in oklch, var(--destructive) 25%, transparent) 3px, color-mix(in oklch, var(--destructive) 12%, transparent) 3px, color-mix(in oklch, var(--destructive) 12%, transparent) 6px)',
                            } : {}),
                          }}
                        >
                          {seg.percent > 15 && (seg.uncapped ? 'no cap' : `$${seg.budget.toLocaleString()}`)}
                        </div>
                      </TooltipTrigger>
                      <TooltipContent side="bottom" className="text-xs max-w-48">
                        <p className="font-semibold">{seg.name}</p>
                        <p>{seg.uncapped ? 'No per-CC cap. Universal ULB (if set) is the only backstop, capping total user spend (pool + metered)' : `$${seg.budget.toLocaleString()} independent cap`}</p>
                      </TooltipContent>
                    </Tooltip>
                  ))}
                </div>
                <div className="flex justify-between text-[10px] text-muted-foreground">
                  <span>{namedCenters.length} cost center{namedCenters.length !== 1 ? 's' : ''}{uncappedCount > 0 ? ` · ${uncappedCount} uncapped` : ''}</span>
                  <span>Each caps charges independently</span>
                </div>
              </div>
            )}


          </div>
        )}

        {/* Enforcement annotation */}
        {tier === 'blind' ? (
          <div className="rounded-md px-3 py-2.5 text-xs bg-destructive/8 text-destructive border border-destructive/20 space-y-1">
            <div className="flex items-center gap-2 font-medium">
              <Warning size={14} weight="fill" className="shrink-0" />
              No spending controls are active
            </div>
            <p className="text-destructive/80 pl-[22px]">
              No notifications or enterprise cap. Universal ULB (if set) is the only backstop, capping each user's total spend (pool + metered).{' '}
              {alertSettingsUrl ? (
                <a href={alertSettingsUrl} target="_blank" rel="noopener noreferrer" className="font-medium underline underline-offset-2 text-destructive inline-flex items-center gap-0.5">
                  Enable alerts in GitHub <ArrowSquareOut size={11} weight="duotone" />
                </a>
              ) : (
                'Enable budget alerts in your enterprise billing settings'
              )}
            </p>
          </div>
        ) : (
          <div className={`rounded-md px-3 py-2 flex items-center gap-2 text-xs font-medium ${
            tier === 'hard'
              ? 'bg-success/8 text-success border border-success/20'
              : 'bg-warning/8 text-warning border border-warning/20'
          }`}>
            {tier === 'hard' ? (
              <ShieldCheck size={14} weight="fill" />
            ) : (
              <Warning size={14} weight="fill" />
            )}
            {tier === 'hard' && 'Hard cap · usage stops at limit'}
            {tier === 'soft' && (hasUncappedGap
              ? `Partial cap · ${uncappedCount} cost center${uncappedCount !== 1 ? 's' : ''} uncapped`
              : 'Soft cap · alerts on, no hard limit')}
          </div>
        )}
        </CardContent>
      </Card>
    </TooltipProvider>
  )
}
