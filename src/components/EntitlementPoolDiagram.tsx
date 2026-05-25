import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  Stack,
  User,
  Lightning,
  Buildings,
  ArrowDown,
  ShieldCheck,
  Plus,
} from '@phosphor-icons/react'

interface EntitlementPoolDiagramProps {
  totalReservoir: number
  reservoirValue: number
  cbAICs: number
  ceAICs: number
  universalULB: number
  powerUserBudget: number
  regularUsers: number
  powerUsers: number
  maxRegularConsumption: number
  maxPowerConsumption: number
  maxTotalConsumption: number
  recommendedEnterpriseBudget: number
  recommendedCostCenterBudget: number
  actualEnterpriseBudget: number | null
  actualCostCenterBudget: number | null
  excludeCostCenterUsage: boolean
  isReservoirSufficient: boolean
  maxSpendBeyondReservoir: number
  isConnected: boolean
  entBudgetIsBinding: boolean
  ccBudgetIsBinding: boolean
  otherCcBudgetTotal?: number
  otherCcCount?: number
  hasCostCenters?: boolean
  showHeader?: boolean
}

export function EntitlementPoolDiagram({
  totalReservoir,
  reservoirValue,
  cbAICs,
  ceAICs,
  universalULB,
  powerUserBudget,
  regularUsers,
  powerUsers,
  maxRegularConsumption,
  maxPowerConsumption,
  maxTotalConsumption,
  recommendedEnterpriseBudget,
  recommendedCostCenterBudget,
  actualEnterpriseBudget,
  actualCostCenterBudget,
  excludeCostCenterUsage,
  isReservoirSufficient,
  maxSpendBeyondReservoir,
  isConnected,
  entBudgetIsBinding,
  ccBudgetIsBinding,
  otherCcBudgetTotal = 0,
  otherCcCount = 0,
  hasCostCenters = true,
  showHeader = true,
}: EntitlementPoolDiagramProps) {
  const totalAICs = cbAICs + ceAICs
  const cbPercent = totalAICs > 0 ? (cbAICs / totalAICs) * 100 : 50
  const cePercent = totalAICs > 0 ? (ceAICs / totalAICs) * 100 : 50

  // Display values: use actual when connected, recommended otherwise
  const displayEntBudget = actualEnterpriseBudget !== null ? actualEnterpriseBudget : recommendedEnterpriseBudget
  const displayCcBudget = actualCostCenterBudget !== null ? actualCostCenterBudget : recommendedCostCenterBudget
  const displayTotalExposure = excludeCostCenterUsage
    ? displayEntBudget + displayCcBudget + otherCcBudgetTotal
    : displayEntBudget

  // How much of the pool each user group could consume (as % of pool value)
  const regularPoolPercent = reservoirValue > 0
    ? Math.min(100, (maxRegularConsumption / reservoirValue) * 100)
    : 0
  const powerPoolPercent = reservoirValue > 0
    ? Math.min(100, (maxPowerConsumption / reservoirValue) * 100)
    : 0
  const totalConsumptionPercent = reservoirValue > 0
    ? (maxTotalConsumption / reservoirValue) * 100
    : 0

  // When the enterprise budget is binding, the actual overflow is capped
  const effectiveOverflow = entBudgetIsBinding
    ? displayEntBudget
    : maxSpendBeyondReservoir
  // Effective per-user cap when enterprise budget constrains
  const effectiveRegularCap = entBudgetIsBinding && regularUsers > 0
    ? excludeCostCenterUsage
      // Exclusion ON: enterprise only covers regular users
      ? (reservoirValue * (1 - (maxTotalConsumption > 0 ? maxPowerConsumption / maxTotalConsumption : 0)) + displayEntBudget) / regularUsers
      // Exclusion OFF: enterprise covers everyone, scale ULB proportionally
      : universalULB * ((reservoirValue + displayEntBudget) / maxTotalConsumption)
    : null
  const effectivePowerCap = (entBudgetIsBinding || ccBudgetIsBinding) && powerUsers > 0
    ? (ccBudgetIsBinding
        ? (reservoirValue * (maxTotalConsumption > 0 ? maxPowerConsumption / maxTotalConsumption : 0) + displayCcBudget) / powerUsers
        : excludeCostCenterUsage
          // Exclusion ON: enterprise doesn't cover power users, no constraint from it
          ? null
          // Exclusion OFF: enterprise covers everyone, scale power budget proportionally
          : powerUserBudget * ((reservoirValue + displayEntBudget) / maxTotalConsumption))
    : null

  const [hoveredElement, setHoveredElement] = useState<
    'pool' | 'cb' | 'ce' | 'universal' | 'individual' | 'consumption' | 'ent-budget' | 'cc-budget' | 'other-cc' | 'max-spend' | null
  >(null)

  // Helpers: highlight the hovered element, dim everything else
  const dimmed = (id: typeof hoveredElement) =>
    hoveredElement !== null && hoveredElement !== id ? 'opacity-40' : ''
  const hoverHandlers = (id: NonNullable<typeof hoveredElement>) => ({
    onMouseEnter: () => setHoveredElement(id),
    onMouseLeave: () => setHoveredElement(null),
  })

  return (
    <TooltipProvider delayDuration={400} skipDelayDuration={200}>
    <div className="space-y-4">
      {/* Header */}
      {showHeader && (
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <Stack size={20} weight="duotone" className="text-primary" />
          Budget Visualization
        </h3>
        {isConnected && (
          <Badge variant="outline" className="text-xs py-0 border-success/50 text-success gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
            Live
          </Badge>
        )}
      </div>
      )}

      {/* Layer 1: Entitlement Pool */}
      <div className="rounded-xl border-2 border-primary/40 bg-gradient-to-b from-primary/5 to-transparent p-4 space-y-4">
        <Tooltip>
          <TooltipTrigger asChild>
            <div
              className={`flex items-center justify-between cursor-help rounded-lg p-2 -m-2 transition-all duration-200 ${dimmed('pool')} ${hoveredElement === 'pool' ? 'ring-2 ring-primary/50 shadow-md scale-[1.02]' : ''}`}
              {...hoverHandlers('pool')}
            >
              <span className="text-sm font-semibold text-primary uppercase tracking-wide">
                AI Credit Pool
              </span>
              <span className="mono text-lg font-bold text-primary">
                ${reservoirValue.toLocaleString()}
              </span>
            </div>
          </TooltipTrigger>
          <TooltipContent sideOffset={8} side="top" className="pointer-events-none max-w-72 text-xs">
            <p className="font-semibold mb-1">Pre-paid Pool</p>
            <p>The total dollar value of AICs included across all licenses. This is part of your Copilot subscription. Using it costs nothing extra</p>
          </TooltipContent>
        </Tooltip>

        {/* AIC bar */}
        <div className={`space-y-1.5 transition-all duration-200 ${dimmed('cb') && dimmed('ce') ? dimmed('cb') : ''}`}>
          <div className="flex h-8 rounded-lg overflow-hidden border border-primary/20">
            <Tooltip>
              <TooltipTrigger asChild>
                <div
                  className={`bg-primary/30 flex items-center justify-center text-xs font-semibold text-primary transition-all duration-200 cursor-help ${dimmed('cb')} ${hoveredElement === 'cb' ? 'brightness-125 bg-primary/50' : ''}`}
                  style={{ width: `${cbPercent}%`, minWidth: cbAICs > 0 ? '2rem' : 0 }}
                  {...hoverHandlers('cb')}
                >
                  {cbAICs > 0 && `CB ${cbAICs.toLocaleString()}`}
                </div>
              </TooltipTrigger>
              <TooltipContent sideOffset={8} side="top" align="start" className="pointer-events-none max-w-64 text-xs">
                <p className="font-semibold mb-1">Copilot Business contribution</p>
                <p>{cbAICs.toLocaleString()} AICs · ${(cbAICs * 0.01).toLocaleString()} pool value</p>
                <p className="opacity-70 mt-0.5">Included with your CB licenses. No extra charge to consume</p>
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <div
                  className={`bg-primary/60 flex items-center justify-center text-xs font-semibold text-primary-foreground transition-all duration-200 cursor-help ${dimmed('ce')} ${hoveredElement === 'ce' ? 'brightness-125 bg-primary/80' : ''}`}
                  style={{ width: `${cePercent}%`, minWidth: ceAICs > 0 ? '2rem' : 0 }}
                  {...hoverHandlers('ce')}
                >
                  {ceAICs > 0 && `CE ${ceAICs.toLocaleString()}`}
                </div>
              </TooltipTrigger>
              <TooltipContent sideOffset={8} side="top" align="end" className="pointer-events-none max-w-64 text-xs">
                <p className="font-semibold mb-1">Copilot Enterprise contribution</p>
                <p>{ceAICs.toLocaleString()} AICs · ${(ceAICs * 0.01).toLocaleString()} pool value</p>
                <p className="opacity-70 mt-0.5">Included with your CE licenses. No extra charge to consume</p>
              </TooltipContent>
            </Tooltip>
          </div>
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>{totalReservoir.toLocaleString()} total AICs</span>
            <span>@ $0.01 each</span>
          </div>
        </div>

        {/* User Budget Controls */}
        <div className="grid grid-cols-2 gap-3">
          {/* Universal ULB */}
          <Tooltip>
            <TooltipTrigger asChild>
              <div
                className={`rounded-lg border p-3 space-y-2 cursor-help transition-all duration-200 ${
                  entBudgetIsBinding ? 'border-warning/40 bg-warning/5' : 'border-accent/40 bg-accent/5'
                } ${dimmed('universal')} ${
                  hoveredElement === 'universal' ? 'ring-2 ring-accent/50 shadow-md scale-[1.02]' : ''
                }`}
                {...hoverHandlers('universal')}
              >
            <div className="flex items-center gap-1.5">
              <User size={13} weight="duotone" className={entBudgetIsBinding ? 'text-warning' : 'text-accent'} />
              <span className={`text-sm font-semibold ${entBudgetIsBinding ? 'text-warning' : 'text-accent'}`}>Universal ULB</span>
            </div>
            <div className={`mono text-2xl font-bold ${entBudgetIsBinding ? 'text-warning' : 'text-accent'}`}>${universalULB.toFixed(2)}<span className="text-sm font-normal text-muted-foreground">/mo</span></div>
            <div className="text-xs text-muted-foreground space-y-0.5">
              <div>{regularUsers} regular user{regularUsers !== 1 ? 's' : ''}</div>
              <div className="font-medium">Max: ${maxRegularConsumption.toLocaleString()}</div>
              {effectiveRegularCap !== null && (
                <div className="text-warning font-medium">
                  Effective cap: ~${Math.round(effectiveRegularCap).toLocaleString()}/mo per user
                </div>
              )}
            </div>
            {/* Fill bar — max draw as % of pool */}
                <div className="h-2 rounded-full bg-accent/10 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-accent/50 transition-all duration-300"
                    style={{ width: `${regularPoolPercent}%` }}
                  />
                </div>
              </div>
            </TooltipTrigger>
            <TooltipContent sideOffset={8} side="bottom" align="start" className="pointer-events-none max-w-64 text-xs">
              <p className="font-semibold mb-1">Universal User Budget</p>
              <p>Per-user consumption limit for all {regularUsers} regular user{regularUsers !== 1 ? 's' : ''}. Each can draw up to ${universalULB.toFixed(2)} from the pool</p>
              <p className="opacity-70 mt-1">{regularUsers} × ${universalULB.toFixed(2)} = ${maxRegularConsumption.toLocaleString()} max draw ({Math.round(regularPoolPercent)}% of pool)</p>
              {effectiveRegularCap !== null && (
                <p className="mt-1 font-semibold">⚠ Enterprise budget limits effective draw to ~${Math.round(effectiveRegularCap)}/user</p>
              )}
            </TooltipContent>
          </Tooltip>

          {/* Individual ULB */}
          <Tooltip>
            <TooltipTrigger asChild>
              <div
                className={`rounded-lg border p-3 space-y-2 cursor-help transition-all duration-200 ${
                  (entBudgetIsBinding || ccBudgetIsBinding) ? 'border-warning/40 bg-warning/5' : 'border-warning/40 bg-warning/5'
                } ${dimmed('individual')} ${
                  hoveredElement === 'individual' ? 'ring-2 ring-warning/50 shadow-md scale-[1.02]' : ''
                }`}
                {...hoverHandlers('individual')}
              >
                <div className="flex items-center gap-1.5">
                  <Lightning size={13} weight="fill" className="text-warning" />
                  <span className="text-sm font-semibold text-warning">Individual ULB</span>
                  <Badge variant="outline" className="text-[10px] border-warning/40 text-warning gap-0.5 py-0 px-1">
                    Priority
                  </Badge>
                </div>
                <div className="mono text-2xl font-bold text-warning">${powerUserBudget.toFixed(2)}<span className="text-sm font-normal text-muted-foreground">/mo</span></div>
                <div className="text-xs text-muted-foreground space-y-0.5">
                  <div>{powerUsers} power user{powerUsers !== 1 ? 's' : ''}</div>
                  <div className="font-medium">Max: ${maxPowerConsumption.toLocaleString()}</div>
                  {effectivePowerCap !== null && (
                    <div className="text-warning font-medium">
                      Effective cap: ~${Math.round(effectivePowerCap).toLocaleString()}/mo per user
                    </div>
                  )}
                </div>
                {/* Fill bar — max draw as % of pool */}
                <div className="h-2 rounded-full bg-warning/10 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-warning/50 transition-all duration-300"
                    style={{ width: `${powerPoolPercent}%` }}
                  />
                </div>
              </div>
            </TooltipTrigger>
            <TooltipContent sideOffset={8} side="bottom" align="end" className="pointer-events-none max-w-64 text-xs">
              <p className="font-semibold mb-1">Individual User Budget (Priority)</p>
              <p>Overrides the Universal ULB for {powerUsers} power user{powerUsers !== 1 ? 's' : ''}. Each can draw up to ${powerUserBudget.toFixed(2)} from the pool</p>
              <p className="opacity-70 mt-1">{powerUsers} × ${powerUserBudget.toFixed(2)} = ${maxPowerConsumption.toLocaleString()} max draw ({Math.round(powerPoolPercent)}% of pool)</p>
              {effectivePowerCap !== null && (
                <p className="mt-1 font-semibold">⚠ Budget constraint limits effective draw to ~${Math.round(effectivePowerCap)}/user</p>
              )}
            </TooltipContent>
          </Tooltip>
        </div>

        {/* Consumption vs Pool indicator */}
        <Tooltip>
          <TooltipTrigger asChild>
            <div
              className={`rounded-lg border p-3 flex items-center justify-between text-sm cursor-help transition-all duration-200 ${
                isReservoirSufficient
                  ? 'border-success/40 bg-success/5'
                  : entBudgetIsBinding
                    ? 'border-warning/40 bg-warning/5'
                    : 'border-destructive/40 bg-destructive/5'
              } ${dimmed('consumption')} ${
                hoveredElement === 'consumption' ? 'ring-2 ring-foreground/20 shadow-md scale-[1.02]' : ''
              }`}
              {...hoverHandlers('consumption')}
            >
              <div className="flex items-center gap-2">
                <ShieldCheck
                  size={16}
                  weight="fill"
                  className={isReservoirSufficient ? 'text-success' : entBudgetIsBinding ? 'text-warning' : 'text-destructive'}
                />
                <span>
                  {isReservoirSufficient
                    ? 'Pool covers all budgeted usage'
                    : entBudgetIsBinding
                      ? `Enterprise budget caps overflow at $${effectiveOverflow.toLocaleString()}`
                      : `$${maxSpendBeyondReservoir.toLocaleString()} may exceed pool`
                  }
                </span>
              </div>
              {/* Consumption gauge */}
              <div className="flex items-center gap-2">
                <div className="w-20 h-2 rounded-full bg-muted overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-300 ${
                      isReservoirSufficient ? 'bg-success' : entBudgetIsBinding ? 'bg-warning' : 'bg-destructive'
                    }`}
                    style={{ width: `${Math.min(100, totalConsumptionPercent)}%` }}
                  />
                </div>
                <span className="mono text-sm font-medium">
                  {Math.round(totalConsumptionPercent)}%
                </span>
              </div>
            </div>
          </TooltipTrigger>
          <TooltipContent sideOffset={8} side="bottom" align="start" className="pointer-events-none max-w-72 text-xs">
            <p className="font-semibold mb-1">Max Possible Draw vs Pool</p>
            <p>The theoretical maximum if every user hits their ULB cap: ${maxTotalConsumption.toLocaleString()} total vs ${reservoirValue.toLocaleString()} pool</p>
            {!isReservoirSufficient && !entBudgetIsBinding && (
              <p className="font-semibold mt-1">The ${maxSpendBeyondReservoir.toLocaleString()} gap is your potential additional spend (what the Enterprise Budget should cap)</p>
            )}
            {entBudgetIsBinding && (
              <p className="font-semibold mt-1">⚠ Enterprise budget caps overflow to ${effectiveOverflow.toLocaleString()} instead of the ${maxSpendBeyondReservoir.toLocaleString()} theoretical max</p>
            )}
          </TooltipContent>
        </Tooltip>
      </div>

      {/* Flow arrow (only when there's overflow) */}
      {!isReservoirSufficient && (
        <div className="flex flex-col items-center py-0.5">
          <ArrowDown size={24} className={entBudgetIsBinding ? 'text-warning' : 'text-foreground'} />
          <span className={`text-sm font-medium ${entBudgetIsBinding ? 'text-warning' : 'text-foreground'}`}>
            ${effectiveOverflow.toLocaleString()} overflow
            {entBudgetIsBinding && ` (of $${maxSpendBeyondReservoir.toLocaleString()} theoretical)`}
          </span>
        </div>
      )}

      {/* Layer 3: Budgets (only when there's overflow or for context) */}
      <div className={`rounded-xl border-2 p-4 space-y-4 transition-colors ${
        isReservoirSufficient
          ? 'border-dashed border-muted-foreground/20 bg-muted/30'
          : 'border-success/40 bg-gradient-to-b from-success/5 to-transparent'
      }`}>
        <div className="flex items-center justify-between">
          <span className={`text-sm font-semibold uppercase tracking-wide ${
            isReservoirSufficient ? 'text-muted-foreground' : 'text-success'
          }`}>
            Budgets
            {isReservoirSufficient && (
              <span className="normal-case tracking-normal font-normal ml-1.5">(safety net)</span>
            )}
          </span>
          {excludeCostCenterUsage && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge variant="outline" className="text-xs py-0 border-warning/50 text-warning cursor-help">
                  Additive Mode
                </Badge>
              </TooltipTrigger>
              <TooltipContent sideOffset={8} side="top" className="pointer-events-none max-w-64 text-xs">
                <p className="font-semibold mb-1">Additive Mode</p>
                <p>Enterprise and cost center limits are tracked independently. Cost center charges don't count toward the enterprise limit. Each is its own ceiling</p>
              </TooltipContent>
            </Tooltip>
          )}
        </div>

        {excludeCostCenterUsage ? (
          /* Additive mode: enterprise + cost center(s) side by side */
          <div className="space-y-3">
            <div className={hasCostCenters ? 'flex items-stretch gap-3' : ''}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div
                    className={`flex-1 rounded-lg border p-4 space-y-1.5 cursor-help transition-all duration-200 ${
                      entBudgetIsBinding
                        ? 'border-warning/40 bg-warning/5'
                        : isReservoirSufficient
                          ? 'border-muted-foreground/20 bg-muted/50'
                          : 'border-success/30 bg-success/5'
                    } ${dimmed('ent-budget')} ${
                      hoveredElement === 'ent-budget' ? 'ring-2 ring-success/50 shadow-md scale-[1.02]' : ''
                    }`}
                    {...hoverHandlers('ent-budget')}
                  >
                    <div className="flex items-center gap-1.5">
                      <Buildings size={14} weight="duotone" className={entBudgetIsBinding ? 'text-warning' : isReservoirSufficient ? 'text-muted-foreground' : 'text-success'} />
                      <span className="text-sm font-semibold">Enterprise</span>
                      {entBudgetIsBinding && <span className="text-[11px] text-warning font-medium">⚠ limiting</span>}
                    </div>
                    <div className={`mono text-xl font-bold ${entBudgetIsBinding ? 'text-warning' : isReservoirSufficient ? 'text-muted-foreground' : 'text-success'}`}>
                      ${displayEntBudget.toLocaleString()}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {hasCostCenters ? 'Caps non-CC charges' : 'Caps additional charges'}
                    </div>
                  </div>
                </TooltipTrigger>
                <TooltipContent sideOffset={8} side="bottom" align="start" className="pointer-events-none max-w-72 text-xs">
                  <p className="font-semibold mb-1">Enterprise Budget</p>
                  {hasCostCenters
                    ? <p>Caps additional charges for users <em>not</em> in a cost center. In additive mode this only covers non-cost-center usage, so the two budgets are independent</p>
                    : <p>Caps additional charges beyond the pre-paid pool for all users</p>
                  }
                  {entBudgetIsBinding && <p className="font-semibold mt-1">⚠ This budget is below the suggested ${recommendedEnterpriseBudget.toLocaleString()} and is the binding constraint</p>}
                </TooltipContent>
              </Tooltip>

              {hasCostCenters && (
                <>
                  <div className="flex items-center">
                    <Plus size={14} className="text-warning" />
                  </div>

                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div
                        className={`flex-1 rounded-lg border p-4 space-y-1.5 cursor-help transition-all duration-200 ${
                          ccBudgetIsBinding
                            ? 'border-warning/40 bg-warning/5'
                            : isReservoirSufficient
                              ? 'border-muted-foreground/20 bg-muted/50'
                              : 'border-warning/30 bg-warning/5'
                        } ${dimmed('cc-budget')} ${
                          hoveredElement === 'cc-budget' ? 'ring-2 ring-warning/50 shadow-md scale-[1.02]' : ''
                        }`}
                        {...hoverHandlers('cc-budget')}
                      >
                        <div className="flex items-center gap-1.5">
                          <Stack size={14} weight="duotone" className={isReservoirSufficient ? 'text-muted-foreground' : 'text-warning'} />
                          <span className="text-sm font-semibold">Cost Center</span>
                          {ccBudgetIsBinding && <span className="text-[11px] text-warning font-medium">⚠ limiting</span>}
                        </div>
                        <div className={`mono text-xl font-bold ${isReservoirSufficient ? 'text-muted-foreground' : 'text-warning'}`}>
                          +${displayCcBudget.toLocaleString()}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          Independent cap
                        </div>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent sideOffset={8} side="bottom" align="end" className="pointer-events-none max-w-72 text-xs">
                      <p className="font-semibold mb-1">Cost Center Budget</p>
                      <p>Caps additional charges for users in this cost center. Because &quot;Exclude cost center usage&quot; is on, this cap is tracked independently from the Enterprise Budget</p>
                      {ccBudgetIsBinding && <p className="font-semibold mt-1">⚠ This budget is below the suggested ${recommendedCostCenterBudget.toLocaleString()} and is capping power user consumption</p>}
                    </TooltipContent>
                  </Tooltip>
                </>
              )}
            </div>

            {/* Other imported cost centers */}
            {otherCcBudgetTotal > 0 && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <div
                    className={`rounded-lg border border-muted-foreground/20 bg-muted/30 p-3 flex items-center justify-between cursor-help transition-all duration-200 ${dimmed('other-cc')} ${
                      hoveredElement === 'other-cc' ? 'ring-2 ring-muted-foreground/30 shadow-md scale-[1.02]' : ''
                    }`}
                    {...hoverHandlers('other-cc')}
                  >
                    <div className="flex items-center gap-1.5">
                      <Plus size={14} className="text-warning" />
                      <Stack size={14} weight="duotone" className="text-muted-foreground" />
                      <span className="text-sm text-muted-foreground">
                        Other cost centers ({otherCcCount})
                      </span>
                    </div>
                    <span className="mono text-base font-medium text-muted-foreground">
                      +${otherCcBudgetTotal.toLocaleString()}
                    </span>
                  </div>
                </TooltipTrigger>
                <TooltipContent sideOffset={8} side="bottom" align="start" className="pointer-events-none max-w-72 text-xs">
                  <p className="font-semibold mb-1">Other Imported Cost Centers</p>
                  <p>{otherCcCount} additional cost center{otherCcCount !== 1 ? 's' : ''} imported from your enterprise, with a combined budget of ${otherCcBudgetTotal.toLocaleString()}. These are additive and tracked independently</p>
                </TooltipContent>
              </Tooltip>
            )}
          </div>
        ) : (
          /* Shared mode: cost centers nested inside enterprise */
          <Tooltip>
            <TooltipTrigger asChild>
              <div
                className={`rounded-lg border p-4 space-y-3 cursor-help transition-all duration-200 ${
                  entBudgetIsBinding
                    ? 'border-warning/40 bg-warning/5'
                    : isReservoirSufficient
                      ? 'border-muted-foreground/20 bg-muted/50'
                      : 'border-success/30 bg-success/5'
                } ${dimmed('ent-budget')} ${
                  hoveredElement === 'ent-budget' ? 'ring-2 ring-success/50 shadow-md scale-[1.02]' : ''
                }`}
                {...hoverHandlers('ent-budget')}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <Buildings size={14} weight="duotone" className={entBudgetIsBinding ? 'text-warning' : isReservoirSufficient ? 'text-muted-foreground' : 'text-success'} />
                    <span className="text-sm font-semibold">Enterprise Budget</span>
                    {entBudgetIsBinding && <span className="text-[11px] text-warning font-medium ml-1">⚠ limiting</span>}
                  </div>
                  <span className={`mono text-xl font-bold ${entBudgetIsBinding ? 'text-warning' : isReservoirSufficient ? 'text-muted-foreground' : 'text-success'}`}>
                    ${displayEntBudget.toLocaleString()}
                  </span>
                </div>
                {hasCostCenters && (actualCostCenterBudget !== null ? displayCcBudget > 0 : recommendedCostCenterBudget > 0 && !entBudgetIsBinding) && (
                  <div className={`ml-4 rounded border border-dashed p-3 ${
                    ccBudgetIsBinding ? 'border-warning/40 bg-warning/5' : 'border-muted-foreground/20 bg-muted/30'
                  }`}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <Stack size={12} weight="duotone" className={ccBudgetIsBinding ? 'text-warning' : 'text-muted-foreground'} />
                        <span className={`text-xs ${ccBudgetIsBinding ? 'text-warning font-medium' : 'text-muted-foreground'}`}>
                          Cost center (sub-limit){ccBudgetIsBinding ? ' ⚠ limiting' : ''}
                        </span>
                      </div>
                      <span className={`mono text-base ${ccBudgetIsBinding ? 'text-warning font-medium' : 'text-muted-foreground'}`}>
                        ${displayCcBudget.toLocaleString()}
                      </span>
                    </div>
                  </div>
                )}
                {hasCostCenters && otherCcBudgetTotal > 0 && (
                  <div className="ml-4 rounded border border-dashed border-muted-foreground/20 bg-muted/30 p-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <Stack size={12} weight="duotone" className="text-muted-foreground" />
                        <span className="text-xs text-muted-foreground">
                          Other CCs ({otherCcCount}) (sub-limit)
                        </span>
                      </div>
                      <span className="mono text-base text-muted-foreground">
                        ${otherCcBudgetTotal.toLocaleString()}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </TooltipTrigger>
            <TooltipContent sideOffset={8} side="bottom" className="pointer-events-none max-w-72 text-xs">
              <p className="font-semibold mb-1">Enterprise Budget</p>
              {hasCostCenters
                ? <p>Cost center charges count toward this total, so they&apos;re shown as a nested sub-limit</p>
                : <p>Caps additional charges beyond the pre-paid pool for all users</p>
              }
              {entBudgetIsBinding && <p className="font-semibold mt-1">⚠ This budget (${displayEntBudget.toLocaleString()}) is below the suggested ${recommendedEnterpriseBudget.toLocaleString()} and is the binding constraint for all users</p>}
            </TooltipContent>
          </Tooltip>
        )}

        {/* Total exposure */}
        <Tooltip>
          <TooltipTrigger asChild>
            <div
              className={`flex items-center justify-between pt-2 border-t border-muted-foreground/10 cursor-help rounded-lg p-2 transition-all duration-200 ${dimmed('max-spend')} ${
                hoveredElement === 'max-spend' ? 'ring-2 ring-foreground/20 shadow-md scale-[1.02]' : ''
              }`}
              {...hoverHandlers('max-spend')}
            >
              <span className="text-sm text-foreground font-medium">Max AIC Spend /mo</span>
              <span className={`mono text-lg font-bold ${entBudgetIsBinding || ccBudgetIsBinding ? 'text-warning' : isReservoirSufficient ? 'text-muted-foreground' : 'text-foreground'}`}>
                ${displayTotalExposure.toLocaleString()}
              </span>
            </div>
          </TooltipTrigger>
          <TooltipContent sideOffset={8} side="bottom" align="start" className="pointer-events-none max-w-72 text-xs">
            <p className="font-semibold mb-1">Max AIC Spend (post-pool)</p>
            <p>The maximum post-pool charge across all users: the gap between max possible draw and what the pool covers. Setting budgets at or above this ensures users are not blocked</p>
          </TooltipContent>
        </Tooltip>
      </div>
    </div>
    </TooltipProvider>
  )
}
