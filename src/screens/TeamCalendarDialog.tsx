import { useState } from 'react'
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react'
import { Modal } from '../components/ui'
import type { MemberPresence } from '../types'
import { useBusinessToday } from '../hooks/useBusinessToday'
import { businessDateKey } from '../lib/businessTime'
import { leavesOnDay, monthDays, moveMonth } from '../features/office/teamCalendar'
import { leavePeriodLabel } from '../data/validation/memberPresence'
import './TeamCalendar.css'

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토']
const kindLabel = { vacation: '휴가', trip: '출장' }

export function TeamCalendarDialog({ presence, onClose, onManage }: {
  presence?: MemberPresence
  onClose(): void
  onManage?: () => void
}) {
  const today = businessDateKey(useBusinessToday())
  const [month, setMonth] = useState(today.slice(0, 7))
  const [selected, setSelected] = useState(today)
  const [person, setPerson] = useState('')
  const leaves = (presence?.leaves ?? []).filter(leave => leave.ends_on >= today)
  const people = [...new Map(leaves.map(leave => [leave.profile_id, leave.name])).entries()]
    .sort((a, b) => a[1].localeCompare(b[1], 'ko'))
  const filtered = person ? leaves.filter(leave => leave.profile_id === person) : leaves
  const cells = monthDays(month)
  const selectedLeaves = leavesOnDay(filtered, selected)
  const title = `${Number(month.slice(0, 4))}년 ${Number(month.slice(5))}월`
  const changeMonth = (next: string) => { setMonth(next); setSelected(next === today.slice(0, 7) ? today : `${next}-01`) }
  return <Modal open title="파트원 일정" icon={<CalendarDays aria-hidden="true" size={20} />} onClose={onClose} className="team-calendar-dialog"
    description="진행 중이거나 예정된 휴가·출장을 함께 확인해요. 지난 일정은 표시하지 않아요.">
    <div className="team-calendar-body">
      <div className="team-calendar-toolbar">
        <div className="team-calendar-month">
          <button className="icon-button" aria-label="이전 달" disabled={month <= today.slice(0, 7)} onClick={() => changeMonth(moveMonth(month, -1))} type="button"><ChevronLeft size={18} aria-hidden="true" /></button>
          <strong aria-live="polite">{title}</strong>
          <button className="icon-button" aria-label="다음 달" onClick={() => changeMonth(moveMonth(month, 1))} type="button"><ChevronRight size={18} aria-hidden="true" /></button>
          <button className="ghost compact" onClick={() => changeMonth(today.slice(0, 7))} type="button">오늘</button>
        </div>
        <select aria-label="일정 볼 파트원" value={person} onChange={event => setPerson(event.target.value)}>
          <option value="">전체 파트원</option>{people.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
        </select>
      </div>
      {presence === undefined ? <p role="status">일정을 불러오고 있어요.</p> : <>
        <div className="team-calendar-legend"><span data-kind="vacation">휴가</span><span data-kind="trip">출장</span><small>날짜를 누르면 모두 볼 수 있어요.</small></div>
        <table className="team-calendar-grid" aria-label={`${title} 휴가·출장 일정`}>
          <thead><tr>{WEEKDAYS.map(day => <th key={day} scope="col">{day}</th>)}</tr></thead>
          <tbody>{Array.from({ length: cells.length / 7 }, (_, week) => <tr key={week}>{cells.slice(week * 7, week * 7 + 7).map((day, index) => {
            const events = day && day >= today ? leavesOnDay(filtered, day) : []
            return <td key={day ?? `empty-${index}`}>{day && <button type="button" disabled={day < today} aria-current={day === today ? 'date' : undefined}
              aria-pressed={selected === day} aria-label={`${Number(day.slice(5, 7))}월 ${Number(day.slice(8))}일${day === today ? ', 오늘' : ''}, ${events.length}건`}
              onClick={() => setSelected(day)}>
              <span className="team-calendar-day">{Number(day.slice(8))}</span>
              {events.slice(0, 3).map(leave => <span className="team-calendar-event" data-kind={leave.kind} key={leave.id}>{leave.name} · {kindLabel[leave.kind]}</span>)}
              {events.length > 3 && <small>외 {events.length - 3}건</small>}
            </button>}</td>
          })}</tr>)}</tbody>
        </table>
        <section className="team-calendar-detail" aria-label="선택한 날짜 일정" data-px="panel">
          <h3 data-px="title">{Number(selected.slice(5, 7))}월 {Number(selected.slice(8))}일</h3>
          {selectedLeaves.length ? <ul>{selectedLeaves.map(leave => <li data-px="row" key={leave.id}>
            <span className="team-calendar-event" data-kind={leave.kind}>{kindLabel[leave.kind]}</span><strong>{leave.name}</strong><span>{leavePeriodLabel(leave)}</span>
          </li>)}</ul> : <p>등록된 휴가·출장이 없어요.</p>}
        </section>
      </>}
      {onManage && <button className="primary" type="button" onClick={onManage}>내 휴가·출장 등록하기</button>}
    </div>
  </Modal>
}
