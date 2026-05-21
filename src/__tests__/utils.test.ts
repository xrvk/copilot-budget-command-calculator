import { describe, it, expect } from 'vitest'
import { parseEnterpriseUrl, settingsTokensUrl, cn, toUiBase, enterpriseUrl, budgetEditUrl, costCentersUrl, costCenterUrl, licensingUrl, teamsUrl, enterpriseTeamsNewUrl, budgetsUrl, memberUrl } from '../lib/utils'

// --- parseEnterpriseUrl ---

describe('parseEnterpriseUrl', () => {
  it('parses a full github.com enterprise URL', () => {
    const result = parseEnterpriseUrl('https://github.com/enterprises/acme-corp')
    expect(result).toEqual({ base: 'https://api.github.com', ent: 'acme-corp' })
  })

  it('parses a github.com URL without /enterprises/ prefix', () => {
    const result = parseEnterpriseUrl('https://github.com/acme-corp')
    expect(result).toEqual({ base: 'https://api.github.com', ent: 'acme-corp' })
  })

  it('parses a bare enterprise slug', () => {
    const result = parseEnterpriseUrl('acme-corp')
    expect(result).toEqual({ base: 'https://api.github.com', ent: 'acme-corp' })
  })

  it('parses a GHE Cloud URL (subdomain.ghe.com)', () => {
    const result = parseEnterpriseUrl('https://mycompany.ghe.com/enterprises/acme')
    expect(result).toEqual({ base: 'https://api.mycompany.ghe.com', ent: 'acme' })
  })

  it('parses a GHE Cloud URL without /enterprises/', () => {
    const result = parseEnterpriseUrl('https://mycompany.ghe.com/acme')
    expect(result).toEqual({ base: 'https://api.mycompany.ghe.com', ent: 'acme' })
  })

  it('handles URL without protocol', () => {
    const result = parseEnterpriseUrl('github.com/enterprises/acme-corp')
    expect(result).toEqual({ base: 'https://api.github.com', ent: 'acme-corp' })
  })

  it('trims whitespace', () => {
    const result = parseEnterpriseUrl('  acme-corp  ')
    expect(result).toEqual({ base: 'https://api.github.com', ent: 'acme-corp' })
  })

  it('returns default for empty string', () => {
    const result = parseEnterpriseUrl('')
    expect(result).toEqual({ base: 'https://api.github.com', ent: 'your-enterprise-slug' })
  })

  it('returns default for whitespace-only string', () => {
    const result = parseEnterpriseUrl('   ')
    expect(result).toEqual({ base: 'https://api.github.com', ent: 'your-enterprise-slug' })
  })

  it('handles trailing slashes', () => {
    const result = parseEnterpriseUrl('https://github.com/enterprises/acme-corp/')
    expect(result.ent).toBe('acme-corp')
  })

  it('handles deeply nested paths (picks first after /enterprises/)', () => {
    const result = parseEnterpriseUrl('https://github.com/enterprises/acme-corp/settings/billing')
    expect(result.ent).toBe('acme-corp')
  })
})

// --- settingsTokensUrl ---

describe('settingsTokensUrl', () => {
  it('derives github.com settings URL', () => {
    expect(settingsTokensUrl('https://api.github.com')).toBe('https://github.com/settings/tokens')
  })

  it('derives GHE settings URL', () => {
    expect(settingsTokensUrl('https://api.mycompany.ghe.com')).toBe('https://mycompany.ghe.com/settings/tokens')
  })

  it('passes through non-api URLs unchanged', () => {
    expect(settingsTokensUrl('https://github.com')).toBe('https://github.com/settings/tokens')
  })
})

// --- Enterprise URL builders ---
// These tests pin the exact URL paths the app generates as <a href> links.
// If GitHub changes a web-UI path, a failing test here tells you exactly
// which helper (and therefore which links) need updating.

const DOTCOM = 'https://api.github.com'
const GHE = 'https://api.acme.ghe.com'

describe('toUiBase', () => {
  it('converts api.github.com → github.com', () => {
    expect(toUiBase(DOTCOM)).toBe('https://github.com')
  })

  it('converts api.acme.ghe.com → acme.ghe.com', () => {
    expect(toUiBase(GHE)).toBe('https://acme.ghe.com')
  })
})

describe('enterpriseUrl', () => {
  it('builds dotcom enterprise home URL', () => {
    expect(enterpriseUrl(DOTCOM, 'acme')).toBe('https://github.com/enterprises/acme')
  })

  it('builds GHE enterprise home URL', () => {
    expect(enterpriseUrl(GHE, 'acme')).toBe('https://acme.ghe.com/enterprises/acme')
  })
})

describe('budgetEditUrl', () => {
  it('builds dotcom budget edit URL', () => {
    expect(budgetEditUrl(DOTCOM, 'acme', 'b-123')).toBe(
      'https://github.com/enterprises/acme/billing/budgets/b-123/edit'
    )
  })

  it('builds GHE budget edit URL', () => {
    expect(budgetEditUrl(GHE, 'acme', 'b-456')).toBe(
      'https://acme.ghe.com/enterprises/acme/billing/budgets/b-456/edit'
    )
  })
})

describe('costCentersUrl', () => {
  it('builds dotcom cost centers list URL', () => {
    expect(costCentersUrl(DOTCOM, 'acme')).toBe(
      'https://github.com/enterprises/acme/billing/cost_centers'
    )
  })
})

describe('costCenterUrl', () => {
  it('builds dotcom single cost center URL', () => {
    expect(costCenterUrl(DOTCOM, 'acme', 'cc-789')).toBe(
      'https://github.com/enterprises/acme/billing/cost_centers/cc-789'
    )
  })
})

describe('licensingUrl', () => {
  it('builds dotcom licensing URL', () => {
    expect(licensingUrl(DOTCOM, 'acme')).toBe('https://github.com/enterprises/acme/licensing')
  })

  it('builds GHE licensing URL', () => {
    expect(licensingUrl(GHE, 'acme')).toBe('https://acme.ghe.com/enterprises/acme/licensing')
  })
})

describe('teamsUrl', () => {
  it('builds dotcom teams URL', () => {
    expect(teamsUrl(DOTCOM, 'acme')).toBe('https://github.com/enterprises/acme/teams')
  })
})

describe('enterpriseTeamsNewUrl', () => {
  it('builds dotcom team-creation URL', () => {
    expect(enterpriseTeamsNewUrl(DOTCOM, 'acme')).toBe('https://github.com/enterprises/acme/teams/new')
  })
  it('builds GHE team-creation URL stripping /api/v3', () => {
    expect(enterpriseTeamsNewUrl(GHE, 'acme')).toBe('https://acme.ghe.com/enterprises/acme/teams/new')
  })
})

describe('budgetsUrl', () => {
  it('builds dotcom budgets list URL', () => {
    expect(budgetsUrl(DOTCOM, 'acme')).toBe(
      'https://github.com/enterprises/acme/billing/budgets'
    )
  })
})

describe('memberUrl', () => {
  it('builds dotcom member URL', () => {
    expect(memberUrl(DOTCOM, 'acme', 'octocat')).toBe(
      'https://github.com/enterprises/acme/people/octocat'
    )
  })

  it('builds GHE member URL', () => {
    expect(memberUrl(GHE, 'acme', 'octocat')).toBe(
      'https://acme.ghe.com/enterprises/acme/people/octocat'
    )
  })
})

// --- cn (className merge) ---

describe('cn', () => {
  it('merges class names', () => {
    expect(cn('foo', 'bar')).toBe('foo bar')
  })

  it('handles conditional classes', () => {
    const condition = false
    expect(cn('base', condition && 'hidden', 'extra')).toBe('base extra')
  })

  it('returns empty string for no args', () => {
    expect(cn()).toBe('')
  })

  it('handles undefined and null', () => {
    expect(cn('foo', undefined, null, 'bar')).toBe('foo bar')
  })
})
