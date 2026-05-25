import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { DemoWrapper } from './test-utils'
import BudgetCalculator from '../components/BudgetCalculator'

describe('Tier Planner connected rendering', () => {
  it('renders wizard steps in demo mode (with cost centers: 5 steps)', () => {
    const { container } = render(<BudgetCalculator />, { wrapper: DemoWrapper })

    // Title
    expect(container.querySelector('h2')?.textContent).toBe('Tier Planner')

    // 5 steps when demo has cost centers
    const stepLabels = container.querySelectorAll('[aria-label^="Step"]')
    expect(stepLabels.length).toBe(5)

    // Verify step content
    expect(screen.getByText('Set Enterprise Budget')).toBeDefined()
    expect(screen.getByText('Set Cost Center Budget for Power Users')).toBeDefined()
    expect(screen.getByText('Set Universal User-Level Budget')).toBeDefined()
    expect(screen.getByText('Set Individual User-Level Budgets')).toBeDefined()
    expect(screen.getByText('Cost Center Constraint Analysis')).toBeDefined()
  })

  it('renders Suggested Actions card', () => {
    render(<BudgetCalculator />, { wrapper: DemoWrapper })
    expect(screen.getByText('Suggested Actions')).toBeDefined()
    expect(screen.getAllByText('Needs review').length).toBeGreaterThan(0)
  })

  it('renders license configuration and summary cards', () => {
    render(<BudgetCalculator />, { wrapper: DemoWrapper })
    expect(screen.getByText('Configuration')).toBeDefined()
    expect(screen.getByText('Monthly Cost Summary')).toBeDefined()
  })

  it('renders Key Takeaways section', () => {
    render(<BudgetCalculator />, { wrapper: DemoWrapper })
    expect(screen.getByText('Key Takeaways')).toBeDefined()
  })


})
