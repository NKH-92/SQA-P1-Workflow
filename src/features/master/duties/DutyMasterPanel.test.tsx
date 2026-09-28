import '@testing-library/jest-dom/vitest'
import { act, cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useEffect, useState, type Dispatch, type SetStateAction } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MASTER_STALE_MESSAGE } from '../../../data/validation/masterOcc'
import { createPreviewData, previewLeader } from '../../../demoData'
import { toUserMessage } from '../../../lib/errors'
import type { AppData } from '../../../types'
import { DutyMasterPanel } from './DutyMasterPanel'

vi.mock('../../../lib/supabase', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../lib/supabase')>()
  return { ...actual, hasSupabaseConfig: false }
})

afterEach(() => {
  cleanup()
  window.sessionStorage.clear()
})

let latestData: AppData | null = null

function Harness({ initialData }: { initialData: AppData }) {
  const [data, setData] = useState(initialData)
  useEffect(() => {
    latestData = data
  }, [data])
  return (
    <DutyMasterPanel
      profile={previewLeader}
      data={data}
      setData={setData}
      mutate={async (operation) => {
        await operation()
        return true
      }}
    />
  )
}

let latestSetData: Dispatch<SetStateAction<AppData>> | null = null
const mutationErrors: string[] = []

/** 실제 mutate처럼 실패를 삼키고 false를 돌려주는 하네스(오류 문구는 mutationErrors에 모은다). */
function FailSafeHarness({ initialData }: { initialData: AppData }) {
  const [data, setData] = useState(initialData)
  useEffect(() => {
    latestData = data
    latestSetData = setData
  }, [data])
  return (
    <DutyMasterPanel
      profile={previewLeader}
      data={data}
      setData={setData}
      mutate={async (operation) => {
        try {
          await operation()
          return true
        } catch (error) {
          mutationErrors.push(toUserMessage(error))
          return false
        }
      }}
    />
  )
}

function bumpDuty(dutyId: string) {
  act(() => {
    latestSetData!((current) => ({
      ...current,
      duties: current.duties.map((item) => (item.id === dutyId ? { ...item, updated_at: '2099-01-01T00:00:00.000Z' } : item)),
    }))
  })
}

describe('DutyMasterPanel duty reassignment (P0-3)', () => {
  it('moves a duty to another member with a required reason from the table row', async () => {
    const user = userEvent.setup()
    const data = createPreviewData()
    const assignment = data.dutyAssignments[0]!
    const duty = data.duties.find((item) => item.id === assignment.duty_id)!
    const currentOwner = data.profiles.find((item) => item.id === assignment.user_id)!
    const nextOwner = data.profiles.find(
      (item) => item.role === 'member' && item.is_active !== false
        && !data.dutyAssignments.some((row) => row.duty_id === duty.id && row.user_id === item.id),
    )!
    render(<Harness initialData={data} />)

    await user.click(screen.getByRole('button', { name: `${duty.name} 담당자 변경` }))
    const dialog = screen.getByRole('dialog', { name: `‘${duty.name}’ 담당자를 바꿀까요?` })
    expect(within(dialog).getByRole('checkbox', { name: new RegExp(currentOwner.name) })).toBeChecked()

    await user.click(within(dialog).getByRole('checkbox', { name: new RegExp(currentOwner.name) }))
    await user.click(within(dialog).getByRole('checkbox', { name: new RegExp(nextOwner.name) }))
    const submit = within(dialog).getByRole('button', { name: '담당자 저장하기' })
    expect(submit).toBeDisabled()
    expect(within(dialog).getByText('변경 사유를 적으면 저장할 수 있어요.')).toBeInTheDocument()
    expect(within(dialog).getByText(nextOwner.name, { selector: 'strong' })).toBeInTheDocument()

    await user.type(within(dialog).getByLabelText(/변경 사유/), '담당 제품군 변경')
    await user.click(submit)

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    const owners = latestData!.dutyAssignments.filter((row) => row.duty_id === duty.id).map((row) => row.user_id)
    expect(owners).toContain(nextOwner.id)
    expect(owners).not.toContain(currentOwner.id)
  })

  it('removes every owner so the duty shows that it has no owner', async () => {
    const user = userEvent.setup()
    const data = createPreviewData()
    const assignment = data.dutyAssignments[0]!
    const duty = data.duties.find((item) => item.id === assignment.duty_id)!
    const owners = data.dutyAssignments.filter((row) => row.duty_id === duty.id)
    data.duties = data.duties.map((item) => item.id === duty.id ? { ...item, assignee_label: null } : item)
    render(<Harness initialData={data} />)

    await user.click(screen.getByRole('button', { name: `${duty.name} 담당자 변경` }))
    const dialog = screen.getByRole('dialog', { name: `‘${duty.name}’ 담당자를 바꿀까요?` })
    for (const owner of owners) {
      const name = data.profiles.find((item) => item.id === owner.user_id)!.name
      await user.click(within(dialog).getByRole('checkbox', { name: new RegExp(name) }))
    }
    expect(within(dialog).getByRole('status')).toHaveTextContent('담당자가 없는 업무가 돼요')
    await user.type(within(dialog).getByLabelText(/변경 사유/), '업무 종료')
    await user.click(within(dialog).getByRole('button', { name: '담당자 저장하기' }))

    expect(latestData!.dutyAssignments.filter((row) => row.duty_id === duty.id)).toEqual([])
    const row = screen.getByRole('button', { name: `${duty.name} 담당자 변경` }).closest('tr')!
    expect(within(row).getByText('담당자 없음')).toBeInTheDocument()
  })

  it('checks the reassignment against the revision captured when the dialog opened', async () => {
    const user = userEvent.setup()
    mutationErrors.length = 0
    const data = createPreviewData()
    const assignment = data.dutyAssignments[0]!
    const duty = data.duties.find((item) => item.id === assignment.duty_id)!
    const currentOwner = data.profiles.find((item) => item.id === assignment.user_id)!
    const before = data.dutyAssignments.filter((row) => row.duty_id === duty.id).map((row) => row.user_id)
    render(<FailSafeHarness initialData={data} />)

    await user.click(screen.getByRole('button', { name: `${duty.name} 담당자 변경` }))
    const dialog = screen.getByRole('dialog', { name: `‘${duty.name}’ 담당자를 바꿀까요?` })
    // 창을 열어 둔 사이 다른 곳에서 같은 업무가 바뀌고 목록이 새로고침됐다.
    bumpDuty(duty.id)
    await user.click(within(dialog).getByRole('checkbox', { name: new RegExp(currentOwner.name) }))
    await user.type(within(dialog).getByLabelText(/변경 사유/), '담당 제품군 변경')
    await user.click(within(dialog).getByRole('button', { name: '담당자 저장하기' }))

    expect(mutationErrors).toEqual([MASTER_STALE_MESSAGE])
    expect(latestData!.dutyAssignments.filter((row) => row.duty_id === duty.id).map((row) => row.user_id)).toEqual(before)
    // 연 시점의 버전으로는 다시 저장해도 같은 충돌이 나므로 창을 닫는다. 다시 열면 최신 버전으로 저장된다.
    expect(screen.queryByRole('dialog', { name: `‘${duty.name}’ 담당자를 바꿀까요?` })).not.toBeInTheDocument()

    mutationErrors.length = 0
    await user.click(screen.getByRole('button', { name: `${duty.name} 담당자 변경` }))
    const reopened = screen.getByRole('dialog', { name: `‘${duty.name}’ 담당자를 바꿀까요?` })
    await user.click(within(reopened).getByRole('checkbox', { name: new RegExp(currentOwner.name) }))
    await user.type(within(reopened).getByLabelText(/변경 사유/), '담당 제품군 변경')
    await user.click(within(reopened).getByRole('button', { name: '담당자 저장하기' }))
    expect(mutationErrors).toEqual([])
    expect(latestData!.dutyAssignments.filter((row) => row.duty_id === duty.id).map((row) => row.user_id)).not.toEqual(before)
  })

  it('closes the inline duty edit on a stale-write conflict so reopening takes the fresh revision', async () => {
    const user = userEvent.setup()
    mutationErrors.length = 0
    const data = createPreviewData()
    const duty = data.duties[0]!
    render(<FailSafeHarness initialData={data} />)

    await user.click(screen.getByRole('button', { name: `${duty.name} 업무 수정` }))
    bumpDuty(duty.id)
    const nameInput = screen.getByRole('textbox', { name: `${duty.name} 업무 이름` })
    await user.clear(nameInput)
    await user.type(nameInput, '충돌 난 이름')
    await user.click(screen.getByRole('button', { name: `${duty.name} 업무 저장` }))
    const dialog = screen.getByRole('dialog', { name: '업무 정보를 바꿀까요?' })
    await user.type(within(dialog).getByRole('textbox'), '이름 정리')
    await user.click(within(dialog).getByRole('button', { name: '저장하기' }))

    expect(mutationErrors).toEqual([MASTER_STALE_MESSAGE])
    expect(screen.queryByRole('dialog', { name: '업무 정보를 바꿀까요?' })).not.toBeInTheDocument()
    expect(screen.queryByDisplayValue('충돌 난 이름')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: `${duty.name} 업무 수정` }))
    const reopened = screen.getByRole('textbox', { name: `${duty.name} 업무 이름` })
    await user.clear(reopened)
    await user.type(reopened, '새로 고친 이름')
    await user.click(screen.getByRole('button', { name: `${duty.name} 업무 저장` }))
    const retryDialog = screen.getByRole('dialog', { name: '업무 정보를 바꿀까요?' })
    await user.type(within(retryDialog).getByRole('textbox'), '이름 정리')
    await user.click(within(retryDialog).getByRole('button', { name: '저장하기' }))

    expect(mutationErrors).toEqual([MASTER_STALE_MESSAGE])
    expect(latestData!.duties.find((item) => item.id === duty.id)!.name).toBe('새로 고친 이름')
  })

  it('closes the inline major category edit on a stale-write conflict', async () => {
    const user = userEvent.setup()
    mutationErrors.length = 0
    const data = createPreviewData()
    const category = data.dutyMajorCategories[0]!
    render(<FailSafeHarness initialData={data} />)

    await user.click(screen.getByRole('button', { name: `${category.name} 대분류 수정` }))
    act(() => {
      latestSetData!((current) => ({
        ...current,
        dutyMajorCategories: current.dutyMajorCategories.map((item) => (
          item.id === category.id ? { ...item, updated_at: '2099-01-01T00:00:00.000Z' } : item
        )),
      }))
    })
    const nameInput = screen.getByRole('textbox', { name: `${category.name} 대분류 이름` })
    await user.clear(nameInput)
    await user.type(nameInput, '충돌 난 대분류')
    await user.click(screen.getByRole('button', { name: `${category.name} 대분류 저장` }))
    const dialog = screen.getByRole('dialog', { name: '대분류 이름을 바꿀까요?' })
    await user.type(within(dialog).getByRole('textbox'), '이름 정리')
    await user.click(within(dialog).getByRole('button', { name: '저장하기' }))

    expect(mutationErrors).toEqual([MASTER_STALE_MESSAGE])
    expect(screen.queryByRole('dialog', { name: '대분류 이름을 바꿀까요?' })).not.toBeInTheDocument()
    expect(screen.queryByDisplayValue('충돌 난 대분류')).not.toBeInTheDocument()
  })

  it('offers the next step on an empty table', () => {
    const data = createPreviewData()
    data.dutyMajorCategories = []
    data.duties = []
    data.dutyAssignments = []
    render(<Harness initialData={data} />)

    expect(screen.getByText('아직 대분류가 없어요')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /대분류 등록/ }).length).toBeGreaterThan(1)
  })
})
