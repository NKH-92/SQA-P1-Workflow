import type { RepositoryContext } from '../repositoryContext'
import type { OfficeMeetingStartInput } from '../validation/officeMeeting'

/** 사무실 회의실을 열고 사무실에 앉은 사람을 부른다(파트장·파트원 누구나, 한 번에 하나). */
export async function startOfficeMeeting(ctx: RepositoryContext, input: OfficeMeetingStartInput): Promise<void> {
  return ctx.repositories.meetings.startMeeting(input)
}

/** 부름을 받은 내가 확인했다고 체크한다. */
export async function acknowledgeOfficeMeeting(ctx: RepositoryContext, meetingId: string): Promise<void> {
  return ctx.repositories.meetings.acknowledgeMeeting(meetingId)
}

/** 회의를 끝내고 지운다(연 사람·파트장). */
export async function endOfficeMeeting(ctx: RepositoryContext, meetingId: string): Promise<{ ended: boolean }> {
  return ctx.repositories.meetings.endMeeting(meetingId)
}
