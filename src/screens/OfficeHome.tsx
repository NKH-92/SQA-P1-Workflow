import { lazy, Suspense, useState } from 'react'
import type { MutateFn, TabId } from '../app/types'
import type { AppDataUpdater } from '../data/repositories/appDataUpdater'
import { OfficeScene } from '../features/office/components/OfficeScene'
import { WORLD_CAMERA } from '../features/office/officeGeometry'
import type { AppData, Profile } from '../types'
import { useOfficeHome } from './useOfficeHome'
import './HomeOffice.css'

import { QuestContent } from './QuestContent'
const MorningBriefDialog = lazy(() => import('./MorningBriefDialog').then(m => ({ default: m.MorningBriefDialog })))

const QUEST_STORAGE_KEY = 'ui:office-quest-collapsed'
/** 이 폭보다 좁으면 ‘오늘 할 일’ 창을 접은 채로 시작한다(사무실이 먼저 보이게). */
const QUEST_OPEN_MIN_WIDTH = 1100

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
  const { occupants, canEdit, layoutLoaded } = office
  const [collapsed, setCollapsed] = useState(readQuestCollapsed)
  const setQuestCollapsed = (next: boolean) => {
    setCollapsed(next)
    try { localStorage.setItem(QUEST_STORAGE_KEY, next ? '1' : '0') } catch { /* 세션 상태 유지 */ }
  }
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
      <Suspense fallback={null}><QuestContent profile={profile} data={data} leaderMode={leaderMode} setActiveTab={setActiveTab} office={office} onOpenPresence={onOpenPresence} collapsed={collapsed} setQuestCollapsed={setQuestCollapsed} /></Suspense>
      <Suspense fallback={null}><MorningBriefDialog profile={profile} data={data} /></Suspense>
      {office.dialogs}
    </div>
  )
}
