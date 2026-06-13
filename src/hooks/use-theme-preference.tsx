import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { useTheme } from 'next-themes'
import { isDarkTime } from '@/lib/solar'

export type ThemePreference = 'light' | 'dark' | 'auto'

interface ThemePreferenceContextValue {
  preference: ThemePreference
  setPreference: (pref: ThemePreference) => void
  /** The resolved theme actually applied ('light' | 'dark') */
  resolvedTheme: string | undefined
}

const ThemePreferenceContext = createContext<ThemePreferenceContextValue | null>(null)

const STORAGE_KEY = 'bcc-theme-pref'
const RECHECK_INTERVAL_MS = 60_000
const DEFAULT_LATITUDE = 42

/** Estimate approximate coordinates from the browser's timezone offset. */
function coordsFromTimezone(): { lat: number; lng: number } {
  const offsetMinutes = new Date().getTimezoneOffset()
  // Each hour of UTC offset ≈ 15° of longitude
  const lng = -offsetMinutes / 4
  return { lat: DEFAULT_LATITUDE, lng }
}

function loadPreference(): ThemePreference {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored === 'light' || stored === 'dark' || stored === 'auto') return stored
  } catch { /* localStorage unavailable */ }
  return 'auto'
}

function savePreference(pref: ThemePreference): void {
  try {
    localStorage.setItem(STORAGE_KEY, pref)
  } catch { /* localStorage unavailable */ }
}

function resolveAuto(): 'light' | 'dark' {
  const { lat, lng } = coordsFromTimezone()
  return isDarkTime(lat, lng) ? 'dark' : 'light'
}

/** Resolve the initial theme synchronously so ThemeProvider starts with the right value. */
export function getInitialTheme(): 'light' | 'dark' {
  const pref = loadPreference()
  return pref === 'auto' ? resolveAuto() : pref
}

export function ThemePreferenceProvider({ children }: { children: ReactNode }) {
  const { setTheme, resolvedTheme } = useTheme()
  const [preference, setPreferenceState] = useState<ThemePreference>(loadPreference)
  const preferenceRef = useRef(preference)

  const applyTheme = useCallback((pref: ThemePreference) => {
    setTheme(pref === 'auto' ? resolveAuto() : pref)
  }, [setTheme])

  const setPreference = useCallback((pref: ThemePreference) => {
    preferenceRef.current = pref
    setPreferenceState(pref)
    savePreference(pref)
    applyTheme(pref)
  }, [applyTheme])

  // Periodic recheck for auto mode
  useEffect(() => {
    if (preference !== 'auto') return

    applyTheme('auto')

    const id = setInterval(() => {
      // Guard: only recheck if still in auto mode (ref avoids stale closure)
      if (preferenceRef.current === 'auto') {
        applyTheme('auto')
      }
    }, RECHECK_INTERVAL_MS)

    return () => clearInterval(id)
  }, [preference, applyTheme])

  // Apply theme on mount
  useEffect(() => {
    applyTheme(preference)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <ThemePreferenceContext.Provider value={{ preference, setPreference, resolvedTheme }}>
      {children}
    </ThemePreferenceContext.Provider>
  )
}

export function useThemePreference(): ThemePreferenceContextValue {
  const ctx = useContext(ThemePreferenceContext)
  if (!ctx) throw new Error('useThemePreference must be used within ThemePreferenceProvider')
  return ctx
}
