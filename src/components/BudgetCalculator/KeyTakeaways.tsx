import { Lightning, User, Warning } from '@phosphor-icons/react'

interface KeyTakeawaysProps {
  reservoirValue: number
  totalUsers: number
  isReservoirSufficient: boolean
  maxSpendBeyondReservoir: number
  powerUsers: number
  specificULBTotal: number
  specificULBBorrowed: number
  universalULB: number
  tier: 'hard' | 'soft' | 'blind' | null
}

export function KeyTakeaways({
  reservoirValue, totalUsers, isReservoirSufficient,
  maxSpendBeyondReservoir, powerUsers, specificULBTotal,
  specificULBBorrowed, universalULB, tier,
}: KeyTakeawaysProps) {
  return (
    <div className="space-y-3">
      <h3 className="font-semibold text-sm">Key Takeaways</h3>
      <ul className="space-y-2 text-sm">
        <li className="flex gap-2 items-start">
          <Lightning size={16} weight="fill" className="text-success mt-0.5 flex-shrink-0" />
          <span>
            <strong>${reservoirValue.toLocaleString()}/mo</strong> in pre-paid AI credits shared across {totalUsers} users.
            {isReservoirSufficient
              ? ' Your pool covers all possible consumption at current ULB settings. No additional charges will occur'
              : ` If everyone hits their limit, ${maxSpendBeyondReservoir.toLocaleString()}/mo in additional charges could occur after the pool runs out`}
          </span>
        </li>
        <li className="flex gap-2 items-start">
          <User size={16} weight="fill" className="text-accent mt-0.5 flex-shrink-0" />
          <span>
            {powerUsers} power user{powerUsers !== 1 ? 's' : ''} allowed up to <strong>${specificULBTotal.toFixed(2)}/mo</strong> each (${specificULBBorrowed.toFixed(2)} above the ${universalULB.toFixed(2)}/mo universal limit).
            {' '}This does not add to your bill. It only controls how much of the shared pool each power user can draw.
          </span>
        </li>
        <li className="flex gap-2 items-start">
          <Warning size={16} weight="fill" className="text-warning mt-0.5 flex-shrink-0" />
          <span>
            Enterprise and cost center budgets only cap charges <strong>after the pool is depleted</strong>.
            {tier === 'hard'
              ? ' Stop usage is enabled: users will be blocked when the budget is reached'
              : tier === 'soft'
                ? ' Stop usage is not enabled: the budget will alert but not block users. Consider enabling it'
                : tier === 'blind'
                  ? ' No enforcement or alerting is active. Usage and charges will continue past the budget limit'
                  : ' Connect to check whether enforcement is active on your enterprise budget'}
          </span>
        </li>
      </ul>
    </div>
  )
}
