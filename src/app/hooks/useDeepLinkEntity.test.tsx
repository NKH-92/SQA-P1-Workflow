import { renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { emptyData } from '../constants'
import type { Profile } from '../../types'
import { MISSING_LINK_TARGET_MESSAGE, useDeepLinkEntity } from './useDeepLinkEntity'

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
      text: MISSING_LINK_TARGET_MESSAGE,
      tone: 'warning',
    })
    expect(MISSING_LINK_TARGET_MESSAGE).toBe(
      '링크한 항목을 찾지 못했어요. 삭제됐거나 볼 수 있는 권한이 없는 항목일 수 있어요.',
    )
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
    window.history.replaceState(null, '', '#/projects?id=missing-project')
    const input = { ...options(), activeTab: 'projects' as const, entityId: 'missing-project' }

    renderHook(() => useDeepLinkEntity(input))

    // 새로고침해도 같은 안내가 다시 뜨지 않게 주소에서 사라진 항목의 id를 뺀다.
    expect(window.location.hash).toBe('#/projects')
    window.history.replaceState(null, '', '#/dashboard')

    expect(input.loadReviewRequest).not.toHaveBeenCalled()
    expect(input.loadAnnouncement).not.toHaveBeenCalled()
    expect(input.setEntityId).toHaveBeenCalledWith(null)
    expect(input.setMessage).toHaveBeenCalledWith(expect.objectContaining({ tone: 'warning' }))
  })
})
