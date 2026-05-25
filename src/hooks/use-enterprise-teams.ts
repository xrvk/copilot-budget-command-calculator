import { useState, useCallback } from 'react'
import { useEnterpriseCredentials } from './use-enterprise-credentials'

export interface EnterpriseTeam {
  id: number
  name: string
  slug: string
  description: string | null
  members_url: string
  html_url: string
}

export interface TeamMember {
  login: string
  id: number
  avatar_url: string
  html_url: string
}

export function useEnterpriseTeams() {
  const { credentials, apiFetch } = useEnterpriseCredentials()

  const [teams, setTeams] = useState<EnterpriseTeam[]>([])
  const [teamsLoading, setTeamsLoading] = useState(false)
  const [teamsError, setTeamsError] = useState<string | null>(null)

  const [members, setMembers] = useState<TeamMember[]>([])
  const [membersLoading, setMembersLoading] = useState(false)
  const [membersError, setMembersError] = useState<string | null>(null)

  const [selectedTeam, setSelectedTeam] = useState<EnterpriseTeam | null>(null)

  const fetchTeams = useCallback(async () => {
    if (!credentials) return
    setTeamsLoading(true)
    setTeamsError(null)
    try {
      const all: EnterpriseTeam[] = []
      let page = 1
      // Paginate through all teams
      while (true) {
        const res = await apiFetch(
          `/enterprises/${credentials.ent}/teams?per_page=100&page=${page}`
        )
        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          throw new Error(body.message || `HTTP ${res.status}`)
        }
        const data: EnterpriseTeam[] = await res.json()
        all.push(...data)
        if (data.length < 100) break
        page++
      }
      setTeams(all)
    } catch (err) {
      setTeamsError(err instanceof Error ? err.message : 'Failed to fetch teams')
    }
    setTeamsLoading(false)
  }, [credentials, apiFetch])

  const fetchMembers = useCallback(async (team: EnterpriseTeam) => {
    if (!credentials) return
    setSelectedTeam(team)
    setMembersLoading(true)
    setMembersError(null)
    setMembers([])
    try {
      const all: TeamMember[] = []
      let page = 1
      while (true) {
        const res = await apiFetch(
          `/enterprises/${credentials.ent}/teams/${team.slug}/memberships?per_page=100&page=${page}`
        )
        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          throw new Error(body.message || `HTTP ${res.status}`)
        }
        const data: TeamMember[] = await res.json()
        all.push(...data)
        if (data.length < 100) break
        page++
      }
      setMembers(all)
    } catch (err) {
      setMembersError(err instanceof Error ? err.message : 'Failed to fetch members')
    }
    setMembersLoading(false)
  }, [credentials, apiFetch])

  const addMembersToTeam = useCallback(async (teamSlug: string, usernames: string[]) => {
    if (!credentials || usernames.length === 0) return { ok: false, error: 'No usernames' }
    try {
      const res = await apiFetch(
        `/enterprises/${credentials.ent}/teams/${teamSlug}/memberships/add`,
        { method: 'POST', body: JSON.stringify({ usernames }) }
      )
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        return { ok: false, error: body.message || `HTTP ${res.status}` }
      }
      return { ok: true }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : 'Failed' }
    }
  }, [credentials, apiFetch])

  const removeMembersFromTeam = useCallback(async (teamSlug: string, usernames: string[]) => {
    if (!credentials || usernames.length === 0) return { ok: false, error: 'No usernames' }
    try {
      const res = await apiFetch(
        `/enterprises/${credentials.ent}/teams/${teamSlug}/memberships/remove`,
        { method: 'POST', body: JSON.stringify({ usernames }) }
      )
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        return { ok: false, error: body.message || `HTTP ${res.status}` }
      }
      return { ok: true }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : 'Failed' }
    }
  }, [credentials, apiFetch])

  const clearTeams = useCallback(() => {
    setTeams([])
    setMembers([])
    setSelectedTeam(null)
    setTeamsError(null)
    setMembersError(null)
  }, [])

  return {
    teams, teamsLoading, teamsError, fetchTeams,
    members, membersLoading, membersError,
    selectedTeam, fetchMembers,
    addMembersToTeam, removeMembersFromTeam,
    clearTeams,
  }
}
