export const APP_TABS = [
  'dashboard',
  'reviews',
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
  return tab === 'team' || tab === 'products' || tab === 'duties' || tab === 'invites' || tab === 'activity'
}

export function sanitizeTabForRole(tab: TabId, leaderMode: boolean): TabId {
  if (leaderMode && tab === 'work') return 'dashboard'
  if (!leaderMode && isLeaderTab(tab)) return 'dashboard'
  return tab
}
