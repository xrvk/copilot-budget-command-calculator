import { useState, type ComponentProps } from "react"
import { Input } from "@/components/ui/input"

interface NumericInputProps
  extends Omit<ComponentProps<typeof Input>, "value" | "onChange" | "type"> {
  value: number
  onValueChange: (value: number) => void
  /** Value to restore when user leaves the field empty on blur */
  emptyValue?: number
  min?: number
  max?: number
  allowFloat?: boolean
  /** Display value with thousand-separator commas (uses text input) */
  commas?: boolean
}

function formatWithCommas(n: number, allowFloat: boolean): string {
  if (allowFloat) return n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 10 })
  return n.toLocaleString('en-US')
}

function stripCommas(s: string): string {
  return s.replace(/,/g, '')
}

function NumericInput({
  value,
  onValueChange,
  emptyValue,
  min,
  max,
  allowFloat = false,
  commas = false,
  ...props
}: NumericInputProps) {
  const fmt = (v: number) => commas ? formatWithCommas(v, allowFloat) : String(v)
  const [displayValue, setDisplayValue] = useState(fmt(value))
  const [prevValue, setPrevValue] = useState(value)

  // Sync display when the prop value changes (React-recommended state-during-render pattern)
  if (prevValue !== value) {
    setPrevValue(value)
    const raw = commas ? stripCommas(displayValue) : displayValue
    // Don't overwrite an empty field while the user is clearing it
    if (raw !== "" && raw !== "-") {
      const parsed = allowFloat ? parseFloat(raw) : parseInt(raw, 10)
      if (parsed !== value) {
        setDisplayValue(fmt(value))
      }
    }
  }

  return (
    <Input
      {...props}
      type={commas ? "text" : "number"}
      inputMode={commas ? "decimal" : undefined}
      value={displayValue}
      onFocus={(e) => {
        e.target.select()
      }}
      onChange={(e) => {
        const raw = e.target.value
        setDisplayValue(raw)

        const cleaned = commas ? stripCommas(raw) : raw
        if (cleaned === "" || cleaned === "-") {
          return
        }

        const num = allowFloat ? parseFloat(cleaned) : parseInt(cleaned, 10)
        if (!isNaN(num)) {
          if (min !== undefined && num < min) return
          if (max !== undefined && num > max) return
          onValueChange(num)
        }
      }}
      onBlur={() => {
        const cleaned = commas ? stripCommas(displayValue) : displayValue
        if (cleaned === "" || cleaned === "-") {
          onValueChange(emptyValue ?? min ?? 0)
        }
        setDisplayValue(fmt(value))
      }}
    />
  )
}

export { NumericInput }
