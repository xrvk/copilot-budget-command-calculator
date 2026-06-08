/**
 * @copilot-budget/calculator-core
 *
 * Pure budget math for the Copilot Budget Command Calculator.
 * No DOM, no React, no IO.
 */

export type {
  BudgetRecommendations,
  BudgetConstraint,
  CostCenterConstraintInput,
  UserBudgetRecord,
  CCConstraintResult,
  MultiCCConstraintResult,
  ParamState,
  ForecastUser,
  ForecastResult,
} from './types'

export {
  calcBudgetRecommendations,
  calcEnterpriseBudgetConstraint,
  calcCostCenterBudgetConstraint,
  calcMaxAffordableULB,
  calcMaxAffordablePowerBudget,
  calcMultiCCConstraints,
} from './calculations'

export { calcForecast, type CalcForecastInput } from './forecast'
