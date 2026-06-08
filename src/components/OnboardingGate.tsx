import { useEnterpriseCredentials } from '@/hooks/use-enterprise-credentials'
import ImportPanel from '@/components/ImportPanel'
import { CsvUploadCard } from '@/components/ConsumptionAnalysisPanel'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { CheckCircle, Info } from '@phosphor-icons/react'

/**
 * Shown when the user has dismissed demo mode but hasn't yet provided both
 * required inputs (live API connection + billing CSV). Replaces the tabbed
 * app shell entirely until both are present.
 *
 * Rationale: data-driven recommendations require accurate seat counts (only
 * available via the API) AND real per-user consumption (only in the CSV).
 * Partial-data states produce misleading numbers, so we block them outright.
 * See docs/internal/full-admin-flow.md and docs/internal/architecture.md.
 */
export function OnboardingGate() {
  const {
    dataReadiness,
    connectDemo,
    csvUsageData,
    setCsvUsageData,
  } = useEnterpriseCredentials()

  const { hasApi, hasCsv } = dataReadiness

  return (
    <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-6xl space-y-8">
        <div className="text-center space-y-4">
          <h1 className="text-3xl font-bold tracking-tight">Set up your enterprise data</h1>
          <p className="text-muted-foreground max-w-2xl mx-auto">
            Accurate recommendations need both your live enterprise settings and a recent billing CSV. Complete both steps to unlock the app.
          </p>
          <div className="inline-flex items-center gap-2 text-xs text-muted-foreground bg-muted/40 border rounded-full px-3 py-1.5">
            <Info size={14} weight="duotone" className="text-primary shrink-0" />
            <span>
              Just exploring?{' '}
              <button onClick={() => connectDemo()} className="text-primary underline underline-offset-2 hover:opacity-80">
                Go back to demo mode
              </button>
            </span>
          </div>
        </div>

        <div className="grid md:grid-cols-4 gap-6 items-stretch">
          <Card className={`md:col-span-3 border-2 transition-colors flex flex-col ${hasApi ? 'border-success/40 bg-success/5' : 'border-primary/30'}`}>
            <CardHeader className="gap-1 pb-2">
              <CardTitle className="flex items-center gap-2.5 text-base">
                <StepBadge n={1} done={hasApi} />
                <span className="flex-1">Connect to your enterprise</span>
                {hasApi && <CheckCircle size={18} weight="fill" className="text-success" />}
              </CardTitle>
            </CardHeader>
            <CardContent className="flex-1 px-2 pb-2 pt-0">
              {hasApi ? (
                <div className="flex items-center gap-2 text-sm text-success px-4 pb-4">
                  <CheckCircle size={16} weight="fill" />
                  Connected
                </div>
              ) : (
                <ImportPanel embedded open showCaret={false} />
              )}
            </CardContent>
          </Card>

          <Card className={`border-2 transition-colors flex flex-col ${hasCsv ? 'border-success/40 bg-success/5' : 'border-primary/30'}`}>
            <CardHeader className="gap-1 pb-2">
              <CardTitle className="flex items-center gap-2.5 text-base">
                <StepBadge n={2} done={hasCsv} />
                <span className="flex-1">Upload your billing CSV</span>
                {hasCsv && <CheckCircle size={18} weight="fill" className="text-success" />}
              </CardTitle>
            </CardHeader>
            <CardContent className="flex-1 px-2 pb-2 pt-0 flex flex-col">
              <CsvUploadCard
                embedded
                fillHeight
                onCsvParsed={setCsvUsageData}
                csvData={csvUsageData}
                onClear={() => setCsvUsageData(null)}
              />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}

function StepBadge({ n, done }: { n: number; done: boolean }) {
  return (
    <Badge
      variant={done ? 'default' : 'secondary'}
      className={`h-5 w-5 p-0 flex items-center justify-center text-[10px] font-semibold ${done ? 'bg-success text-success-foreground' : ''}`}
    >
      {n}
    </Badge>
  )
}
