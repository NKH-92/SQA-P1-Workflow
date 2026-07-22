import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const css = readFileSync('src/screens/ReviewStatsPanel.css', 'utf8')

describe('ReviewStatsPanel.css contract', () => {
  it('has an explicit 640px mobile layout for filters, presets, custom dates, and KPIs', () => {
    const mobileStart = css.indexOf('@media (max-width: 640px)')
    const nextBreakpoint = css.indexOf('@media (max-width: 390px)', mobileStart)
    expect(mobileStart).toBeGreaterThanOrEqual(0)
    expect(nextBreakpoint).toBeGreaterThan(mobileStart)

    const mobileCss = css.slice(mobileStart, nextBreakpoint)
    expect(mobileCss).toMatch(/\.review-stats-filter-grid\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\)/s)
    expect(mobileCss).toMatch(/\.review-stats-presets\s*\{[^}]*repeat\(2, minmax\(0, 1fr\)\)/s)
    expect(mobileCss).toMatch(/\.review-stats-custom-dates\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\)/s)
    expect(mobileCss).toMatch(/\.review-stats-kpi-grid\s*\{[^}]*repeat\(2, minmax\(0, 1fr\)\)/s)
  })

  it('uses shared Brand Operations tokens instead of introducing raw color values', () => {
    expect(css).not.toMatch(/#[0-9a-f]{3,8}\b/i)
    expect(css).not.toMatch(/\brgba?\(/i)
    expect(css).toContain('var(--paper-panel)')
    expect(css).toContain('var(--paper-border)')
    expect(css).toContain('var(--paper-accent)')
  })
})
