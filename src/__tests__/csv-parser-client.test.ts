import { describe, it, expect } from 'vitest'
import { parseCsvAsync } from '../lib/csv-parser-client'

const SAMPLE_CSV =
  'username,aic_quantity,aic_gross_amount,net_amount,date\n' +
  'alice,100,1.00,0,2026-04-01\n' +
  'bob,250,2.50,0.50,2026-04-02\n'

describe('parseCsvAsync', () => {
  it('returns the same shape as parseUsageCsv (worker or fallback)', async () => {
    const result = await parseCsvAsync(SAMPLE_CSV)
    expect(result.errors).toEqual([])
    expect(result.users).toHaveLength(2)
    expect(result.users.find(u => u.login === 'alice')?.totalAICs).toBe(100)
    expect(result.users.find(u => u.login === 'bob')?.totalAICs).toBe(250)
    expect(result.totalGrossAmount).toBeCloseTo(3.5)
    expect(result.rowCount).toBe(2)
  })

  it('reports CSV parse errors via the result, not by throwing', async () => {
    const badCsv = 'wrong_column\nfoo\n'
    const result = await parseCsvAsync(badCsv)
    expect(result.errors.length).toBeGreaterThan(0)
  })

  it('handles an empty body without throwing', async () => {
    const result = await parseCsvAsync('')
    expect(result.errors.length).toBeGreaterThan(0)
    expect(result.users).toEqual([])
  })
})
