import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { NumericInput } from '@/components/ui/numeric-input'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'
import {
  Plus,
  Trash,
  CheckCircle,
  Stack,
  Link,
  XCircle,
  SpinnerGap,
  CaretDown,
  CaretUp,
  UsersThree,
} from '@phosphor-icons/react'
import { useState, Fragment } from 'react'
import type { ApiCredentials, SharedCostCenter } from '@/hooks/use-enterprise-credentials'
import type { CostCenter, RowUpdateStatus } from '@/components/BudgetPlanner'
import type { ApiFetchFn } from '@/lib/api'
import BulkAddMembersPanel from '@/components/CostCenterMembersPanel'

interface CostCenterTableProps {
  costCenters: CostCenter[]
  maxCostCenters: number
  credentials: ApiCredentials | null
  ccPageUrl: string | null
  excludeCostCenters: boolean
  applyStatus: Record<string, RowUpdateStatus>
  createdLinks: Record<string, string>
  ccSpend: Record<string, number>
  sharedCostCenters: SharedCostCenter[]
  apiFetch: ApiFetchFn
  onAdd: () => void
  onRemove: (id: string) => void
  onUpdate: (id: string, field: string, value: string | number) => void
  onMembersAdded: (ccId: string, logins: string[]) => void
}

export default function CostCenterTable({
  costCenters,
  maxCostCenters,
  credentials,
  ccPageUrl,
  excludeCostCenters,
  applyStatus,
  createdLinks,
  ccSpend,
  sharedCostCenters,
  apiFetch,
  onAdd,
  onRemove,
  onUpdate,
  onMembersAdded,
}: CostCenterTableProps) {
  const linkedCount = costCenters.filter(cc => cc.ccId).length
  const hasSpendData = Object.keys(ccSpend).length > 0
  const [expandedRowId, setExpandedRowId] = useState<string | null>(null)
  const totalCols = 4 + (hasSpendData ? 1 : 0)

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-base flex-wrap">
              <span className="flex items-center gap-2">
                <Stack size={20} weight="duotone" />
                Cost Centers
              </span>
              <Badge variant="outline" className="text-xs font-normal">{costCenters.length} / {maxCostCenters}</Badge>
              {linkedCount > 0 && (
                ccPageUrl ? (
                  <a
                    href={ccPageUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={e => e.stopPropagation()}
                    className="inline-flex items-center gap-1 text-xs font-normal border border-accent/50 text-accent rounded-full px-2 py-0.5 hover:bg-accent/10 transition-colors whitespace-nowrap"
                  >
                    <Link size={11} weight="duotone" />
                    {linkedCount} linked ↗
                  </a>
                ) : (
                  <Badge variant="outline" className="text-xs font-normal border-accent/50 text-accent gap-1 whitespace-nowrap">
                    <Link size={11} weight="duotone" />
                    {linkedCount} linked
                  </Badge>
                )
              )}
            </CardTitle>
            <CardDescription className="mt-1">
              {credentials
                ? 'Edit budgets below. Changed rows highlight automatically. Push to GitHub via Review & Apply'
                : 'Add each cost center and its budget'}
            </CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={onAdd}
            disabled={costCenters.length >= maxCostCenters}
          >
            <Plus size={14} weight="bold" />
            Add
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="rounded-lg border border-border overflow-hidden">
          <table className="w-full text-xs" aria-label="Cost center budgets">
            <thead>
              <tr className="bg-muted/50 border-b border-border">
                <th scope="col" className="text-center py-2 px-2 font-medium w-[80px]">Status</th>
                <th scope="col" className="text-left py-2 px-3 font-medium">Cost Center</th>
                {hasSpendData && <th scope="col" className="text-right py-2 px-3 font-medium w-[140px]">Spent</th>}
                <th scope="col" className="text-right py-2 px-3 font-medium w-[160px]">Budget ($)</th>
                <th scope="col" className="w-10 py-2 px-2" />
              </tr>
            </thead>
            <tbody>
              {costCenters.length === 0 && (
                <tr>
                  <td colSpan={totalCols} className="py-6 text-center text-xs text-muted-foreground">
                    No cost centers. Click <strong>Add</strong> to create one, or refresh to re-import.
                  </td>
                </tr>
              )}
              {costCenters.map((cc, idx) => {
                const isDirty = cc.budgetId !== undefined && cc.budget !== cc.originalBudget
                const isLinkedNewBudget = !!cc.ccId && credentials !== null && !cc.budgetId && cc.name.trim().length > 0 && cc.budget > 0
                const hasUnsavedChange = isDirty || isLinkedNewBudget
                const isGitHubLinked = !!cc.ccId
                const isUncapped = excludeCostCenters && cc.budget === 0 && cc.name.trim().length > 0
                const rowStatus = applyStatus[cc.id]
                const createdLink = createdLinks[cc.id]
                const isExpanded = expandedRowId === cc.id
                const sharedCC = isGitHubLinked ? sharedCostCenters.find(sc => sc.ccId === cc.ccId) : undefined
                const memberCount = sharedCC?.userCount ?? 0
                return (
                  <Fragment key={cc.id}>
                  <tr
                    className={`border-b border-border-subtle ${isExpanded ? '' : 'last:border-0'} transition-colors ${
                      isUncapped ? 'bg-destructive/5' :
                      hasUnsavedChange ? 'bg-warning/5' :
                      rowStatus === 'success' ? 'bg-success/5' :
                      rowStatus === 'error' ? 'bg-destructive/5' : ''
                    }`}
                  >
                    <td className="py-2 px-2 text-center">
                      {rowStatus === 'success' ? (
                        <Badge variant="outline" className="border-success/50 text-success text-[10px] py-0 px-1.5">Saved</Badge>
                      ) : rowStatus === 'error' ? (
                        <Badge variant="outline" className="border-destructive/50 text-destructive text-[10px] py-0 px-1.5">Failed</Badge>
                      ) : rowStatus === 'pending' ? (
                        <Badge variant="outline" className="border-muted-foreground/50 text-muted-foreground text-[10px] py-0 px-1.5 gap-1">
                          <SpinnerGap size={10} className="animate-spin" />
                          Saving
                        </Badge>
                      ) : hasUnsavedChange ? (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-5 gap-1 px-1.5 text-[10px] hover:text-destructive hover:border-destructive/50"
                          title={`Revert to $${(cc.originalBudget ?? 0).toLocaleString()}`}
                          onClick={() => onUpdate(cc.id, 'budget', cc.originalBudget ?? 0)}
                        >
                          <Trash size={10} weight="duotone" />
                          Discard
                        </Button>
                      ) : isUncapped ? (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Badge variant="outline" className="border-destructive/50 text-destructive text-[10px] py-0 px-1.5 cursor-help">Uncapped</Badge>
                          </TooltipTrigger>
                          <TooltipContent side="right" className="max-w-xs text-xs">
                            <p>No budget while exclusion is enabled. Metered charges are completely uncapped. Click the cost center name to manage on GitHub</p>
                          </TooltipContent>
                        </Tooltip>
                      ) : isGitHubLinked ? (
                        <Badge variant="outline" className="border-success/50 text-success text-[10px] py-0 px-1.5 gap-1">
                          <span className="relative flex h-1.5 w-1.5">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75" />
                            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-success" />
                          </span>
                          Live
                        </Badge>
                      ) : null}
                    </td>
                    <td className="py-2 px-3">
                      {isGitHubLinked ? (
                        <div className="flex flex-col gap-0.5">
                          <div className="flex items-center gap-2">
                            {ccPageUrl ? (
                              <a
                                href={`${ccPageUrl}/${cc.ccId}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                aria-label={`${cc.name} (opens in new tab)`}
                                className="font-medium underline underline-offset-2 decoration-muted-foreground/40 hover:decoration-primary hover:text-primary transition-colors"
                              >
                                {cc.name} ↗
                              </a>
                            ) : (
                              <span className="font-medium">{cc.name}</span>
                            )}
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <button
                                  type="button"
                                  onClick={() => setExpandedRowId(isExpanded ? null : cc.id)}
                                  className="inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                                  aria-label={isExpanded ? 'Collapse bulk assign' : 'Expand bulk assign'}
                                >
                                  <UsersThree size={12} weight="duotone" />
                                  <span>{memberCount}</span>
                                  {isExpanded ? <CaretUp size={10} /> : <CaretDown size={10} />}
                                </button>
                              </TooltipTrigger>
                              <TooltipContent side="bottom" className="text-xs">
                                Click to bulk-assign members via API
                              </TooltipContent>
                            </Tooltip>
                          </div>
                          {createdLink && rowStatus === 'success' && (
                            <a href={createdLink} target="_blank" rel="noopener noreferrer" className="text-[10px] text-success underline font-medium">
                              Add resources on GitHub →
                            </a>
                          )}
                        </div>
                      ) : (
                        <div className="flex flex-col gap-0.5">
                          <Input
                            placeholder={`Cost center ${idx + 1}`}
                            value={cc.name}
                            onChange={e => onUpdate(cc.id, 'name', e.target.value)}
                            onFocus={e => e.target.select()}
                            className="text-xs h-7"
                          />
                          {createdLink && rowStatus === 'success' && (
                            <a href={createdLink} target="_blank" rel="noopener noreferrer" className="text-[10px] text-success underline font-medium">
                              Add resources on GitHub →
                            </a>
                          )}
                        </div>
                      )}
                    </td>
                    {hasSpendData && (() => {
                      const spent = cc.ccId ? ccSpend[cc.ccId] : undefined
                      const overBudget = spent !== undefined && cc.budget > 0 && spent > cc.budget
                      return (
                        <td className={`py-2 px-3 text-right mono ${overBudget ? 'text-destructive font-medium' : 'text-muted-foreground'}`}>
                          {spent !== undefined
                            ? `$${spent.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                            : '—'}
                        </td>
                      )
                    })()}
                    <td className="py-2 px-3 text-right">
                      <NumericInput
                        min={0}
                        value={cc.budget}
                        onValueChange={v => onUpdate(cc.id, 'budget', v)}
                        allowFloat
                        commas
                        className={`text-xs h-7 mono w-28 ${hasUnsavedChange ? 'border-warning' : ''}`}
                      />
                    </td>
                    <td className="py-2 px-2 text-center">
                      {rowStatus === 'success' ? (
                        <CheckCircle size={14} weight="fill" className="text-success" />
                      ) : rowStatus === 'error' ? (
                        <XCircle size={14} weight="fill" className="text-destructive" />
                      ) : rowStatus === 'pending' ? (
                        <SpinnerGap size={14} className="text-muted-foreground animate-spin" />
                      ) : (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-destructive"
                          title={isGitHubLinked ? 'Hide from view (refresh to restore)' : 'Remove'}
                          onClick={() => onRemove(cc.id)}
                          disabled={costCenters.length === 1 && !credentials}
                        >
                          <Trash size={13} weight="duotone" />
                        </Button>
                      )}
                    </td>
                  </tr>
                  {isExpanded && isGitHubLinked && credentials && (
                    <tr key={`${cc.id}-members`} className="border-b border-border-subtle last:border-0">
                      <td colSpan={totalCols} className="p-0">
                        <BulkAddMembersPanel
                          ccId={cc.ccId!}
                          ccName={cc.name}
                          memberCount={memberCount}
                          apiFetch={apiFetch}
                          ent={credentials.ent}
                          onMembersAdded={onMembersAdded}
                        />
                      </td>
                    </tr>
                  )}
                  </Fragment>
                )
              })}
            </tbody>
            <tfoot>
              <tr className="bg-muted/50 border-t-2 border-border">
                <td className="py-2 px-2" />
                <td className="py-2 px-3 font-semibold">Total</td>
                {hasSpendData && (
                  <td className="py-2 px-3 text-right mono font-semibold">
                    ${costCenters.reduce((sum, cc) => sum + (cc.ccId ? (ccSpend[cc.ccId] ?? 0) : 0), 0)
                      .toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                )}
                <td className="py-2 px-3 text-right mono font-semibold">
                  ${costCenters.reduce((sum, cc) => sum + cc.budget, 0).toLocaleString()}{excludeCostCenters ? '+' : ''}
                </td>
                <td className="py-2 px-2" />
              </tr>
            </tfoot>
          </table>
        </div>

        {costCenters.length >= maxCostCenters && (
          <p className="text-xs text-muted-foreground text-center pt-2">
            Maximum of {maxCostCenters} cost centers reached
          </p>
        )}
      </CardContent>
    </Card>
  )
}
