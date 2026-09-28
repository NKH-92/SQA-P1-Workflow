import { describe, expect, it } from 'vitest'
import { UserFacingError } from '../../../lib/errors'
import { MASTER_STALE_MESSAGE } from '../../../data/validation/masterOcc'
import { isMasterStaleError } from './masterStale'

describe('isMasterStaleError', () => {
  it('matches only the shared master stale user-facing error', () => {
    expect(isMasterStaleError(new UserFacingError(MASTER_STALE_MESSAGE))).toBe(true)
    expect(isMasterStaleError(new UserFacingError('변경 사유를 입력해 주세요.'))).toBe(false)
    expect(isMasterStaleError(new Error(MASTER_STALE_MESSAGE))).toBe(false)
    expect(isMasterStaleError(null)).toBe(false)
  })
})
