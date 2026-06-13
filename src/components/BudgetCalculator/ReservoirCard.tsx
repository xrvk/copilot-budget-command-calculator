import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Stack, Tag } from '@phosphor-icons/react'
import { FormulaTooltip } from '@/components/FormulaTooltip'

interface ReservoirCardProps {
  cbLicenses: number
  ceLicenses: number
  cbAICsPerLicense: number
  ceAICsPerLicense: number
  cbAICs: number
  ceAICs: number
  totalReservoir: number
  reservoirValue: number
  avgUsagePerUser: number
  totalUsers: number
  promotionalPricing: boolean
  promoBonusValue: number
}

export function ReservoirCard({
  cbLicenses, ceLicenses, cbAICsPerLicense, ceAICsPerLicense,
  cbAICs, ceAICs, totalReservoir, reservoirValue,
  avgUsagePerUser, totalUsers, promotionalPricing, promoBonusValue,
}: ReservoirCardProps) {
  return (
    <Card className="border-2 border-primary">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Stack size={20} weight="duotone" className="text-primary" />
          Enterprise AI Credit Reservoir
        </CardTitle>
        <CardDescription>
          All license AICs pool into one shared enterprise reservoir. Any user can draw from it.
          {promotionalPricing && promoBonusValue > 0 && (
            <span className="ml-1 inline-flex items-center gap-1 text-primary font-medium">
              · <Tag size={11} weight="fill" className="text-primary" /> Promo adds ${promoBonusValue.toLocaleString()} extra vs. standard
            </span>
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-3 gap-4">
          <div className="text-center p-4 rounded-lg bg-primary/10">
            <div className="text-xs text-muted-foreground mb-1">Total AICs</div>
            <div className="text-2xl font-bold mono text-primary">{totalReservoir.toLocaleString()}</div>
            <div className="text-xs text-muted-foreground mt-1">per month</div>
          </div>
          <div className="text-center p-4 rounded-lg bg-success/10">
            <div className="flex items-center justify-center gap-1 text-xs text-muted-foreground mb-1">
              Pool Value
              <FormulaTooltip
                title="Enterprise Pool Value"
                side="bottom"
                steps={[
                  {
                    label: 'CB licenses contribute',
                    formula: `${cbLicenses} × ${cbAICsPerLicense.toLocaleString()} AICs`,
                    value: `${cbAICs.toLocaleString()} AICs`,
                  },
                  {
                    label: 'CE licenses contribute',
                    formula: `${ceLicenses} × ${ceAICsPerLicense.toLocaleString()} AICs`,
                    value: `${ceAICs.toLocaleString()} AICs`,
                  },
                  {
                    label: 'Total pool converted at $0.01/AIC',
                    formula: `${totalReservoir.toLocaleString()} × $0.01`,
                    value: `$${reservoirValue.toLocaleString()}`,
                  },
                ]}
                result={`$${reservoirValue.toLocaleString()}`}
              />
            </div>
            <div className="text-2xl font-bold mono text-success">${reservoirValue.toLocaleString()}<span className="text-sm font-normal text-muted-foreground">/mo</span></div>
            <div className="text-xs text-muted-foreground mt-1">at $0.01/AIC</div>
          </div>
          <div className="text-center p-4 rounded-lg bg-accent/10">
            <div className="flex items-center justify-center gap-1 text-xs text-muted-foreground mb-1">
              Avg per User
              <FormulaTooltip
                title="Average AICs per User"
                side="bottom"
                steps={[
                  {
                    label: 'Total pool AICs',
                    value: `${totalReservoir.toLocaleString()}`,
                  },
                  {
                    label: 'Divided evenly across all users',
                    formula: `${totalReservoir.toLocaleString()} ÷ ${totalUsers} users`,
                    value: `${Math.round(avgUsagePerUser).toLocaleString()} AICs/user`,
                  },
                ]}
                result={`${Math.round(avgUsagePerUser).toLocaleString()} AICs`}
              />
            </div>
            <div className="text-2xl font-bold mono text-accent">{Math.round(avgUsagePerUser).toLocaleString()}</div>
            <div className="text-xs text-muted-foreground mt-1">if evenly split</div>
          </div>
        </div>

        <Separator />

        <div className="space-y-2">
          <div className="flex justify-between p-3 rounded bg-muted">
            <span className="text-sm"><Badge variant="outline" className="mr-2">CB</Badge>{cbLicenses} × {cbAICsPerLicense.toLocaleString()} AICs</span>
            <span className="mono font-semibold">{cbAICs.toLocaleString()}</span>
          </div>
          <div className="flex justify-between p-3 rounded bg-muted">
            <span className="text-sm"><Badge variant="outline" className="mr-2">CE</Badge>{ceLicenses} × {ceAICsPerLicense.toLocaleString()} AICs</span>
            <span className="mono font-semibold">{ceAICs.toLocaleString()}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
