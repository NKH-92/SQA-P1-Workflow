import { describe, expect, it, vi } from 'vitest'
import { createPreviewData, previewLeader, previewMember } from '../../demoData'
import { PERMISSION_MESSAGE } from '../../lib/errors'
import type { AppData, Profile } from '../../types'
import { createRepositoryContextFromDeps, type RepositoryContext } from '../repositoryContext'
import { markSectionSeen } from './readMarks'

function context(profile: Profile = previewMember): RepositoryContext & { applied: () => AppData } {
  let data = createPreviewData()
  const setData = vi.fn((update: AppData | ((current: AppData) => AppData)) => {
    data = typeof update === 'function' ? update(data) : update
  })
  const ctx = createRepositoryContextFromDeps('local', { profile, data, setData })
  return Object.assign(ctx, { applied: () => data })
}

describe('local section read marks', () => {
  it('replaces my mark for the section with what I can see now', async () => {
    const ctx = context()
    await markSectionSeen(ctx, 'announcements', ['announcement-01', 'announcement-02', 'announcement-01'])
    const marks = ctx.applied().sectionReadMarks ?? []
    const mine = marks.filter((mark) => mark.user_id === previewMember.id && mark.section === 'announcements')
    expect(mine).toHaveLength(1)
    expect(mine[0].seen_keys).toEqual(['announcement-01', 'announcement-02'])
    // 다른 화면·다른 사람 기록은 그대로다.
    expect(marks.filter((mark) => mark.user_id === previewLeader.id)).toEqual(
      (createPreviewData().sectionReadMarks ?? []).filter((mark) => mark.user_id === previewLeader.id),
    )
  })

  it('refuses people who cannot use the app and read-only team leaders', async () => {
    for (const profile of [
      { ...previewMember, is_active: false },
      { ...previewMember, must_change_password: true },
      { ...previewLeader, role: 'team_leader' as const },
    ]) {
      const ctx = context(profile)
      await expect(markSectionSeen(ctx, 'projects', [])).rejects.toThrow(PERMISSION_MESSAGE)
      expect(ctx.setData).not.toHaveBeenCalled()
    }
  })
})
