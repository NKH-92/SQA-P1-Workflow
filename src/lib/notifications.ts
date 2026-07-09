import type { AppData, Profile } from '../types'
import type { TabId } from '../app/types'
import { daysUntil, dueUrgency, eventTime, relativeDateLabel, relativeDaysAgo } from './dates'
import { isReviewUnread, loadReadState } from './readState'

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
 * 알림은 별도 테이블 없이 이미 로드된 AppData에서 파생한다.
 * 읽음 여부는 readState(localStorage)의 reviewsSeenAt 기준이며, 검토요청 탭을 열면 해소된다.
 */
export function buildNotifications(
  profile: Profile,
  data: AppData,
  leaderMode: boolean,
  now = Date.now(),
): AppNotification[] {
  // 미확인 판정은 요청 단위(isReviewUnread)로 한다 — 사이드바 뱃지(countUnreadReviews)와
  // 벨 카운트가 같은 판정을 써야 두 숫자가 어긋나지 않는다. 한 요청이 만든 여러 알림
  // (피드백 + 상태 변경) 중에는 최신 것 하나만 미확인으로 표시한다.
  const seenAtIso = loadReadState(profile.id).reviewsSeenAt
  const items: AppNotification[] = []

  if (leaderMode) {
    data.reviewRequests
      .filter((request) => request.status === 'pending')
      .forEach((request) => {
        const at = eventTime(request.created_at)
        items.push({
          id: `review-${request.id}`,
          actor: request.profiles?.name?.trim().charAt(0) || '?',
          title: `${request.profiles?.name ?? '파트원'}님이 “${request.title}” 검토를 요청했습니다.`,
          when: relativeTime(at, now),
          kind: '검토요청',
          urgency: dueUrgency(request.due_date),
          unread: isReviewUnread(request, profile, leaderMode, seenAtIso),
          tab: 'reviews',
          entityId: request.id,
          at,
        })
      })
  } else {
    data.reviewRequests
      .filter((request) => request.requester_id === profile.id)
      .forEach((request) => {
        const requestItems: AppNotification[] = []
        const feedback = request.review_feedback ?? []
        const latest = feedback[feedback.length - 1]
        const feedbackAt = eventTime(latest?.created_at)
        if (latest && feedbackAt > 0) {
          requestItems.push({
            id: `feedback-${latest.id}`,
            actor: latest.profiles?.name?.trim().charAt(0) || '파',
            title: `“${request.title}”에 파트장 피드백이 달렸습니다.`,
            when: relativeTime(feedbackAt, now),
            kind: '피드백',
            urgency: 'normal',
            unread: false,
            tab: 'reviews',
            entityId: request.id,
            at: feedbackAt,
          })
        }
        if (request.status !== 'pending') {
          const closedAt = eventTime(request.updated_at ?? request.created_at)
          requestItems.push({
            id: `status-${request.id}`,
            actor: '파',
            title: `“${request.title}” 검토요청이 ${request.status === 'approved' ? '완료' : '반려'}되었습니다.`,
            when: relativeTime(closedAt, now),
            kind: '상태 변경',
            urgency: request.status === 'rejected' ? 'warning' : 'normal',
            unread: false,
            tab: 'reviews',
            entityId: request.id,
            at: closedAt,
          })
        }
        if (requestItems.length > 0 && isReviewUnread(request, profile, leaderMode, seenAtIso)) {
          requestItems.reduce((left, right) => (right.at > left.at ? right : left)).unread = true
        }
        items.push(...requestItems)
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
