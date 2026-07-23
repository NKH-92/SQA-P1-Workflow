import { useCallback, useEffect, useState } from 'react'
import type { DeadlineMode } from '../../app/types'

export const emptyReviewForm = {
  title: '',
  description: '',
  deadlineMode: 'none' as DeadlineMode,
  due_date: '',
}

export type ReviewFormState = typeof emptyReviewForm

const DRAFT_TTL_MS = 7 * 24 * 60 * 60 * 1000
const DRAFT_SCHEMA_VERSION = 2

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

export function reviewDraftStorageKey(profileId: string) {
  return `draft:review:v${DRAFT_SCHEMA_VERSION}:${profileId}`
}

function legacyReviewDraftStorageKey(profileId: string) {
  return `draft:review:${profileId}`
}

function browserStorage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage
  } catch {
    return null
  }
}

function safeGetItem(storage: Storage, key: string): { ok: true; value: string | null } | { ok: false } {
  try {
    return { ok: true, value: storage.getItem(key) }
  } catch {
    return { ok: false }
  }
}

function safeSetItem(storage: Storage, key: string, value: string) {
  try {
    storage.setItem(key, value)
    return true
  } catch {
    return false
  }
}

function safeRemoveItem(storage: Storage, key: string) {
  try {
    storage.removeItem(key)
    return true
  } catch {
    return false
  }
}

export function clearReviewDraftStorage(profileId: string) {
  const storage = browserStorage()
  if (!storage) return false
  const currentRemoved = safeRemoveItem(storage, reviewDraftStorageKey(profileId))
  const legacyRemoved = safeRemoveItem(storage, legacyReviewDraftStorageKey(profileId))
  return currentRemoved && legacyRemoved
}

export function useReviewDraft(profileId: string) {
  const [form, setForm] = useState(emptyReviewForm)
  const [draftNotice, setDraftNotice] = useState<string | null>(null)
  const [draftSavedAt, setDraftSavedAt] = useState<Date | null>(null)
  const reviewDraftKey = reviewDraftStorageKey(profileId)

  useEffect(() => {
    setForm(emptyReviewForm)
    setDraftNotice(null)
    setDraftSavedAt(null)
  }, [profileId])

  const saveReviewDraft = useCallback(() => {
    const storage = browserStorage()
    if (!storage) {
      setDraftNotice('이 브라우저에서는 임시저장을 사용할 수 없습니다.')
      return
    }
    const now = new Date()
    const draft: ReviewDraft = {
      ...form,
      saved_at: now.toISOString(),
      expires_at: new Date(now.getTime() + DRAFT_TTL_MS).toISOString(),
    }
    if (!safeSetItem(storage, reviewDraftKey, JSON.stringify(draft))) {
      setDraftNotice('이 브라우저에서는 임시저장을 사용할 수 없습니다.')
      return
    }
    safeRemoveItem(storage, legacyReviewDraftStorageKey(profileId))
    setDraftSavedAt(now)
    setDraftNotice('초안을 저장했습니다.')
  }, [form, profileId, reviewDraftKey])

  const openComposerDraft = useCallback(() => {
    setDraftSavedAt(null)
    const storage = browserStorage()
    if (!storage) {
      setForm(emptyReviewForm)
      setDraftNotice('이 브라우저에서는 임시저장을 사용할 수 없습니다.')
      return
    }
    const currentDraft = safeGetItem(storage, reviewDraftKey)
    if (!currentDraft.ok) {
      setForm(emptyReviewForm)
      setDraftNotice('이 브라우저에서는 임시저장을 사용할 수 없습니다.')
      return
    }
    const legacyDraft = currentDraft.value === null
      ? safeGetItem(storage, legacyReviewDraftStorageKey(profileId))
      : { ok: true as const, value: null }
    if (!legacyDraft.ok) {
      setForm(emptyReviewForm)
      setDraftNotice('이 브라우저에서는 임시저장을 사용할 수 없습니다.')
      return
    }
    const sourceKey = currentDraft.value === null ? legacyReviewDraftStorageKey(profileId) : reviewDraftKey
    const raw = currentDraft.value ?? legacyDraft.value
    if (!raw) {
      setForm(emptyReviewForm)
      setDraftNotice(null)
      return
    }
    try {
      const parsed: unknown = JSON.parse(raw)
      if (isReviewDraft(parsed)) {
        if (Date.parse(parsed.expires_at) < Date.now()) {
          safeRemoveItem(storage, sourceKey)
          setForm(emptyReviewForm)
          setDraftNotice('만료된 초안을 삭제했습니다.')
          return
        }
        if (sourceKey !== reviewDraftKey) {
          // Keep the legacy copy unless the v2 write actually succeeds. Near a
          // localStorage quota, writing a second copy can fail even though the
          // existing draft remains readable; deleting it in that case would
          // turn a best-effort migration into persisted draft loss.
          if (safeSetItem(storage, reviewDraftKey, raw)) {
            safeRemoveItem(storage, sourceKey)
          }
        }
        const { saved_at, expires_at, ...formState } = parsed
        setForm(formState)
        setDraftNotice('이 기기에 저장된 초안을 불러왔습니다.')
        setDraftSavedAt(new Date(parsed.saved_at))
      } else if (isReviewForm(parsed)) {
        safeRemoveItem(storage, sourceKey)
        setForm(emptyReviewForm)
        setDraftNotice('저장된 초안 형식이 달라 초기화했습니다.')
      } else {
        safeRemoveItem(storage, sourceKey)
        setForm(emptyReviewForm)
        setDraftNotice('저장된 초안 형식이 달라 초기화했습니다.')
      }
    } catch {
      safeRemoveItem(storage, sourceKey)
      setForm(emptyReviewForm)
      setDraftNotice('저장된 초안을 읽지 못해 초기화했습니다.')
    }
  }, [profileId, reviewDraftKey])

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
