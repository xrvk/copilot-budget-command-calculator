/**
 * Integration test: CSV normalization for the April 2026 backfill window.
 *
 * Uses real-world-shaped rows (from avocado enterprise sample) mixed with
 * synthetic backfill-window rows covering all normalization paths.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseUsageCsv, normalizeUsageCsvRow } from '@/lib/chargeback'

const HEADER = [
  'date', 'username', 'product', 'sku', 'model', 'quantity', 'unit_type',
  'applied_cost_per_quantity', 'gross_amount', 'discount_amount', 'net_amount',
  'total_monthly_quota', 'organization', 'cost_center_name', 'aic_quantity', 'aic_gross_amount',
].map(h => `"${h}"`).join(',')

function row(fields: string[]): string {
  return fields.map(f => `"${f}"`).join(',')
}

// ---------- End-to-end through parseUsageCsv ----------

describe('CSV normalization — end-to-end', () => {
  const csv = [
    HEADER,
    // Clean March rows (pass through)
    row(['2026-03-01', 'some-natalie', 'copilot', 'coding_agent_premium_request', 'Coding Agent model', '2', 'requests', '0.04', '0.08', '0.08', '0', '1000', 'larger-runner-demo', '', '8.68986', '0.08689859999999999']),
    row(['2026-03-02', 'KittyChiu', 'copilot', 'copilot_premium_request', 'Claude Opus 4.6', '24', 'requests', '0.04', '0.96', '0.96', '0', '1000', 'github', '', '12.3146', '0.123146']),
    // April backfill: invalid duplicate (quantity=0, quota=300) → DROPPED
    row(['2026-04-25', 'mona', 'copilot', 'copilot_premium_request', 'GPT-5.3', '0', 'requests', '0.04', '0', '0', '0', '300', 'my-org', '', '3.5', '0.035']),
    // April backfill: doubled request row (quota=0) → AIC HALVED
    row(['2026-04-25', 'mona', 'copilot', 'copilot_premium_request', 'Claude Sonnet 4.5', '12', 'requests', '0.04', '0.48', '0', '0.48', '0', 'my-org', '', '120', '1.20']),
    // April backfill: ai-credit row (quota=0) → UNCHANGED
    row(['2026-04-28', 'mona', 'copilot', 'copilot_ai_credit', 'Claude Sonnet 4.5', '50', 'ai-credits', '0.01', '0.50', '0', '0.50', '0', 'my-org', '', '50', '0.50']),
    // Post-window row → UNCHANGED
    row(['2026-05-01', 'KittyChiu', 'copilot', 'copilot_premium_request', 'Claude Sonnet 4.5', '8', 'requests', '0.04', '0.32', '0', '0.32', '0', 'github', '', '80', '0.80']),
  ].join('\n')

  it('parses without errors', () => {
    const result = parseUsageCsv(csv)
    expect(result.errors).toEqual([])
  })

  it('drops the invalid duplicate and aggregates correctly', () => {
    const result = parseUsageCsv(csv)
    expect(result.users).toHaveLength(3) // some-natalie, KittyChiu, mona
  })

  it('halves mona doubled AIC values and adds ai-credit row unchanged', () => {
    const result = parseUsageCsv(csv)
    const mona = result.users.find(u => u.login === 'mona')!
    // Halved request: 120 * 0.5 = 60 AICs, $1.20 * 0.5 = $0.60
    // AI-credit unchanged: 50 AICs, $0.50
    expect(mona.totalAICs).toBeCloseTo(110, 4)
    expect(mona.grossAmount).toBeCloseTo(1.1, 4)
  })

  it('passes March and May rows through unchanged', () => {
    const result = parseUsageCsv(csv)
    const kitty = result.users.find(u => u.login === 'KittyChiu')!
    expect(kitty.totalAICs).toBeCloseTo(12.3146 + 80, 4)
    expect(kitty.grossAmount).toBeCloseTo(0.123146 + 0.80, 4)

    const natalie = result.users.find(u => u.login === 'some-natalie')!
    expect(natalie.totalAICs).toBeCloseTo(8.68986, 4)
  })

  it('reports correct date range spanning all non-dropped rows', () => {
    const result = parseUsageCsv(csv)
    expect(result.dateRange).toEqual({ earliest: '2026-03-01', latest: '2026-05-01' })
  })

  it('reports normalization stats (1 dropped, 1 modified)', () => {
    const result = parseUsageCsv(csv)
    expect(result.normalizedRowsDropped).toBe(1)
    expect(result.normalizedRowsModified).toBe(1)
  })
})

// ---------- Unit-level normalizeUsageCsvRow ----------

describe('normalizeUsageCsvRow — unit', () => {
  const base: Record<string, string> = {
    date: '2026-04-25', username: 'mona', quantity: '10', unit_type: 'requests',
    total_monthly_quota: '0', aic_quantity: '100', aic_gross_amount: '1.00',
    gross_amount: '0.40', discount_amount: '0', net_amount: '0.40',
  }

  it('returns same reference for rows before the window', () => {
    const r = { ...base, date: '2026-04-23' }
    expect(normalizeUsageCsvRow(r)).toBe(r)
  })

  it('returns same reference for rows after the window', () => {
    const r = { ...base, date: '2026-05-01' }
    expect(normalizeUsageCsvRow(r)).toBe(r)
  })

  it('returns null for invalid duplicate (quantity=0, quota≠0)', () => {
    expect(normalizeUsageCsvRow({ ...base, quantity: '0', total_monthly_quota: '300' })).toBeNull()
  })

  it('halves AIC and zeros amounts for doubled request rows', () => {
    const result = normalizeUsageCsvRow({ ...base })!
    expect(result).not.toBeNull()
    expect(result.aic_quantity).toBe('50')
    expect(result.aic_gross_amount).toBe('0.5')
    expect(result.quantity).toBe('0')
    expect(result.gross_amount).toBe('0')
    expect(result.discount_amount).toBe('0')
    expect(result.net_amount).toBe('0')
  })

  it('returns same reference for ai-credit rows in the window', () => {
    const r = { ...base, unit_type: 'ai-credits' }
    expect(normalizeUsageCsvRow(r)).toBe(r)
  })

  it('returns same reference for non-impacted rows in window (qty≠0, quota≠0)', () => {
    const r = { ...base, total_monthly_quota: '300' }
    expect(normalizeUsageCsvRow(r)).toBe(r)
  })

  it('handles edge dates at window boundaries', () => {
    // Start of window
    const startRow = { ...base, date: '2026-04-24', quantity: '0', total_monthly_quota: '300' }
    expect(normalizeUsageCsvRow(startRow)).toBeNull()

    // End of window
    const endRow = { ...base, date: '2026-04-30', quantity: '0', total_monthly_quota: '300' }
    expect(normalizeUsageCsvRow(endRow)).toBeNull()

    // Day after window
    const afterRow = { ...base, date: '2026-05-01', quantity: '0', total_monthly_quota: '300' }
    expect(normalizeUsageCsvRow(afterRow)).toBe(afterRow)
  })

  it('handles ISO timestamps by extracting the date portion', () => {
    const tsRow = { ...base, date: '2026-04-25T12:00:00Z', quantity: '0', total_monthly_quota: '300' }
    expect(normalizeUsageCsvRow(tsRow)).toBeNull() // still in window after .slice(0,10)
  })
})

// ---------- Real-world CSV (no backfill rows — nothing should change) ----------

describe('CSV normalization — real-world CSV with no backfill rows', () => {
  const csvText = readFileSync(join(__dirname, 'fixtures/avocado-march.csv'), 'utf-8')

  it('parses without errors', () => {
    const result = parseUsageCsv(csvText)
    expect(result.errors).toEqual([])
  })

  it('preserves all 166 data rows (none dropped)', () => {
    const result = parseUsageCsv(csvText)
    expect(result.rowCount).toBe(166)
  })

  it('finds all 23 unique users', () => {
    const result = parseUsageCsv(csvText)
    expect(result.users).toHaveLength(23)
  })

  it('reports correct March date range', () => {
    const result = parseUsageCsv(csvText)
    expect(result.dateRange?.earliest).toBe('2026-03-01')
    expect(result.dateRange?.latest).toBe('2026-03-31')
  })

  it('produces non-zero AIC totals', () => {
    const result = parseUsageCsv(csvText)
    expect(result.totalGrossAmount).toBeGreaterThan(0)
    const totalAICs = result.users.reduce((sum, u) => sum + u.totalAICs, 0)
    expect(totalAICs).toBeGreaterThan(0)
  })

  it('matches totals of a raw parse (normalization is a no-op)', () => {
    const result = parseUsageCsv(csvText)
    // For a March-only CSV, normalization should not drop or modify any rows
    expect(result.normalizedRowsDropped).toBe(0)
    expect(result.normalizedRowsModified).toBe(0)
  })
})
