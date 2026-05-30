import { useId, useEffect, useRef, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'

import {
  CloudArrowDown,
  CaretDown,
  CaretUp,
  CheckCircle,
  Info,
  Lock,
  Warning,
  XCircle,
  ArrowsClockwise,
} from '@phosphor-icons/react'
import { useEnterpriseCredentials, type ConnectResult } from '@/hooks/use-enterprise-credentials'
import { fetchCostCenters, fetchBudgets } from '@/lib/api'
import { settingsTokensUrl, enterpriseUrl as buildEnterpriseUrl } from '@/lib/utils'


interface ImportPanelProps {
  onConnected?: (result: ConnectResult) => void
  onDisconnected?: () => void
  linkedCount?: number
  highlight?: boolean
  autoConnect?: boolean
  onAutoConnectDone?: () => void
  embedded?: boolean
  open?: boolean
  onOpenChange?: (open: boolean) => void
  showCaret?: boolean
}

export default function ImportPanel({
  onConnected,
  onDisconnected,
  linkedCount = 0,
  highlight = false,
  autoConnect = false,
  onAutoConnectDone,
  embedded = false,
  open: openProp,
  onOpenChange,
  showCaret = true,
}: ImportPanelProps) {
  const formId = useId()
  const [internalOpen, setInternalOpen] = useState(false)
  const open = openProp ?? internalOpen
  const setOpen = (next: boolean) => {
    if (onOpenChange) {
      onOpenChange(next)
    } else {
      setInternalOpen(next)
    }
  }
  const [refreshState, setRefreshState] = useState<'idle' | 'loading' | 'success'>('idle')
  const [highlighted, setHighlighted] = useState(false)
  const [scopeWarning, setScopeWarning] = useState<string | null>(null)
  const cardRef = useRef<HTMLDivElement>(null)
  const ctx = useEnterpriseCredentials()
  const {
    enterpriseUrl, setEnterpriseUrl,
    pat, setPat,
    parsed, credentials, importState,
    isDemo, connectDemo, demoDismissed,
    connect, disconnect, apiFetch,
  } = ctx

  // Always start in demo mode — user can switch to live via banner X or "Connect your enterprise"
  // Note: we intentionally do NOT call onConnected here. connectDemo() sets all
  // shared state (credentials, budgetMeta, sharedCostCenters) in the provider,
  // and BudgetPlanner's state-during-render sync handles local state with its
  // urlStateConsumed guard — calling onConnected would bypass that guard and
  // overwrite URL-loaded state with demo data on page refresh.
  const autoImportedRef = useRef(false)
  useEffect(() => {
    if (autoImportedRef.current || credentials || demoDismissed) return
    autoImportedRef.current = true
    connectDemo()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Probe read:org scope — GET /user/orgs returns 403 without it
  const probeOrgScope = async (creds: NonNullable<ConnectResult['credentials']>) => {
    try {
      const res = await fetch(`${creds.base}/user/orgs?per_page=1`, {
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${creds.token}`,
          'X-GitHub-Api-Version': '2026-03-10',
        },
      })
      if (res.status === 403) {
        setScopeWarning('read:org')
      }
    } catch { /* network error — don't warn */ }
  }

  // Auto-connect when triggered externally (e.g. demo banner dismiss with dev credentials)
  const [prevAutoConnect, setPrevAutoConnect] = useState(false)
  if (autoConnect && !prevAutoConnect) {
    setPrevAutoConnect(true)
  } else if (!autoConnect && prevAutoConnect) {
    setPrevAutoConnect(false)
  }
  useEffect(() => {
    if (!autoConnect) return
    onAutoConnectDone?.()
    const wasDemo = isDemo
    connect().then(result => {
      if (result.ok) {
        if (wasDemo) onDisconnected?.()
        onConnected?.(result)
        if (result.credentials) probeOrgScope(result.credentials)
      }
    })
  }, [autoConnect]) // eslint-disable-line react-hooks/exhaustive-deps

  // External highlight trigger (e.g. from App.tsx "Exit demo" banner)
  const [prevHighlight, setPrevHighlight] = useState(false)
  if (highlight && !prevHighlight) {
    setPrevHighlight(true)
    setOpen(true)
    setHighlighted(true)
  } else if (!highlight && prevHighlight) {
    setPrevHighlight(false)
  }

  // Auto-clear highlight after 3 seconds
  useEffect(() => {
    if (!highlighted) return
    const timer = setTimeout(() => setHighlighted(false), 3000)
    return () => clearTimeout(timer)
  }, [highlighted])

  // Scroll into view when highlighted
  useEffect(() => {
    if (highlighted && cardRef.current) {
      cardRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }, [highlighted])

  const tokensUrl = settingsTokensUrl(parsed.base)

  const handleImport = async () => {
    setScopeWarning(null)
    const wasDemo = isDemo
    const result = await connect()
    if (result.ok) {
      if (wasDemo) onDisconnected?.()
      onConnected?.(result)
      if (result.credentials) probeOrgScope(result.credentials)
    }
  }

  const handleDisconnect = () => {
    // Only called from live mode (demo has no disconnect button)
    disconnect()
    onDisconnected?.()
    const result = connectDemo()
    if (result.ok) onConnected?.(result)
  }

  const handleRefresh = async () => {
    if (!credentials) return
    setRefreshState('loading')
    try {
      const [allCCs, allBudgets] = await Promise.all([
        fetchCostCenters(apiFetch, credentials.ent),
        fetchBudgets(apiFetch, credentials.ent),
      ])

      onConnected?.({ ok: true, credentials, budgets: allBudgets, costCenters: allCCs })
      setRefreshState('success')
      setTimeout(() => setRefreshState('idle'), 1500)
    } catch (err) {
      console.error('Failed to refresh:', err)
      setRefreshState('idle')
    }
  }

  const cardClass = embedded
    ? `border-0 shadow-none rounded-none bg-transparent ${highlighted ? 'ring-2 ring-accent/60' : ''}`
    : `transition-all duration-500 ${credentials && !isDemo ? '' : 'border-2 border-primary/40 shadow-lg shadow-primary/20'} ${highlighted ? 'ring-2 ring-accent shadow-lg shadow-accent/20' : ''}`

  return (
    <Card ref={cardRef} className={cardClass}>
      {credentials && !isDemo ? (
        /* ── Live: compact strip with refresh + disconnect ── */
        <CardContent className="py-3 px-4">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-2 min-w-0">
              <CheckCircle size={18} weight="fill" className="text-success flex-shrink-0" />
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-sm">Connected to {credentials.ent}</span>
                  <Badge className="text-xs bg-success/20 text-success border-success/40">{linkedCount} linked</Badge>
                </div>
                <p className="text-xs text-muted-foreground truncate">
                  {buildEnterpriseUrl(credentials.base, credentials.ent)}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <Button
                variant="outline"
                size="sm"
                className={`gap-1.5 h-7 text-xs transition-all ${
                  refreshState === 'success'
                    ? 'border-success/50 text-success hover:bg-success/5'
                    : 'border-primary/30 text-primary hover:bg-primary/5 hover:border-primary/50'
                }`}
                onClick={handleRefresh}
                disabled={refreshState === 'loading'}
              >
                {refreshState === 'success' ? (
                  <CheckCircle size={14} weight="fill" className="text-success" />
                ) : (
                  <ArrowsClockwise
                    size={14}
                    weight="duotone"
                    className={`transition-transform ${refreshState === 'loading' ? 'animate-spin' : ''}`}
                  />
                )}
                {refreshState === 'loading' ? 'Refreshing…' : refreshState === 'success' ? 'Updated' : 'Refresh'}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="gap-1.5 h-7 text-xs text-muted-foreground hover:text-destructive transition-colors"
                onClick={handleDisconnect}
              >
                <XCircle size={13} weight="duotone" />
                Disconnect
              </Button>
            </div>
          </div>
          {scopeWarning && (
            <Alert className="border-primary/30 bg-primary/5 py-2 mt-2">
              <Info size={14} weight="fill" className="text-primary" />
              <AlertDescription className="text-xs">
                Token is missing the <code className="bg-muted px-1 rounded">{scopeWarning}</code> scope. Cost center constraint analysis will not be able to resolve organization members.{' '}
                <a
                  href={settingsTokensUrl(credentials.base)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline font-medium text-primary"
                >
                  Manage tokens →
                </a>
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      ) : (
        /* ── Demo or disconnected: standard card with collapsible form ── */
        <>
          <CardHeader
            className={`cursor-pointer select-none ${embedded ? 'pt-3 pb-2 px-4' : ''}`}
            onClick={() => setOpen(!open)}
          >
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-base">
                <CloudArrowDown size={20} weight="duotone" className="text-primary" />
                Import from GitHub
              </CardTitle>
              {showCaret && (
                open
                  ? <CaretUp size={16} className="text-muted-foreground" />
                  : <CaretDown size={16} className="text-muted-foreground" />
              )}
            </div>
            <CardDescription>
              Connect to GitHub APIs to sync live budget settings and cost centers, then apply changes back to your enterprise
            </CardDescription>
          </CardHeader>

          {open && (
            <CardContent className={`space-y-4 pt-0 ${embedded ? 'px-4 pb-4' : ''}`}>
              <Alert className="border-warning/60 bg-warning/10">
                <Warning size={18} weight="fill" className="text-warning" />
                <AlertDescription className="text-sm space-y-2">
                  <p className="font-semibold text-warning">Before entering your token:</p>
                  <ul className="space-y-1 text-xs text-foreground/80 list-disc list-inside">
                    <li>
                      Requires a classic PAT with these scopes:{' '}
                      <code className="bg-muted px-1 rounded text-[11px]">manage_billing:enterprise</code>,{' '}
                      <code className="bg-muted px-1 rounded text-[11px]">read:org</code>
                    </li>
                    <li>
                      Your token is sent <strong>directly and only</strong> to{' '}
                      <code className="bg-muted px-1 rounded text-xs">
                        {parsed.base || 'api.github.com'}
                      </code>
                      {' '}and never touches any server we control
                    </li>
                    <li>The token is <strong>not persisted</strong>. It lives only in this browser tab and is lost on refresh.</li>
                    <li>
                      <strong>Recommended:</strong> create a dedicated PAT and revoke it at{' '}
                      <a href={tokensUrl} target="_blank" rel="noopener noreferrer" className="underline">
                        {tokensUrl.replace('https://', '')}
                      </a>{' '}
                      once done
                    </li>
                  </ul>
                </AlertDescription>
              </Alert>

              <div className="grid sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor={`${formId}-url`}>Enterprise URL or Slug</Label>
                  <Input
                    id={`${formId}-url`}
                    placeholder="https://github.com/enterprises/my-corp"
                    value={enterpriseUrl}
                    onChange={e => setEnterpriseUrl(e.target.value)}
                    className="mono text-sm"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor={`${formId}-pat`} className="flex items-center gap-1.5">
                    <Lock size={13} weight="fill" />
                    Classic PAT
                    <span className="text-muted-foreground font-normal">·</span>
                    <a href={`${tokensUrl}/new`} target="_blank" rel="noopener noreferrer" className="text-xs font-normal text-primary underline underline-offset-2">
                      Create one →
                    </a>
                  </Label>
                  <Input
                    id={`${formId}-pat`}
                    type="password"
                    placeholder="ghp_••••••••••••••••••••••"
                    value={pat}
                    onChange={e => setPat(e.target.value)}
                    className={`mono text-sm ${pat.trim() && !/^(ghp_[a-zA-Z0-9]{36,}|github_pat_[a-zA-Z0-9]{22}_[a-zA-Z0-9]{59})$/.test(pat.trim()) ? 'border-destructive' : ''}`}
                    autoComplete="off"
                  />
                  {pat.trim() && !/^(ghp_[a-zA-Z0-9]{36,}|github_pat_[a-zA-Z0-9]{22}_[a-zA-Z0-9]{59})$/.test(pat.trim()) ? (
                    <p className="text-xs text-destructive">
                      Token should start with <code className="bg-muted px-1 rounded">ghp_</code> (classic) or <code className="bg-muted px-1 rounded">github_pat_</code> (fine-grained). A classic PAT with <code className="bg-muted px-1 rounded">manage_billing:enterprise</code> scope is required.
                    </p>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      Requires enterprise admin, org admin, or billing manager role.
                    </p>
                  )}
                </div>
              </div>

              {importState.error && (
                <Alert variant="destructive">
                  <Warning size={16} weight="fill" />
                  <AlertDescription className="text-sm">
                    {importState.error}
                    {(importState.error.includes('missing required scope') || importState.error.includes('Insufficient token scopes')) && (
                      <>
                        {' '}
                        <a
                          href={tokensUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="underline font-medium"
                        >
                          Manage tokens →
                        </a>
                      </>
                    )}
                  </AlertDescription>
                </Alert>
              )}

              <Button onClick={handleImport} disabled={importState.loading} className="gap-2">
                <CloudArrowDown size={16} weight="duotone" />
                {importState.loading ? 'Importing…' : 'Import budgets'}
              </Button>
            </CardContent>
          )}
        </>
      )}
    </Card>
  )
}
