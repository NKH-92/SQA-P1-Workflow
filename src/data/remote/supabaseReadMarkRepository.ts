import { supabase } from '../../lib/supabase'
import type { ReadMarkRepository, RepositoryDeps } from '../repositories/types'
import { readMarkKeysForServer, upsertSectionReadMark } from '../validation/sectionReadMarks'

/**
 * mark_section_seen은 내 기록만 지금 보이는 id로 통째로 바꾸고 DB 시각을 돌려준다.
 * id가 어떤 항목인지는 DB가 다시 따지지 않는다(내 알림 상태만 바뀌기 때문).
 */
export function createSupabaseReadMarkRepository(ctx: RepositoryDeps): ReadMarkRepository {
  return {
    async markSectionSeen(section, keys) {
      const seenKeys = readMarkKeysForServer(keys)
      const { data, error } = await supabase!.rpc('mark_section_seen', { p_section: section, p_keys: seenKeys })
      if (error) throw error
      const mark = {
        user_id: ctx.profile.id,
        section,
        seen_keys: seenKeys,
        seen_at: typeof data === 'string' ? data : new Date().toISOString(),
      }
      ctx.setData((current) => ({
        ...current,
        sectionReadMarks: upsertSectionReadMark(current.sectionReadMarks ?? [], mark),
      }))
    },
  }
}
