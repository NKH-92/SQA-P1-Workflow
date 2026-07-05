import { makeId } from '../../lib/format'
import { supabase } from '../../lib/supabase'
import type { RepositoryContext } from '../repositoryContext'

export async function addProfileNote(
  ctx: RepositoryContext,
  input: { profileId: string; note: string },
): Promise<void> {
  const { profile, setData } = ctx
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
