// TODO(August 2026): DELETE this entire tab once the promotional pricing period ends.
// Blog post: https://github.blog/news-insights/company-news/github-copilot-is-moving-to-usage-based-billing/
import { useState, useMemo, useEffect, useRef } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { NumericInput } from '@/components/ui/numeric-input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Users,
  CurrencyDollar,
  Lightning,
  Warning,
  SpinnerGap,
  ChartBar,
  Target,
  Coins,
  ShieldCheck,
  Sparkle,
  ArrowsClockwise,
  Tag,
  Fire,
  CaretDown,
  CaretUp,
  Trash,
} from '@phosphor-icons/react'
import { Switch } from '@/components/ui/switch'
import { useEnterpriseCredentials } from '@/hooks/use-enterprise-credentials'
import { usePromoSeatData } from '@/hooks/use-promo-seat-data'
import { optimizeSeats } from '@/lib/promo-optimizer'

// --- Constants ---
const CB_AIC_VALUE = 3_000
const CE_AIC_VALUE = 7_000
const CB_COST = 19
const CE_COST = 39
const PAYG_RATE = 0.01 // $0.01 per AIC pay-as-you-go

// --- Demo scenarios ---
// Two preset scenarios for demo mode, togglable via UI.
// Scenario A: free GHEC slots exist + some CE seats → CB→CE upgrades are the optimal path (2× cheaper than metered).
// Scenario B: no CE seats / no meaningful GHEC headroom → new CB seats are the recommendation (1.6× cheaper).
type DemoScenario = 'upgrade' | 'new-seats'
const DEMO_SCENARIO_CONFIGS: Record<DemoScenario, {
  label: string; ghecPurchased: number; ghecConsumed: number
  cbSeats: number; ceSeats: number; budget: number
}> = {
  upgrade: { label: 'CB → CE Upgrade', ghecPurchased: 120, ghecConsumed: 80, cbSeats: 80, ceSeats: 10, budget: 3_800 },
  'new-seats': { label: 'Add New CB Seats', ghecPurchased: 80, ghecConsumed: 78, cbSeats: 60, ceSeats: 0, budget: 2_500 },
}


// --- Component ---
export default function PromoAicOptimizer() {
  const { credentials, budgetMeta } = useEnterpriseCredentials()
  const { data: seatData, loading: seatLoading, error: seatError, fetchSeatData, clear: clearSeatData } = usePromoSeatData()

  const isDemo = credentials?.token === 'demo'

  // Demo scenario toggle (only shown in demo mode)
  const [demoScenario, setDemoScenario] = useState<DemoScenario>('upgrade')
  const demoCfg = DEMO_SCENARIO_CONFIGS[demoScenario]

  // Manual entry mode: null = auto-derive from credentials, boolean = user override
  const [manualModeOverride, setManualModeOverride] = useState<boolean | null>(null)
  const [prevCredentials, setPrevCredentials] = useState(credentials)
  // Reset override when credentials change so auto-derivation kicks in
  if (prevCredentials !== credentials) {
    setPrevCredentials(credentials)
    if (manualModeOverride !== null) {
      setManualModeOverride(null)
    }
  }
  const manualMode = manualModeOverride ?? !credentials
  const [manualGhecPurchased, setManualGhecPurchased] = useState(75)
  const [manualGhecConsumed, setManualGhecConsumed] = useState(60)
  const [manualCbSeats, setManualCbSeats] = useState(50)
  const [manualCeSeats, setManualCeSeats] = useState(10)
  const [promoInfoOpen, setPromoInfoOpen] = useState(false)

  // Optimizer: sync from live enterprise budget via state-during-render
  const [budgetCeiling, setBudgetCeiling] = useState(
    budgetMeta.apiEnterpriseBudget ?? 10_000
  )
  const [prevApiEntBudget, setPrevApiEntBudget] = useState(budgetMeta.apiEnterpriseBudget)
  if (budgetMeta.apiEnterpriseBudget !== prevApiEntBudget) {
    setPrevApiEntBudget(budgetMeta.apiEnterpriseBudget)
    if (budgetMeta.apiEnterpriseBudget != null) {
      setBudgetCeiling(budgetMeta.apiEnterpriseBudget)
    }
  }

  // Source of truth: demo scenario, API data, or manual
  const current = useMemo(() => {
    if (isDemo) {
      return {
        ghecPurchased: demoCfg.ghecPurchased,
        ghecConsumed: demoCfg.ghecConsumed,
        ghecAvailable: demoCfg.ghecPurchased - demoCfg.ghecConsumed,
        cbSeats: demoCfg.cbSeats,
        ceSeats: demoCfg.ceSeats,
      }
    }
    if (seatData && !manualMode) {
      return {
        ghecPurchased: seatData.ghecPurchased,
        ghecConsumed: seatData.ghecConsumed,
        ghecAvailable: seatData.ghecAvailable,
        cbSeats: seatData.cbSeats,
        ceSeats: seatData.ceSeats,
      }
    }
    return {
      ghecPurchased: manualGhecPurchased,
      ghecConsumed: manualGhecConsumed,
      ghecAvailable: Math.max(0, manualGhecPurchased - manualGhecConsumed),
      cbSeats: manualCbSeats,
      ceSeats: manualCeSeats,
    }
  }, [isDemo, demoCfg, seatData, manualMode, manualGhecPurchased, manualGhecConsumed, manualCbSeats, manualCeSeats])

  // Current AIC pool
  const currentAics = current.cbSeats * CB_AIC_VALUE + current.ceSeats * CE_AIC_VALUE
  const currentMonthlyCost = current.cbSeats * CB_COST + current.ceSeats * CE_COST

  // Effective budget: always use budgetCeiling (synced from enterprise budget context)
  const optimizerBudget = budgetCeiling

  // Optimization result
  const optimization = useMemo(
    () => optimizeSeats(optimizerBudget, current.ghecAvailable, currentAics, current.cbSeats, current.ceSeats),
    [optimizerBudget, current.ghecAvailable, currentAics, current.cbSeats, current.ceSeats]
  )

  const hasData = seatData !== null || manualMode || isDemo

  // Auto-fetch seat data when connected and not in manual mode
  const hasFetchedRef = useRef(false)
  const [prevCredsForFetch, setPrevCredsForFetch] = useState(credentials)
  // Reset fetch flag and stale data when credentials change
  if (prevCredsForFetch !== credentials) {
    setPrevCredsForFetch(credentials)
    hasFetchedRef.current = false // eslint-disable-line react-hooks/refs -- guard flag reset, no render dependency
    clearSeatData()
  }
  useEffect(() => {
    if (credentials && !seatData && !seatLoading && !manualMode && !hasFetchedRef.current) {
      hasFetchedRef.current = true
      fetchSeatData()
    }
  }, [credentials, seatData, seatLoading, manualMode, fetchSeatData])

  return (
    <div className="space-y-6 sm:min-w-[700px]">
      {/* Header */}
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Promo Optimizer</h2>
        <p className="text-muted-foreground mt-2">
          Optimize Copilot Business and Copilot Enterprise seat purchases to maximize included AI Credits and reduce metered spend
        </p>
      </div>

      {/* Promo value callout */}
      <div className="relative overflow-hidden rounded-xl border-2 border-success/40 bg-gradient-to-r from-success/10 via-success/5 to-transparent p-5">
        <div className="absolute -right-6 -top-6 opacity-[0.07]">
          <Fire size={140} weight="fill" />
        </div>
        <div className="relative">
          <button
            type="button"
            onClick={() => setPromoInfoOpen(v => !v)}
            className="w-full rounded-lg px-2 py-2 text-left cursor-pointer select-none hover:bg-muted/40 transition-colors"
            aria-label={promoInfoOpen ? 'Collapse promo pricing details' : 'Expand promo pricing details'}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-success px-3 py-1 text-xs font-bold text-white uppercase tracking-wider">
                    <Tag size={14} weight="fill" />
                    Promo Period
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-full bg-red-500/90 px-2.5 py-1 text-xs font-bold text-white uppercase tracking-wider">
                    <Fire size={14} weight="fill" />
                    Act Now
                  </span>
                </div>
                <h3 className="text-base font-semibold">
                  Existing Copilot seats include{' '}
                  <a
                    href="https://github.blog/news-insights/company-news/github-copilot-is-moving-to-usage-based-billing/#:~:text=their%20annual%20plan.-,What%20this%20means%20for%20businesses%20and%20enterprises,-Copilot%20Business%20and"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary underline underline-offset-2 hover:text-primary/80 transition-colors"
                  >
                    bonus AI Credits
                  </a>
                  {' '}through August 2026
                </h3>
                {!promoInfoOpen && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Copilot Business: 3,000 AICs/$19 (58% more) · Copilot Enterprise: 7,000 AICs/$39 (79% more)
                  </p>
                )}
              </div>
              <div className="mt-0.5 text-muted-foreground">
                {promoInfoOpen ? <CaretUp size={16} weight="duotone" /> : <CaretDown size={16} weight="duotone" />}
              </div>
            </div>
          </button>
          <div className={promoInfoOpen ? 'space-y-3 pt-2' : 'max-h-0 overflow-hidden opacity-0'}>
            <p className="text-sm text-muted-foreground">
              AI Credits are pooled at the billing entity level, not per-user buckets. Code completions and next edit suggestions remain unlimited.
              See the <a href="#docs" className="text-primary hover:underline">Docs tab</a> for the full methodology behind the optimizer's recommendations.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
              <div className="flex items-center gap-2 rounded-lg border border-success/30 bg-success/5 px-3 py-2">
                <Users size={16} weight="duotone" className="text-success" />
                <div>
                  <div className="text-sm font-semibold text-success">Copilot Business: 3,000 AICs</div>
                  <div className="text-xs text-muted-foreground">Promo for existing customers (Jun 1 to Sep 1, 2026)</div>
                  <div className="text-xs text-muted-foreground">Standard: 1,900 AI Credits per user per month</div>
                </div>
              </div>
              <div className="flex items-center gap-2 rounded-lg border border-success/30 bg-success/5 px-3 py-2">
                <Lightning size={16} weight="duotone" className="text-success" />
                <div>
                  <div className="text-sm font-semibold text-success">Copilot Enterprise: 7,000 AICs</div>
                  <div className="text-xs text-muted-foreground">Promo for existing customers (Jun 1 to Sep 1, 2026)</div>
                  <div className="text-xs text-muted-foreground">Standard: 3,900 AI Credits per user per month</div>
                </div>
              </div>
              <div className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2">
                <CurrencyDollar size={16} weight="duotone" className="text-amber-600 dark:text-amber-400" />
                <div>
                  <div className="text-sm font-semibold text-amber-700 dark:text-amber-300">Metered billing: $0.01/credit</div>
                  <div className="text-xs text-muted-foreground">$10 per 1K credits at metered pricing</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Current State */}
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <ChartBar size={20} weight="duotone" />
                Current State
              </CardTitle>
              <CardDescription>Your enterprise's current seat allocation and included AI Credits</CardDescription>
            </div>
            <div className="flex flex-col gap-2 sm:items-end">
              {isDemo && (
                <div className="flex items-center rounded-lg border border-border bg-muted/50 p-0.5 gap-0.5">
                  {(['upgrade', 'new-seats'] as DemoScenario[]).map((s) => (
                    <button
                      key={s}
                      onClick={() => setDemoScenario(s)}
                      className={`h-7 px-2.5 rounded-md text-xs font-medium transition-colors ${
                        demoScenario === s
                          ? 'bg-background shadow-sm text-foreground'
                          : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      {DEMO_SCENARIO_CONFIGS[s].label}
                    </button>
                  ))}
                </div>
              )}
              <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                {seatData && !manualMode && (
                  <div className="flex items-center gap-1.5 rounded-lg border border-success/30 bg-success/5 px-2 py-1">
                    <Badge variant="outline" className="text-xs py-0 border-success/50 text-success gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
                      Live
                    </Badge>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="gap-1.5 h-7 px-2 text-xs"
                      onClick={() => { hasFetchedRef.current = false; fetchSeatData() }}
                      disabled={seatLoading}
                    >
                      <ArrowsClockwise size={12} weight="duotone" className={seatLoading ? 'animate-spin' : ''} />
                      Refresh
                    </Button>
                  </div>
                )}
                <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/40 px-2.5 py-1.5">
                  <Switch
                    id="manual-mode"
                    checked={manualMode}
                    onCheckedChange={(checked) => {
                      setManualModeOverride(checked)
                      if (checked) clearSeatData()
                    }}
                  />
                  <Label htmlFor="manual-mode" className="text-xs text-muted-foreground cursor-pointer">Manual entry</Label>
                </div>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Loading state */}
          {seatLoading && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <SpinnerGap size={16} className="animate-spin" />
              Fetching enterprise license & Copilot seat data…
            </div>
          )}

          {/* Not connected warning */}
          {!credentials && !manualMode && (
            <Alert className="border-warning/60 bg-warning/10">
              <Warning size={16} weight="fill" className="text-warning" />
              <AlertDescription className="text-sm">
                No API connection. Connect on the <strong>Budget Planner</strong> tab first, or toggle manual entry.
              </AlertDescription>
            </Alert>
          )}

          {seatError && (
            <Alert variant="destructive">
              <Warning size={16} weight="fill" />
              <AlertDescription className="text-sm">{seatError}</AlertDescription>
            </Alert>
          )}

          {/* Stat cards (with inline editing in manual mode) */}
          {hasData && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {manualMode ? (
                <>
                  <EditableStatCard
                    label="GitHub Enterprise Seats"
                    icon={<ShieldCheck size={16} weight="duotone" />}
                    fields={[
                      { label: 'Purchased', value: manualGhecPurchased, onChange: setManualGhecPurchased },
                      { label: 'Consumed', value: manualGhecConsumed, onChange: setManualGhecConsumed },
                    ]}
                    summary={`${current.ghecAvailable.toLocaleString()} available`}
                    summaryAccent={current.ghecAvailable > 0 ? 'text-success' : 'text-warning'}
                  />
                  <EditableStatCard
                    label="Copilot Business"
                    icon={<Users size={16} weight="duotone" />}
                    fields={[
                      { label: 'Seats', value: manualCbSeats, onChange: setManualCbSeats },
                    ]}
                    summary={`${(current.cbSeats * CB_AIC_VALUE).toLocaleString()} AICs`}
                  />
                  <EditableStatCard
                    label="Copilot Enterprise"
                    icon={<Lightning size={16} weight="duotone" />}
                    fields={[
                      { label: 'Seats', value: manualCeSeats, onChange: setManualCeSeats },
                    ]}
                    summary={`${(current.ceSeats * CE_AIC_VALUE).toLocaleString()} AICs`}
                  />
                  <StatCard
                    label="Total AIC Pool"
                    value={currentAics.toLocaleString()}
                    sub={`$${currentMonthlyCost.toLocaleString()}/mo`}
                    icon={<Coins size={18} weight="duotone" />}
                    accent="text-primary"
                  />
                </>
              ) : (
                <>
                  <StatCard
                    label="GitHub Enterprise"
                    value={`${current.ghecConsumed.toLocaleString()} / ${current.ghecPurchased.toLocaleString()}`}
                    sub={`${current.ghecAvailable.toLocaleString()} available`}
                    icon={<ShieldCheck size={18} weight="duotone" />}
                    accent={current.ghecAvailable > 0 ? 'text-success' : 'text-warning'}
                  />
                  <StatCard
                    label="Copilot Business"
                    value={current.cbSeats.toLocaleString()}
                    sub={`${(current.cbSeats * CB_AIC_VALUE).toLocaleString()} AICs`}
                    icon={<Users size={18} weight="duotone" />}
                    accent="text-primary"
                  />
                  <StatCard
                    label="Copilot Enterprise"
                    value={current.ceSeats.toLocaleString()}
                    sub={`${(current.ceSeats * CE_AIC_VALUE).toLocaleString()} AICs`}
                    icon={<Lightning size={18} weight="duotone" />}
                    accent="text-primary"
                  />
                  <StatCard
                    label="Total AIC Pool"
                    value={currentAics.toLocaleString()}
                    sub={`$${currentMonthlyCost.toLocaleString()}/mo`}
                    icon={<Coins size={18} weight="duotone" />}
                    accent="text-primary"
                  />
                </>
              )}
            </div>
          )}
          </CardContent>
        </Card>

      {/* Optimizer */}
      {hasData && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Target size={20} weight="duotone" />
              Auto-Optimizer
            </CardTitle>
            <CardDescription>
              Shows how many Copilot Business and Copilot Enterprise seats to purchase so included credits offset your enterprise budget, reducing or eliminating metered spend.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-end gap-4">
              <div className="space-y-2 flex-1 max-w-xs">
                <Label className="flex items-center gap-1.5">
                  <CurrencyDollar size={14} weight="duotone" />
                  Enterprise Budget
                  {!isDemo && budgetMeta.apiEnterpriseBudget != null && (
                    <Badge variant="outline" className="text-xs border-success/50 text-success gap-1 py-0 ml-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
                      Live
                    </Badge>
                  )}
                </Label>
                <NumericInput
                  value={optimizerBudget}
                  onValueChange={setBudgetCeiling}
                  min={0}
                  allowFloat
                  commas
                />
              </div>
              {budgetMeta.apiEnterpriseBudget != null && budgetCeiling !== budgetMeta.apiEnterpriseBudget && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-9 gap-1.5 text-xs hover:text-destructive hover:border-destructive/50"
                  onClick={() => { setBudgetCeiling(budgetMeta.apiEnterpriseBudget!) }}
                >
                  <Trash size={12} weight="duotone" />
                  Discard
                </Button>
              )}
            </div>

            {/* Recommendation */}
            {optimizerBudget >= 0 && (
              <div className="rounded-lg border-2 border-primary/30 bg-primary/5 p-4 space-y-4">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <Sparkle size={16} weight="fill" className="text-primary" />
                  Recommendation
                </div>

                {optimization.aicsGained > 0 ? (
                  <>
                    <div className="text-sm space-y-1.5">
                      <p className="text-muted-foreground">
                        To fully offset your <span className="font-medium text-foreground">${optimizerBudget.toLocaleString()}</span> budget with included credits:
                      </p>
                      <ul className="space-y-1 text-muted-foreground">
                        {optimization.cbToceUpgrades > 0 && (
                          <li className="flex items-start gap-2">
                            <span className="text-primary mt-0.5">›</span>
                            Upgrade <span className="font-medium text-foreground">{optimization.cbToceUpgrades}</span> existing CB {optimization.cbToceUpgrades !== 1 ? 'users' : 'user'} to Copilot Enterprise
                          </li>
                        )}
                        {optimization.cbToceUpgrades > 0 && optimization.newCbSeats > 0 && (
                          <li className="flex items-center gap-2 py-0.5">
                            <div className="ml-[3px] h-4 w-px bg-primary/25" />
                            <span className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground/50">and</span>
                          </li>
                        )}
                        {optimization.newCbSeats > 0 && (
                          <li className="flex items-start gap-2">
                            <span className="text-primary mt-0.5">›</span>
                            Assign Copilot Business to <span className="font-medium text-foreground">{optimization.newCbSeats}</span> unassigned enterprise {optimization.newCbSeats !== 1 ? 'users' : 'user'}
                          </li>
                        )}
                      </ul>
                    </div>

                    <div className="grid sm:grid-cols-4 gap-4 text-center">
                      {optimization.cbToceUpgrades > 0 && (
                        <div>
                          <div className="text-2xl font-bold">{optimization.cbToceUpgrades}</div>
                          <div className="text-xs text-muted-foreground">CB → CE upgrades</div>
                          <div className="text-xs text-success">+{(optimization.cbToceUpgrades * (CE_AIC_VALUE - CB_AIC_VALUE)).toLocaleString()} AICs at ${CE_COST - CB_COST}/ea</div>
                        </div>
                      )}
                      {optimization.newCbSeats > 0 && (
                        <div>
                          <div className="text-2xl font-bold">{optimization.newCbSeats}</div>
                          <div className="text-xs text-muted-foreground">New Copilot Business</div>
                          <div className="text-xs text-muted-foreground">for unassigned enterprise users</div>
                        </div>
                      )}
                      <div>
                        <div className="text-2xl font-bold text-success">{optimization.aicsGained.toLocaleString()}</div>
                        <div className="text-xs text-muted-foreground">AICs gained</div>
                        <div className="text-xs text-muted-foreground">${optimization.seatCost.toLocaleString()}/mo seat cost</div>
                      </div>
                      <div>
                        <div className="text-2xl font-bold text-success">${optimization.reducedBudget.toLocaleString()}</div>
                        <div className="text-xs text-muted-foreground">Reduced budget</div>
                        <div className="text-xs text-muted-foreground">from ${optimizerBudget.toLocaleString()}</div>
                      </div>
                    </div>

                    {/* Savings callout */}
                    <div className="rounded-md bg-success/10 border border-success/30 px-3 py-2 text-sm">
                      <span className="font-semibold text-success">
                        {optimization.paygEquivalent > 0
                          ? `${Math.round(optimization.paygEquivalent / optimization.seatCost)}x cheaper`
                          : 'Fully covered'}
                      </span>
                      <span className="text-muted-foreground">
                        {' '}than metered pricing. Those {optimization.aicsGained.toLocaleString()} AICs would cost ${optimization.paygEquivalent.toLocaleString()} at $0.01/credit, but only ${optimization.seatCost.toLocaleString()}/mo via seats.
                      </span>
                    </div>

                  </>
                ) : (
                  <>
                    <p className="text-sm text-success font-medium">
                      Your existing included credits already cover the full enterprise budget. No additional seats needed.
                    </p>
                    <div className="grid sm:grid-cols-3 gap-4 text-center pt-2">
                      <div>
                        <div className="text-2xl font-bold">{currentAics.toLocaleString()}</div>
                        <div className="text-xs text-muted-foreground">Current included credits</div>
                      </div>
                      <div>
                        <div className="text-2xl font-bold">{Math.round(optimizerBudget / PAYG_RATE).toLocaleString()}</div>
                        <div className="text-xs text-muted-foreground">AICs your budget covers</div>
                      </div>
                      <div>
                        <div className="text-2xl font-bold text-success">${(currentAics * PAYG_RATE).toLocaleString()}</div>
                        <div className="text-xs text-muted-foreground">Breakeven budget</div>
                        <div className="text-xs text-muted-foreground">
                          Your included credits absorb up to this amount of metered spend
                        </div>
                      </div>
                    </div>
                    {currentAics * PAYG_RATE > optimizerBudget && (
                      <div className="rounded-md bg-success/10 border border-success/30 px-3 py-2 text-sm">
                        <span className="font-semibold text-success">
                          ${((currentAics * PAYG_RATE) - optimizerBudget).toLocaleString()} headroom
                        </span>
                        <span className="text-muted-foreground">
                          {' '}above your current ${optimizerBudget.toLocaleString()} enterprise budget. You could raise the budget to ${(currentAics * PAYG_RATE).toLocaleString()} before any metered charges apply.
                        </span>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

    </div>
  )
}

// --- Sub-components ---

function StatCard({ label, value, sub, icon, accent }: {
  label: string
  value: string
  sub: string
  icon: React.ReactNode
  accent: string
}) {
  return (
    <div className="rounded-lg border p-3 space-y-1">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground uppercase tracking-wide">
        {icon}
        {label}
      </div>
      <div className={`text-lg font-bold ${accent}`}>{value}</div>
      <div className="text-xs text-muted-foreground">{sub}</div>
    </div>
  )
}

function EditableStatCard({ label, icon, fields, summary, summaryAccent }: {
  label: string
  icon: React.ReactNode
  fields: Array<{ label: string; value: number; onChange: (v: number) => void }>
  summary: string
  summaryAccent?: string
}) {
  return (
    <div className="rounded-lg border p-3 space-y-2">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground uppercase tracking-wide">
        {icon}
        {label}
      </div>
      {fields.map((f) => (
        <div key={f.label} className="space-y-0.5">
          <label className="text-[10px] text-muted-foreground">{f.label}</label>
          <NumericInput value={f.value} onValueChange={f.onChange} min={0} commas className="h-8 text-sm" />
        </div>
      ))}
      <div className={`text-xs ${summaryAccent ?? 'text-muted-foreground'}`}>{summary}</div>
    </div>
  )
}
