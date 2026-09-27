import { useEffect, useState } from 'react'
import { Users } from 'lucide-react'
import {
  canEndOfficeMeeting,
  hasOfficeMeetingStarted,
  isOfficeMeetingOpen,
  meetingParticipant,
} from '../data/validation/officeMeeting'
import { meetingSummaryParts } from '../features/office/officeMeetingModel'
import { formatClock } from '../lib/format'
import type { OfficeMeeting, Profile } from '../types'

/**
 * 사무실 회의 안내 띠. 어느 화면에 있든 부름을 받은 사람은 바로 ‘확인했어요’를 누를 수 있고,
 * 회의에 들어간 사람에게는 확인 현황을, 연 사람·파트장에게는 ‘회의 완료’(시작 전이면 ‘회의 취소’)를 보여 준다.
 * 예약한 회의는 시작 시각과 장소를 함께 알린다. 회의와 상관없는 사람에게는 보이지 않는다(사무실 회의실 간판으로 볼 수 있다).
 */
export function OfficeMeetingBanner({
  profile,
  meeting,
  onAcknowledge,
  onEnd,
}: {
  profile: Profile
  meeting: OfficeMeeting | null | undefined
  onAcknowledge: (meetingId: string) => Promise<boolean>
  onEnd: (meetingId: string) => Promise<boolean>
}) {
  const [busy, setBusy] = useState(false)
  const [now, setNow] = useState(() => Date.now())
  const startsAt = meeting ? Date.parse(meeting.starts_at) : NaN
  // 예약한 회의가 시작하면 ‘예정’이 ‘회의 중’으로 바뀌도록 그때 한 번 다시 그린다.
  useEffect(() => {
    if (!Number.isFinite(startsAt) || startsAt <= Date.now()) return
    const timer = window.setTimeout(() => setNow(Date.now()), Math.min(startsAt - Date.now() + 50, 2_147_000_000))
    return () => window.clearTimeout(timer)
  }, [startsAt])

  if (!isOfficeMeetingOpen(meeting, now)) return null
  const mine = meetingParticipant(meeting, profile.id)
  const canEnd = canEndOfficeMeeting(profile, meeting)
  if (!mine && !canEnd) return null

  const started = hasOfficeMeetingStarted(meeting, now)
  const confirmed = meeting.participants.filter((participant) => participant.acknowledged_at).length
  const summary = meetingSummaryParts(meeting, now).join(' · ')
  const waiting = Boolean(mine && !mine.acknowledged_at)
  const run = async (action: () => Promise<boolean>) => {
    setBusy(true)
    try {
      await action()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      aria-live="polite"
      className="office-meeting-banner"
      data-scheduled={started ? undefined : 'true'}
      data-waiting={waiting ? 'true' : undefined}
      role="status"
    >
      <Users aria-hidden="true" size={16} />
      <p>
        {waiting ? (
          <>
            <strong>{meeting.organizer_name}님이 회의를 요청했어요</strong>
            <span>{` · ${summary}`}</span>
          </>
        ) : (
          <>
            <strong>{started ? '회의 중' : `${formatClock(meeting.starts_at)} 회의 예정`}</strong>
            <span>{` · ${summary} · 확인 ${confirmed}/${meeting.participants.length}명`}</span>
          </>
        )}
      </p>
      <div className="office-meeting-banner-actions">
        {waiting && (
          <button className="primary compact" disabled={busy} onClick={() => void run(() => onAcknowledge(meeting.id))} type="button">
            확인했어요
          </button>
        )}
        {canEnd && (
          <button className="ghost compact" disabled={busy} onClick={() => void run(() => onEnd(meeting.id))} type="button">
            {started ? '회의 완료' : '회의 취소'}
          </button>
        )}
      </div>
    </div>
  )
}
