import { Info } from '@phosphor-icons/react'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'
import { Separator } from '@/components/ui/separator'

interface FormulaStep {
  label: string
  formula?: string
  value: string
}

interface FormulaTooltipProps {
  title: string
  steps: FormulaStep[]
  result: string
  /** Side to open the tooltip. Defaults to 'top'. */
  side?: 'top' | 'bottom' | 'left' | 'right'
}

export function FormulaTooltip({ title, steps, result, side = 'top' }: FormulaTooltipProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={`Explain ${title}`}
          className="inline-flex items-center justify-center rounded-full p-0.5 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onClick={e => e.stopPropagation()}
        >
          <Info size={14} weight="fill" />
        </button>
      </TooltipTrigger>
      <TooltipContent side={side} align="start" sideOffset={8} className="w-80 p-4 space-y-3 pointer-events-none">
        <p className="font-semibold text-sm">{title}</p>
        <div className="space-y-2.5">
          {steps.map((step, i) => (
            <div key={i} className="space-y-1">
              <p className="text-xs opacity-80">{step.label}</p>
              {step.formula && (
                <p className="font-mono text-xs bg-primary-foreground/10 rounded px-2 py-1 leading-relaxed">
                  {step.formula}
                </p>
              )}
              <p className="font-semibold text-sm mono">{step.value}</p>
            </div>
          ))}
        </div>
        <Separator className="bg-primary-foreground/20" />
        <div className="flex justify-between items-center">
          <span className="text-xs opacity-80">Result</span>
          <span className="font-bold mono text-sm">{result}</span>
        </div>
      </TooltipContent>
    </Tooltip>
  )
}
