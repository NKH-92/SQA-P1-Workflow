import { useState } from 'react'
import { Armchair, ChevronDown, ChevronUp, Maximize2, Users } from 'lucide-react'
import type { MutateFn, TabId } from '../app/types'
import type { AppDataUpdater } from '../data/repositories/appDataUpdater'
import { OfficeScene } from '../features/office/components/OfficeScene'
import { formatClock } from '../lib/format'
import type { AppData, Profile } from '../types'
import { useOfficeHome } from './useOfficeHome'
import './HomeOffice.css'

const COLLAPSED_STORAGE_KEY = 'ui:office-collapsed'

function readCollapsed() {
  try {
    return window.localStorage.getItem(COLLAPSED_STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

/**
 * 기존 화면 홈의 도트 사무실 카드. 파트장이 배치한 자리를 파트원·팀장·파트장 모두 똑같이 본다.
 * 기물을 누르면 해당 화면으로, 사람을 누르면 그 사람의 담당 화면으로 옮기고, 회의실 창을 열 수 있다.
 * ‘크게 보기’를 누르면 홈이 전체 화면 사무실로 바뀐다. 접어 두면 이 브라우저에서 계속 접힌 채로 보인다.
 */
export function HomeOffice({
  profile,
  data,
  setActiveTab,
  mutate,
  setData,
  onEnterOfficeMode,
}: {
  profile: Profile
  data: AppData
  setActiveTab: (tab: TabId, entityId?: string) => void
  /** 자리 배치 저장·회의 열기에 쓴다. 없으면 보기만 한다. */
  mutate?: MutateFn
  setData?: AppDataUpdater
  /** 홈을 전체 화면 사무실로 바꾼다. 없으면 버튼을 숨긴다. */
  onEnterOfficeMode?: () => void
}) {
  const office = useOfficeHome({ profile, data, setActiveTab, mutate, setData })
  const { occupants, canEdit, layoutLoaded, meetingProgress: progress, meetingStarted } = office
  const meetingClock = office.meeting ? formatClock(office.meeting.starts_at) : null
  const [collapsed, setCollapsed] = useState(readCollapsed)

  const toggleCollapsed = () => {
    const next = !collapsed
    setCollapsed(next)
    try {
      window.localStorage.setItem(COLLAPSED_STORAGE_KEY, next ? '1' : '0')
    } catch {
      // 저장소를 쓸 수 없으면 이번 화면에서만 접는다.
    }
  }

  return (
    <section aria-labelledby="home-office-title" className="home-card office-card">
      <div className="home-card-head office-card-head">
        <div className="office-card-title">
          <h2 id="home-office-title">우리 파트 사무실</h2>
          <small>{occupants.length > 0 ? `8자리 중 ${occupants.length}자리` : '빈 사무실'}</small>
        </div>
        <div className="office-card-actions">
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
            <span className="office-action-label">{progress ? `${meetingStarted ? '회의 중' : `${meetingClock} 회의`} ${progress.confirmed}/${progress.total}` : '회의'}</span>
          </button>
          {canEdit && (
            <button
              aria-label="자리 배치"
              className="ghost compact"
              disabled={!layoutLoaded}
              onClick={office.openSeatEditor}
              title={layoutLoaded ? undefined : '자리 배치를 불러온 뒤에 바꿀 수 있어요. 새로고침해 주세요.'}
              type="button"
            >
              <Armchair aria-hidden="true" size={15} />
              <span className="office-action-label">자리 배치</span>
            </button>
          )}
          {onEnterOfficeMode && (
            <button
              aria-label="크게 보기"
              className="ghost compact"
              onClick={onEnterOfficeMode}
              title="홈을 전체 화면 사무실로 바꿔요."
              type="button"
            >
              <Maximize2 aria-hidden="true" size={15} />
              <span className="office-action-label">크게 보기</span>
            </button>
          )}
          <button
            aria-controls="home-office-scene"
            aria-expanded={!collapsed}
            aria-label={collapsed ? '사무실 펼치기' : '사무실 접기'}
            className="icon-button small"
            onClick={toggleCollapsed}
            title={collapsed ? '사무실 펼치기' : '사무실 접기'}
            type="button"
          >
            {collapsed ? <ChevronDown aria-hidden="true" size={16} /> : <ChevronUp aria-hidden="true" size={16} />}
          </button>
        </div>
      </div>
      {!collapsed && (
        <div id="home-office-scene">
          <OfficeScene workflow={{ profile, data }}
            currentProfileId={profile.id}
            absences={office.absences}
            hotspots={office.hotspots}
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
      )}
      {office.dialogs}
    </section>
  )
}
