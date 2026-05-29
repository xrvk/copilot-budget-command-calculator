import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'
import {
  CurrencyDollar,
  Warning,
  Info,
} from '@phosphor-icons/react'
import type { ApiCredentials } from '@/hooks/use-enterprise-credentials'
import { budgetEditUrl } from '@/lib/utils'
import { classifyBudgetTier } from '@/lib/tier-classification'

interface SpendingSummaryCardProps {
  enterpriseBudget: number
  excludeCostCenters: boolean
  ccBudgetTotal: number
  totalSpendingExposure: number
  preventFurtherUsage: boolean
  budgetAlertingEnabled: boolean | null
  credentials: ApiCredentials | null
  entBudgetId: string | null
  uncappedCcCount?: number
  /** Gross CSV consumption (sum of aic_quantity × $0.01) when CSV present. */
  csvActualConsumption?: number
  onNavigateToTips?: () => void
}

export default function SpendingSummaryCard({
  enterpriseBudget,
  excludeCostCenters,
  ccBudgetTotal,
  totalSpendingExposure,
  preventFurtherUsage,
  budgetAlertingEnabled,
  credentials,
  entBudgetId,
  uncappedCcCount = 0,
  csvActualConsumption,
  onNavigateToTips,
}: SpendingSummaryCardProps) {
  const tier = classifyBudgetTier({ preventFurtherUsage, budgetAlertingEnabled, excludeCostCenters, uncappedCcCount })
  const hasUncappedGap = excludeCostCenters && uncappedCcCount > 0

  const cardClass = tier === 'hard'
    ? 'border-success/40 bg-gradient-to-br from-success/8 via-success/3 to-transparent'
    : tier === 'soft'
    ? 'border-warning/40 bg-gradient-to-br from-warning/8 via-warning/3 to-transparent card-glow-warning'
    : 'border-destructive/40 bg-gradient-to-br from-destructive/8 via-destructive/3 to-transparent card-glow-danger'

  const accentClass = tier === 'hard' ? 'text-success' : tier === 'soft' ? 'text-warning' : 'text-destructive'

  const borderClass = tier === 'hard' ? 'border-success' : tier === 'soft' ? 'border-warning/60' : 'border-destructive/60'

  const amountClass = tier === 'hard'
    ? 'text-success'
    : tier === 'soft'
    ? 'text-warning'
    : 'text-destructive/70 line-through'

  return (
    <Card className={`border-2 shadow-md ${cardClass}`}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <CurrencyDollar size={20} weight="duotone" className={accentClass} />
          {tier === 'hard' && 'Monthly AI Credit Budget'}
          {tier === 'soft' && (hasUncappedGap ? 'Partial AI Credit Cap' : 'Monthly AI Credit Alert')}
          {tier === 'blind' && 'AI Credit Spending Is Uncapped'}
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
            <TooltipContent side="bottom" className="max-w-xs text-xs leading-relaxed font-normal">
              <p>AI Credits (AICs) are pre-paid units of AI usage included with each Copilot license. All AICs pool enterprise-wide. This budget only caps metered charges after the pool is depleted</p>
            </TooltipContent>
          </Tooltip>
        </CardTitle>
        <CardDescription>
          {tier === 'hard' && 'AI Credit charges per month. This budget halts usage at the set amount. Copilot seat costs are separate and shown on the Tier Planner page'}
          {tier === 'soft' && (hasUncappedGap
            ? `Stop usage is enabled on the enterprise budget, but ${uncappedCcCount} cost center${uncappedCcCount !== 1 ? 's have' : ' has'} no budget while exclusion is on. Copilot seat costs are separate`
            : 'Alerts fire at this amount, but usage continues beyond it. Copilot seat costs are separate and shown on the Tier Planner page')}
          {tier === 'blind' && 'No hard limit and no notifications. Charges accumulate silently'}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className={`p-6 rounded-lg bg-card border-2 ${borderClass} text-center`}>
          <div className="text-sm text-muted-foreground mb-2 inline-flex items-center gap-1.5">
            {tier === 'hard' && 'Max Monthly Spend'}
            {tier === 'soft' && (hasUncappedGap ? 'Capped Spend (partial)' : 'Alert Threshold')}
            {tier === 'blind' && 'Budget Amount (not enforced)'}
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  className="text-muted-foreground/60 hover:text-foreground transition-colors"
                  aria-label="About this number"
                >
                  <Info size={12} weight="duotone" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-xs text-xs leading-relaxed font-normal">
                <p>This is the maximum your enterprise budget allows after the included credit pool is exhausted. Actual additional spend depends on real consumption patterns and is typically much lower; the Tier Planner shows a forecast based on your last billing CSV.</p>
              </TooltipContent>
            </Tooltip>
          </div>
          <div className={`text-5xl font-bold mono ${amountClass}`}>
            ${totalSpendingExposure.toLocaleString()}<span className="text-2xl font-normal text-muted-foreground">/mo</span>
          </div>
          {tier === 'blind' && (
            <div className="text-sm font-semibold text-destructive mt-1">No limit · No alerts</div>
          )}
          {tier === 'soft' && (
            <div className="text-xs text-warning mt-1">
              {hasUncappedGap
                ? `Partial cap · ${uncappedCcCount} cost center${uncappedCcCount !== 1 ? 's' : ''} uncapped`
                : 'Alerts on · No hard cap'}
            </div>
          )}
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="text-xs text-muted-foreground mt-2 cursor-help underline decoration-dotted decoration-muted-foreground/40 underline-offset-2">
                {excludeCostCenters
                  ? 'Additive · enterprise + all cost centers'
                  : 'Enterprise cap covers all cost centers'}
              </div>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="max-w-xs text-xs leading-relaxed font-normal">
              {excludeCostCenters
                ? <p>Each cost center's charges are capped independently. The enterprise budget covers only usage outside of cost centers. Total potential spend is the enterprise budget plus all cost center budgets combined.</p>
                : <p>The enterprise budget is a single umbrella over all charges including cost centers. Cost center budgets act as sub-limits and do not add to your total potential spend.</p>}
            </TooltipContent>
          </Tooltip>
          {typeof csvActualConsumption === 'number' && csvActualConsumption > 0 && (
            <div className="mt-3 pt-3 border-t border-border/60 text-[11px] text-muted-foreground space-y-0.5">
              <div>
                <span className="font-medium text-foreground">Last CSV's actual consumption:</span>{' '}
                ${Math.round(csvActualConsumption).toLocaleString()}/mo gross. The Tier Planner shows a forecast based on this data.
              </div>
            </div>
          )}
        </div>

        {tier === 'soft' && (
          <Alert className="border-warning/50 bg-warning/10">
            <Warning size={16} weight="fill" className="text-warning" />
            <AlertDescription className="text-xs">
              {hasUncappedGap ? (
                <>
                  <strong>Partial cap.</strong> Stop usage is enabled on the enterprise budget, but {uncappedCcCount} cost center{uncappedCcCount !== 1 ? 's have' : ' has'} no budget while exclusion is on. Those cost centers can accumulate unlimited metered charges. Set a budget on every cost center to enforce a true hard cap.
                </>
              ) : (
                <>
                  <strong>Alerts are on.</strong> Billing managers receive alerts at this amount, but usage continues beyond it. Review alert recipients in your{' '}
                  <a href={credentials && entBudgetId ? budgetEditUrl(credentials.base, credentials.ent, entBudgetId) : '#'} target="_blank" rel="noopener noreferrer" className="underline font-medium">enterprise budget</a>. Consider enabling <em>Stop usage when budget limit is reached</em> above to enforce a hard cap.
                </>
              )}
            </AlertDescription>
          </Alert>
        )}

        {tier === 'blind' && (
          <Alert className="border-destructive/50 bg-destructive/10">
            <Warning size={16} weight="fill" className="text-destructive" />
            <AlertDescription className="text-xs">
              <strong>No spending controls are active.</strong> Budget alerts and stop usage are both off. Charges will accumulate with no notifications and no cap. At minimum, enable budget alerts in your{' '}
              <a href={credentials && entBudgetId ? budgetEditUrl(credentials.base, credentials.ent, entBudgetId) : '#'} target="_blank" rel="noopener noreferrer" className="underline font-medium">enterprise billing settings</a> so you are notified when spend reaches the threshold.
            </AlertDescription>
          </Alert>
        )}

        <div className="space-y-2 text-sm">
          <div className="flex justify-between items-center p-3 rounded bg-muted">
            <span className="font-semibold">Enterprise budget</span>
            <span className="mono font-semibold">${enterpriseBudget.toLocaleString()}</span>
          </div>
          {excludeCostCenters && (
            <div className="flex justify-between items-center p-3 rounded bg-muted">
              <span className="font-semibold">Cost center budgets (additive)</span>
              <span className="mono font-semibold">${ccBudgetTotal.toLocaleString()}+</span>
            </div>
          )}
          {!excludeCostCenters && ccBudgetTotal > 0 && (
            <div className="flex justify-between items-center p-3 rounded bg-muted/50 text-muted-foreground">
              <span>Cost center budgets (sub-limits)</span>
              <span className="mono">${ccBudgetTotal.toLocaleString()}</span>
            </div>
          )}
        </div>


      </CardContent>
    </Card>
  )
}
