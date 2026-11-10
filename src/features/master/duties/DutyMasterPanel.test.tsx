import '@testing-library/jest-dom/vitest'
import { act, cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useEffect, useState, type Dispatch, type SetStateAction } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createPreviewData, previewLeader } from '../../../demoData'
import type { AppData } from '../../../types'
import { DutyMasterPanel } from './DutyMasterPanel'

vi.mock('../../../lib/supabase', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../lib/supabase')>()
  return { ...actual, hasSupabaseConfig: false }
})

let latestData: AppData
let updateData: Dispatch<SetStateAction<AppData>>

function Harness({ initialData, readOnly = false }: { initialData: AppData; readOnly?: boolean }) {
  const [data, setData] = useState(initialData)
  useEffect(() => {
    latestData = data
    updateData = setData
  }, [data])
  return <DutyMasterPanel
    profile={readOnly ? { ...previewLeader, role: 'team_leader' } : previewLeader}
    data={data}
    setData={setData}
    mutate={async (operation) => {
      try { await operation(); return true } catch { return false }
    }}
  />
}

afterEach(() => {
  cleanup()
  window.sessionStorage.clear()
})

describe('업무분장 통합 편집', () => {
  it('registers a new duty with a product label and notes, without assigning people', async () => {
    const user = userEvent.setup()
    const data = createPreviewData()
    render(<Harness initialData={data} />)
    await user.click(screen.getByRole('button', { name: '업무 등록' }))
    const form = within(screen.getByRole('dialog', { name: '업무 등록' }))
    await user.type(form.getByLabelText('업무명'), '분기별 제품 점검')
    await user.selectOptions(form.getByLabelText('담당 방식'), 'product')
    await user.type(form.getByLabelText('비고'), '분기마다 갱신')
    await user.click(form.getByRole('button', { name: '업무 등록하기' }))

    const duty = latestData.duties.find(({ name }) => name === '분기별 제품 점검')!
    expect(duty).toMatchObject({ assignee_label: '제품 담당자', notes: '분기마다 갱신' })
    expect(latestData.dutyAssignments.some((row) => row.duty_id === duty.id)).toBe(false)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('keeps an inactive legacy owner and label when editing notes, then warns before replacing them', async () => {
    const user = userEvent.setup()
    const data = createPreviewData()
    const owner = data.dutyAssignments[0]
    const duty = data.duties.find(({ id }) => id === owner.duty_id)!
    data.profiles.find(({ id }) => id === owner.user_id)!.is_active = false
    duty.assignee_label = '기존 별도 표기'
    render(<Harness initialData={data} />)
    const trigger = screen.getByRole('button', { name: duty.name + ' 비고 수정' })
    await user.click(trigger)
    let form = within(screen.getByRole('dialog'))
    const notes = form.getByLabelText('비고')
    await user.clear(notes)
    await user.type(notes, '비고만 수정')
    const submit = form.getByRole('button', { name: '저장하기' })
    expect(submit).toBeDisabled()
    await user.type(form.getByLabelText(/변경 사유/), '비고 정리')
    await user.click(submit)
    expect(latestData.duties.find(({ id }) => id === duty.id)).toMatchObject({ notes: '비고만 수정', assignee_label: '기존 별도 표기' })
    expect(latestData.dutyAssignments.some(({ id }) => id === owner.id)).toBe(true)
    expect(trigger).toHaveFocus()

    await user.click(screen.getByRole('button', { name: duty.name + ' 담당자 수정' }))
    form = within(screen.getByRole('dialog'))
    await user.selectOptions(form.getByLabelText(/담당 방식/), 'product')
    expect(form.getByRole('status')).toHaveTextContent('저장하면 담당에서 빠져요')
    await user.type(form.getByLabelText(/변경 사유/), '분장 기준 변경')
    await user.click(form.getByRole('button', { name: '저장하기' }))
    expect(latestData.duties.find(({ id }) => id === duty.id)?.assignee_label).toBe('제품 담당자')
    expect(latestData.dutyAssignments.some((row) => row.duty_id === duty.id)).toBe(false)
  })

  it('saves a replacement and metadata together', async () => {
    const user = userEvent.setup()
    const data = createPreviewData()
    const owner = data.dutyAssignments[0]
    const duty = data.duties.find(({ id }) => id === owner.duty_id)!
    const next = data.profiles.find((profile) => profile.role === 'member' && profile.id !== owner.user_id)!
    render(<Harness initialData={data} />)
    await user.click(screen.getByRole('button', { name: duty.name + ' 담당자 수정' }))
    const form = within(screen.getByRole('dialog'))
    await user.click(form.getByRole('checkbox', { name: owner.profiles!.name }))
    await user.click(form.getByRole('checkbox', { name: next.name }))
    await user.clear(form.getByLabelText('비고'))
    await user.type(form.getByLabelText('비고'), '인수인계 확인')
    await user.type(form.getByLabelText(/변경 사유/), '담당 변경')
    await user.click(form.getByRole('button', { name: '저장하기' }))
    expect(latestData.dutyAssignments.filter(({ duty_id }) => duty_id === duty.id).map(({ user_id }) => user_id)).toEqual([next.id])
    expect(latestData.duties.find(({ id }) => id === duty.id)?.notes).toBe('인수인계 확인')
  })

  it('preserves the draft on a concurrent change and only reloads when requested', async () => {
    const user = userEvent.setup()
    const data = createPreviewData()
    const duty = data.duties[0]
    render(<Harness initialData={data} />)
    await user.click(screen.getByRole('button', { name: duty.name + ' 비고 수정' }))
    const form = within(screen.getByRole('dialog'))
    await user.clear(form.getByLabelText('비고'))
    await user.type(form.getByLabelText('비고'), '작성 중인 비고')
    act(() => updateData((current) => ({
      ...current,
      duties: current.duties.map((item) => item.id === duty.id
        ? { ...item, notes: '먼저 저장된 비고', updated_at: '2099-01-01T00:00:00.000Z' } : item),
    })))
    expect(form.getByRole('alert')).toHaveTextContent('다른 사람이 먼저 수정')
    expect(form.getByLabelText('비고')).toHaveValue('작성 중인 비고')
    expect(form.getByRole('button', { name: '저장하기' })).toBeDisabled()
    await user.click(form.getByRole('button', { name: '최신 내용 불러오기' }))
    await user.click(form.getByRole('button', { name: '불러오기' }))
    expect(screen.getByLabelText('비고')).toHaveValue('먼저 저장된 비고')
  })

  it('offers category creation when the table is empty', () => {
    const data = { ...createPreviewData(), dutyMajorCategories: [], duties: [], dutyAssignments: [] }
    render(<Harness initialData={data} />)
    expect(screen.getByText('아직 대분류가 없어요')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '대분류 등록' })).toBeEnabled()
  })

  it('rejects a category rename opened against an older version', async () => {
    const user = userEvent.setup()
    const data = createPreviewData()
    const category = data.dutyMajorCategories[0]
    render(<Harness initialData={data} />)
    await user.click(screen.getByRole('button', { name: category.name + ' 대분류 관리' }))
    await user.click(screen.getByRole('menuitem', { name: '대분류 이름 수정' }))
    const form = within(screen.getByRole('dialog', { name: '대분류 이름 수정' }))
    await user.clear(form.getByLabelText('대분류명'))
    await user.type(form.getByLabelText('대분류명'), '늦게 입력한 이름')
    await user.type(form.getByLabelText(/변경 사유/), '분류 정리')
    act(() => updateData((current) => ({
      ...current,
      dutyMajorCategories: current.dutyMajorCategories.map((item) => item.id === category.id
        ? { ...item, name: '먼저 저장한 이름', updated_at: '2099-01-01T00:00:00.000Z' } : item),
    })))
    await user.click(form.getByRole('button', { name: '저장하기' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(latestData.dutyMajorCategories.find(({ id }) => id === category.id)?.name).toBe('먼저 저장한 이름')
  })

  it('lets read-only leaders print the full or filtered report without a management column', async () => {
    const user = userEvent.setup()
    const data = createPreviewData()
    data.duties[0].notes = '고유한 검색 비고'
    render(<Harness initialData={data} readOnly />)
    await user.type(screen.getByRole('searchbox', { name: '업무분장 검색' }), '고유한 검색')
    expect(screen.getByRole('status')).toHaveTextContent('검색 결과 1건')
    expect(screen.queryByRole('button', { name: '업무 등록' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '인쇄 미리보기' }))
    const form = within(screen.getByRole('dialog', { name: '업무분장표 인쇄 미리보기' }))
    const table = within(form.getByRole('table'))
    expect(table.getAllByRole('row')).toHaveLength(data.duties.length + 1)
    expect(table.getAllByRole('columnheader').map((header) => header.textContent)).toEqual(['대분류', '업무명', '담당자', '비고'])
    await user.selectOptions(form.getByLabelText('출력 범위'), 'filtered')
    expect(table.getAllByRole('row')).toHaveLength(2)
    expect(table.getByText('고유한 검색 비고')).toBeVisible()
  })
})
