import { describe, it, expect } from 'vitest'
import {
  buildTeamSyncShellScript,
  buildTeamSyncGitHubAction,
  buildListBudgetsScript,
} from '../lib/api-scripts'

const ENT = 'acme-corp'
const BASE = 'https://api.github.com'
const TOKEN = 'ghp_test123'

describe('buildTeamSyncShellScript', () => {
  it('embeds enterprise slug, team slug, and CC name', () => {
    const script = buildTeamSyncShellScript(ENT, BASE, 'power-users', 'Power Users', TOKEN)
    expect(script).toContain(`ENTERPRISE="${ENT}"`)
    expect(script).toContain(`TEAM_SLUG="power-users"`)
    expect(script).toContain(`COST_CENTER_NAME="Power Users"`)
    expect(script).toContain(`API_BASE="${BASE}"`)
  })

  it('embeds the token in the API_TOKEN default', () => {
    const script = buildTeamSyncShellScript(ENT, BASE, 'devs', 'Devs', TOKEN)
    expect(script).toContain(TOKEN)
  })

  it('falls back to placeholder when team slug is empty', () => {
    const script = buildTeamSyncShellScript(ENT, BASE, '', 'CC Name', TOKEN)
    expect(script).toContain('YOUR_TEAM_SLUG')
  })

  it('falls back to "Power Users" when CC name is empty', () => {
    const script = buildTeamSyncShellScript(ENT, BASE, 'devs', '', TOKEN)
    expect(script).toContain('COST_CENTER_NAME="Power Users"')
  })

  it('starts with a shebang line', () => {
    const script = buildTeamSyncShellScript(ENT, BASE, 'devs', 'Devs', TOKEN)
    expect(script).toMatch(/^#!\/usr\/bin\/env bash/)
  })

  it('uses set -euo pipefail for safety', () => {
    const script = buildTeamSyncShellScript(ENT, BASE, 'devs', 'Devs', TOKEN)
    expect(script).toContain('set -euo pipefail')
  })
})

describe('buildTeamSyncGitHubAction', () => {
  it('generates valid YAML with enterprise and team slug', () => {
    const yaml = buildTeamSyncGitHubAction(ENT, BASE, 'infra-team', 'Infrastructure')
    expect(yaml).toContain('name:')
    expect(yaml).toContain(ENT)
    expect(yaml).toContain('infra-team')
    expect(yaml).toContain('Infrastructure')
  })

  it('references the GitHub API version header', () => {
    const yaml = buildTeamSyncGitHubAction(ENT, BASE, 'devs', 'Developers')
    expect(yaml).toContain('2026-03-10')
  })

  it('includes pagination loop for team members', () => {
    const yaml = buildTeamSyncGitHubAction(ENT, BASE, 'devs', 'Developers')
    expect(yaml).toContain('PAGE=1')
    expect(yaml).toContain('while true')
    expect(yaml).toContain('per_page=100&page=$PAGE')
  })

  it('includes stale member removal step', () => {
    const yaml = buildTeamSyncGitHubAction(ENT, BASE, 'devs', 'Developers')
    expect(yaml).toContain('remove stale')
    expect(yaml).toContain('-X DELETE')
    expect(yaml).toContain('TO_REMOVE')
  })
})

describe('buildListBudgetsScript', () => {
  it('embeds enterprise slug and API base', () => {
    const script = buildListBudgetsScript(ENT, BASE, TOKEN)
    expect(script).toContain(ENT)
    expect(script).toContain(BASE)
  })

  it('embeds the token', () => {
    const script = buildListBudgetsScript(ENT, BASE, TOKEN)
    expect(script).toContain(TOKEN)
  })

  it('includes pagination logic', () => {
    const script = buildListBudgetsScript(ENT, BASE, TOKEN)
    expect(script).toContain('per_page')
  })

  it('works with GHE base URL', () => {
    const gheBase = 'https://api.myinstance.ghe.com'
    const script = buildListBudgetsScript(ENT, gheBase, TOKEN)
    expect(script).toContain(gheBase)
    expect(script).not.toContain('api.github.com')
  })
})
