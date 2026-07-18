import type { ChangeApplication, ProductChangeTask } from '../types'

const DEFAULT_TIME = '2026-07-01T00:00:00.000Z'

export function buildChangeApplication(
  overrides: Partial<ChangeApplication> = {},
): ChangeApplication {
  return {
    id: 'change-1',
    change_number: 'CC-2026-001',
    source: 'official',
    title: '제조원 변경',
    summary: '요약',
    source_url: null,
    effective_date: '2026-08-01',
    status: 'published',
    created_by: 'leader-1',
    published_at: DEFAULT_TIME,
    cancelled_at: null,
    cancellation_reason: null,
    created_at: DEFAULT_TIME,
    updated_at: DEFAULT_TIME,
    ...overrides,
  }
}

export function buildProductChangeTask(
  overrides: Partial<ProductChangeTask> = {},
): ProductChangeTask {
  return {
    id: 'task-1',
    action_item_id: 'action-1',
    product_id: 'product-1',
    product_name: '제품 1',
    assignee_id: 'member-1',
    assignee_name: '담당자',
    status: 'pending',
    product_note: null,
    completion_note: null,
    resolution_reason: null,
    proxy_reason: null,
    completed_by: null,
    completed_by_name: null,
    completed_at: null,
    reopened_by: null,
    reopened_by_name: null,
    reopened_at: null,
    reopen_reason: null,
    created_at: DEFAULT_TIME,
    updated_at: DEFAULT_TIME,
    ...overrides,
  }
}
