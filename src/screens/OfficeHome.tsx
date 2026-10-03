import { useMemo, useState } from 'react'
import { Armchair, ChevronRight, ListTodo, MapPin, Megaphone, PanelRightClose, Send, Users } from 'lucide-react'
import type { MutateFn, TabId } from '../app/types'
import type { AppDataUpdater } from '../data/repositories/appDataUpdater'
import { canManageTeamData } from '../domain/permissions'
import { selectMemberHomeItems } from '../features/dashboard/memberHomeModel'
import { selectLeaderPriorityQueue } from '../features/dashboard/prioritySelectors'
import { OfficeScene } from '../features/office/components/OfficeScene'
import { WORLD_CAMERA } from '../features/office/officeGeometry'
import { useBusinessToday } from '../hooks/useBusinessToday'
import { useTeamSummaries } from '../hooks/useTeamSummaries'
import { formatClock, formatDateWithWeekday } from '../lib/format'
import { requestComposer } from '../lib/navigation'
import type { AppData, Profile } from '../types'
import { openUnassignedProducts } from './homeLinks'
import { useOfficeHome } from './useOfficeHome'
import './HomeOffice.css'

const QUEST_STORAGE_KEY = 'ui:office-quest-collapsed'
/** ‘오늘 할 일’ 창에 처음 보여 줄 수. 나머지는 펼쳐 본다. */
const QUEST_PREVIEW_COUNT = 5
/** 이 폭보다 좁으면 ‘오늘 할 일’ 창을 접은 채로 시작한다(사무실이 먼저 보이게). */
const QUEST_OPEN_MIN_WIDTH = 1100

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

function readQuestCollapsed() {
  try {
    const stored = window.localStorage.getItem(QUEST_STORAGE_KEY)
    if (stored === '1' || stored === '0') return stored === '1'
  } catch {
    // 저장소를 쓸 수 없으면 화면 폭으로 정한다.
  }
  return window.innerWidth < QUEST_OPEN_MIN_WIDTH
}

/**
 * 전체 화면 사무실 홈. 게임 화면처럼 사무실이 화면을 채우고, 오른쪽 ‘오늘 할 일’(퀘스트) 창에서
 * 급한 일부터 바로 갈 수 있다. 위 메뉴(검색·알림·기존 화면 전환)는 Shell이 그린다.
 */
export function OfficeHome({
  entityId,
  profile,
  data,
  leaderMode,
  setActiveTab,
  mutate,
  setData,
  onOpenPresence,
}: {
  entityId?: string | null
  profile: Profile
  data: AppData
  leaderMode: boolean
  setActiveTab: (tab: TabId, entityId?: string) => void
  mutate?: MutateFn
  setData?: AppDataUpdater
  /** 내 상태 창을 연다. 상태가 없는 사람(팀장)에게는 넘기지 않는다. */
  onOpenPresence?: () => void
}) {
  const office = useOfficeHome({ profile, data, setActiveTab, mutate, setData })
  const { occupants, canEdit, layoutLoaded, meetingProgress: progress, meetingStarted } = office
  const meetingClock = office.meeting ? formatClock(office.meeting.starts_at) : null
  const canManage = canManageTeamData(profile)
  const [collapsed, setCollapsed] = useState(readQuestCollapsed)
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

  const setQuestCollapsed = (next: boolean) => {
    setCollapsed(next)
    try {
      window.localStorage.setItem(QUEST_STORAGE_KEY, next ? '1' : '0')
    } catch {
      // 저장소를 쓸 수 없으면 이번 화면에서만 접는다.
    }
  }

  const total = quests.length
  const title = !leaderMode
    ? total > 0 ? `오늘 할 일 ${total}건` : '지금 할 일이 없어요'
    : canManage
      ? total > 0 ? `오늘 처리할 일 ${total}건` : '오늘 처리할 일이 없어요'
      : total > 0 ? `파트에서 처리할 일 ${total}건` : '파트에 밀린 일이 없어요'

  return (
    <div className="office-home" data-quest={collapsed ? 'collapsed' : 'open'}>
      <h1 className="sr-only">우리 파트 사무실</h1>
      <div className="office-home-stage">
        <OfficeScene focusedProfileId={entityId} workflow={{ profile, data }}
          camera={WORLD_CAMERA}
          currentProfileId={profile.id}
          fit="fullscreen"
          hotspots={office.hotspots}
          absences={office.absences}
          meeting={office.meetingScene}
          occupants={occupants}
          personLink={office.personLink}
        >
          {occupants.length === 0 && (
            <div className="office-empty">
              <p>{canEdit ? '아직 자리를 배치하지 않았어요.' : '파트장이 자리를 배치하면 여기에 보여요.'}</p>
              {canEdit && layoutLoaded && (
                <button className="primary compact" onClick={office.openSeatEditor} type="button">
                  자리 배치하기
                </button>
              )}
            </div>
          )}
        </OfficeScene>
      </div>
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
              <button
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
            </div>
            <div aria-label="자리 현황" className="office-quest-presence" role="group">
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
            </div>
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
      {office.dialogs}
    </div>
  )
}
