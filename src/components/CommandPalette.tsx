import { useEffect, useMemo, useRef, useState } from 'react'
import { Search } from 'lucide-react'
import type { AppData, Profile } from '../types'
import type { TabId } from '../app/types'
import { selectScopedReviewRequests } from '../features/reviews/review.selectors'
import { reviewStatusLabels } from '../lib/format'

export type CommandItem = {
  id: string
  group: string
  title: string
  sub: string
  icon: string
  run: () => void
}

/** 검색 결과에 표시할 검토요청 최대 건수. 필터 적용 '후'에 자른다. */
const REVIEW_RESULT_CAP = 20

/** 역할별로 이동 가능한 탭. Shell 사이드바와 같은 규칙을 따른다. */
function navItems(leaderMode: boolean): Array<{ tab: TabId; title: string }> {
  if (leaderMode) {
    return [
      { tab: 'dashboard', title: '홈' },
      { tab: 'reviews', title: '검토요청' },
      { tab: 'review-stats', title: '검토 통계' },
      { tab: 'projects', title: '프로젝트' },
      { tab: 'team', title: '파트원' },
      { tab: 'activity', title: '활동 로그' },
      { tab: 'products', title: '제품 마스터' },
      { tab: 'duties', title: '업무 카테고리' },
      { tab: 'invites', title: '초대 관리' },
    ]
  }
  return [
    { tab: 'dashboard', title: '홈' },
    { tab: 'reviews', title: '내 검토요청' },
    { tab: 'projects', title: '내 프로젝트' },
    { tab: 'work', title: '내 담당' },
  ]
}

export function CommandPalette({
  open,
  onClose,
  profile,
  data,
  leaderMode,
  setActiveTab,
}: {
  open: boolean
  onClose: () => void
  profile: Profile
  data: AppData
  leaderMode: boolean
  setActiveTab: (tab: TabId, entityId?: string) => void
}) {
  const [query, setQuery] = useState('')
  const [cursor, setCursor] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const items = useMemo<CommandItem[]>(() => {
    // 닫혀 있는 동안에는 목록을 만들지 않는다 — App이 리렌더될 때마다 헛일하지 않도록.
    if (!open) return []
    const go = (tab: TabId, entityId?: string) => () => {
      setActiveTab(tab, entityId)
      onClose()
    }

    const result: CommandItem[] = navItems(leaderMode).map((nav) => ({
      id: `nav-${nav.tab}`,
      group: '이동',
      title: nav.title,
      sub: `${nav.tab} 화면으로 이동`,
      icon: nav.title.charAt(0),
      run: go(nav.tab),
    }))

    // 검토요청: 파트장은 전체, 파트원은 본인 것만 (RLS 가시성과 동일).
    // 여기서 자르지 않는다 — 오래된 요청도 검색으로 찾을 수 있어야 한다.
    const visibleReviews = selectScopedReviewRequests(data, profile)
    visibleReviews.forEach((request) => {
      result.push({
        id: `review-${request.id}`,
        group: '검토요청',
        title: request.title,
        sub: `${request.profiles?.name ?? '요청자'} · ${reviewStatusLabels[request.status]}`,
        icon: request.title.trim().charAt(0) || '검',
        run: go('reviews', request.id),
      })
    })

    if (leaderMode) {
      data.profiles
        .filter((item) => item.role === 'member')
        .forEach((member) => {
          result.push({
            id: `member-${member.id}`,
            group: '파트원',
            title: member.name,
            sub: member.email,
            icon: member.name.trim().charAt(0) || '?',
            run: go('team', member.id),
          })
        })
    }

    return result
  }, [data, leaderMode, onClose, open, profile, setActiveTab])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const matches = q ? items.filter((item) => `${item.title} ${item.sub}`.toLowerCase().includes(q)) : items
    // 검토요청 그룹만 상한을 둔다. 검색 필터를 먼저 적용했으므로 오래된 요청도 매칭된다.
    const cappedReviewIds = new Set(
      matches
        .filter((item) => item.group === '검토요청')
        .slice(0, REVIEW_RESULT_CAP)
        .map((item) => item.id),
    )
    return matches.filter((item) => item.group !== '검토요청' || cappedReviewIds.has(item.id))
  }, [items, query])

  // 열릴 때마다 검색어·커서를 초기화하고 입력에 포커스를 준다.
  useEffect(() => {
    if (!open) return
    setQuery('')
    setCursor(0)
    inputRef.current?.focus()
  }, [open])

  useEffect(() => {
    setCursor(0)
  }, [query])

  useEffect(() => {
    if (!open) return
    listRef.current?.querySelector('.cmd-item.selected')?.scrollIntoView({ block: 'nearest' })
  }, [cursor, open])

  if (!open) return null

  const onKeyDown = (event: React.KeyboardEvent) => {
    // 한글 IME 조합 중에 들어오는 키(조합을 확정하는 Enter 포함)는 무시한다.
    // 조합 확정 Enter가 항목 선택으로 실행되면 검색어를 입력하는 도중 화면이 이동해 버린다.
    // (Safari는 isComposing 대신 keyCode 229로만 구분된다)
    if (event.nativeEvent.isComposing || event.keyCode === 229) return
    if (event.key === 'Escape') {
      event.preventDefault()
      onClose()
      return
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setCursor((value) => (filtered.length === 0 ? 0 : (value + 1) % filtered.length))
      return
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault()
      setCursor((value) => (filtered.length === 0 ? 0 : (value - 1 + filtered.length) % filtered.length))
      return
    }
    if (event.key === 'Enter') {
      event.preventDefault()
      filtered[cursor]?.run()
    }
  }

  let index = -1
  const groups = filtered.reduce<Record<string, CommandItem[]>>((acc, item) => {
    ;(acc[item.group] ??= []).push(item)
    return acc
  }, {})

  return (
    <div className="cmd-backdrop" onMouseDown={onClose} role="presentation">
      <div
        aria-label="빠른 이동"
        aria-modal="true"
        className="cmd-card"
        onKeyDown={onKeyDown}
        onMouseDown={(event: React.MouseEvent<HTMLDivElement>) => event.stopPropagation()}
        role="dialog"
      >
        <div className="cmd-input-row">
          <span className="lead-icon" aria-hidden="true">
            <Search size={16} />
          </span>
          <input
            aria-label="화면, 검토요청, 파트원 검색"
            onChange={(event: React.ChangeEvent<HTMLInputElement>) => setQuery(event.target.value)}
            placeholder="이동하려는 화면, 검토요청, 파트원을 검색하세요..."
            ref={inputRef}
            value={query}
          />
          <span className="esc">ESC</span>
        </div>
        <div className="cmd-body" ref={listRef}>
          {filtered.length === 0 && <p className="cmd-empty">“{query}”에 대한 결과가 없습니다.</p>}
          {Object.entries(groups).map(([group, groupItems]) => (
            <div key={group}>
              <div className="cmd-group-label">{group}</div>
              {groupItems.map((item) => {
                index += 1
                const selected = index === cursor
                const itemIndex = index
                return (
                  <button
                    className={selected ? 'cmd-item selected' : 'cmd-item'}
                    key={item.id}
                    onClick={item.run}
                    onMouseEnter={() => setCursor(itemIndex)}
                    type="button"
                  >
                    <span className="cmd-item-icon" aria-hidden="true">
                      {item.icon}
                    </span>
                    <span className="cmd-item-body">
                      <span className="cmd-item-title">{item.title}</span>
                      <span className="cmd-item-sub">{item.sub}</span>
                    </span>
                  </button>
                )
              })}
            </div>
          ))}
        </div>
        <div className="cmd-foot">
          <span>
            <span className="kbd">↑</span>
            <span className="kbd">↓</span>
            이동
          </span>
          <span>
            <span className="kbd">↵</span>
            선택
          </span>
          <span>
            <span className="kbd">esc</span>
            닫기
          </span>
        </div>
      </div>
    </div>
  )
}
