import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { AuthPanel } from './AuthPanel'

describe('AuthPanel', () => {
  afterEach(cleanup)

  it('does not expose bootstrap credentials or account provisioning details', () => {
    const { container } = render(<AuthPanel />)

    expect(screen.getByText('계정 또는 로그인 정보가 필요하면 파트장에게 문의하세요. 이 화면에서는 로그인만 지원합니다.')).toBeTruthy()
    expect(container.textContent).not.toContain('1234')
    expect(container.textContent).not.toContain('Supabase')
  })
})
