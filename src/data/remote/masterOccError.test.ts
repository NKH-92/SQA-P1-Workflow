import { describe, expect, it } from 'vitest'
import { UserFacingError } from '../../lib/errors'
import { MASTER_STALE_MESSAGE } from '../validation/masterOcc'
import {
  ACCOUNT_ACTIVE_DELETE_MESSAGE,
  ACCOUNT_EMAIL_LOCKED_MESSAGE,
  ACCOUNT_LIST_ROW_REQUIRED_MESSAGE,
  translateMasterOccError,
} from './masterOccError'

describe('translateMasterOccError', () => {
  it('maps the stale-write text to the shared master stale message', () => {
    const translated = translateMasterOccError({ message: 'master record changed since it was opened', details: 'SQA_MASTER_STALE' })
    expect(translated).toBeInstanceOf(UserFacingError)
    expect(translated.message).toBe(MASTER_STALE_MESSAGE)
  })

  it('tells the leader to deactivate first when a signed-up account row is deleted', () => {
    const translated = translateMasterOccError({ message: 'account is still active', details: 'SQA_ACCOUNT_ACTIVE' })
    expect(translated).toBeInstanceOf(UserFacingError)
    expect(translated.message).toBe(ACCOUNT_ACTIVE_DELETE_MESSAGE)
    expect(translated.message).toBe('가입한 계정은 목록에서 지울 수 없어요. 먼저 비활성화해 주세요.')
  })

  it('explains that a signed-up account email cannot change', () => {
    const translated = translateMasterOccError({ message: 'linked account email cannot change', details: 'SQA_ACCOUNT_EMAIL_LOCKED' })
    expect(translated).toBeInstanceOf(UserFacingError)
    expect(translated.message).toBe(ACCOUNT_EMAIL_LOCKED_MESSAGE)
    expect(translated.message).toBe('가입한 계정의 이메일은 바꿀 수 없어요.')
  })

  it('explains that an account removed from the list cannot be activated again', () => {
    const translated = translateMasterOccError({ message: 'account list row is required to activate', details: 'SQA_ACCOUNT_LIST_ROW_REQUIRED' })
    expect(translated).toBeInstanceOf(UserFacingError)
    expect(translated.message).toBe(ACCOUNT_LIST_ROW_REQUIRED_MESSAGE)
    expect(translateMasterOccError({ message: 'account list row is required to activate' }).message)
      .toBe(ACCOUNT_LIST_ROW_REQUIRED_MESSAGE)
  })

  it('also recognizes the account codes when they appear in the message text', () => {
    expect(translateMasterOccError({ message: 'SQA_ACCOUNT_ACTIVE' }).message).toBe(ACCOUNT_ACTIVE_DELETE_MESSAGE)
    expect(translateMasterOccError({ message: 'SQA_ACCOUNT_EMAIL_LOCKED' }).message).toBe(ACCOUNT_EMAIL_LOCKED_MESSAGE)
  })

  it('recognizes the server guard messages even without details', () => {
    expect(translateMasterOccError({ message: 'active account must be deactivated before deletion' }).message)
      .toBe(ACCOUNT_ACTIVE_DELETE_MESSAGE)
    expect(translateMasterOccError({ message: 'linked account email cannot be changed' }).message)
      .toBe(ACCOUNT_EMAIL_LOCKED_MESSAGE)
  })

  it('leaves unrelated errors untouched', () => {
    const original = { message: 'permission denied', details: '' }
    expect(translateMasterOccError(original)).toBe(original)
  })
})
