import type { ReviewEventType } from '../../types'

/** 처리 기록 이름. 상태 이름은 lib/format의 reviewStatusLabels(승인·반려·회수)와 맞춘다. */
const eventLabels: Record<ReviewEventType, string> = {
  submitted: '검토요청 보냄',
  resubmitted: '재요청',
  approved: '승인',
  rejected: '반려',
  reopened: '다시 열림',
  withdrawn: '회수',
  feedback_added: '피드백 남김',
  feedback_updated: '피드백 수정',
  feedback_voided: '피드백 무효화',
}

export function reviewEventLabel(eventType: string) {
  return eventLabels[eventType as ReviewEventType] ?? '기타 기록'
}
