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

  // 최신 정의(20260731230646_change_application_final_approval 등)가 올리는 상태 전이 오류의 실제 모양
  it.each([
    ['change application is not active', 'SQA_CHANGE_APPLICATION_NOT_ACTIVE', '이미 취소했거나 완료·보관한 공통변경이에요. 목록을 새로고침해 주세요.'],
    ['cancelled change application cannot be edited', 'SQA_CHANGE_APPLICATION_CANCELLED', '이미 취소했거나 완료·보관한 공통변경이에요. 목록을 새로고침해 주세요.'],
    ['change application is already cancelled', 'SQA_CHANGE_APPLICATION_CANCELLED', '이미 취소했거나 완료·보관한 공통변경이에요. 목록을 새로고침해 주세요.'],
    ['completed change application cannot be edited', 'SQA_CHANGE_APPLICATION_ALREADY_FINAL', '이미 취소했거나 완료·보관한 공통변경이에요. 목록을 새로고침해 주세요.'],
    ['change application is already finalized or archived', 'SQA_CHANGE_APPLICATION_ALREADY_FINAL', '이미 취소했거나 완료·보관한 공통변경이에요. 목록을 새로고침해 주세요.'],
    ['change application is not published', 'SQA_CHANGE_APPLICATION_NOT_PUBLISHED', '아직 최종 완료할 수 없는 공통변경이에요.'],
    ['change application is not explicitly finalized', 'SQA_CHANGE_APPLICATION_NOT_FINAL', '아직 최종 완료하지 않은 공통변경이에요.'],
    ['published change application cannot return to draft', 'SQA_CHANGE_APPLICATION_NOT_DRAFT', '배포한 공통변경은 초안으로 되돌릴 수 없어요.'],
    ['change application not found', 'SQA_CHANGE_APPLICATION_NOT_FOUND', '공통변경을 찾지 못했어요. 목록을 새로고침해 주세요.'],
    ['finalized change requires completion undo', 'SQA_CHANGE_FINAL_UNDO_REQUIRED', '완료 이력은 [완료 취소]로 다시 열 수 있어요.'],
    ['product change task is not pending', 'SQA_CHANGE_TASK_NOT_PENDING', '다른 사람이 이미 처리한 업무예요. 목록을 새로고침해 주세요.'],
    ['only pending tasks can be cancelled', 'SQA_CHANGE_TASK_NOT_PENDING', '다른 사람이 이미 처리한 업무예요. 목록을 새로고침해 주세요.'],
    ['only pending tasks can leave scope', 'SQA_SCOPE_TASK_NOT_PENDING', '다른 사람이 이미 처리한 업무예요. 목록을 새로고침해 주세요.'],
    ['product change task cannot be reopened', 'SQA_CHANGE_TASK_NOT_REOPENABLE', '다른 사람이 이미 처리한 업무예요. 목록을 새로고침해 주세요.'],
    ['task cannot be reassigned in its current state', 'SQA_CHANGE_TASK_NOT_REASSIGNABLE', '지금 상태에서는 담당자를 바꿀 수 없어요. 목록을 새로고침해 주세요.'],
    ['product change task not found', 'SQA_CHANGE_TASK_NOT_FOUND', '적용 업무를 찾지 못했어요. 목록을 새로고침해 주세요.'],
    ['task is not scope removed', 'SQA_CHANGE_TASK_NOT_RESTORABLE', '범위에서 뺀 제품만 다시 넣을 수 있어요.'],
    ['change application is locked after processing started', 'SQA_CHANGE_CONTENT_LOCKED', '처리를 시작한 공통변경은 범위에 다시 넣을 수 없어요.'],
  ])('maps the server state error "%s" (%s) to a refresh guidance', (message, details, expected) => {
    const translated = translateChangeApplicationError({ code: 'P0001', details, hint: null, message })

    expect(translated).toBeInstanceOf(UserFacingError)
    expect(translated.message).toBe(expected)
  })

  it('does not treat the draft-save restore requirement as a scope restore race', () => {
    const original = {
      message: 'scope removed product task must be restored with a reason first',
      details: 'SQA_CHANGE_TASK_NOT_RESTORABLE',
    }
    expect(translateChangeApplicationError(original)).toBe(original)
  })

  it('leaves an unrelated server error untouched', () => {
    const original = { message: 'database unavailable', details: 'unexpected failure' }
    expect(translateChangeApplicationError(original)).toBe(original)
  })
})
