import { useMemo, useState } from 'react'
import { Armchair, ChevronRight, ListTodo, MapPin, Megaphone, PanelRightClose, Send, Users } from 'lucide-react'
import { canManageTeamData } from '../domain/permissions'
import { selectMemberHomeItems } from '../features/dashboard/memberHomeModel'
import { selectLeaderPriorityQueue } from '../features/dashboard/prioritySelectors'
import { useBusinessToday } from '../hooks/useBusinessToday'
import { useTeamSummaries } from '../hooks/useTeamSummaries'
import { formatClock, formatDateWithWeekday } from '../lib/format'
import { requestComposer } from '../lib/navigation'
import type { AppData, Profile } from '../types'
import type { TabId } from '../app/types'
import type { useOfficeHome } from './useOfficeHome'
import { openUnassignedProducts } from './homeLinks'
import './HomeOffice.css'
const QUEST_PREVIEW_COUNT = 5
type QuestItem = {
  id: string
  kind: string
  title: string
  meta: string
  statusLabel: string
  statusTone: string
  urgency: 'urgent' | 'warning' | 'normal'
  open: () => void
}

export type QuestProps = {
  profile: Profile; data: AppData; leaderMode: boolean; setActiveTab(tab: TabId, id?: string): void
  office?: ReturnType<typeof useOfficeHome>; onOpenPresence?: () => void
  collapsed?: boolean; setQuestCollapsed?: (next: boolean) => void
}
export function QuestContent({ profile, data, leaderMode, setActiveTab, office, onOpenPresence, collapsed = false, setQuestCollapsed = () => {} }: QuestProps) {
  const progress = office?.meetingProgress
  const meetingStarted = office?.meetingStarted
  const meetingClock = office?.meeting ? formatClock(office.meeting.starts_at) : null
  const canEdit = office?.canEdit
  const layoutLoaded = office?.layoutLoaded
  const canManage = canManageTeamData(profile)
  const [showAll, setShowAll] = useState(false)
  const today = useBusinessToday()
  const { teamMembers } = useTeamSummaries(data)

  const quests = useMemo<QuestItem[]>(() => {
    if (leaderMode) {
      return selectLeaderPriorityQueue(data, teamMembers).map((item) => ({
        ...item,
        open: () => (item.category === 'product' ? openUnassignedProducts(setActiveTab) : setActiveTab(item.targetTab, item.entityId)),
      }))
    }
    return selectMemberHomeItems(data, profile, today).map((item) => ({
      ...item,
      open: () => setActiveTab(item.targetTab, item.entityId),
    }))
  }, [data, leaderMode, profile, setActiveTab, teamMembers, today])
  const visible = showAll ? quests : quests.slice(0, QUEST_PREVIEW_COUNT)
  const hidden = quests.length - visible.length

  const total = quests.length
  const title = !leaderMode
    ? total > 0 ? `오늘 할 일 ${total}건` : '지금 할 일이 없어요'
    : canManage
      ? total > 0 ? `오늘 처리할 일 ${total}건` : '오늘 처리할 일이 없어요'
      : total > 0 ? `파트에서 처리할 일 ${total}건` : '파트에 밀린 일이 없어요'

  return (
      <aside aria-labelledby="office-quest-title" className="office-quest" id="office-quest">
        {collapsed ? (
          <button
            aria-controls="office-quest"
            aria-expanded="false"
            aria-label={`오늘 할 일 ${total}건`}
            className="office-quest-tab"
            onClick={() => setQuestCollapsed(false)}
            type="button"
          >
            <ListTodo aria-hidden="true" size={16} />
            <span id="office-quest-title">오늘 할 일</span>
            <strong>{total}</strong>
          </button>
        ) : (
          <>
            <header className="office-quest-head">
              <div>
                <p className="office-quest-greeting">안녕하세요, {profile.name}님 · {formatDateWithWeekday(today)}</p>
                <h2 id="office-quest-title">{title}</h2>
              </div>
              <button
                aria-controls="office-quest"
                aria-expanded="true"
                aria-label="오늘 할 일 접기"
                className="icon-button small"
                onClick={() => setQuestCollapsed(true)}
                title="오늘 할 일 접기"
                type="button"
              >
                <PanelRightClose aria-hidden="true" size={16} />
              </button>
            </header>
            <div className="office-quest-actions">
              {leaderMode && canManage && (
                <button
                  className="primary compact"
                  onClick={() => {
                    requestComposer('announcements')
                    setActiveTab('announcements')
                  }}
                  type="button"
                >
                  <Megaphone aria-hidden="true" size={15} />
                  새 공지 쓰기
                </button>
              )}
              {!leaderMode && (
                <button
                  className="primary compact"
                  onClick={() => {
                    requestComposer('reviews')
                    setActiveTab('reviews')
                  }}
                  type="button"
                >
                  <Send aria-hidden="true" size={15} />
                  검토요청 쓰기
                </button>
              )}
              {office && <><button
                aria-label={progress
                  ? `${meetingStarted ? '회의 중' : `${meetingClock} 회의 예정`}, 확인 ${progress.confirmed}/${progress.total}명${office.awaitingMeeting ? ', 회의 요청 받음' : ''}`
                  : '회의 열기'}
                className="ghost compact office-meeting-button"
                data-alert={office.awaitingMeeting ? 'new' : progress ? 'todo' : undefined}
                onClick={office.openMeeting}
                type="button"
              >
                <Users aria-hidden="true" size={15} />
                {progress ? `${meetingStarted ? '회의 중' : `${meetingClock} 회의`} ${progress.confirmed}/${progress.total}` : '회의'}
              </button>
              {canEdit && (
                <button className="ghost compact" disabled={!layoutLoaded} onClick={office.openSeatEditor} type="button">
                  <Armchair aria-hidden="true" size={15} />
                  자리 배치
                </button>
              )}
              </>}
            </div>
            {office && <div aria-label="자리 현황" className="office-quest-presence" role="group">
              <MapPin aria-hidden="true" size={15} />
              <span className="office-quest-presence-text">
                <small>자리 현황</small>
                <strong>{office.awaySummary ? `자리 비움 ${office.absences.length}명 · ${office.awaySummary}` : '모두 자리에 있어요'}</strong>
              </span>
              {onOpenPresence && (
                <button className="ghost compact" onClick={onOpenPresence} type="button">
                  내 상태
                </button>
              )}
            </div>}
            {quests.length === 0 ? (
              <p className="office-quest-empty">급한 일이 없어요. 사무실을 둘러보거나 기물을 눌러 화면으로 가 보세요.</p>
            ) : (
              <ol className="office-quest-list">
                {visible.map((item) => (
                  <li data-urgency={item.urgency} key={item.id}>
                    <button onClick={item.open} type="button">
                      <span className="office-quest-copy">
                        <strong>{item.title}</strong>
                        <small>{item.kind}{item.meta ? ` · ${item.meta}` : ''}</small>
                      </span>
                      <span className="office-quest-due" data-tone={item.statusTone}>{item.statusLabel}</span>
                      <ChevronRight aria-hidden="true" className="office-quest-arrow" size={15} />
                    </button>
                  </li>
                ))}
              </ol>
            )}
            {hidden > 0 && (
              <button className="office-quest-more" onClick={() => setShowAll(true)} type="button">
                나머지 {hidden}건 보기
              </button>
            )}
            {showAll && quests.length > QUEST_PREVIEW_COUNT && (
              <button className="office-quest-more" onClick={() => setShowAll(false)} type="button">
                처음 {QUEST_PREVIEW_COUNT}건만 보기
              </button>
            )}
          </>
        )}
      </aside>
  )
}
