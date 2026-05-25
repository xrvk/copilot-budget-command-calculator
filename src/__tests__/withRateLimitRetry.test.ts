import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { withRateLimitRetry, ApiError } from '@/lib/api'

describe('withRateLimitRetry', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  it('returns the result on success', async () => {
    const result = await withRateLimitRetry(() => Promise.resolve(42))
    expect(result).toBe(42)
  })

  it('rethrows non-429 errors immediately', async () => {
    const err = new ApiError('Not found', 404)
    await expect(withRateLimitRetry(() => Promise.reject(err))).rejects.toThrow('Not found')
  })

  it('rethrows non-ApiError errors immediately', async () => {
    await expect(withRateLimitRetry(() => Promise.reject(new Error('network')))).rejects.toThrow('network')
  })

  it('retries on 429 and succeeds on second attempt', async () => {
    let calls = 0
    const fn = () => {
      calls++
      if (calls === 1) return Promise.reject(new ApiError('rate limited', 429))
      return Promise.resolve('ok')
    }
    const promise = withRateLimitRetry(fn, { maxRetries: 2, onWaiting: vi.fn() })
    // Advance past the 60s wait
    await vi.advanceTimersByTimeAsync(60_000)
    const result = await promise
    expect(result).toBe('ok')
    expect(calls).toBe(2)
  })

  it('stops retrying after maxRetries', async () => {
    vi.useRealTimers() // avoid fake timer complications with multiple rejections
    let calls = 0
    const fn = () => {
      calls++
      return Promise.reject(new ApiError('rate limited', 429))
    }
    // Use a very short retry by mocking setTimeout
    const origSetTimeout = globalThis.setTimeout
    globalThis.setTimeout = ((fn: () => void) => origSetTimeout(fn, 0)) as typeof globalThis.setTimeout
    try {
      await withRateLimitRetry(fn, { maxRetries: 1, onWaiting: vi.fn() })
      expect.unreachable('should have thrown')
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError)
      expect((err as ApiError).status).toBe(429)
    } finally {
      globalThis.setTimeout = origSetTimeout
    }
    expect(calls).toBe(2) // initial + 1 retry
  })

  it('calls onWaiting with wait seconds', async () => {
    const onWaiting = vi.fn()
    let calls = 0
    const fn = () => {
      calls++
      if (calls === 1) return Promise.reject(new ApiError('rate limited', 429))
      return Promise.resolve('ok')
    }
    const promise = withRateLimitRetry(fn, { maxRetries: 2, onWaiting })
    await vi.advanceTimersByTimeAsync(60_000)
    await promise
    expect(onWaiting).toHaveBeenCalledWith(60)
  })
})
