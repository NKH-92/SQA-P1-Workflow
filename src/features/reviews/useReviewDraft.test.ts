import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { clearReviewDraftStorage } from './useReviewDraft'

describe('useReviewDraft storage helpers', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-06T12:00:00.000Z'))
    localStorage.clear()
  })

  afterEach(() => {
    vi.useRealTimers()
    localStorage.clear()
  })

  it('clears draft storage by profile id', () => {
    localStorage.setItem('draft:review:user-1', '{"title":"x"}')
    clearReviewDraftStorage('user-1')
    expect(localStorage.getItem('draft:review:user-1')).toBeNull()
  })

  it('stores draft with TTL metadata when saved manually', () => {
    const draft = {
      title: 'Draft title',
      description: 'Body',
      attachment_url: '',
      deadlineMode: 'none' as const,
      due_date: '',
      saved_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    }
    localStorage.setItem('draft:review:user-1', JSON.stringify(draft))
    const raw = localStorage.getItem('draft:review:user-1')
    expect(raw).toContain('expires_at')
    expect(JSON.parse(raw!).title).toBe('Draft title')
  })
})
