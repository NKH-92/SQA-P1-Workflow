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
    member: { order: 1, section: '내 업무', sidebarLabel: '공지', paletteLabel: '공지', headerLabel: '워크스페이스 / 공지' },
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
    leader: { order: 8, section: '마스터', sidebarLabel: '제품', paletteLabel: '제품 마스터', headerLabel: '마스터 / 제품' },
  },
  duties: {
    leader: { order: 9, section: '마스터', sidebarLabel: '업무 카테고리', paletteLabel: '업무 카테고리', headerLabel: '마스터 / 업무 카테고리' },
  },
  invites: {
    leader: { order: 10, section: '마스터', sidebarLabel: '초대 관리', paletteLabel: '초대 관리', headerLabel: '마스터 / 초대 관리' },
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
