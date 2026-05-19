/**
 * Generic drift detection between local edits and API-synced values.
 *
 * The Budget Planner and Tier Planner both need to know which editable fields
 * have been changed locally relative to the server's source of truth. The
 * pattern is the same in every case:
 *
 *   - Only consider the field dirty when the user is connected (or some other
 *     "enabled" condition is met).
 *   - Only consider the field dirty when the API value is known (not `null`).
 *   - The field is dirty when local !== api.
 *
 * This module formalizes that pattern and provides a single place to test it.
 */

export interface DriftEntry<T> {
  /** Stable identifier for the field (used for keying and dirty-key reporting). */
  key: string
  /** Current local value (possibly edited by the user). */
  local: T
  /** API-synced value. `null` means "not known yet" — never dirty. */
  api: T | null
  /**
   * Optional per-field guard. When false, the field is never dirty regardless
   * of values. Useful for fields that depend on a parent record's existence
   * (e.g. the enterprise budget can only be dirty once we know its budget ID).
   * Defaults to true.
   */
  guard?: boolean
  /**
   * Optional comparator. Defaults to strict equality (===). Provide a custom
   * one for cases where strict equality is wrong (e.g. number tolerances,
   * deep array equality).
   */
  equals?: (a: T, b: T) => boolean
}

export interface DriftReport<K extends string> {
  /** Map of field key → isDirty boolean. */
  byKey: Record<K, boolean>
  /** Keys of all dirty fields, in input order. */
  dirtyKeys: K[]
  /** Number of dirty fields. */
  pendingCount: number
  /** Convenience: true if any field is dirty. */
  isDirty: boolean
}

/**
 * Detect drift across a list of field entries.
 *
 * @param enabled  Shared gate — when false, no field is dirty. Typically
 *                 `credentials !== null` or similar.
 * @param fields   List of {@link DriftEntry} records.
 */
export function detectDrift<K extends string>(args: {
  enabled: boolean
  fields: ReadonlyArray<DriftEntry<unknown> & { key: K }>
}): DriftReport<K> {
  const byKey = {} as Record<K, boolean>
  const dirtyKeys: K[] = []

  for (const field of args.fields) {
    const guardOk = field.guard === undefined ? true : field.guard
    // Defensive: TypeScript types say `T | null`, but accept `undefined`
    // too so callers don't need a coalesce when wiring up.
    const apiKnown = field.api !== null && field.api !== undefined
    const equals = field.equals ?? ((a, b) => a === b)
    const isDirty =
      args.enabled &&
      guardOk &&
      apiKnown &&
      !equals(field.local, field.api as unknown)
    byKey[field.key] = isDirty
    if (isDirty) dirtyKeys.push(field.key)
  }

  return {
    byKey,
    dirtyKeys,
    pendingCount: dirtyKeys.length,
    isDirty: dirtyKeys.length > 0,
  }
}
