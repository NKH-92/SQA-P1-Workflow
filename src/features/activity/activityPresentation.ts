import { josa } from '../../lib/korean'

/**
 * 활동 로그·변경 기록 화면에 내부 코드(review_request, final_completion_undone, update_product_if_current …)가
 * 그대로 보이지 않도록 사람이 읽는 말로 바꾼다(토스 UX 라이팅: 전문용어·원시값 금지).
 * 모르는 코드는 원문 대신 일반적인 말로 보여준다.
 */

export const activityActionLabels: Record<string, string> = {
  created: '등록',
  inserted: '등록',
  updated: '수정',
  deleted: '삭제',
  assigned: '배정',
  reassigned: '담당자 변경',
  reopened: '다시 열기',
  reopened_by_final_undo: '완료 취소로 다시 열기',
  status_changed: '상태 변경',
  approved: '승인',
  rejected: '반려',
  resubmitted: '재요청',
  withdrawn: '회수',
  voided: '피드백 무효화',
  cancelled: '취소',
  archived: '보관',
  auto_archived: '자동 보관',
  archive_restored_automatically: '자동 보관 해제',
  restored: '복원',
  scope_removed: '적용 범위에서 뺌',
  scope_restored: '적용 범위에 다시 넣음',
  completed: '적용 완료',
  not_applicable: '해당 없음',
  final_review_ready: '최종 확인 대기',
  final_completed: '최종 완료',
  final_completion_undone: '완료 취소',
  published: '배포',
  draft_saved: '초안 저장',
  password_reset: '비밀번호 초기화',
  reset_password: '비밀번호 초기화',
}

export const activityEntityLabels: Record<string, string> = {
  review_request: '검토요청',
  review_feedback: '피드백',
  project: '프로젝트',
  project_assignment: '프로젝트 담당',
  product_assignment: '제품 담당',
  duty_assignment: '업무 담당',
  allowed_user: '계정',
  profile: '계정 정보',
  profile_note: '관리 메모',
  product: '제품',
  duty: '업무',
  duty_major_category: '업무 대분류',
  change_application: '공통변경',
  change_action_item: '적용 항목',
  product_change_task: '적용 업무',
  announcement: '공지',
}

/** 변경 기록(감사 이력)의 출처: 어떤 처리로 값이 바뀌었는지 */
export const auditSourceLabels: Record<string, string> = {
  database: '직접 저장',
  legacy: '이전 방식 기록',
  project_update: '프로젝트 수정',
  create_review_request: '검토요청 보내기',
  update_review_request: '검토요청 수정',
  approve_review_request: '검토요청 승인',
  reject_review_request: '검토요청 반려',
  reopen_review_request: '검토요청 다시 열기',
  resubmit_review_request: '재요청',
  withdraw_review_request: '검토요청 회수',
  update_review_feedback: '피드백 수정',
  void_review_feedback: '피드백 무효화',
  review_retention_purge: '오래된 검토 정리',
  publish_change_application: '공통변경 배포',
  save_change_application_draft: '공통변경 초안 저장',
  archive_change_application: '공통변경 보관',
  restore_change_application: '공통변경 복원',
  cancel_change_application: '공통변경 취소',
  complete_change_application: '공통변경 최종 완료',
  undo_change_application_completion: '공통변경 완료 취소',
  complete_product_change_task: '적용 완료',
  mark_product_change_task_not_applicable: '해당 없음으로 처리',
  cancel_product_change_task: '적용 업무 취소',
  reopen_product_change_task: '적용 업무 다시 열기',
  reassign_product_change_tasks: '적용 업무 담당자 변경',
  remove_product_from_change_scope: '적용 범위에서 뺌',
  restore_product_change_scope: '적용 범위에 다시 넣음',
  assign_product_and_transfer_change_tasks: '제품 담당자 변경과 업무 넘기기',
  replace_product_assignments_if_current: '제품 담당자 변경',
  replace_duty_assignments_if_current: '업무 담당자 변경',
  update_product_if_current: '제품 정보 수정',
  update_duty_if_current: '업무 정보 수정',
  update_duty_major_category_if_current: '업무 대분류 수정',
  update_allowed_user_if_current: '계정 정보 수정',
  set_profile_active_if_current: '계정 활성 상태 변경',
  set_profile_role_if_current: '역할 변경',
}

/** 변경 기록에 남는 업무 항목 이름(서버 감사 스냅샷의 허용 목록과 같다) */
export const auditFieldLabels: Record<string, string> = {
  id: '식별자',
  email: '이메일',
  name: '이름',
  role: '역할',
  must_change_password: '비밀번호 변경 필요',
  is_active: '활성 상태',
  created_at: '만든 시각',
  created_by: '만든 사람',
  profile_id: '대상 파트원',
  leader_id: '작성한 파트장',
  note: '메모',
  notes: '비고',
  category: '구분',
  company_name: '위탁사',
  unassigned_reason: '담당자가 없는 이유',
  sort_order: '표시 순서',
  user_id: '담당자',
  product_id: '제품',
  major_category_id: '대분류',
  assignee_label: '담당 표기',
  duty_id: '업무',
  requester_id: '요청한 사람',
  title: '제목',
  description: '설명',
  due_date: '기한',
  status: '상태',
  review_round: '검토 차수',
  rejection_count: '반려 횟수',
  last_submitted_at: '마지막 요청 시각',
  status_changed_at: '상태가 바뀐 시각',
  closed_at: '끝난 시각',
  withdrawn_at: '회수한 시각',
  withdrawn_by: '회수한 사람',
  withdrawal_reason: '회수 사유',
  review_request_id: '검토요청',
  author_role: '작성자 역할',
  comment: '피드백 내용',
  voided_at: '무효화한 시각',
  voided_by: '무효화한 사람',
  void_reason: '무효화 사유',
  deadline: '마감일',
  project_id: '프로젝트',
  body: '내용',
  is_pinned: '상단 고정',
  pinned_at: '고정한 시각',
  change_number: '변경번호',
  source: '출처',
  summary: '요약',
  source_url: '공식 문서 주소',
  effective_date: '시행일',
  content_locked_at: '내용을 잠근 시각',
  archived_at: '보관한 시각',
  archived_by: '보관한 사람',
  archive_reason: '보관 사유',
  archive_origin: '보관 방식',
  published_at: '배포한 시각',
  cancelled_at: '취소한 시각',
  cancellation_reason: '취소 사유',
  change_application_id: '공통변경',
  kind: '종류',
  custom_kind_name: '종류 이름',
  content: '적용 내용',
  action_item_id: '적용 항목',
  product_name: '제품 이름',
  assignee_id: '담당자',
  assignee_name: '담당자 이름',
  product_note: '제품 메모',
  completion_note: '완료 메모',
  resolution_reason: '처리 사유',
  cancel_kind: '취소 방식',
  cancelled_by: '취소한 사람',
  restored_at: '복원한 시각',
  restored_by: '복원한 사람',
  restore_reason: '복원 사유',
  proxy_reason: '대리 처리 사유',
  completed_by: '완료한 사람',
  completed_by_name: '완료한 사람 이름',
  completed_at: '완료한 시각',
  reopened_by: '다시 연 사람',
  reopened_by_name: '다시 연 사람 이름',
  reopened_at: '다시 연 시각',
  reopen_reason: '다시 연 사유',
}

export function activityActionLabel(action: string) {
  return activityActionLabels[action] ?? '기타 활동'
}

export function activityEntityLabel(entityType: string) {
  return activityEntityLabels[entityType] ?? '기타 항목'
}

export function auditSourceLabel(source: string) {
  return auditSourceLabels[source] ?? '기타 처리'
}

export function auditFieldLabel(field: string) {
  return auditFieldLabels[field] ?? '기타 항목'
}

const HANGUL_START = 0xac00
const HANGUL_END = 0xd7a3
const FINAL_SSANG_SIOT = 20 // ㅆ
const FINAL_BIEUP_SIOT = 18 // ㅄ

function finalConsonantIndex(syllable: string) {
  const code = syllable.charCodeAt(0)
  if (code < HANGUL_START || code > HANGUL_END) return -1
  return (code - HANGUL_START) % 28
}

/** 문장 끝: 마침표·느낌표·쉼표, 공백, 닫는 따옴표·괄호, 또는 글 끝 */
const SENTENCE_END = String.raw`(?=$|[\s.!,)\]'"’”」』])`

/**
 * 서버·예전 코드가 저장한 합니다체 요약을 화면에서만 해요체로 바꾼다(저장된 기록은 그대로 둔다).
 * 틀릴 수 있는 활용(갑니다 → 가요, 좋습니다 → 좋아요)은 건드리지 않고, 확실한 것만 바꾼다.
 * - 받침 ㅆ·ㅄ + 습니다 → 어요: 요청했습니다 → 요청했어요, 남겼습니다 → 남겼어요, 없습니다 → 없어요
 * - 되었어요 → 됐어요, 합니다 → 해요, 됩니다 → 돼요
 * - 입니다 → 이에요/예요(앞 글자 받침에 따라): 3건입니다 → 3건이에요, 단계입니다 → 단계예요
 */
export function toHaeyoSummary(summary: string) {
  if (!summary) return summary
  return summary
    .replace(new RegExp(`([가-힣])습니다${SENTENCE_END}`, 'g'), (match, syllable: string) => {
      const final = finalConsonantIndex(syllable)
      return final === FINAL_SSANG_SIOT || final === FINAL_BIEUP_SIOT ? `${syllable}어요` : match
    })
    .replace(new RegExp(`되었어요${SENTENCE_END}`, 'g'), '됐어요')
    .replace(new RegExp(`합니다${SENTENCE_END}`, 'g'), '해요')
    .replace(new RegExp(`됩니다${SENTENCE_END}`, 'g'), '돼요')
    .replace(new RegExp(`([^\\s])입니다${SENTENCE_END}`, 'g'), (_match, previous: string) =>
      `${previous}${josa(previous, '이에요/예요')}`,
    )
}
