// --- Tier Planner shared context ---
//
// Provides shared state across the 5 wizard steps in the Tier Planner.
// The provider lives inside BudgetCalculator.tsx (not at app root).

import { createContext, useContext } from 'react'
import type { ApiCredentials, EnterpriseBudgetMeta, SharedCostCenter } from '@/hooks/use-enterprise-credentials'
import type { EnterpriseTeam, TeamMember } from '@/hooks/use-enterprise-teams'
import type { BudgetRecommendations, BudgetConstraint, ForecastResult } from './types'
import type { ApiFetchFn } from '@/lib/api'

export interface TierPlannerContextValue {
  // API access
  credentials: ApiCredentials | null
  apiFetch: ApiFetchFn

  // Budget metadata (from enterprise credentials context)
  budgetMeta: EnterpriseBudgetMeta
  setBudgetMeta: (meta: Partial<EnterpriseBudgetMeta>) => void

  // License config & recommendations (read-only from steps)
  recommendations: BudgetRecommendations
  universalULB: number
  powerUsers: number
  powerUserBudget: number
  enterpriseBufferPercent: number
  effectiveExcludeCostCenterUsage: boolean

  // Derived values (from recommendations — read-only from steps)
  totalUsers: number
  regularUsers: number
  reservoirValue: number
  isReservoirSufficient: boolean
  maxSpendBeyondReservoir: number
  recommendedEnterpriseBudget: number
  recommendedCostCenterBudget: number
  maxPowerConsumption: number
  maxTotalConsumption: number
  maxRegularConsumption: number
  powerUserShareOfConsumption: number

  // Live API state (mutable, shared across steps)
  liveEntBudget: number | null
  setLiveEntBudget: (v: number | null) => void
  liveUlb: number | null
  setLiveUlb: (v: number | null) => void
  ulbId: string | null
  setUlbId: (v: string | null) => void
  ulbFetched: boolean
  liveUserBudgets: Array<{ id: string; login: string; amount: number }>
  setLiveUserBudgets: (v: Array<{ id: string; login: string; amount: number }>) => void

  // Power CC
  powerCcId: string | null
  setPowerCcId: (v: string | null) => void
  powerCc: SharedCostCenter | null

  // Shared cost centers
  sharedCostCenters: SharedCostCenter[]
  setSharedCostCenters: (ccs: SharedCostCenter[]) => void
  hasCostCenters: boolean

  // Constraints
  entBudgetConstraint: BudgetConstraint | null
  ccBudgetConstraint: BudgetConstraint | null
  effectiveEntBudgetMin: number

  // Realistic forecast from CSV (null when CSV unavailable).
  // The primaryEnterpriseBudget / primaryCostCenterBudget values are
  // derived from the forecast (with buffer) when available, else fall
  // back to the ceiling recommendation. See docs/internal/architecture.md
  // § "Historical: high-water mark view mode (removed from UI)".
  forecast: ForecastResult | null
  primaryEnterpriseBudget: number
  primaryCostCenterBudget: number

  // Teams integration
  teams: EnterpriseTeam[]
  teamsLoading: boolean
  teamsError: string | null
  fetchTeams: () => Promise<void>
  members: TeamMember[]
  membersLoading: boolean
  membersError: string | null
  selectedTeam: EnterpriseTeam | null
  fetchMembers: (team: EnterpriseTeam) => Promise<void>

  // Shared actions
  fetchAllBudgets: () => Promise<void>
  budgetFetchError: string | null
  resolveOrgMembers: (ccId: string) => Promise<void>
  retryFailedOrgResolution: () => void
  orgResolvingCcIds: Set<string>
  orgResolveFailedCcIds: Set<string>

  // Tier detection
  tier: 'hard' | 'soft' | 'blind' | null

  // Navigation
  onNavigateToTab?: (tab: string) => void
  onNavigateToImport?: () => void

  // Budget Lock (reverse solver — max affordable per-user limits given a fixed cap)
  budgetCapEnabled: boolean
  maxAffordableULB: number | null
  maxAffordablePUB: number | null

  // Steps expand/collapse signal
  stepsExpandedSignal: number
}

export const TierPlannerContext = createContext<TierPlannerContextValue | null>(null)

export function useTierPlanner(): TierPlannerContextValue {
  const ctx = useContext(TierPlannerContext)
  if (!ctx) throw new Error('useTierPlanner must be used within TierPlannerContext.Provider')
  return ctx
}
