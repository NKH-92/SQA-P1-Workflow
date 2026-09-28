import '@testing-library/jest-dom/vitest'
import { act, cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useEffect, useState, type Dispatch, type SetStateAction } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MASTER_STALE_MESSAGE } from '../../../data/validation/masterOcc'
import { createPreviewData, previewLeader } from '../../../demoData'
import { toUserMessage } from '../../../lib/errors'
import type { AppData } from '../../../types'
import { InviteMasterPanel } from './InviteMasterPanel'

// 로컬 미리보기 저장소만 쓴다(원격 Supabase·account-admin을 부르지 않는다).
vi.mock('../../../lib/supabase', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../lib/supabase')>()
  return { ...actual, hasSupabaseConfig: false, supabase: null }
})

afterEach(() => {
  cleanup()
  window.sessionStorage.clear()
})

let latestData: AppData | null = null
let latestSetData: Dispatch<SetStateAction<AppData>> | null = null
const mutationErrors: string[] = []

/** 실제 mutate처럼 실패를 삼키고 false를 돌려주는 하네스(오류 문구는 mutationErrors에 모은다). */
function Harness({ initialData }: { initialData: AppData }) {
  const [data, setData] = useState(initialData)
  useEffect(() => {
    latestData = data
    latestSetData = setData
  }, [data])
  return (
    <InviteMasterPanel
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

describe('InviteMasterPanel', () => {
  it('tells the leader the shared temporary password when adding an account', async () => {
    const user = userEvent.setup()
    render(<Harness initialData={createPreviewData()} />)

    await user.click(screen.getAllByRole('button', { name: '계정 추가' })[0]!)
    expect(screen.getByRole('dialog', { name: '계정 추가' }))
      .toHaveTextContent('임시 비밀번호 12345678로 계정을 만들어요. 처음 로그인하면 새 비밀번호로 바꾸게 돼요.')
  })

  it('closes the inline account edit on a stale-write conflict so reopening takes the fresh revision', async () => {
    const user = userEvent.setup()
    mutationErrors.length = 0
    const data = createPreviewData()
    const invite = data.allowedUsers.find((item) => item.role === 'member')!
    render(<Harness initialData={data} />)

    await user.click(screen.getByRole('button', { name: `${invite.name} 계정 더보기` }))
    await user.click(screen.getByRole('menuitem', { name: '계정 정보 수정' }))
    // 수정 창을 열어 둔 사이 다른 곳에서 같은 계정이 바뀌었다.
    act(() => {
      latestSetData!((current) => ({
        ...current,
        allowedUsers: current.allowedUsers.map((item) => (
          item.id === invite.id ? { ...item, updated_at: '2099-01-01T00:00:00.000Z' } : item
        )),
      }))
    })
    const nameInput = screen.getByDisplayValue(invite.name)
    await user.clear(nameInput)
    await user.type(nameInput, '충돌 난 이름')
    await user.click(screen.getByRole('button', { name: '저장' }))
    const dialog = screen.getByRole('dialog', { name: '계정 정보를 바꿀까요?' })
    await user.type(within(dialog).getByRole('textbox'), '이름 정리')
    await user.click(within(dialog).getByRole('button', { name: '저장하기' }))

    expect(mutationErrors).toEqual([MASTER_STALE_MESSAGE])
    expect(screen.queryByRole('dialog', { name: '계정 정보를 바꿀까요?' })).not.toBeInTheDocument()
    expect(screen.queryByDisplayValue('충돌 난 이름')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: `${invite.name} 계정 더보기` }))
    await user.click(screen.getByRole('menuitem', { name: '계정 정보 수정' }))
    const reopened = screen.getByDisplayValue(invite.name)
    await user.clear(reopened)
    await user.type(reopened, '새로 고친 이름')
    await user.click(screen.getByRole('button', { name: '저장' }))
    const retryDialog = screen.getByRole('dialog', { name: '계정 정보를 바꿀까요?' })
    await user.type(within(retryDialog).getByRole('textbox'), '이름 정리')
    await user.click(within(retryDialog).getByRole('button', { name: '저장하기' }))

    expect(mutationErrors).toEqual([MASTER_STALE_MESSAGE])
    expect(latestData!.allowedUsers.find((item) => item.id === invite.id)!.name).toBe('새로 고친 이름')
  })

  it('reads an account CSV saved by Korean Excel (CP949)', async () => {
    const user = userEvent.setup()
    mutationErrors.length = 0
    render(<Harness initialData={createPreviewData()} />)
    // "email,이름" 제목 행과 "new.member@example.com,가나" 한 행(CP949 바이트).
    const ascii = (text: string) => Array.from(text, (char) => char.charCodeAt(0))
    const cp949 = Uint8Array.from([
      ...ascii('email,'), 0xc0, 0xcc, 0xb8, 0xa7, 0x0d, 0x0a,
      ...ascii('new.member@example.com,'), 0xb0, 0xa1, 0xb3, 0xaa, 0x0d, 0x0a,
    ])
    const input = document.querySelector<HTMLInputElement>('input[type="file"]')!
    await user.upload(input, new File([cp949], 'accounts.csv', { type: 'text/csv' }))

    expect(await screen.findByRole('heading', { name: '가나' })).toBeInTheDocument()
    expect(mutationErrors).toEqual([])
    expect(latestData!.allowedUsers.find((item) => item.email === 'new.member@example.com')).toMatchObject({ name: '가나' })
  })
})
