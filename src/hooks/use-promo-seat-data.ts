import { useState, useCallback } from 'react'
import { useEnterpriseCredentials } from './use-enterprise-credentials'

export interface PromoSeatData {
  ghecPurchased: number
  ghecConsumed: number
  ghecAvailable: number
  cbSeats: number
  ceSeats: number
  noCopilotUsers: number
  totalEnterpriseMembers: number
}

export interface PromoSeatDataHook {
  data: PromoSeatData | null
  loading: boolean
  error: string | null
  fetchSeatData: () => Promise<void>
  clear: () => void
}

export function usePromoSeatData(): PromoSeatDataHook {
  const { credentials, apiFetch } = useEnterpriseCredentials()

  const [data, setData] = useState<PromoSeatData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchSeatData = useCallback(async () => {
    if (!credentials) return
    setLoading(true)
    setError(null)

    try {
      // Fetch consumed licenses (paginated) and copilot seats (paginated) in parallel
      const [licenseResult, copilotResult] = await Promise.all([
        fetchAllPages<ConsumedLicenseUser>(
          apiFetch,
          `/enterprises/${credentials.ent}/consumed-licenses`,
          'users'
        ),
        fetchAllPages<CopilotSeat>(
          apiFetch,
          `/enterprises/${credentials.ent}/copilot/billing/seats`,
          'seats'
        ),
      ])

      setData(aggregateSeatData(licenseResult, copilotResult))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch seat data')
    }

    setLoading(false)
  }, [credentials, apiFetch])

  const clear = useCallback(() => {
    setData(null)
    setError(null)
  }, [])

  return { data, loading, error, fetchSeatData, clear }
}

// --- Internal types & helpers ---

interface ConsumedLicenseUser {
  github_com_login: string
  github_com_name: string | null
  license_type: string
  github_com_user: boolean
}

interface CopilotSeat {
  plan_type?: string
  assignee?: { login: string }
  pending_cancellation_date?: string | null
}

interface PaginationMeta {
  total_seats_purchased?: number
  total_seats_consumed?: number
  total_seats?: number
}

export function aggregateSeatData(
  licenseResult: { items: ConsumedLicenseUser[]; meta: PaginationMeta },
  copilotResult: { items: CopilotSeat[]; meta: PaginationMeta },
): PromoSeatData {
  const cbSeats = copilotResult.items.filter(s => s.plan_type === 'business').length
  const ceSeats = copilotResult.items.filter(s => s.plan_type === 'enterprise').length

  const copilotLogins = new Set(
    copilotResult.items
      .map(s => s.assignee?.login)
      .filter((l): l is string => !!l)
  )
  const totalMembers = licenseResult.items.length
  const noCopilotUsers = licenseResult.items.filter(
    u => u.github_com_login && !copilotLogins.has(u.github_com_login)
  ).length

  return {
    ghecPurchased: licenseResult.meta.total_seats_purchased ?? 0,
    ghecConsumed: licenseResult.meta.total_seats_consumed ?? 0,
    ghecAvailable: Math.max(
      0,
      (licenseResult.meta.total_seats_purchased ?? 0) -
        (licenseResult.meta.total_seats_consumed ?? 0)
    ),
    cbSeats,
    ceSeats,
    noCopilotUsers,
    totalEnterpriseMembers: totalMembers,
  }
}

export async function fetchAllPages<T>(
  apiFetch: (path: string, init?: RequestInit) => Promise<Response>,
  basePath: string,
  itemsKey: string,
): Promise<{ items: T[]; meta: PaginationMeta }> {
  const all: T[] = []
  let meta: PaginationMeta = {}
  let page = 1

  while (true) {
    const separator = basePath.includes('?') ? '&' : '?'
    const res = await apiFetch(`${basePath}${separator}per_page=100&page=${page}`)
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      throw new Error(body.message || `HTTP ${res.status}`)
    }
    const data = await res.json()

    // Capture top-level meta on first page
    if (page === 1) {
      meta = {
        total_seats_purchased: data.total_seats_purchased,
        total_seats_consumed: data.total_seats_consumed,
        total_seats: data.total_seats,
      }
    }

    const items: T[] = data[itemsKey] ?? []
    all.push(...items)
    if (items.length < 100) break
    page++
  }

  return { items: all, meta }
}
