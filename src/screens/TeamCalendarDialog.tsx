import { useMemo, useState } from 'react'
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react'
import { Modal } from '../components/ui'
import type { MemberLeave, MemberPresence } from '../types'
import { useBusinessToday } from '../hooks/useBusinessToday'
import { businessDateKey } from '../lib/businessTime'
import { leavesByDay, monthDays, moveMonth } from '../features/office/teamCalendar'
import { leavePeriodLabel, leaveTypeLabel } from '../data/validation/memberPresence'
import './TeamCalendar.css'

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토']
const NO_LEAVES: readonly MemberLeave[] = []

export function TeamCalendarDialog({ presence, onClose, onManage }: {
  presence?: MemberPresence
  onClose(): void
  onManage?: () => void
}) {
  const today = businessDateKey(useBusinessToday())
  const currentMonth = today.slice(0, 7)
  const [selectedDay, setSelectedDay] = useState(today)
  const [selectedPerson, setSelectedPerson] = useState('')
  const selected = selectedDay < today ? today : selectedDay
  const month = selected.slice(0, 7)
  const allLeaves = presence?.leaves ?? NO_LEAVES
  const { leaves, people } = useMemo(() => {
    const leaves = allLeaves.filter(leave => leave.ends_on >= today)
    const people = [...new Map(leaves.map(leave => [leave.profile_id, leave.name]))]
      .sort((a, b) => a[1].localeCompare(b[1], 'ko'))
    return { leaves, people }
  }, [allLeaves, today])
  const person = people.some(([id]) => id === selectedPerson) ? selectedPerson : ''
  const cells = useMemo(() => monthDays(month), [month])
  const eventsByDay = useMemo(() => leavesByDay(
    person ? leaves.filter(leave => leave.profile_id === person) : leaves,
    cells.filter((day): day is string => day !== null && day >= today),
  ), [cells, leaves, person, today])
  const selectedLeaves = eventsByDay.get(selected) ?? NO_LEAVES
  const title = `${Number(month.slice(0, 4))}년 ${Number(month.slice(5))}월`
  const changeMonth = (next: string) => setSelectedDay(next === currentMonth ? today : `${next}-01`)
  return <Modal open title="파트원 일정" icon={<CalendarDays aria-hidden="true" size={20} />} onClose={onClose} className="team-calendar-dialog"
    description="진행 중이거나 예정된 휴가·출장을 함께 확인해요. 지난 일정은 표시하지 않아요.">
    <div className="team-calendar-body">
      <div className="team-calendar-toolbar">
        <div className="team-calendar-month">
          <button className="icon-button" aria-label="이전 달" disabled={month <= currentMonth} onClick={() => changeMonth(moveMonth(month, -1))} type="button"><ChevronLeft size={18} aria-hidden="true" /></button>
          <strong aria-live="polite">{title}</strong>
          <button className="icon-button" aria-label="다음 달" onClick={() => changeMonth(moveMonth(month, 1))} type="button"><ChevronRight size={18} aria-hidden="true" /></button>
          <button className="ghost compact" onClick={() => setSelectedDay(today)} type="button">오늘</button>
        </div>
        <select aria-label="일정 볼 파트원" value={person} onChange={event => setSelectedPerson(event.target.value)}>
          <option value="">전체 파트원</option>{people.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
        </select>
      </div>
      {presence === undefined ? <p role="status">일정을 불러오고 있어요.</p> : <>
        <div className="team-calendar-legend"><span data-kind="vacation">휴가</span><span data-kind="trip">출장</span><small>날짜를 누르면 아래에서 기간과 사유를 볼 수 있어요.</small></div>
        <table className="team-calendar-grid" aria-label={`${title} 휴가·출장 일정`}>
          <thead><tr>{WEEKDAYS.map(day => <th key={day} scope="col">{day}</th>)}</tr></thead>
          <tbody>{Array.from({ length: cells.length / 7 }, (_, week) => <tr key={week}>{cells.slice(week * 7, week * 7 + 7).map((day, index) => {
            const events = (day && eventsByDay.get(day)) || NO_LEAVES
            return <td key={day ?? `empty-${index}`}>{day && <button type="button" disabled={day < today} aria-current={day === today ? 'date' : undefined}
              aria-pressed={selected === day} aria-label={`${Number(day.slice(5, 7))}월 ${Number(day.slice(8))}일${day === today ? ', 오늘' : ''}, ${events.length}건`}
              onClick={() => setSelectedDay(day)}>
              <span className="team-calendar-day">{Number(day.slice(8))}</span>
              {events.slice(0, 3).map(leave => <span className="team-calendar-event" data-kind={leave.kind} key={leave.id}>{leave.name} - {leaveTypeLabel(leave)}</span>)}
              {events.length > 3 && <small>외 {events.length - 3}건</small>}
            </button>}</td>
          })}</tr>)}</tbody>
        </table>
        <section className="team-calendar-detail" aria-label="선택한 날짜 일정" aria-live="polite" data-px="panel">
          <h3 data-px="title">{Number(selected.slice(5, 7))}월 {Number(selected.slice(8))}일</h3>
          {selectedLeaves.length ? <ul>{selectedLeaves.map(leave => <li data-px="row" key={leave.id}>
            <div className="team-calendar-detail-heading">
              <strong>{leave.name}</strong>
              <span className="team-calendar-event" data-kind={leave.kind}>{leaveTypeLabel(leave)}</span>
            </div>
            <dl>
              <div><dt>기간</dt><dd>{leavePeriodLabel(leave)}</dd></div>
              <div><dt>사유</dt><dd>{leave.note.trim() || '등록된 사유가 없어요.'}</dd></div>
            </dl>
          </li>)}</ul> : <p>등록된 휴가·출장이 없어요.</p>}
        </section>
      </>}
      {onManage && <button className="primary" type="button" onClick={onManage}>내 휴가·출장 등록하기</button>}
    </div>
  </Modal>
}
