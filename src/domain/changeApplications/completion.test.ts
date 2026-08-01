import { describe, expect, it } from 'vitest'
import type { ChangeApplication, ProductChangeTask } from '../../types'
import { buildChangeApplicationSummary } from './completion'

function application(overrides: Partial<ChangeApplication> = {}): ChangeApplication {
  return {
    id: 'application-1',
    change_number: 'CC-001',
    source: 'official',
    title: 'Common change',
    summary: 'Apply to selected products',
    source_url: null,
    effective_date: '2026-08-01',
    status: 'published',
    content_locked_at: null,
    archived_at: null,
    archived_by: null,
    archive_reason: null,
    archive_origin: null,
    final_completed_at: null,
    final_completed_by: null,
    final_completed_by_name: null,
    final_completion_note: null,
    created_by: 'leader-1',
    published_at: '2026-07-01T00:00:00.000Z',
    cancelled_at: null,
    cancellation_reason: null,
    created_at: '2026-07-01T00:00:00.000Z',
    updated_at: '2026-07-01T00:00:00.000Z',
    ...overrides,
  }
}

function task(
  id: string,
  overrides: Partial<ProductChangeTask> = {},
): ProductChangeTask {
  return {
    id,
    action_item_id: 'action-1',
    product_id: `product-${id}`,
    product_name: `Product ${id}`,
    assignee_id: 'member-1',
    assignee_name: 'Member One',
    status: 'pending',
    product_note: null,
    completion_note: null,
    resolution_reason: null,
    cancel_kind: null,
    proxy_reason: null,
    completed_by: null,
    completed_by_name: null,
    completed_at: null,
    reopened_by: null,
    reopened_by_name: null,
    reopened_at: null,
    reopen_reason: null,
    created_at: '2026-07-01T00:00:00.000Z',
    updated_at: '2026-07-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('buildChangeApplicationSummary', () => {
  it('counts scope-removed products as processed exceptions ready for leader review', () => {
    const summary = buildChangeApplicationSummary(application(), [
      task('completed', { status: 'completed' }),
      task('not-applicable', { status: 'not_applicable', resolution_reason: 'Not used' }),
      task('scope-removed', {
        status: 'cancelled',
        cancel_kind: 'scope_removed',
        assignee_id: null,
        assignee_name: null,
      }),
    ])

    expect(summary).toEqual({
      change_application_id: 'application-1',
      workflow_status: 'final_review_ready',
      total_count: 3,
      pending_count: 0,
      completed_count: 1,
      not_applicable_count: 1,
      scope_removed_count: 1,
      unresolved_cancelled_count: 0,
      unassigned_count: 0,
      processed_count: 3,
      percent: 100,
      can_finalize: true,
    })
  })

  it('keeps an unresolved manual cancellation out of final-review-ready state', () => {
    const summary = buildChangeApplicationSummary(application(), [
      task('completed', { status: 'completed' }),
      task('manual-cancel', { status: 'cancelled', cancel_kind: 'manual' }),
    ])

    expect(summary).toMatchObject({
      workflow_status: 'in_progress',
      total_count: 2,
      completed_count: 1,
      unresolved_cancelled_count: 1,
      processed_count: 1,
      percent: 50,
      can_finalize: false,
    })
  })

  it('excludes application-cancelled audit rows and preserves terminal status precedence', () => {
    const cancelled = buildChangeApplicationSummary(application({ status: 'cancelled' }), [
      task('application-cancelled', {
        status: 'cancelled',
        cancel_kind: 'application_cancelled',
        assignee_id: null,
        assignee_name: null,
      }),
    ])
    expect(cancelled).toMatchObject({
      workflow_status: 'cancelled',
      total_count: 0,
      unassigned_count: 0,
      can_finalize: false,
    })

    const completed = buildChangeApplicationSummary(application({
      final_completed_at: '2026-07-10T00:00:00.000Z',
      archived_at: '2026-07-10T00:00:00.000Z',
    }), [task('completed', { status: 'completed' })])
    expect(completed).toMatchObject({ workflow_status: 'completed', can_finalize: false })

    const legacy = buildChangeApplicationSummary(application({
      archived_at: '2026-07-09T00:00:00.000Z',
      archive_origin: 'automatic',
    }), [task('legacy', { status: 'completed' })])
    expect(legacy).toMatchObject({ workflow_status: 'legacy_completed', can_finalize: false })
  })
})
