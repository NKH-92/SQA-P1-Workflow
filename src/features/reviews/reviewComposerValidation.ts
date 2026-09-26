import {
  REVIEW_DUE_DATE_PAST_MESSAGE,
  REVIEW_REQUEST_LIMITS,
  resubmitNoteError,
} from '../../data/validation/reviews'
import { withJosa } from '../../lib/korean'
import type { ReviewFormState } from './useReviewDraft'

export type ReviewComposerField = 'title' | 'description' | 'due_date' | 'note'
export type ReviewComposerErrors = Partial<Record<ReviewComposerField, string>>

/** 화면에 나오는 순서. 보내기를 누르면 이 순서로 첫 번째 빈 칸에 포커스한다. */
export const REVIEW_COMPOSER_FIELD_ORDER: ReadonlyArray<ReviewComposerField> = ['title', 'description', 'due_date', 'note']

function lengthError(value: string, label: string, min: number, max: number) {
  const length = value.trim().length
  if (length === 0) return `${withJosa(label, '을/를')} 입력해 주세요.`
  if (length < min) return `${withJosa(label, '은/는')} ${min}자 이상 입력해 주세요.`
  if (length > max) return `${withJosa(label, '은/는')} ${max.toLocaleString('ko-KR')}자 이하로 입력해 주세요.`
  return null
}

/**
 * 검토요청 작성 창의 입력 검사. 보내기 버튼은 늘 누를 수 있게 두고, 누르면 이 결과로
 * 칸 아래에 무엇을 고치면 되는지 알려준다(서버 검증과 같은 한도).
 */
export function validateReviewComposer(
  form: ReviewFormState,
  {
    today,
    existingDueDate = null,
    note,
  }: {
    /** 업무 시간대 기준 오늘(YYYY-MM-DD) */
    today: string
    /** 수정 중인 요청의 원래 기한. 지난 날짜라도 그대로 두면 통과한다. */
    existingDueDate?: string | null
    /** 재요청 내용. 넘기면 필수로 검사한다. */
    note?: string
  },
): ReviewComposerErrors {
  const errors: ReviewComposerErrors = {}
  const title = lengthError(form.title, '제목', REVIEW_REQUEST_LIMITS.titleMin, REVIEW_REQUEST_LIMITS.titleMax)
  if (title) errors.title = title
  const description = lengthError(
    form.description,
    '설명',
    REVIEW_REQUEST_LIMITS.descriptionMin,
    REVIEW_REQUEST_LIMITS.descriptionMax,
  )
  if (description) errors.description = description
  if (form.deadlineMode === 'date') {
    const existing = existingDueDate?.slice(0, 10) ?? null
    if (!form.due_date) errors.due_date = '기한 날짜를 골라 주세요.'
    else if (form.due_date < today && form.due_date !== existing) errors.due_date = REVIEW_DUE_DATE_PAST_MESSAGE
  }
  if (note !== undefined) {
    const noteError = resubmitNoteError(note)
    if (noteError) errors.note = noteError
  }
  return errors
}

export function firstInvalidReviewField(errors: ReviewComposerErrors): ReviewComposerField | null {
  return REVIEW_COMPOSER_FIELD_ORDER.find((field) => Boolean(errors[field])) ?? null
}
