import type { ChangeApplicationInput } from './types'

/**
 * 공통변경 등록 창의 ‘임시저장’. 서버 초안은 변경 정보와 제품이 모두 있어야 저장되므로,
 * 그 전 단계(제목만 쓴 상태 등)는 이 기기(localStorage)에 보관했다가 창을 다시 열 때 이어 쓴다.
 * 검토요청 작성의 임시저장과 같은 방식(사용자별 키, 7일 보관)이다.
 */
export type ChangeComposerForm = Omit<ChangeApplicationInput, 'tasks'>

export type ChangeComposerDraft = {
  form: ChangeComposerForm
  selected: Record<string, string | null>
  saved_at: string
  expires_at: string
}

const DRAFT_TTL_MS = 7 * 24 * 60 * 60 * 1000

export function changeComposerDraftKey(profileId: string) {
  return `draft:change-application:v1:${profileId}`
}

function browserStorage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage
  } catch {
    return null
  }
}

function isRecordOfNullableStrings(value: unknown): value is Record<string, string | null> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  return Object.values(value).every((item) => item === null || typeof item === 'string')
}

function isComposerForm(value: unknown): value is ChangeComposerForm {
  if (typeof value !== 'object' || value === null) return false
  const form = value as Partial<ChangeComposerForm>
  return typeof form.change_number === 'string'
    && typeof form.title === 'string'
    && typeof form.summary === 'string'
    && typeof form.effective_date === 'string'
    && typeof form.action_content === 'string'
    && typeof form.due_date === 'string'
    && (form.source === 'official' || form.source === 'internal' || form.source === 'other')
    && (form.action_kind === 'product_standard' || form.action_kind === 'other')
}

function isDraft(value: unknown): value is ChangeComposerDraft {
  if (typeof value !== 'object' || value === null) return false
  const draft = value as Partial<ChangeComposerDraft>
  return isComposerForm(draft.form)
    && isRecordOfNullableStrings(draft.selected)
    && typeof draft.saved_at === 'string'
    && typeof draft.expires_at === 'string'
}

/** 저장해 둔 새 공통변경을 읽는다. 만료됐거나 모양이 다르면 지우고 null을 돌려준다. */
export function readChangeComposerDraft(profileId: string, now = Date.now()): ChangeComposerDraft | null {
  const storage = browserStorage()
  if (!storage) return null
  const key = changeComposerDraftKey(profileId)
  try {
    const raw = storage.getItem(key)
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    if (!isDraft(parsed) || Date.parse(parsed.expires_at) < now) {
      storage.removeItem(key)
      return null
    }
    return {
      ...parsed,
      // 새 공통변경만 이 기기에 보관한다. 서버 쪽 식별자는 늘 비운다.
      form: { ...parsed.form, changeApplicationId: null, expected_updated_at: null },
    }
  } catch {
    return null
  }
}

/** 이 기기에 보관한다. 저장소를 쓸 수 없으면 null을 돌려준다. */
export function writeChangeComposerDraft(
  profileId: string,
  draft: Pick<ChangeComposerDraft, 'form' | 'selected'>,
  now = new Date(),
): Date | null {
  const storage = browserStorage()
  if (!storage) return null
  const value: ChangeComposerDraft = {
    form: { ...draft.form, changeApplicationId: null, expected_updated_at: null },
    selected: draft.selected,
    saved_at: now.toISOString(),
    expires_at: new Date(now.getTime() + DRAFT_TTL_MS).toISOString(),
  }
  try {
    storage.setItem(changeComposerDraftKey(profileId), JSON.stringify(value))
    return now
  } catch {
    return null
  }
}

export function clearChangeComposerDraft(profileId: string) {
  const storage = browserStorage()
  if (!storage) return
  try {
    storage.removeItem(changeComposerDraftKey(profileId))
  } catch {
    // 저장소를 쓸 수 없는 환경이면 지울 것도 없다.
  }
}
