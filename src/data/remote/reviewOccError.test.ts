import { describe, expect, it } from 'vitest'
import { REVIEW_STALE_MESSAGE, translateReviewOccError } from './reviewOccError'
import { UserFacingError } from '../../lib/errors'

describe('translateReviewOccError', () => {
  it('maps review OCC conflict text to the Korean stale message', () => {
    const translated = translateReviewOccError({ message: 'review changed since it was opened' })
    expect(translated).toBeInstanceOf(UserFacingError)
    expect(translated.message).toBe(REVIEW_STALE_MESSAGE)
  })

  it('leaves unrelated errors untouched', () => {
    const original = { message: 'active leader required' }
    expect(translateReviewOccError(original)).toBe(original)
  })
})
