import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ProfileLoadErrorScreen } from './ProfileLoadErrorScreen'

afterEach(cleanup)

describe('ProfileLoadErrorScreen', () => {
  it('says what to do first, explains why, and offers retry and sign-out', () => {
    const onRetry = vi.fn()
    const onSignOut = vi.fn()
    render(
      <ProfileLoadErrorScreen
        message="서버에 연결하지 못했어요. 잠시 후 다시 시도해 주세요."
        onRetry={onRetry}
        onSignOut={onSignOut}
      />,
    )

    expect(screen.getByRole('heading', { level: 1, name: '프로필을 다시 불러와 주세요' })).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('서버에 연결하지 못했어요. 잠시 후 다시 시도해 주세요.')
    fireEvent.click(screen.getByRole('button', { name: /다시 시도/ }))
    fireEvent.click(screen.getByRole('button', { name: /로그아웃/ }))
    expect(onRetry).toHaveBeenCalledOnce()
    expect(onSignOut).toHaveBeenCalledOnce()
  })
})
