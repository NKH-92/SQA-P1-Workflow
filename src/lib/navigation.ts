export const APP_TABS = [
  'dashboard',
  'announcements',
  'reviews',
  'review-stats',
  'change-applications',
  'projects',
  'team',
  'products',
  'duties',
  'invites',
  'work',
  'activity',
] as const

/** 앱 탭 id의 단일 원천. app/types.ts가 재수출하며, 다른 곳에 목록을 복제하지 않는다. */
export type TabId = (typeof APP_TABS)[number]

export type NavigationRole = 'leader' | 'member'
export type NavigationSection = '워크스페이스' | '마스터' | '내 업무'

export type RoleTabMetadata = {
  order: number
  section: NavigationSection
  sidebarLabel: string
  paletteLabel: string
  headerLabel: string
}

/**
 * 역할별 탐색 계약의 단일 원천. APP_TABS는 URL/타입 안정성을 위한 기존 순서를
 * 유지하고, 실제 메뉴 순서는 여기의 order로 명시한다. 표면별 문구가 다른 경우
 * (예: 제품 / 제품 마스터 / 마스터 / 제품)도 하나로 합치지 않는다.
 */
export const TAB_NAVIGATION_METADATA: Record<
  TabId,
  Partial<Record<NavigationRole, RoleTabMetadata>>
> = {
  dashboard: {
    leader: { order: 0, section: '워크스페이스', sidebarLabel: '홈', paletteLabel: '홈', headerLabel: '홈' },
    member: { order: 0, section: '내 업무', sidebarLabel: '홈', paletteLabel: '홈', headerLabel: '홈' },
  },
  announcements: {
    leader: { order: 1, section: '워크스페이스', sidebarLabel: '공지', paletteLabel: '공지', headerLabel: '워크스페이스 / 공지' },
    member: { order: 1, section: '내 업무', sidebarLabel: '공지', paletteLabel: '공지', headerLabel: '내 업무 / 공지' },
  },
  reviews: {
    leader: { order: 2, section: '워크스페이스', sidebarLabel: '검토요청', paletteLabel: '검토요청', headerLabel: '워크스페이스 / 검토요청' },
    member: { order: 2, section: '내 업무', sidebarLabel: '내 검토요청', paletteLabel: '내 검토요청', headerLabel: '내 업무 / 검토요청' },
  },
  'review-stats': {
    leader: { order: 3, section: '워크스페이스', sidebarLabel: '검토 통계', paletteLabel: '검토 통계', headerLabel: '워크스페이스 / 검토 통계' },
  },
  'change-applications': {
    leader: { order: 4, section: '워크스페이스', sidebarLabel: '변경 적용', paletteLabel: '변경 적용', headerLabel: '워크스페이스 / 변경 적용' },
    member: { order: 3, section: '내 업무', sidebarLabel: '변경 적용', paletteLabel: '변경 적용', headerLabel: '내 업무 / 변경 적용' },
  },
  projects: {
    leader: { order: 5, section: '워크스페이스', sidebarLabel: '프로젝트', paletteLabel: '프로젝트', headerLabel: '워크스페이스 / 프로젝트' },
    member: { order: 4, section: '내 업무', sidebarLabel: '내 프로젝트', paletteLabel: '내 프로젝트', headerLabel: '내 업무 / 프로젝트' },
  },
  team: {
    leader: { order: 6, section: '워크스페이스', sidebarLabel: '파트원', paletteLabel: '파트원', headerLabel: '워크스페이스 / 파트원' },
  },
  products: {
    leader: { order: 8, section: '마스터', sidebarLabel: '제품', paletteLabel: '제품', headerLabel: '마스터 / 제품' },
  },
  duties: {
    leader: { order: 9, section: '마스터', sidebarLabel: '업무 카테고리', paletteLabel: '업무 카테고리', headerLabel: '마스터 / 업무 카테고리' },
  },
  invites: {
    leader: { order: 10, section: '마스터', sidebarLabel: '계정 관리', paletteLabel: '계정 관리', headerLabel: '마스터 / 계정 관리' },
  },
  work: {
    member: { order: 5, section: '내 업무', sidebarLabel: '내 담당', paletteLabel: '내 담당', headerLabel: '내 업무 / 내 담당' },
  },
  activity: {
    leader: { order: 7, section: '워크스페이스', sidebarLabel: '활동 로그', paletteLabel: '활동 로그', headerLabel: '워크스페이스 / 활동 로그' },
  },
}

function navigationRole(leaderMode: boolean): NavigationRole {
  return leaderMode ? 'leader' : 'member'
}

export function navigationItemsForRole(leaderMode: boolean) {
  const role = navigationRole(leaderMode)
  return APP_TABS.flatMap((tab) => {
    const metadata = TAB_NAVIGATION_METADATA[tab][role]
    return metadata ? [{ tab, ...metadata }] : []
  }).sort((left, right) => left.order - right.order)
}

export function tabMetadataForRole(tab: TabId, leaderMode: boolean) {
  return TAB_NAVIGATION_METADATA[tab][navigationRole(leaderMode)]
}

/** 금지 탭을 직접 전달한 isolated Shell도 기존 헤더 문구를 유지한다. */
export function tabHeaderLabel(tab: TabId, leaderMode: boolean) {
  return tabMetadataForRole(tab, leaderMode)?.headerLabel
    ?? TAB_NAVIGATION_METADATA[tab].leader?.headerLabel
    ?? TAB_NAVIGATION_METADATA[tab].member?.headerLabel
    ?? ''
}

export function parseAppHash(hash = typeof window !== 'undefined' ? window.location.hash : '') {
  const raw = hash.replace(/^#\/?/, '')
  if (!raw) return { tab: 'dashboard' as TabId, entityId: null as string | null }
  const [tabPart, query = ''] = raw.split('?')
  const tab = (APP_TABS as readonly string[]).includes(tabPart) ? (tabPart as TabId) : 'dashboard'
  const entityId = new URLSearchParams(query).get('id')
  return { tab, entityId }
}

export function buildAppHash(tab: TabId, entityId?: string | null) {
  if (entityId) return `#/${tab}?id=${encodeURIComponent(entityId)}`
  return `#/${tab}`
}

/** 메신저 등에 붙여넣는 공유 딥링크. 해시 라우팅이라 배포 경로가 어디든 그대로 동작한다. */
export function buildShareUrl(
  tab: TabId,
  entityId: string,
  location: Pick<Location, 'origin' | 'pathname'> = window.location,
) {
  return `${location.origin}${location.pathname}${buildAppHash(tab, entityId)}`
}

export function isLeaderTab(tab: TabId) {
  return Boolean(TAB_NAVIGATION_METADATA[tab].leader && !TAB_NAVIGATION_METADATA[tab].member)
}

export function sanitizeTabForRole(tab: TabId, leaderMode: boolean): TabId {
  return tabMetadataForRole(tab, leaderMode) ? tab : 'dashboard'
}

/** 화면 이동 방법. replace면 기록을 새로 쌓지 않고 지금 기록을 바꾼다(예: 서랍 메뉴에서 고른 이동). */
export type NavigateOptions = { replace?: boolean }

/** 하단 탭바·브라우저 탭 제목에 쓰는 짧은 화면 이름. 사이드바 이름과 같다. */
export function tabShortLabel(tab: TabId, leaderMode: boolean) {
  return tabMetadataForRole(tab, leaderMode)?.sidebarLabel
    ?? TAB_NAVIGATION_METADATA[tab].leader?.sidebarLabel
    ?? TAB_NAVIGATION_METADATA[tab].member?.sidebarLabel
    ?? ''
}

export const APP_DOCUMENT_TITLE = 'SQA P1 Workflow'

/** 브라우저 탭 제목. 예: ‘검토요청 · SQA P1’ */
export function documentTitleFor(tab: TabId, leaderMode: boolean) {
  const label = tabShortLabel(tab, leaderMode)
  return label ? `${label} · SQA P1` : APP_DOCUMENT_TITLE
}

/** 열린 창·서랍·모바일 상세가 뒤로가기용으로 쌓아 둔 기록의 표시(src/hooks/useHistoryLayer.ts). */
export const OVERLAY_HISTORY_KEY = '__sqaOverlays'

export function overlayTokensIn(state: unknown): string[] {
  if (!state || typeof state !== 'object') return []
  const value = (state as Record<string, unknown>)[OVERLAY_HISTORY_KEY]
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
}

/** 지금 기록이 열린 창·상세용으로 쌓은 것인지. 그 위에서 화면을 옮기면 새로 쌓지 않고 바꿔 써야 뒤로가기가 헛돌지 않는다. */
export function isOverlayHistoryEntry() {
  return typeof window !== 'undefined' && overlayTokensIn(window.history.state).length > 0
}

/** 창이 열린 채 새로고침하면 그 기록에 창 표시가 남는다. 앱을 시작할 때 지워, 첫 이동이 기록을 바꿔 쓰지 않게 한다. */
export function clearStaleOverlayHistory() {
  if (!isOverlayHistoryEntry()) return
  const rest = { ...(window.history.state as Record<string, unknown>) }
  delete rest[OVERLAY_HISTORY_KEY]
  window.history.replaceState(Object.keys(rest).length > 0 ? rest : null, '', window.location.href)
}

/** 마지막으로 주소에 맞춘 ‘화면 + 선택 항목’. 창·상세 기록을 되돌린 뒤에도 같은 선택을 주소에 남기는 데 쓴다. */
let latestEntityHash: string | null = null

/**
 * 지금 보고 있는 화면의 주소에서 ?id=만 바꾼다. 기록을 쌓지 않고 hashchange도 일으키지 않아
 * 목록에서 항목을 고를 때마다 불러도 된다. 다른 화면으로 이미 떠났다면 아무것도 하지 않는다.
 * history.state는 그대로 둔다(열린 창·모바일 상세의 뒤로가기 기록이 들어 있다).
 */
export function replaceHashEntityId(tab: TabId, entityId: string | null | undefined) {
  if (typeof window === 'undefined') return
  if (parseAppHash().tab !== tab) return
  const hash = buildAppHash(tab, entityId)
  latestEntityHash = hash
  if (window.location.hash === hash) return
  window.history.replaceState(window.history.state, '', hash)
}

/** 다른 화면으로 옮길 때 부른다. 그 화면은 자기 선택을 다시 주소에 맞춘다. */
export function forgetLatestEntityHash() {
  latestEntityHash = null
}

/**
 * 주소가 화면이 스스로 맞춘 선택과 같은지. 창·상세 기록을 되돌린 뒤 다시 써 넣은 주소가 그렇다.
 * 이때의 hashchange는 사용자의 이동이 아니므로, 링크로 들어온 것처럼 선택·필터를 다시 맞추면 안 된다.
 */
export function isLatestEntityHash(hash = typeof window === 'undefined' ? '' : window.location.hash) {
  return latestEntityHash !== null && hash === latestEntityHash
}

/**
 * 창·상세 기록을 되돌리면 주소가 그 창을 열기 전 값으로 돌아간다. 그 사이 같은 화면에서 선택이 바뀌었다면
 * (새 공지를 올려 그 공지를 고른 경우 등) 최신 선택을 다시 써 넣는다. 기록은 쌓지 않는다.
 * popstate 처리 중에 부르면 뒤따르는 hashchange도 최신 주소를 읽는다.
 */
export function restoreLatestEntityHash() {
  if (typeof window === 'undefined' || !latestEntityHash) return
  if (window.location.hash === latestEntityHash) return
  if (parseAppHash(latestEntityHash).tab !== parseAppHash().tab) return
  window.history.replaceState(window.history.state, '', latestEntityHash)
}

/** 다른 화면에서 ‘새로 쓰기’를 고르면 도착한 화면이 작성 창을 바로 연다. */
export type ComposerIntentTab = 'reviews' | 'announcements' | 'change-applications'

export const COMPOSER_INTENT_EVENT = 'sqa:open-composer'
/** 요청이 오래 남아 나중에 엉뚱하게 창이 열리지 않도록 이 시간 안에만 유효하다. */
const COMPOSER_INTENT_TTL_MS = 15_000

export function composerIntentStorageKey(tab: ComposerIntentTab) {
  return `sqa.${tab}.openComposer`
}

/** 작성 창을 열어 달라는 요청을 남긴다. 화면이 이미 열려 있으면 이벤트로 바로 알린다. */
export function requestComposer(tab: ComposerIntentTab) {
  if (typeof window === 'undefined') return
  try {
    window.sessionStorage.setItem(composerIntentStorageKey(tab), String(Date.now()))
  } catch {
    // 저장소를 쓸 수 없으면 이미 열린 화면만 이벤트로 받는다.
  }
  window.dispatchEvent(new CustomEvent(COMPOSER_INTENT_EVENT, { detail: { tab } }))
}

/** 남아 있는 작성 요청을 한 번만 꺼낸다. 요청이 있었으면 true. */
export function consumeComposerRequest(tab: ComposerIntentTab, now = Date.now()) {
  if (typeof window === 'undefined') return false
  try {
    const key = composerIntentStorageKey(tab)
    const raw = window.sessionStorage.getItem(key)
    if (raw == null) return false
    window.sessionStorage.removeItem(key)
    const requestedAt = Number(raw)
    return Number.isFinite(requestedAt) && now - requestedAt <= COMPOSER_INTENT_TTL_MS
  } catch {
    return false
  }
}
