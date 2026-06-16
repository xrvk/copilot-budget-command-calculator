import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PlainWrapper as Wrapper } from './test-utils'

import BudgetPlanner from '../components/BudgetPlanner'
import BudgetCalculator from '../components/BudgetCalculator'
import PromoAicOptimizer from '../components/PromoAicOptimizer'
import ApiTools from '../components/ApiTools'
import Tips from '../components/Tips'

async function getPromoSwitch(user: ReturnType<typeof userEvent.setup>) {
  const advancedToggle = screen.getByRole('button', { name: /Advanced settings/i })
  if (advancedToggle.getAttribute('aria-expanded') !== 'true') {
    await user.click(advancedToggle)
  }
  // Switch order in Tier Planner: [Budget Lock, Promotional Pricing, Billing Cycle]
  return screen.getAllByRole('switch')[1]
}

describe('Tab smoke tests', () => {
  it.each([
    { name: 'BudgetPlanner', Component: BudgetPlanner, props: {}, expectedTitle: 'Budget Planner' },
    { name: 'BudgetCalculator', Component: BudgetCalculator, props: {}, expectedTitle: 'Tier Planner' },
    { name: 'PromoAicOptimizer', Component: PromoAicOptimizer, props: {} },
    { name: 'ApiTools', Component: ApiTools, props: { onScriptChange: () => {} } },
    { name: 'Tips', Component: Tips, props: {} },
  ])('$name renders without crashing', ({ Component, props, expectedTitle }) => {
    const { container } = render(<Component {...props} />, { wrapper: Wrapper })
    if (expectedTitle) {
      expect(container.querySelector('h2')?.textContent).toBe(expectedTitle)
    } else {
      expect(container.innerHTML.length).toBeGreaterThan(0)
    }
  })

  it('promo toggle resets ULB and power budget to match pricing period', async () => {
    const user = userEvent.setup()
    render(<BudgetCalculator />, { wrapper: Wrapper })

    // Default is promotional pricing with ULB = $30 (promo entitlement floor), power budget = $70
    const ulbInput = screen.getByLabelText<HTMLInputElement>(/Universal user-level budget/i)
    const powerInput = screen.getByLabelText<HTMLInputElement>(/Individual User-Level Budget/i)
    expect(ulbInput.value).toBe('30')
    expect(powerInput.value).toBe('70')

    // Toggle promo off — ULB → $19 (standard floor), power → $39 (CE standard floor)
    const promoSwitch = await getPromoSwitch(user)
    await user.click(promoSwitch)
    expect(ulbInput.value).toBe('19')
    expect(powerInput.value).toBe('39')

    // Toggle promo back on — ULB → $30, power → $70
    await user.click(promoSwitch)
    expect(ulbInput.value).toBe('30')
    expect(powerInput.value).toBe('70')
  })

  it('promo toggle preserves ULB after manual edit', async () => {
    const user = userEvent.setup()
    render(<BudgetCalculator />, { wrapper: Wrapper })

    const ulbInput = screen.getByLabelText<HTMLInputElement>(/Universal user-level budget/i)

    // Manually change ULB to a custom value
    await user.clear(ulbInput)
    await user.type(ulbInput, '50')
    expect(Number(ulbInput.value)).toBe(50)

    // Toggle promo off — should preserve the manual value
    const promoSwitch = await getPromoSwitch(user)
    await user.click(promoSwitch)
    expect(ulbInput.value).toBe('50')
  })

  it('promo toggle preserves power user budget after manual edit', async () => {
    const user = userEvent.setup()
    render(<BudgetCalculator />, { wrapper: Wrapper })

    const powerInput = screen.getByLabelText<HTMLInputElement>(/Individual User-Level Budget/i)

    // Manually change power budget to a custom value
    await user.clear(powerInput)
    await user.type(powerInput, '120')
    expect(Number(powerInput.value)).toBe(120)

    // Toggle promo off then on — should preserve the manual value both times
    const promoSwitch = await getPromoSwitch(user)
    await user.click(promoSwitch)
    expect(powerInput.value).toBe('120')
    await user.click(promoSwitch)
    expect(powerInput.value).toBe('120')
  })

  it('promo toggle preserves all license inputs (CB, CE, power users)', async () => {
    const user = userEvent.setup()
    render(<BudgetCalculator />, { wrapper: Wrapper })

    const cbInput = screen.getByLabelText<HTMLInputElement>(/Copilot Business/i)
    const ceInput = screen.getByLabelText<HTMLInputElement>(/Copilot Enterprise/i)
    const puInput = screen.getByLabelText<HTMLInputElement>(/# of Power Users/i)

    // Set custom values
    await user.clear(cbInput)
    await user.type(cbInput, '200')
    await user.clear(ceInput)
    await user.type(ceInput, '25')
    await user.clear(puInput)
    await user.type(puInput, '15')

    // Toggle promo off — license counts must not change
    const promoSwitch = await getPromoSwitch(user)
    await user.click(promoSwitch)
    expect(Number(cbInput.value)).toBe(200)
    expect(Number(ceInput.value)).toBe(25)
    expect(Number(puInput.value)).toBe(15)
  })

  it('clearing universal ULB resets to initial value on blur', async () => {
    const user = userEvent.setup()
    render(<BudgetCalculator />, { wrapper: Wrapper })

    const ulbInput = screen.getByLabelText<HTMLInputElement>(/Universal user-level budget/i)
    expect(ulbInput.value).toBe('30')

    await user.clear(ulbInput)
    expect(ulbInput.value).toBe('')

    await user.tab()
    expect(ulbInput.value).toBe('30')
  })
})
