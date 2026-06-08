import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Warning, ArrowsClockwise } from '@phosphor-icons/react'

/**
 * Per-tab error boundary fallback. Isolates crashes so one tab
 * failing doesn't bring down the whole app.
 */
export function TabErrorFallback({ error, resetErrorBoundary }: { error: Error; resetErrorBoundary: () => void }) {
  return (
    <div className="py-12 flex justify-center">
      <div className="w-full max-w-lg space-y-4">
        <Alert variant="destructive">
          <Warning size={18} weight="fill" />
          <AlertTitle>Something went wrong</AlertTitle>
          <AlertDescription>
            This tab encountered an error. Other tabs should still work normally.
          </AlertDescription>
        </Alert>

        <div className="bg-card border rounded-lg p-4">
          <h3 className="font-semibold text-sm text-muted-foreground mb-2">Error details</h3>
          <pre className="text-xs text-destructive bg-muted/50 p-3 rounded border overflow-auto max-h-32">
            {error.message}
          </pre>
        </div>

        <Button onClick={resetErrorBoundary} variant="outline" className="w-full gap-2">
          <ArrowsClockwise size={16} weight="bold" />
          Retry
        </Button>
      </div>
    </div>
  )
}
