const STORAGE_KEY = 'cbcc_onboarding_dismissed'

/** Check if the user previously dismissed the onboarding popup. */
function isOnboardingDismissed(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

/** Persist or clear the onboarding dismissal state. */
export function setOnboardingDismissed(dismissed: boolean): void {
  try {
    if (dismissed) {
      localStorage.setItem(STORAGE_KEY, '1')
    } else {
      localStorage.removeItem(STORAGE_KEY)
    }
  } catch {
    // localStorage unavailable (private browsing, etc.)
  }
}

/** Check if ?popup=0 is set in the URL query string or hash. */
function isPopupSuppressed(): boolean {
  if (new URLSearchParams(window.location.search).get('popup') === '0') return true
  const hashQuery = window.location.hash.split('?')[1]
  if (hashQuery && new URLSearchParams(hashQuery).get('popup') === '0') return true
  return false
}

/** Whether the onboarding popup should display on load. */
export function shouldShowOnboarding(): boolean {
  if (isPopupSuppressed()) return false
  return !isOnboardingDismissed()
}
