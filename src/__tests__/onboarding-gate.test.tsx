import { describe, it, expect } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import { useEffect, type ReactNode } from 'react'
import { ThemeProvider } from 'next-themes'
import { EnterpriseCredentialsProvider, useEnterpriseCredentials } from '../hooks/use-enterprise-credentials'
import { OnboardingGate } from '../components/OnboardingGate'

/**
 * Helpers to drive credential state from inside the provider tree.
 * Tests render in a "live-incomplete" state and verify the gate shows,
 * then advance to "live-ready" and confirm the gate would unmount
 * (caller is App.tsx in production; here we just inspect dataReadiness).
 */

function ConnectAsLive({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
      <EnterpriseCredentialsProvider>
        {children}
      </EnterpriseCredentialsProvider>
    </ThemeProvider>
  )
}

function ReadinessProbe({ onMode }: { onMode: (mode: string) => void }) {
  const { dataReadiness } = useEnterpriseCredentials()
  useEffect(() => { onMode(dataReadiness.mode) }, [dataReadiness.mode, onMode])
  return null
}

describe('OnboardingGate', () => {
  it('renders the two onboarding steps with their default headings', () => {
    render(<OnboardingGate />, { wrapper: ConnectAsLive })
    expect(screen.getByText(/Set up your enterprise data/i)).toBeTruthy()
    expect(screen.getByText(/Connect to your enterprise/i)).toBeTruthy()
    expect(screen.getByText(/Upload your billing CSV/i)).toBeTruthy()
    expect(screen.getByText(/Go back to demo mode/i)).toBeTruthy()
  })

  it('exposes dataReadiness.mode = "live-incomplete" by default (no demo, no creds, no CSV)', () => {
    let mode = ''
    render(
      <ConnectAsLive>
        <ReadinessProbe onMode={(m) => { mode = m }} />
      </ConnectAsLive>,
    )
    // Default state is "blank" which the readiness selector reports as live-incomplete
    expect(mode).toBe('live-incomplete')
  })

  it('switches to "demo" when connectDemo() is called from the Back-to-demo link', async () => {
    let mode = ''
    function Harness() {
      const { connectDemo } = useEnterpriseCredentials()
      return (
        <>
          <ReadinessProbe onMode={(m) => { mode = m }} />
          <button onClick={() => connectDemo()}>back-to-demo</button>
        </>
      )
    }
    render(
      <ConnectAsLive>
        <Harness />
      </ConnectAsLive>,
    )
    expect(mode).toBe('live-incomplete')
    await act(async () => {
      screen.getByText('back-to-demo').click()
    })
    expect(mode).toBe('demo')
  })
})
