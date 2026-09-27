import type { MemberStatusKind } from '../../types'
import type { RepositoryContext } from '../repositoryContext'
import type { MemberLeaveInput } from '../validation/memberPresence'

/** 잠깐 비운 상태(회의·현장·실험실·기타 부재)를 바꾸거나 null로 해제한다. */
export async function setMemberStatus(ctx: RepositoryContext, profileId: string, status: MemberStatusKind | null): Promise<void> {
  return ctx.repositories.presence.setStatus(profileId, status)
}

/** 휴가·출장 기간을 등록한다. */
export async function addMemberLeave(ctx: RepositoryContext, input: MemberLeaveInput): Promise<void> {
  return ctx.repositories.presence.addLeave(input)
}

/** 휴가·출장을 취소한다. */
export async function deleteMemberLeave(ctx: RepositoryContext, leaveId: string): Promise<{ removed: boolean }> {
  return ctx.repositories.presence.deleteLeave(leaveId)
}
