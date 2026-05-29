import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import SpendingSummaryCard from '../components/SpendingSummaryCard'

const baseProps = {
  enterpriseBudget: 5000,
  excludeCostCenters: false,
  ccBudgetTotal: 2000,
  totalSpendingExposure: 5000,
  preventFurtherUsage: true,
  budgetAlertingEnabled: true,
  credentials: null,
  entBudgetId: null,
}

describe('SpendingSummaryCard', () => {
  it('renders enterprise budget amount', () => {
    render(<SpendingSummaryCard {...baseProps} />)
    expect(screen.getAllByText('$5,000').length).toBeGreaterThanOrEqual(1)
  })

  it('shows hard cap title when preventFurtherUsage is true', () => {
    render(<SpendingSummaryCard {...baseProps} preventFurtherUsage={true} />)
    expect(screen.getByText('Monthly AI Credit Budget')).toBeInTheDocument()
    expect(screen.getByText('Max Monthly Spend')).toBeInTheDocument()
  })

  it('downgrades hard cap to partial cap when exclusion ON with uncapped CCs', () => {
    render(<SpendingSummaryCard {...baseProps} preventFurtherUsage={true} excludeCostCenters={true} uncappedCcCount={3} />)
    // Should NOT show hard cap title
    expect(screen.queryByText('Monthly AI Credit Budget')).not.toBeInTheDocument()
    // Should show partial cap title and labels
    expect(screen.getByText('Partial AI Credit Cap')).toBeInTheDocument()
    expect(screen.getByText('Capped Spend (partial)')).toBeInTheDocument()
    expect(screen.getAllByText(/Partial cap/).length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText(/3 cost centers/).length).toBeGreaterThanOrEqual(1)
  })

  it('keeps hard cap when exclusion ON but all CCs have budgets', () => {
    render(<SpendingSummaryCard {...baseProps} preventFurtherUsage={true} excludeCostCenters={true} uncappedCcCount={0} />)
    expect(screen.getByText('Monthly AI Credit Budget')).toBeInTheDocument()
    expect(screen.getByText('Max Monthly Spend')).toBeInTheDocument()
  })

  it('keeps hard cap when exclusion OFF even with zero-budget CCs', () => {
    render(<SpendingSummaryCard {...baseProps} preventFurtherUsage={true} excludeCostCenters={false} uncappedCcCount={2} />)
    expect(screen.getByText('Monthly AI Credit Budget')).toBeInTheDocument()
  })

  it('shows soft cap title when preventFurtherUsage is false with alerts', () => {
    render(<SpendingSummaryCard {...baseProps} preventFurtherUsage={false} budgetAlertingEnabled={true} />)
    expect(screen.getByText('Monthly AI Credit Alert')).toBeInTheDocument()
    expect(screen.getByText('Alert Threshold')).toBeInTheDocument()
  })

  it('shows uncapped warning when preventFurtherUsage is false and no alerts', () => {
    render(<SpendingSummaryCard {...baseProps} preventFurtherUsage={false} budgetAlertingEnabled={false} />)
    expect(screen.getByText('AI Credit Spending Is Uncapped')).toBeInTheDocument()
    expect(screen.getByText(/No limit/)).toBeInTheDocument()
  })

  it('shows additive label when excludeCostCenters is true', () => {
    render(<SpendingSummaryCard {...baseProps} excludeCostCenters={true} />)
    expect(screen.getByText(/Additive/)).toBeInTheDocument()
  })

  it('shows shared mode label when excludeCostCenters is false', () => {
    render(<SpendingSummaryCard {...baseProps} excludeCostCenters={false} />)
    expect(screen.getByText(/Enterprise cap covers all cost centers/)).toBeInTheDocument()
  })

  it('shows cost center budget total when excludeCostCenters is true', () => {
    render(<SpendingSummaryCard {...baseProps} excludeCostCenters={true} />)
    expect(screen.getByText(/Cost center budgets \(additive\)/)).toBeInTheDocument()
    expect(screen.getByText('$2,000+')).toBeInTheDocument()
  })

  it('shows sub-limit label when excludeCostCenters is false and ccBudgetTotal > 0', () => {
    render(<SpendingSummaryCard {...baseProps} excludeCostCenters={false} ccBudgetTotal={2000} />)
    expect(screen.getByText(/Cost center budgets \(sub-limits\)/)).toBeInTheDocument()
  })
})
