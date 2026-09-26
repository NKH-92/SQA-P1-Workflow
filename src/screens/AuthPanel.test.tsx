import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import { AuthPanel } from './AuthPanel'
import { PASSWORD_CHANGED_FLAG_KEY } from './passwordChangedNotice'

describe('AuthPanel', () => {
  afterEach(() => {
    cleanup()
    window.sessionStorage.clear()
  })

  it('does not expose bootstrap credentials or account provisioning details', () => {
    const { container } = render(<AuthPanel />)

    expect(screen.getByText('계정이나 비밀번호가 필요하면 파트장에게 요청해 주세요.')).toBeInTheDocument()
    expect(container.textContent).not.toContain('1234')
    expect(container.textContent).not.toContain('Supabase')
  })

  it('starts on the e-mail field and uses a plain login button', async () => {
    render(<AuthPanel />)

    await waitFor(() => expect(screen.getByLabelText('이메일')).toHaveFocus())
    const login = screen.getByRole('button', { name: '로그인' })
    expect(login.querySelector('svg')).toBeNull()
  })

  it('lets people check the password they typed', async () => {
    const user = userEvent.setup()
    render(<AuthPanel />)

    const password = screen.getByLabelText('비밀번호')
    expect(password).toHaveAttribute('type', 'password')
    await user.click(screen.getByRole('button', { name: '비밀번호 보기' }))
    expect(password).toHaveAttribute('type', 'text')
    await user.click(screen.getByRole('button', { name: '비밀번호 숨기기' }))
    expect(password).toHaveAttribute('type', 'password')
  })

  it('announces login errors as an alert tied to the fields', async () => {
    const user = userEvent.setup()
    render(<AuthPanel />)

    await user.type(screen.getByLabelText('이메일'), 'member@example.com')
    await user.type(screen.getByLabelText('비밀번호'), 'wrong-password')
    await user.click(screen.getByRole('button', { name: '로그인' }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('지금은 로그인할 수 없어요')
    expect(screen.getByLabelText('이메일')).toHaveAttribute('aria-invalid', 'true')
  })

  it('shows the password-changed notice once, pre-fills the e-mail, and clears the flag', async () => {
    window.sessionStorage.setItem(PASSWORD_CHANGED_FLAG_KEY, JSON.stringify({ email: 'member@example.com' }))
    render(<AuthPanel />)

    expect(screen.getByRole('status')).toHaveTextContent('비밀번호를 바꿨어요. 새 비밀번호로 다시 로그인해 주세요.')
    expect(screen.getByLabelText('이메일')).toHaveValue('member@example.com')
    await waitFor(() => expect(screen.getByLabelText('비밀번호')).toHaveFocus())
    expect(window.sessionStorage.getItem(PASSWORD_CHANGED_FLAG_KEY)).toBeNull()

    cleanup()
    render(<AuthPanel />)
    expect(screen.queryByText(/비밀번호를 바꿨어요/)).not.toBeInTheDocument()
  })
})
