import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// ---------------------------------------------------------------------------
// GitHub web-UI URL builders
//
// Every outbound link in the app (target="_blank" to GitHub) is built by one
// of these helpers. This keeps URLs centralized: when GitHub changes a path,
// only one line needs updating.
//
// How it works:
//   1. The app stores an *API* base URL (e.g. "https://api.github.com" or
//      "https://api.example.ghe.com") because all fetch() calls use it.
//   2. `toUiBase()` converts the API base to the corresponding web-UI base
//      by stripping the "api." prefix. Every URL builder uses it internally.
//   3. All builders accept `apiBase` (from credentials.base) + any path
//      segments needed.
//
// GHE.com support:
//   - github.com:  API = https://api.github.com     → UI = https://github.com
//   - GHE.com:     API = https://api.foo.ghe.com    → UI = https://foo.ghe.com
//   - `parseEnterpriseUrl()` handles the detection and sets the correct API base.
//
// Tests: __tests__/utils.test.ts
// ---------------------------------------------------------------------------

/** Convert an API base URL to the corresponding GitHub web-UI base. */
export function toUiBase(apiBase: string): string {
  return apiBase.replace('https://api.', 'https://')
}

// --- PAT / authentication ---

/** /settings/tokens — PAT management page. Used in ImportPanel for "Create one →" link
 *  and in scope error alerts for "Manage tokens →" link. */
export function settingsTokensUrl(apiBase: string): string {
  return `${toUiBase(apiBase)}/settings/tokens`
}

// --- Enterprise pages ---

/** /enterprises/{ent} — enterprise home. */
export function enterpriseUrl(apiBase: string, ent: string): string {
  return `${toUiBase(apiBase)}/enterprises/${ent}`
}

/** /enterprises/{ent}/licensing — license management page. Used by Tier Planner
 *  to link "Manage licenses on GitHub" when connected. */
export function licensingUrl(apiBase: string, ent: string): string {
  return `${toUiBase(apiBase)}/enterprises/${ent}/licensing`
}

/** /enterprises/{ent}/teams — enterprise teams page. */
export function teamsUrl(apiBase: string, ent: string): string {
  return `${toUiBase(apiBase)}/enterprises/${ent}/teams`
}

/** /enterprises/{ent}/teams/new — enterprise team creation page. */
export function enterpriseTeamsNewUrl(apiBase: string, ent: string): string {
  return `${toUiBase(apiBase)}/enterprises/${ent}/teams/new`
}

/** /enterprises/{ent}/organizations?query=viewer_role:unaffiliated — lists orgs
 *  within the enterprise that the current user is NOT a member of. Used in the
 *  Tier Planner's cost center constraint analysis to help admins understand why
 *  org member resolution may be incomplete (the API can only list members for
 *  orgs where the PAT owner has membership). */
export function unaffiliatedOrgsUrl(apiBase: string, ent: string): string {
  return `${toUiBase(apiBase)}/enterprises/${ent}/organizations?query=${encodeURIComponent('viewer_role:unaffiliated')}`
}

/** /enterprises/{ent}/people/{login} — enterprise member page. */
export function memberUrl(apiBase: string, ent: string, login: string): string {
  return `${toUiBase(apiBase)}/enterprises/${ent}/people/${login}`
}

// --- Billing pages ---

/** /enterprises/{ent}/billing/budgets — budgets list page. */
export function budgetsUrl(apiBase: string, ent: string): string {
  return `${toUiBase(apiBase)}/enterprises/${ent}/billing/budgets`
}

/** /enterprises/{ent}/billing/budgets/{budgetId}/edit — budget edit page.
 *  Used in StepEnterpriseBudget and BudgetPlanner to link "Edit budget alerts on GitHub". */
export function budgetEditUrl(apiBase: string, ent: string, budgetId: string): string {
  return `${toUiBase(apiBase)}/enterprises/${ent}/billing/budgets/${budgetId}/edit`
}

/** /enterprises/{ent}/billing/cost_centers — cost centers list. */
export function costCentersUrl(apiBase: string, ent: string): string {
  return `${toUiBase(apiBase)}/enterprises/${ent}/billing/cost_centers`
}

/** /enterprises/{ent}/billing/cost_centers/{ccId} — single cost center.
 *  Used in StepConstraintAnalysis and BudgetPlanner to link CC names to GitHub. */
export function costCenterUrl(apiBase: string, ent: string, ccId: string): string {
  return `${toUiBase(apiBase)}/enterprises/${ent}/billing/cost_centers/${ccId}`
}

// --- Enterprise URL parser ---

/**
 * Parse a user-entered enterprise URL (or bare slug) into an API base URL and
 * enterprise slug. Handles multiple input formats:
 *
 *   "my-corp"                                    → api.github.com / my-corp
 *   "https://github.com/enterprises/my-corp"     → api.github.com / my-corp
 *   "https://foo.ghe.com/enterprises/bar"        → api.foo.ghe.com / bar
 *   "foo.ghe.com"                                → api.foo.ghe.com / foo (slug from subdomain)
 *
 * Used by ImportPanel and ApiTools to derive the correct API endpoint from
 * whatever the user pastes in.
 */
export function parseEnterpriseUrl(input: string): { base: string; ent: string } {
  const trimmed = input.trim()
  if (!trimmed) return { base: 'https://api.github.com', ent: 'your-enterprise-slug' }

  try {
    if (trimmed.includes('/') || trimmed.includes('.')) {
      const url = trimmed.startsWith('http') ? trimmed : `https://${trimmed}`
      const parsed = new URL(url)
      const pathParts = parsed.pathname.split('/').filter(Boolean)
      const entIdx = pathParts.indexOf('enterprises')
      const slug = entIdx >= 0 && pathParts[entIdx + 1]
        ? pathParts[entIdx + 1]
        : pathParts[0] || 'your-enterprise-slug'

      if (parsed.hostname.endsWith('.ghe.com')) {
        const subdomain = parsed.hostname.replace('.ghe.com', '')
        return { base: `https://api.${subdomain}.ghe.com`, ent: slug }
      }
      return { base: 'https://api.github.com', ent: slug }
    }
    return { base: 'https://api.github.com', ent: trimmed }
  } catch {
    return { base: 'https://api.github.com', ent: trimmed }
  }
}
