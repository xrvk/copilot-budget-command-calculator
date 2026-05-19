import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Warning,
  Info,
  ArrowRight,
  XCircle,
} from '@phosphor-icons/react'
import type { ApiCredentials } from '@/hooks/use-enterprise-credentials'
import type { CostCenter } from '@/components/BudgetPlanner'

interface ApplyChangesDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
  pendingCount: number
  dirtyRows: CostCenter[]
  newRows: CostCenter[]
  deletedRows: Array<{ id: string; name: string; budgetId?: string; ccId?: string }>
  excludeIsDirty: boolean
  stopUsageIsDirty: boolean
  entBudgetAmountIsDirty: boolean
  excludeCostCenters: boolean
  apiExcludeCostCenters: boolean | null
  preventFurtherUsage: boolean
  apiPreventFurtherUsage: boolean | null
  enterpriseBudget: number
  apiEnterpriseBudget: number | null
  credentials: ApiCredentials | null
  costCenters: CostCenter[]
}

export default function ApplyChangesDialog({
  open,
  onOpenChange,
  onConfirm,
  pendingCount,
  dirtyRows,
  newRows,
  deletedRows,
  excludeIsDirty,
  stopUsageIsDirty,
  entBudgetAmountIsDirty,
  excludeCostCenters,
  apiExcludeCostCenters,
  preventFurtherUsage,
  apiPreventFurtherUsage,
  enterpriseBudget,
  apiEnterpriseBudget,
  credentials,
  costCenters,
}: ApplyChangesDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-lg">
        <AlertDialogHeader>
          <AlertDialogTitle>Review &amp; apply {pendingCount} change{pendingCount > 1 ? 's' : ''} to GitHub</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-4 text-sm">

              {/* Budget updates section */}
              {dirtyRows.length > 0 && (
                <div className="space-y-2">
                  <p className="font-medium text-foreground">Budget updates ({dirtyRows.length})</p>
                  <div className="rounded-md border border-border overflow-hidden">
                    <div className="grid grid-cols-[1fr_auto_auto_auto] gap-2 px-3 py-1.5 bg-muted text-xs font-medium text-muted-foreground">
                      <span>Cost Center</span>
                      <span className="text-right w-16">Before</span>
                      <span className="w-4" />
                      <span className="text-right w-16">After</span>
                    </div>
                    {dirtyRows.map(cc => (
                      <div key={cc.id} className="grid grid-cols-[1fr_auto_auto_auto] gap-2 px-3 py-2 border-t border-border items-center">
                        <span className="truncate font-medium">{cc.name || cc.budgetId}</span>
                        <span className="mono text-right w-16 text-muted-foreground">${(cc.originalBudget ?? 0).toLocaleString()}</span>
                        <ArrowRight size={12} className="text-muted-foreground" />
                        <span className="mono text-right w-16 font-semibold text-success">${cc.budget.toLocaleString()}</span>
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Calls <code className="bg-muted px-1 rounded">PATCH /enterprises/{credentials?.ent}/settings/billing/budgets/&#123;id&#125;</code>
                  </p>
                </div>
              )}

              {/* New cost centers section */}
              {newRows.length > 0 && (
                <div className="space-y-2">
                  <p className="font-medium text-foreground">New cost centers ({newRows.length})</p>
                  <div className="rounded-md border border-border overflow-hidden">
                    <div className="grid grid-cols-[1fr_auto] gap-2 px-3 py-1.5 bg-muted text-xs font-medium text-muted-foreground">
                      <span>Name</span>
                      <span className="text-right w-20">Budget</span>
                    </div>
                    {newRows.map(cc => (
                      <div key={cc.id} className="grid grid-cols-[1fr_auto] gap-2 px-3 py-2 border-t border-border items-center">
                        <span className="truncate font-medium">{cc.name}</span>
                        <span className="mono text-right w-20 font-semibold text-accent">${cc.budget.toLocaleString()}</span>
                      </div>
                    ))}
                  </div>
                  <Alert className="border-accent/40 bg-accent/5 py-2">
                    <Info size={14} weight="fill" className="text-accent" />
                    <AlertDescription className="text-xs">
                      Creates each cost center on GitHub, then sets its budget. After creation, you'll get a link to <strong>add resources</strong> (users, orgs, repos) directly on GitHub.
                    </AlertDescription>
                  </Alert>
                </div>
              )}

              {/* Cost center deletions section */}
              {deletedRows.length > 0 && (
                <div className="space-y-2">
                  <p className="font-medium text-foreground">Cost center deletions ({deletedRows.length})</p>
                  <div className="rounded-md border border-destructive/30 overflow-hidden">
                    <div className="grid grid-cols-[1fr_auto] gap-2 px-3 py-1.5 bg-muted text-xs font-medium text-muted-foreground">
                      <span>Cost Center</span>
                      <span className="text-right w-28">Action</span>
                    </div>
                    {deletedRows.map(row => (
                      <div key={row.id} className="grid grid-cols-[1fr_auto] gap-2 px-3 py-2 border-t border-border items-center">
                        <span className="truncate font-medium line-through text-muted-foreground">{row.name || row.ccId || row.budgetId}</span>
                        <span className="text-right w-28 text-xs text-destructive font-semibold">
                          {row.budgetId && row.ccId ? 'Delete budget + CC' : row.budgetId ? 'Delete budget' : 'Delete cost center'}
                        </span>
                      </div>
                    ))}
                  </div>
                  <Alert className="border-destructive/40 bg-destructive/5 py-2">
                    <Warning size={14} weight="fill" className="text-destructive" />
                    <AlertDescription className="text-xs">
                      Each cost center's budget will be deleted (if present), then the cost center itself will be removed from GitHub.
                      If the cost center delete API isn't supported, only the budget is removed.
                    </AlertDescription>
                  </Alert>
                  <p className="text-xs text-muted-foreground">
                    Calls <code className="bg-muted px-1 rounded">DELETE /enterprises/{credentials?.ent}/settings/billing/budgets/&#123;id&#125;</code> then <code className="bg-muted px-1 rounded">DELETE /…/cost-centers/&#123;id&#125;</code>
                  </p>
                </div>
              )}

              {/* Exclude cost center setting change section */}
              {excludeIsDirty && (
                <div className="space-y-2">
                  <p className="font-medium text-foreground">Exclude cost center usage setting</p>
                  <div className="rounded-md border border-border overflow-hidden">
                    <div className="grid grid-cols-[1fr_auto_auto_auto] gap-2 px-3 py-2 items-center text-sm">
                      <span className="text-muted-foreground">Exclude cost center usage</span>
                      <span className={`font-mono text-xs px-1.5 py-0.5 rounded ${apiExcludeCostCenters ? 'bg-success/20 text-success' : 'bg-muted text-muted-foreground'}`}>
                        {apiExcludeCostCenters ? 'ON' : 'OFF'}
                      </span>
                      <ArrowRight size={12} className="text-muted-foreground" />
                      <span className={`font-mono text-xs px-1.5 py-0.5 rounded font-semibold ${excludeCostCenters ? 'bg-success/20 text-success' : 'bg-muted text-muted-foreground'}`}>
                        {excludeCostCenters ? 'ON' : 'OFF'}
                      </span>
                    </div>
                  </div>
                  {excludeCostCenters ? (
                    <Alert className="border-warning/50 bg-warning/10 py-2">
                      <Warning size={14} weight="fill" className="text-warning" />
                      <AlertDescription className="text-xs">
                        <strong>Additive mode:</strong> Cost centers will charge up to their own limit <em>even after</em> the enterprise budget is exhausted. Total potential spend = enterprise + Σ(cost centers).
                      </AlertDescription>
                    </Alert>
                  ) : (
                    <>
                      <Alert className="border-warning/50 bg-warning/10 py-2">
                        <Warning size={14} weight="fill" className="text-warning" />
                        <AlertDescription className="text-xs">
                          <strong>Shared mode:</strong> Cost center budgets become sub-limits within the enterprise cap. Any CC budget exceeding the enterprise budget will be effectively capped.
                        </AlertDescription>
                      </Alert>
                      {costCenters.some(cc => cc.budget > enterpriseBudget) && (
                        <Alert className="border-destructive/50 bg-destructive/10 py-2">
                          <XCircle size={14} weight="fill" className="text-destructive" />
                          <AlertDescription className="text-xs">
                            <strong>Conflict:</strong> {costCenters.filter(cc => cc.budget > enterpriseBudget).length} cost center(s) exceed the enterprise budget of ${enterpriseBudget.toLocaleString()} and will be immediately capped.
                          </AlertDescription>
                        </Alert>
                      )}
                    </>
                  )}
                </div>
              )}

              {/* Stop usage setting change section */}
              {stopUsageIsDirty && (
                <div className="space-y-2">
                  <p className="font-medium text-foreground">Stop usage when budget limit is reached</p>
                  <div className="rounded-md border border-border overflow-hidden">
                    <div className="grid grid-cols-[1fr_auto_auto_auto] gap-2 px-3 py-2 items-center text-sm">
                      <span className="text-muted-foreground">Prevent further usage</span>
                      <span className={`font-mono text-xs px-1.5 py-0.5 rounded ${apiPreventFurtherUsage ? 'bg-success/20 text-success' : 'bg-muted text-muted-foreground'}`}>
                        {apiPreventFurtherUsage ? 'ON' : 'OFF'}
                      </span>
                      <ArrowRight size={12} className="text-muted-foreground" />
                      <span className={`font-mono text-xs px-1.5 py-0.5 rounded font-semibold ${preventFurtherUsage ? 'bg-success/20 text-success' : 'bg-muted text-muted-foreground'}`}>
                        {preventFurtherUsage ? 'ON' : 'OFF'}
                      </span>
                    </div>
                  </div>
                  {!preventFurtherUsage && (
                    <Alert className="border-warning/50 bg-warning/10 py-2">
                      <Warning size={14} weight="fill" className="text-warning" />
                      <AlertDescription className="text-xs">
                        <strong>Warning:</strong> Disabling this means the budget limit is a notification only. Usage continues and charges accumulate uncapped beyond the limit.
                      </AlertDescription>
                    </Alert>
                  )}
                </div>
              )}

              {/* Enterprise budget amount change section */}
              {entBudgetAmountIsDirty && (
                <div className="space-y-2">
                  <p className="font-medium text-foreground">Enterprise budget</p>
                  <div className="rounded-md border border-border overflow-hidden">
                    <div className="grid grid-cols-[1fr_auto_auto_auto] gap-2 px-3 py-2 items-center text-sm">
                      <span className="text-muted-foreground">Budget amount</span>
                      <span className="font-mono text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                        ${apiEnterpriseBudget!.toLocaleString()}
                      </span>
                      <ArrowRight size={12} className="text-muted-foreground" />
                      <span className="font-mono text-xs px-1.5 py-0.5 rounded bg-success/20 text-success font-semibold">
                        ${enterpriseBudget.toLocaleString()}
                      </span>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Calls <code className="bg-muted px-1 rounded">PATCH /enterprises/{credentials?.ent}/settings/billing/budgets/&#123;id&#125;</code>
                  </p>
                </div>
              )}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>
            Apply {pendingCount} change{pendingCount > 1 ? 's' : ''}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
