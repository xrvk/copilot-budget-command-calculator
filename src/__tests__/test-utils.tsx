/**
 * Shared test wrappers for component rendering tests.
 *
 * PlainWrapper — ThemeProvider + EnterpriseCredentialsProvider (disconnected state)
 * DemoWrapper  — same, but auto-connects in demo mode on first render
 */
import { useEffect, type ReactNode } from 'react'
import { ThemeProvider } from 'next-themes'
import { EnterpriseCredentialsProvider, useEnterpriseCredentials } from '../hooks/use-enterprise-credentials'

export function PlainWrapper({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
      <EnterpriseCredentialsProvider>
        {children}
      </EnterpriseCredentialsProvider>
    </ThemeProvider>
  )
}

function DemoConnector({ children }: { children: ReactNode }) {
  const { connectDemo, credentials } = useEnterpriseCredentials()
  useEffect(() => {
    if (!credentials) connectDemo()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  return <>{children}</>
}

export function DemoWrapper({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
      <EnterpriseCredentialsProvider>
        <DemoConnector>{children}</DemoConnector>
      </EnterpriseCredentialsProvider>
    </ThemeProvider>
  )
}
