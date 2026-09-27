import { useMemo, useState } from 'react'
import { MapPin } from 'lucide-react'
import { DialogActions, Modal } from '../../../components/ui'
import {
  leaveOn,
  leavePeriodLabel,
  MEMBER_LEAVE_MAX_DAYS,
  MEMBER_LEAVE_NOTE_MAX,
  PRESENCE_TEXT,
  statusOf,
  upcomingLeaves,
  type MemberLeaveInput,
} from '../../../data/validation/memberPresence'
import { businessDateKey } from '../../../lib/businessTime'
import { dateOnlyTime } from '../../../lib/dates'
import type { MemberLeaveKind, MemberPresence, MemberStatusKind } from '../../../types'
import { PresenceIcon } from './PresenceIcon'

const STATUS_CHOICES: ReadonlyArray<{ value: MemberStatusKind | null; label: string; hint: string }> = [
  { value: null, label: '자리에 있음', hint: '기본 상태' },
  { value: 'meeting', label: PRESENCE_TEXT.meeting.label, hint: '다른 곳 회의' },
  { value: 'field', label: PRESENCE_TEXT.field.label, hint: '제조소·창고' },
  { value: 'lab', label: PRESENCE_TEXT.lab.label, hint: '시험·분석' },
  { value: 'away', label: PRESENCE_TEXT.away.label, hint: '잠깐 자리 비움' },
]

const LEAVE_CHOICES: ReadonlyArray<{ value: MemberLeaveKind; label: string }> = [
  { value: 'vacation', label: '휴가' },
  { value: 'trip', label: '출장' },
]

export type PresencePerson = { id: string; name: string }

function addDays(dateKey: string, days: number) {
  const time = dateOnlyTime(dateKey)
  return time == null ? dateKey : new Date(time + days * 86_400_000).toISOString().slice(0, 10)
}

/** 기간 입력의 문제를 짧게 알려 준다(서버가 한 번 더 확인한다). 문제가 없으면 null */
function leaveProblem(startsOn: string, endsOn: string, today: string): string | null {
  const start = dateOnlyTime(startsOn)
  const end = dateOnlyTime(endsOn)
  if (start == null || end == null) return '시작일과 마지막 날을 골라 주세요.'
  if (end < start) return '마지막 날이 시작일보다 빨라요.'
  if (endsOn < today) return '지난 기간은 등록할 수 없어요.'
  if ((end - start) / 86_400_000 > MEMBER_LEAVE_MAX_DAYS - 1) return `한 번에 ${MEMBER_LEAVE_MAX_DAYS}일까지 등록할 수 있어요.`
  return null
}

/**
 * 내 상태 창. 하루 중 잠깐 비운 상태(회의·현장·실험실·기타 부재)는 누르면 바로 바뀌고 해제할 때까지 유지된다.
 * 휴가·출장은 기간을 정해 등록하고, 그 기간에는 사무실 자리에 휴가·출장 표지가 선다.
 * 파트장은 다른 파트장·파트원의 상태도 바꿀 수 있다(아플 때 대신 등록하는 등).
 */
export function MemberPresenceDialog({
  people,
  initialProfileId,
  presence,
  onSetStatus,
  onAddLeave,
  onDeleteLeave,
  onClose,
}: {
  /** 상태를 바꿀 수 있는 사람(첫 사람이 나). 파트원은 자기만 있다. */
  people: readonly PresencePerson[]
  initialProfileId: string
  presence: MemberPresence | undefined
  /** 성공하면 true */
  onSetStatus: (person: PresencePerson, status: MemberStatusKind | null) => Promise<boolean>
  onAddLeave: (person: PresencePerson, input: MemberLeaveInput) => Promise<boolean>
  onDeleteLeave: (person: PresencePerson, leaveId: string, kind: MemberLeaveKind) => Promise<boolean>
  onClose: () => void
}) {
  const [today] = useState(() => businessDateKey(new Date()))
  const [targetId, setTargetId] = useState(() => (people.some((person) => person.id === initialProfileId) ? initialProfileId : people[0]?.id ?? ''))
  const [busy, setBusy] = useState(false)
  const [kind, setKind] = useState<MemberLeaveKind>('vacation')
  const [startsOn, setStartsOn] = useState(today)
  const [endsOn, setEndsOn] = useState(today)
  const [note, setNote] = useState('')
  const target = people.find((person) => person.id === targetId) ?? people[0]
  const isSelf = target?.id === people[0]?.id
  const current = target ? statusOf(presence, target.id)?.status ?? null : null
  const leaveToday = target ? leaveOn(presence, target.id, today) : undefined
  const leaves = useMemo(() => (target ? upcomingLeaves(presence, target.id, today) : []), [presence, target, today])
  const problem = leaveProblem(startsOn, endsOn, today)
  const dirty = note.trim().length > 0

  if (!target) return null

  const run = async (action: () => Promise<boolean>, after?: () => void) => {
    setBusy(true)
    try {
      if (await action()) after?.()
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      className="presence-dialog"
      closeLabel="상태 창 닫기"
      description="사무실 자리에 캐릭터 대신 상태 표지가 서요. 잠깐 비운 상태는 해제할 때까지, 휴가·출장은 정한 기간 동안 보여요."
      dirty={dirty}
      eyebrow="우리 파트 사무실"
      icon={<MapPin size={18} />}
      onClose={onClose}
      open
      title={isSelf ? '내 상태' : `${target.name}님 상태`}
    >
      <div className="presence-body">
        {people.length > 1 && (
          <label className="presence-field presence-person">
            <span>누구의 상태인가요?</span>
            <select disabled={busy} onChange={(event) => setTargetId(event.target.value)} value={target.id}>
              {people.map((person, index) => (
                <option key={person.id} value={person.id}>{index === 0 ? `${person.name}(나)` : person.name}</option>
              ))}
            </select>
          </label>
        )}

        <section aria-labelledby="presence-now-title" className="presence-section">
          <h3 id="presence-now-title">지금 상태</h3>
          <div aria-label="지금 상태 고르기" className="presence-choices" role="group">
            {STATUS_CHOICES.map((choice) => {
              const selected = current === choice.value
              return (
                <button
                  aria-pressed={selected}
                  className="presence-choice"
                  disabled={busy}
                  key={choice.label}
                  onClick={() => {
                    if (!selected) void run(() => onSetStatus(target, choice.value))
                  }}
                  type="button"
                >
                  <PresenceIcon id={choice.value ?? 'present'} />
                  <span>{choice.label}</span>
                  <small>{choice.hint}</small>
                </button>
              )
            })}
          </div>
          {leaveToday && (
            <p className="presence-note">
              {`오늘은 ${PRESENCE_TEXT[leaveToday.kind].short} 기간이라 사무실에는 ${PRESENCE_TEXT[leaveToday.kind].short}로 보여요.`}
            </p>
          )}
        </section>

        <section aria-labelledby="presence-leave-title" className="presence-section">
          <h3 id="presence-leave-title">휴가·출장</h3>
          {leaves.length === 0 ? (
            <p className="presence-empty">등록한 휴가·출장이 없어요.</p>
          ) : (
            <ul aria-label="등록한 휴가·출장" className="presence-leaves">
              {leaves.map((leave) => (
                <li key={leave.id}>
                  <PresenceIcon id={leave.kind} />
                  <span className="presence-leave-text">
                    <strong>{PRESENCE_TEXT[leave.kind].short}</strong>
                    <span>{leavePeriodLabel(leave)}{leave.starts_on <= today ? ' · 지금' : ''}</span>
                    {leave.note && <small>{leave.note}</small>}
                  </span>
                  <button
                    aria-label={`${PRESENCE_TEXT[leave.kind].short} ${leavePeriodLabel(leave)} 취소`}
                    className="ghost compact"
                    disabled={busy}
                    onClick={() => void run(() => onDeleteLeave(target, leave.id, leave.kind))}
                    type="button"
                  >
                    취소
                  </button>
                </li>
              ))}
            </ul>
          )}
          <fieldset className="presence-leave-form">
            <legend>새로 등록</legend>
            <div aria-label="종류" className="segmented presence-kind" role="group">
              {LEAVE_CHOICES.map((choice) => (
                <button
                  aria-pressed={kind === choice.value}
                  className={kind === choice.value ? 'selected' : ''}
                  key={choice.value}
                  onClick={() => setKind(choice.value)}
                  type="button"
                >
                  <PresenceIcon id={choice.value} />
                  {choice.label}
                </button>
              ))}
            </div>
            <div className="presence-dates">
              <label className="presence-field">
                <span>시작일</span>
                <input
                  min={today}
                  onChange={(event) => {
                    const value = event.target.value
                    setStartsOn(value)
                    if (value && endsOn < value) setEndsOn(value)
                  }}
                  type="date"
                  value={startsOn}
                />
              </label>
              <label className="presence-field">
                <span>마지막 날</span>
                <input max={addDays(startsOn || today, MEMBER_LEAVE_MAX_DAYS - 1)} min={startsOn || today} onChange={(event) => setEndsOn(event.target.value)} type="date" value={endsOn} />
              </label>
            </div>
            <label className="presence-field">
              <span>메모(선택)</span>
              <input
                maxLength={MEMBER_LEAVE_NOTE_MAX}
                onChange={(event) => setNote(event.target.value)}
                placeholder={kind === 'trip' ? '예: 오송 공장 실사' : '예: 오후 반차'}
                type="text"
                value={note}
              />
            </label>
            <div className="presence-leave-actions">
              <small aria-live="polite" className="presence-hint">{problem ?? `${leavePeriodLabel({ starts_on: startsOn, ends_on: endsOn })} 동안 ${LEAVE_CHOICES.find((choice) => choice.value === kind)?.label}로 보여요.`}</small>
              <button
                className="primary compact"
                disabled={busy || Boolean(problem)}
                onClick={() => void run(
                  () => onAddLeave(target, { profileId: target.id, kind, startsOn, endsOn, note }),
                  () => setNote(''),
                )}
                type="button"
              >
                등록
              </button>
            </div>
          </fieldset>
        </section>
      </div>
      <DialogActions onClose={onClose}>{null}</DialogActions>
    </Modal>
  )
}
