import { renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { emptyData } from '../constants'
import type { Profile } from '../../types'
import { useDeepLinkEntity } from './useDeepLinkEntity'

const member: Profile = {
  id: 'member-1',
  email: 'member@example.com',
  name: '파트원',
  role: 'member',
  is_active: true,
}

function options() {
  return {
    entityId: 'missing-announcement',
    activeTab: 'announcements' as const,
    data: emptyData,
    profile: member,
    dataReady: true,
    setEntityId: vi.fn(),
    loadReviewRequest: vi.fn(async () => false),
    loadAnnouncement: vi.fn(async () => false),
    setMessage: vi.fn(),
  }
}

describe('useDeepLinkEntity', () => {
  it('loads a capped announcement once and clears a missing target with the existing warning', async () => {
    const input = options()
    renderHook(() => useDeepLinkEntity(input))

    await waitFor(() => expect(input.loadAnnouncement).toHaveBeenCalledTimes(1))
    expect(input.loadAnnouncement).toHaveBeenCalledWith(
      'missing-announcement',
      expect.any(AbortSignal),
    )
    await waitFor(() => expect(input.setEntityId).toHaveBeenCalledWith(null))
    expect(input.setMessage).toHaveBeenCalledWith({
      text: '링크 대상을 찾을 수 없습니다. 삭제되었거나 접근 권한이 없는 항목일 수 있습니다.',
      tone: 'warning',
    })
  })

  it('does not query when the target is already present', () => {
    const input = options()
    input.entityId = 'announcement-1'
    input.data = {
      ...emptyData,
      announcements: [{
        id: 'announcement-1',
        title: '공지',
        body: '내용',
        is_pinned: false,
        pinned_at: null,
        created_by: 'leader-1',
        created_at: '2026-07-17T00:00:00.000Z',
        updated_at: '2026-07-17T00:00:00.000Z',
      }],
    }

    renderHook(() => useDeepLinkEntity(input))

    expect(input.loadAnnouncement).not.toHaveBeenCalled()
    expect(input.setEntityId).not.toHaveBeenCalled()
    expect(input.setMessage).not.toHaveBeenCalled()
  })

  it('clears unsupported missing entity targets without an on-demand query', () => {
    const input = { ...options(), activeTab: 'projects' as const, entityId: 'missing-project' }

    renderHook(() => useDeepLinkEntity(input))

    expect(input.loadReviewRequest).not.toHaveBeenCalled()
    expect(input.loadAnnouncement).not.toHaveBeenCalled()
    expect(input.setEntityId).toHaveBeenCalledWith(null)
    expect(input.setMessage).toHaveBeenCalledWith(expect.objectContaining({ tone: 'warning' }))
  })
})
