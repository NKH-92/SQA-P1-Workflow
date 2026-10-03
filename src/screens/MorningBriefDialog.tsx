import { useEffect, useState } from 'react'
import { Modal, DialogActions } from '../components/ui'
import type { AppData, Profile } from '../types'
import { useBusinessToday } from '../hooks/useBusinessToday'
import { businessDateKey } from '../lib/businessTime'
import { morningBriefEnabled, hasSeenMorningBrief, markMorningBriefSeen } from '../lib/morningBrief'
import { sectionNewsItems, sectionReadMark, unseenSectionItems } from '../lib/sectionNews'
import { selectMemberHomeItems } from '../features/dashboard/memberHomeModel'
import { selectLeaderPriorityQueue } from '../features/dashboard/prioritySelectors'
import { useTeamSummaries } from '../hooks/useTeamSummaries'
import { buildDeskCounts } from '../features/office/officeAlerts'

export function MorningBriefDialog({ profile, data }: { profile: Profile; data: AppData }) {
  const today = useBusinessToday()
  const date = businessDateKey(today)
  const [open, setOpen] = useState(false)
  const { teamMembers } = useTeamSummaries(data)
  useEffect(() => {
    if (profile.role === 'team_leader' || data.sectionReadMarks === undefined || !morningBriefEnabled(profile.id) || hasSeenMorningBrief(profile.id, date)) return
    const show = () => {
      if (document.querySelector('[role="dialog"]') || document.visibilityState === 'hidden' || hasSeenMorningBrief(profile.id, date)) return
      markMorningBriefSeen(profile.id, date)
      setOpen(true)
    }
    const observer = new MutationObserver(show)
    observer.observe(document.body, { childList: true, subtree: true })
    const timer = setTimeout(show, 0)
    return () => { clearTimeout(timer); observer.disconnect() }
  }, [profile.id, profile.role, date, data.sectionReadMarks])
  if (!open) return null
  const news = unseenSectionItems(sectionNewsItems(profile, data, 'announcements'), sectionReadMark(data, profile, 'announcements'), true)
  const titles = news.slice(0, 3).map(n => data.announcements.find(a => a.id === n.target)?.title).filter(Boolean)
  const items = profile.role === 'leader' ? selectLeaderPriorityQueue(data, teamMembers) : selectMemberHomeItems(data, profile, today)
  const pending = [...buildDeskCounts(profile, data).values()].reduce((sum, count) => sum + count, 0)
  const meeting = data.officeMeeting
  const todayMeeting = meeting && businessDateKey(new Date(meeting.starts_at)) === date ? meeting : null
  return <Modal open title="아침 조회" onClose={() => setOpen(false)} className="morning-brief-dialog">
    <ul className="morning-brief-list">
      <li data-px="row"><strong>새 공지 {news.length}건</strong>{titles.length > 0 && <ul>{titles.map((title, i) => <li key={i}>{title}</li>)}</ul>}</li>
      <li data-px="row">내 대기 {pending}건</li>
      <li data-px="row">오늘 마감 {items.filter(item => item.days === 0).length}건</li>
      <li data-px="row">오늘 회의 · {todayMeeting?.title || (todayMeeting ? '제목 없는 회의' : '예정된 회의가 없어요')}</li>
    </ul>
    <DialogActions><button className="primary" onClick={() => setOpen(false)} type="button">확인하기</button></DialogActions>
  </Modal>
}
