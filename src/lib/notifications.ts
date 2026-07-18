import type { AppData, Profile } from '../types'
import type { TabId } from '../app/types'
import { daysUntil, dueUrgency, eventTime, relativeDateLabel, relativeDaysAgo } from './dates'
import { isReviewUnread, latestRelevantReviewEvent } from './readState'
import { selectProductChangeTaskContexts } from '../domain/changeApplications/taskContexts'

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
}

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

/**
 * 검토 알림은 불변 review_events와 서버 영수증에서 파생한다.
 * 행 updated_at이나 브라우저 저장소를 쓰지 않아 기기 간 판정이 일치한다.
 */
export function buildNotifications(
  profile: Profile,
  data: AppData,
  leaderMode: boolean,
  now = Date.now(),
): AppNotification[] {
  const items: AppNotification[] = []

  if (leaderMode) {
    data.reviewRequests
      .filter((request) => request.status === 'pending')
      .forEach((request) => {
        const latest = latestRelevantReviewEvent(request, profile, data)
        if (!latest) return
        const at = eventTime(latest.occurred_at)
        items.push({
          id: `review-event-${latest.id}`,
          actor: latest.actor_name_snapshot.trim().charAt(0) || '?',
          title: `${latest.actor_name_snapshot || request.profiles?.name || '파트원'}님이 “${request.title}” ${latest.event_type === 'resubmitted' ? '재검토를' : '검토를'} 요청했습니다.`,
          when: relativeTime(at, now),
          kind: '검토요청',
          urgency: dueUrgency(request.due_date),
          unread: isReviewUnread(request, profile, data),
          tab: 'reviews',
          entityId: request.id,
          at,
        })
      })
  } else {
    data.reviewRequests
      .filter((request) => request.requester_id === profile.id)
      .forEach((request) => {
        const latest = latestRelevantReviewEvent(request, profile, data)
        if (!latest) return
        const at = eventTime(latest.occurred_at)
        const feedbackEvent = latest.event_type.startsWith('feedback_')
        const actionLabel = feedbackEvent
          ? latest.event_type === 'feedback_voided'
            ? '파트장 피드백이 무효화되었습니다.'
            : latest.event_type === 'feedback_updated'
              ? '파트장 피드백이 수정되었습니다.'
              : '파트장 피드백이 달렸습니다.'
          : latest.event_type === 'approved'
            ? '검토요청이 완료되었습니다.'
            : latest.event_type === 'rejected'
              ? '검토요청이 반려되었습니다.'
              : '검토요청이 다시 열렸습니다.'
        items.push({
          id: `review-event-${latest.id}`,
          actor: latest.actor_name_snapshot.trim().charAt(0) || '파',
          title: `“${request.title}” ${actionLabel}`,
          when: relativeTime(at, now),
          kind: feedbackEvent ? '피드백' : '상태 변경',
          urgency: latest.event_type === 'rejected' ? 'warning' : 'normal',
          unread: isReviewUnread(request, profile, data),
          tab: 'reviews',
          entityId: request.id,
          at,
        })
      })
  }

  // 변경 적용은 제품 행 단위로 알리지 않는다. 한 변경건에 담당 제품이 15개여도
  // 사용자에게는 변경건별 요약 한 건만 보여줘 알림 폭주를 막는다.
  const changeGroups = new Map<string, ReturnType<typeof selectProductChangeTaskContexts>>()
  for (const context of selectProductChangeTaskContexts(data)) {
    if (context.application.status !== 'published' || context.task.status !== 'pending') continue
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
    const days = daysUntil(earliest.actionItem.due_date)
    const unassigned = contexts.filter(({ task }) => !task.assignee_id).length
    if (leaderMode && (days == null || days > 3) && unassigned === 0) continue
    items.push({
      id: `change-${application.id}`,
      actor: application.change_number.trim().charAt(0) || '변',
      title: leaderMode
        ? `“${application.title}” 미적용 ${contexts.length}건${unassigned > 0 ? ` · 담당 미지정 ${unassigned}건` : ''}`
        : `“${application.title}” 변경 적용업무 ${contexts.length}건`,
      when: days == null ? '기한 확인' : days < 0 ? `D+${Math.abs(days)}` : days === 0 ? '오늘 마감' : `D-${days}`,
      kind: '변경 적용',
      urgency: dueUrgency(earliest.actionItem.due_date),
      unread: false,
      tab: 'change-applications',
      entityId: application.id,
      at: eventTime(application.published_at ?? application.created_at),
    })
  }

  // 마감 임박 프로젝트 — 프로젝트 단위로 만든다. 배정 행 단위로 만들면 담당자 수만큼
  // 부풀고 무배정 프로젝트는 누락된다(LeaderDashboard의 우선순위 큐와 같은 기준).
  const myProjectIds = leaderMode
    ? null
    : new Set(
        data.projectAssignments
          .filter((assignment) => assignment.user_id === profile.id)
          .map((assignment) => assignment.project_id),
      )
  data.projects.forEach((project) => {
    if (myProjectIds && !myProjectIds.has(project.id)) return
    if (!project.deadline || project.status === 'done') return
    const days = daysUntil(project.deadline)
    if (days == null || days > 3) return
    items.push({
      id: `project-${project.id}`,
      actor: project.name.trim().charAt(0) || 'P',
      title:
        days < 0
          ? `“${project.name}” 프로젝트 마감이 ${Math.abs(days)}일 지났습니다.`
          : `“${project.name}” 프로젝트 마감이 ${days === 0 ? '오늘' : `${days}일 남았습니다`}.`,
      when: `D${days < 0 ? '+' : '-'}${Math.abs(days)}`,
      kind: '프로젝트',
      urgency: dueUrgency(project.deadline),
      unread: false,
      tab: 'projects',
      at: eventTime(project.deadline),
    })
  })

  return items.sort((left, right) => {
    if (left.unread !== right.unread) return left.unread ? -1 : 1
    return right.at - left.at
  })
}
