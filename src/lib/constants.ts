export const SCRIPT_TYPES = ['user-budget', 'team-sync', 'cycle-reset', 'list-budgets'] as const
export type ScriptType = typeof SCRIPT_TYPES[number]
