import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AppRoutes } from './app/AppRoutes'
import { useAppData } from './app/hooks/useAppData'
import { useBackgroundRefresh } from './app/hooks/useBackgroundRefresh'
import { useDesktopNotifications } from './app/hooks/useDesktopNotifications'
import { usePreviewRoleChange } from './app/hooks/usePreviewRoleChange'
import { useRealtimeReviewInserts } from './app/hooks/useRealtimeReviewInserts'
import { useAuthProfile } from './app/hooks/useAuthProfile'
import { useHashNavigation } from './app/hooks/useHashNavigation'
import { useMutationRunner } from './app/hooks/useMutationRunner'
import { useDeepLinkEntity } from './app/hooks/useDeepLinkEntity'
import { reconciledProfile } from './app/profileSync'
import { CommandPalette } from './components/CommandPalette'
import { canManageTeamData } from './domain/permissions'
import { createRepositoryContext, markAllRelevantReviewsSeen } from './data'
import { toUserMessage } from './lib/errors'
import { buildNotifications } from './lib/notifications'
import { countUnreadReviews } from './lib/readState'
import { hasSupabaseConfig, isPreviewMode } from './lib/supabase'
import type { Profile } from './types'
import type { TabId } from './app/types'
import {
  AuthPanel,
  BlockedProfile,
  ConfigErrorScreen,
  LoadingScreen,
  PasswordChangePanel,
  ProfileLoadErrorScreen,
  Shell,
} from './screens'

function App() {
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false)
  const reportWarningsRef = useRef<(warnings: string[]) => void>(() => {})
  const {
    data,
    setData,
    refreshing,
    lastSyncedAt,
    refreshData,
    loadReviewRequest,
    loadAnnouncement,
    resetSyncState,
  } = useAppData((warnings) =>
    reportWarningsRef.current(warnings),
  )
  const { saving, message, setMessage, mutate } = useMutationRunner(refreshData)
  useEffect(() => {
    reportWarningsRef.current = (warnings) => setMessage({ text: warnings.join(' '), tone: 'warning' })
  }, [setMessage])
  const resetNavigationRef = useRef<() => void>(() => {})
  const auth = useAuthProfile(
    refreshData,
    setData,
    setMessage,
    () => resetNavigationRef.current(),
    resetSyncState,
  )
  const {
    profile,
    setProfile,
    authReady,
    sessionWithoutProfile,
    profileLoadError,
    retryProfileLoad,
    initialLoading,
    sessionUser,
    signOut,
  } = auth
  const leaderMode = canManageTeamData(profile)
  const navigation = useHashNavigation(leaderMode, Boolean(profile))
  const { setActiveTab: setNavigationActiveTab } = navigation
  const setActiveTab = useCallback((tab: TabId, entityId?: string) => {
    setNavigationActiveTab(tab, entityId)
  }, [setNavigationActiveTab])
  useEffect(() => {
    resetNavigationRef.current = navigation.resetNavigation
  }, [navigation.resetNavigation])

  useEffect(() => {
    if (!profile || !lastSyncedAt) return
    const latest = reconciledProfile(profile, data.profiles)
    if (latest !== profile) setProfile(latest)
  }, [data.profiles, lastSyncedAt, profile, setProfile])
  const previewRoleChange = usePreviewRoleChange(setProfile, setActiveTab)

  // 로그인·활성·비밀번호 변경 완료 상태에서만 백그라운드 동기화가 의미 있다
  // (must_change_password는 RLS가 조회를 막아 빈 응답만 반복한다).
  const backgroundSyncEnabled =
    hasSupabaseConfig && Boolean(profile) && profile?.is_active !== false && !profile?.must_change_password
  useBackgroundRefresh(backgroundSyncEnabled, () => refreshData({ silent: true }))
  // 새 검토요청의 수신자는 파트장뿐이므로 구독도 파트장만 연다.
  useRealtimeReviewInserts(backgroundSyncEnabled && leaderMode, () => {
    refreshData({ silent: true }).catch(() => {})
  })
  const desktopNotifications = useDesktopNotifications(
    profile?.id ?? null,
    leaderMode,
    data,
    setActiveTab,
  )

  const pendingCount = data.reviewRequests.filter((request) => request.status === 'pending').length
  const unreadReviewsCount = useMemo(() => (profile ? countUnreadReviews(profile, data) : 0), [profile, data])

  const notifications = useMemo(
    () => (profile ? buildNotifications(profile, data, leaderMode) : []),
    [profile, data, leaderMode],
  )

  // 딥링크 대상이 현재 capped 목록에 없으면 검토요청·공지를 on-demand로 한 번 조회한다.
  // 그래도 없으면(삭제·권한 밖) 조용히 첫 항목으로 폴백되는 대신 안내한다.
  // 대상이 존재하면 각 패널의 소비 effect(자식)가 먼저 실행되어 선택을 적용한다.
  const dataReady = isPreviewMode || lastSyncedAt != null
  useDeepLinkEntity({
    entityId: navigation.navEntityId,
    activeTab: navigation.activeTab,
    data,
    profile,
    dataReady,
    setEntityId: navigation.setNavEntityId,
    loadReviewRequest,
    loadAnnouncement,
    setMessage,
  })

  // 팔레트는 인증 완료 후 메인 화면에서만 렌더된다. 로그인·비밀번호 변경 화면에서
  // 단축키를 받으면 브라우저 기본 동작만 뺏고 열림 상태가 뒤에서 토글되어,
  // 로그인 직후 팔레트가 저절로 열린 채 시작된다.
  const commandPaletteAvailable =
    authReady &&
    !initialLoading &&
    sessionUser !== undefined &&
    Boolean(profile) &&
    profile?.is_active !== false &&
    !(hasSupabaseConfig && profile?.must_change_password)

  // Cmd/Ctrl+K 로 빠른 이동 팔레트를 연다. 입력 중에도 열리도록 target을 가리지 않는다.
  useEffect(() => {
    if (!commandPaletteAvailable) {
      setCommandPaletteOpen(false)
      return
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setCommandPaletteOpen((value) => !value)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [commandPaletteAvailable])

  const markAllNotificationsRead = () => {
    if (!profile) return
    void mutate(async () => {
      await markAllRelevantReviewsSeen(createRepositoryContext(profile, data, setData))
    }, '검토 알림을 모두 읽음 처리했습니다.')
  }

  // signOut이 resetNavigation까지 수행한다(useAuthProfile → useHashNavigation).
  const handleSignOut = async () => {
    await signOut()
  }

  if (!authReady || initialLoading || sessionUser === undefined) {
    return <LoadingScreen />
  }

  if (!hasSupabaseConfig && !isPreviewMode) {
    return <ConfigErrorScreen />
  }

  if (!profile && hasSupabaseConfig && sessionWithoutProfile) {
    return <BlockedProfile onSignOut={() => void handleSignOut()} inactive />
  }

  if (!profile && hasSupabaseConfig && profileLoadError) {
    return (
      <ProfileLoadErrorScreen
        message={profileLoadError}
        onRetry={retryProfileLoad}
        onSignOut={() => void handleSignOut()}
      />
    )
  }

  if (!profile && hasSupabaseConfig) {
    return <AuthPanel />
  }

  if (!profile) {
    return <ConfigErrorScreen />
  }

  if (profile.is_active === false) {
    return <BlockedProfile onSignOut={() => void handleSignOut()} inactive />
  }

  if (hasSupabaseConfig && profile.must_change_password) {
    return (
      <PasswordChangePanel
        profile={profile}
        onComplete={(updatedProfile: Profile) => {
          setProfile(updatedProfile)
          setMessage({ text: '비밀번호가 변경되었습니다. 다음 로그인부터 새 비밀번호를 사용하세요.', tone: 'success' })
          // 변경 전 초기 로드는 RLS가 막아 빈 데이터였으므로 이 refresh가 유일한 로드 경로다.
          // 실패를 삼키면 성공 토스트와 빈 대시보드만 남는다.
          refreshData().catch((error) => setMessage({ text: toUserMessage(error), tone: 'error' }))
        }}
        onSignOut={() => void handleSignOut()}
      />
    )
  }

  return (
    <>
      <Shell
        activeTab={navigation.activeTab}
        setActiveTab={setActiveTab}
        profile={profile}
        data={data}
        leaderMode={leaderMode}
        message={message}
        saving={saving}
        refreshing={refreshing}
        lastSyncedAt={lastSyncedAt}
        pendingCount={pendingCount}
        unreadReviewsCount={unreadReviewsCount}
        notifications={notifications}
        desktopNotifications={leaderMode ? desktopNotifications : undefined}
        onMarkAllRead={markAllNotificationsRead}
        onOpenCommandPalette={() => setCommandPaletteOpen(true)}
        onRefresh={() => {
          refreshData().catch((error) => setMessage({ text: toUserMessage(error), tone: 'error' }))
        }}
        onSignOut={() => void handleSignOut()}
        onPreviewRoleChange={previewRoleChange}
      >
        <AppRoutes
          activeTab={navigation.activeTab}
          navEntityId={navigation.navEntityId}
          setNavEntityId={navigation.setNavEntityId}
          profile={profile}
          data={data}
          mutate={mutate}
          setData={setData}
          setActiveTab={setActiveTab}
        />
      </Shell>
      <CommandPalette
        open={commandPaletteOpen}
        onClose={() => setCommandPaletteOpen(false)}
        profile={profile}
        data={data}
        leaderMode={leaderMode}
        setActiveTab={setActiveTab}
      />
    </>
  )
}

export default App
