import { useCallback, useState } from 'react'
import type { DeadlineMode } from '../../app/types'

export const emptyReviewForm = {
  title: '',
  description: '',
  deadlineMode: 'none' as DeadlineMode,
  due_date: '',
}

export type ReviewFormState = typeof emptyReviewForm

const DRAFT_TTL_MS = 7 * 24 * 60 * 60 * 1000

type ReviewDraft = ReviewFormState & {
  saved_at: string
  expires_at: string
}

function isReviewForm(value: unknown): value is ReviewFormState {
  if (typeof value !== 'object' || value === null) return false
  const draft = value as Partial<ReviewFormState>
  return (
    typeof draft.title === 'string' &&
    typeof draft.description === 'string' &&
    (draft.deadlineMode === 'none' || draft.deadlineMode === 'date') &&
    typeof draft.due_date === 'string'
  )
}

function isReviewDraft(value: unknown): value is ReviewDraft {
  if (!isReviewForm(value)) return false
  const draft = value as Partial<ReviewDraft>
  return typeof draft.saved_at === 'string' && typeof draft.expires_at === 'string'
}

export function clearReviewDraftStorage(profileId: string) {
  if (typeof localStorage === 'undefined') return
  localStorage.removeItem(`draft:review:${profileId}`)
}

export function useReviewDraft(profileId: string) {
  const [form, setForm] = useState(emptyReviewForm)
  const [draftNotice, setDraftNotice] = useState<string | null>(null)
  const [draftSavedAt, setDraftSavedAt] = useState<Date | null>(null)
  const reviewDraftKey = `draft:review:${profileId}`

  const saveReviewDraft = useCallback(() => {
    if (typeof localStorage === 'undefined') return
    const now = new Date()
    const draft: ReviewDraft = {
      ...form,
      saved_at: now.toISOString(),
      expires_at: new Date(now.getTime() + DRAFT_TTL_MS).toISOString(),
    }
    localStorage.setItem(reviewDraftKey, JSON.stringify(draft))
    setDraftSavedAt(now)
    setDraftNotice('초안을 저장했습니다.')
  }, [form, reviewDraftKey])

  const openComposerDraft = useCallback(() => {
    setDraftSavedAt(null)
    if (typeof localStorage === 'undefined') {
      setForm(emptyReviewForm)
      setDraftNotice(null)
      return
    }
    const raw = localStorage.getItem(reviewDraftKey)
    if (!raw) {
      setForm(emptyReviewForm)
      setDraftNotice(null)
      return
    }
    try {
      const parsed: unknown = JSON.parse(raw)
      if (isReviewDraft(parsed)) {
        if (Date.parse(parsed.expires_at) < Date.now()) {
          localStorage.removeItem(reviewDraftKey)
          setForm(emptyReviewForm)
          setDraftNotice('만료된 초안을 삭제했습니다.')
          return
        }
        const { saved_at, expires_at, ...formState } = parsed
        setForm(formState)
        setDraftNotice('이 기기에 저장된 초안을 불러왔습니다.')
        setDraftSavedAt(new Date(parsed.saved_at))
      } else if (isReviewForm(parsed)) {
        localStorage.removeItem(reviewDraftKey)
        setForm(emptyReviewForm)
        setDraftNotice('저장된 초안 형식이 달라 초기화했습니다.')
      } else {
        localStorage.removeItem(reviewDraftKey)
        setForm(emptyReviewForm)
        setDraftNotice('저장된 초안 형식이 달라 초기화했습니다.')
      }
    } catch {
      setForm(emptyReviewForm)
      setDraftNotice('저장된 초안을 읽지 못해 초기화했습니다.')
    }
  }, [reviewDraftKey])

  const clearDraftStorage = useCallback(() => {
    clearReviewDraftStorage(profileId)
    setDraftNotice(null)
    setDraftSavedAt(null)
  }, [profileId])

  return {
    form,
    setForm,
    draftNotice,
    setDraftNotice,
    draftSavedAt,
    saveReviewDraft,
    openComposerDraft,
    clearDraftStorage,
    resetForm: () => setForm(emptyReviewForm),
  }
}
