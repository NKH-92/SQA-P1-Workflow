import { makeId } from '../../lib/format'
import { assertRecordExists, UserFacingError } from '../../lib/errors'
import { supabase } from '../../lib/supabase'
import type { RepositoryContext } from '../repositoryContext'

export async function addProfileNote(
  ctx: RepositoryContext,
  input: { profileId: string; note: string },
): Promise<void> {
  const { profile, setData } = ctx
  if (!ctx.isRemote) {
    if (profile.role !== 'leader' || profile.is_active === false || profile.must_change_password === true) {
      throw new UserFacingError('활성 파트장 권한이 필요합니다.')
    }
    const target = ctx.data.profiles.find((item) => item.id === input.profileId)
    assertRecordExists(target)
    if (target.role !== 'member') {
      throw new UserFacingError('파트원에게만 메모를 남길 수 있습니다.')
    }
  }
  if (ctx.isRemote) {
    const { error } = await supabase!.from('profile_notes').insert({
      profile_id: input.profileId,
      leader_id: profile.id,
      note: input.note,
    })
    if (error) throw error
  } else {
    setData((current) => ({
      ...current,
      profileNotes: [
        {
          id: makeId('profile-note'),
          profile_id: input.profileId,
          leader_id: profile.id,
          note: input.note,
          created_at: new Date().toISOString(),
        },
        ...current.profileNotes,
      ],
    }))
  }
}
