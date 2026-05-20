import { describe, it, expect } from 'vitest'
import { aggregateSeatData } from '../hooks/use-promo-seat-data'

function makeLicenseResult(users: Array<{ login: string }>, meta: { purchased?: number; consumed?: number } = {}) {
  return {
    items: users.map(u => ({ github_com_login: u.login, github_com_name: null, license_type: 'enterprise', github_com_user: true })),
    meta: { total_seats_purchased: meta.purchased, total_seats_consumed: meta.consumed },
  }
}

function makeCopilotResult(seats: Array<{ login: string; plan: 'business' | 'enterprise' }>) {
  return {
    items: seats.map(s => ({ plan_type: s.plan, assignee: { login: s.login } })),
    meta: {},
  }
}

describe('aggregateSeatData', () => {
  it('counts CB and CE seats correctly', () => {
    const copilot = makeCopilotResult([
      { login: 'a', plan: 'business' },
      { login: 'b', plan: 'business' },
      { login: 'c', plan: 'enterprise' },
    ])
    const result = aggregateSeatData(makeLicenseResult([]), copilot)
    expect(result.cbSeats).toBe(2)
    expect(result.ceSeats).toBe(1)
  })

  it('identifies users without copilot seats', () => {
    const licenses = makeLicenseResult([{ login: 'alice' }, { login: 'bob' }, { login: 'carol' }])
    const copilot = makeCopilotResult([{ login: 'alice', plan: 'business' }])
    const result = aggregateSeatData(licenses, copilot)
    expect(result.noCopilotUsers).toBe(2)
  })

  it('computes GHEC available as purchased minus consumed', () => {
    const licenses = makeLicenseResult([], { purchased: 100, consumed: 75 })
    const result = aggregateSeatData(licenses, makeCopilotResult([]))
    expect(result.ghecPurchased).toBe(100)
    expect(result.ghecConsumed).toBe(75)
    expect(result.ghecAvailable).toBe(25)
  })

  it('clamps GHEC available to zero when consumed exceeds purchased', () => {
    const licenses = makeLicenseResult([], { purchased: 50, consumed: 60 })
    const result = aggregateSeatData(licenses, makeCopilotResult([]))
    expect(result.ghecAvailable).toBe(0)
  })

  it('defaults purchased/consumed to zero when meta is missing', () => {
    const licenses = { items: [] as never[], meta: {} }
    const result = aggregateSeatData(licenses, makeCopilotResult([]))
    expect(result.ghecPurchased).toBe(0)
    expect(result.ghecConsumed).toBe(0)
    expect(result.ghecAvailable).toBe(0)
  })

  it('counts totalEnterpriseMembers from license items length', () => {
    const licenses = makeLicenseResult([{ login: 'a' }, { login: 'b' }, { login: 'c' }])
    const result = aggregateSeatData(licenses, makeCopilotResult([]))
    expect(result.totalEnterpriseMembers).toBe(3)
  })

  it('handles seats with missing assignee login', () => {
    const copilot = {
      items: [
        { plan_type: 'business', assignee: { login: 'alice' } },
        { plan_type: 'business', assignee: undefined },
        { plan_type: 'enterprise' },
      ],
      meta: {},
    }
    const licenses = makeLicenseResult([{ login: 'alice' }, { login: 'bob' }])
    const result = aggregateSeatData(licenses, copilot as never)
    expect(result.cbSeats).toBe(2)
    expect(result.ceSeats).toBe(1)
    expect(result.noCopilotUsers).toBe(1) // bob has no seat
  })

  it('handles empty inputs gracefully', () => {
    const result = aggregateSeatData(
      { items: [], meta: {} },
      { items: [], meta: {} },
    )
    expect(result.cbSeats).toBe(0)
    expect(result.ceSeats).toBe(0)
    expect(result.noCopilotUsers).toBe(0)
    expect(result.totalEnterpriseMembers).toBe(0)
  })
})
