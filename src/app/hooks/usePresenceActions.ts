import { useCallback, useMemo, useState } from 'react'
import { addMemberLeave, createRepositoryContext, deleteMemberLeave, setMemberStatus, type MemberLeaveInput } from '../../data'
import type { AppDataUpdater } from '../../data/repositories/appDataUpdater'
import { canEditPresence, hasPresence, leavePeriodLabel, PRESENCE_TEXT } from '../../data/validation/memberPresence'
import { quotedWithJosa, withJosa } from '../../lib/korean'
import type { AppData, MemberLeaveKind, MemberStatusKind, Profile } from '../../types'
import type { MutationRunner } from './useMutationRunner'

export type PresencePerson = { id: string; name: string }

/** 알림 문구의 ‘누구’: 나면 ‘내’, 다른 사람이면 ‘파트원 B님’ */
function whose(profile: Profile, person: PresencePerson) {
  return person.id === profile.id ? '내' : `${person.name}님`
}

/**
 * 내 상태 창을 여닫고, 상태·휴가·출장을 저장한다. 어느 화면에서든(상단 메뉴·왼쪽 메뉴·사무실) 연다.
 * 파트장은 다른 파트장·파트원 상태도 바꿀 수 있어 사람 목록에 함께 둔다. 팀장은 상태가 없다.
 */
export function usePresenceActions(
  profile: Profile | null,
  data: AppData,
  setData: AppDataUpdater,
  mutate: MutationRunner,
) {
  const [openFor, setOpenFor] = useState<string | null>(null)
  const canEdit = Boolean(profile && canEditPresence(profile, profile))

  const people = useMemo<PresencePerson[]>(() => {
    if (!profile || !canEdit) return []
    const me = { id: profile.id, name: profile.name }
    if (profile.role !== 'leader') return [me]
    const others = data.profiles
      .filter((person) => person.id !== profile.id && hasPresence(person))
      .sort((left, right) => left.name.localeCompare(right.name, 'ko'))
      .map((person) => ({ id: person.id, name: person.name }))
    return [me, ...others]
  }, [canEdit, data.profiles, profile])

  const context = useCallback(() => createRepositoryContext(profile!, data, setData), [data, profile, setData])

  const setStatus = useCallback((person: PresencePerson, status: MemberStatusKind | null) => {
    if (!profile) return Promise.resolve(false)
    const label = status ? PRESENCE_TEXT[status].label : '자리에 있음'
    return mutate(async () => {
      await setMemberStatus(context(), person.id, status)
    }, `${whose(profile, person)} 상태를 ${quotedWithJosa(label, '으로/로')} 바꿨어요.`)
  }, [context, mutate, profile])

  const addLeave = useCallback((person: PresencePerson, input: MemberLeaveInput) => {
    if (!profile) return Promise.resolve(false)
    const label = PRESENCE_TEXT[input.kind].short
    return mutate(async () => {
      await addMemberLeave(context(), input)
    }, `${whose(profile, person)} ${withJosa(label, '을/를')} 등록했어요. ${leavePeriodLabel({ starts_on: input.startsOn, ends_on: input.endsOn })}`)
  }, [context, mutate, profile])

  const deleteLeave = useCallback((person: PresencePerson, leaveId: string, kind: MemberLeaveKind) => {
    if (!profile) return Promise.resolve(false)
    return mutate(async () => {
      await deleteMemberLeave(context(), leaveId)
    }, `${whose(profile, person)} ${withJosa(PRESENCE_TEXT[kind].short, '을/를')} 취소했어요.`)
  }, [context, mutate, profile])

  return {
    /** 상태를 가질 수 있는 사람인지(팀장·비활성 계정은 false) */
    canEdit,
    people,
    openFor,
    open: (profileId?: string) => {
      if (canEdit && profile) setOpenFor(profileId ?? profile.id)
    },
    close: () => setOpenFor(null),
    setStatus,
    addLeave,
    deleteLeave,
  }
}
