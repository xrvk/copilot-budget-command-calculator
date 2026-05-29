import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

describe('Main content area min-height', () => {
  it('App.tsx <main> element has a min-h class to prevent tab jump on short pages', () => {
    const source = readFileSync(resolve(__dirname, '../App.tsx'), 'utf-8')

    // The <main> tag must include a min-h-* class so that short tabs
    // (e.g. Promo Optimizer) still fill the viewport and keep the
    // sticky tab bar from jumping when switching tabs.
    const mainTagMatch = source.match(/<main\b[^>]*className="([^"]*)"/)
    expect(mainTagMatch).not.toBeNull()

    const className = mainTagMatch![1]
    expect(className).toMatch(/\bmin-h-/)
  })
})
