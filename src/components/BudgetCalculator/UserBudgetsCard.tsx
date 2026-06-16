import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Separator } from '@/components/ui/separator'
import { Lightning, User, Info, Code } from '@phosphor-icons/react'

interface UserBudgetsCardProps {
  universalULB: number
  powerUsers: number
  powerUserBudget: number
  specificULBBorrowed: number
}

export function UserBudgetsCard({
  universalULB, powerUsers, powerUserBudget, specificULBBorrowed,
}: UserBudgetsCardProps) {
  const specificULBTotal = powerUserBudget
  return (
    <Card className="border-2 border-accent">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <User size={24} weight="duotone" className="text-accent" />
          User-Level Budgets
        </CardTitle>
        <CardDescription>
          How much each user can consume each month before their access is paused
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="p-5 rounded-lg bg-accent/10 border border-accent space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Universal user-level budget (ULB)</span>
            <Badge className="bg-accent text-accent-foreground">All Users</Badge>
          </div>
          <div className="text-4xl font-bold mono text-accent">${universalULB.toFixed(2)}<span className="text-xl font-normal text-muted-foreground">/mo</span></div>
          <p className="text-xs text-muted-foreground">
            Each user stops at {universalULB * 100} AICs ({universalULB.toFixed(2)} × 100)
          </p>
        </div>

        <Separator />

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold">Individual User-Level Budget (Power Users)</span>
            <Lightning size={18} weight="fill" className="text-warning" />
          </div>
          
          <div className="p-4 rounded-lg bg-muted space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-sm">Power Users</span>
              <span className="mono font-bold text-lg">{powerUsers}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm">Budget per Power User</span>
              <span className="mono font-bold text-accent text-lg">${specificULBTotal.toFixed(2)}/mo</span>
            </div>
            <Separator />
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Universal ULB</span>
              <span className="mono text-sm">${universalULB.toFixed(2)}/mo</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Additional from Pool</span>
              <span className="mono text-sm text-accent">+${specificULBBorrowed.toFixed(2)}/mo</span>
            </div>
          </div>

          <Alert className="bg-warning/10 border-warning">
            <Info size={18} weight="fill" className="text-warning" />
            <AlertDescription className="text-xs">
              Each power user can consume ${specificULBTotal.toFixed(2)}/mo total from the shared pool before being throttled. 
              Without a ULB set, a single user could consume the entire pool.
            </AlertDescription>
          </Alert>

          <Alert className="bg-accent/10 border-accent">
            <Code size={18} weight="fill" className="text-accent" />
            <AlertDescription className="text-xs">
              <strong>Set these via API:</strong> Generate bulk scripts on the API Tools tab. Paste usernames and go.
            </AlertDescription>
          </Alert>
        </div>
      </CardContent>
    </Card>
  )
}
