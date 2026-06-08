import { useState, useCallback, useEffect, useMemo, useRef } from 'react'
import { ArrowDown, ArrowUp, ArrowsDownUp, Buildings, CaretRight, CurrencyCircleDollar, DownloadSimple, FileArrowUp, Info, Lightning, SpinnerGap, UsersThree, WarningCircle } from '@phosphor-icons/react'
import { Card, CardContent, CardHeader, CardDescription } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Label } from '@/components/ui/label'
import { useEnterpriseCredentials } from '@/hooks/use-enterprise-credentials'
import { generateDemoBillingReportData } from '@/lib/demo-data'
import { fetchAllPages } from '@/hooks/use-promo-seat-data'
import { fetchUserSpend, fetchEnterpriseBilled } from '@/lib/api'
import {
  deduplicateSeats,
  buildUserToCostCenterMap,
  calcChargeback,
  chargebackToCsv,
  fetchUsageInBatches,
  csvToChargebackInput,
  type ChargebackResult,
  type UserChargebackRow,
  type DepartmentSummary,
  type CsvParseResult,
} from '@/lib/chargeback'
import { parseCsvAsync } from '@/lib/csv-parser-client'

// --- Constants ---
const BATCH_CONCURRENCY = 15
const ROWS_PER_PAGE = 50

type SortField = 'login' | 'planType' | 'entitlementAICs' | 'actualUsageAICs' | 'additionalUsageAICs' | 'rawChargeDollars' | 'discountedChargeDollars' | 'costCenter'
type SortDir = 'asc' | 'desc'
type ViewMode = 'users' | 'departments'

function buildMonthOptions(): Array<{ label: string; year: number; month: number }> {
  const now = new Date()
  const options: Array<{ label: string; year: number; month: number }> = []
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    options.push({
      label: d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
      year: d.getFullYear(),
      month: d.getMonth() + 1,
    })
  }
  return options
}

function formatDollars(n: number): string {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 })
}

function formatAICs(n: number): string {
  return n.toLocaleString('en-US')
}

export default function BillingReport() {
  const { credentials, apiFetch, sharedCostCenters, budgetMeta, isDemo, csvUsageData } = useEnterpriseCredentials()

  // Data source toggle
  type DataSource = 'api' | 'csv'
  const [dataSource, setDataSource] = useState<DataSource>('csv')

  // Controls
  const monthOptions = useMemo(() => buildMonthOptions(), [])
  const [selectedMonth, setSelectedMonth] = useState(`${monthOptions[0].year}-${monthOptions[0].month}`)
  const [isPromo, setIsPromo] = useState(true)
  const [acdPercent, setAcdPercent] = useState(0)

  // Exclusion state from API
  const excludeCostCenterUsage = budgetMeta.apiExcludeCostCenters === true

  // CSV import state
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [csvParsed, setCsvParsed] = useState<CsvParseResult | null>(null)
  const [csvFileName, setCsvFileName] = useState<string | null>(null)

  // Pre-fill from Budget Planner CSV upload if available
  const [prevSharedCsv, setPrevSharedCsv] = useState(csvUsageData)
  const [autoGenerateTriggered, setAutoGenerateTriggered] = useState(false)
  if (csvUsageData !== prevSharedCsv) {
    setPrevSharedCsv(csvUsageData)
    if (csvUsageData && csvUsageData.errors.length === 0 && !csvParsed) {
      setCsvParsed(csvUsageData)
      setCsvFileName('(from Budget Planner)')
      setAutoGenerateTriggered(false)
    }
  }

  // Controls collapse state
  const [controlsOpen, setControlsOpen] = useState(!isDemo)

  // Fetch state
  const [loading, setLoading] = useState(false)
  const [progress, setProgress] = useState({ completed: 0, total: 0, phase: '' })
  const [error, setError] = useState<string | null>(null)

  // Results — in demo mode, pre-generate a 650-user billing report
  const [demoGenerated] = useState(() => isDemo ? generateDemoBillingReportData() : null)
  const [result, setResult] = useState<ChargebackResult | null>(demoGenerated?.result ?? null)

  // View state
  const [viewMode, setViewMode] = useState<ViewMode>('departments')
  const [sortField, setSortField] = useState<SortField>('rawChargeDollars')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [currentPage, setCurrentPage] = useState(1)
  const [expandedDepts, setExpandedDepts] = useState<Set<string>>(
    () => demoGenerated?.result?.departments?.[0]
      ? new Set([demoGenerated.result.departments[0].costCenterName])
      : new Set()
  )

  const handleSort = useCallback((field: SortField) => {
    setSortDir(prev => {
      if (sortField !== field) return 'desc'
      return prev === 'asc' ? 'desc' : 'asc'
    })
    setSortField(field)
    setCurrentPage(1)
  }, [sortField])

  const parsedYear = Number(selectedMonth.split('-')[0])
  const parsedMonthNum = Number(selectedMonth.split('-')[1])

  const handleCsvFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setCsvFileName(file.name)
    setError(null)
    setCsvParsed(null)
    setResult(null)

    const reader = new FileReader()
    reader.onload = async (evt) => {
      const text = evt.target?.result as string
      try {
        const parsed = await parseCsvAsync(text)
        setCsvParsed(parsed)
        if (parsed.errors.length > 0) {
          setError(parsed.errors.join(' '))
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to parse CSV')
      }
    }
    reader.readAsText(file)
  }

  const handleGenerateFromCsv = async () => {
    if (!csvParsed || csvParsed.errors.length > 0) return
    if (!credentials) return
    setLoading(true)
    setError(null)
    setResult(null)
    setCurrentPage(1)

    try {
      // Only API call needed: fetch seats for license type
      setProgress({ completed: 0, total: 0, phase: 'Fetching Copilot seats for license types...' })
      const seatResult = await fetchAllPages<{
        plan_type?: string
        assignee?: { login: string }
        pending_cancellation_date?: string | null
      }>(apiFetch, `/enterprises/${credentials.ent}/copilot/billing/seats`, 'seats')

      const uniqueUsers = deduplicateSeats(seatResult.items)
      const seatMap = new Map(uniqueUsers.map(u => [u.login, u.planType]))

      // Convert CSV data + seats into chargeback input
      const { users, userToCostCenter, enterpriseGrossAmount, enterpriseNetAmount } =
        csvToChargebackInput(csvParsed.users, seatMap)

      setProgress({ completed: 1, total: 1, phase: 'Computing billing report...' })
      const chargebackResult = calcChargeback(
        users,
        enterpriseNetAmount,
        enterpriseGrossAmount,
        isPromo,
        userToCostCenter,
        acdPercent,
        excludeCostCenterUsage,
      )

      setResult(chargebackResult)
      setControlsOpen(false)
      if (chargebackResult.departments.length > 0) {
        setExpandedDepts(new Set())
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate billing report')
    } finally {
      setLoading(false)
    }
  }

  // Auto-generate chargeback when CSV is pre-filled from Budget Planner
  /* eslint-disable react-hooks/set-state-in-effect -- intentional one-shot auto-generate on tab navigation */
  useEffect(() => {
    if (autoGenerateTriggered || !csvParsed || csvParsed.errors.length > 0 || !credentials || loading || result) return
    if (csvFileName !== '(from Budget Planner)') return
    setAutoGenerateTriggered(true)
    // Inline the generate logic to avoid stale closure over handleGenerateFromCsv
    const run = async () => {
      setLoading(true)
      setError(null)
      setResult(null)
      try {
        const seatResult = await fetchAllPages<{
          plan_type?: string
          assignee?: { login: string }
          pending_cancellation_date?: string | null
        }>(apiFetch, `/enterprises/${credentials.ent}/copilot/billing/seats`, 'seats')
        const uniqueUsers = deduplicateSeats(seatResult.items)
        const seatMap = new Map(uniqueUsers.map(u => [u.login, u.planType]))
        const { users, userToCostCenter, enterpriseGrossAmount, enterpriseNetAmount } =
          csvToChargebackInput(csvParsed.users, seatMap)
        const chargebackResult = calcChargeback(
          users, enterpriseNetAmount, enterpriseGrossAmount,
          isPromo, userToCostCenter, acdPercent, excludeCostCenterUsage,
        )
        setResult(chargebackResult)
        setControlsOpen(false)
        if (chargebackResult.departments.length > 0) {
          setExpandedDepts(new Set())
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to generate billing report')
      } finally {
        setLoading(false)
      }
    }
    run()
  }, [csvFileName, autoGenerateTriggered]) // eslint-disable-line react-hooks/exhaustive-deps
  /* eslint-enable react-hooks/set-state-in-effect */

  const handleGenerate = async () => {
    if (!credentials) return
    setLoading(true)
    setError(null)
    setResult(null)
    setCurrentPage(1)

    try {
      // Phase 1: Fetch seats
      setProgress({ completed: 0, total: 0, phase: 'Fetching Copilot seats...' })
      const seatResult = await fetchAllPages<{
        plan_type?: string
        assignee?: { login: string }
        pending_cancellation_date?: string | null
      }>(apiFetch, `/enterprises/${credentials.ent}/copilot/billing/seats`, 'seats')

      const uniqueUsers = deduplicateSeats(seatResult.items)
      const logins = uniqueUsers.map(u => u.login)

      // Phase 2: Fetch enterprise total
      setProgress({ completed: 0, total: logins.length, phase: 'Fetching enterprise total...' })
      const entTotal = await fetchEnterpriseBilled(
        apiFetch, credentials.ent, parsedYear, parsedMonthNum,
      )

      // Phase 3: Fetch per-user usage in parallel batches
      setProgress({ completed: 0, total: logins.length, phase: `Fetching usage: 0 / ${logins.length} users...` })
      const userUsage = await fetchUsageInBatches(
        (login) => fetchUserSpend(apiFetch, credentials.ent, login, parsedYear, parsedMonthNum),
        logins,
        BATCH_CONCURRENCY,
        (completed, total) => {
          setProgress({ completed, total, phase: `Fetching usage: ${completed} / ${total} users...` })
        },
      )

      // Phase 4: Calculate billing report
      setProgress({ completed: logins.length, total: logins.length, phase: 'Computing billing report...' })
      const userToCc = buildUserToCostCenterMap(sharedCostCenters)
      const userMap = new Map(uniqueUsers.map(u => [u.login, u.planType]))

      const usersWithUsage = userUsage.map(u => ({
        login: u.login,
        planType: userMap.get(u.login) ?? 'business' as const,
        grossAmount: u.grossAmount,
        netAmount: u.netAmount,
      }))

      const chargebackResult = calcChargeback(
        usersWithUsage,
        entTotal.netAmount,
        entTotal.grossAmount,
        isPromo,
        userToCc,
        acdPercent,
        excludeCostCenterUsage,
      )

      setResult(chargebackResult)
      setControlsOpen(false)
      if (chargebackResult.departments.length > 0) {
        setExpandedDepts(new Set())
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate billing report')
    } finally {
      setLoading(false)
    }
  }

  const handleExportCsv = () => {
    if (!result) return
    const csv = chargebackToCsv(result, parsedMonthNum, parsedYear)
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `billing-report-${parsedYear}-${String(parsedMonthNum).padStart(2, '0')}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  // Sort and paginate user rows
  const sortedUsers = useMemo(() => {
    if (!result) return []
    const sorted = [...result.users]
    sorted.sort((a, b) => {
      const valA = a[sortField]
      const valB = b[sortField]
      if (valA == null && valB == null) return 0
      if (valA == null) return 1
      if (valB == null) return -1
      if (typeof valA === 'string' && typeof valB === 'string') {
        return sortDir === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA)
      }
      return sortDir === 'asc' ? (valA as number) - (valB as number) : (valB as number) - (valA as number)
    })
    return sorted
  }, [result, sortField, sortDir])

  const totalPages = Math.ceil(sortedUsers.length / ROWS_PER_PAGE)
  const paginatedUsers = sortedUsers.slice((currentPage - 1) * ROWS_PER_PAGE, currentPage * ROWS_PER_PAGE)

  const toggleDept = useCallback((name: string) => {
    setExpandedDepts(prev => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  }, [])

  // --- Not connected state ---
  if (!credentials) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <CurrencyCircleDollar size={48} weight="duotone" className="mx-auto mb-4 text-muted-foreground" />
          <p className="text-lg font-medium mb-2">Connect to an Enterprise</p>
          <p className="text-sm text-muted-foreground">
            Connect on the Budget Planner tab to generate billing reports.
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3">
          <h2 className="text-3xl font-bold tracking-tight">Billing Report</h2>
        </div>
        <p className="text-muted-foreground mt-1">
          Allocate metered Copilot charges to cost centers based on per-user consumption above their included credits
        </p>
      </div>

      {/* Controls */}
      <Collapsible open={controlsOpen} onOpenChange={setControlsOpen}>
        <Card className="border-2 border-primary/20">
          <CollapsibleTrigger asChild>
            <button className="w-full text-left px-6 py-3 flex items-center justify-between hover:bg-muted/30 transition-colors rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring group">
              <div className="flex items-center gap-2 text-base font-semibold">
                <CurrencyCircleDollar size={20} weight="duotone" className="text-primary" />
                Report Configuration
              </div>
              <CaretRight size={16} weight="bold" className="text-muted-foreground transition-transform group-data-[state=open]:rotate-90" />
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent className="pt-0 pb-4 space-y-4">
              <CardDescription className="mt-0">Choose a data source and pricing to generate a billing projection</CardDescription>
          {/* Source */}
          <div className="space-y-3">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Source</span>
            <div className="flex items-end gap-4 flex-wrap">
              <div className="space-y-1.5">
                <div className="flex gap-1 rounded-lg bg-muted p-1 w-full sm:w-fit" role="tablist">
                  <button
                    role="tab"
                    aria-selected={dataSource === 'csv'}
                    onClick={() => { setDataSource('csv'); setResult(null); setError(null) }}
                    className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors flex items-center gap-1.5 ${
                      dataSource === 'csv' ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    CSV Import
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-success bg-success/15 px-1.5 py-0.5 rounded">
                      Recommended
                    </span>
                  </button>
                  <button
                    role="tab"
                    aria-selected={dataSource === 'api'}
                    onClick={() => { setDataSource('api'); setResult(null); setError(null) }}
                    className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors flex items-center gap-1 ${
                      dataSource === 'api' ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    API (per-user)
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <WarningCircle size={13} weight="fill" className="text-warning inline" />
                      </TooltipTrigger>
                      <TooltipContent side="bottom" className="max-w-[280px]">
                        <p className="text-xs">
                          Makes one API call per user. For 1,000+ users this may take several minutes and could be affected by{' '}
                          <a
                            href="https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api?apiVersion=2026-03-10#primary-rate-limit-for-authenticated-users"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="underline"
                          >
                            API rate limits
                          </a>.
                          CSV Import is recommended for large enterprises.
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  </button>
                </div>
              </div>
            </div>

            {dataSource === 'api' && (
              <div className="space-y-1.5">
                <Label htmlFor="cb-month">Billing Month</Label>
                <select
                  id="cb-month"
                  value={selectedMonth}
                  onChange={e => setSelectedMonth(e.target.value)}
                  className="flex h-9 w-[200px] items-center rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm ring-offset-background transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  {monthOptions.map(opt => (
                    <option key={`${opt.year}-${opt.month}`} value={`${opt.year}-${opt.month}`}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {dataSource === 'csv' && (
              <div className="space-y-1.5">
                <Label>Usage Export CSV</Label>
                <div className="flex items-center gap-2">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".csv"
                    onChange={handleCsvFile}
                    className="hidden"
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => fileInputRef.current?.click()}
                    className="gap-2"
                  >
                    <FileArrowUp size={16} weight="duotone" />
                    {csvFileName ?? 'Choose file'}
                  </Button>
                  {csvParsed && csvParsed.errors.length === 0 && (
                    <span className="text-xs text-muted-foreground">
                      {csvParsed.rowCount.toLocaleString()} rows · {csvParsed.users.length.toLocaleString()} users
                      {csvParsed.dateRange && ` · ${csvParsed.dateRange.earliest} to ${csvParsed.dateRange.latest}`}
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  Download the usage report CSV from your enterprise billing settings.{' '}
                  <a
                    href="https://docs.github.com/en/billing/how-tos/products/view-productlicense-use#downloading-usage-reports"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline"
                  >
                    How to download usage reports →
                  </a>
                </p>
              </div>
            )}
          </div>

          {/* Pricing */}
          <div className="space-y-2">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Pricing</span>
            <div className="flex items-center gap-6 flex-wrap">
              <div className="flex items-center gap-2">
                <Label htmlFor="cb-acd" className="text-sm">ACD</Label>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info size={12} weight="fill" className="text-muted-foreground cursor-default" />
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="max-w-[280px]">
                    <p className="text-xs">
                      <strong>Azure Committed Discount.</strong> If your enterprise has a committed spend agreement with Microsoft,
                      enter your discount percentage to see post-discount charges.{' '}
                      <a
                        href="https://learn.microsoft.com/en-us/azure/cost-management-billing/savings-plan/discount-application"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline"
                      >
                        Learn more
                      </a>
                    </p>
                  </TooltipContent>
                </Tooltip>
                <Input
                  id="cb-acd"
                  type="number"
                  min={0}
                  max={100}
                  step={0.1}
                  value={acdPercent}
                  onChange={e => setAcdPercent(Math.max(0, Math.min(100, parseFloat(e.target.value) || 0)))}
                  className="h-8 w-[72px] text-sm"
                />
                <span className="text-xs text-muted-foreground">% (optional)</span>
              </div>

              <div className="flex items-center gap-2">
                <Switch id="cb-promo" checked={isPromo} onCheckedChange={setIsPromo} />
                <Label htmlFor="cb-promo" className="text-sm cursor-pointer">GitHub promotional pricing</Label>
              </div>
            </div>
          </div>

          {/* Action */}
          <div className="space-y-3">
            {loading && progress.total > 0 && (
              <div className="space-y-1">
                <div className="text-xs text-muted-foreground">{progress.phase}</div>
                <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full bg-primary rounded-full transition-all duration-300"
                    style={{ width: `${(progress.completed / progress.total) * 100}%` }}
                  />
                </div>
              </div>
            )}
            {loading && progress.total === 0 && (
              <div className="text-xs text-muted-foreground">{progress.phase}</div>
            )}
            {!loading && isDemo && !result && (
              <div className="flex items-center gap-2 rounded-md bg-muted/50 px-3 py-2">
                <Info size={14} weight="duotone" className="text-muted-foreground shrink-0" />
                <span className="text-xs text-muted-foreground">Running with sample data. Connect your enterprise for real usage</span>
              </div>
            )}
            <div className="flex justify-end">
              <Button
                onClick={dataSource === 'csv' && csvParsed && csvParsed.errors.length === 0 ? handleGenerateFromCsv : handleGenerate}
                disabled={loading || (dataSource === 'csv' && !isDemo && (!csvParsed || csvParsed.errors.length > 0))}
                className="gap-2"
              >
                {loading ? (
                  <SpinnerGap size={18} weight="bold" className="animate-spin" />
                ) : (
                  <Lightning size={18} weight="duotone" />
                )}
                {loading ? 'Generating...' : isDemo ? 'Generate Sample Report' : 'Generate Report'}
              </Button>
            </div>
          </div>
        </CardContent>
        </CollapsibleContent>
      </Card>
      </Collapsible>

      {/* Error */}
      {error && (
        <Alert variant="destructive">
          <WarningCircle size={16} weight="fill" />
          <AlertDescription>
            <p className="font-medium">Failed to generate report</p>
            <p className="text-xs mt-1 opacity-80">{error}</p>
          </AlertDescription>
        </Alert>
      )}

      {/* Results */}
      {result && (
        <>
          {/* Summary cards — clickable ToC */}
          <div className="grid gap-6 sm:grid-cols-3">
            <SummaryCard
              label="Enterprise Metered Bill"
              value={formatDollars(result.enterpriseNetAmount)}
              detail={result.acdPercent > 0
                ? `After ${result.acdPercent}% ACD: ${formatDollars(result.totalDiscountedCharge)}`
                : `Total consumption: ${formatDollars(result.enterpriseGrossAmount)}`}
              icon={CurrencyCircleDollar}
            />
            <SummaryCard
              label="Users with Additional Usage"
              value={`${result.users.filter(u => u.additionalUsageAICs > 0).length} / ${result.users.length}`}
              detail={`${formatAICs(result.totalAdditionalUsage)} AICs above included credits`}
              icon={UsersThree}
              onClick={() => {
                setViewMode('users')
                setCurrentPage(1)
                setTimeout(() => document.getElementById('billing-report-users')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50)
              }}
            />
            <SummaryCard
              label="Cost Centers"
              value={String(result.departments.length)}
              detail={result.excludeCostCenterUsage
                ? 'CC Exclusion ON: independent pools'
                : result.unattributedUsage > 0 ? `${formatDollars(result.unattributedUsage)} unattributed` : 'All usage attributed'}
              icon={Buildings}
              onClick={() => {
                setViewMode('departments')
                setExpandedDepts(new Set(result.departments.map(d => d.costCenterName)))
                setTimeout(() => document.getElementById('billing-report-costcenters')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50)
              }}
            />
          </div>

          {/* View toggle + export */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex gap-1 rounded-lg bg-muted p-1">
                <button
                  onClick={() => setViewMode('departments')}
                  className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                    viewMode === 'departments' ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  By Cost Center
                </button>
                <button
                  onClick={() => { setViewMode('users'); setCurrentPage(1) }}
                  className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                    viewMode === 'users' ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  All Users
                </button>
              </div>
              {viewMode === 'departments' && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs text-muted-foreground"
                  onClick={() => {
                    if (expandedDepts.size === result.departments.length) {
                      setExpandedDepts(new Set())
                    } else {
                      setExpandedDepts(new Set(result.departments.map(d => d.costCenterName)))
                    }
                  }}
                >
                  {expandedDepts.size === result.departments.length ? 'Collapse all' : 'Expand all'}
                </Button>
              )}
            </div>
            <Button variant="outline" size="sm" onClick={handleExportCsv} className="gap-2">
              <DownloadSimple size={16} weight="duotone" />
              Export CSV
            </Button>
          </div>

          {/* Cost Center view */}
          {viewMode === 'departments' && (
            <div id="billing-report-costcenters" className="space-y-3 scroll-mt-20">
              {result.departments.map(dept => (
                <DepartmentCard
                  key={dept.costCenterName}
                  dept={dept}
                  expanded={expandedDepts.has(dept.costCenterName)}
                  onToggle={() => toggleDept(dept.costCenterName)}
                  showAcd={result.acdPercent > 0}
                />
              ))}
            </div>
          )}

          {/* User table view */}
          {viewMode === 'users' && (
            <Card id="billing-report-users" className="scroll-mt-20">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <SortableHeader field="login" label="User" current={sortField} dir={sortDir} onSort={handleSort} />
                      <SortableHeader field="planType" label="License" current={sortField} dir={sortDir} onSort={handleSort} />
                      <SortableHeader field="entitlementAICs" label="Included" current={sortField} dir={sortDir} onSort={handleSort} align="right" />
                      <SortableHeader field="actualUsageAICs" label="Actual Usage" current={sortField} dir={sortDir} onSort={handleSort} align="right" />
                      <SortableHeader field="additionalUsageAICs" label="Additional" current={sortField} dir={sortDir} onSort={handleSort} align="right" />
                      <SortableHeader field="rawChargeDollars" label="Charge" current={sortField} dir={sortDir} onSort={handleSort} align="right" />
                      {result.acdPercent > 0 && (
                        <SortableHeader field="discountedChargeDollars" label="Discounted" current={sortField} dir={sortDir} onSort={handleSort} align="right" />
                      )}
                      <SortableHeader field="costCenter" label="Cost Center" current={sortField} dir={sortDir} onSort={handleSort} />
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedUsers.map(u => (
                      <UserRow key={u.login} user={u} showAcd={result.acdPercent > 0} />
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t bg-muted/30 font-medium">
                      <td className="px-3 py-2" colSpan={2}>Total ({result.users.length} users)</td>
                      <td className="px-3 py-2 text-right">{formatAICs(result.users.reduce((s, u) => s + u.entitlementAICs, 0))}</td>
                      <td className="px-3 py-2 text-right">{formatAICs(result.users.reduce((s, u) => s + u.actualUsageAICs, 0))}</td>
                      <td className="px-3 py-2 text-right">{formatAICs(result.totalAdditionalUsage)}</td>
                      <td className="px-3 py-2 text-right">{formatDollars(result.totalScaledCharge)}</td>
                      {result.acdPercent > 0 && (
                        <td className="px-3 py-2 text-right">{formatDollars(result.totalDiscountedCharge)}</td>
                      )}
                      <td className="px-3 py-2" />
                    </tr>
                  </tfoot>
                </table>
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between px-4 py-3 border-t">
                  <span className="text-xs text-muted-foreground">
                    Page {currentPage} of {totalPages}
                  </span>
                  <div className="flex gap-2">
                    <Button
                      variant="outline" size="sm"
                      disabled={currentPage <= 1}
                      onClick={() => setCurrentPage(p => p - 1)}
                    >
                      Previous
                    </Button>
                    <Button
                      variant="outline" size="sm"
                      disabled={currentPage >= totalPages}
                      onClick={() => setCurrentPage(p => p + 1)}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              )}
            </Card>
          )}

          {/* How it works — reference after results */}
          <HowItWorksSection />
        </>
      )}
    </div>
  )
}

// --- Sub-components ---

function HowItWorksSection() {
  return (
    <div className="rounded-lg border bg-muted/30 px-4 py-3">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Info size={14} weight="duotone" />
        <span>For a full explanation of how billing allocation works, see the <a href="#docs" className="text-primary hover:underline font-medium">Docs tab</a>.</span>
      </div>
    </div>
  )
}

function SummaryCard({ label, value, detail, icon: Icon, onClick }: {
  label: string
  value: string
  detail: string
  icon: React.ComponentType<{ size: number; weight: string; className?: string }>
  onClick?: () => void
}) {
  return (
    <Card
      className={onClick ? 'cursor-pointer hover:border-primary/30 hover:shadow-md transition-all' : ''}
      onClick={onClick}
    >
      <CardHeader className="pb-2">
        <CardDescription className="flex items-center gap-2">
          <Icon size={16} weight="duotone" className="text-muted-foreground" />
          {label}
          {onClick && <CaretRight size={12} className="ml-auto text-muted-foreground/50" />}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-2xl font-bold tabular-nums">{value}</p>
        <p className="text-xs text-muted-foreground mt-1">{detail}</p>
      </CardContent>
    </Card>
  )
}

function DepartmentCard({ dept, expanded, onToggle, showAcd }: {
  dept: DepartmentSummary
  expanded: boolean
  onToggle: () => void
  showAcd: boolean
}) {
  const overUsers = dept.users.filter(u => u.additionalUsageAICs > 0)
  const [deptSortField, setDeptSortField] = useState<SortField>('rawChargeDollars')
  const [deptSortDir, setDeptSortDir] = useState<SortDir>('desc')

  const handleDeptSort = useCallback((field: SortField) => {
    setDeptSortDir(prev => {
      if (deptSortField !== field) return 'desc'
      return prev === 'asc' ? 'desc' : 'asc'
    })
    setDeptSortField(field)
  }, [deptSortField])

  const sortedDeptUsers = useMemo(() => {
    const sorted = [...dept.users]
    sorted.sort((a, b) => {
      const valA = a[deptSortField]
      const valB = b[deptSortField]
      if (valA == null && valB == null) return 0
      if (valA == null) return 1
      if (valB == null) return -1
      if (typeof valA === 'string' && typeof valB === 'string') {
        return deptSortDir === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA)
      }
      return deptSortDir === 'asc' ? (valA as number) - (valB as number) : (valB as number) - (valA as number)
    })
    return sorted
  }, [dept.users, deptSortField, deptSortDir])

  return (
    <Card>
      <button onClick={onToggle} className="w-full text-left px-4 py-3 flex items-center justify-between hover:bg-muted/30 transition-colors rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <div className="flex items-center gap-3 min-w-0">
          <span className="text-base font-semibold truncate max-w-[300px]">
            {dept.costCenterName}
          </span>
          <span className="text-xs text-muted-foreground shrink-0">
            {dept.userCount} users · {overUsers.length} above included credits
          </span>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {showAcd ? (
            <span className="text-right">
              <span className="font-semibold text-lg tabular-nums">{formatDollars(dept.totalDiscountedCharge)}</span>
              <span className="text-xs text-muted-foreground ml-1.5 line-through tabular-nums">{formatDollars(dept.totalCharge)}</span>
            </span>
          ) : (
            <span className="font-semibold text-lg tabular-nums">{formatDollars(dept.totalCharge)}</span>
          )}
          {expanded
            ? <CaretRight size={16} weight="bold" className="text-muted-foreground rotate-90 transition-transform" />
            : <CaretRight size={16} weight="bold" className="text-muted-foreground transition-transform" />
          }
        </div>
      </button>
      {expanded && (
        <div className="border-t overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/30">
                <SortableHeader field="login" label="User" current={deptSortField} dir={deptSortDir} onSort={handleDeptSort} />
                <SortableHeader field="planType" label="License" current={deptSortField} dir={deptSortDir} onSort={handleDeptSort} />
                <SortableHeader field="entitlementAICs" label="Included" current={deptSortField} dir={deptSortDir} onSort={handleDeptSort} align="right" />
                <SortableHeader field="actualUsageAICs" label="Actual" current={deptSortField} dir={deptSortDir} onSort={handleDeptSort} align="right" />
                <SortableHeader field="additionalUsageAICs" label="Additional" current={deptSortField} dir={deptSortDir} onSort={handleDeptSort} align="right" />
                <SortableHeader field="rawChargeDollars" label="Charge" current={deptSortField} dir={deptSortDir} onSort={handleDeptSort} align="right" />
                {showAcd && <SortableHeader field="discountedChargeDollars" label="Discounted" current={deptSortField} dir={deptSortDir} onSort={handleDeptSort} align="right" />}
              </tr>
            </thead>
            <tbody>
              {sortedDeptUsers.map(u => (
                <UserRow key={u.login} user={u} hideCostCenter showAcd={showAcd} />
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t bg-muted/20 font-medium">
                <td className="px-3 py-2" colSpan={2}>Subtotal</td>
                <td className="px-3 py-2 text-right">{formatAICs(dept.users.reduce((s, u) => s + u.entitlementAICs, 0))}</td>
                <td className="px-3 py-2 text-right">{formatAICs(dept.users.reduce((s, u) => s + u.actualUsageAICs, 0))}</td>
                <td className="px-3 py-2 text-right">{formatAICs(dept.users.reduce((s, u) => s + u.additionalUsageAICs, 0))}</td>
                <td className="px-3 py-2 text-right">{formatDollars(dept.totalCharge)}</td>
                {showAcd && <td className="px-3 py-2 text-right">{formatDollars(dept.totalDiscountedCharge)}</td>}
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </Card>
  )
}

function UserRow({ user, hideCostCenter, showAcd }: { user: UserChargebackRow; hideCostCenter?: boolean; showAcd?: boolean }) {
  const isOver = user.additionalUsageAICs > 0
  return (
    <tr className={`border-b last:border-0 ${isOver ? '' : 'text-muted-foreground'}`}>
      <td className="px-3 py-2 font-mono text-xs">{user.login}</td>
      <td className="px-3 py-2">
        <span className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-xs font-medium tracking-wide ${
          user.planType === 'enterprise'
            ? 'border border-purple-400 text-purple-600 dark:border-purple-600 dark:text-purple-400'
            : 'border border-emerald-400 text-emerald-600 dark:border-emerald-600 dark:text-emerald-400'
        }`}>
          {user.planType === 'enterprise' ? 'CE' : 'CB'}
        </span>
      </td>
      <td className="px-3 py-2 text-right tabular-nums">{formatAICs(user.entitlementAICs)}</td>
      <td className="px-3 py-2 text-right tabular-nums">{formatAICs(user.actualUsageAICs)}</td>
      <td className={`px-3 py-2 text-right tabular-nums ${isOver ? 'text-warning font-medium' : ''}`}>
        {isOver ? formatAICs(user.additionalUsageAICs) : '0'}
      </td>
      <td className={`px-3 py-2 text-right tabular-nums ${isOver ? 'font-medium' : ''}`}>
        {isOver ? formatDollars(user.rawChargeDollars) : '$0.00'}
      </td>
      {showAcd && (
        <td className={`px-3 py-2 text-right tabular-nums ${isOver ? 'font-medium text-success' : ''}`}>
          {isOver ? formatDollars(user.discountedChargeDollars) : '$0.00'}
        </td>
      )}
      {!hideCostCenter && (
        <td className="px-3 py-2 text-xs">{user.costCenter ?? <span className="text-muted-foreground italic">Unattributed</span>}</td>
      )}
    </tr>
  )
}

function SortableHeader({ field, label, current, dir, onSort, align }: {
  field: SortField
  label: string
  current: SortField
  dir: SortDir
  onSort: (field: SortField) => void
  align?: 'right'
}) {
  const isActive = current === field
  return (
    <th
      scope="col"
      aria-sort={isActive ? (dir === 'asc' ? 'ascending' : 'descending') : undefined}
      className={`px-3 py-2 font-medium text-muted-foreground cursor-pointer select-none hover:text-foreground transition-colors ${align === 'right' ? 'text-right' : 'text-left'}`}
      onClick={() => onSort(field)}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSort(field) } }}
      tabIndex={0}
    >
      <span className={`inline-flex items-center gap-1 ${align === 'right' ? 'justify-end' : ''}`}>
        {label}
        {isActive ? (
          dir === 'asc' ? <ArrowUp size={12} weight="bold" /> : <ArrowDown size={12} weight="bold" />
        ) : (
          <ArrowsDownUp size={12} className="opacity-30" />
        )}
      </span>
    </th>
  )
}
