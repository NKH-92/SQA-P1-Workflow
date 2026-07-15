import type { AppData, Profile } from '../types'
import { eventTime } from './dates'

export type ReadState = {
  reviewsSeenAt: string | null
}

function storageKey(userId: string) {
  return `readState:${userId}`
}

export function loadReadState(userId: string): ReadState {
  if (typeof localStorage === 'undefined') return { reviewsSeenAt: null }
  try {
    const raw = localStorage.getItem(storageKey(userId))
    if (!raw) return { reviewsSeenAt: null }
    return JSON.parse(raw) as ReadState
  } catch {
    return { reviewsSeenAt: null }
  }
}

export function markReviewsSeen(userId: string) {
  if (typeof localStorage === 'undefined') return
  const state = loadReadState(userId)
  try {
    localStorage.setItem(storageKey(userId), JSON.stringify({ ...state, reviewsSeenAt: new Date().toISOString() }))
  } catch {
    // Storage-blocked environments (private mode, quota) must not crash the reviews tab.
  }
}

type UnreadCheckRequest = AppData['reviewRequests'][number]

/** 목록의 미확인 dot과 뱃지 카운트가 같은 판정을 쓰도록 단일 함수로 유지한다. */
export function isReviewUnread(
  request: UnreadCheckRequest,
  profile: Profile,
  leaderMode: boolean,
  seenAtIso: string | null,
): boolean {
  const seenAt = eventTime(seenAtIso)
  if (leaderMode) {
    // A member resubmission updates the same row, so use its submission timestamp rather
    // than created_at. Content-only edits do not create false unread items.
    return request.status === 'pending' && eventTime(request.last_submitted_at ?? request.created_at) > seenAt
  }
  // Unread for the member = the leader acted on their request: new feedback, or a final
  // (approved/rejected) status change. The member's own new pending request must not count.
  if (request.requester_id !== profile.id) return false
  const newFeedback = request.review_feedback?.some(
    (item) => (item.author_role ?? 'leader') === 'leader' && eventTime(item.created_at) > seenAt,
  )
  const closedUpdate = request.status !== 'pending' && eventTime(request.updated_at ?? request.created_at) > seenAt
  return Boolean(newFeedback) || closedUpdate
}

export function countUnreadReviews(profile: Profile, data: AppData, leaderMode: boolean) {
  const seenAtIso = loadReadState(profile.id).reviewsSeenAt
  return data.reviewRequests.filter((request) => isReviewUnread(request, profile, leaderMode, seenAtIso)).length
}
