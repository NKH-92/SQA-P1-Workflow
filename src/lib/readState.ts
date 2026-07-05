import type { AppData, Profile } from '../types'

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
  localStorage.setItem(storageKey(userId), JSON.stringify({ ...state, reviewsSeenAt: new Date().toISOString() }))
}

function eventTime(value?: string | null) {
  if (!value) return 0
  const time = Date.parse(value)
  return Number.isNaN(time) ? 0 : time
}

export function countUnreadReviews(profile: Profile, data: AppData, leaderMode: boolean) {
  const seenAt = eventTime(loadReadState(profile.id).reviewsSeenAt)
  if (leaderMode) {
    return data.reviewRequests.filter((request) => {
      if (request.status === 'pending') return eventTime(request.created_at) > seenAt
      const newFeedback = request.review_feedback?.some((item) => eventTime(item.created_at) > seenAt)
      return newFeedback
    }).length
  }

  return data.reviewRequests.filter((request) => {
    if (request.requester_id !== profile.id) return false
    const updated = eventTime(request.updated_at ?? request.created_at)
    const newFeedback = request.review_feedback?.some((item) => eventTime(item.created_at) > seenAt)
    return updated > seenAt || newFeedback
  }).length
}
