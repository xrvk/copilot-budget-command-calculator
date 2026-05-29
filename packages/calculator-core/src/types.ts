// --- Types for budget calculation (shared across BudgetCalculator sub-components) ---

export interface BudgetRecommendations {
  cbAICsPerLicense: number
  ceAICsPerLicense: number
  totalUsers: number
  cbAICs: number
  ceAICs: number
  totalReservoir: number
  reservoirValue: number
  promoBonusValue: number
  avgUsagePerUser: number
  regularUsers: number
  maxRegularConsumption: number
  maxPowerConsumption: number
  maxTotalConsumption: number
  maxSpendBeyondReservoir: number
  recommendedEnterpriseBudget: number
  powerUserShareOfConsumption: number
  recommendedCostCenterBudget: number
  isReservoirSufficient: boolean
  // Mid-cycle adjustment fields
  poolConsumedSoFar: number
  effectiveReservoirValue: number
  isMidCycleAdjusted: boolean
  fullCycleEnterpriseBudget: number
  fullCycleCostCenterBudget: number
  fullCycleSpendBeyondReservoir: number
}

export interface BudgetConstraint {
  isBinding: boolean
  affordableConsumption: number
  maxConsumption: number
  capacityPercent: number
  shortfall: number
  // Optional forecast-aware fields. Populated when constraint detectors
  // are called with a forecast input. Old call sites are unaffected.
  forecast?: number
  isBindingVsForecast?: boolean
  forecastShortfall?: number
  forecastCapacityPercent?: number
}

// --- Forecast types ---

export interface ForecastUser {
  login: string
  totalAICs: number
}

export interface ForecastResult {
  /** Headline forecast in dollars. Always >= billingBaseline (floored). */
  forecastSpend: number
  /** Pre-floor value: sum(min(actual, ULB)) - pool. */
  forecastWithCaps: number
  /** sum(actual) - pool. The floor; matches GitHub billing preview's "actual additional spend". */
  billingBaseline: number
  /** True when forecastWithCaps < billingBaseline (i.e. caps would reduce spend if enforced). */
  isFlooredToBaseline: boolean
  /** Enterprise-scope portion (independently floored when exclusion is ON; else equals forecastSpend). */
  forecastEnterprise: number
  /** Cost-center-scope portion (independently floored when exclusion is ON; else 0). */
  forecastCostCenter: number
  /** Number of users whose consumption is capped by their applicable ULB. */
  cappedUserCount: number
  /** Sum of user.totalAICs * $0.01 (no pool subtracted). */
  totalActualConsumption: number
}


export interface CostCenterConstraintInput {
  ccId: string
  name: string
  budget: number
  members: string[]
}

export interface UserBudgetRecord {
  login: string
  amount: number
}

export interface CCConstraintResult {
  ccId: string
  name: string
  userCount: number
  uniULBCount: number
  indULBCount: number
  maxConsumption: number
  constraint: BudgetConstraint
  isUncapped: boolean
  effectivePerUserCap: number
}

export interface MultiCCConstraintResult {
  costCenters: CCConstraintResult[]
  unassignedUsers: {
    count: number
    uniULBCount: number
    indULBCount: number
    maxConsumption: number
    constraint: BudgetConstraint
    effectivePerUserCap: number
  }
  totalMaxSpend: number
  bindingCount: number
  uncappedCount: number
}

export type ParamState = {
  cbLicenses: number
  ceLicenses: number
  universalULB: number
  powerUsers: number
  powerUserBudget: number
  enterpriseBufferPercent: number
  excludeCostCenterUsage: string | null
  promotionalPricing: string | null
  cbFromUrl: boolean
  ceFromUrl: boolean
  ulbFromUrl: boolean
  pubFromUrl: boolean
  puFromUrl: boolean
  budgetCap: number
  ccBudgetCap: number
  midCycleEnabled: string
  midCyclePoolConsumed: number
}
