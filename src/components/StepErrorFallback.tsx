import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Warning, ArrowsClockwise } from '@phosphor-icons/react'

/**
 * Inline error fallback for individual wizard steps.
 * Lighter than TabErrorFallback: shows an inline alert instead of
 * replacing the entire tab content, so other steps remain usable.
 */
export function StepErrorFallback({ error, resetErrorBoundary }: { error: Error; resetErrorBoundary: () => void }) {
  return (
    <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 space-y-3">
      <Alert variant="destructive" className="border-0 bg-transparent p-0">
        <Warning size={16} weight="fill" />
        <AlertDescription className="text-sm">
          This step encountered an error. Other steps should still work normally.
        </AlertDescription>
      </Alert>

      <pre className="text-xs text-destructive bg-muted/50 p-2 rounded border overflow-auto max-h-20">
        {error.message}
      </pre>

      <Button onClick={resetErrorBoundary} variant="outline" size="sm" className="gap-1.5">
        <ArrowsClockwise size={14} weight="bold" />
        Retry
      </Button>
    </div>
  )
}
