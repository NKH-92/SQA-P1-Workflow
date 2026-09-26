import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { previewMember } from '../demoData'
import { PasswordChangePanel } from './PasswordChangePanel'
import { PASSWORD_CHANGED_FLAG_KEY } from './passwordChangedNotice'

const functions = vi.hoisted(() => ({ invoke: vi.fn() }))

vi.mock('../lib/supabase', () => ({
  supabase: { functions },
  hasSupabaseConfig: true,
  isPreviewMode: false,
  isProductionMode: true,
}))

const profile = { ...previewMember, email: 'member@example.com', must_change_password: true }

afterEach(() => {
  cleanup()
  functions.invoke.mockReset()
  window.sessionStorage.clear()
})

describe('PasswordChangePanel', () => {
  it('keeps the remote E2E labels and lets password managers suggest a new password', () => {
    render(<PasswordChangePanel onComplete={vi.fn()} onSignOut={vi.fn()} profile={profile} />)

    expect(screen.getByRole('heading', { name: '비밀번호 변경 필요' })).toBeInTheDocument()
    expect(screen.getByLabelText('새 비밀번호')).toHaveAttribute('autocomplete', 'new-password')
    expect(screen.getByLabelText('새 비밀번호 확인')).toHaveAttribute('autocomplete', 'new-password')
    expect(screen.getByRole('button', { name: '비밀번호 변경' })).toBeInTheDocument()
  })

  it('tells people right away when the confirmation differs', async () => {
    const user = userEvent.setup()
    render(<PasswordChangePanel onComplete={vi.fn()} onSignOut={vi.fn()} profile={profile} />)

    await user.type(screen.getByLabelText('새 비밀번호'), 'new-password-1')
    const confirmation = screen.getByLabelText('새 비밀번호 확인')
    await user.type(confirmation, 'new-pass')
    expect(confirmation).not.toHaveAttribute('aria-invalid')

    await user.type(confirmation, 'X')
    expect(confirmation).toHaveAttribute('aria-invalid', 'true')
    expect(confirmation).toHaveAccessibleDescription('두 비밀번호가 달라요. 같은 비밀번호를 한 번 더 입력해 주세요.')
  })

  it('can show both fields as plain text', async () => {
    const user = userEvent.setup()
    render(<PasswordChangePanel onComplete={vi.fn()} onSignOut={vi.fn()} profile={profile} />)

    await user.click(screen.getByRole('checkbox', { name: '입력한 비밀번호 보기' }))
    expect(screen.getByLabelText('새 비밀번호')).toHaveAttribute('type', 'text')
    expect(screen.getByLabelText('새 비밀번호 확인')).toHaveAttribute('type', 'text')
  })

  it('leaves a one-time notice for the login screen before signing out', async () => {
    const user = userEvent.setup()
    functions.invoke.mockResolvedValue({ data: { ok: true, requiresRelogin: true }, error: null })
    let flagWhenSignedOut: string | null = null
    const onSignOut = vi.fn(() => {
      flagWhenSignedOut = window.sessionStorage.getItem(PASSWORD_CHANGED_FLAG_KEY)
    })
    render(<PasswordChangePanel onComplete={vi.fn()} onSignOut={onSignOut} profile={profile} />)

    await user.type(screen.getByLabelText('새 비밀번호'), 'new-password-1')
    await user.type(screen.getByLabelText('새 비밀번호 확인'), 'new-password-1')
    await user.click(screen.getByRole('button', { name: '비밀번호 변경' }))

    await waitFor(() => expect(onSignOut).toHaveBeenCalledOnce())
    expect(JSON.parse(flagWhenSignedOut ?? 'null')).toEqual({ email: 'member@example.com' })
  })

  it('maps server error codes to plain guidance instead of raw messages', async () => {
    const user = userEvent.setup()
    functions.invoke.mockResolvedValue({
      data: null,
      error: { name: 'FunctionsHttpError', context: new Response(JSON.stringify({ error: 'password_change_failed', message: 'Password is known to be weak' })) },
    })
    const onSignOut = vi.fn()
    render(<PasswordChangePanel onComplete={vi.fn()} onSignOut={onSignOut} profile={profile} />)

    await user.type(screen.getByLabelText('새 비밀번호'), 'new-password-1')
    await user.type(screen.getByLabelText('새 비밀번호 확인'), 'new-password-1')
    await user.click(screen.getByRole('button', { name: '비밀번호 변경' }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('이 비밀번호로는 바꿀 수 없어요')
    expect(alert).not.toHaveTextContent('weak')
    expect(onSignOut).not.toHaveBeenCalled()
    expect(window.sessionStorage.getItem(PASSWORD_CHANGED_FLAG_KEY)).toBeNull()
  })

  it('checks length, match and temporary-password reuse before calling the server', async () => {
    const user = userEvent.setup()
    render(<PasswordChangePanel onComplete={vi.fn()} onSignOut={vi.fn()} profile={profile} />)

    await user.type(screen.getByLabelText('새 비밀번호'), '12345678')
    await user.type(screen.getByLabelText('새 비밀번호 확인'), '12345678')
    await user.click(screen.getByRole('button', { name: '비밀번호 변경' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('임시 비밀번호와 다른 비밀번호를 입력해 주세요.')
    expect(functions.invoke).not.toHaveBeenCalled()
  })
})
