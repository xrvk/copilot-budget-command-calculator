// Re-export everything for backward compatibility with existing imports
export { default } from './BudgetCalculator'

// Pure calculation functions (used by tests)
export {
  encodeState,
  decodeState,
  readParams,
  calcBudgetRecommendations,
  calcEnterpriseBudgetConstraint,
  calcCostCenterBudgetConstraint,
  calcMultiCCConstraints,
  calcMaxAffordableULB,
  calcMaxAffordablePowerBudget,
} from './calculations'

// Types (used by tests and other components)
export type {
  BudgetRecommendations,
  BudgetConstraint,
  CostCenterConstraintInput,
  UserBudgetRecord,
  CCConstraintResult,
  MultiCCConstraintResult,
} from './types'
