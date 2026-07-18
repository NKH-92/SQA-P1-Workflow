import { useEffect, useMemo, useRef, useState } from 'react'
import { Search } from 'lucide-react'
import type { Profile } from '../types'
import type { TabId } from '../app/types'
import {
  buildCommandItems,
  filterCommandItems,
  groupCommandItems,
  type CommandPaletteData,
} from './commandPaletteModel'

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
  data: CommandPaletteData
  leaderMode: boolean
  setActiveTab: (tab: TabId, entityId?: string) => void
}) {
  const [query, setQuery] = useState('')
  const [cursor, setCursor] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const items = useMemo(() => {
    // 닫혀 있는 동안에는 목록을 만들지 않는다 — App이 리렌더될 때마다 헛일하지 않도록.
    if (!open) return []
    return buildCommandItems({
      profile,
      data,
      leaderMode,
      select: (tab, entityId) => {
        setActiveTab(tab, entityId)
        onClose()
      },
    })
  }, [data, leaderMode, onClose, open, profile, setActiveTab])

  const filtered = useMemo(() => filterCommandItems(items, query), [items, query])

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
  const groups = groupCommandItems(filtered)

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
