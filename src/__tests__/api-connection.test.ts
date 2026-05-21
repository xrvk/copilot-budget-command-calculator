/**
 * Integration tests against all credential pairs defined in .env.local.
 * Pair 1: VITE_DEV_ENTERPRISE_URL  / VITE_DEV_PAT
 * Pair 2: VITE_DEV_ENTERPRISE_URL_2 / VITE_DEV_PAT_2
 *
 * Run with:  npm test
 * Watch:     npm run test:watch   (re-runs on every file change)
 *
 * Each pair runs its own describe block and skips automatically when not configured.
 */
import { describe, it, expect } from 'vitest'
import { parseEnterpriseUrl } from '../lib/utils'
import { isCopilotBudget } from '../lib/api'

interface CredentialPair {
  label: string
  url: string
  pat: string
}

const pairs: CredentialPair[] = [
  {
    label: import.meta.env.VITE_DEV_ENTERPRISE_URL
      ? `pair 1 — ${parseEnterpriseUrl(import.meta.env.VITE_DEV_ENTERPRISE_URL).ent}`
      : 'pair 1 — not configured',
    url: import.meta.env.VITE_DEV_ENTERPRISE_URL ?? '',
    pat: import.meta.env.VITE_DEV_PAT ?? '',
  },
  {
    label: import.meta.env.VITE_DEV_ENTERPRISE_URL_2
      ? `pair 2 — ${parseEnterpriseUrl(import.meta.env.VITE_DEV_ENTERPRISE_URL_2).ent}`
      : 'pair 2 — not configured',
    url: import.meta.env.VITE_DEV_ENTERPRISE_URL_2 ?? '',
    pat: import.meta.env.VITE_DEV_PAT_2 ?? '',
  },
].filter(p => p.url.length > 0 && p.pat.length > 0)

if (pairs.length === 0) {
  describe('API connection', () => {
    it('skipped — no credentials configured in .env.local', () => {
      console.warn(
        '\n⚠ No credential pairs found. Add to .env.local:\n' +
        '    VITE_DEV_ENTERPRISE_URL=https://github.com/enterprises/your-slug\n' +
        '    VITE_DEV_PAT=ghp_...\n'
      )
    })
  })
}

for (const { label, url, pat } of pairs) {
  describe(`API connection — ${label}`, () => {
    const headers = {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${pat}`,
      'X-GitHub-Api-Version': '2026-03-10',
    }
    const { base, ent } = parseEnterpriseUrl(url)

    it('parseEnterpriseUrl extracts base and slug', () => {
      expect(base).toMatch(/^https:\/\//)
      expect(ent).not.toBe('your-enterprise-slug')
      expect(ent.length).toBeGreaterThan(0)
    })

    it('connects to GitHub and fetches enterprise budgets', async () => {
      const res = await fetch(
        `${base}/enterprises/${ent}/settings/billing/budgets?per_page=100`,
        { headers }
      )
      expect(res.ok).toBe(true)
      const data = await res.json()
      expect(data).toHaveProperty('budgets')
      expect(Array.isArray(data.budgets)).toBe(true)
    })

    it('finds a Copilot enterprise budget with prevent_further_usage', async () => {
      // Paginate — GHES may cap per_page and spread budgets across pages
      const budgets: Array<{
        id: string
        budget_scope: string
        budget_type: string
        budget_product_sku: string
        prevent_further_usage?: boolean
        exclude_cost_center_usage?: boolean
      }> = []
      let page = 1
      for (;;) {
        const res = await fetch(
          `${base}/enterprises/${ent}/settings/billing/budgets?per_page=100&page=${page}`,
          { headers }
        )
        const data = await res.json()
        budgets.push(...(data.budgets ?? []))
        if (!data.has_next_page) break
        page++
      }

      const entBudget = budgets.find(b => b.budget_scope === 'enterprise' && isCopilotBudget(b))
      expect(entBudget).toBeDefined()
      expect(entBudget!.id).toBeTruthy()
      expect(typeof entBudget!.prevent_further_usage).toBe('boolean')
    })

    it('fetches cost centers list', async () => {
      const res = await fetch(
        `${base}/enterprises/${ent}/settings/billing/cost-centers?per_page=100&state=active`,
        { headers }
      )
      expect(res.ok).toBe(true)
      const data = await res.json()
      const costCenters = data.costCenters ?? data.cost_centers ?? []
      expect(Array.isArray(costCenters)).toBe(true)
    })
  })
}
