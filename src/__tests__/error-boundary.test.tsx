import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ErrorBoundary } from 'react-error-boundary'
import { TabErrorFallback } from '../components/TabErrorFallback'
import { StepErrorFallback } from '../components/StepErrorFallback'

function ThrowingComponent({ message }: { message: string }) {
  throw new Error(message)
}

describe('TabErrorFallback', () => {
  it('renders error message and retry button', () => {
    const resetFn = vi.fn()
    render(<TabErrorFallback error={new Error('tab crash')} resetErrorBoundary={resetFn} />)

    expect(screen.getByText('Something went wrong')).toBeInTheDocument()
    expect(screen.getByText(/This tab encountered an error/)).toBeInTheDocument()
    expect(screen.getByText('tab crash')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument()
  })

  it('calls resetErrorBoundary when retry is clicked', async () => {
    const user = userEvent.setup()
    const resetFn = vi.fn()
    render(<TabErrorFallback error={new Error('test')} resetErrorBoundary={resetFn} />)

    await user.click(screen.getByRole('button', { name: /retry/i }))
    expect(resetFn).toHaveBeenCalledOnce()
  })
})

describe('StepErrorFallback', () => {
  it('renders inline error with retry button', () => {
    const resetFn = vi.fn()
    render(<StepErrorFallback error={new Error('step crash')} resetErrorBoundary={resetFn} />)

    expect(screen.getByText(/This step encountered an error/)).toBeInTheDocument()
    expect(screen.getByText('step crash')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument()
  })

  it('calls resetErrorBoundary when retry is clicked', async () => {
    const user = userEvent.setup()
    const resetFn = vi.fn()
    render(<StepErrorFallback error={new Error('test')} resetErrorBoundary={resetFn} />)

    await user.click(screen.getByRole('button', { name: /retry/i }))
    expect(resetFn).toHaveBeenCalledOnce()
  })
})

describe('ErrorBoundary integration', () => {
  it('catches errors from child components and renders TabErrorFallback', () => {
    // Suppress React error boundary console output
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})

    render(
      <ErrorBoundary FallbackComponent={TabErrorFallback}>
        <ThrowingComponent message="integration test error" />
      </ErrorBoundary>
    )

    expect(screen.getByText('Something went wrong')).toBeInTheDocument()
    expect(screen.getByText('integration test error')).toBeInTheDocument()

    spy.mockRestore()
  })

  it('catches errors and renders StepErrorFallback', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})

    render(
      <ErrorBoundary FallbackComponent={StepErrorFallback}>
        <ThrowingComponent message="step error" />
      </ErrorBoundary>
    )

    expect(screen.getByText(/This step encountered an error/)).toBeInTheDocument()
    expect(screen.getByText('step error')).toBeInTheDocument()

    spy.mockRestore()
  })

  it('does not affect sibling boundaries', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})

    render(
      <div>
        <ErrorBoundary FallbackComponent={StepErrorFallback}>
          <ThrowingComponent message="broken step" />
        </ErrorBoundary>
        <ErrorBoundary FallbackComponent={StepErrorFallback}>
          <div data-testid="healthy">Healthy step</div>
        </ErrorBoundary>
      </div>
    )

    expect(screen.getByText(/This step encountered an error/)).toBeInTheDocument()
    expect(screen.getByTestId('healthy')).toBeInTheDocument()
    expect(screen.getByText('Healthy step')).toBeInTheDocument()

    spy.mockRestore()
  })
})
