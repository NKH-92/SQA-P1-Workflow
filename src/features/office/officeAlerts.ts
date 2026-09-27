import type { AppData, Profile, ReadMarkSection, ReviewRequest } from '../../types'
import { selectLeaderChangeActions, selectMemberPendingTasks } from '../../domain/changeApplications/attention'
import { canManageTeamData } from '../../domain/permissions'
import { daysUntil, eventTime } from '../../lib/dates'
import { isReviewUnread, latestRelevantReviewEvent } from '../../lib/readState'
import {
  newestSectionTarget,
  receivesSectionNews,
  sectionNewsItems,
  sectionReadMark,
  unseenSectionItems,
} from '../../lib/sectionNews'
import type { SceneHotspotId } from './officeScene'

/** 프로젝트 마감 안내 기준(알림 센터와 같다): 이 일수 안에 마감되거나 이미 지난 것 */
const PROJECT_DUE_SOON_DAYS = 3

export type OfficeAlertLevel = 'new' | 'todo'

export type OfficeAlert = {
  /** new: 새로 온 게 있어 확인이 필요하다(느낌표). todo: 처리할 게 남아 있다(숫자만). */
  level: OfficeAlertLevel
  /** 간판에 보이는 숫자(new면 새 소식 수, todo면 남은 일 수) */
  count: number
  /** 보조기기·툴팁 설명. 예: ‘새 검토요청 2건 · 피드백 대기 3건’ */
  description: string
  /** 새 소식이 있으면 눌렀을 때 바로 열 가장 최근 항목 id */
  targetId?: string
}

export type OfficeAlerts = Partial<Record<SceneHotspotId, OfficeAlert>>

type Fresh = { count: number; targetId?: string }

const NONE: Fresh = { count: 0 }

function alertOf(fresh: Fresh, freshLabel: string, todo = 0, todoLabel = ''): OfficeAlert | undefined {
  const parts: string[] = []
  if (fresh.count > 0) parts.push(`${freshLabel} ${fresh.count}건`)
  if (todo > 0 && todoLabel) parts.push(`${todoLabel} ${todo}건`)
  if (parts.length === 0) return undefined
  const description = parts.join(' · ')
  return fresh.count > 0
    ? { level: 'new', count: fresh.count, description, ...(fresh.targetId ? { targetId: fresh.targetId } : {}) }
    : { level: 'todo', count: todo, description }
}

/** 읽지 않은 검토요청 수와 그중 가장 최근 소식이 온 요청 */
function unreadReviews(requests: readonly ReviewRequest[], profile: Profile, data: AppData): Fresh {
  let targetId: string | undefined
  let newest = -Infinity
  let count = 0
  for (const request of requests) {
    if (!isReviewUnread(request, profile, data)) continue
    count += 1
    const at = eventTime(latestRelevantReviewEvent(request, profile, data)?.occurred_at)
    if (targetId === undefined || at > newest) {
      targetId = request.id
      newest = at
    }
  }
  return { count, targetId }
}

/**
 * 홈 사무실 기물 알림. 새로 온 것(new)은 확인할 때까지, 처리할 것(todo)은 처리할 때까지 보인다.
 * - 검토요청 보드: 파트장은 새 검토요청(서버 영수증 기준)과 피드백 대기, 파트원은 새 검토 결과
 * - 공지 화면: 남이 쓴 새 공지
 * - 변경관리 문서함: 파트장은 확인할 공통변경, 파트원은 내게 온 적용 업무
 * - 프로젝트 보드: 파트원은 새로 배정된 프로젝트, 모두 마감 임박·지난 프로젝트
 * 팀장(읽기 전용)은 알림 센터·메뉴 배지처럼 알림을 받지 않는다.
 */
export function buildOfficeAlerts(profile: Profile, data: AppData, now = Date.now()): OfficeAlerts {
  if (!receivesSectionNews(profile)) return {}
  const leader = canManageTeamData(profile)
  const marksKnown = data.sectionReadMarks !== undefined
  const fresh = (section: ReadMarkSection): Fresh => {
    const unseen = unseenSectionItems(sectionNewsItems(profile, data, section), sectionReadMark(data, profile, section), marksKnown, now)
    return { count: unseen.length, targetId: newestSectionTarget(unseen) }
  }

  const today = new Date(now)
  const myProjectIds = leader
    ? null
    : new Set(data.projectAssignments.filter((assignment) => assignment.user_id === profile.id).map((assignment) => assignment.project_id))
  const dueSoonProjects = data.projects.filter((project) => {
    if (myProjectIds && !myProjectIds.has(project.id)) return false
    if (project.status === 'done' || !project.deadline) return false
    const days = daysUntil(project.deadline, today)
    return days != null && days <= PROJECT_DUE_SOON_DAYS
  }).length

  const alerts: OfficeAlerts = {}
  const put = (id: SceneHotspotId, alert: OfficeAlert | undefined) => {
    if (alert) alerts[id] = alert
  }
  if (leader) {
    // 파트장이 처리할 수 있는 건 대기 중인 요청뿐이라, 새 검토요청도 대기 중인 것만 센다.
    const pending = data.reviewRequests.filter((request) => request.status === 'pending')
    put('kanban', alertOf(unreadReviews(pending, profile, data), '새 검토요청', pending.length, '피드백 대기'))
    put('cabinet', alertOf(fresh('change-applications'), '새로 확인할 공통변경', selectLeaderChangeActions(data).length, '확인할 공통변경'))
    put('projects', alertOf(NONE, '', dueSoonProjects, '마감 확인할 프로젝트'))
  } else {
    put('kanban', alertOf(unreadReviews(data.reviewRequests, profile, data), '새 검토 결과'))
    put('cabinet', alertOf(fresh('change-applications'), '새 적용 업무', selectMemberPendingTasks(data, profile.id).length, '미적용 업무'))
    put('projects', alertOf(fresh('projects'), '새로 배정된 프로젝트', dueSoonProjects, '마감 확인할 프로젝트'))
  }
  put('notice', alertOf(fresh('announcements'), '새 공지'))
  return alerts
}
