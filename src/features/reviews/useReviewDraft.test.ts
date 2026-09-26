import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import {
  clearReviewDraftStorage,
  DRAFT_RESTORED_MESSAGE,
  DRAFT_STORAGE_UNAVAILABLE_MESSAGE,
  DRAFT_UNREADABLE_MESSAGE,
  REVIEW_DRAFT_AUTOSAVE_MS,
  reviewDraftStorageKey,
  useReviewDraft,
} from './useReviewDraft'

const typedForm = {
  title: 'Draft title',
  description: 'Body',
  deadlineMode: 'none' as const,
  due_date: '',
}

describe('useReviewDraft', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-06T12:00:00.000Z'))
    localStorage.clear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
    localStorage.clear()
  })

  it('clears draft storage by profile id', () => {
    localStorage.setItem(reviewDraftStorageKey('user-1'), '{"title":"x"}')
    localStorage.setItem('draft:review:user-1', '{"title":"legacy"}')
    clearReviewDraftStorage('user-1')
    expect(localStorage.getItem(reviewDraftStorageKey('user-1'))).toBeNull()
    expect(localStorage.getItem('draft:review:user-1')).toBeNull()
  })

  it('autosaves a namespaced draft with TTL metadata one second after typing stops', () => {
    const { result } = renderHook(() => useReviewDraft('user-1'))
    act(() => result.current.setForm(typedForm))

    act(() => vi.advanceTimersByTime(REVIEW_DRAFT_AUTOSAVE_MS - 100))
    expect(localStorage.getItem(reviewDraftStorageKey('user-1'))).toBeNull()

    act(() => vi.advanceTimersByTime(100))
    const raw = localStorage.getItem(reviewDraftStorageKey('user-1'))
    expect(raw).toContain('expires_at')
    expect(JSON.parse(raw!).title).toBe('Draft title')
    expect(result.current.draftSavedAt).toEqual(new Date('2026-07-06T12:00:01.000Z'))
    expect(result.current.hasUnsavedChanges).toBe(false)
  })

  it('restarts the autosave timer while the user keeps typing', () => {
    const { result } = renderHook(() => useReviewDraft('user-1'))
    act(() => result.current.setForm({ ...typedForm, title: 'D' }))
    act(() => vi.advanceTimersByTime(800))
    act(() => result.current.setForm({ ...typedForm, title: 'Dr' }))
    act(() => vi.advanceTimersByTime(800))
    expect(localStorage.getItem(reviewDraftStorageKey('user-1'))).toBeNull()

    act(() => vi.advanceTimersByTime(200))
    expect(JSON.parse(localStorage.getItem(reviewDraftStorageKey('user-1'))!).title).toBe('Dr')
  })

  it('flushes immediately when the composer closes and removes the stored draft once the form is cleared', () => {
    const { result } = renderHook(() => useReviewDraft('user-1'))
    act(() => result.current.setForm(typedForm))
    act(() => result.current.flushDraft())
    expect(JSON.parse(localStorage.getItem(reviewDraftStorageKey('user-1'))!).title).toBe('Draft title')

    act(() => result.current.setForm({ ...typedForm, title: '', description: '' }))
    act(() => vi.advanceTimersByTime(REVIEW_DRAFT_AUTOSAVE_MS))
    expect(localStorage.getItem(reviewDraftStorageKey('user-1'))).toBeNull()
  })

  it('writes the pending draft when the screen unmounts', () => {
    const { result, unmount } = renderHook(() => useReviewDraft('user-1'))
    act(() => result.current.setForm(typedForm))
    unmount()
    expect(JSON.parse(localStorage.getItem(reviewDraftStorageKey('user-1'))!).title).toBe('Draft title')
  })

  it('keeps the in-memory text when the composer reopens instead of reloading storage', () => {
    localStorage.setItem(reviewDraftStorageKey('user-1'), JSON.stringify({
      ...typedForm,
      title: 'Older stored draft',
      saved_at: '2026-07-06T11:00:00.000Z',
      expires_at: '2026-07-13T11:00:00.000Z',
    }))
    const { result } = renderHook(() => useReviewDraft('user-1'))

    act(() => result.current.openComposerDraft())
    expect(result.current.form.title).toBe('Older stored draft')
    expect(result.current.draftNotice).toBe(DRAFT_RESTORED_MESSAGE)

    act(() => result.current.setForm((current) => ({ ...current, title: 'Newer text in memory' })))
    act(() => result.current.openComposerDraft())
    expect(result.current.form.title).toBe('Newer text in memory')
  })

  it('keeps the form usable when storage quota rejects a save', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('quota', 'QuotaExceededError')
    })
    const { result } = renderHook(() => useReviewDraft('user-1'))
    act(() => result.current.setForm({ ...typedForm, title: 'Unsaved but retained' }))
    act(() => vi.advanceTimersByTime(REVIEW_DRAFT_AUTOSAVE_MS))

    expect(result.current.form.title).toBe('Unsaved but retained')
    expect(result.current.draftNotice).toBe(DRAFT_STORAGE_UNAVAILABLE_MESSAGE)
  })

  it('keeps a legacy draft when the v2 migration write is rejected', () => {
    const legacyKey = 'draft:review:user-1'
    localStorage.setItem(legacyKey, JSON.stringify({
      title: 'Legacy draft',
      description: 'Still recoverable',
      deadlineMode: 'none',
      due_date: '',
      saved_at: '2026-07-06T11:00:00.000Z',
      expires_at: '2026-07-13T11:00:00.000Z',
    }))
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('quota', 'QuotaExceededError')
    })
    const { result } = renderHook(() => useReviewDraft('user-1'))

    act(() => result.current.openComposerDraft())

    expect(result.current.form.title).toBe('Legacy draft')
    expect(localStorage.getItem(legacyKey)).not.toBeNull()
    expect(localStorage.getItem(reviewDraftStorageKey('user-1'))).toBeNull()
  })

  it('recovers from blocked reads and malformed JSON without throwing', () => {
    const { result } = renderHook(() => useReviewDraft('user-1'))
    const getSpy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError')
    })

    act(() => result.current.openComposerDraft())
    expect(result.current.draftNotice).toBe(DRAFT_STORAGE_UNAVAILABLE_MESSAGE)

    getSpy.mockRestore()
    localStorage.setItem(reviewDraftStorageKey('user-1'), '{not-json')
    act(() => result.current.openComposerDraft())
    expect(result.current.draftNotice).toBe(DRAFT_UNREADABLE_MESSAGE)
    expect(localStorage.getItem(reviewDraftStorageKey('user-1'))).toBeNull()
  })

  it('discards memory and storage after the request is sent', () => {
    const { result } = renderHook(() => useReviewDraft('user-1'))
    act(() => result.current.setForm(typedForm))
    act(() => result.current.flushDraft())
    act(() => result.current.discardDraft())

    expect(result.current.form.title).toBe('')
    expect(localStorage.getItem(reviewDraftStorageKey('user-1'))).toBeNull()
    act(() => vi.advanceTimersByTime(REVIEW_DRAFT_AUTOSAVE_MS))
    expect(localStorage.getItem(reviewDraftStorageKey('user-1'))).toBeNull()
  })
})
