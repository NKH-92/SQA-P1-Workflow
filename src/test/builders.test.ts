import { describe, expect, it } from 'vitest'
import { buildChangeApplication, buildProductChangeTask } from './builders'

describe('domain test builders', () => {
  it('returns complete defaults and applies explicit overrides last', () => {
    expect(buildChangeApplication({ id: 'custom-change', status: 'draft' })).toMatchObject({
      id: 'custom-change',
      status: 'draft',
      source: 'official',
    })
    expect(buildProductChangeTask({ id: 'custom-task', assignee_id: null })).toMatchObject({
      id: 'custom-task',
      assignee_id: null,
      status: 'pending',
    })
  })
})
