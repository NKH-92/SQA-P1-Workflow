import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import {
  clearReviewDraftStorage,
  reviewDraftStorageKey,
  useReviewDraft,
} from './useReviewDraft'

describe('useReviewDraft storage helpers', () => {
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

  it('stores a namespaced draft with TTL metadata when saved manually', () => {
    const { result } = renderHook(() => useReviewDraft('user-1'))
    act(() => {
      result.current.setForm({
        title: 'Draft title',
        description: 'Body',
        deadlineMode: 'none',
        due_date: '',
      })
    })
    act(() => result.current.saveReviewDraft())

    const raw = localStorage.getItem(reviewDraftStorageKey('user-1'))
    expect(raw).toContain('expires_at')
    expect(JSON.parse(raw!).title).toBe('Draft title')
    expect(result.current.draftNotice).toBe('초안을 저장했습니다.')
  })

  it('keeps the form usable when storage quota rejects a save', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('quota', 'QuotaExceededError')
    })
    const { result } = renderHook(() => useReviewDraft('user-1'))
    act(() => {
      result.current.setForm({
        title: 'Unsaved but retained',
        description: 'Body',
        deadlineMode: 'none',
        due_date: '',
      })
    })
    act(() => result.current.saveReviewDraft())

    expect(result.current.form.title).toBe('Unsaved but retained')
    expect(result.current.draftNotice).toBe('이 브라우저에서는 임시저장을 사용할 수 없습니다.')
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
    expect(result.current.draftNotice).toBe('이 브라우저에서는 임시저장을 사용할 수 없습니다.')

    getSpy.mockRestore()
    localStorage.setItem(reviewDraftStorageKey('user-1'), '{not-json')
    act(() => result.current.openComposerDraft())
    expect(result.current.draftNotice).toBe('저장된 초안을 읽지 못해 초기화했습니다.')
    expect(localStorage.getItem(reviewDraftStorageKey('user-1'))).toBeNull()
  })
})
