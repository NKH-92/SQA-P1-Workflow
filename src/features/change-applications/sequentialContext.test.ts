import { describe, expect, it, vi } from 'vitest'
import { createPreviewData, previewMember } from '../../demoData'
import { completeProductChangeTask } from '../../data'
import type { AppData, ProductChangeTask } from '../../types'
import { createSequentialRepositoryContext } from './sequentialContext'

vi.mock('../../lib/supabase', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/supabase')>()
  return { ...actual, hasSupabaseConfig: false, supabase: null }
})

vi.mock('../../data/activityLog', () => ({
  recordActivityLog: vi.fn(async () => undefined),
}))

function dataWithTwoOwnTasks(): { data: AppData; tasks: ProductChangeTask[] } {
  const data = createPreviewData()
  const ownTasks = data.productChangeTasks.filter(
    (task) => task.assignee_id === previewMember.id && task.status === 'pending' && task.action_item_id === 'change-action-01',
  )
  if (ownTasks.length >= 2) return { data, tasks: ownTasks.slice(0, 2) }
  const first = ownTasks[0]!
  const second: ProductChangeTask = { ...first, id: 'product-change-task-second', product_id: `${first.product_id}-second` }
  data.productChangeTasks = [...data.productChangeTasks, second]
  return { data, tasks: [first, second] }
}

describe('sequential repository context', () => {
  it('lets a second local write see the first one inside the same save (one memo for a whole product)', async () => {
    const { data, tasks } = dataWithTwoOwnTasks()
    let state = data
    const setData = vi.fn((update: AppData | ((current: AppData) => AppData)) => {
      state = typeof update === 'function' ? update(state) : update
    })
    const context = createSequentialRepositoryContext(previewMember, data, setData)

    for (const task of tasks) {
      await completeProductChangeTask(context, task.id, '두 건 모두 반영', '')
    }

    for (const task of tasks) {
      expect(state.productChangeTasks.find((item) => item.id === task.id)).toMatchObject({
        status: 'completed',
        completion_note: '두 건 모두 반영',
      })
    }
  })
})
