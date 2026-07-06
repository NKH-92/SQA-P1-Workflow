import { describe, expect, it } from 'vitest'
import { UserFacingError } from '../../lib/errors'
import {
  assertCanReject,
  assertReviewStatusTransition,
  assertStorageAttachmentOnly,
} from './review.validators'

describe('review.validators', () => {
  it('allows null or empty attachment', () => {
    expect(assertStorageAttachmentOnly(null)).toBeNull()
    expect(assertStorageAttachmentOnly('')).toBeNull()
  })

  it('allows storage attachments only', () => {
    const url = 'storage://review-attachments/user-id/file.pdf'
    expect(assertStorageAttachmentOnly(url)).toBe(url)
  })

  it('rejects external http attachment URLs', () => {
    expect(() => assertStorageAttachmentOnly('https://example.com/doc.pdf')).toThrow(UserFacingError)
  })

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
