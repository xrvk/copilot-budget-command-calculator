import { useCallback, useEffect, useRef, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import {
  User,
  Users,
  Buildings,
  Warning,
  CheckCircle,
  ArrowRight,
  ShieldCheck,
  CurrencyCircleDollar,
  Gauge,
  Bank,
  Stack,
  Swap,
  Lightning,
  Tag,
  ChartBar,
  GraduationCap,
  Lightbulb,
  GameController,
  Info,
  ArrowDown,
  Plus,
  FirstAid,
  XCircle,
  Calculator,
  NavigationArrow,
  CaretDown,
  Link,
  Check,
  BookBookmark,
  ArrowSquareOut,
} from '@phosphor-icons/react'
import { getHashParams } from '@/lib/hash-routing'

/* ─── Section 1: System Education ─────────────────────────────── */

const educationCards = [
  {
    icon: <CurrencyCircleDollar size={20} weight="duotone" />,
    number: 1,
    title: 'The licenses that are available',
    body: (
      <>
        Every GitHub Copilot license comes with <strong><a href="https://docs.github.com/en/enterprise-cloud@latest/copilot/concepts/billing/usage-based-billing-for-organizations-and-enterprises" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 decoration-primary/40 hover:decoration-primary transition-colors">AI Credits (AICs)</a></strong> included with each seat. Using those
        AICs costs nothing extra; they're part of your license.
      </>
    ),
    table: (
      <div className="mt-3 rounded-lg border border-border overflow-hidden">
        <table className="w-full text-xs" aria-label="Copilot plan pricing">
          <thead>
            <tr className="bg-muted/50 border-b border-border">
              <th scope="col" className="text-left px-3 py-1.5 font-medium">Tier</th>
              <th scope="col" className="text-right px-3 py-1.5 font-medium">License</th>
              <th scope="col" className="text-right px-3 py-1.5 font-medium">AICs Included</th>
              <th scope="col" className="text-right px-3 py-1.5 font-medium">$ Value</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-border last:border-0">
              <td className="px-3 py-1.5">
                <a href="https://github.com/features/copilot/plans" target="_blank" rel="noopener noreferrer" className="underline hover:text-primary">Business</a>
              </td>
              <td className="text-right px-3 py-1.5">$19</td>
              <td className="text-right px-3 py-1.5">1,900</td>
              <td className="text-right px-3 py-1.5">$19</td>
            </tr>
            <tr className="border-b border-border last:border-0">
              <td className="px-3 py-1.5">
                <a href="https://github.com/features/copilot/plans" target="_blank" rel="noopener noreferrer" className="underline hover:text-primary">Enterprise</a>
              </td>
              <td className="text-right px-3 py-1.5">$39</td>
              <td className="text-right px-3 py-1.5">3,900</td>
              <td className="text-right px-3 py-1.5">$39</td>
            </tr>
          </tbody>
        </table>
      </div>
    ),
  },
  {
    icon: <Stack size={20} weight="duotone" />,
    number: 2,
    title: 'The shared pool',
    body: (
      <>
        All AICs from every seat combine into <strong>one enterprise-wide pool</strong>. It doesn't
        matter which team purchased which license — everyone draws from the same reservoir. The pool
        resets each billing cycle; unused credits do not roll over.
      </>
    ),
    callout: '80 Business + 20 Enterprise seats → 230,000 AICs pooled together ($2,300 in included credits). Every developer draws from the same reservoir.',
  },
  {
    icon: <Warning size={20} weight="duotone" />,
    number: 3,
    title: 'What happens when it runs out',
    body: (
      <>
        When the pool hits zero, Copilot usage doesn't automatically stop. Additional usage is
        charged as <strong>metered billing</strong> — a per-credit fee for consumption beyond your included credits. The "budgets" and
        "budgets" in GitHub's billing settings exist to manage{' '}
        <em>this additional usage</em>, not the pool itself.
      </>
    ),
    callout: 'Your licenses include pre-paid AI Credits (included credits). Budgets cap what happens after those included credits run out.',
  },
  {
    icon: <Gauge size={20} weight="duotone" />,
    number: 4,
    title: 'The four controls',
    body: (
      <>
        The billing system gives you four distinct tools, each operating at a different stage of the
        billing cycle:
      </>
    ),
    controls: [
      {
        icon: <Bank size={16} weight="duotone" />,
        label: 'Enterprise Budget',
        when: 'Post-pool only',
        what: 'A hard ceiling on metered charges once the shared pool runs dry. Zero effect while pool capacity remains',
        color: 'text-warning',
      },
      {
        icon: <Buildings size={16} weight="duotone" />,
        label: 'Cost Center Budget',
        when: 'Post-pool only',
        what: 'Cap on metered charges for a GitHub org or group of users. Useful for chargeback, but cannot protect a group\'s share of the pre-paid pool',
        color: 'text-warning',
      },
      {
        icon: <User size={16} weight="duotone" />,
        label: 'Universal User Budget',
        when: 'Always active',
        what: 'Caps each person\u2019s total monthly consumption (pool + metered). Your primary fairness control',
        color: 'text-success',
      },
      {
        icon: <Users size={16} weight="duotone" />,
        label: 'Individual User Budget',
        when: 'Always active',
        what: 'A higher personal cap on total consumption for specific named users who demonstrably need more than the universal limit',
        color: 'text-success',
      },
    ],
  },
  {
    icon: <Swap size={20} weight="duotone" />,
    number: 5,
    title: 'Cost center exclusion',
    body: (
      <>
        One toggle fundamentally changes how the Enterprise Budget and Cost Center Budgets interact.
        Only enterprise owners and enterprise admins can change it.
      </>
    ),
    exclusion: [
      {
        label: 'Exclusion OFF (default)',
        desc: 'The Enterprise Budget is the single umbrella covering all metered charges beyond the pool, including those attributed to cost centers. Cost center budgets act as sub-limits within it.',
        best: 'Most organizations. Simpler, one cap covers everything.',
      },
      {
        label: 'Exclusion ON',
        desc: 'Enterprise and cost center budgets become fully independent meters. Charges attributed to a cost center are excluded from the enterprise counter entirely. Any cost center without a budget is completely uncapped.',
        best: 'Organizations where departments manage their own AI spend. Every cost center must have a budget.',
      },
    ],
    callout: 'Decide on this setting before sizing any budgets. It changes the math for everything else. Never enable exclusion without configuring cost center budgets for every team.',
  },
]

/* ─── Budget Visualization ─────────────────────────────────────── */

const EXAMPLE = {
  cbSeats: 300,
  ceSeats: 50,
  powerUsers: 80,
  costCenterBUsers: 100,
}

function BudgetVisualization() {
  const [excludeCostCenters, setExcludeCostCenters] = useState(false)

  const { cbSeats, ceSeats, powerUsers, costCenterBUsers } = EXAMPLE
  const totalUsers = cbSeats + ceSeats
  const regularUsers = totalUsers - powerUsers
  const cbAICs = cbSeats * 1900
  const ceAICs = ceSeats * 3900
  const totalReservoir = cbAICs + ceAICs
  const reservoirValue = totalReservoir * 0.01

  // Match Tier Planner entitlement floor defaults
  const ulb = 19
  const powerUlb = 39

  const maxRegularConsumption = regularUsers * ulb
  const maxPowerConsumption = powerUsers * powerUlb
  const maxTotalConsumption = maxRegularConsumption + maxPowerConsumption
  const maxSpendBeyondReservoir = Math.max(0, maxTotalConsumption - reservoirValue)
  const isPoolSufficient = reservoirValue >= maxTotalConsumption
  const totalConsumptionPercent = reservoirValue > 0 ? (maxTotalConsumption / reservoirValue) * 100 : 0

  const powerShare = maxTotalConsumption > 0 ? maxPowerConsumption / maxTotalConsumption : 0
  const recommendedEnterpriseBudget = Math.round(maxSpendBeyondReservoir * 1.1)
  const recommendedCostCenterBudget = Math.ceil(maxSpendBeyondReservoir * powerShare)

  const costCenterBMaxConsumption = costCenterBUsers * ulb
  const costCenterBShare = maxTotalConsumption > 0 ? costCenterBMaxConsumption / maxTotalConsumption : 0
  const recommendedCostCenterBBudget = Math.ceil(maxSpendBeyondReservoir * costCenterBShare)

  const cbPercent = totalReservoir > 0 ? (cbAICs / totalReservoir) * 100 : 50
  const cePercent = totalReservoir > 0 ? (ceAICs / totalReservoir) * 100 : 50

  const displayTotalExposure = excludeCostCenters
    ? recommendedEnterpriseBudget + recommendedCostCenterBudget + recommendedCostCenterBBudget
    : recommendedEnterpriseBudget

  return (
    <div className="space-y-4">
      {/* Header + exclusion toggle */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <Stack size={20} weight="duotone" className="text-primary" />
          Budget Visualization
        </h3>
        <div className="flex items-center gap-2">
          <Switch
            id="tips-exclusion"
            checked={excludeCostCenters}
            onCheckedChange={setExcludeCostCenters}
          />
          <Label htmlFor="tips-exclusion" className="text-xs text-muted-foreground cursor-pointer">
            Cost center exclusion
          </Label>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        {cbSeats} Business + {ceSeats} Enterprise seats · {regularUsers} regular + {powerUsers} power users.
        Assumes the recommended setup where ULBs are the primary consumption control and budgets act as safety nets.
        Toggle exclusion to see how budgets change.
      </p>

      {/* Layer 1: Entitlement Pool */}
      <div className="rounded-xl border-2 border-primary/40 bg-gradient-to-b from-primary/5 to-transparent p-4 space-y-4">
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="flex items-center justify-between cursor-help">
              <span className="text-sm font-semibold text-primary uppercase tracking-wide">
                AI Credit Pool
              </span>
              <span className="mono text-lg font-bold text-primary">
                ${reservoirValue.toLocaleString()}
              </span>
            </div>
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-72 text-xs">
            <p className="font-semibold mb-1">Included Credits</p>
            <p>The total dollar value of AICs included across all {totalUsers} licenses. Using pool credits costs nothing extra</p>
          </TooltipContent>
        </Tooltip>

        {/* AIC bar */}
        <div className="space-y-1.5">
          <div className="flex h-8 rounded-lg overflow-hidden border border-primary/20">
            <Tooltip>
              <TooltipTrigger asChild>
                <div
                  className="bg-primary/30 flex items-center justify-center text-xs font-semibold text-primary transition-all duration-300 cursor-help"
                  style={{ width: `${cbPercent}%`, minWidth: cbAICs > 0 ? '2rem' : 0 }}
                >
                  CB {cbAICs.toLocaleString()}
                </div>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-64 text-xs">
                <p className="font-semibold mb-1">Copilot Business contribution</p>
                <p>{cbAICs.toLocaleString()} AICs · ${(cbAICs * 0.01).toLocaleString()} pool value</p>
                <p className="opacity-70 mt-0.5">Included with your CB licenses. No extra charge to consume</p>
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <div
                  className="bg-primary/60 flex items-center justify-center text-xs font-semibold text-primary-foreground transition-all duration-300 cursor-help"
                  style={{ width: `${cePercent}%`, minWidth: ceAICs > 0 ? '2rem' : 0 }}
                >
                  CE {ceAICs.toLocaleString()}
                </div>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-64 text-xs">
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

        {/* User Budget Controls (simplified) */}
        <div className="grid grid-cols-2 gap-4">
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="rounded-lg border border-accent/40 bg-accent/5 p-3 space-y-1 cursor-help">
                <div className="flex items-center gap-1.5">
                  <User size={13} weight="duotone" className="text-accent" />
                  <span className="text-sm font-semibold text-accent">Universal ULB</span>
                </div>
                <div className="text-xs text-muted-foreground">
                  {regularUsers} regular users · Max: ${maxRegularConsumption.toLocaleString()}
                </div>
              </div>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="max-w-64 text-xs">
              <p className="font-semibold mb-1">Universal User-Level Budget</p>
              <p>Caps each regular user's total monthly consumption (pool + metered). Your primary fairness control</p>
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <div className="rounded-lg border border-warning/40 bg-warning/5 p-3 space-y-1 cursor-help">
                <div className="flex items-center gap-1.5">
                  <Lightning size={13} weight="fill" className="text-warning" />
                  <span className="text-sm font-semibold text-warning">Individual ULB</span>
                </div>
                <div className="text-xs text-muted-foreground">
                  {powerUsers} power users · Max: ${maxPowerConsumption.toLocaleString()}
                </div>
              </div>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="max-w-64 text-xs">
              <p className="font-semibold mb-1">Individual User-Level Budget</p>
              <p>A higher personal cap for specific users who need more than the universal limit. All consumption still draws from the shared pool</p>
            </TooltipContent>
          </Tooltip>
        </div>

        {/* Consumption vs Pool indicator */}
        <Tooltip>
          <TooltipTrigger asChild>
            <div className={`rounded-lg border p-3 flex items-center justify-between text-sm cursor-help ${
              isPoolSufficient
                ? 'border-success/40 bg-success/5'
                : 'border-destructive/40 bg-destructive/5'
            }`}>
              <div className="flex items-center gap-2">
                <ShieldCheck
                  size={16}
                  weight="fill"
                  className={isPoolSufficient ? 'text-success' : 'text-destructive'}
                />
                <span>
                  {isPoolSufficient
                    ? 'Pool covers all budgeted usage'
                    : `$${maxSpendBeyondReservoir.toLocaleString()} may exceed pool`
                  }
                </span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-20 h-2 rounded-full bg-muted overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-300 ${
                      isPoolSufficient ? 'bg-success' : 'bg-destructive'
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
          <TooltipContent side="bottom" className="max-w-72 text-xs">
            <p className="font-semibold mb-1">Max Total Consumption vs Pool</p>
            <p>If every user hits their ULB cap: ${maxTotalConsumption.toLocaleString()} total consumption vs ${reservoirValue.toLocaleString()} pool</p>
            {!isPoolSufficient && (
              <p className="font-semibold mt-1">The ${maxSpendBeyondReservoir.toLocaleString()} gap is your max additional spend. The Enterprise Budget should cap this</p>
            )}
          </TooltipContent>
        </Tooltip>
      </div>

      {/* Flow arrow */}
      {!isPoolSufficient && (
        <div className="flex flex-col items-center py-0.5">
          <ArrowDown size={24} className="text-foreground" />
          <span className="text-sm font-medium">
            ${maxSpendBeyondReservoir.toLocaleString()} additional spend
          </span>
        </div>
      )}

      {/* Layer 2: Budgets */}
      <div className={`rounded-xl border-2 p-4 space-y-4 transition-colors ${
        isPoolSufficient
          ? 'border-dashed border-muted-foreground/20 bg-muted/30'
          : 'border-success/40 bg-gradient-to-b from-success/5 to-transparent'
      }`}>
        <div className="flex items-center justify-between">
          <span className={`text-sm font-semibold uppercase tracking-wide ${
            isPoolSufficient ? 'text-muted-foreground' : 'text-success'
          }`}>
            Budgets
            {isPoolSufficient && (
              <span className="normal-case tracking-normal font-normal ml-1.5">(safety net)</span>
            )}
          </span>
          {excludeCostCenters && (
            <Badge variant="outline" className="text-xs py-0 border-warning/50 text-warning">
              Additive Mode
            </Badge>
          )}
        </div>

        {excludeCostCenters ? (
          <div className="flex items-stretch gap-3">
            <Tooltip>
              <TooltipTrigger asChild>
                <div className={`flex-1 rounded-lg border p-4 space-y-1.5 cursor-help ${
                  isPoolSufficient ? 'border-muted-foreground/20 bg-muted/50' : 'border-success/30 bg-success/5'
                }`}>
                  <div className="flex items-center gap-1.5">
                    <Buildings size={14} weight="duotone" className={isPoolSufficient ? 'text-muted-foreground' : 'text-success'} />
                    <span className="text-sm font-semibold">Enterprise</span>
                  </div>
                  <div className={`mono text-xl font-bold ${isPoolSufficient ? 'text-muted-foreground' : 'text-success'}`}>
                    ${recommendedEnterpriseBudget.toLocaleString()}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Caps non-cost-center charges
                  </div>
                </div>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-72 text-xs">
                <p className="font-semibold mb-1">Enterprise Budget</p>
                <p>Caps additional charges for users not in a cost center. In additive mode this only covers non-cost-center usage</p>
              </TooltipContent>
            </Tooltip>

            <div className="flex items-center">
              <Plus size={14} className="text-warning" />
            </div>

            <Tooltip>
              <TooltipTrigger asChild>
                <div className={`flex-1 rounded-lg border p-4 space-y-1.5 cursor-help ${
                  isPoolSufficient ? 'border-muted-foreground/20 bg-muted/50' : 'border-warning/30 bg-warning/5'
                }`}>
                  <div className="flex items-center gap-1.5">
                    <Stack size={14} weight="duotone" className={isPoolSufficient ? 'text-muted-foreground' : 'text-warning'} />
                    <span className="text-sm font-semibold">Cost Center A</span>
                  </div>
                  <div className={`mono text-xl font-bold ${isPoolSufficient ? 'text-muted-foreground' : 'text-warning'}`}>
                    +${recommendedCostCenterBudget.toLocaleString()}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Independent cap
                  </div>
                </div>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-72 text-xs">
                <p className="font-semibold mb-1">Cost Center A</p>
                <p>Caps additional charges for Cost Center A users independently. Because exclusion is on, this is tracked separately from the Enterprise Budget</p>
              </TooltipContent>
            </Tooltip>

            <div className="flex items-center">
              <Plus size={14} className="text-warning" />
            </div>

            <Tooltip>
              <TooltipTrigger asChild>
                <div className={`flex-1 rounded-lg border p-4 space-y-1.5 cursor-help ${
                  isPoolSufficient ? 'border-muted-foreground/20 bg-muted/50' : 'border-warning/30 bg-warning/5'
                }`}>
                  <div className="flex items-center gap-1.5">
                    <Stack size={14} weight="duotone" className={isPoolSufficient ? 'text-muted-foreground' : 'text-warning'} />
                    <span className="text-sm font-semibold">Cost Center B</span>
                  </div>
                  <div className={`mono text-xl font-bold ${isPoolSufficient ? 'text-muted-foreground' : 'text-warning'}`}>
                    +${recommendedCostCenterBBudget.toLocaleString()}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Independent cap
                  </div>
                </div>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-72 text-xs">
                <p className="font-semibold mb-1">Cost Center B</p>
                <p>Caps additional charges for Cost Center B users independently. Because exclusion is on, this is tracked separately from the Enterprise Budget</p>
              </TooltipContent>
            </Tooltip>
          </div>
        ) : (
          /* Shared mode: cost center nested inside enterprise */
          <Tooltip>
            <TooltipTrigger asChild>
              <div className={`rounded-lg border p-4 space-y-3 cursor-help ${
                isPoolSufficient ? 'border-muted-foreground/20 bg-muted/50' : 'border-success/30 bg-success/5'
              }`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <Buildings size={14} weight="duotone" className={isPoolSufficient ? 'text-muted-foreground' : 'text-success'} />
                    <span className="text-sm font-semibold">Enterprise Budget</span>
                  </div>
                  <span className={`mono text-xl font-bold ${isPoolSufficient ? 'text-muted-foreground' : 'text-success'}`}>
                    ${recommendedEnterpriseBudget.toLocaleString()}
                  </span>
                </div>
                {recommendedCostCenterBudget > 0 && (
                  <div className="sm:ml-4 rounded border border-dashed border-muted-foreground/20 bg-muted/30 p-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <Stack size={12} weight="duotone" className="text-muted-foreground" />
                        <span className="text-xs text-muted-foreground">Cost Center A (sub-limit)</span>
                      </div>
                      <span className="mono text-base text-muted-foreground">
                        ${recommendedCostCenterBudget.toLocaleString()}
                      </span>
                    </div>
                  </div>
                )}
                {recommendedCostCenterBBudget > 0 && (
                  <div className="sm:ml-4 rounded border border-dashed border-muted-foreground/20 bg-muted/30 p-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <Stack size={12} weight="duotone" className="text-muted-foreground" />
                        <span className="text-xs text-muted-foreground">Cost Center B (sub-limit)</span>
                      </div>
                      <span className="mono text-base text-muted-foreground">
                        ${recommendedCostCenterBBudget.toLocaleString()}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="max-w-72 text-xs">
              <p className="font-semibold mb-1">Enterprise Budget</p>
              <p>Cost center charges count toward this total, so the cost center budget is a sub-limit within it</p>
            </TooltipContent>
          </Tooltip>
        )}

        {/* Total max spend */}
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="flex items-center justify-between pt-2 border-t border-muted-foreground/10 cursor-help">
              <span className="text-sm text-foreground font-medium">Max Additional Spend</span>
              <span className={`mono text-lg font-bold ${isPoolSufficient ? 'text-muted-foreground' : 'text-foreground'}`}>
                ${displayTotalExposure.toLocaleString()}
              </span>
            </div>
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-72 text-xs">
            <p className="font-semibold mb-1">Max Additional Spend (post-pool)</p>
            <p>The maximum potential charges beyond included credits. {excludeCostCenters
              ? 'With exclusion on, enterprise and cost center budgets are additive'
              : 'With exclusion off, the enterprise budget is the single umbrella'
            }</p>
          </TooltipContent>
        </Tooltip>
      </div>
    </div>
  )
}

/* ─── Section 2: Essential Tips ────────────────────────────────── */

type Tip = {
  icon: React.ReactNode
  title: string
  summary: string
  detail: React.ReactNode
  badge: string
  badgeVariant?: 'default' | 'secondary' | 'destructive' | 'outline'
  type: 'success' | 'warning' | 'info'
  tabLink?: string
  tabLinkLabel?: string
}

const essentialTips: Tip[] = [
  {
    icon: <User size={22} weight="duotone" />,
    title: 'Always set a Universal User Budget',
    summary: 'Without one, a single user or agent can consume the entire enterprise pool overnight.',
    detail:
      'The Universal User Budget is your primary fairness control. It caps each person\u2019s total monthly consumption (pool + metered). Even if the cost center budget allows more, the ULB is the binding per-user ceiling. Without it, there is no per-user guardrail \u2014 one overnight automated agent could drain 40% of the pool before anyone notices.',
    badge: 'Critical',
    badgeVariant: 'destructive',
    type: 'warning',
  },
  {
    icon: <Stack size={22} weight="duotone" />,
    title: 'Set it above "fair share" to enable pooling',
    summary:
      'Capping at exactly 1× the per-license value defeats the purpose of pooling. Heavier users get blocked while light users waste credits.',
    detail:
      'The optimal ULB lets heavier users borrow from lighter users\' unused portions without any one person monopolizing the pool. If credits are left over at month-end, raise it. The goal is near-zero remaining credits with no one blocked mid-month.',
    badge: 'Key Setting',
    type: 'success',
    tabLink: 'tier-planner',
    tabLinkLabel: 'Import your data, then open the Tier Planner for optimal ULB values.',
  },
  {
    icon: <ShieldCheck size={22} weight="duotone" />,
    title: 'Always enable "Stop usage" on budgets',
    summary:
      'Without this, every budget is advisory. Usage and charges continue past the limit uncapped.',
    detail:
      <>The <a href="https://docs.github.com/en/billing/how-tos/set-up-budgets#managing-budgets-for-your-personal-account" target="_blank" rel="noopener noreferrer" className="underline text-primary">stop usage</a> feature turns a budget into a hard stop. Without it, the budget just sends a notification while charges keep accumulating. For most enterprise deployments, enable this on every budget to guarantee actual cost ceilings.</>,
    badge: 'Enforcement',
    badgeVariant: 'destructive',
    type: 'warning',
  },
  {
    icon: <Bank size={22} weight="duotone" />,
    title: 'Size the Enterprise Budget from your seat mix',
    summary:
      'It\'s a post-pool safety net, not a total budget. It only caps charges after the included credits run out.',
    detail:
      'The Enterprise Budget is derived from your ULB settings and pool size: total max consumption minus pool value equals your potential additional spend. Add a buffer, and that\'s your Enterprise Budget. It does nothing while the pool has capacity.',
    badge: 'Post-Pool Only',
    badgeVariant: 'secondary',
    type: 'info',
    tabLink: 'tier-planner',
    tabLinkLabel: 'Import your data, then let the Tier Planner derive this automatically.',
  },
  {
    icon: <Warning size={22} weight="duotone" />,
    title: 'Budgets only track from their creation date',
    summary:
      'A budget created or reset mid-cycle is blind to prior usage. Limits can be breached before cycle end.',
    detail:
      'Budget usage counters reset at the start of each billing cycle. If a budget is created mid-cycle, its counter starts at zero regardless of what happened earlier. This applies every cycle, not just the first. Create or adjust budgets at the start of a new cycle whenever possible. If creating mid-cycle, set the initial limit conservatively to account for consumption that already occurred.',
    badge: 'Billing',
    badgeVariant: 'destructive',
    type: 'warning',
  },
]

/* ─── Section 3: Game Theory ──────────────────────────────────── */

const gameTheoryTips: Tip[] = [
  {
    icon: <Lightning size={22} weight="duotone" />,
    title: 'Raise Individual User Budgets before upgrading license tiers',
    summary:
      'An Individual Budget on a Business license lets a user borrow from the pool at no extra cost. An upgrade adds $20/seat for net-zero AI Credit gain.',
    detail:
      'Upgrading from Business to Enterprise adds $20/month in licensing cost alongside $20 in additional AI Credit value — since credits are 1:1 with seats, there\'s no net gain. An Individual User Budget achieves the same outcome without the extra cost. If a user needs more capacity, raise their Enterprise Budget or Cost Center Budget instead.',
    badge: 'Cost Saving',
    type: 'success',
  },
  {
    icon: <Tag size={22} weight="duotone" />,
    title: 'Gate Individual Budget increases on prior-month usage data',
    summary:
      'Individual Budgets don\'t expand the pool. They raise the per-user ceiling, accelerating depletion for everyone.',
    detail:
      'If users believe a higher budget gives them priority access, most will request one regardless of actual need. Require usage data first: a user who didn\'t hit their current limit last month has no case for a higher one. Power user status should be demonstrated, not self-reported.',
    badge: 'Governance',
    type: 'info',
  },
  {
    icon: <ChartBar size={22} weight="duotone" />,
    title: 'Share pool depletion metrics with your team monthly',
    summary:
      'Visibility into shared resource health reduces defensive hoarding and "use it or lose it" behaviour.',
    detail:
      'Publish a simple end-of-month summary (e.g. "Pool was 74% consumed, no one was blocked"). Users who can see the pool is healthy are less likely to inflate usage defensively or rush to consume credits early in the cycle. Transparency builds trust and reduces budget-increase requests.',
    badge: 'Culture',
    type: 'success',
  },
]

/* ─── Section 3b: Diagnosis Flow ──────────────────────────────── */

const diagnosisSteps = [
  {
    question: 'Has the user hit their ULB (Universal or Individual)?',
    yesAction: 'Raise their ULB. The Enterprise Spending Limit is not the issue.',
    yesColor: 'text-success' as const,
    noAction: 'Continue checking.',
  },
  {
    question: 'Is the shared pool depleted?',
    yesAction: null,
    noAction: 'The pool still has capacity. Check the user\'s license status and feature access.',
    noColor: 'text-warning' as const,
  },
  {
    question: 'Has the Enterprise Spending Limit been reached?',
    yesAction: 'Raise the Enterprise Spending Limit using the formula. It\'s capping total metered charges.',
    yesColor: 'text-warning' as const,
    noAction: null,
  },
  {
    question: 'Is the user in a cost center with a budget?',
    yesAction: 'The cost center budget is the constraint. Raise it or remove the cap.',
    yesColor: 'text-warning' as const,
    noAction: 'Investigate further: check if "Stop usage" is enabled, or if the user\'s license was removed.',
    noColor: 'text-muted-foreground' as const,
  },
]

/* ─── Section 4: Common Mistakes ──────────────────────────────── */

const commonMistakes: Tip[] = [
  {
    icon: <Bank size={22} weight="duotone" />,
    title: 'Treating the Enterprise Spending Limit as a total budget',
    summary:
      'Finance sets a $5,000 "enterprise budget" expecting it to cap total monthly spend. Actual bill: $5,000 + $2,300 pool consumption = $7,300.',
    detail:
      'The Enterprise Spending Limit only caps metered charges after the pool runs out. Seat fees and pool consumption happen regardless. The limit is not a total monthly budget. Use the formula to size it against actual post-pool additional spend.',
    badge: 'Most Common',
    badgeVariant: 'destructive',
    type: 'warning',
    tabLink: 'budget-planner',
    tabLinkLabel: 'Import your data, then check post-pool charges in the Tier Planner.',
  },
  {
    icon: <ShieldCheck size={22} weight="duotone" />,
    title: 'Not enabling "Stop usage"',
    summary:
      'Enterprise limit set to $500. Limit reached. Usage continues. The bill is $1,800.',
    detail:
      <>Without explicitly enabling "Stop usage" (<code className="text-xs bg-muted px-1 rounded">prevent_further_usage</code>), every budget is advisory. It sends a notification when the threshold is crossed, but usage and billing continue. Always enable it on every spending limit.</>,
    badge: 'Expensive',
    badgeVariant: 'destructive',
    type: 'warning',
  },
  {
    icon: <Warning size={22} weight="duotone" />,
    title: 'Enabling cost center exclusion without configuring CC budgets',
    summary:
      'Exclusion flipped ON. Teams without a cost center budget now have no metered charge ceiling at all.',
    detail:
      'With exclusion ON, the enterprise umbrella no longer covers cost center users. Each cost center needs its own budget. Any cost center without one has completely uncapped metered charges. Check every cost center has a budget before flipping this toggle.',
    badge: 'Dangerous',
    badgeVariant: 'destructive',
    type: 'warning',
  },
]

const typeStyles = {
  success: 'border-success/30 bg-success/5',
  warning: 'border-warning/30 bg-warning/5',
  info: 'border-primary/20 bg-primary/5',
}

const indicatorStyles = {
  success: 'bg-success',
  warning: 'bg-warning',
  info: 'bg-primary',
}

/* ─── Tip Card ─────────────────────────────────────────────────── */

function TipCard({ tip, index, onNavigate }: { tip: Tip; index: number; onNavigate?: (tab: string) => void }) {
  const [expanded, setExpanded] = useState(false)
  return (
    <Card
      className={`border-2 gap-3 py-3 cursor-pointer select-none transition-colors ${typeStyles[tip.type]}`}
      onClick={() => setExpanded(!expanded)}
    >
      <CardHeader className="pb-0">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div
              className={`w-7 h-7 rounded-full ${indicatorStyles[tip.type]} flex items-center justify-center flex-shrink-0`}
            >
              <span className="text-white text-xs font-bold">{index}</span>
            </div>
            <CardTitle className="text-sm leading-snug">{tip.title}</CardTitle>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={tip.badgeVariant ?? 'outline'} className="flex-shrink-0 text-xs">
              {tip.badge}
            </Badge>
            <CaretDown
              size={14}
              weight="duotone"
              className={`text-muted-foreground transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}
            />
          </div>
        </div>
      </CardHeader>
      <CardContent className="max-sm:pl-4 sm:pl-16">
        <p className="text-sm text-muted-foreground">{tip.summary}</p>
        {expanded && (
          <>
            <div className="mt-2 flex gap-2 text-sm text-muted-foreground">
              <ArrowRight size={16} className="flex-shrink-0 mt-0.5 text-muted-foreground/50" />
              <p className="leading-relaxed">{tip.detail}</p>
            </div>
            {tip.tabLink && tip.tabLinkLabel && onNavigate && (
              <button
                className="mt-3 flex items-center gap-2 text-xs font-medium text-primary hover:underline cursor-pointer"
                onClick={(e) => { e.stopPropagation(); onNavigate(tip.tabLink!) }}
              >
                {tip.tabLink === 'budget-planner'
                  ? <ChartBar size={14} weight="duotone" />
                  : <Calculator size={14} weight="duotone" />
                }
                {tip.tabLinkLabel}
                <ArrowRight size={12} />
              </button>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}

/* ─── Section 6: External Resources data ──────────────────────── */

const externalResources = [
  {
    title: 'Copilot Usage-Based Billing Resources',
    description: 'One-page hub for usage-based billing: what\'s changing, how to forecast, governance guides, tools, and official docs.',
    url: 'https://se-resource-library.octodemo.com/copilot-ubb-resources',
    badge: 'Start here',
    badgeColor: 'bg-success/10 text-success border-success/20',
  },
]

/* ─── Table of Contents ─────────────────────────────────────────── */

const tocItems = [
  {
    key: 'education',
    icon: <GraduationCap size={16} weight="duotone" className="text-primary" />,
    title: 'How Copilot Billing Works',
    summary: 'Licenses, pool, controls, exclusion',
  },
  {
    key: 'visualization',
    icon: <Stack size={16} weight="duotone" className="text-primary" />,
    title: 'Budget Visualization',
    summary: 'Interactive pool and budget diagram',
  },
  {
    key: 'essential',
    icon: <Lightbulb size={16} weight="duotone" className="text-warning" />,
    title: '5 Essential Tips',
    summary: 'Critical settings for deployments',
  },
  {
    key: 'diagnosis',
    icon: <FirstAid size={16} weight="duotone" className="text-destructive" />,
    title: 'When Developers Are Blocked',
    summary: '4-step diagnostic flowchart',
  },
  {
    key: 'advanced',
    icon: <GameController size={16} weight="duotone" className="text-primary" />,
    title: 'Advanced Tips',
    summary: 'Cost saving, Governance, Culture',
  },
  {
    key: 'mistakes',
    icon: <XCircle size={16} weight="duotone" className="text-destructive" />,
    title: 'Common Mistakes',
    summary: '3 common pitfalls to avoid',
  },
  {
    key: 'resources',
    icon: <BookBookmark size={16} weight="duotone" className="text-primary" />,
    title: 'External Resources',
    summary: 'Tools, guides, and references',
  },
]

/* ─── Section Header (collapsible trigger) ─────────────────────── */

function SectionHeader({
  icon,
  title,
  sectionKey,
  isOpen,
}: {
  icon: React.ReactNode
  title: string
  sectionKey: string
  isOpen: boolean
}) {
  const [copied, setCopied] = useState(false)

  const handleCopyLink = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    const url = `${window.location.origin}${window.location.pathname}#tips?section=${sectionKey}&popup=0`
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }, [sectionKey])

  return (
    <CollapsibleTrigger asChild>
      <button className="w-full flex items-center justify-between py-1 group cursor-pointer select-none">
        <div className="flex items-center gap-2">
          {icon}
          <h3 className="text-xl font-semibold">{title}</h3>
          <Tooltip>
            <TooltipTrigger asChild>
              <span
                role="button"
                tabIndex={0}
                onClick={handleCopyLink}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleCopyLink(e as unknown as React.MouseEvent) } }}
                className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity p-1 rounded hover:bg-muted"
              >
                {copied
                  ? <Check size={14} weight="bold" className="text-success" />
                  : <Link size={14} weight="duotone" className="text-muted-foreground" />
                }
              </span>
            </TooltipTrigger>
            <TooltipContent side="right" className="text-xs">
              {copied ? 'Copied!' : 'Copy link to section'}
            </TooltipContent>
          </Tooltip>
        </div>
        <div className="flex items-center gap-3">
          <CaretDown
            size={16}
            weight="duotone"
            className={`text-muted-foreground transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
          />
        </div>
      </button>
    </CollapsibleTrigger>
  )
}

/* ─── Main Component ───────────────────────────────────────────── */

export default function Tips({ onNavigateToTab, onShowOnboarding }: { onNavigateToTab?: (tab: string) => void; onShowOnboarding?: () => void }) {
  const [openSections, setOpenSections] = useState<Record<string, boolean>>(() => {
    const section = getHashParams().get('section')
    if (section && tocItems.some(t => t.key === section)) {
      // Open only the linked section (plus defaults) when arriving via deep link
      return {
        education: section === 'education',
        visualization: section === 'visualization',
        essential: section === 'essential',
        diagnosis: section === 'diagnosis',
        advanced: section === 'advanced',
        mistakes: section === 'mistakes',
        resources: section === 'resources',
      }
    }
    return {
      education: true,
      visualization: true,
      essential: false,
      diagnosis: false,
      advanced: false,
      mistakes: false,
      resources: false,
    }
  })

  const sectionRefs = useRef<Record<string, HTMLElement | null>>({})
  const initialScrollDone = useRef(false)

  const toggle = (key: string) =>
    setOpenSections(prev => ({ ...prev, [key]: !prev[key] }))

  const updateSectionHash = useCallback((key: string | null) => {
    const params = getHashParams()
    if (key) {
      params.set('section', key)
    } else {
      params.delete('section')
    }
    const qs = params.toString()
    window.history.replaceState(null, '', `${window.location.pathname}#tips${qs ? `?${qs}` : ''}`)
  }, [])

  const scrollToSection = useCallback((key: string) => {
    setOpenSections(prev => {
      const next: Record<string, boolean> = {}
      for (const k of Object.keys(prev)) next[k] = k === key
      return next
    })
    updateSectionHash(key)
    setTimeout(() => {
      const el = sectionRefs.current[key]
      if (!el) return
      const stickyHeaderOffset = 88
      const top = el.getBoundingClientRect().top + window.scrollY - stickyHeaderOffset
      window.scrollTo({ top, behavior: 'smooth' })
    }, 50)
  }, [updateSectionHash])

  // On mount, scroll to the section specified in the URL hash
  useEffect(() => {
    if (initialScrollDone.current) return
    initialScrollDone.current = true
    const section = getHashParams().get('section')
    if (section && tocItems.some(t => t.key === section)) {
      // Small delay to let collapsible content render
      setTimeout(() => {
        const el = sectionRefs.current[section]
        if (!el) return
        const stickyHeaderOffset = 88
        const top = el.getBoundingClientRect().top + window.scrollY - stickyHeaderOffset
        window.scrollTo({ top, behavior: 'smooth' })
      }, 150)
    }
  }, [])

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Copilot Budget Guide</h2>
        <div className="flex items-center justify-between mt-2">
          <p className="text-muted-foreground">
            Learn how Copilot billing works, then calculate and apply your budget configuration
          </p>
          {onShowOnboarding && (
            <button
              className="flex items-center gap-1.5 text-xs font-medium text-primary hover:underline cursor-pointer whitespace-nowrap ml-4"
              onClick={onShowOnboarding}
            >
              <NavigationArrow size={14} weight="duotone" />
              Reopen quick tour
            </button>
          )}
        </div>
      </div>

      {/* ─── Table of Contents ────────────────────────────────────── */}
      <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
        {tocItems.map((item) => (
          <button
            key={item.key}
            onClick={() => scrollToSection(item.key)}
            className="flex items-center gap-2.5 rounded-lg border border-border bg-background/60 px-3 py-2 text-left hover:bg-muted/60 transition-colors cursor-pointer group"
          >
            <div className="flex-shrink-0">{item.icon}</div>
            <div className="min-w-0">
              <p className="text-sm font-medium leading-tight truncate group-hover:text-primary transition-colors">{item.title}</p>
              <p className="text-xs text-muted-foreground truncate">{item.summary}</p>
            </div>
          </button>
        ))}
      </div>

      {/* ─── Section 1: System Education ──────────────────────────── */}
      <Collapsible open={openSections.education} onOpenChange={() => toggle('education')}>
        <section className="space-y-4" ref={el => { sectionRefs.current.education = el }}>
          <SectionHeader
            icon={<GraduationCap size={22} weight="duotone" className="text-primary" />}
            title="How Copilot Billing Works"
            sectionKey="education"
            isOpen={openSections.education}
          />
          <CollapsibleContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
          Each Copilot license (<a href="https://github.com/features/copilot/plans" target="_blank" rel="noopener noreferrer" className="underline hover:text-primary">Business or Enterprise</a>) includes AI Credits (AICs) worth the same dollar value as the seat cost. Know how credits pool and spend to avoid surprise charges or blocked developers
        </p>

        <div className="grid gap-4">
          {educationCards.map((card) => (
            <Card key={card.number} className="border border-border shadow-none gap-2 py-3">
              <CardHeader className="pb-0">
                <div className="flex items-center gap-3">
                  <div className="w-7 h-7 rounded-full bg-primary flex items-center justify-center flex-shrink-0">
                    <span className="text-primary-foreground text-xs font-bold">{card.number}</span>
                  </div>
                  <CardTitle className="text-base">{card.title}</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="max-sm:pl-4 sm:pl-16">
                <p className="text-sm text-muted-foreground leading-relaxed">{card.body}</p>

                {card.table && card.table}

                {card.callout && (
                  <div className="mt-3 flex items-start gap-2 text-xs p-2.5 rounded-md bg-primary/5 border border-primary/20 text-foreground">
                    <Info size={14} weight="fill" className="text-primary mt-0.5 flex-shrink-0" />
                    <span className="font-medium">{card.callout}</span>
                  </div>
                )}

                {card.controls && (
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    {card.controls.map((ctrl) => (
                      <div
                        key={ctrl.label}
                        className="flex gap-2.5 rounded-md border border-border bg-background/60 p-2.5"
                      >
                        <div className={`${ctrl.color} flex-shrink-0 mt-0.5`}>{ctrl.icon}</div>
                        <div>
                          <p className="text-xs font-semibold text-foreground">{ctrl.label}</p>
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0 mt-0.5 mb-1">
                            {ctrl.when}
                          </Badge>
                          <p className="text-xs text-muted-foreground leading-relaxed">
                            {ctrl.what}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {card.exclusion && (
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    {card.exclusion.map((mode) => (
                      <div
                        key={mode.label}
                        className="rounded-md border border-border bg-background/60 p-2.5"
                      >
                        <p className="text-xs font-semibold text-foreground mb-1">{mode.label}</p>
                        <p className="text-xs text-muted-foreground leading-relaxed">{mode.desc}</p>
                        <p className="text-xs text-primary mt-1.5 font-medium">
                          Best for: {mode.best}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
          </CollapsibleContent>
        </section>
      </Collapsible>

      {/* ─── Budget Visualization ─────────────────────────────────── */}
      <Collapsible open={openSections.visualization} onOpenChange={() => toggle('visualization')}>
        <section className="space-y-4" ref={el => { sectionRefs.current.visualization = el }}>
          <SectionHeader
            icon={<Stack size={22} weight="duotone" className="text-primary" />}
            title="Budget Visualization"
            sectionKey="visualization"
            isOpen={openSections.visualization}
          />
          <CollapsibleContent>
            <Card className="border border-border">
              <CardContent className="pt-6">
                <BudgetVisualization />
              </CardContent>
            </Card>
          </CollapsibleContent>
        </section>
      </Collapsible>

      {/* ─── Section 2: Essential Tips ────────────────────────────── */}
      <Collapsible open={openSections.essential} onOpenChange={() => toggle('essential')}>
        <section className="space-y-4" ref={el => { sectionRefs.current.essential = el }}>
          <SectionHeader
            icon={<Lightbulb size={22} weight="duotone" className="text-warning" />}
            title="5 Essential Tips"
            sectionKey="essential"
            isOpen={openSections.essential}
          />
          <CollapsibleContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
          Get these right for predictable, fair, well-controlled AI spending.
        </p>

        <div className="grid gap-4">
          {essentialTips.map((tip, i) => (
            <TipCard key={i} tip={tip} index={i + 1} onNavigate={onNavigateToTab} />
          ))}
        </div>
          </CollapsibleContent>
        </section>
      </Collapsible>

      {/* ─── Section 3: Diagnosis Flow ────────────────────────────── */}
      <Collapsible open={openSections.diagnosis} onOpenChange={() => toggle('diagnosis')}>
        <section className="space-y-4" ref={el => { sectionRefs.current.diagnosis = el }}>
          <SectionHeader
            icon={<FirstAid size={22} weight="duotone" className="text-destructive" />}
            title="When Developers Are Blocked"
            sectionKey="diagnosis"
            isOpen={openSections.diagnosis}
          />
          <CollapsibleContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Work through these checks in order when a developer reports being blocked.
            </p>

        <Card className="border-2 border-destructive/20 bg-destructive/5">
          <CardContent className="pt-6 space-y-0">
            {diagnosisSteps.map((step, i) => (
              <div key={i} className="relative">
                {/* Connector line */}
                {i > 0 && (
                  <div className="absolute left-[13px] -top-3 w-0.5 h-3 bg-muted-foreground/20" />
                )}
                <div className="flex gap-3 items-start">
                  <div className="w-7 h-7 rounded-full bg-destructive/10 border border-destructive/30 flex items-center justify-center flex-shrink-0">
                    <span className="text-destructive text-xs font-bold">{i + 1}</span>
                  </div>
                  <div className="flex-1 pb-4">
                    <p className="text-sm font-semibold text-foreground">{step.question}</p>
                    <div className="mt-1.5 grid gap-1.5 sm:grid-cols-2">
                      {step.yesAction && (
                        <div className={`flex gap-1.5 items-start text-xs rounded-md px-2.5 py-1.5 border ${
                          step.yesColor === 'text-success' ? 'border-success/20 bg-success/5' : 'border-warning/20 bg-warning/5'
                        }`}>
                          <CheckCircle size={13} weight="fill" className={`${step.yesColor} mt-0.5 flex-shrink-0`} />
                          <span><strong>Yes:</strong> {step.yesAction}</span>
                        </div>
                      )}
                      {step.noAction && (
                        <div className={`flex gap-1.5 items-start text-xs rounded-md px-2.5 py-1.5 border ${
                          step.noColor === 'text-warning' ? 'border-warning/20 bg-warning/5' : 'border-muted-foreground/20 bg-muted/50'
                        }`}>
                          <XCircle size={13} weight="fill" className={`${step.noColor ?? 'text-muted-foreground'} mt-0.5 flex-shrink-0`} />
                          <span><strong>No:</strong> {step.noAction}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
            <div className="flex items-start gap-2 text-xs p-2.5 rounded-md bg-primary/5 border border-primary/20 text-foreground mt-2">
              <Info size={14} weight="fill" className="text-primary mt-0.5 flex-shrink-0" />
              <span className="font-medium">
                When budgets are sized per the recommended setup, most mid-month blocks are from the ULB. The Enterprise Spending Limit only matters after the pool runs out.
              </span>
            </div>
            {onNavigateToTab && (
              <button
                className="mt-3 flex items-center gap-2 text-xs font-medium text-primary hover:underline cursor-pointer"
                onClick={() => onNavigateToTab('budget-planner')}
              >
                <ChartBar size={14} weight="duotone" />
                Check your current settings in the Budget Planner
                <ArrowRight size={12} />
              </button>
            )}
          </CardContent>
        </Card>
          </CollapsibleContent>
        </section>
      </Collapsible>

      {/* ─── Section 4: Advanced Tips ─────────────────────────────── */}
      <Collapsible open={openSections.advanced} onOpenChange={() => toggle('advanced')}>
        <section className="space-y-4" ref={el => { sectionRefs.current.advanced = el }}>
          <SectionHeader
            icon={<GameController size={22} weight="duotone" className="text-primary" />}
            title="Advanced Tips"
            sectionKey="advanced"
            isOpen={openSections.advanced}
          />
          <CollapsibleContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Optimize user behaviour and resource allocation across the shared pool.
            </p>

            <div className="grid gap-4">
              {gameTheoryTips.map((tip, i) => (
                <TipCard key={i} tip={tip} index={i + 1} onNavigate={onNavigateToTab} />
              ))}
            </div>
          </CollapsibleContent>
        </section>
      </Collapsible>

      {/* ─── Section 5: Common Mistakes ───────────────────────────── */}
      <Collapsible open={openSections.mistakes} onOpenChange={() => toggle('mistakes')}>
        <section className="space-y-4" ref={el => { sectionRefs.current.mistakes = el }}>
          <SectionHeader
            icon={<XCircle size={22} weight="duotone" className="text-destructive" />}
            title="Common Mistakes"
            sectionKey="mistakes"
            isOpen={openSections.mistakes}
          />
          <CollapsibleContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Mistakes that appear in nearly every deployment, driven by complexity the UI doesn't surface.
            </p>

            <div className="grid gap-4">
              {commonMistakes.map((tip, i) => (
                <TipCard key={i} tip={tip} index={i + 1} onNavigate={onNavigateToTab} />
              ))}
            </div>
          </CollapsibleContent>
        </section>
      </Collapsible>

      {/* ─── Section 6: External Resources ────────────────────────── */}
      <Collapsible open={openSections.resources} onOpenChange={() => toggle('resources')}>
        <section className="space-y-4" ref={el => { sectionRefs.current.resources = el }}>
          <SectionHeader
            icon={<BookBookmark size={22} weight="duotone" className="text-primary" />}
            title="External Resources"
            sectionKey="resources"
            isOpen={openSections.resources}
          />
          <CollapsibleContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Tools, guides, and references for planning and managing Copilot usage-based billing budgets.
            </p>

            <div className="grid gap-3">
              {externalResources.map((resource) => (
                <a
                  key={resource.url}
                  href={resource.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group flex items-start gap-3 rounded-lg border border-border bg-background/60 px-4 py-3 hover:bg-muted/60 hover:border-primary/30 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold group-hover:text-primary transition-colors">{resource.title}</span>
                      <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${resource.badgeColor}`}>
                        {resource.badge}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{resource.description}</p>
                  </div>
                  <ArrowSquareOut size={16} weight="duotone" className="text-muted-foreground group-hover:text-primary transition-colors mt-0.5 flex-shrink-0" aria-hidden="true" />
                  <span className="sr-only">(opens in new tab)</span>
                </a>
              ))}
            </div>
          </CollapsibleContent>
        </section>
      </Collapsible>

      {/* ─── Next Steps ──────────────────────────────────────────── */}
      <Card className="border-2 border-success/40 bg-success/5">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <CheckCircle size={20} weight="duotone" className="text-success" />
            Ready to Configure Your Budgets?
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            {/* Path 1: New to budgeting */}
            <div className="rounded-lg border border-success/20 bg-background/60 p-4 space-y-2">
              <div className="flex items-center gap-2">
                <ChartBar size={16} weight="duotone" className="text-success" />
                <span className="text-sm font-semibold">New to Copilot budgeting?</span>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Import your enterprise data in the Budget Planner. The Tier Planner then calculates optimal ULBs, enterprise budget, and cost center budgets.
              </p>
              {onNavigateToTab && (
                <button
                  className="flex items-center gap-1.5 text-xs font-semibold text-success hover:underline cursor-pointer pt-1"
                  onClick={() => onNavigateToTab('budget-planner')}
                >
                  Import in Budget Planner
                  <ArrowRight size={12} />
                </button>
              )}
            </div>

            {/* Path 2: Already configured */}
            <div className="rounded-lg border border-success/20 bg-background/60 p-4 space-y-2">
              <div className="flex items-center gap-2">
                <Calculator size={16} weight="duotone" className="text-success" />
                <span className="text-sm font-semibold">Already connected?</span>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Open the Tier Planner to compare recommended values with your actual budgets. It flags settings constraining users below their ULBs.
              </p>
              {onNavigateToTab && (
                <button
                  className="flex items-center gap-1.5 text-xs font-semibold text-success hover:underline cursor-pointer pt-1"
                  onClick={() => onNavigateToTab('tier-planner')}
                >
                  Open Tier Planner
                  <ArrowRight size={12} />
                </button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>


    </div>
  )
}
