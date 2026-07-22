import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AppData, Profile, ReviewEvent, ReviewRequest } from '../../types'
import type { AppDataUpdater } from './appDataUpdater'

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(async (): Promise<{ data: unknown; error: unknown }> => ({ data: null, error: null })),
}))

vi.mock('../../lib/supabase', () => ({
  hasSupabaseConfig: true,
  supabase: { rpc: mocks.rpc },
}))

import { createLocalReviewRepository } from '../local/localReviewRepository'
import { createSupabaseReviewRepository } from '../remote/supabaseReviewRepository'

const member: Profile = {
  id: 'member-1', email: 'member@example.com', name: 'Member', role: 'member',
}
const request: ReviewRequest = {
  id: 'review-1', requester_id: member.id, title: 'Review', description: 'Description',
  due_date: null, status: 'pending', created_at: '2026-07-18T00:00:00.000Z',
  review_feedback: [],
}
const feedback: ReviewEvent = {
  id: 10, review_request_id: request.id, actor_id: 'leader-1', actor_name_snapshot: 'Leader',
  event_type: 'feedback_added', from_status: null, to_status: null,
  occurred_at: '2026-07-18T00:01:00.000Z', metadata: {}, transaction_id: 1,
}
const voidedFeedback: ReviewEvent = {
  ...feedback, id: 11, event_type: 'feedback_voided', transaction_id: 2,
}

function appData(): AppData {
  return {
    announcements: [], changeApplications: [], changeActionItems: [], productChangeTasks: [],
    changeProductScope: [], changeAssigneeOptions: [], profiles: [member], allowedUsers: [], products: [],
    dutyMajorCategories: [], duties: [], productAssignments: [], dutyAssignments: [],
    reviewRequests: [request], reviewEvents: [feedback, voidedFeedback], reviewReadReceipts: [],
    auditEvents: [], projects: [], projectAssignments: [], profileNotes: [], activityLogs: [],
  }
}

function stateHarness() {
  let current = appData()
  const setData: AppDataUpdater = (update) => {
    current = typeof update === 'function' ? update(current) : update
  }
  return { get current() { return current }, setData }
}

describe('review read-state repository parity', () => {
  const activityLogs = { write: vi.fn(async () => undefined) }
  beforeEach(() => mocks.rpc.mockReset().mockResolvedValue({ data: null, error: null }))

  it('marks feedback_voided as seen in the local single and mark-all paths', async () => {
    const single = stateHarness()
    await createLocalReviewRepository({ profile: member, data: single.current, setData: single.setData, activityLogs })
      .markReviewSeen(request.id)
    expect(single.current.reviewReadReceipts?.[0]?.last_seen_event_id).toBe('11')

    const all = stateHarness()
    await createLocalReviewRepository({ profile: member, data: all.current, setData: all.setData, activityLogs })
      .markAllRelevantReviewsSeen()
    expect(all.current.reviewReadReceipts?.[0]?.last_seen_event_id).toBe('11')
  })

  it('projects the same feedback_voided receipt after the remote mark-all RPC', async () => {
    const state = stateHarness()
    await createSupabaseReviewRepository({ profile: member, data: state.current, setData: state.setData, activityLogs })
      .markAllRelevantReviewsSeen()

    expect(mocks.rpc).toHaveBeenCalledWith('mark_all_relevant_reviews_seen')
    expect(state.current.reviewReadReceipts?.[0]?.last_seen_event_id).toBe('11')
  })
})
