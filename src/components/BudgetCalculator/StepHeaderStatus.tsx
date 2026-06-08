import { CheckCircle, Warning } from '@phosphor-icons/react'
import { cn } from '@/lib/utils'

type HeaderStatusTone = 'clear' | 'review'

interface StepHeaderStatusProps {
  tone: HeaderStatusTone
  label?: string
  className?: string
}

export function StepHeaderStatus({ tone, label, className }: StepHeaderStatusProps) {
  const resolvedLabel = label ?? (tone === 'clear' ? 'Clear' : 'Needs review')

  return (
    <span
      className={cn(
        'inline-flex h-5 items-center gap-1 rounded-md border px-1.5 text-xs font-medium leading-none shrink-0',
        tone === 'clear'
          ? 'border-success/40 bg-success/10 text-success'
          : 'border-warning/50 bg-warning/10 text-warning',
        className
      )}
    >
      {tone === 'clear' ? (
        <CheckCircle size={14} weight="fill" aria-hidden="true" />
      ) : (
        <Warning size={14} weight="fill" aria-hidden="true" />
      )}
      <span>{resolvedLabel}</span>
    </span>
  )
}
