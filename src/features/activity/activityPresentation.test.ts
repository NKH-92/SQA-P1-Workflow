import { describe, expect, it } from 'vitest'
import {
  activityActionLabel,
  activityEntityLabel,
  auditFieldLabel,
  auditSourceLabel,
  toHaeyoSummary,
} from './activityPresentation'

describe('toHaeyoSummary', () => {
  it('turns past-tense 합니다체 endings with a ㅆ batchim into 해요체', () => {
    expect(toHaeyoSummary('파트원 A님이 “정산” 검토를 요청했습니다.')).toBe('파트원 A님이 “정산” 검토를 요청했어요.')
    expect(toHaeyoSummary('파트장이 피드백을 남겼습니다.')).toBe('파트장이 피드백을 남겼어요.')
    expect(toHaeyoSummary('자사제품 B 변경 적용업무를 다시 열었습니다.')).toBe('자사제품 B 변경 적용업무를 다시 열었어요.')
    expect(toHaeyoSummary('담당자를 파트원 B님으로 이관했습니다.')).toBe('담당자를 파트원 B님으로 이관했어요.')
  })

  it('contracts 되었습니다 to 됐어요 instead of 되었어요', () => {
    expect(toHaeyoSummary('CC-2026-014 변경건의 보관이 자동 해제되었습니다.')).toBe('CC-2026-014 변경건의 보관이 자동 해제됐어요.')
    expect(toHaeyoSummary('모든 제품 처리가 끝나 자동 보관되었습니다.')).toBe('모든 제품 처리가 끝나 자동 보관됐어요.')
  })

  it('handles the other safe endings', () => {
    expect(toHaeyoSummary('남은 업무가 없습니다.')).toBe('남은 업무가 없어요.')
    expect(toHaeyoSummary('확인이 필요합니다.')).toBe('확인이 필요해요.')
    expect(toHaeyoSummary('다음 로그인부터 적용됩니다.')).toBe('다음 로그인부터 적용돼요.')
    expect(toHaeyoSummary('남은 업무는 3건입니다.')).toBe('남은 업무는 3건이에요.')
    expect(toHaeyoSummary('이번이 마지막 단계입니다.')).toBe('이번이 마지막 단계예요.')
  })

  it('converts every sentence and keeps text without a sentence ending', () => {
    expect(toHaeyoSummary('A를 등록했습니다. B를 배정했습니다')).toBe('A를 등록했어요. B를 배정했어요')
    expect(toHaeyoSummary('등록했습니다만 확인이 더 필요해요.')).toBe('등록했습니다만 확인이 더 필요해요.')
  })

  it('leaves endings it cannot conjugate safely and text that is already 해요체', () => {
    expect(toHaeyoSummary('결과가 좋습니다.')).toBe('결과가 좋습니다.')
    expect(toHaeyoSummary('회의실로 갑니다.')).toBe('회의실로 갑니다.')
    expect(toHaeyoSummary('‘정산 자동화’ 프로젝트를 만들었어요.')).toBe('‘정산 자동화’ 프로젝트를 만들었어요.')
    expect(toHaeyoSummary('')).toBe('')
  })
})

describe('activity labels', () => {
  it('maps stored codes to Korean labels', () => {
    expect(activityActionLabel('final_completion_undone')).toBe('완료 취소')
    expect(activityActionLabel('created')).toBe('등록')
    expect(activityEntityLabel('product_change_task')).toBe('적용 업무')
    expect(activityEntityLabel('review_request')).toBe('검토요청')
    expect(auditSourceLabel('update_product_if_current')).toBe('제품 정보 수정')
    expect(auditFieldLabel('unassigned_reason')).toBe('담당자가 없는 이유')
  })

  it('never falls back to the raw code', () => {
    expect(activityActionLabel('some_new_action')).toBe('기타 활동')
    expect(activityEntityLabel('some_table')).toBe('기타 항목')
    expect(auditSourceLabel('some_rpc_name')).toBe('기타 처리')
    expect(auditFieldLabel('some_column')).toBe('기타 항목')
  })
})
