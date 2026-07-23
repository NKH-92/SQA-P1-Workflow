import type { ReviewEventType } from '../../types'

const eventLabels: Record<ReviewEventType, string> = {
  submitted: '검토요청 제출',
  resubmitted: '재검토 요청',
  approved: '승인',
  rejected: '반려',
  reopened: '다시 열기',
  withdrawn: '회수',
  feedback_added: '피드백 등록',
  feedback_updated: '피드백 수정',
  feedback_voided: '피드백 무효화',
}

export function reviewEventLabel(eventType: string) {
  return eventLabels[eventType as ReviewEventType] ?? '기타 검토 이벤트'
}
