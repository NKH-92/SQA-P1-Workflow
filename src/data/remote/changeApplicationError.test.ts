import { describe, expect, it } from 'vitest'
import { UserFacingError } from '../../lib/errors'
import { CHANGE_APPLICATION_STALE_MESSAGE } from '../validation/changeApplications'
import { translateChangeApplicationError } from './changeApplicationError'

describe('translateChangeApplicationError', () => {
  it.each([
    'SQA_ACTIVE_LEADER_REQUIRED',
    'SQA_CHANGE_ACTIVE_ASSIGNEE_REQUIRED',
    'SQA_CHANGE_PROXY_COMPLETION_FORBIDDEN',
    'SQA_CHANGE_ASSIGNEE_REQUIRED',
    'SQA_CHANGE_NOT_APPLICABLE_REASON_REQUIRED',
    'SQA_CHANGE_FINAL_NOTE_REQUIRED',
    'SQA_CHANGE_PENDING_TASKS',
    'SQA_CHANGE_REOPEN_TASKS_INVALID',
    'SQA_CHANGE_UNDO_REASON_REQUIRED',
  ])('maps stable server marker %s from PostgREST details', (marker) => {
    const original = { message: 'change application request rejected', details: marker }
    const translated = translateChangeApplicationError(original)

    expect(translated).toBeInstanceOf(UserFacingError)
    expect(translated).not.toBe(original)
    expect(translated.message).not.toContain(marker)
  })

  it.each([
    { message: 'change application was modified by another user' },
    { message: 'request rejected', details: 'SQA_CHANGE_APPLICATION_CONFLICT' },
  ])('maps OCC conflicts to the shared stale message', (error) => {
    const translated = translateChangeApplicationError(error)

    expect(translated).toBeInstanceOf(UserFacingError)
    expect(translated.message).toBe(CHANGE_APPLICATION_STALE_MESSAGE)
  })

  it('leaves an unrelated server error untouched', () => {
    const original = { message: 'database unavailable', details: 'unexpected failure' }
    expect(translateChangeApplicationError(original)).toBe(original)
  })
})
