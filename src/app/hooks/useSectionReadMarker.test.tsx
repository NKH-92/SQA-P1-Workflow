import { renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPreviewData, previewLeader, previewMember } from '../../demoData'
import type { AppData, Profile } from '../../types'
import type { TabId } from '../types'

const mocks = vi.hoisted(() => ({ markSectionSeen: vi.fn(async () => undefined) }))

vi.mock('../../data', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../data')>()),
  markSectionSeen: mocks.markSectionSeen,
}))

import { useSectionReadMarker } from './useSectionReadMarker'

type Props = { profile: Profile | null; data: AppData; tab: TabId }

function renderMarker(initial: Props) {
  const setData = vi.fn()
  return renderHook(({ profile, data, tab }: Props) => useSectionReadMarker(profile, data, setData, tab), { initialProps: initial })
}

function sentKeys(call = 0) {
  const args = mocks.markSectionSeen.mock.calls[call] as unknown as [unknown, string, string[]]
  return { section: args[1], keys: args[2] }
}

describe('useSectionReadMarker', () => {
  beforeEach(() => {
    mocks.markSectionSeen.mockClear()
  })

  it('records what a member can see when they open a section with something new', () => {
    const data = createPreviewData()
    renderMarker({ profile: previewMember, data, tab: 'announcements' })
    expect(mocks.markSectionSeen).toHaveBeenCalledTimes(1)
    expect(sentKeys()).toEqual({ section: 'announcements', keys: ['announcement-01', 'announcement-02'] })
  })

  it('does nothing on other screens, when nothing is new, or before the marks are known', () => {
    const data = createPreviewData()
    const { rerender } = renderMarker({ profile: previewMember, data, tab: 'dashboard' })
    rerender({ profile: previewMember, data, tab: 'reviews' })
    // 파트원 A의 적용 업무는 미리보기에서 이미 확인한 상태다.
    rerender({ profile: previewMember, data, tab: 'change-applications' })
    rerender({ profile: previewMember, data: { ...data, sectionReadMarks: undefined }, tab: 'announcements' })
    rerender({ profile: null, data, tab: 'announcements' })
    expect(mocks.markSectionSeen).not.toHaveBeenCalled()
  })

  it('never writes for read-only team leaders', () => {
    renderMarker({ profile: { ...previewLeader, role: 'team_leader' }, data: createPreviewData(), tab: 'announcements' })
    expect(mocks.markSectionSeen).not.toHaveBeenCalled()
  })

  it('does not repeat the same write, but records again when something new arrives while the section is open', () => {
    const data = createPreviewData()
    const { rerender } = renderMarker({ profile: previewMember, data, tab: 'projects' })
    rerender({ profile: previewMember, data: { ...data }, tab: 'projects' })
    expect(mocks.markSectionSeen).toHaveBeenCalledTimes(1)

    const arrived: AppData = {
      ...data,
      projectAssignments: [
        ...data.projectAssignments,
        { ...data.projectAssignments[0], id: 'project-assignment-new', user_id: previewMember.id },
      ],
    }
    rerender({ profile: previewMember, data: arrived, tab: 'projects' })
    expect(mocks.markSectionSeen).toHaveBeenCalledTimes(2)
    expect(sentKeys(1).keys).toContain('project-assignment-new')
  })

  it('tries the same items again when the section is opened after a failed write', async () => {
    const data = createPreviewData()
    mocks.markSectionSeen.mockRejectedValueOnce(new Error('network down'))
    const { rerender } = renderMarker({ profile: previewMember, data, tab: 'announcements' })
    expect(mocks.markSectionSeen).toHaveBeenCalledTimes(1)
    // 실패가 처리될 때까지 기다린다.
    await (mocks.markSectionSeen.mock.results[0]?.value as Promise<unknown>).catch(() => undefined)
    // 홈에 다녀와 같은 공지 화면을 다시 연다.
    rerender({ profile: previewMember, data, tab: 'dashboard' })
    rerender({ profile: previewMember, data, tab: 'announcements' })
    await waitFor(() => expect(mocks.markSectionSeen).toHaveBeenCalledTimes(2))
    expect(sentKeys(1)).toEqual(sentKeys(0))
  })

  it('does not resend a failed write just because data refreshed, only when the items change', async () => {
    const data = createPreviewData()
    mocks.markSectionSeen.mockRejectedValueOnce(new Error('network down'))
    const { rerender } = renderMarker({ profile: previewMember, data, tab: 'projects' })
    expect(mocks.markSectionSeen).toHaveBeenCalledTimes(1)
    await (mocks.markSectionSeen.mock.results[0]?.value as Promise<unknown>).catch(() => undefined)

    // 사무실 확인 등으로 데이터만 새로 와도 같은 기록은 다시 보내지 않는다.
    rerender({ profile: previewMember, data: { ...data }, tab: 'projects' })
    rerender({ profile: previewMember, data: { ...data }, tab: 'projects' })
    expect(mocks.markSectionSeen).toHaveBeenCalledTimes(1)

    // 새 항목이 오면 다시 남긴다.
    const arrived: AppData = {
      ...data,
      projectAssignments: [
        ...data.projectAssignments,
        { ...data.projectAssignments[0], id: 'project-assignment-new', user_id: previewMember.id },
      ],
    }
    rerender({ profile: previewMember, data: arrived, tab: 'projects' })
    expect(mocks.markSectionSeen).toHaveBeenCalledTimes(2)
    expect(sentKeys(1).keys).toContain('project-assignment-new')
  })
})
