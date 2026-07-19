import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPreviewData, previewLeader } from '../../demoData'

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  insert: vi.fn(),
}))

vi.mock('../../lib/supabase', () => ({
  hasSupabaseConfig: true,
  supabase: { from: mocks.from },
}))

import { createSupabaseActivityLogWriter } from './supabaseActivityLogWriter'
import { createSupabaseTeamRepository } from './supabaseTeamRepository'

describe('remote operational adapters', () => {
  beforeEach(() => {
    mocks.from.mockReset().mockReturnValue({ insert: mocks.insert })
    mocks.insert.mockReset().mockResolvedValue({ error: null })
  })

  it('persists profile notes through the team repository', async () => {
    const repository = createSupabaseTeamRepository({
      profile: previewLeader,
      data: createPreviewData(),
      setData: vi.fn(),
      activityLogs: createSupabaseActivityLogWriter(),
    })

    await repository.addProfileNote({ profileId: 'member-1', note: '확인 메모' })

    expect(mocks.from).toHaveBeenCalledWith('profile_notes')
    expect(mocks.insert).toHaveBeenCalledWith({
      profile_id: 'member-1',
      leader_id: previewLeader.id,
      note: '확인 메모',
    })
  })

  it('persists normalized activity rows through the writer', async () => {
    const writer = createSupabaseActivityLogWriter()

    await writer.write({
      actor: previewLeader,
      entityType: 'project',
      entityId: 'project-1',
      action: 'updated',
      summary: '프로젝트 수정',
    })

    expect(mocks.from).toHaveBeenCalledWith('activity_logs')
    expect(mocks.insert).toHaveBeenCalledWith(expect.objectContaining({
      actor_id: previewLeader.id,
      entity_type: 'project',
      entity_id: 'project-1',
      action: 'updated',
      metadata: {},
    }))
  })
})
