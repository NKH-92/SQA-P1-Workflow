import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  APP_TABS,
  buildAppHash,
  buildShareUrl,
  clearStaleOverlayHistory,
  COMPOSER_INTENT_EVENT,
  composerIntentStorageKey,
  consumeComposerRequest,
  documentTitleFor,
  forgetLatestEntityHash,
  isOverlayHistoryEntry,
  navigationItemsForRole,
  parseAppHash,
  replaceHashEntityId,
  requestComposer,
  restoreLatestEntityHash,
  sanitizeTabForRole,
  TAB_NAVIGATION_METADATA,
  tabHeaderLabel,
  tabShortLabel,
} from './navigation'

describe('parseAppHash', () => {
  it('parses tab and entity id from a deep link hash', () => {
    expect(parseAppHash('#/reviews?id=abc')).toEqual({ tab: 'reviews', entityId: 'abc' })
  })

  it('parses the leader-only review statistics tab', () => {
    expect(parseAppHash('#/review-stats')).toEqual({ tab: 'review-stats', entityId: null })
  })

  it('parses an announcement detail deep link', () => {
    expect(parseAppHash('#/announcements?id=notice-1')).toEqual({
      tab: 'announcements',
      entityId: 'notice-1',
    })
  })

  it('falls back to dashboard on unknown tab while keeping the entity id', () => {
    expect(parseAppHash('#/unknown?id=1')).toEqual({ tab: 'dashboard', entityId: '1' })
  })

  it('handles an empty hash', () => {
    expect(parseAppHash('')).toEqual({ tab: 'dashboard', entityId: null })
  })
})

describe('buildShareUrl', () => {
  it('joins origin, pathname, and the app hash with an encoded entity id', () => {
    expect(buildShareUrl('reviews', 'abc 1', { origin: 'https://app.example.com', pathname: '/' })).toBe(
      'https://app.example.com/#/reviews?id=abc%201',
    )
  })

  it('round-trips through parseAppHash', () => {
    const url = buildShareUrl('projects', 'p-1', { origin: 'https://x.dev', pathname: '/' })
    expect(parseAppHash(url.slice(url.indexOf('#')))).toEqual({ tab: 'projects', entityId: 'p-1' })
  })

  it('stays consistent with buildAppHash', () => {
    const location = { origin: 'https://x.dev', pathname: '/app/' }
    expect(buildShareUrl('team', 'u-1', location)).toBe(`https://x.dev/app/${buildAppHash('team', 'u-1')}`)
  })
})

describe('sanitizeTabForRole', () => {
  it('keeps members off leader tabs including review statistics', () => {
    expect(sanitizeTabForRole('team', false)).toBe('dashboard')
    expect(sanitizeTabForRole('review-stats', false)).toBe('dashboard')
  })

  it('keeps leaders off the member work tab', () => {
    expect(sanitizeTabForRole('work', true)).toBe('dashboard')
  })

  it('passes shared tabs and the leader statistics tab for authorized roles', () => {
    expect(sanitizeTabForRole('announcements', false)).toBe('announcements')
    expect(sanitizeTabForRole('announcements', true)).toBe('announcements')
    expect(sanitizeTabForRole('reviews', false)).toBe('reviews')
    expect(sanitizeTabForRole('reviews', true)).toBe('reviews')
    expect(sanitizeTabForRole('review-stats', true)).toBe('review-stats')
  })
})

describe('tab navigation metadata', () => {
  it('defines metadata exactly once for every stable app tab id', () => {
    expect(Object.keys(TAB_NAVIGATION_METADATA)).toEqual([...APP_TABS])
  })

  it('preserves the leader order, sections, and surface-specific labels', () => {
    expect(navigationItemsForRole(true).map((item) => ({
      tab: item.tab,
      section: item.section,
      sidebar: item.sidebarLabel,
      palette: item.paletteLabel,
      header: item.headerLabel,
    }))).toEqual([
      { tab: 'dashboard', section: '워크스페이스', sidebar: '홈', palette: '홈', header: '홈' },
      { tab: 'announcements', section: '워크스페이스', sidebar: '공지', palette: '공지', header: '워크스페이스 / 공지' },
      { tab: 'reviews', section: '워크스페이스', sidebar: '검토요청', palette: '검토요청', header: '워크스페이스 / 검토요청' },
      { tab: 'review-stats', section: '워크스페이스', sidebar: '검토 통계', palette: '검토 통계', header: '워크스페이스 / 검토 통계' },
      { tab: 'change-applications', section: '워크스페이스', sidebar: '변경 적용', palette: '변경 적용', header: '워크스페이스 / 변경 적용' },
      { tab: 'projects', section: '워크스페이스', sidebar: '프로젝트', palette: '프로젝트', header: '워크스페이스 / 프로젝트' },
      { tab: 'team', section: '워크스페이스', sidebar: '파트원', palette: '파트원', header: '워크스페이스 / 파트원' },
      { tab: 'activity', section: '워크스페이스', sidebar: '활동 로그', palette: '활동 로그', header: '워크스페이스 / 활동 로그' },
      { tab: 'products', section: '마스터', sidebar: '제품', palette: '제품', header: '마스터 / 제품' },
      { tab: 'duties', section: '마스터', sidebar: '업무 카테고리', palette: '업무 카테고리', header: '마스터 / 업무 카테고리' },
      { tab: 'invites', section: '마스터', sidebar: '계정 관리', palette: '계정 관리', header: '마스터 / 계정 관리' },
    ])
  })

  it('preserves member labels and names the member announcements header after the member section', () => {
    expect(navigationItemsForRole(false).map((item) => [
      item.tab,
      item.section,
      item.sidebarLabel,
      item.paletteLabel,
      item.headerLabel,
    ])).toEqual([
      ['dashboard', '내 업무', '홈', '홈', '홈'],
      ['announcements', '내 업무', '공지', '공지', '내 업무 / 공지'],
      ['reviews', '내 업무', '내 검토요청', '내 검토요청', '내 업무 / 검토요청'],
      ['change-applications', '내 업무', '변경 적용', '변경 적용', '내 업무 / 변경 적용'],
      ['projects', '내 업무', '내 프로젝트', '내 프로젝트', '내 업무 / 프로젝트'],
      ['work', '내 업무', '내 담당', '내 담당', '내 업무 / 내 담당'],
    ])
  })

  it('uses the historical header label for an isolated role-inaccessible tab', () => {
    expect(tabHeaderLabel('products', false)).toBe('마스터 / 제품')
    expect(tabHeaderLabel('work', true)).toBe('내 업무 / 내 담당')
  })

  it('keeps every tab on exactly the same role gate as before', () => {
    const leaderTabs = new Set(navigationItemsForRole(true).map((item) => item.tab))
    const memberTabs = new Set(navigationItemsForRole(false).map((item) => item.tab))
    for (const tab of APP_TABS) {
      expect(sanitizeTabForRole(tab, true)).toBe(leaderTabs.has(tab) ? tab : 'dashboard')
      expect(sanitizeTabForRole(tab, false)).toBe(memberTabs.has(tab) ? tab : 'dashboard')
    }
  })
})

describe('screen names for titles and the tab bar', () => {
  it('uses the short sidebar name for the browser tab title', () => {
    expect(tabShortLabel('reviews', true)).toBe('검토요청')
    expect(tabShortLabel('reviews', false)).toBe('내 검토요청')
    expect(documentTitleFor('dashboard', true)).toBe('홈 · SQA P1')
    expect(documentTitleFor('products', true)).toBe('제품 · SQA P1')
  })
})

describe('replaceHashEntityId', () => {
  afterEach(() => {
    window.history.replaceState(null, '', '#/dashboard')
  })

  it('keeps ?id= in step with the selection without adding history or dropping overlay state', () => {
    window.history.replaceState({ __sqaOverlays: ['overlay-1'] }, '', '#/reviews?id=old')
    const length = window.history.length

    replaceHashEntityId('reviews', 'new')
    expect(window.location.hash).toBe('#/reviews?id=new')
    expect(window.history.length).toBe(length)
    expect(window.history.state).toEqual({ __sqaOverlays: ['overlay-1'] })

    replaceHashEntityId('reviews', null)
    expect(window.location.hash).toBe('#/reviews')
  })

  it('does nothing after the user already left that screen', () => {
    window.history.replaceState(null, '', '#/projects')
    replaceHashEntityId('reviews', 'late-selection')
    expect(window.location.hash).toBe('#/projects')
  })
})

describe('composer intents', () => {
  afterEach(() => {
    window.sessionStorage.clear()
  })

  it('hands a create request to the target screen exactly once', () => {
    const listener = vi.fn()
    window.addEventListener(COMPOSER_INTENT_EVENT, listener)
    requestComposer('reviews')
    window.removeEventListener(COMPOSER_INTENT_EVENT, listener)

    expect(listener).toHaveBeenCalledTimes(1)
    expect(window.sessionStorage.getItem('sqa.reviews.openComposer')).not.toBeNull()
    expect(consumeComposerRequest('announcements')).toBe(false)
    expect(consumeComposerRequest('reviews')).toBe(true)
    expect(consumeComposerRequest('reviews')).toBe(false)
  })

  it('ignores a stale request left behind by an interrupted navigation', () => {
    window.sessionStorage.setItem(composerIntentStorageKey('change-applications'), String(Date.now() - 60_000))
    expect(consumeComposerRequest('change-applications')).toBe(false)
    expect(window.sessionStorage.getItem(composerIntentStorageKey('change-applications'))).toBeNull()
  })
})

describe('overlay history helpers', () => {
  afterEach(() => {
    forgetLatestEntityHash()
    window.history.replaceState(null, '', '#/dashboard')
  })

  it('recognizes entries pushed for an open dialog or detail', () => {
    window.history.replaceState(null, '', '#/reviews')
    expect(isOverlayHistoryEntry()).toBe(false)
    window.history.replaceState({ __sqaOverlays: ['overlay-a'] }, '', '#/reviews')
    expect(isOverlayHistoryEntry()).toBe(true)
  })

  it('clears overlay marks left behind by a reload but keeps other state', () => {
    window.history.replaceState({ __sqaOverlays: ['overlay-a'], scroll: 3 }, '', '#/reviews')
    clearStaleOverlayHistory()
    expect(window.history.state).toEqual({ scroll: 3 })
    expect(window.location.hash).toBe('#/reviews')
  })

  it('writes the latest selection back only while the same screen is shown', () => {
    window.history.replaceState(null, '', '#/reviews?id=a')
    replaceHashEntityId('reviews', 'b')
    window.history.replaceState(null, '', '#/reviews?id=a')
    restoreLatestEntityHash()
    expect(window.location.hash).toBe('#/reviews?id=b')

    window.history.replaceState(null, '', '#/announcements')
    restoreLatestEntityHash()
    expect(window.location.hash).toBe('#/announcements')
  })
})
