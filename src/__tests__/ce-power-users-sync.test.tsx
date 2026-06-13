import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { PlainWrapper } from './test-utils'
import BudgetCalculator from '../components/BudgetCalculator'

describe('CE → power users auto-sync', () => {
  it('updates power users when CE licenses change and power users not manually set', () => {
    render(<BudgetCalculator />, { wrapper: PlainWrapper })

    const ceInput = screen.getByLabelText(/Total Copilot Enterprise Licenses/i) as HTMLInputElement

    // Change CE to 25
    fireEvent.change(ceInput, { target: { value: '25' } })
    fireEvent.blur(ceInput)

    // The power users input should have auto-updated to 25
    const powerInput = screen.getByLabelText(/# of Power Users/i) as HTMLInputElement
    expect(powerInput.value).toBe('25')
  })

  it('does not override power users when manually set to a higher value', () => {
    render(<BudgetCalculator />, { wrapper: PlainWrapper })

    // First manually set power users to 50
    const powerInput = screen.getByLabelText(/# of Power Users/i) as HTMLInputElement
    fireEvent.change(powerInput, { target: { value: '50' } })
    fireEvent.blur(powerInput)
    expect(powerInput.value).toBe('50')

    // Now change CE to 20 — should NOT override power users (50 > 20 and manually set)
    const ceInput = screen.getByLabelText(/Total Copilot Enterprise Licenses/i) as HTMLInputElement
    fireEvent.change(ceInput, { target: { value: '20' } })
    fireEvent.blur(ceInput)

    expect(powerInput.value).toBe('50')
  })

  it('updates power users when CE exceeds manually set value', () => {
    render(<BudgetCalculator />, { wrapper: PlainWrapper })

    // Manually set power users to 5
    const powerInput = screen.getByLabelText(/# of Power Users/i) as HTMLInputElement
    fireEvent.change(powerInput, { target: { value: '5' } })
    fireEvent.blur(powerInput)
    expect(powerInput.value).toBe('5')

    // Change CE to 30 — should update power users since 5 < 30
    const ceInput = screen.getByLabelText(/Total Copilot Enterprise Licenses/i) as HTMLInputElement
    fireEvent.change(ceInput, { target: { value: '30' } })
    fireEvent.blur(ceInput)

    expect(powerInput.value).toBe('30')
  })
})
