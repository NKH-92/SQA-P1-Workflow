import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ProfileLoadErrorScreen } from './ProfileLoadErrorScreen'

describe('ProfileLoadErrorScreen', () => {
  it('offers retry and sign-out recovery actions', () => {
    const onRetry = vi.fn()
    const onSignOut = vi.fn()
    render(
      <ProfileLoadErrorScreen
        message="서버에 연결하지 못했습니다."
        onRetry={onRetry}
        onSignOut={onSignOut}
      />,
    )

    expect(screen.getByText('서버에 연결하지 못했습니다.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /다시 시도/ }))
    fireEvent.click(screen.getByRole('button', { name: /로그아웃/ }))
    expect(onRetry).toHaveBeenCalledOnce()
    expect(onSignOut).toHaveBeenCalledOnce()
  })
})
