import { useEffect, useRef } from 'react'
import { createRepositoryContext, markSectionSeen } from '../../data'
import type { AppDataUpdater } from '../../data/repositories/appDataUpdater'
import { receivesSectionNews, sectionNeedsReadMark, sectionNewsItems, sectionReadMark } from '../../lib/sectionNews'
import type { AppData, Profile, ReadMarkSection } from '../../types'
import type { TabId } from '../types'

const SECTION_BY_TAB: Partial<Record<TabId, ReadMarkSection>> = {
  announcements: 'announcements',
  projects: 'projects',
  'change-applications': 'change-applications',
}

/**
 * 공지·프로젝트·변경 적용 화면을 열면 지금 보이는 항목을 ‘확인함’으로 기록한다.
 * 그 화면을 보는 동안 새 항목이 들어와도 다시 기록한다. 홈 사무실 기물의 새 소식 알림이 이 기록으로 꺼진다.
 * 기록은 조용히 남긴다(실패해도 알리지 않는다). 같은 상태로 두 번 보내지는 않지만, 실패하면 다음에 다시 시도한다.
 * 다시 시도는 화면을 다시 열거나 항목이 바뀔 때만 한다 — 데이터가 새로 오기만 해서는 같은 기록을 다시 보내지 않는다.
 */
export function useSectionReadMarker(
  profile: Profile | null,
  data: AppData,
  setData: AppDataUpdater,
  activeTab: TabId,
) {
  const attemptedRef = useRef<string | null>(null)
  const failedAttemptRef = useRef<string | null>(null)
  const lastTabRef = useRef(activeTab)

  useEffect(() => {
    // 다른 화면에 다녀오면 실패했던 기록도 다시 시도한다.
    if (lastTabRef.current !== activeTab) {
      lastTabRef.current = activeTab
      failedAttemptRef.current = null
    }
    const section = SECTION_BY_TAB[activeTab]
    // 기록을 아직 모르면(불러오기 전·실패) 남기지 않는다. 팀장은 읽기 전용이라 남길 수 없다.
    if (!section || !profile || !receivesSectionNews(profile) || data.sectionReadMarks === undefined) return
    const items = sectionNewsItems(profile, data, section)
    if (!sectionNeedsReadMark(items, sectionReadMark(data, profile, section))) return
    const keys = items.map((item) => item.key)
    const attempt = `${profile.id}|${section}|${keys.join(',')}`
    if (attemptedRef.current === attempt || failedAttemptRef.current === attempt) return
    attemptedRef.current = attempt
    markSectionSeen(createRepositoryContext(profile, data, setData), section, keys).catch(() => {
      // 실패한 시도는 지우고 따로 기억해, 다음에 이 화면을 다시 열거나 항목이 바뀌면 다시 남긴다.
      if (attemptedRef.current === attempt) {
        attemptedRef.current = null
        failedAttemptRef.current = attempt
      }
    })
  }, [activeTab, data, profile, setData])
}
