import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPreviewData, previewMember } from '../../demoData'
import { UserFacingError } from '../../lib/errors'

const dataMocks = vi.hoisted(() => ({ completeProductChangeTask: vi.fn() }))

vi.mock('../../data', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../data')>()),
  completeProductChangeTask: dataMocks.completeProductChangeTask,
}))

import { useChangeApplicationController } from './useChangeApplicationController'

function renderController() {
  return renderHook(() => useChangeApplicationController(previewMember, createPreviewData(), vi.fn())).result
}

describe('useChangeApplicationController.completeTasks', () => {
  beforeEach(() => {
    dataMocks.completeProductChangeTask.mockReset()
  })

  it('says how many tasks were completed when a later one fails, because earlier ones are already saved', async () => {
    dataMocks.completeProductChangeTask
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new UserFacingError('다른 사람이 먼저 처리했어요.'))
    const controller = renderController()

    await expect(controller.current.completeTasks(['task-a', 'task-b', 'task-c'], 'Rev.12 반영'))
      .rejects.toThrow('남은 2건을 다시 처리해 주세요. 3건 중 1건은 완료했어요. 다른 사람이 먼저 처리했어요.')
    expect(dataMocks.completeProductChangeTask).toHaveBeenCalledTimes(2)
  })

  it('passes the first failure through unchanged when nothing was saved yet', async () => {
    dataMocks.completeProductChangeTask.mockRejectedValueOnce(new UserFacingError('권한이 없어요.'))
    const controller = renderController()

    await expect(controller.current.completeTasks(['task-a', 'task-b'], 'Rev.12 반영')).rejects.toThrow(/^권한이 없어요\.$/)
    expect(dataMocks.completeProductChangeTask).toHaveBeenCalledTimes(1)
  })

  it('sends each task once even if the same id is passed twice', async () => {
    dataMocks.completeProductChangeTask.mockResolvedValue(undefined)
    const controller = renderController()

    await controller.current.completeTasks(['task-a', 'task-a', 'task-b'], 'Rev.12 반영')
    expect(dataMocks.completeProductChangeTask).toHaveBeenCalledTimes(2)
  })
})
