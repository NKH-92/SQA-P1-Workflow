import { LazyTeamCalendar as TeamCalendarDialog } from './LazyTeamCalendar'
import { fromOffice, prefetchRoute } from '../app/routeLoading'
import { prefetchWhenIdle } from '../lib/prefetch'
import { Suspense, useEffect, useMemo, useState } from 'react'
import type { MutationRunner } from '../app/hooks/useMutationRunner'
import type { TabId } from '../app/types'
import type { AppDataUpdater } from '../data/repositories/appDataUpdater'
import { presenceChipLabel, presenceOf, presenceSummary, PRESENCE_TEXT } from '../data/validation/memberPresence'
import { hasOfficeMeetingStarted, isOfficeMeetingOpen, officeMeetingPlace, type OfficeMeetingStartInput } from '../data/validation/officeMeeting'
import { canManageTeamData } from '../domain/permissions'
import type { OfficeHotspotLink, OfficePersonLink, OfficeSceneAbsence } from '../features/office/components/OfficeScene'
import { OfficeMeetingDialog } from '../features/office/components/OfficeMeetingDialog'
import { OfficeSeatEditor } from '../features/office/components/OfficeSeatEditor'
import { WeeklyMenuDialog } from '../features/office/components/WeeklyMenuDialog'
import { buildOfficeAlerts } from '../features/office/officeAlerts'
import { sceneOccupants, type SceneOccupant } from '../features/office/officeLayoutModel'
import { awaitsMyConfirmation, meetingProgress, meetingSceneState, meetingToast, nextMeetingChangeAt } from '../features/office/officeMeetingModel'
import {
  HOTSPOT_LABELS,
  HOTSPOT_TABS,
  hotspotsForViewer,
  personDestination,
  type PersonDestination,
} from '../features/office/officeNavigation'
import { SCENE_HOTSPOTS } from '../features/office/officeScene'
import { useOfficeController } from '../features/office/useOfficeController'
import type { OfficeSeatInput } from '../data'
import { businessDateKey } from '../lib/businessTime'
import { formatClock } from '../lib/format'
import { withJosa } from '../lib/korean'
import type { AppData, Profile } from '../types'

/** 프로젝트 화면의 보기 상태(useViewState 'projects.leader.*') — 사람별 보기로 그 사람을 찾아 둔다. */

const PROJECTS_VIEW_KEY = 'sqa.view.projects.leader.view'
const PROJECTS_QUERY_KEY = 'sqa.view.projects.leader.query'
/** 자정(휴가 시작·끝)과 회의 시작을 놓치지 않게 화면 시각을 가끔 새로 읽는다. */
const CLOCK_TICK_MS = 30_000

const ignoreDataUpdate: AppDataUpdater = () => undefined

function openPersonDestination(destination: PersonDestination, setActiveTab: (tab: TabId, entityId?: string) => void) {
  if (destination.tab === 'team') {
    setActiveTab('team', destination.entityId)
    return
  }
  if (destination.tab === 'projects') {
    try {
      window.sessionStorage.setItem(PROJECTS_VIEW_KEY, JSON.stringify('member'))
      window.sessionStorage.setItem(PROJECTS_QUERY_KEY, JSON.stringify(destination.personName))
    } catch {
      // 저장소를 쓸 수 없으면 걸러 두지 않고 프로젝트 화면만 연다.
    }
  }
  setActiveTab(destination.tab)
}

/** 지금 시각. 30초마다, 그리고 회의가 시작하거나 끝나는 순간 다시 읽는다. */
function useOfficeClock(changeAt: number | null) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const tick = window.setInterval(() => setNow(Date.now()), CLOCK_TICK_MS)
    return () => window.clearInterval(tick)
  }, [])
  useEffect(() => {
    if (changeAt == null) return
    const wait = Math.max(0, changeAt - Date.now()) + 50
    // 30초 안이면 따로 맞춰 둔다(늦게 떠나지 않게). 더 먼 일은 30초 주기가 가까워지면 다시 잡는다.
    if (wait > CLOCK_TICK_MS * 2) return
    const timer = window.setTimeout(() => setNow(Date.now()), wait)
    return () => window.clearTimeout(timer)
  }, [changeAt, now])
  return now
}

/**
 * 홈 사무실(기존 화면 카드·전체 화면 공통): 기물·사람 링크, 기물 알림, 회의실, 자리 상태, 자리 배치 창.
 * 기물을 누르면 그 화면으로, 새로 온 게 있으면 그 항목으로 바로 간다. 회의실은 회의 창을 연다.
 */
export function useOfficeHome({
  profile,
  data,
  setActiveTab,
  mutate,
  setData,
}: {
  profile: Profile
  data: AppData
  setActiveTab: (tab: TabId, entityId?: string) => void
  /** 회의 조작은 전체 새로고침을 건너뛰는 선택 인자를 넘기므로 MutationRunner로 받는다(MutateFn도 그대로 들어온다). */
  mutate?: MutationRunner
  setData?: AppDataUpdater
}) {
  useEffect(() => prefetchWhenIdle(async () => {
    const ids = hotspotsForViewer(SCENE_HOTSPOTS.map(h => h.id), profile)
    for (const id of ids) if (id !== 'meeting' && id !== 'menu' && id !== 'calendar') await prefetchRoute(HOTSPOT_TABS[id])
  }), [profile])
  const layout = data.officeLayout
  const occupants = useMemo(() => sceneOccupants(layout), [layout])
  const [editing, setEditing] = useState(false)
  const [meetingOpen, setMeetingOpen] = useState(false)
  const [calendarOpen, setCalendarOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const controller = useOfficeController(profile, data, setData ?? ignoreDataUpdate)
  const canEdit = canManageTeamData(profile) && Boolean(mutate && setData)
  const layoutLoaded = layout?.revision != null
  const alerts = useMemo(() => buildOfficeAlerts(profile, data), [profile, data])
  const now = useOfficeClock(nextMeetingChangeAt(data.officeMeeting))
  const meeting = isOfficeMeetingOpen(data.officeMeeting, now) ? data.officeMeeting : null
  const meetingScene = useMemo(() => meetingSceneState(meeting, occupants, now), [meeting, occupants, now])
  const awaiting = awaitsMyConfirmation(meeting, profile.id, now)
  const progress = meeting ? meetingProgress(meeting) : null
  const started = meeting ? hasOfficeMeetingStarted(meeting, now) : false
  const today = businessDateKey(new Date(now))

  // 자리를 비운 사람: 휴가·출장 > 다른 곳 회의 > 잠깐 비운 상태. 사무실 회의실에 간 사람은 회의실에 보인다.
  const absences = useMemo<OfficeSceneAbsence[]>(() => {
    const inRoom = new Set(meetingScene.attendeeSeats)
    const inMeetingElsewhere = new Set(meetingScene.awaySeats)
    return occupants.flatMap((occupant): OfficeSceneAbsence[] => {
      if (inRoom.has(occupant.seatIndex)) return []
      const status = presenceOf(data.memberPresence, occupant.profileId, today)
      const entry = (effective: NonNullable<typeof status>): OfficeSceneAbsence => ({
        seatIndex: occupant.seatIndex,
        kind: effective.kind,
        summary: presenceSummary(effective, today),
        chip: presenceChipLabel(effective, today),
      })
      if (status?.leave) return [entry(status)]
      if (inMeetingElsewhere.has(occupant.seatIndex) && meeting) {
        const place = officeMeetingPlace(meeting)
        return [{ seatIndex: occupant.seatIndex, kind: 'meeting', summary: `회의 · ${place}`, chip: `회의 · ${place}` }]
      }
      return status ? [entry(status)] : []
    })
  }, [data.memberPresence, meeting, meetingScene, occupants, today])

  /** 퀘스트 창·접근성 문구용 자리 현황(예: ‘휴가 1 · 실험실 1’) */
  const awaySummary = useMemo(() => {
    const counts = new Map<string, number>()
    for (const absence of absences) {
      const label = PRESENCE_TEXT[absence.kind].short
      counts.set(label, (counts.get(label) ?? 0) + 1)
    }
    return [...counts].map(([label, count]) => `${label} ${count}`).join(' · ')
  }, [absences])

  const hotspots = hotspotsForViewer(SCENE_HOTSPOTS.map((area) => area.id), profile).map((id): OfficeHotspotLink => {
    const { name, destination } = HOTSPOT_LABELS[id]
    if (id === 'calendar') return { id, sign: '파트원 일정', label: '일정 달력, 파트원 일정 보기', onSelect: () => setCalendarOpen(true) }
    if (id === 'menu') return { id, sign: '메뉴판', label: '메뉴판, 이번 주 메뉴 보기·사진 올리기', onSelect: () => setMenuOpen(true) }
    if (id === 'meeting') {
      const clock = meeting ? formatClock(meeting.starts_at) : null
      const status = meeting
        ? started
          ? `회의 중 확인 ${progress!.confirmed}/${progress!.total}명`
          : `${clock} 회의 예정 확인 ${progress!.confirmed}/${progress!.total}명`
        : undefined
      return {
        id,
        sign: meeting ? (started ? '회의 중' : `${clock} 회의`) : '회의실',
        label: [name, status, awaiting ? '회의 요청 받음' : undefined, meeting ? '회의 보기' : '회의 열기'].filter(Boolean).join(', '),
        alert: awaiting ? { level: 'new', count: 1, description: '회의 요청을 받았어요' } : undefined,
        badge: progress ? `${progress.confirmed}/${progress.total}` : undefined,
        onSelect: () => setMeetingOpen(true),
      }
    }
    const alert = alerts[id]
    const tab = HOTSPOT_TABS[id]
    return {
      id,
      sign: destination,
      label: [name, alert?.description, `${withJosa(destination, '으로/로')} 이동`].filter(Boolean).join(', '),
      alert,
      // 새로 온 게 있으면 그 항목을 바로 열어 준다.
      onSelect: () => fromOffice(tab, () => alert?.targetId ? setActiveTab(tab, alert.targetId) : setActiveTab(tab)),
    }
  })

  const personLink = (occupant: SceneOccupant): OfficePersonLink | null => {
    const destination = personDestination(profile, { profileId: occupant.profileId, name: occupant.name }, data.profiles)
    if (!destination) return null
    return {
      label: occupant.profileId === profile.id ? `${occupant.name}(나) 담당 보기` : `${occupant.name} 담당 보기`,
      onSelect: () => openPersonDestination(destination, setActiveTab),
    }
  }

  const saveSeats = async (seats: OfficeSeatInput[], expectedRevision: string | null) => {
    if (!mutate) return
    let changed = false
    const saved = await mutate(async () => {
      const result = await controller.replaceSeats(seats, expectedRevision)
      changed = result.changed
    }, () => (changed ? '사무실 자리 배치를 저장했어요.' : '바뀐 자리가 없어요.'))
    if (saved) setEditing(false)
  }

  const noMutation = async () => false
  // 저장소가 바꾼 뒤 회의실만 다시 읽어 화면을 맞추므로, 성공 뒤 전체 새로고침은 하지 않는다.
  const meetingOnly = { refresh: false } as const
  const meetingActions = mutate
    ? {
        onStart: (input: OfficeMeetingStartInput) => {
          const place = input.location.trim()
          const toast = input.startsAt
            ? `회의를 잡았어요. ${formatClock(input.startsAt)}에 ${place || '회의실'}에서 만나요.`
            : place
              ? `회의를 열었어요. 부른 사람이 확인하면 ${place}에서 만나요.`
              : '회의를 열었어요. 부른 사람이 확인하면 회의실로 모여요.'
          return mutate(() => controller.startMeeting(input), toast, meetingOnly)
        },
        onAcknowledge: (meetingId: string) =>
          mutate(() => controller.acknowledgeMeeting(meetingId), meetingToast('acknowledged', meeting, now), meetingOnly),
        onEnd: (meetingId: string) =>
          mutate(async () => {
            await controller.endMeeting(meetingId)
          }, meetingToast('ended', meeting, now), meetingOnly),
      }
    : { onStart: noMutation, onAcknowledge: noMutation, onEnd: noMutation }

  const dialogs = (
    <>
      {calendarOpen && <Suspense fallback={null}><TeamCalendarDialog presence={data.memberPresence} onClose={() => setCalendarOpen(false)} /></Suspense>}
      {menuOpen && <WeeklyMenuDialog profile={profile} onClose={() => setMenuOpen(false)} />}
      {editing && canEdit && (
        <OfficeSeatEditor layout={layout} onClose={() => setEditing(false)} onSave={saveSeats} profiles={data.profiles} />
      )}
      {meetingOpen && (
        <OfficeMeetingDialog
          meeting={meeting}
          occupants={occupants}
          onAcknowledge={meetingActions.onAcknowledge}
          onClose={() => setMeetingOpen(false)}
          onEnd={meetingActions.onEnd}
          now={now}
          onStart={meetingActions.onStart}
          presence={data.memberPresence}
          profile={profile}
        />
      )}
    </>
  )

  return {
    occupants,
    hotspots,
    personLink,
    meetingScene,
    absences,
    awaySummary,
    meeting,
    meetingStarted: started,
    meetingProgress: progress,
    awaitingMeeting: awaiting,
    canEdit,
    layoutLoaded,
    openSeatEditor: () => setEditing(true),
    openMeeting: () => setMeetingOpen(true),
    dialogs,
  }
}
