import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, type ReactNode } from 'react'
import { AppRoutes } from './app/AppRoutes'
import { useAppData } from './app/hooks/useAppData'
import { useBackgroundRefresh } from './app/hooks/useBackgroundRefresh'
import { useDesktopNotifications } from './app/hooks/useDesktopNotifications'
import { usePreviewRoleChange } from './app/hooks/usePreviewRoleChange'
import { useRealtimeReviewInserts } from './app/hooks/useRealtimeReviewInserts'
import { useAuthProfile } from './app/hooks/useAuthProfile'
import { useHashNavigation } from './app/hooks/useHashNavigation'
import { useMutationRunner } from './app/hooks/useMutationRunner'
import type { MutationErrorReportContext } from './app/hooks/useMutationRunner'
import { useDeepLinkEntity } from './app/hooks/useDeepLinkEntity'
import { useCommandPalette } from './app/hooks/useCommandPalette'
import { useReviewNotificationController } from './app/hooks/useReviewNotificationController'
import { reconciledProfile } from './app/profileSync'
import { canManageTeamData, canViewTeamData } from './domain/permissions'
import { toUserMessage } from './lib/errors'
import { prefetchWhenIdle } from './lib/prefetch'
import type { NavigateOptions } from './lib/navigation'
import { buildNotifications } from './lib/notifications'
import { countUnreadReviews } from './lib/readState'
import { hasSupabaseConfig, isPreviewMode } from './lib/supabase'
import type { Profile } from './types'
import type { TabId } from './app/types'
import type { DataWarningReport } from './app/hooks/useAppData'
import { LoadingScreen } from './screens/LoadingScreen'
import { Shell } from './screens/Shell'

/**
 * 빠른 이동(Ctrl K)은 열 때만 필요하다. 첫 화면 번들에서 빼고, 첫 화면이 뜬 뒤 한가할 때 미리 받아 둔다.
 */
const loadCommandPalette = () => import('./components/CommandPalette')
const CommandPalette = lazy(() => loadCommandPalette().then((module) => ({ default: module.CommandPalette })))

/**
 * 로그인·비밀번호 변경·계정 안내·설정 오류 화면은 로그인한 사용자가 매일 여는 첫 화면에 필요 없다.
 * 해당 상태일 때만 받아 첫 화면 번들을 가볍게 유지한다(받는 동안은 로딩 화면).
 */
const AuthPanel = lazy(() => import('./screens/AuthPanel').then((module) => ({ default: module.AuthPanel })))
const BlockedProfile = lazy(() => import('./screens/BlockedProfile').then((module) => ({ default: module.BlockedProfile })))
const ConfigErrorScreen = lazy(() => import('./screens/ConfigErrorScreen').then((module) => ({ default: module.ConfigErrorScreen })))
const PasswordChangePanel = lazy(() => import('./screens/PasswordChangePanel').then((module) => ({ default: module.PasswordChangePanel })))
const ProfileLoadErrorScreen = lazy(() => import('./screens/ProfileLoadErrorScreen').then((module) => ({ default: module.ProfileLoadErrorScreen })))

function GateScreen({ children }: { children: ReactNode }) {
  return <Suspense fallback={<LoadingScreen />}>{children}</Suspense>
}


function App() {
  const reportWarningsRef = useRef<(report: DataWarningReport) => void>(() => {})
  const {
    data,
    setData,
    refreshing,
    lastSyncedAt,
    dataWarnings,
    syncHealth,
    refreshData,
    loadReviewRequest,
    loadAnnouncement,
    resetSyncState,
  } = useAppData((report) =>
    reportWarningsRef.current(report),
  )
  // profile/leaderMode/route는 이 아래에서 정해지므로(이 훅보다 뒤) getter로 최신 값을 넘긴다.
  const mutationReportContextRef = useRef<MutationErrorReportContext>({ role: 'unknown', route: 'unknown' })
  const { saving, toasts, setMessage, dismissToast, mutate } = useMutationRunner(
    refreshData,
    () => mutationReportContextRef.current,
  )
  // 안내는 내용이 바뀔 때만 한 번 알린다(useAppData가 같은 내용의 반복 보고를 거른다).
  // 불러오기 실패는 경고, 목록 표시 상한 같은 평상시 안내는 정보 토스트로 보여 준다.
  useEffect(() => {
    reportWarningsRef.current = ({ warnings, notices }) => {
      if (warnings.length > 0) setMessage({ text: warnings.join(' '), tone: 'warning' })
      if (notices.length > 0) setMessage({ text: notices.join(' '), tone: 'info' })
    }
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
    profileInactive,
    profileLoadError,
    retryProfileLoad,
    initialLoading,
    sessionUser,
    signOut,
  } = auth
  const leaderMode = canViewTeamData(profile)
  // 팀장처럼 보기만 하는 역할은 처리할 수 없는 검토 알림·데스크톱 알림을 받지 않는다.
  const canManage = canManageTeamData(profile)
  const navigation = useHashNavigation(leaderMode, Boolean(profile))
  const { setActiveTab: setNavigationActiveTab } = navigation
  const setActiveTab = useCallback((tab: TabId, entityId?: string, options?: NavigateOptions) => {
    setNavigationActiveTab(tab, entityId, options)
  }, [setNavigationActiveTab])
  useEffect(() => {
    resetNavigationRef.current = navigation.resetNavigation
  }, [navigation.resetNavigation])
  useEffect(() => {
    mutationReportContextRef.current = {
      role: !profile ? 'unknown' : leaderMode ? 'leader' : 'member',
      route: navigation.activeTab,
    }
  }, [profile, leaderMode, navigation.activeTab])

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
  // 새 검토요청을 처리하는 사람은 파트장뿐이므로 구독도 파트장만 연다.
  useRealtimeReviewInserts(backgroundSyncEnabled && canManage, () => {
    refreshData({ silent: true }).catch(() => {})
  })
  const desktopNotifications = useDesktopNotifications(
    profile?.id ?? null,
    canManage,
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

  const commandPalette = useCommandPalette(commandPaletteAvailable)
  useEffect(() => (commandPaletteAvailable ? prefetchWhenIdle(loadCommandPalette) : undefined), [commandPaletteAvailable])
  const markAllNotificationsRead = useReviewNotificationController(profile, data, setData, mutate)

  // signOut이 resetNavigation까지 수행한다(useAuthProfile → useHashNavigation).
  const handleSignOut = async () => {
    await signOut()
  }

  if (!authReady || initialLoading || sessionUser === undefined) {
    return <LoadingScreen />
  }

  if (!hasSupabaseConfig && !isPreviewMode) {
    return <GateScreen><ConfigErrorScreen /></GateScreen>
  }

  // 비활성 계정과 아직 등록되지 않은 계정은 안내가 다르다. ‘다시 확인하기’는 프로필을 다시 불러온다.
  if (!profile && hasSupabaseConfig && sessionWithoutProfile) {
    return (
      <GateScreen>
        <BlockedProfile
          inactive={profileInactive}
          onRetry={retryProfileLoad}
          onSignOut={() => void handleSignOut()}
        />
      </GateScreen>
    )
  }

  if (!profile && hasSupabaseConfig && profileLoadError) {
    return (
      <GateScreen>
        <ProfileLoadErrorScreen
          message={profileLoadError}
          onRetry={retryProfileLoad}
          onSignOut={() => void handleSignOut()}
        />
      </GateScreen>
    )
  }

  if (!profile && hasSupabaseConfig) {
    return <GateScreen><AuthPanel /></GateScreen>
  }

  if (!profile) {
    return <GateScreen><ConfigErrorScreen /></GateScreen>
  }

  if (profile.is_active === false) {
    return <GateScreen><BlockedProfile inactive onRetry={retryProfileLoad} onSignOut={() => void handleSignOut()} /></GateScreen>
  }

  if (hasSupabaseConfig && profile.must_change_password) {
    return (
      <GateScreen>
        <PasswordChangePanel
          profile={profile}
          onComplete={(updatedProfile: Profile) => {
            setProfile(updatedProfile)
            setMessage({ text: '비밀번호를 바꿨어요. 다음 로그인부터 새 비밀번호를 써 주세요.', tone: 'success' })
            // 변경 전 초기 로드는 RLS가 막아 빈 데이터였으므로 이 refresh가 유일한 로드 경로다.
            // 실패를 삼키면 성공 토스트와 빈 대시보드만 남는다.
            refreshData().catch((error) => setMessage({ text: toUserMessage(error), tone: 'error' }))
          }}
          onSignOut={() => void handleSignOut()}
        />
      </GateScreen>
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
        toasts={toasts}
        saving={saving}
        refreshing={refreshing}
        lastSyncedAt={lastSyncedAt}
        dataWarnings={dataWarnings}
        syncHealth={syncHealth}
        pendingCount={pendingCount}
        unreadReviewsCount={unreadReviewsCount}
        notifications={notifications}
        desktopNotifications={canManage ? desktopNotifications : undefined}
        onMarkAllRead={markAllNotificationsRead}
        onOpenCommandPalette={commandPalette.show}
        onDismissToast={dismissToast}
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
      {commandPalette.open && (
        <Suspense fallback={null}>
          <CommandPalette
            open={commandPalette.open}
            onClose={commandPalette.close}
            profile={profile}
            data={data}
            leaderMode={leaderMode}
            setActiveTab={setActiveTab}
          />
        </Suspense>
      )}
    </>
  )
}

export default App
