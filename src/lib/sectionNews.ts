import type { AppData, Profile, ReadMarkSection, SectionReadMark } from '../types'
import { selectLeaderChangeActions, selectMemberPendingTasks } from '../domain/changeApplications/attention'
import { canManageTeamData, canViewTeamData } from '../domain/permissions'

/**
 * 화면별 ‘새 소식’ 판정(홈 사무실 기물 알림).
 * 지금 보이는 항목 id를 마지막으로 그 화면을 열 때 기록한 id(section_read_marks)와 비교한다.
 * 검토요청은 불변 review_events와 서버 영수증(readState.ts)이 맡으므로 여기서 다루지 않는다.
 */

/** 기록이 아직 없는 화면은 최근 이 일수 안에 생긴 것만 새 소식으로 본다(도입 직후 옛 항목까지 한꺼번에 알리지 않는다). */
export const FIRST_VISIT_NEW_DAYS = 7
/** 공지는 불러오는 상한(200건) 안에서만 비교한다. */
const ANNOUNCEMENT_KEY_LIMIT = 200
const DAY_MS = 24 * 60 * 60 * 1000

export type SectionNewsItem = {
  key: string
  /** 눌렀을 때 바로 열 화면 항목 id(공지·프로젝트·공통변경) */
  target: string
  /** 생긴 때. 처음 보는 사람의 기준이자 가장 최근 것을 고르는 기준이다. 모르면 null */
  at: string | null
}

export type SectionNewsData = Pick<
  AppData,
  | 'announcements'
  | 'projectAssignments'
  | 'changeApplications'
  | 'changeApplicationSummaries'
  | 'changeActionItems'
  | 'productChangeTasks'
  | 'sectionReadMarks'
>

/** 새 소식을 받는 사람. 팀장은 읽기 전용이라(알림 센터·메뉴 배지와 같게) 받지 않는다. */
export function receivesSectionNews(profile: Profile) {
  if (profile.is_active === false) return false
  return !canViewTeamData(profile) || canManageTeamData(profile)
}

function timeOf(value: string | null | undefined) {
  if (!value) return Number.NaN
  return Date.parse(value)
}

function latest(...values: Array<string | null | undefined>): string | null {
  let best: string | null = null
  for (const value of values) {
    if (!value || Number.isNaN(timeOf(value))) continue
    if (best === null || timeOf(value) > timeOf(best)) best = value
  }
  return best
}

/** 이 사람이 이 화면에서 ‘새 소식’으로 받을 수 있는 항목. */
export function sectionNewsItems(profile: Profile, data: SectionNewsData, section: ReadMarkSection): SectionNewsItem[] {
  if (!receivesSectionNews(profile)) return []
  const leader = canManageTeamData(profile)
  switch (section) {
    case 'announcements':
      // 내가 쓴 공지는 새 소식이 아니다.
      return data.announcements
        .filter((announcement) => announcement.created_by !== profile.id)
        .sort((left, right) => timeOf(right.created_at) - timeOf(left.created_at))
        .slice(0, ANNOUNCEMENT_KEY_LIMIT)
        .map((announcement) => ({ key: announcement.id, target: announcement.id, at: announcement.created_at }))
    case 'projects':
      // 프로젝트는 파트장이 만들고 배정한다. 파트원에게 새로 배정된 것만 새 소식이다.
      if (leader) return []
      return data.projectAssignments
        .filter((assignment) => assignment.user_id === profile.id)
        .map((assignment) => ({ key: assignment.id, target: assignment.project_id, at: assignment.created_at ?? null }))
    case 'change-applications':
      if (leader) {
        // 최종 확인을 기다리거나 담당자 없는 업무가 생긴 공통변경
        return selectLeaderChangeActions(data).map((application) => ({
          key: application.id,
          target: application.id,
          at: application.updated_at,
        }))
      }
      // 배포돼 내게 온 미적용 업무. 이관돼 온 업무도 id가 처음 보이면 새 소식이다.
      return selectMemberPendingTasks(data, profile.id).map(({ task, application }) => ({
        key: task.id,
        target: application.id,
        at: latest(application.published_at, task.created_at),
      }))
  }
}

export function sectionReadMark(
  data: Pick<AppData, 'sectionReadMarks'>,
  profile: Profile,
  section: ReadMarkSection,
): SectionReadMark | undefined {
  return data.sectionReadMarks?.find((mark) => mark.user_id === profile.id && mark.section === section)
}

/**
 * 새 소식인 항목. 기록을 아직 모르면(불러오기 전·실패) 아무것도 새 소식으로 치지 않는다.
 * 기록이 없는 화면은 최근 FIRST_VISIT_NEW_DAYS일 안에 생긴 것만 센다.
 */
export function unseenSectionItems(
  items: readonly SectionNewsItem[],
  mark: SectionReadMark | undefined,
  marksKnown: boolean,
  now = Date.now(),
): SectionNewsItem[] {
  if (!marksKnown) return []
  if (!mark) {
    const since = now - FIRST_VISIT_NEW_DAYS * DAY_MS
    return items.filter((item) => timeOf(item.at) >= since)
  }
  const seen = new Set(mark.seen_keys)
  return items.filter((item) => !seen.has(item.key))
}

/** 새 소식 가운데 가장 최근 것의 화면 항목 id. 없으면 undefined */
export function newestSectionTarget(items: readonly SectionNewsItem[]): string | undefined {
  let newest: SectionNewsItem | undefined
  for (const item of items) {
    const time = timeOf(item.at)
    if (!newest || (!Number.isNaN(time) && (Number.isNaN(timeOf(newest.at)) || time > timeOf(newest.at)))) newest = item
  }
  return newest?.target
}

/** 이 화면을 열었을 때 기록을 새로 남겨야 하는지: 기록이 없거나 새 소식이 있으면 남긴다. */
export function sectionNeedsReadMark(items: readonly SectionNewsItem[], mark: SectionReadMark | undefined) {
  if (!mark) return true
  const seen = new Set(mark.seen_keys)
  return items.some((item) => !seen.has(item.key))
}
