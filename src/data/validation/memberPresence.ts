import { businessDateKey } from '../../lib/businessTime'
import { dateOnlyTime } from '../../lib/dates'
import { PERMISSION_MESSAGE, UserFacingError } from '../../lib/errors'
import { formatMonthDay } from '../../lib/format'
import type { MemberLeave, MemberLeaveKind, MemberPresence, MemberStatus, MemberStatusKind, Profile } from '../../types'

/**
 * 자리 상태(개인 상태). 하루 중 잠깐 비운 상태(회의·현장·실험실·기타 부재)는 해제할 때까지 유지하고,
 * 휴가·출장은 서울 날짜로 기간을 정한다. 같은 날 둘 다 있으면 휴가·출장이 앞선다.
 * 서버 RPC(get_member_presence·set_member_status·add_member_leave·delete_member_leave)와 규칙을 맞춘다.
 */

export const MEMBER_STATUS_KINDS: readonly MemberStatusKind[] = ['meeting', 'field', 'lab', 'away']
export const MEMBER_LEAVE_KINDS: readonly MemberLeaveKind[] = ['vacation', 'trip']
export const MEMBER_LEAVE_NOTE_MAX = 30
/** 한 번에 등록하는 휴가·출장의 최대 일수(첫날·마지막 날 포함) */
export const MEMBER_LEAVE_MAX_DAYS = 90
/** 오늘부터 이 날수 안에 시작하는 기간만 등록한다. */
export const MEMBER_LEAVE_MAX_LEAD_DAYS = 365

export type PresenceKind = MemberStatusKind | MemberLeaveKind

export const PRESENCE_TEXT: Record<PresenceKind, { label: string; short: string; sentence: string }> = {
  meeting: { label: '회의 중', short: '회의', sentence: '회의 중이에요' },
  field: { label: '현장', short: '현장', sentence: '현장에 있어요' },
  lab: { label: '실험실', short: '실험실', sentence: '실험실에 있어요' },
  away: { label: '기타 부재', short: '부재', sentence: '자리를 비웠어요' },
  vacation: { label: '휴가', short: '휴가', sentence: '휴가 중이에요' },
  trip: { label: '출장', short: '출장', sentence: '출장 중이에요' },
}

export const MEMBER_PRESENCE_INVALID_MESSAGE = '상태를 다시 골라 주세요.'
export const MEMBER_LEAVE_INVALID_MESSAGE = `기간을 다시 확인해 주세요. 오늘부터 1년 안에 시작하는 최대 ${MEMBER_LEAVE_MAX_DAYS}일까지 등록할 수 있어요.`
export const MEMBER_LEAVE_NOTE_MESSAGE = `메모는 ${MEMBER_LEAVE_NOTE_MAX}자까지 쓸 수 있어요.`
export const MEMBER_LEAVE_OVERLAP_MESSAGE = '이미 등록한 휴가·출장과 기간이 겹쳐요.'
export const MEMBER_PRESENCE_FORBIDDEN_MESSAGE = '다른 사람의 상태는 파트장만 바꿀 수 있어요.'
export const MEMBER_PRESENCE_TARGET_MESSAGE = '파트장·파트원의 상태만 바꿀 수 있어요.'

const DAY_MS = 86_400_000

/** 상태를 가질 수 있는 사람: 활성 파트장·파트원. 팀장은 읽기 전용이라 상태가 없다. */
export function hasPresence(profile: Pick<Profile, 'role' | 'is_active'> | undefined): boolean {
  return Boolean(profile) && profile!.is_active !== false && (profile!.role === 'leader' || profile!.role === 'member')
}

/** actor가 바꿀 수 있는 상태인지: 내 상태, 또는 파트장이 다른 파트장·파트원 상태를 바꾼다. */
export function canEditPresence(actor: Profile, target: Pick<Profile, 'id' | 'role' | 'is_active'> | undefined): boolean {
  if (actor.is_active === false || actor.must_change_password === true) return false
  if (actor.role !== 'leader' && actor.role !== 'member') return false
  if (!target) return false
  if (target.id === actor.id) return true
  return actor.role === 'leader' && hasPresence(target)
}

function coversDate(leave: Pick<MemberLeave, 'starts_on' | 'ends_on'>, dateKey: string) {
  return leave.starts_on <= dateKey && dateKey <= leave.ends_on
}

/** 그 날(서울 날짜) 휴가·출장 중이면 그 기간 */
export function leaveOn(presence: MemberPresence | undefined, profileId: string, dateKey: string): MemberLeave | undefined {
  return presence?.leaves.find((leave) => leave.profile_id === profileId && coversDate(leave, dateKey))
}

export function statusOf(presence: MemberPresence | undefined, profileId: string): MemberStatus | undefined {
  return presence?.statuses.find((status) => status.profile_id === profileId)
}

/** 지금 이어지는 것과 앞으로 있을 휴가·출장(시작일 순) */
export function upcomingLeaves(presence: MemberPresence | undefined, profileId: string, todayKey: string): MemberLeave[] {
  return (presence?.leaves ?? [])
    .filter((leave) => leave.profile_id === profileId && leave.ends_on >= todayKey)
    .sort((left, right) => left.starts_on.localeCompare(right.starts_on) || left.id.localeCompare(right.id))
}

export type EffectivePresence = {
  kind: PresenceKind
  /** 휴가·출장이면 그 기간 */
  leave?: MemberLeave
  /** 짧은 상태를 바꾼 때 */
  since?: string
}

/** 오늘 보여 줄 상태. 휴가·출장이 짧은 상태보다 앞서고, 둘 다 없으면 null(자리에 있음). */
export function presenceOf(
  presence: MemberPresence | undefined,
  profileId: string,
  todayKey: string = businessDateKey(new Date()),
): EffectivePresence | null {
  const leave = leaveOn(presence, profileId, todayKey)
  if (leave) return { kind: leave.kind, leave }
  const status = statusOf(presence, profileId)
  return status ? { kind: status.status, since: status.updated_at } : null
}

/** ‘10월 2일까지’처럼 기간이 끝나는 날. 오늘 끝나면 ‘오늘까지’ */
export function leaveUntilLabel(leave: Pick<MemberLeave, 'ends_on'>, todayKey: string): string {
  if (leave.ends_on === todayKey) return '오늘까지'
  const day = formatMonthDay(leave.ends_on)
  return day ? `${day}까지` : ''
}

/** ‘9월 28일~10월 2일’, 하루면 ‘9월 28일’ */
export function leavePeriodLabel(leave: Pick<MemberLeave, 'starts_on' | 'ends_on'>): string {
  const start = formatMonthDay(leave.starts_on) ?? leave.starts_on
  if (leave.starts_on === leave.ends_on) return start
  return `${start}~${formatMonthDay(leave.ends_on) ?? leave.ends_on}`
}

/** 사무실 자리 칩처럼 아주 좁은 곳: ‘출장 ~9/29’, ‘휴가 오늘까지’, ‘실험실’ */
export function presenceChipLabel(effective: EffectivePresence, todayKey: string): string {
  const text = PRESENCE_TEXT[effective.kind].short
  if (!effective.leave) return text
  if (effective.leave.ends_on === todayKey) return `${text} 오늘까지`
  const [, month, day] = effective.leave.ends_on.split('-').map(Number)
  return month && day ? `${text} ~${month}/${day}` : text
}

/** 이름표·목록에 붙이는 짧은 설명: ‘휴가 · 10월 2일까지’, ‘실험실’ */
export function presenceSummary(effective: EffectivePresence, todayKey: string): string {
  const text = PRESENCE_TEXT[effective.kind].short
  if (!effective.leave) return text
  const until = leaveUntilLabel(effective.leave, todayKey)
  return until ? `${text} · ${until}` : text
}

export function isMemberStatusKind(value: unknown): value is MemberStatusKind {
  return typeof value === 'string' && (MEMBER_STATUS_KINDS as readonly string[]).includes(value)
}

export function isMemberLeaveKind(value: unknown): value is MemberLeaveKind {
  return typeof value === 'string' && (MEMBER_LEAVE_KINDS as readonly string[]).includes(value)
}

export type MemberLeaveInput = {
  profileId: string
  kind: MemberLeaveKind
  /** YYYY-MM-DD(서울 날짜) */
  startsOn: string
  endsOn: string
  note: string
}

/** 기간·메모를 확인하고 정리한 값을 돌려준다. 같은 사람의 다른 기간과 겹치면 막는다. */
export function validateMemberLeave(
  input: MemberLeaveInput,
  presence: MemberPresence | undefined,
  now: Date = new Date(),
): MemberLeaveInput {
  const note = input.note.trim()
  if (note.length > MEMBER_LEAVE_NOTE_MAX) throw new UserFacingError(MEMBER_LEAVE_NOTE_MESSAGE)
  const start = dateOnlyTime(input.startsOn)
  const end = dateOnlyTime(input.endsOn)
  const today = dateOnlyTime(businessDateKey(now))
  if (!isMemberLeaveKind(input.kind) || start == null || end == null || today == null) {
    throw new UserFacingError(MEMBER_LEAVE_INVALID_MESSAGE)
  }
  if (end < start || (end - start) / DAY_MS > MEMBER_LEAVE_MAX_DAYS - 1 || end < today || (start - today) / DAY_MS > MEMBER_LEAVE_MAX_LEAD_DAYS) {
    throw new UserFacingError(MEMBER_LEAVE_INVALID_MESSAGE)
  }
  const overlaps = (presence?.leaves ?? []).some((leave) =>
    leave.profile_id === input.profileId && leave.starts_on <= input.endsOn && leave.ends_on >= input.startsOn)
  if (overlaps) throw new UserFacingError(MEMBER_LEAVE_OVERLAP_MESSAGE)
  return { ...input, note }
}

function parseStatus(value: unknown): MemberStatus | null {
  if (!value || typeof value !== 'object') return null
  const row = value as Record<string, unknown>
  if (typeof row.profile_id !== 'string' || typeof row.name !== 'string' || typeof row.updated_at !== 'string') return null
  if (!isMemberStatusKind(row.status)) return null
  return { profile_id: row.profile_id, name: row.name, status: row.status, updated_at: row.updated_at }
}

function parseLeave(value: unknown): MemberLeave | null {
  if (!value || typeof value !== 'object') return null
  const row = value as Record<string, unknown>
  const text = ['id', 'profile_id', 'name', 'starts_on', 'ends_on', 'note'] as const
  if (text.some((key) => typeof row[key] !== 'string') || !isMemberLeaveKind(row.kind)) return null
  if (dateOnlyTime(row.starts_on as string) == null || dateOnlyTime(row.ends_on as string) == null) return null
  return {
    id: row.id as string,
    profile_id: row.profile_id as string,
    name: row.name as string,
    kind: row.kind,
    starts_on: (row.starts_on as string).slice(0, 10),
    ends_on: (row.ends_on as string).slice(0, 10),
    note: row.note as string,
  }
}

/** get_member_presence 응답을 확인한다. 모양이 다르면 null(불러오기 실패와 같게 다룬다). */
export function parseMemberPresence(value: unknown): MemberPresence | null {
  if (!value || typeof value !== 'object') return null
  const row = value as Record<string, unknown>
  if (!Array.isArray(row.statuses) || !Array.isArray(row.leaves)) return null
  const statuses = row.statuses.map(parseStatus)
  const leaves = row.leaves.map(parseLeave)
  if (!statuses.every((item): item is MemberStatus => item !== null)) return null
  if (!leaves.every((item): item is MemberLeave => item !== null)) return null
  return { statuses, leaves }
}

/** 상태 RPC의 detail 코드를 사용자 문구로 바꾼다. 모르는 오류는 그대로 둔다. */
export function translateMemberPresenceError<T extends { message?: string; details?: string }>(error: T): T | UserFacingError {
  const text = `${error.message ?? ''} ${error.details ?? ''}`
  if (text.includes('SQA_MEMBER_LEAVE_OVERLAP')) return new UserFacingError(MEMBER_LEAVE_OVERLAP_MESSAGE)
  if (text.includes('SQA_MEMBER_PRESENCE_FORBIDDEN')) return new UserFacingError(MEMBER_PRESENCE_FORBIDDEN_MESSAGE)
  if (text.includes('SQA_MEMBER_PRESENCE_TARGET_INVALID')) return new UserFacingError(MEMBER_PRESENCE_TARGET_MESSAGE)
  if (text.includes('SQA_MEMBER_PRESENCE_INVALID')) return new UserFacingError(MEMBER_LEAVE_INVALID_MESSAGE)
  if (text.includes('SQA_TEAM_LEADER_READ_ONLY') || text.includes('SQA_APP_ACCESS_REQUIRED')) return new UserFacingError(PERMISSION_MESSAGE)
  return error
}
