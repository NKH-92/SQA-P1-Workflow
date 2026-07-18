import { describe, expect, it } from 'vitest'
import { UserFacingError } from '../../lib/errors'
import {
  assertCanReject,
  assertReviewStatusTransition,
} from './review.validators'

describe('review.validators', () => {
  it('allows pending to approved transition', () => {
    expect(() => assertReviewStatusTransition('pending', 'approved')).not.toThrow()
  })

  it('blocks approved to pending transition', () => {
    expect(() => assertReviewStatusTransition('approved', 'pending')).toThrow(UserFacingError)
  })

  it('blocks approved to rejected direct transition', () => {
    expect(() => assertReviewStatusTransition('approved', 'rejected')).toThrow(UserFacingError)
  })

  it('blocks reject when not pending', () => {
    expect(() => assertCanReject('approved')).toThrow(UserFacingError)
    expect(() => assertCanReject('pending')).not.toThrow()
  })
})
