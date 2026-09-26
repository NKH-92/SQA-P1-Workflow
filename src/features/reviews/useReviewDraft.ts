import { useCallback, useEffect, useRef, useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import type { DeadlineMode } from '../../app/types'

export const emptyReviewForm = {
  title: '',
  description: '',
  deadlineMode: 'none' as DeadlineMode,
  due_date: '',
}

export type ReviewFormState = typeof emptyReviewForm

/** 입력이 멈춘 뒤 이 시간이 지나면 자동으로 임시저장한다. */
export const REVIEW_DRAFT_AUTOSAVE_MS = 1000

const DRAFT_TTL_MS = 7 * 24 * 60 * 60 * 1000
const DRAFT_SCHEMA_VERSION = 2

export const DRAFT_STORAGE_UNAVAILABLE_MESSAGE =
  '이 브라우저에서는 임시저장을 쓸 수 없어요. 내용을 따로 복사해 두세요.'
export const DRAFT_RESTORED_MESSAGE = '이 기기에 임시저장한 내용을 불러왔어요.'
export const DRAFT_EXPIRED_MESSAGE = '오래된 임시저장 내용을 지웠어요.'
export const DRAFT_UNREADABLE_MESSAGE = '임시저장한 내용을 읽지 못해서 새로 시작했어요.'

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

/** 제목·설명·기한이 모두 비어 있으면 저장할 내용이 없다. */
export function isEmptyReviewForm(form: ReviewFormState) {
  return !form.title.trim() && !form.description.trim() && !(form.deadlineMode === 'date' && form.due_date)
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

type PersistResult = { ok: true; savedAt: Date | null } | { ok: false }

/** 새 검토요청 임시저장을 기기에 쓴다. 내용이 비었으면 저장본을 지운다. */
function persistReviewDraft(profileId: string, form: ReviewFormState): PersistResult {
  const storage = browserStorage()
  if (isEmptyReviewForm(form)) {
    if (storage) {
      safeRemoveItem(storage, reviewDraftStorageKey(profileId))
      safeRemoveItem(storage, legacyReviewDraftStorageKey(profileId))
    }
    return { ok: true, savedAt: null }
  }
  if (!storage) return { ok: false }
  const now = new Date()
  const draft: ReviewDraft = {
    ...form,
    saved_at: now.toISOString(),
    expires_at: new Date(now.getTime() + DRAFT_TTL_MS).toISOString(),
  }
  if (!safeSetItem(storage, reviewDraftStorageKey(profileId), JSON.stringify(draft))) return { ok: false }
  safeRemoveItem(storage, legacyReviewDraftStorageKey(profileId))
  return { ok: true, savedAt: now }
}

/**
 * 파트원의 ‘새 검토요청’ 작성 내용. 작성 창을 닫았다 다시 열어도 메모리의 내용을 먼저 살리고,
 * 메모리가 비어 있을 때만 기기에 임시저장한 내용을 불러온다. 입력이 멈추고 1초 뒤 자동으로
 * 임시저장하고, 창을 닫거나 화면을 떠날 때는 기다리지 않고 바로 저장한다.
 * 기존 요청 수정은 이 상태를 쓰지 않는다(수정하느라 새 요청 작성 내용을 덮어쓰지 않게).
 */
export function useReviewDraft(
  profileId: string,
  { autosaveDelayMs = REVIEW_DRAFT_AUTOSAVE_MS }: { autosaveDelayMs?: number } = {},
) {
  const [form, setFormState] = useState(emptyReviewForm)
  const [draftNotice, setDraftNotice] = useState<string | null>(null)
  const [draftSavedAt, setDraftSavedAt] = useState<Date | null>(null)
  /** 마지막 저장(또는 불러오기) 뒤 사용자가 내용을 바꿨는지 */
  const [unsaved, setUnsaved] = useState(false)
  const latestRef = useRef({ form, unsaved, profileId })

  useEffect(() => {
    latestRef.current = { form, unsaved, profileId }
  })

  useEffect(() => {
    setFormState(emptyReviewForm)
    setUnsaved(false)
    setDraftNotice(null)
    setDraftSavedAt(null)
  }, [profileId])

  const setForm = useCallback<Dispatch<SetStateAction<ReviewFormState>>>((next) => {
    setFormState(next)
    setUnsaved(true)
  }, [])

  const applyPersistResult = useCallback((result: PersistResult) => {
    if (result.ok) {
      setDraftSavedAt(result.savedAt)
      setDraftNotice((current) => (current === DRAFT_STORAGE_UNAVAILABLE_MESSAGE ? null : current))
      return
    }
    setDraftNotice(DRAFT_STORAGE_UNAVAILABLE_MESSAGE)
  }, [])

  // 입력이 멈추면 자동 임시저장
  useEffect(() => {
    if (!unsaved) return
    const timer = window.setTimeout(() => {
      setUnsaved(false)
      applyPersistResult(persistReviewDraft(profileId, form))
    }, autosaveDelayMs)
    return () => window.clearTimeout(timer)
  }, [applyPersistResult, autosaveDelayMs, form, profileId, unsaved])

  /** 기다리지 않고 지금 저장한다(창을 닫을 때). */
  const flushDraft = useCallback(() => {
    const { form: latestForm, unsaved: pending, profileId: latestProfileId } = latestRef.current
    if (!pending) return
    setUnsaved(false)
    applyPersistResult(persistReviewDraft(latestProfileId, latestForm))
  }, [applyPersistResult])

  // 화면을 떠날 때(탭 이동 등) 아직 저장하지 않은 내용을 기기에 남긴다.
  useEffect(() => () => {
    const { form: latestForm, unsaved: pending, profileId: latestProfileId } = latestRef.current
    if (pending) persistReviewDraft(latestProfileId, latestForm)
  }, [])

  /**
   * 새 요청 작성 창을 열 때 부른다. 메모리에 쓰던 내용이 있으면 그대로 두고,
   * 비어 있을 때만 기기에 임시저장한 내용을 불러온다.
   */
  const openComposerDraft = useCallback(() => {
    const { form: currentForm, unsaved: pending } = latestRef.current
    // 메모리에 쓰던 내용(또는 방금 지운 내용)이 있으면 기기 저장본으로 덮어쓰지 않는다.
    if (pending || !isEmptyReviewForm(currentForm)) {
      setDraftNotice(null)
      return
    }
    const storage = browserStorage()
    if (!storage) {
      setDraftNotice(DRAFT_STORAGE_UNAVAILABLE_MESSAGE)
      return
    }
    const reviewDraftKey = reviewDraftStorageKey(profileId)
    const currentDraft = safeGetItem(storage, reviewDraftKey)
    if (!currentDraft.ok) {
      setDraftNotice(DRAFT_STORAGE_UNAVAILABLE_MESSAGE)
      return
    }
    const legacyDraft = currentDraft.value === null
      ? safeGetItem(storage, legacyReviewDraftStorageKey(profileId))
      : { ok: true as const, value: null }
    if (!legacyDraft.ok) {
      setDraftNotice(DRAFT_STORAGE_UNAVAILABLE_MESSAGE)
      return
    }
    const sourceKey = currentDraft.value === null ? legacyReviewDraftStorageKey(profileId) : reviewDraftKey
    const raw = currentDraft.value ?? legacyDraft.value
    if (!raw) {
      setDraftNotice(null)
      setDraftSavedAt(null)
      return
    }
    try {
      const parsed: unknown = JSON.parse(raw)
      if (isReviewDraft(parsed)) {
        if (Date.parse(parsed.expires_at) < Date.now()) {
          safeRemoveItem(storage, sourceKey)
          setDraftNotice(DRAFT_EXPIRED_MESSAGE)
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
        const { saved_at, expires_at: _expiresAt, ...formState } = parsed
        setFormState(formState)
        setUnsaved(false)
        setDraftNotice(DRAFT_RESTORED_MESSAGE)
        setDraftSavedAt(new Date(saved_at))
      } else {
        safeRemoveItem(storage, sourceKey)
        setDraftNotice(DRAFT_UNREADABLE_MESSAGE)
      }
    } catch {
      safeRemoveItem(storage, sourceKey)
      setDraftNotice(DRAFT_UNREADABLE_MESSAGE)
    }
  }, [profileId])

  /** 요청을 보낸 뒤: 메모리와 기기의 임시저장을 모두 비운다. */
  const discardDraft = useCallback(() => {
    setFormState(emptyReviewForm)
    setUnsaved(false)
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
    /** 저장되지 않은 변경이 남아 있는지(자동 저장 대기 중) */
    hasUnsavedChanges: unsaved,
    flushDraft,
    openComposerDraft,
    discardDraft,
  }
}
