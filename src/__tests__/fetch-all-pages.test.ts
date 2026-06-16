import { describe, it, expect, vi } from 'vitest'
import { fetchAllPages } from '../hooks/use-promo-seat-data'

function mockApiFetch(pages: Record<number, unknown>) {
  return vi.fn(async (path: string) => {
    const url = new URL(path, 'https://api.github.com')
    const page = parseInt(url.searchParams.get('page') ?? '1', 10)
    const data = pages[page]
    if (!data) return new Response(JSON.stringify({ message: 'Not Found' }), { status: 404 })
    return new Response(JSON.stringify(data), { status: 200 })
  })
}

describe('fetchAllPages', () => {
  it('fetches a single page when items < 100', async () => {
    const apiFetch = mockApiFetch({
      1: { users: [{ login: 'a' }, { login: 'b' }], total_seats_purchased: 10, total_seats_consumed: 5 },
    })
    const result = await fetchAllPages<{ login: string }>(apiFetch, '/enterprises/test/consumed-licenses', 'users')
    expect(result.items).toHaveLength(2)
    expect(result.meta.total_seats_purchased).toBe(10)
    expect(apiFetch).toHaveBeenCalledTimes(1)
  })

  it('paginates when items === 100', async () => {
    const page1Items = Array.from({ length: 100 }, (_, i) => ({ login: `user-${i}` }))
    const page2Items = [{ login: 'user-100' }, { login: 'user-101' }]
    const apiFetch = mockApiFetch({
      1: { users: page1Items, total_seats_purchased: 200 },
      2: { users: page2Items },
    })
    const result = await fetchAllPages<{ login: string }>(apiFetch, '/enterprises/test/consumed-licenses', 'users')
    expect(result.items).toHaveLength(102)
    expect(apiFetch).toHaveBeenCalledTimes(2)
  })

  it('captures meta only from first page', async () => {
    const apiFetch = mockApiFetch({
      1: { seats: [{ id: 1 }], total_seats: 42 },
    })
    const result = await fetchAllPages<{ id: number }>(apiFetch, '/enterprises/test/copilot/billing/seats', 'seats')
    expect(result.meta.total_seats).toBe(42)
    expect(result.items).toHaveLength(1)
  })

  it('throws on non-ok response with message', async () => {
    const apiFetch = vi.fn(async () =>
      new Response(JSON.stringify({ message: 'Bad credentials' }), { status: 401 })
    )
    await expect(
      fetchAllPages(apiFetch, '/enterprises/test/consumed-licenses', 'users')
    ).rejects.toThrow('Bad credentials')
  })

  it('throws with HTTP status when no message in body', async () => {
    const apiFetch = vi.fn(async () =>
      new Response('not json', { status: 500 })
    )
    await expect(
      fetchAllPages(apiFetch, '/enterprises/test/consumed-licenses', 'users')
    ).rejects.toThrow('HTTP 500')
  })

  it('handles missing itemsKey gracefully (empty array)', async () => {
    const apiFetch = mockApiFetch({
      1: { other_key: [1, 2, 3] },
    })
    const result = await fetchAllPages(apiFetch, '/enterprises/test/data', 'items')
    expect(result.items).toHaveLength(0)
  })

  it('appends query params correctly when basePath already has params', async () => {
    const apiFetch = mockApiFetch({
      1: { users: [{ login: 'a' }] },
    })
    await fetchAllPages(apiFetch, '/enterprises/test/data?state=active', 'users')
    expect(apiFetch).toHaveBeenCalledWith(
      expect.stringContaining('state=active&per_page=100&page=1')
    )
  })
})
