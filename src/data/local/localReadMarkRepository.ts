import { PERMISSION_MESSAGE, UserFacingError } from '../../lib/errors'
import type { ReadMarkRepository, RepositoryDeps } from '../repositories/types'
import { READ_MARK_KEY_LIMIT, upsertSectionReadMark } from '../validation/sectionReadMarks'

/**
 * 미리보기 확인 기록. 원격 mark_section_seen처럼 지금 보이는 id로 통째로 바꾸고,
 * 앱을 쓸 수 없는 계정(비활성·비밀번호 변경 전)과 읽기 전용인 팀장은 막는다.
 */
export function createLocalReadMarkRepository(ctx: RepositoryDeps): ReadMarkRepository {
  return {
    async markSectionSeen(section, keys) {
      const { profile, setData } = ctx
      if (profile.is_active === false || profile.must_change_password === true || profile.role === 'team_leader') {
        throw new UserFacingError(PERMISSION_MESSAGE)
      }
      const mark = {
        user_id: profile.id,
        section,
        seen_keys: [...new Set(keys)].slice(0, READ_MARK_KEY_LIMIT),
        seen_at: new Date().toISOString(),
      }
      setData((current) => ({
        ...current,
        sectionReadMarks: upsertSectionReadMark(current.sectionReadMarks ?? [], mark),
      }))
    },
  }
}
