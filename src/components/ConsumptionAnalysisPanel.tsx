import { useState, useEffect, useMemo, useCallback, useRef, type Ref } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { NumericInput } from '@/components/ui/numeric-input'
import { Checkbox } from '@/components/ui/checkbox'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from '@/components/ui/alert-dialog'
import { useEnterpriseCredentials, type CsvTierSuggestions, type ApiCredentials } from '@/hooks/use-enterprise-credentials'
import {
  ChartBar,
  ChartLine,
  Crosshair,
  FileArrowUp,
  Lightning,
  CheckCircle,
  CaretDown,
  CaretUp,
  Warning,
  X,
  Link,
  Check,
  Info,
  MagnifyingGlass,
  SpinnerGap,
  ArrowCounterClockwise,
  Table as TableIcon,
} from '@phosphor-icons/react'
import { type CsvParseResult, type CsvUserUsage } from '@/lib/chargeback'
import { parseCsvAsync } from '@/lib/csv-parser-client'
import {
  calcConsumptionStats,
  calcThreshold,
  type ThresholdMode,
  type ThresholdResult,
  type ConsumptionStats,
} from '@/lib/consumptionAnalysis'
import { fetchBudgets, filterUserBudgets, patchBudget, createBudget, withRateLimitRetry, ApiError } from '@/lib/api'

// --- CSV Upload Card ---

interface CsvUploadCardProps {
  onCsvParsed: (result: CsvParseResult) => void
  csvData: CsvParseResult | null
  onClear: () => void
  embedded?: boolean
  fillHeight?: boolean
  onHeaderClick?: () => void
  collapsed?: boolean
}

export function CsvUploadCard({ onCsvParsed, csvData, onClear, embedded = false, fillHeight = false, onHeaderClick, collapsed = false }: CsvUploadCardProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [fileName, setFileName] = useState<string | null>(null)
  const [parseError, setParseError] = useState<string | null>(null)
  const [isDragOver, setIsDragOver] = useState(false)
  const mountedRef = useRef(true)
  useEffect(() => () => { mountedRef.current = false }, [])

  const readAndParse = useCallback((file: File) => {
    setFileName(file.name)
    setParseError(null)
    const reader = new FileReader()
    reader.onload = async () => {
      if (!mountedRef.current) return
      const text = reader.result as string
      try {
        const parsed = await parseCsvAsync(text)
        if (!mountedRef.current) return
        if (parsed.errors.length > 0) {
          setParseError(parsed.errors[0])
        } else {
          onCsvParsed(parsed)
        }
      } catch (err) {
        if (!mountedRef.current) return
        setParseError(err instanceof Error ? err.message : 'Failed to parse CSV')
      }
    }
    reader.readAsText(file)
  }, [onCsvParsed])

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) readAndParse(file)
  }, [readAndParse])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file && file.name.endsWith('.csv')) readAndParse(file)
  }, [readAndParse])

  const isLoaded = csvData && csvData.errors.length === 0

  return (
    <Card className={`${embedded ? 'border-0 shadow-none rounded-none bg-transparent h-full' : 'border-2 border-primary/20'} ${fillHeight ? 'flex h-full flex-col' : ''}`}>
      <CardHeader
        className={`${embedded ? 'pt-3 pb-2 px-4' : 'pb-2'} ${onHeaderClick ? 'cursor-pointer select-none' : ''}`}
        onClick={onHeaderClick}
      >
        <CardTitle className="flex items-center gap-2 text-base">
          <FileArrowUp size={20} weight="duotone" className="text-primary" />
          Usage CSV Import
          {collapsed && isLoaded && (
            <Badge variant="secondary" className="text-xs ml-1">{csvData.users.length} users</Badge>
          )}
        </CardTitle>
        {collapsed ? (
          <CardDescription>Identify power users from usage data</CardDescription>
        ) : (
          <CardDescription>
            Upload a{' '}
            <a
              href="https://docs.github.com/en/billing/how-tos/products/view-productlicense-use#downloading-usage-reports"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary underline underline-offset-2 hover:opacity-80"
              onClick={e => e.stopPropagation()}
            >usage export CSV</a>
            {' '}to identify power users and tune Tier Planner
          </CardDescription>
        )}
      </CardHeader>
      {!collapsed && (
      <CardContent className={`pt-0 ${embedded ? 'px-4 pb-4' : ''} ${fillHeight ? 'flex-1 flex flex-col' : ''}`}>
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv"
          className="hidden"
          onChange={handleFileChange}
        />

        {isLoaded ? (
          /* ── Loaded state: compact success strip ── */
          <div className="flex items-center justify-between gap-3 rounded-lg border border-success/30 bg-success/5 px-4 py-3">
            <div className="flex items-center gap-2.5 min-w-0 flex-wrap">
              <CheckCircle size={18} weight="fill" className="text-success flex-shrink-0" />
              <span className="text-sm font-semibold truncate">{fileName}</span>
              <Badge variant="secondary" className="text-xs">{csvData.users.length} users</Badge>
              <Badge variant="secondary" className="text-xs">{csvData.rowCount.toLocaleString()} rows</Badge>
              {csvData.dateRange && (
                <span className="text-xs text-muted-foreground">
                  {csvData.dateRange.earliest} to {csvData.dateRange.latest}
                </span>
              )}
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground hover:text-destructive flex-shrink-0"
              onClick={() => { onClear(); setFileName(null) }}
            >
              <X size={14} />
            </Button>
          </div>
        ) : (
          /* ── Empty state: drop zone ── */
          <div className={`space-y-2.5 ${fillHeight ? 'flex-1 flex flex-col' : ''}`}>
            <div
              role="button"
              tabIndex={0}
              onClick={() => fileInputRef.current?.click()}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') fileInputRef.current?.click() }}
              onDragOver={(e) => { e.preventDefault(); setIsDragOver(true) }}
              onDragLeave={() => setIsDragOver(false)}
              onDrop={handleDrop}
              className={`group flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-4 py-4 cursor-pointer transition-colors ${fillHeight ? 'flex-1 min-h-[260px]' : ''} ${
                isDragOver
                  ? 'border-primary/60 bg-primary/10'
                  : 'border-muted-foreground/25 hover:border-primary/40 hover:bg-primary/5'
              }`}
            >
              <div className="rounded-md bg-primary/10 p-2 transition-colors group-hover:bg-primary/15">
                <FileArrowUp size={22} weight="duotone" className="text-primary" />
              </div>
              <div className="text-center space-y-0.5">
                <p className="text-sm font-semibold">Drop CSV or click to browse</p>
                <p className="text-xs text-muted-foreground">
                  Export from enterprise billing settings.
                </p>
              </div>
            </div>

            {parseError && (
              <Alert variant="destructive" className="py-2">
                <Warning size={14} weight="fill" />
                <AlertDescription className="text-xs">{parseError}</AlertDescription>
              </Alert>
            )}
          </div>
        )}
      </CardContent>
      )}
    </Card>
  )
}

// --- Consumption Analysis Panel ---

const THRESHOLD_MODES: Array<{ mode: ThresholdMode; label: string }> = [
  { mode: 'top-10', label: 'Top 10%' },
  { mode: 'top-20', label: 'Top 20%' },
  { mode: 'top-30', label: 'Top 30%' },
  { mode: 'custom', label: 'Custom' },
]

interface ConsumptionAnalysisPanelProps {
  csvData: CsvParseResult
  /** Enterprise budget in USD. Used as the spending-ceiling baseline (`pool + entBudget`).
   *  ULB dragging is NOT clamped to this value — dragging past the ceiling is allowed and
   *  surfaces a persistent over-budget alert with a suggested ent-budget increase. */
  enterpriseBudget?: number
  onApplyToTierPlanner?: () => void
  ref?: Ref<HTMLDivElement>
}

function aicsToUsd(aics: number): number {
  if (!Number.isFinite(aics) || aics <= 0) return 0
  return Math.max(1, Math.ceil(aics * 0.01))
}

export function ConsumptionAnalysisPanel({ csvData, enterpriseBudget, onApplyToTierPlanner, ref }: ConsumptionAnalysisPanelProps) {
  const { setCsvSuggestions, credentials, apiFetch, isDemo, setCandidatePowerUserLogins } = useEnterpriseCredentials()
  const [linkCopied, setLinkCopied] = useState(false)
  const [thresholdMode, setThresholdMode] = useState<ThresholdMode>('top-20')
  const [customThreshold, setCustomThreshold] = useState('')
  const [panelOpen, setPanelOpen] = useState(true)
  const [showAllUsers, setShowAllUsers] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [growthBuffer, setGrowthBuffer] = useState(15)
  const [chartView, setChartView] = useState<'graph' | 'table'>('graph')

  const stats: ConsumptionStats = useMemo(
    () => calcConsumptionStats(csvData.users),
    [csvData.users],
  )

  const thresholdResult: ThresholdResult = useMemo(() => {
    const customAICs = parseFloat(customThreshold) || 0
    return calcThreshold(csvData.users, thresholdMode, customAICs)
  }, [csvData.users, thresholdMode, customThreshold])

  // Admin overrides via draggable lines on the chart. null = use the scaled buffered value.
  const [ulbOverride, setUlbOverride] = useState<number | null>(null)
  const [powerUlbOverride, setPowerUlbOverride] = useState<number | null>(null)

  const handleSetCutoff = useCallback((aics: number) => {
    setThresholdMode('custom')
    setCustomThreshold(String(aics))
    // Adjusting the split invalidates ULB overrides — they were sized for the previous split.
    setUlbOverride(null)
    setPowerUlbOverride(null)
  }, [])

  const handleModeChange = useCallback((mode: ThresholdMode) => {
    setThresholdMode(mode)
    if (mode !== 'custom') setCustomThreshold('')
    // Mode change also re-splits the cohort; reset ULB overrides.
    setUlbOverride(null)
    setPowerUlbOverride(null)
  }, [])

  const baseULB = Math.max(19, aicsToUsd(thresholdResult.suggestedULB))
  const basePowerBudget = aicsToUsd(thresholdResult.suggestedPowerUserBudget)
  const bufferedULB = Math.max(19, Math.ceil(baseULB * (1 + growthBuffer / 100)))
  const bufferedPowerBudget = Math.max(1, Math.ceil(basePowerBudget * (1 + growthBuffer / 100)))

  // Pool value in USD — used as the spending-ceiling baseline for the chart's
  // budget cap math. See system-overview.md "Layer 1: The Pre-Paid Pool".
  //
  // We assume promotional pricing (CB: 3,000 AICs × $0.01 = $30/seat, CE: 7,000 ×
  // $0.01 = $70/seat) because the Tier Planner defaults to promo through August
  // 2026 and using standard ($19/$39) here would underestimate the pool, scaling
  // ULB suggestions down and surfacing spurious spending-ceiling warnings.
  //
  // ⚠️ DELETE in August 2026: When the promotional pricing window ends, drop the
  // promo path and switch to standard ($19/$39) — or, better, lift `promotionalPricing`
  // out of BudgetCalculator into shared state and pass it through.
  const poolValueUsd = stats.cbSeats * 30 + stats.ceSeats * 70

  // Scale the data-driven recommended ULBs down (proportionally) so they fit
  // pool + enterprise budget out of the box. This way the chart's initial state
  // is internally consistent — admins don't drag and discover a hidden cap.
  // When `budgetAdjusted` is true, the banner explains the scaling.
  const np = thresholdResult.powerUserCount
  const nbTotal = stats.totalUsers - np
  const dataRequiredTotal = nbTotal * bufferedULB + np * bufferedPowerBudget
  const ceilingForRecs = enterpriseBudget && enterpriseBudget > 0 ? poolValueUsd + enterpriseBudget : Infinity
  const budgetScalingFactor = (enterpriseBudget && enterpriseBudget > 0 && dataRequiredTotal > ceilingForRecs)
    ? ceilingForRecs / dataRequiredTotal
    : 1
  const budgetAdjusted = budgetScalingFactor < 1
  const scaledBufferedULB = budgetAdjusted ? Math.max(1, Math.floor(bufferedULB * budgetScalingFactor)) : bufferedULB
  const scaledBufferedPowerBudget = budgetAdjusted ? Math.max(1, Math.floor(bufferedPowerBudget * budgetScalingFactor)) : bufferedPowerBudget

  // If the admin lowers the enterprise budget (or pool changes via threshold), snap
  // an existing ULB override down to keep total spend within pool + ent budget.
  // Joint constraint: Nb × baseULB + Np × powerULB ≤ pool + ent_budget
  if (enterpriseBudget && enterpriseBudget > 0) {
    const nb = nbTotal
    const totalCeiling = poolValueUsd + enterpriseBudget
    // Snap ulbOverride down if it would push base-side spend past its share of the ceiling
    if (ulbOverride !== null && nb > 0) {
      const baseCap = Math.max(1, Math.floor((totalCeiling - np * scaledBufferedPowerBudget) / nb))
      if (ulbOverride > baseCap) setUlbOverride(baseCap)
    }
    if (powerUlbOverride !== null && np > 0) {
      const powerCap = Math.max(1, Math.floor((totalCeiling - nb * scaledBufferedULB) / np))
      if (powerUlbOverride > powerCap) setPowerUlbOverride(powerCap)
    }
  }

  const effectiveULB = ulbOverride ?? scaledBufferedULB
  const effectivePowerBudget = powerUlbOverride ?? scaledBufferedPowerBudget

  // Coverage stats: how many users from each group would exceed the (effective) suggested limits
  const ulbAicThreshold = effectiveULB * 100 // $1 = 100 AIC
  const pubAicThreshold = effectivePowerBudget * 100
  const regularExceeders = thresholdResult.regularUsers
    .filter(u => u.totalAICs > ulbAicThreshold)
    .sort((a, b) => b.totalAICs - a.totalAICs)
  const regularExceedCount = regularExceeders.length
  const regularCoveredPct = thresholdResult.regularUserCount > 0
    ? Math.round((1 - regularExceedCount / thresholdResult.regularUserCount) * 100)
    : 100
  const powerExceeders = thresholdResult.powerUsers
    .filter(u => u.totalAICs > pubAicThreshold)
    .sort((a, b) => b.totalAICs - a.totalAICs)
  const powerExceedCount = powerExceeders.length
  const powerCoveredPct = thresholdResult.powerUserCount > 0
    ? Math.round((1 - powerExceedCount / thresholdResult.powerUserCount) * 100)
    : 100

  const handleScrollToUser = useCallback((login: string) => {
    setShowAllUsers(true)
    // Per-user rows only exist in the table view, so switch first.
    setChartView('table')
    // Scroll to the user row after expanding + view switch
    requestAnimationFrame(() => {
      const el = document.querySelector(`[data-user-login="${login}"]`)
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    })
  }, [])

  const pendingSuggestions: CsvTierSuggestions = useMemo(() => ({
    cbSeats: stats.cbSeats,
    ceSeats: stats.ceSeats,
    powerUsers: thresholdResult.powerUserCount,
    universalULB: effectiveULB,
    powerUserBudget: effectivePowerBudget,
  }), [stats, thresholdResult, effectiveULB, effectivePowerBudget])

  // Apply to Tier Planner: carries seats + ULB suggestions + power user candidate
  // members all in one handoff. The Tier Planner consumes them via:
  //   - csvSuggestions → BudgetCalculator (license config, recommended ULBs)
  //   - candidatePowerUserLogins → StepCostCenter (team membership)
  const powerUserCandidateLogins = useMemo(
    () => thresholdResult.powerUsers.map(u => u.login),
    [thresholdResult.powerUsers],
  )

  const handleApplyConfirm = useCallback(() => {
    setCsvSuggestions(pendingSuggestions)
    // Always set candidates (even to []) so a previous handoff doesn't leak into this one.
    setCandidatePowerUserLogins(powerUserCandidateLogins.length > 0 ? powerUserCandidateLogins : null)
    setConfirmOpen(false)
    onApplyToTierPlanner?.()
  }, [pendingSuggestions, powerUserCandidateLogins, setCsvSuggestions, setCandidatePowerUserLogins, onApplyToTierPlanner])

  const handleCopyLink = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    const url = `${window.location.origin}${window.location.pathname}#budget-planner?section=consumption-analysis&popup=0`
    navigator.clipboard.writeText(url).then(() => {
      setLinkCopied(true)
      setTimeout(() => setLinkCopied(false), 2000)
    })
  }, [])

  const sortedUsers = useMemo(
    () => [...csvData.users].sort((a, b) => b.totalAICs - a.totalAICs),
    [csvData.users],
  )

  const maxAICs = sortedUsers.length > 0 ? sortedUsers[0].totalAICs : 1

  // Show users centered around the threshold: power users above + some regular users below.
  // This gives context for where the split falls rather than just showing the top N.
  const visibleUsers = useMemo(() => {
    if (showAllUsers) return sortedUsers
    const powerCount = thresholdResult.powerUserCount
    const regularCount = thresholdResult.regularUserCount
    // Show all power users + up to 10 regular users below the cutoff
    const regularToShow = Math.min(10, regularCount)
    const totalToShow = powerCount + regularToShow
    return sortedUsers.slice(0, Math.min(totalToShow, sortedUsers.length))
  }, [showAllUsers, sortedUsers, thresholdResult.powerUserCount, thresholdResult.regularUserCount])

  const hasMore = sortedUsers.length > visibleUsers.length

  return (
    <Card className="border-2 border-primary/20" ref={ref}>
      <Collapsible open={panelOpen} onOpenChange={setPanelOpen}>
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer select-none group">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-base">
                <ChartBar size={20} weight="duotone" className="text-primary" />
                Consumption Analysis
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span
                      role="button"
                      tabIndex={0}
                      onClick={handleCopyLink}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleCopyLink(e as unknown as React.MouseEvent) } }}
                      className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity p-1 rounded hover:bg-muted"
                    >
                      {linkCopied
                        ? <Check size={14} weight="bold" className="text-success" />
                        : <Link size={14} weight="duotone" className="text-muted-foreground" />
                      }
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="right" className="text-xs">
                    {linkCopied ? 'Copied!' : 'Copy link to section'}
                  </TooltipContent>
                </Tooltip>
              </CardTitle>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="gap-1">
                  <Lightning size={12} weight="fill" className="text-warning" />
                  {thresholdResult.powerUserCount} power users
                </Badge>
                {panelOpen
                  ? <CaretUp size={16} className="text-muted-foreground" />
                  : <CaretDown size={16} className="text-muted-foreground" />
                }
              </div>
            </div>
            <CardDescription>
              Identify power users from actual billing data to set budget controls
            </CardDescription>
          </CardHeader>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <CardContent className="space-y-6 pt-0">
            {/* Summary stats */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <StatCard label="Total users" value={stats.totalUsers.toString()} />
              <StatCard
                label="CB / CE active users"
                value={`${stats.cbSeats} / ${stats.ceSeats}`}
                hint="The CSV only includes users who consumed credits during the period. Seat holders with zero activity are not counted. Use these numbers as a floor, not a seat total."
              />
              <StatCard label="Median AICs" value={formatAICs(stats.median)} />
              <StatCard label="Max AICs" value={formatAICs(stats.max)} />
            </div>

            {/* Threshold mode selector */}
            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Power user threshold
              </p>

              <div className="flex flex-wrap items-center gap-2">
                {THRESHOLD_MODES.map(({ mode, label }) => (
                    <Button
                      key={mode}
                      variant="outline"
                      size="sm"
                      className={thresholdMode === mode
                        ? 'bg-primary/10 border-primary/40 text-primary hover:bg-primary/15'
                        : ''
                      }
                      onClick={() => handleModeChange(mode)}
                    >
                      {label}
                    </Button>
                ))}
              </div>

              {thresholdMode === 'custom' && (() => {
                // Convert internal AICs cutoff → display % of top users.
                // Derived from current threshold result so it reflects any
                // click-on-chart action that set the cutoff to a raw AICs value.
                const totalUsers = csvData.users.length
                const currentPct = totalUsers > 0
                  ? Math.round((thresholdResult.powerUserCount / totalUsers) * 100)
                  : 0

                const handlePctChange = (pctStr: string) => {
                  const pct = parseFloat(pctStr)
                  if (!Number.isFinite(pct) || pct <= 0 || totalUsers === 0) {
                    setCustomThreshold('')
                    return
                  }
                  const clampedPct = Math.max(1, Math.min(100, pct))
                  const sorted = [...csvData.users].sort((a, b) => b.totalAICs - a.totalAICs)
                  const count = Math.max(1, Math.ceil(sorted.length * (clampedPct / 100)))
                  const aics = sorted[count - 1].totalAICs
                  setCustomThreshold(String(aics))
                }

                return (
                  <div className="flex items-center gap-2 pl-1">
                    <Crosshair size={14} weight="duotone" className="text-primary shrink-0" />
                    <span className="text-xs text-muted-foreground">Top</span>
                    <NumericInput
                      min={1}
                      placeholder="e.g. 25"
                      value={currentPct || null}
                      onValueChange={(v) => handlePctChange(v === null ? '' : String(v))}
                      className="w-20 h-7 text-sm"
                    />
                    <span className="text-xs text-muted-foreground">%</span>
                    {thresholdResult.powerUserCount > 0 && (
                      <span className="text-xs text-muted-foreground">
                        · {thresholdResult.powerUserCount} {thresholdResult.powerUserCount === 1 ? 'user' : 'users'} at or above {formatAICs(thresholdResult.thresholdAICs)} AICs
                      </span>
                    )}
                  </div>
                )
              })()}
            </div>

            {/* Per-user consumption: graph or table */}
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Per-user consumption
                </p>
                <div className="flex items-center gap-3">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="text-xs text-muted-foreground flex items-center gap-1 cursor-help">
                        <Lightning size={12} weight="duotone" />
                        {chartView === 'graph' ? 'Split power users first, then set ULB amounts' : 'Click a row to set cutoff'}
                      </span>
                    </TooltipTrigger>
                    <TooltipContent side="left" className="max-w-[300px]">
                      <p className="text-xs">
                        {chartView === 'graph'
                          ? <><span className="font-semibold">Recommended order:</span><br />1. Drag the blue <span className="font-semibold">vertical line</span> left/right to split base vs power users.<br />2. Drag the blue <span className="font-semibold">horizontal dashed line</span> up/down to set the Base ULB.<br />3. Drag the orange <span className="font-semibold">horizontal dashed line</span> up/down to set the Power ULB.</>
                          : 'Click any user to set the split between base and power users at their AIC level. Everyone at or above becomes a power user.'
                        }
                      </p>
                    </TooltipContent>
                  </Tooltip>
                  {(ulbOverride !== null || powerUlbOverride !== null) && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="gap-1.5 shrink-0 h-7 text-xs text-muted-foreground hover:text-foreground"
                      onClick={() => { setUlbOverride(null); setPowerUlbOverride(null) }}
                      title="Clear ULB overrides and return to suggested values"
                    >
                      <ArrowCounterClockwise size={12} weight="duotone" />
                      Reset ULBs
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5 shrink-0 h-7 text-xs"
                    onClick={() => setChartView(v => v === 'graph' ? 'table' : 'graph')}
                  >
                    {chartView === 'graph' ? (
                      <>
                        <TableIcon size={12} weight="duotone" />
                        Switch to table view
                      </>
                    ) : (
                      <>
                        <ChartLine size={12} weight="duotone" />
                        Switch to graph view
                      </>
                    )}
                  </Button>
                </div>
              </div>

              {budgetAdjusted && (
                <Alert className="border-warning/40 bg-warning/5">
                    <Info size={14} weight="duotone" className="text-warning" />
                    <AlertDescription className="text-xs space-y-2">
                      <p>
                        <span className="font-semibold text-foreground">Suggested ULBs scaled to your budget cap.</span>
                        {' '}Unscaled targets are <span className="font-semibold">${bufferedULB.toLocaleString()}</span> (base) and <span className="font-semibold">${bufferedPowerBudget.toLocaleString()}</span> (power), but your cap is <span className="font-semibold">${(poolValueUsd + (enterpriseBudget ?? 0)).toLocaleString()}</span>, so values are {Math.round((1 - budgetScalingFactor) * 100)}% lower. To keep this split without scaling, set enterprise budget to <span className="font-semibold">${Math.max(0, Math.ceil(dataRequiredTotal - poolValueUsd)).toLocaleString()}</span>.
                      </p>
                      <p className="text-muted-foreground">
                        <span className="font-semibold text-foreground">Realistic spend is often lower.</span>
                        {' '}Forecasts use actual usage. Pool counts CSV-active users only · zero-usage seats are excluded.
                      </p>
                    </AlertDescription>
                  </Alert>
              )}

              {chartView === 'graph' ? (
                <ConsumptionCurve
                  sortedUsers={sortedUsers}
                  thresholdAICs={thresholdResult.thresholdAICs}
                  powerUserCount={thresholdResult.powerUserCount}
                  bufferedULB={effectiveULB}
                  bufferedPowerBudget={effectivePowerBudget}
                  ulbIsOverridden={ulbOverride !== null}
                  powerUlbIsOverridden={powerUlbOverride !== null}
                  enterpriseBudget={enterpriseBudget}
                  poolValueUsd={poolValueUsd}
                  onUlbChange={setUlbOverride}
                  onPowerUlbChange={setPowerUlbOverride}
                  onSetCutoff={handleSetCutoff}
                />
              ) : (
                <>
                  <div className={`space-y-0.5 ${showAllUsers && sortedUsers.length > 40 ? 'max-h-[500px] overflow-y-auto' : ''}`}>
                    {visibleUsers.map(user => {
                      const isPower = thresholdResult.powerUsers.some(p => p.login === user.login)
                      const isAtCutoff = user.totalAICs === thresholdResult.thresholdAICs
                      return (
                        <button
                          key={user.login}
                          data-user-login={user.login}
                          onClick={() => handleSetCutoff(user.totalAICs)}
                          className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-xs transition-colors group ${
                            isAtCutoff
                              ? 'bg-primary/10 ring-1 ring-primary/30'
                              : 'hover:bg-muted/60'
                          }`}
                        >
                          <span className={`w-28 truncate text-left font-medium ${isPower ? 'text-warning' : 'text-foreground'}`}>
                            {user.login}
                          </span>
                          <div className="flex-1 h-5 bg-muted rounded-sm overflow-hidden">
                            <div
                              className={`h-full rounded-sm transition-all ${isPower ? 'bg-warning/60' : 'bg-primary/30'}`}
                              style={{ width: `${Math.max(1, (user.totalAICs / maxAICs) * 100)}%` }}
                            />
                          </div>
                          <span className={`w-20 text-right tabular-nums ${isPower ? 'text-warning font-semibold' : 'text-muted-foreground'}`}>
                            {formatAICs(user.totalAICs)}
                          </span>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Badge variant="outline" className="text-[10px] px-1.5 w-8 justify-center">
                                {user.totalMonthlyQuota === 1000 ? 'CE' : user.totalMonthlyQuota === 300 ? 'CB' : '\u2014'}
                              </Badge>
                            </TooltipTrigger>
                            <TooltipContent side="left">
                              <p className="text-xs">
                                {user.totalMonthlyQuota === 1000 ? 'Copilot Enterprise' : user.totalMonthlyQuota === 300 ? 'Copilot Business' : 'Unknown plan'}
                              </p>
                            </TooltipContent>
                          </Tooltip>
                        </button>
                      )
                    })}
                  </div>

                  {hasMore && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="w-full text-xs text-muted-foreground"
                      onClick={() => setShowAllUsers(prev => !prev)}
                    >
                      {showAllUsers
                        ? 'Collapse'
                        : `Show all ${sortedUsers.length} users`
                      }
                    </Button>
                  )}
                </>
              )}
            </div>

            {/* Suggested values grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <StatCard label="Threshold" value={`${formatAICs(thresholdResult.thresholdAICs)} AICs`} />
              <StatCard label="Power user share" value={`${(thresholdResult.powerUserAICShare * 100).toFixed(0)}%`} />
              <StatCard
                label={ulbOverride !== null ? 'Universal ULB (overridden)' : 'Suggested universal ULB'}
                value={`$${effectiveULB.toLocaleString()}/user/mo`}
                detail={regularExceedCount > 0
                  ? <>
                      covers {regularCoveredPct}% of your base users
                      {formatExceeders(regularExceeders, handleScrollToUser)}
                    </>
                  : 'covers 100% of base users'
                }
              />
              <StatCard
                label={powerUlbOverride !== null ? 'Power user ULB (overridden)' : 'Suggested power user ULB'}
                value={`$${effectivePowerBudget.toLocaleString()}/user/mo`}
                detail={powerExceedCount > 0
                  ? <>
                      covers {powerCoveredPct}% of power users. {powerExceedCount === 1 ? 'The other would' : `The other ${powerExceedCount} would`} need individual review.
                      {formatExceeders(powerExceeders, handleScrollToUser)}
                    </>
                  : 'covers 100% of power users'
                }
              />
            </div>

            {/* Exceeder review */}
            <ExceedersSection
              regularExceeders={regularExceeders}
              powerExceeders={powerExceeders}
              bufferedULB={effectiveULB}
              bufferedPowerBudget={effectivePowerBudget}
              onScrollToUser={handleScrollToUser}
              credentials={credentials}
              apiFetch={apiFetch}
              isDemo={isDemo}
            />

            {onApplyToTierPlanner && (
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs text-muted-foreground">
                  Use this analysis to set your power user cutoff.
                </p>
                <Button className="gap-2" onClick={() => setConfirmOpen(true)}>
                  Apply to Tier Planner →
                </Button>
              </div>
            )}

            {/* Confirmation dialog */}
            <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
              <AlertDialogContent className="sm:max-w-sm">
                <AlertDialogHeader>
                  <AlertDialogTitle>Apply to Tier Planner</AlertDialogTitle>
                  <AlertDialogDescription asChild>
                    <div>
                      <p className="font-semibold text-foreground">No production changes are applied.</p>
                      <p className="mt-1">Import these values into Tier Planner.</p>
                    </div>
                  </AlertDialogDescription>
                </AlertDialogHeader>

                {/* Seats group */}
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Seats</p>
                  <div className="space-y-1 text-sm">
                    <div className="flex items-baseline gap-1">
                      <span className="text-muted-foreground shrink-0">Copilot Business</span>
                      <span className="flex-1 border-b border-dotted border-border/50 translate-y-[-3px]" />
                      <span className="font-semibold tabular-nums shrink-0">{pendingSuggestions.cbSeats}</span>
                    </div>
                    <div className="flex items-baseline gap-1">
                      <span className="text-muted-foreground shrink-0">Copilot Enterprise</span>
                      <span className="flex-1 border-b border-dotted border-border/50 translate-y-[-3px]" />
                      <span className="font-semibold tabular-nums shrink-0">{pendingSuggestions.ceSeats}</span>
                    </div>
                    <div className="flex items-baseline gap-1">
                      <span className="text-muted-foreground shrink-0">Power users</span>
                      <span className="flex-1 border-b border-dotted border-border/50 translate-y-[-3px]" />
                      <span className="font-semibold tabular-nums shrink-0">{pendingSuggestions.powerUsers}</span>
                    </div>
                  </div>
                </div>

                {/* Budgets group */}
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Budgets</p>
                  <div className="space-y-1 text-sm">
                    <div className="flex items-baseline gap-1">
                      <span className="text-muted-foreground shrink-0">Universal ULB</span>
                      <span className="flex-1 border-b border-dotted border-border/50 translate-y-[-3px]" />
                      <span className="font-semibold tabular-nums shrink-0">${effectiveULB}</span>
                    </div>
                    <p className="text-xs text-muted-foreground pl-0.5">
                      covers {regularCoveredPct}% of your base users{regularExceedCount > 0 ? `. ${regularExceedCount} would exceed based on last month's data.` : ''}
                    </p>
                    <div className="flex items-baseline gap-1">
                      <span className="text-muted-foreground shrink-0">Power user ULB</span>
                      <span className="flex-1 border-b border-dotted border-border/50 translate-y-[-3px]" />
                      <span className="font-semibold tabular-nums shrink-0">${effectivePowerBudget}</span>
                    </div>
                    <p className="text-xs text-muted-foreground pl-0.5">
                      covers {powerCoveredPct}% of power users{powerExceedCount > 0 ? `. ${powerExceedCount === 1 ? 'The other would' : `The other ${powerExceedCount} would`} need individual review.` : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 pl-0.5">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="text-xs text-muted-foreground cursor-help underline decoration-dotted underline-offset-4">Growth buffer</span>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="max-w-[220px] text-xs">
                        Adds a buffer to the ULB and power user budget. Applied to dollar values only
                      </TooltipContent>
                    </Tooltip>
                    <NumericInput
                      value={growthBuffer}
                      onValueChange={v => setGrowthBuffer(Math.min(100, v))}
                      min={0}
                      className="w-14 h-6 text-xs text-center"
                    />
                    <span className="text-xs text-muted-foreground">%</span>
                  </div>
                </div>

                {/* Power user team candidates group */}
                {powerUserCandidateLogins.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                      Power user team members
                    </p>
                    <div className="rounded-md border border-border/60 px-3 py-2 max-h-[100px] overflow-y-auto">
                      <p className="text-xs text-muted-foreground mb-1">
                        {powerUserCandidateLogins.length} candidate {powerUserCandidateLogins.length === 1 ? 'login' : 'logins'} carried over for the power user cost center in Step 2.
                      </p>
                      <p className="text-[11px] font-mono text-foreground/80 break-all">
                        {powerUserCandidateLogins.slice(0, 8).join(', ')}{powerUserCandidateLogins.length > 8 && `, +${powerUserCandidateLogins.length - 8} more`}
                      </p>
                    </div>
                  </div>
                )}

                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleApplyConfirm}>Apply &amp; Open</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  )
}

// --- Helpers ---

function StatCard({ label, value, detail, hint }: { label: string; value: string; detail?: React.ReactNode; hint?: string }) {
  return (
    <div className="bg-muted/30 rounded-lg px-4 py-3 space-y-1">
      <div className="flex items-center gap-1.5">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{label}</p>
        {hint && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                className="text-muted-foreground/60 hover:text-foreground transition-colors"
                aria-label={`About ${label}`}
              >
                <Info size={11} weight="duotone" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-xs text-xs leading-relaxed font-normal">
              <p>{hint}</p>
            </TooltipContent>
          </Tooltip>
        )}
      </div>
      <p className="text-lg font-bold tabular-nums">{value}</p>
      {detail && <div className="text-xs text-muted-foreground">{detail}</div>}
    </div>
  )
}

function formatAICs(n: number): string {
  return n.toLocaleString('en-US', { maximumFractionDigits: 0 })
}

function formatExceeders(users: { login: string }[], onClickUser?: (login: string) => void): React.ReactNode {
  if (users.length === 0) return null
  const show = users.slice(0, 3)
  const rest = users.length - show.length
  return (
    <span className="block mt-0.5">
      {show.map((u, i) => (
        <span key={u.login}>
          {i > 0 && ', '}
          {onClickUser ? (
            <button
              className="text-warning hover:underline cursor-pointer"
              onClick={() => onClickUser(u.login)}
            >
              {u.login}
            </button>
          ) : (
            <span className="text-warning">{u.login}</span>
          )}
        </span>
      ))}
      {rest > 0 && <span> and {rest} {rest === 1 ? 'other' : 'others'}</span>}
    </span>
  )
}

// --- Exceeders Section (table with checkboxes + direct API apply) ---

interface ExceedersSectionProps {
  regularExceeders: CsvUserUsage[]
  powerExceeders: CsvUserUsage[]
  bufferedULB: number
  bufferedPowerBudget: number
  onScrollToUser: (login: string) => void
  credentials: ApiCredentials | null
  apiFetch: (path: string, init?: RequestInit) => Promise<Response>
  isDemo: boolean
}

interface ExistingUserBudget {
  id: string
  login: string
  amount: number
}

function ExceedersSection({
  regularExceeders,
  powerExceeders,
  bufferedULB,
  bufferedPowerBudget,
  onScrollToUser,
  credentials,
  apiFetch,
  isDemo,
}: ExceedersSectionProps) {
  const [open, setOpen] = useState(false)
  const totalExceeders = regularExceeders.length + powerExceeders.length

  // Auto-open when there's something to look at
  const [autoOpened, setAutoOpened] = useState(false)
  if (!autoOpened && totalExceeders > 0) {
    setAutoOpened(true)
    setOpen(true)
  }

  return (
    <div className="border border-border/60 rounded-lg overflow-hidden">
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger asChild>
          <button className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/40 transition-colors text-left">
            <div className="flex items-center gap-2">
              <Warning size={16} weight="duotone" className="text-warning" />
              <span className="text-sm font-semibold">Users above ULB</span>
              {totalExceeders > 0 ? (
                <Badge variant="outline" className="gap-1 text-[11px]">
                  <Warning size={10} weight="fill" className="text-warning" />
                  {totalExceeders} {totalExceeders === 1 ? 'user' : 'users'}
                </Badge>
              ) : (
                <Badge variant="outline" className="gap-1 text-[11px] text-success">
                  <CheckCircle size={10} weight="fill" />
                  All covered
                </Badge>
              )}
            </div>
            {open
              ? <CaretUp size={14} className="text-muted-foreground" />
              : <CaretDown size={14} className="text-muted-foreground" />
            }
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="px-4 pb-4 space-y-4 border-t border-border/60 pt-4">
            <p className="text-xs text-muted-foreground inline-flex items-baseline flex-wrap gap-x-1.5">
              <span>These users would be capped by the suggested ULBs based on last month's data. The suggestions don't cover 100% by design.</span>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span
                    role="button"
                    tabIndex={0}
                    className="inline-flex items-center self-center text-muted-foreground hover:text-foreground cursor-help translate-y-[2px]"
                  >
                    <Info size={13} weight="duotone" />
                  </span>
                </TooltipTrigger>
                <TooltipContent side="right" className="max-w-[340px]">
                  <div className="space-y-2 text-xs">
                    <p>
                      <span className="font-semibold">Why aren't all users covered?</span> The base ULB covers ~95% of base users. The power user ULB sits in the middle of the power-user group, so about half of them would exceed it without an override. If we covered the very top consumer in either group, everyone would get the same headroom and the shared pool would drain faster.
                    </p>
                    <p className="font-semibold pt-1">What you can do:</p>
                    <ul className="list-disc pl-4 space-y-1">
                      <li>
                        <span className="font-semibold">Give them a custom cap.</span> Select rows and click <span className="font-semibold">Apply</span> to set each user's individual ULB to their actual usage.
                      </li>
                      <li>
                        <span className="font-semibold">Raise the base or power ULB.</span> Drag the dashed line on the chart up to cover more of that group.
                      </li>
                      <li>
                        <span className="font-semibold">Do nothing.</span> They'll hit the cap. With usage blocking on, they're paused until next cycle. With it off, the excess counts toward your enterprise budget.
                      </li>
                    </ul>
                  </div>
                </TooltipContent>
              </Tooltip>
            </p>
            <ExceederTable
              regularExceeders={regularExceeders}
              powerExceeders={powerExceeders}
              bufferedULB={bufferedULB}
              bufferedPowerBudget={bufferedPowerBudget}
              onScrollToUser={onScrollToUser}
              credentials={credentials}
              apiFetch={apiFetch}
              isDemo={isDemo}
            />
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  )
}

// --- Consumption Curve (SVG line graph with clickable threshold) ---

interface ConsumptionCurveProps {
  sortedUsers: CsvUserUsage[]
  thresholdAICs: number
  powerUserCount: number
  bufferedULB: number
  bufferedPowerBudget: number
  ulbIsOverridden?: boolean
  powerUlbIsOverridden?: boolean
  /** Enterprise budget in USD. Used together with pool value to clamp ULB drag. */
  enterpriseBudget?: number
  /** Pool value in USD: (cbSeats × $19) + (ceSeats × $39). */
  poolValueUsd?: number
  onUlbChange?: (newUsd: number | null) => void
  onPowerUlbChange?: (newUsd: number | null) => void
  onSetCutoff?: (aics: number) => void
}

function ConsumptionCurve({
  sortedUsers,
  thresholdAICs,
  powerUserCount,
  bufferedULB,
  bufferedPowerBudget,
  ulbIsOverridden,
  powerUlbIsOverridden,
  enterpriseBudget,
  poolValueUsd,
  onUlbChange,
  onPowerUlbChange,
  onSetCutoff,
}: ConsumptionCurveProps) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null)
  const [dragging, setDragging] = useState<'ulb' | 'power' | 'threshold' | null>(null)
  const svgRef = useRef<SVGSVGElement>(null)

  const n = sortedUsers.length
  const VB_W = 1000
  const VB_H = 220
  const PAD_L = 8
  const PAD_R = 8
  const PAD_T = 12
  const PAD_B = 28
  const plotW = VB_W - PAD_L - PAD_R
  const plotH = VB_H - PAD_T - PAD_B

  // Display order: lowest consumer on the left, heaviest on the right.
  // sortedUsers is desc (top consumer first), so we reverse for plotting.
  const displayUsers = useMemo(() => [...sortedUsers].reverse(), [sortedUsers])

  // Power users live at the RIGHT end of the display: indices [powerStartIdx .. n-1].
  const powerStartIdx = Math.max(0, n - powerUserCount)

  const maxAICs = useMemo(() => {
    if (n === 0) return 1
    // sortedUsers[0] is the top consumer in either order
    return Math.max(1, sortedUsers[0].totalAICs)
  }, [sortedUsers, n])

  const xForIndex = useCallback((i: number) => {
    if (n <= 1) return PAD_L
    return PAD_L + (i / (n - 1)) * plotW
  }, [n, plotW])

  const yForAICs = useCallback((aics: number) => {
    return PAD_T + plotH - (aics / maxAICs) * plotH
  }, [maxAICs, plotH])

  // Path data for the curve
  const pathD = useMemo(() => {
    if (n === 0) return ''
    return displayUsers
      .map((u, i) => `${i === 0 ? 'M' : 'L'}${xForIndex(i).toFixed(2)},${yForAICs(u.totalAICs).toFixed(2)}`)
      .join(' ')
  }, [displayUsers, n, xForIndex, yForAICs])

  // Filled area paths
  const baselineY = PAD_T + plotH
  const buildArea = useCallback((startIdx: number, endIdx: number) => {
    if (endIdx < startIdx) return ''
    const points = displayUsers
      .slice(startIdx, endIdx + 1)
      .map((u, i) => `L${xForIndex(startIdx + i).toFixed(2)},${yForAICs(u.totalAICs).toFixed(2)}`)
      .join(' ')
    return `M${xForIndex(startIdx).toFixed(2)},${baselineY} ${points} L${xForIndex(endIdx).toFixed(2)},${baselineY} Z`
  }, [displayUsers, xForIndex, yForAICs, baselineY])

  // Regular area: left side
  const regularAreaD = useMemo(() => {
    if (powerStartIdx <= 0) return ''
    return buildArea(0, powerStartIdx - 1)
  }, [buildArea, powerStartIdx])

  // Power area: right side
  const powerAreaD = useMemo(() => {
    if (powerUserCount === 0 || powerStartIdx >= n) return ''
    return buildArea(powerStartIdx, n - 1)
  }, [buildArea, powerStartIdx, powerUserCount, n])

  // Threshold line sits at the boundary between regular and power (right-side split)
  const thresholdX = powerUserCount > 0 && powerStartIdx < n && powerStartIdx > 0
    ? (xForIndex(powerStartIdx - 1) + xForIndex(powerStartIdx)) / 2
    : powerUserCount === 0
      ? VB_W - PAD_R
      : PAD_L

  // ULB reference lines (in AICs)
  const ulbAicLevel = bufferedULB * 100
  const powerUlbAicLevel = bufferedPowerBudget * 100
  const ulbY = ulbAicLevel <= maxAICs ? yForAICs(ulbAicLevel) : null
  const powerUlbY = powerUlbAicLevel <= maxAICs ? yForAICs(powerUlbAicLevel) : null
  // When the two labels would overlap, push the Power ULB label below its line.
  const labelsOverlap = ulbY !== null && powerUlbY !== null && Math.abs(powerUlbY - ulbY) < 14

  // Budget math (system-overview.md). If pool or enterprise budget aren't provided,
  // the chart's only cap is max consumption.
  const baseUserCount = n - powerUserCount
  const haveBudgetMath = (enterpriseBudget !== undefined && enterpriseBudget > 0) && (poolValueUsd !== undefined && poolValueUsd >= 0)
  const totalSpendCeiling = haveBudgetMath ? (poolValueUsd! + enterpriseBudget!) : Infinity

  const indexFromClientX = useCallback((clientX: number): number | null => {
    if (!svgRef.current || n === 0) return null
    const rect = svgRef.current.getBoundingClientRect()
    const relX = ((clientX - rect.left) / rect.width) * VB_W
    if (relX < PAD_L) return 0
    if (relX > VB_W - PAD_R) return n - 1
    const ratio = (relX - PAD_L) / plotW
    return Math.max(0, Math.min(n - 1, Math.round(ratio * (n - 1))))
  }, [n, plotW])

  // Derived: does the current ULB pair exceed the spending ceiling?
  // (nb × baseULB + np × powerULB > pool + entBudget)
  const currentTotalSpend = baseUserCount * bufferedULB + powerUserCount * bufferedPowerBudget
  const exceedsBudget = haveBudgetMath && currentTotalSpend > totalSpendCeiling
  const overrunUsd = exceedsBudget ? currentTotalSpend - totalSpendCeiling : 0

  // Convert SVG client-y → USD value, clamped to plot area. Does NOT clamp to
  // budget cap — we allow exceeding the cap and surface a persistent warning.
  const usdFromClientY = useCallback((clientY: number): number => {
    if (!svgRef.current) return 0
    const rect = svgRef.current.getBoundingClientRect()
    const relY = ((clientY - rect.top) / rect.height) * VB_H
    const clampedY = Math.max(PAD_T, Math.min(PAD_T + plotH, relY))
    // Inverse of yForAICs: aics = maxAICs * (1 - (y - PAD_T) / plotH)
    const aics = maxAICs * (1 - (clampedY - PAD_T) / plotH)
    return Math.max(1, Math.ceil(aics / 100))
  }, [plotH, maxAICs])

  const handleLinePointerDown = useCallback((line: 'ulb' | 'power' | 'threshold', e: React.PointerEvent<SVGGElement>) => {
    e.stopPropagation()
    if (line === 'ulb' && !onUlbChange) return
    if (line === 'power' && !onPowerUlbChange) return
    if (line === 'threshold' && !onSetCutoff) return
    e.currentTarget.setPointerCapture(e.pointerId)
    setDragging(line)
  }, [onUlbChange, onPowerUlbChange, onSetCutoff])

  const handleLinePointerMove = useCallback((line: 'ulb' | 'power' | 'threshold', e: React.PointerEvent<SVGGElement>) => {
    if (dragging !== line) return
    e.stopPropagation()
    if (line === 'threshold' && onSetCutoff) {
      const idx = indexFromClientX(e.clientX)
      if (idx !== null) onSetCutoff(displayUsers[idx].totalAICs)
      return
    }
    if (line === 'ulb' && onUlbChange) {
      const newUsd = usdFromClientY(e.clientY)
      onUlbChange(newUsd)
    }
    if (line === 'power' && onPowerUlbChange) {
      const newUsd = usdFromClientY(e.clientY)
      onPowerUlbChange(newUsd)
    }
  }, [dragging, usdFromClientY, onUlbChange, onPowerUlbChange, onSetCutoff, indexFromClientX, displayUsers])

  const handleLinePointerUp = useCallback((line: 'ulb' | 'power' | 'threshold', e: React.PointerEvent<SVGGElement>) => {
    e.stopPropagation()
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId)
    }
    setDragging(null)
  }, [])

  const handleMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    const idx = indexFromClientX(e.clientX)
    setHoverIndex(idx)
  }, [indexFromClientX])

  const handleMouseLeave = useCallback(() => setHoverIndex(null), [])

  const handleSvgClick = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (!onSetCutoff || dragging !== null) return
    const idx = indexFromClientX(e.clientX)
    if (idx === null) return
    onSetCutoff(displayUsers[idx].totalAICs)
  }, [onSetCutoff, dragging, indexFromClientX, displayUsers])

  const hoverUser = hoverIndex !== null ? displayUsers[hoverIndex] : null
  const hoverX = hoverIndex !== null ? xForIndex(hoverIndex) : null
  const hoverY = hoverUser ? yForAICs(hoverUser.totalAICs) : null
  // Convert display index → real consumption rank (#1 = highest)
  const hoverRank = hoverIndex !== null ? (n - hoverIndex) : null

  if (n === 0) {
    return (
      <div className="bg-muted/30 rounded-md p-6 text-center text-xs text-muted-foreground">
        No user data to display.
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <div className="bg-muted/20 rounded-md p-2">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${VB_W} ${VB_H}`}
          preserveAspectRatio="none"
          className={`w-full h-[220px] select-none ${onSetCutoff ? 'cursor-crosshair' : ''}`}
          onClick={handleSvgClick}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
        >
          {/* Gridlines */}
          {[0.25, 0.5, 0.75].map(frac => (
            <line
              key={frac}
              x1={PAD_L}
              x2={VB_W - PAD_R}
              y1={PAD_T + plotH * frac}
              y2={PAD_T + plotH * frac}
              stroke="currentColor"
              strokeWidth={1}
              strokeDasharray="2,4"
              className="text-border/40"
            />
          ))}

          {/* Filled areas */}
          {powerAreaD && (
            <path
              d={powerAreaD}
              className="fill-warning/25"
            />
          )}
          {regularAreaD && (
            <path
              d={regularAreaD}
              className="fill-primary/15"
            />
          )}

          {/* Curve line */}
          <path
            d={pathD}
            fill="none"
            stroke="currentColor"
            strokeWidth={1.5}
            strokeLinejoin="round"
            strokeLinecap="round"
            className="text-foreground/70"
          />

          {/* ULB reference lines (draggable) */}
          {ulbY !== null && (
            <g
              style={{ cursor: onUlbChange ? 'ns-resize' : 'default' }}
              onPointerDown={(e) => handleLinePointerDown('ulb', e)}
              onPointerMove={(e) => handleLinePointerMove('ulb', e)}
              onPointerUp={(e) => handleLinePointerUp('ulb', e)}
              onPointerCancel={(e) => handleLinePointerUp('ulb', e)}
              onMouseMove={(e) => { e.stopPropagation(); setHoverIndex(null) }}
              onMouseEnter={() => setHoverIndex(null)}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Wide invisible hit area for easier grabbing */}
              <line
                x1={PAD_L}
                x2={VB_W - PAD_R}
                y1={ulbY}
                y2={ulbY}
                stroke="transparent"
                strokeWidth={12}
              />
              <line
                x1={PAD_L}
                x2={VB_W - PAD_R}
                y1={ulbY}
                y2={ulbY}
                stroke="currentColor"
                strokeWidth={dragging === 'ulb' ? 2 : 1}
                strokeDasharray="4,3"
                className="text-primary/60"
              />
              {/* Drag handle dot at the right end */}
              {onUlbChange && (
                <circle
                  cx={VB_W - PAD_R}
                  cy={ulbY}
                  r={dragging === 'ulb' ? 5 : 3.5}
                  className="fill-primary"
                />
              )}
              <text
                x={VB_W - PAD_R - 12}
                y={ulbY - 3}
                textAnchor="end"
                className="fill-primary text-[10px] font-medium pointer-events-none"
              >
                ULB ${bufferedULB}{ulbIsOverridden ? ' (custom)' : ''}
              </text>
            </g>
          )}
          {powerUlbY !== null && (
            <g
              style={{ cursor: onPowerUlbChange ? 'ns-resize' : 'default' }}
              onPointerDown={(e) => handleLinePointerDown('power', e)}
              onPointerMove={(e) => handleLinePointerMove('power', e)}
              onPointerUp={(e) => handleLinePointerUp('power', e)}
              onPointerCancel={(e) => handleLinePointerUp('power', e)}
              onMouseMove={(e) => { e.stopPropagation(); setHoverIndex(null) }}
              onMouseEnter={() => setHoverIndex(null)}
              onClick={(e) => e.stopPropagation()}
            >
              <line
                x1={PAD_L}
                x2={VB_W - PAD_R}
                y1={powerUlbY}
                y2={powerUlbY}
                stroke="transparent"
                strokeWidth={12}
              />
              <line
                x1={PAD_L}
                x2={VB_W - PAD_R}
                y1={powerUlbY}
                y2={powerUlbY}
                stroke="currentColor"
                strokeWidth={dragging === 'power' ? 2 : 1}
                strokeDasharray="4,3"
                className="text-warning/70"
              />
              {onPowerUlbChange && (
                <circle
                  cx={VB_W - PAD_R}
                  cy={powerUlbY}
                  r={dragging === 'power' ? 5 : 3.5}
                  className="fill-warning"
                />
              )}
              <text
                x={VB_W - PAD_R - 12}
                y={labelsOverlap ? powerUlbY + 11 : powerUlbY - 3}
                textAnchor="end"
                className="fill-warning text-[10px] font-medium pointer-events-none"
              >
                Power ULB ${bufferedPowerBudget}{powerUlbIsOverridden ? ' (custom)' : ''}
              </text>
            </g>
          )}

          {/* Threshold line (draggable horizontally to adjust power user cutoff) */}
          <g
            style={{ cursor: onSetCutoff ? 'ew-resize' : 'default' }}
            onPointerDown={(e) => handleLinePointerDown('threshold', e)}
            onPointerMove={(e) => handleLinePointerMove('threshold', e)}
            onPointerUp={(e) => handleLinePointerUp('threshold', e)}
            onPointerCancel={(e) => handleLinePointerUp('threshold', e)}
            onMouseMove={(e) => { e.stopPropagation(); setHoverIndex(null) }}
            onMouseEnter={() => setHoverIndex(null)}
          >
            {/* Wide invisible hit area for easier grabbing */}
            <line
              x1={thresholdX}
              x2={thresholdX}
              y1={PAD_T}
              y2={PAD_T + plotH}
              stroke="transparent"
              strokeWidth={12}
            />
            <line
              x1={thresholdX}
              x2={thresholdX}
              y1={PAD_T}
              y2={PAD_T + plotH}
              stroke="currentColor"
              strokeWidth={dragging === 'threshold' ? 3 : 2}
              className="text-primary"
            />
            {/* Drag handle dot at the top */}
            {onSetCutoff && (
              <circle
                cx={thresholdX}
                cy={PAD_T}
                r={dragging === 'threshold' ? 5 : 3.5}
                className="fill-primary"
              />
            )}
          </g>

          {/* Hover indicator */}
          {hoverX !== null && hoverY !== null && hoverUser && (
            <g pointerEvents="none">
              <line
                x1={hoverX}
                x2={hoverX}
                y1={PAD_T}
                y2={PAD_T + plotH}
                stroke="currentColor"
                strokeWidth={1}
                className="text-foreground/40"
              />
              <circle
                cx={hoverX}
                cy={hoverY}
                r={4}
                className="fill-background stroke-foreground"
                strokeWidth={1.5}
              />
            </g>
          )}

          {/* Axis labels */}
          <text x={PAD_L} y={VB_H - 8} className="fill-muted-foreground text-[10px]">
            #{n} (lowest)
          </text>
          <text x={VB_W - PAD_R} y={VB_H - 8} textAnchor="end" className="fill-muted-foreground text-[10px]">
            #1 (top consumer)
          </text>
        </svg>
      </div>

      {exceedsBudget && (() => {
        const suggestedEntBudget = Math.max(0, Math.ceil(currentTotalSpend - (poolValueUsd ?? 0)))
        return (
          <div className="rounded-md bg-destructive/10 border border-destructive/40 px-3 py-2 text-xs text-destructive flex items-start gap-2">
            <Warning size={14} weight="duotone" className="mt-0.5 shrink-0" />
            <span>
              <span className="font-semibold">ULBs exceed your spending ceiling by ${overrunUsd.toLocaleString()}.</span>
              {' '}If all users hit their ULB, total spend would reach ${currentTotalSpend.toLocaleString()},
              which is more than your pool (${poolValueUsd?.toLocaleString()}) + enterprise budget (${enterpriseBudget?.toLocaleString()}) = ${totalSpendCeiling.toLocaleString()}.
              Either lower a ULB or raise the enterprise budget to at least <span className="font-semibold">${suggestedEntBudget.toLocaleString()}</span> at the top of the page.
            </span>
          </div>
        )
      })()}

      {/* Legend / split summary */}
      <div className="grid grid-cols-2 gap-3 text-xs">
        <div className="rounded-md bg-primary/5 border border-primary/30 px-3 py-2">
          <div className="flex items-center gap-1.5 text-primary font-semibold">
            <span className="w-2.5 h-2.5 rounded-sm bg-primary/40" />
            Base users · ULB ${bufferedULB}{ulbIsOverridden ? ' (custom)' : ''}
          </div>
          <p className="text-muted-foreground mt-0.5">
            {n - powerUserCount} {(n - powerUserCount) === 1 ? 'user' : 'users'} below threshold
            {onUlbChange && <span className="block text-[10px] italic mt-0.5">Drag the blue line on the chart to adjust.</span>}
          </p>
        </div>
        <div className="rounded-md bg-warning/10 border border-warning/30 px-3 py-2">
          <div className="flex items-center gap-1.5 text-warning font-semibold">
            <span className="w-2.5 h-2.5 rounded-sm bg-warning/60" />
            Power users · ULB ${bufferedPowerBudget}{powerUlbIsOverridden ? ' (custom)' : ''}
          </div>
          <p className="text-muted-foreground mt-0.5">
            {powerUserCount} {powerUserCount === 1 ? 'user' : 'users'} at or above {formatAICs(thresholdAICs)} AICs
            {onPowerUlbChange && <span className="block text-[10px] italic mt-0.5">Drag the orange line on the chart to adjust.</span>}
          </p>
        </div>
      </div>

      {/* Hover detail */}
      <div className="text-xs text-muted-foreground h-4 px-1">
        {hoverUser ? (
          <span>
            <span className="font-semibold text-foreground">{hoverUser.login}</span>
            {' · '}
            <span className="tabular-nums">{formatAICs(hoverUser.totalAICs)}</span> AICs
            {' · '}
            rank #{hoverRank ?? 1}
          </span>
        ) : (
          <span>Hover the curve to inspect a user. Drag the vertical line to split base vs power users, then the dashed lines to set ULB amounts.</span>
        )}
      </div>
    </div>
  )
}

// --- Exceeder Table (with selection + direct API apply) ---

interface ExceederTableProps {
  regularExceeders: CsvUserUsage[]
  powerExceeders: CsvUserUsage[]
  bufferedULB: number
  bufferedPowerBudget: number
  onScrollToUser: (login: string) => void
  credentials: ApiCredentials | null
  apiFetch: (path: string, init?: RequestInit) => Promise<Response>
  isDemo: boolean
}

function ExceederTable({
  regularExceeders,
  powerExceeders,
  bufferedULB,
  bufferedPowerBudget,
  onScrollToUser,
  credentials,
  apiFetch,
  isDemo,
}: ExceederTableProps) {
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [bufferPct, setBufferPct] = useState(0)
  const [liveUserBudgets, setLiveUserBudgets] = useState<ExistingUserBudget[]>([])
  const [, setBudgetsLoading] = useState(false)
  const [budgetsFetchError, setBudgetsFetchError] = useState<string | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [applying, setApplying] = useState(false)
  const [applyProgress, setApplyProgress] = useState<{ done: number; total: number } | null>(null)
  const [applyResult, setApplyResult] = useState<{ created: number; updated: number; failed: string[] } | null>(null)

  const canApplyLive = credentials !== null
  const q = query.trim().toLowerCase()

  const filteredRegular = useMemo(
    () => q ? regularExceeders.filter(u => u.login.toLowerCase().includes(q)) : regularExceeders,
    [regularExceeders, q],
  )
  const filteredPower = useMemo(
    () => q ? powerExceeders.filter(u => u.login.toLowerCase().includes(q)) : powerExceeders,
    [powerExceeders, q],
  )

  // Auto-fetch user budgets when live credentials become available.
  // useEffect (not state-during-render) because we kick off an async API call —
  // render-phase side effects can run multiple times under Strict/Concurrent mode.
  const credId = credentials ? `${credentials.base}|${credentials.ent}` : null
  const canApplyLiveRef = canApplyLive
  const credentialsEntRef = credentials?.ent
  /* eslint-disable react-hooks/set-state-in-effect -- intentional async budget fetch on connect change */
  useEffect(() => {
    if (canApplyLiveRef && credId && credentialsEntRef) {
      setBudgetsLoading(true)
      setBudgetsFetchError(null)
      fetchBudgets(apiFetch, credentialsEntRef)
        .then(budgets => {
          setLiveUserBudgets(filterUserBudgets(budgets))
        })
        .catch((err: unknown) => {
          // If we can't tell which budgets exist on GitHub, the apply loop would
          // assume nothing exists and emit POSTs (which would conflict with any
          // current per-user budgets). Block Apply until the admin retries or
          // refreshes the connection.
          const msg = err instanceof Error ? err.message : String(err)
          setBudgetsFetchError(msg || 'Failed to load existing user budgets')
          setLiveUserBudgets([])
        })
        .finally(() => setBudgetsLoading(false))
    } else if (!canApplyLiveRef) {
      setLiveUserBudgets([])
      setBudgetsFetchError(null)
    }
  }, [canApplyLiveRef, credId, credentialsEntRef, apiFetch])
  /* eslint-enable react-hooks/set-state-in-effect */

  const toggleSelected = useCallback((login: string) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(login)) next.delete(login)
      else next.add(login)
      return next
    })
  }, [])

  const setGroupSelected = useCallback((users: CsvUserUsage[], on: boolean) => {
    setSelected(prev => {
      const next = new Set(prev)
      for (const u of users) {
        if (on) next.add(u.login)
        else next.delete(u.login)
      }
      return next
    })
  }, [])

  // Combined view of all exceeder users for selection lookup
  const allExceedersByLogin = useMemo(() => {
    const m = new Map<string, CsvUserUsage>()
    for (const u of regularExceeders) m.set(u.login, u)
    for (const u of powerExceeders) m.set(u.login, u)
    return m
  }, [regularExceeders, powerExceeders])

  const selectedUsers = useMemo(
    () => Array.from(selected).map(login => allExceedersByLogin.get(login)).filter((u): u is CsvUserUsage => !!u),
    [selected, allExceedersByLogin],
  )

  // Per-user suggested ULB amount: ceil(P100 AICs / 100 * (1 + buffer/100))
  const suggestedAmountFor = useCallback((user: CsvUserUsage) => {
    return Math.max(1, Math.ceil((user.totalAICs / 100) * (1 + bufferPct / 100)))
  }, [bufferPct])

  const handleApply = useCallback(async () => {
    if (!credentials || selectedUsers.length === 0) return
    setApplying(true)
    setApplyProgress({ done: 0, total: selectedUsers.length })
    setApplyResult(null)
    let created = 0
    let updated = 0
    const failed: string[] = []
    for (let i = 0; i < selectedUsers.length; i++) {
      const user = selectedUsers[i]
      const amt = suggestedAmountFor(user)
      const existing = liveUserBudgets.find(b => b.login === user.login)
      try {
        if (existing) {
          await withRateLimitRetry(() => patchBudget(apiFetch, credentials.ent, existing.id, { budget_amount: amt }))
          updated++
        } else {
          await withRateLimitRetry(() => createBudget(apiFetch, credentials.ent, {
            budget_amount: amt,
            prevent_further_usage: true,
            budget_scope: 'user',
            budget_entity_name: user.login,
            user: user.login,
            budget_type: 'BundlePricing',
            budget_product_sku: 'premium_requests',
            budget_alerting: { will_alert: false, alert_recipients: [] },
          }))
          created++
        }
      } catch (err) {
        failed.push(user.login)
        if (!(err instanceof ApiError)) console.error('Apply ULB failed:', err)
      }
      setApplyProgress({ done: i + 1, total: selectedUsers.length })
    }
    setApplying(false)
    setApplyProgress(null)
    setApplyResult({ created, updated, failed })
    // Refetch budgets so "Current on GitHub" column is accurate for retries
    try {
      const budgets = await fetchBudgets(apiFetch, credentials.ent)
      setLiveUserBudgets(filterUserBudgets(budgets))
    } catch { /* non-fatal */ }
    // Clear selection for succeeded users; keep failed users checked for retry
    setSelected(new Set(failed))
    setConfirmOpen(false)
  }, [credentials, selectedUsers, suggestedAmountFor, liveUserBudgets, apiFetch])

  if (regularExceeders.length === 0 && powerExceeders.length === 0) {
    return (
      <div className="rounded-md bg-success/5 border border-success/30 px-3 py-4 text-center text-xs text-success">
        <CheckCircle size={16} weight="duotone" className="inline mr-1" />
        All users are within their suggested ULB. No exceeders to review.
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="relative">
        <MagnifyingGlass size={14} weight="duotone" className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
        <Input
          type="text"
          placeholder="Filter by login..."
          value={query}
          onChange={e => setQuery(e.target.value)}
          className="h-8 pl-7 text-sm"
        />
      </div>

      <ExceederGroup
        label="Power Users who Exceed Suggested ULB"
        accent="warning"
        users={filteredPower}
        totalCount={powerExceeders.length}
        ulbDollars={bufferedPowerBudget}
        emptyHint="No power users exceed their suggested ULB."
        allUsers={powerExceeders}
        selected={selected}
        toggleSelected={toggleSelected}
        setGroupSelected={setGroupSelected}
        onScrollToUser={onScrollToUser}
        liveUserBudgets={liveUserBudgets}
        bufferPct={bufferPct}
        suggestedAmountFor={suggestedAmountFor}
        applying={applying}
      />

      <ExceederGroup
        label="Base Users who Exceed Suggested ULB"
        accent="primary"
        users={filteredRegular}
        totalCount={regularExceeders.length}
        ulbDollars={bufferedULB}
        emptyHint="No base users exceed their suggested ULB."
        allUsers={regularExceeders}
        selected={selected}
        toggleSelected={toggleSelected}
        setGroupSelected={setGroupSelected}
        onScrollToUser={onScrollToUser}
        liveUserBudgets={liveUserBudgets}
        bufferPct={bufferPct}
        suggestedAmountFor={suggestedAmountFor}
        applying={applying}
      />

      {/* Apply bar */}
      {canApplyLive ? (
        <div className="space-y-2">
          {budgetsFetchError && (
            <Alert className="border-warning/40 bg-warning/5 py-2">
              <Warning size={14} weight="duotone" className="text-warning" />
              <AlertDescription className="text-xs text-warning-foreground/90 flex items-center gap-2">
                <span className="flex-1">
                  Couldn't load existing user budgets ({budgetsFetchError}). Apply is disabled to avoid creating conflicting records — reconnect or refresh to retry.
                </span>
              </AlertDescription>
            </Alert>
          )}
          <div className="sticky bottom-2 z-10 mt-2 rounded-md border border-primary/30 bg-card/95 backdrop-blur-sm shadow-sm px-3 py-2 flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2 text-xs">
            <span className="text-muted-foreground">Buffer</span>
            <NumericInput
              value={bufferPct}
              onValueChange={v => setBufferPct(Math.max(0, Math.min(100, v)))}
              min={0}
              className="w-14 h-7 text-xs text-center"
            />
            <span className="text-muted-foreground">%</span>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="text-muted-foreground cursor-help">
                  <Info size={12} weight="duotone" />
                </span>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-[240px] text-xs">
                Adds headroom on top of each user's P100 actual usage. 0% = exact match to last month's consumption.
              </TooltipContent>
            </Tooltip>
          </div>
          <span className="text-xs text-muted-foreground">
            {selectedUsers.length === 0 ? 'Select users to apply individual ULBs' : `${selectedUsers.length} selected`}
          </span>
          <Button
            className="ml-auto gap-2"
            disabled={selectedUsers.length === 0 || applying || budgetsFetchError !== null}
            onClick={() => setConfirmOpen(true)}
          >
            {applying ? (
              <>
                <SpinnerGap size={14} weight="duotone" className="animate-spin" />
                Applying {applyProgress?.done ?? 0} / {applyProgress?.total ?? 0}
              </>
            ) : (
              <>Apply {selectedUsers.length > 0 ? `${selectedUsers.length} ` : ''}individual ULB{selectedUsers.length === 1 ? '' : 's'}</>
            )}
          </Button>
          </div>
        </div>
      ) : (
        <Alert>
          <Info size={14} weight="duotone" />
          <AlertDescription>
            Connect your enterprise (in the Import panel above) to apply individual ULBs directly. You can still copy logins for offline use.
          </AlertDescription>
        </Alert>
      )}

      {/* Result toast (inline) */}
      {applyResult && (
        <Alert variant={applyResult.failed.length > 0 ? 'destructive' : 'default'} className={applyResult.failed.length > 0 ? '' : 'border-success/40 bg-success/5'}>
          {applyResult.failed.length > 0
            ? <Warning size={14} weight="duotone" className="text-destructive" />
            : <CheckCircle size={14} weight="duotone" className="text-success" />
          }
          <AlertDescription className="text-xs">
            {applyResult.created + applyResult.updated > 0 && (
              <span>
                Applied {applyResult.created + applyResult.updated} ULB{applyResult.created + applyResult.updated === 1 ? '' : 's'} ({applyResult.created} created, {applyResult.updated} updated).
              </span>
            )}
            {applyResult.failed.length > 0 && (
              <span> {applyResult.failed.length} failed: <span className="font-mono">{applyResult.failed.slice(0, 3).join(', ')}{applyResult.failed.length > 3 ? `, +${applyResult.failed.length - 3} more` : ''}</span>. They remain selected for retry.</span>
            )}
            <button
              type="button"
              className="ml-2 underline text-muted-foreground hover:text-foreground"
              onClick={() => setApplyResult(null)}
            >
              dismiss
            </button>
          </AlertDescription>
        </Alert>
      )}

      {/* Confirmation dialog */}
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent className="sm:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>Apply {selectedUsers.length} individual ULB{selectedUsers.length === 1 ? '' : 's'}?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <p>
                  {isDemo
                    ? <>This is a <span className="font-semibold text-foreground">demo</span>. Changes apply to in-memory sample data only and reset on refresh. Connect a real enterprise to apply for real.</>
                    : <>This will <span className="font-semibold text-foreground">write to your live enterprise</span> via the GitHub Billing API. Existing user budgets are updated; new ones are created with usage blocking on.</>
                  }
                </p>
                <p className="text-xs text-muted-foreground">
                  Individual ULBs override the universal ULB and any uniform amount set by the Tier Planner's Individual Budgets step for the same users.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="max-h-[280px] overflow-y-auto border border-border/60 rounded-md">
            <div className="grid grid-cols-[1fr_70px_70px] gap-2 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground border-b border-border/60 bg-muted/30 sticky top-0">
              <span>Login</span>
              <span className="text-right">Current</span>
              <span className="text-right">New</span>
            </div>
            <div className="divide-y divide-border/40 text-xs">
              {selectedUsers.map(u => {
                const existing = liveUserBudgets.find(b => b.login === u.login)
                const newAmt = suggestedAmountFor(u)
                return (
                  <div key={u.login} className="grid grid-cols-[1fr_70px_70px] gap-2 px-3 py-1.5 items-center">
                    <span className="truncate font-medium">{u.login}</span>
                    <span className="text-right tabular-nums text-muted-foreground">
                      {existing ? `$${existing.amount.toLocaleString()}` : '—'}
                    </span>
                    <span className="text-right tabular-nums font-semibold">${newAmt.toLocaleString()}</span>
                  </div>
                )
              })}
            </div>
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel disabled={applying}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleApply} disabled={applying}>
              {applying ? 'Applying…' : 'Apply'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

interface ExceederGroupProps {
  label: string
  accent: 'warning' | 'primary'
  users: CsvUserUsage[]
  totalCount: number
  ulbDollars: number
  emptyHint: string
  allUsers: CsvUserUsage[]
  selected: Set<string>
  toggleSelected: (login: string) => void
  setGroupSelected: (users: CsvUserUsage[], on: boolean) => void
  onScrollToUser: (login: string) => void
  liveUserBudgets: ExistingUserBudget[]
  bufferPct: number
  suggestedAmountFor: (user: CsvUserUsage) => number
  applying: boolean
}

const PAGE_SIZE = 25

function ExceederGroup({ label, accent, users, totalCount, ulbDollars, emptyHint, allUsers, selected, toggleSelected, setGroupSelected, onScrollToUser, liveUserBudgets, suggestedAmountFor, applying }: ExceederGroupProps) {
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)
  const [copied, setCopied] = useState(false)
  const ulbAicThreshold = ulbDollars * 100
  const visible = users.slice(0, visibleCount)
  const hasMore = users.length > visibleCount
  const accentText = accent === 'warning' ? 'text-warning' : 'text-primary'
  const accentBg = accent === 'warning' ? 'bg-warning' : 'bg-primary'

  // Selection state for "select all" checkbox: based on the full group (not just filtered/visible)
  const selectedInGroup = allUsers.filter(u => selected.has(u.login)).length
  const allSelected = totalCount > 0 && selectedInGroup === totalCount
  const someSelected = selectedInGroup > 0 && !allSelected

  const handleCopyLogins = useCallback(() => {
    const logins = allUsers.map(u => u.login).join(', ')
    navigator.clipboard.writeText(logins).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }, [allUsers])

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        <span className={`w-2 h-2 rounded-full ${accentBg}`} />
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</span>
        <Badge variant="outline" className="text-[10px]">
          {users.length === totalCount ? totalCount : `${users.length} / ${totalCount}`}
        </Badge>
        {totalCount > 0 && (
          <div className="ml-auto flex items-center gap-2">
            <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground cursor-pointer select-none">
              <Checkbox
                checked={allSelected ? true : someSelected ? 'indeterminate' : false}
                onCheckedChange={(checked) => setGroupSelected(allUsers, checked === true)}
                disabled={applying}
                aria-label={`Select all ${label}`}
              />
              Select all
            </label>
            <Button
              variant="ghost"
              size="sm"
              className="gap-1 h-6 text-[11px] px-2"
              onClick={handleCopyLogins}
            >
              {copied ? (
                <>
                  <Check size={11} weight="fill" className="text-success" />
                  Copied
                </>
              ) : (
                <>
                  <Link size={11} weight="duotone" />
                  Copy logins
                </>
              )}
            </Button>
          </div>
        )}
      </div>

      {totalCount === 0 ? (
        <p className="text-xs text-muted-foreground pl-4">{emptyHint}</p>
      ) : users.length === 0 ? (
        <p className="text-xs text-muted-foreground pl-4">No matches in this group.</p>
      ) : (
        <>
          {/* Table header */}
          <div className="grid grid-cols-[24px_1fr_80px_64px_64px_72px] gap-2 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground border-b border-border/60">
            <span></span>
            <span>Login</span>
            <span className="text-right">Used (AICs)</span>
            <span className="text-right">ULB</span>
            <span className="text-right">Current</span>
            <span className="text-right">New ULB</span>
          </div>
          <div className="divide-y divide-border/40">
            {visible.map(user => {
              const isSelected = selected.has(user.login)
              const ratio = ulbAicThreshold > 0 ? user.totalAICs / ulbAicThreshold : 0
              const existing = liveUserBudgets.find(b => b.login === user.login)
              const newAmt = suggestedAmountFor(user)
              return (
                <div
                  key={user.login}
                  className={`grid grid-cols-[24px_1fr_80px_64px_64px_72px] gap-2 px-3 py-1.5 text-xs transition-colors items-center ${isSelected ? 'bg-primary/5' : 'hover:bg-muted/40'}`}
                  title={`${ratio.toFixed(1)}x the ULB threshold`}
                >
                  <Checkbox
                    checked={isSelected}
                    onCheckedChange={() => toggleSelected(user.login)}
                    disabled={applying}
                    aria-label={`Select ${user.login}`}
                  />
                  <button
                    type="button"
                    className={`truncate font-medium text-left hover:underline ${accentText}`}
                    onClick={() => onScrollToUser(user.login)}
                  >
                    {user.login}
                  </button>
                  <span className="text-right tabular-nums">{formatAICs(user.totalAICs)}</span>
                  <span className="text-right tabular-nums text-muted-foreground">${ulbDollars}</span>
                  <span className="text-right tabular-nums text-muted-foreground">
                    {existing ? `$${existing.amount.toLocaleString()}` : '—'}
                  </span>
                  <span className={`text-right tabular-nums font-semibold ${accentText}`}>${newAmt.toLocaleString()}</span>
                </div>
              )
            })}
          </div>
          {hasMore && (
            <Button
              variant="ghost"
              size="sm"
              className="w-full text-xs text-muted-foreground"
              onClick={() => setVisibleCount(c => c + PAGE_SIZE)}
            >
              Show more ({users.length - visibleCount} remaining)
            </Button>
          )}
        </>
      )}
    </div>
  )
}
