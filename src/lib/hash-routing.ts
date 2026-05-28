/**
 * Hash-based routing helpers.
 *
 * URL format: /#tab-name          (tab only)
 *             /#tab-name?s=abc    (tab + params, e.g. Tier Planner state)
 *
 * Legacy ?tab= query strings are migrated on first load via migrateQueryToHash().
 */

/** Read the current tab name from the hash. Returns null if empty. */
export function getHashTab(): string | null {
  const raw = window.location.hash.slice(1) // strip leading '#'
  if (!raw) return null
  const qIndex = raw.indexOf('?')
  return qIndex === -1 ? raw : raw.slice(0, qIndex)
}

/** Read params embedded in the hash (everything after `?` inside `#tab?key=val`). */
export function getHashParams(): URLSearchParams {
  const raw = window.location.hash.slice(1)
  const qIndex = raw.indexOf('?')
  return new URLSearchParams(qIndex === -1 ? '' : raw.slice(qIndex + 1))
}

/**
 * Replace the current hash (and clear any query string) via replaceState.
 * @param tab  - The tab identifier (e.g. 'budget-planner')
 * @param params - Optional key/value pairs appended as ?k=v inside the hash
 */
export function setHash(tab: string, params?: Record<string, string>): void {
  let hash = `#${tab}`
  if (params && Object.keys(params).length > 0) {
    const sp = new URLSearchParams(params)
    hash += `?${sp.toString()}`
  }
  window.history.replaceState(null, '', `${window.location.pathname}${hash}`)
}

/**
 * One-time migration: if the URL contains legacy ?tab= query params, convert
 * them to the hash equivalent and strip the query string. Returns the migrated
 * tab name, or null if no migration was needed.
 */
export function migrateQueryToHash(): string | null {
  const params = new URLSearchParams(window.location.search)
  const tab = params.get('tab')
  if (!tab) return null

  // Collect non-tab params to preserve (e.g. ?s=..., ?tool=...)
  const extra: Record<string, string> = {}
  params.forEach((value, key) => {
    if (key !== 'tab') extra[key] = value
  })

  setHash(tab, Object.keys(extra).length > 0 ? extra : undefined)
  return tab
}
