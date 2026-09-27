import { useMemo, useState } from 'react'
import { Check, Users } from 'lucide-react'
import { DialogActions, Modal } from '../../../components/ui'
import { leaveOn, presenceOf, presenceSummary } from '../../../data/validation/memberPresence'
import {
  canEndOfficeMeeting,
  canOpenOfficeMeeting,
  hasOfficeMeetingStarted,
  isOfficeMeetingOpen,
  meetingParticipant,
  OFFICE_MEETING_LOCATION_MAX,
  OFFICE_MEETING_MAX_INVITEES,
  OFFICE_MEETING_ROOM_NAME,
  OFFICE_MEETING_TITLE_MAX,
  officeMeetingPlace,
  type OfficeMeetingStartInput,
} from '../../../data/validation/officeMeeting'
import { businessDateKey } from '../../../lib/businessTime'
import { formatClock } from '../../../lib/format'
import type { MemberPresence, OfficeMeeting, Profile } from '../../../types'
import type { SceneOccupant } from '../officeLayoutModel'
import { meetingProgress, meetingTimeSlots, meetingWhenText } from '../officeMeetingModel'
import { PresenceIcon } from './PresenceIcon'

/** 장소 칸에서 고를 수 있는 흔한 곳(직접 써도 된다) */
const PLACE_SUGGESTIONS = ['대회의실', '소회의실', '화상 회의', '현장', '실험실']

function minutesAgo(value: string, now: number) {
  const minutes = Math.max(0, Math.floor((now - Date.parse(value)) / 60_000))
  return minutes < 1 ? '방금' : `${minutes}분 전`
}

/**
 * 사무실 회의실 창. 회의가 없으면 여는 양식을, 열려 있으면 대상자 확인 상태와 확인·완료(시작 전이면 취소) 버튼을 보여 준다.
 * 회의는 한 번에 하나이고, 지금 바로 또는 오늘 안의 시각에 연다. 장소는 사무실 회의실이나 다른 곳이다.
 * 사무실에 앉은 사람만 부를 수 있고, 그날 휴가·출장 중인 사람은 고를 수 없다. 팀장은 보기만 한다.
 */
export function OfficeMeetingDialog({
  profile,
  meeting,
  occupants,
  presence,
  now: liveNow,
  onStart,
  onAcknowledge,
  onEnd,
  onClose,
}: {
  profile: Profile
  meeting: OfficeMeeting | null | undefined
  /** 사무실에 앉은 사람(부를 수 있는 사람) */
  occupants: readonly SceneOccupant[]
  /** 자리 상태(휴가·출장 중인 사람은 부를 수 없다) */
  presence?: MemberPresence
  /** 지금 시각(사무실 화면 시계). 창을 연 채로 예약 시각이 지나면 ‘예정’이 ‘진행 중’으로 바뀐다. */
  now?: number
  /** 성공하면 true */
  onStart: (input: OfficeMeetingStartInput) => Promise<boolean>
  onAcknowledge: (meetingId: string) => Promise<boolean>
  onEnd: (meetingId: string) => Promise<boolean>
  onClose: () => void
}) {
  // 고를 수 있는 시각은 창을 연 때 기준으로 정해 두고(고르는 중에 목록이 바뀌지 않게), 회의 상태는 지금 시각을 따른다.
  const [openedAt] = useState(() => Date.now())
  const now = Math.max(liveNow ?? openedAt, openedAt)
  const slots = useMemo(() => meetingTimeSlots(openedAt), [openedAt])
  const [title, setTitle] = useState('')
  const [selected, setSelected] = useState<string[]>([])
  const [when, setWhen] = useState<'now' | 'later'>('now')
  const [slot, setSlot] = useState(() => slots[2]?.value ?? slots[0]?.value ?? '')
  const [placeKind, setPlaceKind] = useState<'room' | 'other'>('room')
  const [place, setPlace] = useState('')
  const [busy, setBusy] = useState(false)
  const open = isOfficeMeetingOpen(meeting, now)
  const canOpen = canOpenOfficeMeeting(profile)
  const today = businessDateKey(new Date(now))
  const candidates = occupants.filter((occupant) => occupant.profileId !== profile.id)
  const teamLeaderIds = new Set(candidates.filter((candidate) => candidate.role === 'team_leader').map((candidate) => candidate.profileId))
  const tooMany = selected.length > OFFICE_MEETING_MAX_INVITEES
  const chosenSlot = slots.find((item) => item.value === slot)
  const placeMissing = placeKind === 'other' && place.trim().length === 0

  const run = async (action: () => Promise<boolean>, closeAfter = false) => {
    setBusy(true)
    try {
      const done = await action()
      if (done && closeAfter) onClose()
    } finally {
      setBusy(false)
    }
  }

  const toggle = (profileId: string) => {
    setSelected((current) => (current.includes(profileId) ? current.filter((id) => id !== profileId) : [...current, profileId]))
  }

  if (open) {
    const mine = meetingParticipant(meeting, profile.id)
    const { confirmed, total } = meetingProgress(meeting)
    const canEnd = canEndOfficeMeeting(profile, meeting)
    const started = hasOfficeMeetingStarted(meeting, now)
    const endsAt = formatClock(meeting.expires_at)
    const place = officeMeetingPlace(meeting)
    const intro = started
      ? `${meeting.organizer_name}님이 연 회의예요. ${meetingWhenText(meeting, now)}(${minutesAgo(meeting.starts_at, now)}) · ${place}`
      : `${meeting.organizer_name}님이 잡은 회의예요. ${meetingWhenText(meeting, now)} · ${place}`
    return (
      <Modal
        className="office-meeting-dialog"
        closeLabel="회의 창 닫기"
        description={`${intro}.${endsAt ? ` 아무도 끝내지 않으면 ${endsAt}에 저절로 끝나요.` : ''}`}
        eyebrow="우리 파트 회의실"
        icon={<Users size={18} />}
        onClose={onClose}
        open
        title={meeting.title || '제목 없는 회의'}
      >
        <div className="office-meeting-body">
          <p className="office-meeting-progress">
            확인 <strong>{confirmed}</strong>/{total}명
            {!started && <span className="office-meeting-when">{formatClock(meeting.starts_at)} 시작 예정</span>}
          </p>
          <ul aria-label="회의 대상자" className="office-meeting-people">
            {meeting.participants.map((participant) => (
              <li data-confirmed={participant.acknowledged_at ? 'true' : 'false'} key={participant.user_id}>
                <span className="office-meeting-name">
                  {participant.name}
                  {participant.user_id === profile.id && <span className="office-meeting-me">나</span>}
                  {participant.user_id === meeting.organizer_id && <span className="office-meeting-host">연 사람</span>}
                </span>
                <span className="office-meeting-status">
                  {participant.acknowledged_at ? (
                    <>
                      <Check aria-hidden="true" size={14} />
                      확인
                    </>
                  ) : '확인 전'}
                </span>
              </li>
            ))}
          </ul>
        </div>
        <DialogActions
          hint={mine && !mine.acknowledged_at
            ? started
              ? `확인하면 ${place === OFFICE_MEETING_ROOM_NAME ? '내 캐릭터가 회의실로 가요.' : '내 자리에 ‘회의 중’ 표지가 서요.'}`
              : '확인해 두면 시작 시각에 알아서 회의에 들어가요.'
            : canEnd
              ? started
                ? '회의가 끝나면 회의 완료를 눌러 주세요. 기록은 남지 않아요.'
                : '회의를 하지 않게 되면 회의 취소를 눌러 주세요.'
              : undefined}
          onClose={onClose}
        >
          {mine && !mine.acknowledged_at && canOpen && (
            <button className="primary" disabled={busy} onClick={() => void run(() => onAcknowledge(meeting.id))} type="button">
              확인했어요
            </button>
          )}
          {canEnd && (
            <button
              className={mine && !mine.acknowledged_at ? 'ghost' : 'primary'}
              disabled={busy}
              onClick={() => void run(() => onEnd(meeting.id), true)}
              type="button"
            >
              {started ? '회의 완료' : '회의 취소'}
            </button>
          )}
        </DialogActions>
      </Modal>
    )
  }

  const meetingDay = when === 'later' && chosenSlot ? businessDateKey(new Date(chosenSlot.startsAt)) : today
  const startLabel = when === 'later' && chosenSlot ? `${chosenSlot.label}에` : '지금 바로'
  const placeLabel = placeKind === 'room' ? OFFICE_MEETING_ROOM_NAME : place.trim() || '다른 곳'

  return (
    <Modal
      className="office-meeting-dialog"
      closeLabel="회의 창 닫기"
      description="사무실에 앉은 사람 중에서 부를 사람을 골라요. 부름을 받은 사람이 확인하면 시작 시각에 모여요."
      dirty={title.trim().length > 0 || selected.length > 0 || place.trim().length > 0}
      eyebrow="우리 파트 회의실"
      icon={<Users size={18} />}
      onClose={onClose}
      open
      title="회의 열기"
    >
      <div className="office-meeting-body">
        {!canOpen ? (
          <p className="office-meeting-note">팀장은 회의실을 볼 수만 있어요.</p>
        ) : candidates.length === 0 ? (
          <p className="office-meeting-note">부를 수 있는 사람이 없어요. 사무실 자리 배치에서 사람을 먼저 앉혀 주세요.</p>
        ) : (
          <>
            <label className="office-meeting-field">
              <span>회의 주제(선택)</span>
              <input
                maxLength={OFFICE_MEETING_TITLE_MAX}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="예: 일탈 보고서 5분 논의"
                type="text"
                value={title}
              />
            </label>
            <fieldset className="office-meeting-choice">
              <legend>시작 시각</legend>
              <div className="office-meeting-options">
                <label>
                  <input checked={when === 'now'} name="office-meeting-when" onChange={() => setWhen('now')} type="radio" />
                  지금 바로
                </label>
                <label>
                  <input
                    checked={when === 'later'}
                    disabled={slots.length === 0}
                    name="office-meeting-when"
                    onChange={() => setWhen('later')}
                    type="radio"
                  />
                  오늘 시간 정하기
                </label>
              </div>
              {when === 'later' && (
                <label className="office-meeting-field office-meeting-inline">
                  <span>시각</span>
                  <select onChange={(event) => setSlot(event.target.value)} value={slot}>
                    {slots.map((item) => (
                      <option key={item.value} value={item.value}>{item.label}</option>
                    ))}
                  </select>
                </label>
              )}
            </fieldset>
            <fieldset className="office-meeting-choice">
              <legend>장소</legend>
              <div className="office-meeting-options">
                <label>
                  <input checked={placeKind === 'room'} name="office-meeting-place" onChange={() => setPlaceKind('room')} type="radio" />
                  {OFFICE_MEETING_ROOM_NAME}
                </label>
                <label>
                  <input checked={placeKind === 'other'} name="office-meeting-place" onChange={() => setPlaceKind('other')} type="radio" />
                  다른 곳
                </label>
              </div>
              {placeKind === 'other' && (
                <label className="office-meeting-field office-meeting-inline">
                  <span>장소 이름</span>
                  <input
                    list="office-meeting-places"
                    maxLength={OFFICE_MEETING_LOCATION_MAX}
                    onChange={(event) => setPlace(event.target.value)}
                    placeholder="예: 3층 대회의실"
                    type="text"
                    value={place}
                  />
                  <datalist id="office-meeting-places">
                    {PLACE_SUGGESTIONS.map((suggestion) => <option key={suggestion} value={suggestion} />)}
                  </datalist>
                </label>
              )}
            </fieldset>
            <fieldset className="office-meeting-picker">
              <legend>부를 사람</legend>
              <ul>
                {candidates.map((candidate) => {
                  const readOnly = candidate.role === 'team_leader'
                  const onLeave = !readOnly && leaveOn(presence, candidate.profileId, meetingDay)
                  const status = readOnly ? null : presenceOf(presence, candidate.profileId, today)
                  const blocked = readOnly || Boolean(onLeave)
                  const checked = selected.includes(candidate.profileId) && !blocked
                  return (
                    <li data-away={blocked ? 'true' : undefined} key={candidate.profileId}>
                      <label>
                        <input
                          checked={checked}
                          disabled={blocked}
                          onChange={() => toggle(candidate.profileId)}
                          type="checkbox"
                        />
                        <span>{candidate.name}</span>
                        <small>{candidate.seatIndex}번 자리</small>
                        {readOnly && <span className="office-meeting-presence">팀장(읽기 전용)은 부를 수 없어요</span>}
                        {status && (
                          <span className="office-meeting-presence" data-kind={status.kind}>
                            <PresenceIcon id={status.kind} />
                            {presenceSummary(status, today)}
                          </span>
                        )}
                      </label>
                    </li>
                  )
                })}
              </ul>
            </fieldset>
          </>
        )}
      </div>
      <DialogActions
        hint={!canOpen || candidates.length === 0
          ? undefined
          : selected.length === 0
            ? '부를 사람을 한 명 이상 골라 주세요.'
            : tooMany
              ? `한 번에 ${OFFICE_MEETING_MAX_INVITEES}명까지 부를 수 있어요.`
              : placeMissing
                ? '회의할 곳을 적어 주세요.'
                : `${selected.length}명을 불러 ${startLabel} ${placeLabel}에서 해요. 시작 3시간 뒤 저절로 끝나요.`}
        onClose={onClose}
      >
        {canOpen && candidates.length > 0 && (
          <button
            aria-busy={busy || undefined}
            className="primary"
            disabled={busy || selected.length === 0 || tooMany || placeMissing || (when === 'later' && !chosenSlot)}
            onClick={() => void run(() => onStart({
              title,
              participantIds: selected.filter((id) => !leaveOn(presence, id, meetingDay) && !teamLeaderIds.has(id)),
              startsAt: when === 'later' && chosenSlot ? chosenSlot.startsAt : null,
              location: placeKind === 'other' ? place : '',
            }))}
            type="button"
          >
            {busy ? '여는 중…' : when === 'later' ? '회의 잡기' : '회의 시작'}
          </button>
        )}
      </DialogActions>
    </Modal>
  )
}
