import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../App'
import { emptyData } from '../app/constants'
import { initialSyncHealth } from '../app/hooks/useSyncHealth'
import { createPreviewData, previewLeader, previewMember } from '../demoData'
import { sanitizeTabForRole } from '../lib/navigation'
import type { Profile } from '../types'

const authState = vi.hoisted(() => ({
  profile: null as Profile | null,
  authReady: true,
  initialLoading: false,
  sessionUser: null as null | undefined,
  sessionWithoutProfile: false,
  profileInactive: false,
  retryProfileLoad: vi.fn(),
}))

const supabaseFlags = vi.hoisted(() => ({
  hasSupabaseConfig: false,
  isPreviewMode: false,
  isProductionMode: true,
}))

const appDataState = vi.hoisted(() => ({
  lastSyncedAt: null as Date | null,
  loadReviewRequest: vi.fn(),
  loadAnnouncement: vi.fn(),
}))

vi.mock('../lib/supabase', () => ({
  get hasSupabaseConfig() {
    return supabaseFlags.hasSupabaseConfig
  },
  get isPreviewMode() {
    return supabaseFlags.isPreviewMode
  },
  get isProductionMode() {
    return supabaseFlags.isProductionMode
  },
  get supabase() {
    return supabaseFlags.hasSupabaseConfig ? { auth: { signOut: vi.fn() } } : null
  },
}))

vi.mock('../app/hooks/useAuthProfile', () => ({
  useAuthProfile: () => ({
    sessionUser: authState.sessionUser,
    profile: authState.profile,
    setProfile: vi.fn(),
    authReady: authState.authReady,
    sessionWithoutProfile: authState.sessionWithoutProfile,
    profileInactive: authState.profileInactive,
    retryProfileLoad: authState.retryProfileLoad,
    initialLoading: authState.initialLoading,
    signOut: vi.fn(),
  }),
}))

vi.mock('../app/hooks/useAppData', () => ({
  useAppData: () => ({
    data: supabaseFlags.isPreviewMode ? createPreviewData() : emptyData,
    setData: vi.fn(),
    refreshing: false,
    lastSyncedAt: appDataState.lastSyncedAt,
    syncHealth: initialSyncHealth,
    refreshData: vi.fn(),
    loadReviewRequest: appDataState.loadReviewRequest,
    loadAnnouncement: appDataState.loadAnnouncement,
    resetSyncState: vi.fn(),
  }),
}))

vi.mock('../app/hooks/useMutationRunner', () => ({
  useMutationRunner: () => ({
    saving: false,
    message: null,
    setMessage: vi.fn(),
    mutate: vi.fn(),
  }),
}))

function resetAuthState() {
  authState.profile = null
  authState.authReady = true
  authState.initialLoading = false
  authState.sessionUser = null
  authState.sessionWithoutProfile = false
  authState.profileInactive = false
  authState.retryProfileLoad.mockReset()
}

function resetSupabaseFlags() {
  supabaseFlags.hasSupabaseConfig = false
  supabaseFlags.isPreviewMode = false
  supabaseFlags.isProductionMode = true
}

function resetAppDataState() {
  appDataState.lastSyncedAt = null
  appDataState.loadReviewRequest.mockReset()
  appDataState.loadAnnouncement.mockReset()
}

describe('auth route guards', () => {
  beforeEach(() => {
    resetAuthState()
    resetSupabaseFlags()
    resetAppDataState()
    window.history.replaceState(null, '', '#/dashboard')
  })

  afterEach(() => {
    cleanup()
  })

  it('shows config error in production without Supabase env', async () => {
    render(<App />)

    // 설정 안내·로그인·계정 안내 화면은 해당 상태일 때만 지연 로딩한다.
    expect(await screen.findByRole('alert', {}, { timeout: 5000 })).toHaveTextContent(/로그인 설정/)
    expect(screen.queryByText(/안녕하세요,/)).not.toBeInTheDocument()
  })

  it('shows preview leader dashboard in preview mode without Supabase env', async () => {
    supabaseFlags.isPreviewMode = true
    supabaseFlags.isProductionMode = false
    authState.profile = previewLeader

    render(<App />)

    // 홈은 지연 로딩 화면이라 변환 시간이 긴 테스트 환경에서는 조금 기다린다.
    expect(await screen.findByText(new RegExp(`안녕하세요, ${previewLeader.name}님`), {}, { timeout: 5000 })).toBeInTheDocument()
    expect(document.title).toBe('홈 · SQA P1')
    expect(screen.queryByText(/로그인 설정/)).not.toBeInTheDocument()
  })

  it('shows login panel when Supabase is configured without a session', async () => {
    supabaseFlags.hasSupabaseConfig = true
    supabaseFlags.isProductionMode = true
    authState.sessionUser = null

    render(<App />)

    expect(await screen.findByRole('heading', { name: '로그인' }, { timeout: 5000 })).toBeInTheDocument()
    expect(screen.queryByText(/로그인 설정/)).not.toBeInTheDocument()
  })

  it.each([
    { profileInactive: true, heading: /활성화/ },
    { profileInactive: false, heading: /등록/ },
  ])('tells a blocked account what to ask for (inactive: $profileInactive) and retries the profile', async ({ profileInactive, heading }) => {
    supabaseFlags.hasSupabaseConfig = true
    authState.sessionWithoutProfile = true
    authState.profileInactive = profileInactive

    render(<App />)

    expect(await screen.findByRole('heading', { level: 1 }, { timeout: 5000 })).toHaveTextContent(heading)
    fireEvent.click(screen.getByRole('button', { name: /다시 확인/ }))
    expect(authState.retryProfileLoad).toHaveBeenCalledTimes(1)
  })

  it('shows password change panel when must_change_password is true', async () => {
    supabaseFlags.hasSupabaseConfig = true
    authState.profile = { ...previewLeader, id: 'user-1', must_change_password: true }

    render(<App />)

    expect((await screen.findAllByRole('heading', { name: /비밀번호/ }, { timeout: 5000 })).length).toBeGreaterThan(0)
  })

  it('loads an announcement deep link outside the capped board query on demand', async () => {
    supabaseFlags.hasSupabaseConfig = true
    authState.profile = { ...previewMember, id: 'member-1', is_active: true }
    appDataState.lastSyncedAt = new Date('2026-07-16T00:00:00.000Z')
    appDataState.loadAnnouncement.mockResolvedValueOnce(false)
    window.history.replaceState(null, '', '#/announcements?id=old-announcement')

    render(<App />)

    await waitFor(() => {
      expect(appDataState.loadAnnouncement).toHaveBeenCalledTimes(1)
      expect(appDataState.loadAnnouncement).toHaveBeenCalledWith(
        'old-announcement',
        expect.any(AbortSignal),
      )
    })
    expect(await screen.findByRole('heading', { name: '공지 게시판' })).toBeInTheDocument()
  })

  it('sanitizes member deep links away from leader-only tabs', () => {
    expect(sanitizeTabForRole('products', false)).toBe('dashboard')
    expect(sanitizeTabForRole('work', false)).toBe('work')
    expect(sanitizeTabForRole('products', true)).toBe('products')
    expect(sanitizeTabForRole('work', true)).toBe('dashboard')
  })

  it('renders member dashboard instead of leader tabs for #/products deep link', async () => {
    supabaseFlags.isPreviewMode = true
    supabaseFlags.isProductionMode = false
    authState.profile = previewMember
    window.location.hash = '#/products'

    render(<App />)

    expect(await screen.findByText(new RegExp(`안녕하세요, ${previewMember.name}님`), {}, { timeout: 5000 })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/오늘 할 일/)
    expect(screen.queryByRole('button', { name: '검토 통계' })).not.toBeInTheDocument()
  })
})
