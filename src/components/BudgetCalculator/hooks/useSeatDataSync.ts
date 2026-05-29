/**
 * Seat-data auto-fetch + sync hook.
 *
 * When the user is connected, automatically fetch CB/CE seat counts and
 * propagate them into the calculator's license inputs. Power-user count is
 * defaulted to the CE seat count unless the user has manually overridden it.
 *
 * Extracted from `BudgetCalculator.tsx` to keep the orchestrator focused.
 */

import { useEffect, useRef, useState } from 'react'
import type { ApiCredentials } from '@/hooks/use-enterprise-credentials'

interface SeatData {
  cbSeats: number
  ceSeats: number
}

export interface UseSeatDataSyncOpts {
  credentials: ApiCredentials | null
  seatData: SeatData | null
  seatLoading: boolean
  fetchSeatData: () => void
  setCbLicenses: (v: number) => void
  setCeLicenses: (v: number) => void
  setPowerUsers: (v: number) => void
  powerUsersManuallySet: boolean
  cbManuallySet: boolean
  ceManuallySet: boolean
}

/**
 * Fetch seat data once when credentials become available, and sync the result
 * into license inputs as soon as it arrives. Power users defaults to CE seat
 * count unless manually overridden.
 *
 * Resets internally when the enterprise slug changes so a re-fetch happens for
 * a different connection (e.g. demo → live or live → live with different ent).
 */
export function useSeatDataSync(opts: UseSeatDataSyncOpts): void {
  // Track the enterprise slug via state-during-render so we can reset the
  // fetched-once gate when the user reconnects to a different enterprise.
  const ent = opts.credentials?.ent ?? null
  const [prevEnt, setPrevEnt] = useState<string | null>(ent)
  const [fetchTrigger, setFetchTrigger] = useState(0)
  if (prevEnt !== ent) {
    setPrevEnt(ent)
    // Bump the trigger so the auto-fetch effect re-runs for the new ent.
    setFetchTrigger(t => t + 1)
  }

  // Auto-fetch once per (enterprise) trigger.
  const fetchedTriggerRef = useRef(-1)
  useEffect(() => {
    if (
      opts.credentials &&
      !opts.seatData &&
      !opts.seatLoading &&
      fetchedTriggerRef.current !== fetchTrigger
    ) {
      fetchedTriggerRef.current = fetchTrigger
      opts.fetchSeatData()
    }
  }, [opts, fetchTrigger])

  // Sync into inputs when data arrives. State-during-render pattern.
  // Skip overwriting values that came from a shared URL link.
  const [prevSeatData, setPrevSeatData] = useState(opts.seatData)
  if (opts.seatData !== prevSeatData) {
    setPrevSeatData(opts.seatData)
    if (opts.seatData) {
      if (!opts.cbManuallySet) {
        opts.setCbLicenses(opts.seatData.cbSeats)
      }
      if (!opts.ceManuallySet) {
        opts.setCeLicenses(opts.seatData.ceSeats)
      }
      if (!opts.powerUsersManuallySet) {
        opts.setPowerUsers(opts.seatData.ceSeats)
      }
    }
  }
}
