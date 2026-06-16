import { describe, it, expect } from 'vitest'
import { detectDrift } from '../lib/drift'

describe('detectDrift', () => {
  it('reports all clean when enabled is false', () => {
    const r = detectDrift({
      enabled: false,
      fields: [
        { key: 'a', local: 1, api: 2 },
        { key: 'b', local: 'x', api: 'y' },
      ],
    })
    expect(r.isDirty).toBe(false)
    expect(r.pendingCount).toBe(0)
    expect(r.dirtyKeys).toEqual([])
    expect(r.byKey).toEqual({ a: false, b: false })
  })

  it('reports clean when api value is null (unknown)', () => {
    const r = detectDrift({
      enabled: true,
      fields: [
        { key: 'a', local: 1, api: null },
      ],
    })
    expect(r.byKey.a).toBe(false)
    expect(r.pendingCount).toBe(0)
  })

  it('reports clean when local equals api', () => {
    const r = detectDrift({
      enabled: true,
      fields: [
        { key: 'a', local: 1, api: 1 },
        { key: 'b', local: 'foo', api: 'foo' },
        { key: 'c', local: false, api: false },
      ],
    })
    expect(r.isDirty).toBe(false)
    expect(r.pendingCount).toBe(0)
  })

  it('reports dirty when local differs from api', () => {
    const r = detectDrift({
      enabled: true,
      fields: [
        { key: 'a', local: 1, api: 2 },
        { key: 'b', local: 'foo', api: 'foo' },
        { key: 'c', local: true, api: false },
      ],
    })
    expect(r.isDirty).toBe(true)
    expect(r.pendingCount).toBe(2)
    expect(r.dirtyKeys).toEqual(['a', 'c'])
    expect(r.byKey).toEqual({ a: true, b: false, c: true })
  })

  it('respects per-field guard', () => {
    const r = detectDrift({
      enabled: true,
      fields: [
        // local!==api but guard is false → not dirty
        { key: 'a', local: 1, api: 2, guard: false },
        // local!==api and guard true → dirty
        { key: 'b', local: 1, api: 2, guard: true },
      ],
    })
    expect(r.byKey).toEqual({ a: false, b: true })
    expect(r.pendingCount).toBe(1)
  })

  it('uses custom equals comparator when provided', () => {
    const r = detectDrift({
      enabled: true,
      fields: [
        // 0.1 + 0.2 !== 0.3 by strict equality, but custom comparator says they match
        {
          key: 'a',
          local: 0.1 + 0.2,
          api: 0.3,
          equals: (a, b) => Math.abs((a as number) - (b as number)) < 1e-9,
        },
      ],
    })
    expect(r.byKey.a).toBe(false)
  })

  it('preserves dirty key order from input', () => {
    const r = detectDrift({
      enabled: true,
      fields: [
        { key: 'first', local: 1, api: 2 },
        { key: 'second', local: 1, api: 1 },
        { key: 'third', local: 1, api: 0 },
      ],
    })
    expect(r.dirtyKeys).toEqual(['first', 'third'])
  })

  it('treats undefined api the same as null', () => {
    const r = detectDrift({
      enabled: true,
      fields: [
        { key: 'a', local: 1, api: undefined as unknown as number | null },
      ],
    })
    expect(r.byKey.a).toBe(false)
  })

  it('handles an empty field list', () => {
    const r = detectDrift({ enabled: true, fields: [] })
    expect(r.isDirty).toBe(false)
    expect(r.pendingCount).toBe(0)
    expect(r.dirtyKeys).toEqual([])
  })
})
