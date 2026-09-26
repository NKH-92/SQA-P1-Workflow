import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useEffect, useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createPreviewData, previewLeader } from '../../../demoData'
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
