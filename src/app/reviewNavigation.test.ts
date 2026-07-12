import { describe, expect, it } from 'vitest'
import { shouldMarkReviewsSeen } from './reviewNavigation'

describe('shouldMarkReviewsSeen', () => {
  it('marks a repeated reviews navigation such as an alert click while the tab is already open', () => {
    expect(shouldMarkReviewsSeen('reviews', 'reviews')).toBe(true)
  })

  it('leaves first entry and unrelated navigation to the active-tab effect', () => {
    expect(shouldMarkReviewsSeen('dashboard', 'reviews')).toBe(false)
    expect(shouldMarkReviewsSeen('reviews', 'projects')).toBe(false)
  })
})
