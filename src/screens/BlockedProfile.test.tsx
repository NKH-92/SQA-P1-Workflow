import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { BlockedProfile } from './BlockedProfile'
import { LoadingScreen } from './LoadingScreen'

afterEach(cleanup)

describe('BlockedProfile', () => {
  it('leads with what to do for an inactive account and explains why', () => {
    const onRetry = vi.fn()
    const onSignOut = vi.fn()
    render(<BlockedProfile inactive onRetry={onRetry} onSignOut={onSignOut} />)

    expect(screen.getByRole('heading', { level: 1, name: '파트장에게 활성화를 요청해 주세요' })).toBeInTheDocument()
    expect(screen.getByText('계정이 비활성 상태예요. 활성화되면 바로 쓸 수 있어요.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /다시 확인하기/ }))
    fireEvent.click(screen.getByRole('button', { name: /로그아웃/ }))
    expect(onRetry).toHaveBeenCalledOnce()
    expect(onSignOut).toHaveBeenCalledOnce()
  })

  it('asks an unregistered account to request registration', () => {
    render(<BlockedProfile />)

    expect(screen.getByRole('heading', { level: 1, name: '파트장에게 계정 등록을 요청해 주세요' })).toBeInTheDocument()
    expect(screen.getByText(/접근할 수 없어요/)).toBeInTheDocument()
  })
})

describe('LoadingScreen', () => {
  it('shows a single skeleton indicator without a spinner', () => {
    const { container } = render(<LoadingScreen />)

    expect(screen.getByRole('status')).toHaveTextContent('SQA P1 Workflow를 불러오고 있어요.')
    expect(container.querySelector('.spin')).toBeNull()
    expect(container.querySelectorAll('.loading-skeleton-stack')).toHaveLength(1)
  })
})
