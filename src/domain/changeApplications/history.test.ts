import { describe, expect, it } from 'vitest'
import { createPreviewData } from '../../demoData'
import type {
  AppData,
  ChangeActionItem,
  ChangeApplication,
  ChangeApplicationHistoryFilters,
  ProductChangeTask,
} from '../../types'
import {
  buildLocalChangeApplicationHistoryPage,
  normalizeChangeApplicationHistoryResult,
} from './history'

const NOW = new Date('2026-08-01T12:00:00.000Z')
const DEFAULT_FILTERS: ChangeApplicationHistoryFilters = {
  result: null,
  query: '',
  from: null,
  to: null,
  product_id: null,
  assignee_id: null,
}

function application(
  id: string,
  overrides: Partial<ChangeApplication> = {},
): ChangeApplication {
  return {
    id,
    change_number: `CC-${id}`,
    source: 'official',
    title: `Title ${id}`,
    summary: `Summary ${id}`,
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

function action(applicationId: string): ChangeActionItem {
  return {
    id: `action-${applicationId}`,
    change_application_id: applicationId,
    kind: 'product_standard',
    custom_kind_name: null,
    content: `Action for ${applicationId}`,
    due_date: '2026-08-01',
    sort_order: 1,
    created_at: '2026-07-01T00:00:00.000Z',
    updated_at: '2026-07-01T00:00:00.000Z',
  }
}

function task(
  applicationId: string,
  overrides: Partial<ProductChangeTask> = {},
): ProductChangeTask {
  return {
    id: `task-${applicationId}`,
    action_item_id: `action-${applicationId}`,
    product_id: `product-${applicationId}`,
    product_name: `Product ${applicationId}`,
    assignee_id: `assignee-${applicationId}`,
    assignee_name: `Assignee ${applicationId}`,
    status: 'completed',
    product_note: null,
    completion_note: null,
    resolution_reason: null,
    cancel_kind: null,
    proxy_reason: null,
    completed_by: `assignee-${applicationId}`,
    completed_by_name: `Assignee ${applicationId}`,
    completed_at: '2026-07-01T00:00:00.000Z',
    reopened_by: null,
    reopened_by_name: null,
    reopened_at: null,
    reopen_reason: null,
    created_at: '2026-07-01T00:00:00.000Z',
    updated_at: '2026-07-01T00:00:00.000Z',
    ...overrides,
  }
}

function historyData(
  applications: ChangeApplication[],
  tasks: ProductChangeTask[] = applications.map((item) => task(item.id)),
): AppData {
  return {
    ...createPreviewData(),
    changeApplications: applications,
    changeApplicationSummaries: [],
    changeActionItems: applications.map((item) => action(item.id)),
    productChangeTasks: tasks,
  }
}

function ids(data: AppData, filters: Partial<ChangeApplicationHistoryFilters>) {
  return buildLocalChangeApplicationHistoryPage(
    data,
    { ...DEFAULT_FILTERS, ...filters },
    null,
    NOW,
  ).rows.map((row) => row.id)
}

describe('change application history normalization', () => {
  it('distinguishes final completion, cancellation, and both legacy archive origins', () => {
    expect(normalizeChangeApplicationHistoryResult(application('completed', {
      final_completed_at: '2026-07-04T00:00:00.000Z',
      archived_at: '2026-07-04T00:00:00.000Z',
      archive_origin: 'automatic',
    }))).toBe('completed')
    expect(normalizeChangeApplicationHistoryResult(application('cancelled', {
      status: 'cancelled',
      cancelled_at: '2026-07-03T00:00:00.000Z',
    }))).toBe('cancelled')
    expect(normalizeChangeApplicationHistoryResult(application('legacy-auto', {
      archived_at: '2026-07-02T00:00:00.000Z',
      archive_origin: 'automatic',
    }))).toBe('legacy_auto')
    expect(normalizeChangeApplicationHistoryResult(application('legacy-manual', {
      archived_at: '2026-07-01T00:00:00.000Z',
      archive_origin: 'manual',
    }))).toBe('legacy_manual')
    expect(normalizeChangeApplicationHistoryResult(application('active'))).toBeNull()
  })

  it('emits a schema-validated history envelope with summaries and product tasks', () => {
    const completed = application('completed', {
      final_completed_at: '2026-07-04T00:00:00.000Z',
      archived_at: '2026-07-04T00:00:00.000Z',
      archive_origin: 'manual',
    })

    const page = buildLocalChangeApplicationHistoryPage(
      historyData([completed]),
      DEFAULT_FILTERS,
      null,
      NOW,
    )

    expect(page).toMatchObject({
      schema_version: 1,
      snapshot_at: NOW.toISOString(),
      has_more: false,
      next_cursor: null,
    })
    expect(page.rows[0]).toMatchObject({
      id: 'completed',
      history_result: 'completed',
      history_at: '2026-07-04T00:00:00.000Z',
      application_summary: {
        workflow_status: 'completed',
        can_finalize: false,
      },
      product_tasks: [{ id: 'task-completed' }],
    })
  })
})

describe('local change application history filtering and pagination', () => {
  const applications = [
    application('completed', {
      change_number: 'CC-FINAL-001',
      title: 'Final packaging update',
      final_completed_at: '2026-07-04T00:00:00.000Z',
      archived_at: '2026-07-04T00:00:00.000Z',
      archive_origin: 'manual',
    }),
    application('cancelled', {
      change_number: 'CC-CANCELLED-001',
      title: 'Cancelled label update',
      status: 'cancelled',
      cancelled_at: '2026-07-03T00:00:00.000Z',
    }),
    application('legacy-auto', {
      change_number: 'CC-LEGACY-AUTO',
      title: 'Legacy automatic archive',
      archived_at: '2026-07-02T00:00:00.000Z',
      archive_origin: 'automatic',
    }),
    application('legacy-manual', {
      change_number: 'CC-LEGACY-MANUAL',
      title: 'Legacy manual archive',
      archived_at: '2026-07-01T00:00:00.000Z',
      archive_origin: 'manual',
    }),
  ]
  const tasks = [
    task('completed', {
      product_id: 'product-alpha',
      product_name: 'Alpha Product',
      assignee_id: 'assignee-one',
      assignee_name: 'Owner One',
    }),
    task('cancelled', {
      product_id: 'product-beta',
      product_name: 'Beta Product',
      assignee_id: 'assignee-two',
      assignee_name: 'Owner Two',
      status: 'cancelled',
      cancel_kind: 'application_cancelled',
      completed_by: null,
      completed_by_name: null,
      completed_at: null,
    }),
    task('legacy-auto', {
      product_id: 'product-alpha',
      product_name: 'Alpha Product',
      assignee_id: 'assignee-two',
      assignee_name: 'Owner Two',
    }),
    task('legacy-manual', {
      product_id: 'product-gamma',
      product_name: 'Gamma Product',
      assignee_id: 'assignee-one',
      assignee_name: 'Owner One',
    }),
  ]
  const data = historyData(applications, tasks)

  it('applies result, text, date, product, and assignee filters on the local path', () => {
    expect(ids(data, { result: 'legacy_auto' })).toEqual(['legacy-auto'])
    expect(ids(data, { query: 'PACKAGING' })).toEqual(['completed'])
    expect(ids(data, { query: 'owner two' })).toEqual(['cancelled', 'legacy-auto'])
    expect(ids(data, {
      from: '2026-07-02T00:00:00.000Z',
      to: '2026-07-03T00:00:00.000Z',
    })).toEqual(['cancelled', 'legacy-auto'])
    expect(ids(data, {
      product_id: 'product-alpha',
      assignee_id: 'assignee-two',
    })).toEqual(['legacy-auto'])
  })

  it('treats date-only filters as inclusive Seoul business dates', () => {
    const dateData = historyData([
      application('start', { archived_at: '2026-07-22T15:00:00.000Z', archive_origin: 'manual' }),
      application('same-day', { archived_at: '2026-07-23T14:59:59.999Z', archive_origin: 'manual' }),
      application('next-day', { archived_at: '2026-07-23T15:00:00.000Z', archive_origin: 'manual' }),
    ])

    expect(ids(dateData, { from: '2026-07-23', to: '2026-07-23' })).toEqual(['same-day', 'start'])
  })

  it('uses the (history_at, id) boundary without duplicating equal-time rows', () => {
    const at = '2026-07-05T00:00:00.000Z'
    const equalTimeData = historyData([
      application('same-a', { archived_at: at, archive_origin: 'manual' }),
      application('same-c', { archived_at: at, archive_origin: 'manual' }),
      application('same-b', { archived_at: at, archive_origin: 'manual' }),
    ])

    const first = buildLocalChangeApplicationHistoryPage(
      equalTimeData,
      DEFAULT_FILTERS,
      null,
      NOW,
      2,
    )
    expect(first.rows.map((row) => row.id)).toEqual(['same-c', 'same-b'])
    expect(first).toMatchObject({
      has_more: true,
      next_cursor: { history_at: at, id: 'same-b' },
    })

    const second = buildLocalChangeApplicationHistoryPage(
      equalTimeData,
      DEFAULT_FILTERS,
      first.next_cursor,
      NOW,
      2,
    )
    expect(second.rows.map((row) => row.id)).toEqual(['same-a'])
    expect(second).toMatchObject({ has_more: false, next_cursor: null })
  })
})
