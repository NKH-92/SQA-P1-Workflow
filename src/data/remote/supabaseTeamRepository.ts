import { supabase } from '../../lib/supabase'
import type { RepositoryDeps, TeamRepository } from '../repositories/types'

export function createSupabaseTeamRepository(ctx: RepositoryDeps): TeamRepository {
  return {
    async addProfileNote(input) {
      const { error } = await supabase!.from('profile_notes').insert({
        profile_id: input.profileId,
        leader_id: ctx.profile.id,
        note: input.note,
      })
      if (error) throw error
    },
  }
}
