import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  At,
  Plus,
  CheckCircle,
  XCircle,
  SpinnerGap,
} from '@phosphor-icons/react'
import { useState, useCallback, useRef, type KeyboardEvent } from 'react'
import { assignCostCenterResources, ApiError } from '@/lib/api'
import type { ApiFetchFn } from '@/lib/api'

interface BulkAddMembersPanelProps {
  ccId: string
  ccName: string
  memberCount: number
  apiFetch: ApiFetchFn
  ent: string
  onMembersAdded: (ccId: string, logins: string[]) => void
}

type AssignStatus = 'idle' | 'loading' | 'success' | 'error'

export default function BulkAddMembersPanel({
  ccId,
  ccName,
  memberCount,
  apiFetch,
  ent,
  onMembersAdded,
}: BulkAddMembersPanelProps) {
  const [inputValue, setInputValue] = useState('')
  const [status, setStatus] = useState<AssignStatus>('idle')
  const [lastResult, setLastResult] = useState<{ count: number; error?: string } | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const parseLogins = useCallback((raw: string) => {
    return [...new Set(
      raw.split(/[,\s]+/)
        .map(s => s.trim().replace(/^@/, ''))
        .filter(Boolean)
    )]
  }, [])

  const handleAssign = useCallback(async () => {
    const logins = parseLogins(inputValue)
    if (logins.length === 0) return

    setStatus('loading')
    try {
      await assignCostCenterResources(apiFetch, ent, ccId, logins)
      setStatus('success')
      setLastResult({ count: logins.length })
      setInputValue('')
      onMembersAdded(ccId, logins)
      inputRef.current?.focus()
    } catch (err) {
      setStatus('error')
      setLastResult({ count: logins.length, error: err instanceof ApiError ? err.message : 'Request failed' })
    }
  }, [inputValue, parseLogins, apiFetch, ent, ccId, onMembersAdded])

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault()
        handleAssign()
      }
    },
    [handleAssign],
  )

  const loginCount = parseLogins(inputValue).length

  return (
    <div className="bg-muted/30 px-6 py-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
          Bulk assign members to {ccName}
        </span>
        <span className="text-[10px] text-muted-foreground">
          {memberCount} current member{memberCount !== 1 ? 's' : ''}
        </span>
      </div>

      <div className="flex items-center gap-2">
        <div className="relative flex-1 max-w-md">
          <At
            size={14}
            weight="duotone"
            className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            ref={inputRef}
            value={inputValue}
            onChange={e => { setInputValue(e.target.value); if (status !== 'idle') setStatus('idle') }}
            onKeyDown={handleKeyDown}
            placeholder="Paste GitHub logins (comma-separated)"
            className="text-xs h-7 pl-7"
            disabled={status === 'loading'}
          />
        </div>
        <Button
          variant="outline"
          size="sm"
          className="h-7 gap-1 px-2 text-xs"
          onClick={handleAssign}
          disabled={loginCount === 0 || status === 'loading'}
        >
          {status === 'loading' ? (
            <SpinnerGap size={12} className="animate-spin" />
          ) : (
            <Plus size={12} weight="bold" />
          )}
          Assign{loginCount > 0 ? ` (${loginCount})` : ''}
        </Button>
      </div>

      {/* Result feedback */}
      {lastResult && status === 'success' && (
        <div className="flex items-center gap-1.5 mt-2 text-[11px] text-success">
          <CheckCircle size={12} weight="fill" />
          Added {lastResult.count} member{lastResult.count !== 1 ? 's' : ''} to {ccName}
        </div>
      )}
      {lastResult && status === 'error' && (
        <div className="flex items-center gap-1.5 mt-2 text-[11px] text-destructive">
          <XCircle size={12} weight="fill" />
          Failed to assign: {lastResult.error}
        </div>
      )}

      <p className="text-[10px] text-muted-foreground mt-2">
        Calls <Badge variant="outline" className="text-[9px] py-0 px-1 font-mono">POST /cost-centers/{'{id}'}/resource</Badge> immediately. No undo.
      </p>
    </div>
  )
}
