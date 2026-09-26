import type { AppData, Profile, ReviewEvent } from '../types'
import type { TabId } from '../app/types'
import { canManageTeamData } from '../domain/permissions'
import { daysUntil, dueState, dueUrgency, eventTime, relativeDateLabel, relativeDaysAgo } from './dates'
import { quoted, quotedWithJosa, withJosa } from './korean'
import { isReviewUnread, latestRelevantReviewEvent } from './readState'
import { selectProductChangeTaskContexts } from '../domain/changeApplications/taskContexts'

/** 새 소식(검토 진행)과 확인할 일(기한·미적용 안내)을 나눠 보여 준다. */
export type NotificationSection = 'news' | 'reminder'

export type AppNotification = {
  id: string
  /** 아바타에 쓸 한 글자 */
  actor: string
  title: string
  when: string
  kind: string
  urgency: 'urgent' | 'warning' | 'normal'
  unread: boolean
  tab: TabId
  entityId?: string
  /** 정렬용 epoch ms */
  at: number
  section: NotificationSection
}

/** 프로젝트 기한 안내는 이 일수 안에 마감되거나 이미 지난 것만 만든다. */
const PROJECT_REMINDER_DAYS = 3

/**
 * 오늘 발생분은 "방금"/"n분 전"/"n시간 전", 그 이전은 달력 자정 기준(dates.ts와 동일)
 * "어제"/"n일 전". 경과 24h로 날짜를 세면 검토 목록(relativeDateLabel)과 같은 이벤트가
 * 다른 날짜로 표시된다.
 */
function relativeTime(at: number, now: number) {
  if (!at) return '-'
  const iso = new Date(at).toISOString()
  const days = relativeDaysAgo(iso, now)
  if (days == null) return '-'
  if (days > 0) return relativeDateLabel(iso, now)
  const diffMinutes = Math.floor((now - at) / 60000)
  if (diffMinutes < 1) return '방금'
  if (diffMinutes < 60) return `${diffMinutes}분 전`
  return `${Math.floor(diffMinutes / 60)}시간 전`
}

/** 파트원에게 보여 줄 검토 진행 소식. 누가 무엇을 했는지 능동형으로 말한다. */
function memberReviewNews(eventType: ReviewEvent['event_type'], title: string): { title: string; kind: string } {
  switch (eventType) {
    case 'feedback_voided':
      return { title: `파트장이 ${quoted(title)}의 피드백을 무효화했어요.`, kind: '피드백' }
    case 'feedback_updated':
      return { title: `파트장이 ${quoted(title)}의 피드백을 수정했어요.`, kind: '피드백' }
    case 'feedback_added':
      return { title: `파트장이 ${quoted(title)}에 피드백을 남겼어요.`, kind: '피드백' }
    case 'approved':
      return { title: `파트장이 ${quotedWithJosa(title, '을/를')} 승인했어요.`, kind: '승인' }
    case 'rejected':
      return { title: `파트장이 ${quotedWithJosa(title, '을/를')} 반려했어요.`, kind: '반려' }
    default:
      return { title: `파트장이 ${quotedWithJosa(title, '을/를')} 다시 열었어요.`, kind: '다시 열기' }
  }
}

function projectReminderTitle(name: string, days: number) {
  if (days < 0) return `${quoted(name)} 프로젝트 마감일이 ${Math.abs(days)}일 지났어요.`
  if (days === 0) return `${quoted(name)} 프로젝트 마감일이 오늘이에요.`
  if (days === 1) return `${quoted(name)} 프로젝트 마감일이 내일이에요.`
  return `${quoted(name)} 프로젝트 마감까지 ${days}일 남았어요.`
}

/**
 * 검토 알림은 불변 review_events와 서버 영수증에서 파생한다.
 * 행 updated_at이나 브라우저 저장소를 쓰지 않아 기기 간 판정이 일치한다.
 * 알림은 행동할 수 있는 사람에게만 만든다 — 읽기 전용(팀장)에게는 처리할 수 없는
 * 검토요청·미적용 안내를 보내지 않는다(토스 UP-1).
 */
export function buildNotifications(
  profile: Profile,
  data: AppData,
  leaderMode: boolean,
  now = Date.now(),
): AppNotification[] {
  if (leaderMode && !canManageTeamData(profile)) return []
  const items: AppNotification[] = []
  const today = new Date(now)

  if (leaderMode) {
    data.reviewRequests
      .filter((request) => request.status === 'pending')
      .forEach((request) => {
        const latest = latestRelevantReviewEvent(request, profile, data)
        if (!latest) return
        const at = eventTime(latest.occurred_at)
        const actorName = latest.actor_name_snapshot.trim() || request.profiles?.name || '파트원'
        const resubmitted = latest.event_type === 'resubmitted'
        items.push({
          id: `review-event-${latest.id}`,
          actor: actorName.charAt(0) || '?',
          title: `${withJosa(actorName, '이/가')} ${quoted(request.title)} 검토를 ${resubmitted ? '다시 ' : ''}요청했어요.`,
          when: relativeTime(at, now),
          kind: resubmitted ? '재요청' : '검토요청',
          urgency: dueUrgency(request.due_date, today),
          unread: isReviewUnread(request, profile, data),
          tab: 'reviews',
          entityId: request.id,
          at,
          section: 'news',
        })
      })
  } else {
    data.reviewRequests
      .filter((request) => request.requester_id === profile.id)
      .forEach((request) => {
        const latest = latestRelevantReviewEvent(request, profile, data)
        if (!latest) return
        const at = eventTime(latest.occurred_at)
        const news = memberReviewNews(latest.event_type, request.title)
        items.push({
          id: `review-event-${latest.id}`,
          actor: latest.actor_name_snapshot.trim().charAt(0) || '파',
          title: news.title,
          when: relativeTime(at, now),
          kind: news.kind,
          urgency: latest.event_type === 'rejected' ? 'warning' : 'normal',
          unread: isReviewUnread(request, profile, data),
          tab: 'reviews',
          entityId: request.id,
          at,
          section: 'news',
        })
      })
  }

  // 변경 적용은 제품 행 단위로 알리지 않는다. 한 공통변경에 담당 제품이 15개여도
  // 공통변경별 요약 한 건만 보여줘 알림 폭주를 막는다.
  const changeGroups = new Map<string, ReturnType<typeof selectProductChangeTaskContexts>>()
  for (const context of selectProductChangeTaskContexts(data)) {
    if (context.application.status !== 'published' || context.task.status !== 'pending') continue
    if (context.application.final_completed_at || context.application.archived_at) continue
    if (!leaderMode && context.task.assignee_id !== profile.id) continue
    const group = changeGroups.get(context.application.id) ?? []
    group.push(context)
    changeGroups.set(context.application.id, group)
  }
  for (const contexts of changeGroups.values()) {
    const application = contexts[0].application
    const earliest = contexts.reduce((left, right) =>
      right.actionItem.due_date < left.actionItem.due_date ? right : left,
    )
    const due = dueState(earliest.actionItem.due_date, { now: today })
    const unassigned = contexts.filter(({ task }) => !task.assignee_id).length
    if (leaderMode && (due.days == null || due.days > PROJECT_REMINDER_DAYS) && unassigned === 0) continue
    items.push({
      id: `change-${application.id}`,
      actor: application.change_number.trim().charAt(0) || '변',
      title: leaderMode
        ? `${quoted(application.title)} 미적용 ${contexts.length}건${unassigned > 0 ? ` · 담당자 없음 ${unassigned}건` : ''}`
        : `${quoted(application.title)} 적용 업무 ${contexts.length}건`,
      when: due.shortLabel,
      kind: '변경 적용',
      urgency: dueUrgency(earliest.actionItem.due_date, today),
      unread: false,
      tab: 'change-applications',
      entityId: application.id,
      at: eventTime(application.published_at ?? application.created_at),
      section: 'reminder',
    })
  }

  // 프로젝트 기한 — 프로젝트 단위로 만든다. 배정 행 단위로 만들면 담당자 수만큼
  // 부풀고 무배정 프로젝트는 누락된다(파트장 홈의 할 일 목록과 같은 기준).
  // 이미 지난 프로젝트가 여러 개면 한 줄로 묶어 새 소식이 기한 안내에 묻히지 않게 한다.
  const myProjectIds = leaderMode
    ? null
    : new Set(
        data.projectAssignments
          .filter((assignment) => assignment.user_id === profile.id)
          .map((assignment) => assignment.project_id),
      )
  const overdueProjects: Array<{ project: AppData['projects'][number]; days: number }> = []
  data.projects.forEach((project) => {
    if (myProjectIds && !myProjectIds.has(project.id)) return
    if (!project.deadline || project.status === 'done') return
    const days = daysUntil(project.deadline, today)
    if (days == null || days > PROJECT_REMINDER_DAYS) return
    if (days < 0) {
      overdueProjects.push({ project, days })
      return
    }
    items.push({
      id: `project-${project.id}`,
      actor: project.name.trim().charAt(0) || 'P',
      title: projectReminderTitle(project.name, days),
      when: dueState(project.deadline, { now: today }).shortLabel,
      kind: '프로젝트',
      urgency: dueUrgency(project.deadline, today),
      unread: false,
      tab: 'projects',
      entityId: project.id,
      at: eventTime(project.deadline),
      section: 'reminder',
    })
  })
  if (overdueProjects.length === 1) {
    const [{ project, days }] = overdueProjects
    items.push({
      id: `project-${project.id}`,
      actor: project.name.trim().charAt(0) || 'P',
      title: projectReminderTitle(project.name, days),
      when: `${Math.abs(days)}일 지남`,
      kind: '프로젝트',
      urgency: 'urgent',
      unread: false,
      tab: 'projects',
      entityId: project.id,
      at: eventTime(project.deadline),
      section: 'reminder',
    })
  } else if (overdueProjects.length > 1) {
    const oldest = overdueProjects.reduce((left, right) => (right.days < left.days ? right : left))
    items.push({
      id: 'projects-overdue',
      actor: 'P',
      title: `기한이 지난 프로젝트 ${overdueProjects.length}개`,
      when: '기한 지남',
      kind: '프로젝트',
      urgency: 'urgent',
      unread: false,
      tab: 'projects',
      at: eventTime(oldest.project.deadline),
      section: 'reminder',
    })
  }

  const urgencyRank = { urgent: 0, warning: 1, normal: 2 } as const
  return items.sort((left, right) => {
    if (left.section !== right.section) return left.section === 'news' ? -1 : 1
    if (left.section === 'news') {
      if (left.unread !== right.unread) return left.unread ? -1 : 1
      return right.at - left.at
    }
    return urgencyRank[left.urgency] - urgencyRank[right.urgency] || left.at - right.at
  })
}
