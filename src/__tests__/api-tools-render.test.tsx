import { describe, it, expect, vi } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ApiTools from '../components/ApiTools'
import { PlainWrapper } from './test-utils'
import { EnterpriseCredentialsProvider, useEnterpriseCredentials } from '../hooks/use-enterprise-credentials'
import { ThemeProvider } from 'next-themes'
import { type ReactNode, useImperativeHandle, forwardRef } from 'react'

describe('ApiTools script tab switching', () => {
  it('defaults to user-budget and shows user budget inputs', () => {
    render(<ApiTools onScriptChange={() => {}} />, { wrapper: PlainWrapper })
    expect(screen.getByLabelText(/Usernames/i)).toBeInTheDocument()
  })

  it('clicking team-sync card shows team sync inputs', async () => {
    const user = userEvent.setup()
    const onScriptChange = vi.fn()
    render(<ApiTools onScriptChange={onScriptChange} />, { wrapper: PlainWrapper })

    // Click the "Enterprise Team → Cost Center Sync" card
    const teamSyncCard = screen.getByTestId('script-card-team-sync')
    await user.click(teamSyncCard)

    // Should show team-sync specific inputs
    expect(screen.getByLabelText(/Enterprise Team Slug/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/Cost Center Name/i)).toBeInTheDocument()
    // Should fire onScriptChange callback
    expect(onScriptChange).toHaveBeenCalledWith('team-sync')
  })

  it('clicking cycle-reset card shows cycle reset inputs', async () => {
    const user = userEvent.setup()
    render(<ApiTools onScriptChange={() => {}} />, { wrapper: PlainWrapper })

    const resetCard = screen.getByTestId('script-card-cycle-reset')
    await user.click(resetCard)

    expect(screen.getByLabelText(/Budget ID/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/Full-Cycle Budget Amount/i)).toBeInTheDocument()
  })

  it('clicking list-budgets card switches content', async () => {
    const user = userEvent.setup()
    render(<ApiTools onScriptChange={() => {}} />, { wrapper: PlainWrapper })

    const listCard = screen.getByTestId('script-card-list-budgets')
    await user.click(listCard)

    // list-budgets doesn't have special inputs, but the title should change
    expect(screen.getByText('Retrieve all configured budgets for your enterprise (paginated, 10 per page)')).toBeInTheDocument()
  })

  it('syncs initialScript prop change (Tier Planner → team-sync navigation)', () => {
    const onScriptChange = vi.fn()
    const { rerender } = render(
      <PlainWrapper>
        <ApiTools initialScript="user-budget" onScriptChange={onScriptChange} />
      </PlainWrapper>
    )

    // Initially shows user-budget inputs
    expect(screen.getByLabelText(/Usernames/i)).toBeInTheDocument()

    // Simulate navigation from Tier Planner: initialScript changes to team-sync
    rerender(
      <PlainWrapper>
        <ApiTools initialScript="team-sync" onScriptChange={onScriptChange} />
      </PlainWrapper>
    )

    // Should now show team-sync inputs
    expect(screen.getByLabelText(/Enterprise Team Slug/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/Cost Center Name/i)).toBeInTheDocument()
  })

  it('fires onScriptChange for each tab switch', async () => {
    const user = userEvent.setup()
    const onScriptChange = vi.fn()
    render(<ApiTools onScriptChange={onScriptChange} />, { wrapper: PlainWrapper })

    const teamCard = screen.getByTestId('script-card-team-sync')
    await user.click(teamCard)
    expect(onScriptChange).toHaveBeenLastCalledWith('team-sync')

    const userCard = screen.getByTestId('script-card-user-budget')
    await user.click(userCard)
    expect(onScriptChange).toHaveBeenLastCalledWith('user-budget')

    expect(onScriptChange).toHaveBeenCalledTimes(2)
  })
})

describe('ApiTools enterprise URL sync', () => {
  // Helper that exposes setEnterpriseUrl from the credentials provider
  interface UrlSetterHandle { setUrl: (url: string) => void }
  const UrlSetter = forwardRef<UrlSetterHandle, { children: ReactNode }>(
    function UrlSetter({ children }, ref) {
      const { setEnterpriseUrl } = useEnterpriseCredentials()
      useImperativeHandle(ref, () => ({ setUrl: setEnterpriseUrl }))
      return <>{children}</>
    }
  )

  it('syncs enterprise URL when shared credentials change', () => {
    const handleRef = { current: null as UrlSetterHandle | null }
    render(
      <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
        <EnterpriseCredentialsProvider>
          <UrlSetter ref={handleRef}>
            <ApiTools onScriptChange={() => {}} />
          </UrlSetter>
        </EnterpriseCredentialsProvider>
      </ThemeProvider>
    )

    const input = screen.getByLabelText(/Enterprise URL or Slug/i) as HTMLInputElement

    // Simulate user connecting via ImportPanel (sets enterpriseUrl in provider)
    act(() => {
      handleRef.current!.setUrl('https://github.com/enterprises/test-corp')
    })

    expect(input.value).toBe('https://github.com/enterprises/test-corp')
  })
})
