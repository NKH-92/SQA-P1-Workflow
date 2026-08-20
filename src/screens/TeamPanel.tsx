import { useCallback, useEffect, useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import { Badge, EmptyState, Rows } from '../components/ui'
import type { AppData, Profile } from '../types'
import type { MutateFn, TabId } from '../app/types'
import { downloadCsv } from '../lib/csv'
import { buildProductAllocationCsvRows } from '../lib/productAllocationCsv'
import { formatDate, projectStatusLabels, roleLabels } from '../lib/format'
import { compareProducts, productCategory, productCompanyName, productName } from '../lib/products'
import type { ProductSortKey } from '../lib/products'
import { useTeamSummaries } from '../hooks/useTeamSummaries'
import { useTeamController } from '../features/team/useTeamController'
import { useModalDismiss } from '../hooks/useModalDismiss'
import { canManageTeamData } from '../domain/permissions'
import {
  Download,
  Package,
  Save,
  Search,
  SlidersHorizontal,
  StickyNote,
  X,
} from 'lucide-react'

export function TeamPanel({
  profile,
  data,
  mutate,
  setData,
  setActiveTab,
  initialSelectedId,
  onInitialSelectionApplied,
}: {
  profile: Profile
  data: AppData
  mutate: MutateFn
  setData: Dispatch<SetStateAction<AppData>>
  setActiveTab: (tab: TabId, entityId?: string) => void
  initialSelectedId?: string | null
  onInitialSelectionApplied?: () => void
}) {
  const canManage = canManageTeamData(profile)
  const controller = useTeamController(profile, data, setData)
  const { teamMembers, teamSummaries } = useTeamSummaries(data)
  const [memberSearch, setMemberSearch] = useState('')
  const [includeInactive, setIncludeInactive] = useState(false)
  const [selectedMemberId, setSelectedMemberId] = useState(
    teamMembers.find((member) => member.is_active !== false)?.id ?? '',
  )
  const [profileNote, setProfileNote] = useState('')
  const [productSortKey, setProductSortKey] = useState<ProductSortKey>('source')
  const [noteModalOpen, setNoteModalOpen] = useState(false)
  const closeNoteModal = useCallback(() => setNoteModalOpen(false), [])
  useModalDismiss(noteModalOpen, closeNoteModal)

  // 커맨드 팔레트에서 넘어온 파트원을 바로 선택한다(검토요청 큐와 같은 딥링크 방식).
  useEffect(() => {
    if (!initialSelectedId) return
    const target = teamSummaries.find((summary) => summary.member.id === initialSelectedId)
    if (!target) return
    if (target.member.is_active === false) setIncludeInactive(true)
    setMemberSearch('')
    setSelectedMemberId(initialSelectedId)
    onInitialSelectionApplied?.()
  }, [initialSelectedId, onInitialSelectionApplied, teamSummaries])

  const activeMemberCount = teamMembers.filter((member) => member.is_active !== false).length
  const managedSummaries = includeInactive
    ? teamSummaries
    : teamSummaries.filter((summary) => summary.member.is_active !== false)
  const filteredSummaries = managedSummaries.filter((summary) => {
    const query = memberSearch.trim().toLowerCase()
    if (!query) return true
    const target = [
      summary.member.name,
      summary.member.email,
      ...summary.products.map((assignment) => assignment.products?.name ?? assignment.product_id),
      ...summary.duties.map((assignment) => assignment.duties?.name ?? assignment.duty_id),
      ...summary.projects.map((assignment) => assignment.projects?.name ?? assignment.project_id),
    ]
      .join(' ')
      .toLowerCase()
    return target.includes(query)
  })

  useEffect(() => {
    const nextSelectedId = filteredSummaries.some((summary) => summary.member.id === selectedMemberId)
      ? selectedMemberId
      : filteredSummaries[0]?.member.id ?? ''
    if (nextSelectedId !== selectedMemberId) setSelectedMemberId(nextSelectedId)
  }, [filteredSummaries, selectedMemberId])

  const selectedSummary = filteredSummaries.find((summary) => summary.member.id === selectedMemberId)
    ?? filteredSummaries[0]
  const selectedProducts = selectedSummary
    ? [...selectedSummary.products].sort((left, right) => compareProducts(left, right, productSortKey))
    : []
  const ownCompanyProducts = selectedProducts.filter((assignment) => productCategory(assignment) === '자사')
  const consignedProducts = selectedProducts.filter((assignment) => productCategory(assignment) === '위탁')

  const exportTeamCsv = () =>
    downloadCsv(
      'product-allocations.csv',
      buildProductAllocationCsvRows(data),
    )

  const addProfileNote = () =>
    mutate(async () => {
      if (!selectedSummary || !profileNote.trim()) return
      await controller.addProfileNote(selectedSummary.member.id, profileNote.trim())
      setProfileNote('')
    }, '파트원 관리 메모를 저장했습니다.')

  return (
    <div className="stack">
      <div className="page-intro">
        <h1>파트원</h1>
        <p>
          담당 제품, 정기 업무, 프로젝트 상태를 <strong>{activeMemberCount}명</strong> 현원 기준으로 봅니다.
        </p>
      </div>
      <div className="section-toolbar">
        <label className="search-field">
          <Search aria-hidden="true" size={16} />
          <input
            aria-label="파트원 검색"
            placeholder="이름, 제품, 업무, 프로젝트 검색"
            value={memberSearch}
            onChange={(event) => setMemberSearch(event.target.value)}
          />
        </label>
        <button className="ghost" onClick={exportTeamCsv} type="button">
          <Download size={16} />
          CSV
        </button>
        <button
          aria-pressed={includeInactive}
          className={includeInactive ? 'ghost selected' : 'ghost'}
          onClick={() => setIncludeInactive((value) => !value)}
          type="button"
        >
          비활성 포함
        </button>
        {canManage && <button className="primary" onClick={() => setActiveTab('products')} type="button">
          <Package size={16} />
          배정 관리
        </button>}
      </div>
      <div className="team-workbench">
        <div className="team-directory">
          <div className="v2-team-grid">
            {filteredSummaries.map((summary) => {
          const selected = selectedSummary?.member.id === summary.member.id
          const openReviews = summary.reviews.filter((request) => request.status === 'pending')
          return (
            <button
              aria-pressed={selected}
              className={selected ? 'v2-team-card selected' : 'v2-team-card'}
              key={summary.member.id}
              onClick={() => setSelectedMemberId(summary.member.id)}
              type="button"
            >
              <div className="v2-team-head">
                <span>
                  <strong>{summary.member.name}</strong>
                  <small>{summary.member.email}</small>
                </span>
                <Badge>{roleLabels[summary.member.role]}</Badge>
                {summary.member.is_active === false && <Badge status="withdrawn">비활성</Badge>}
              </div>
              <div className="metric-strip">
                <span>제품 <strong>{summary.products.length}</strong></span>
                <span>업무 <strong>{summary.duties.length}</strong></span>
                <span>과제 <strong>{summary.projects.length}</strong></span>
                <span>대기 <strong>{openReviews.length}</strong></span>
              </div>
            </button>
          )
            })}
          </div>
          {filteredSummaries.length === 0 && (
            <EmptyState
              icon={<Search size={22} />}
              title="검색 조건에 맞는 파트원이 없습니다."
              description="이름, 제품, 업무, 프로젝트명으로 검색할 수 있습니다."
            />
          )}
        </div>

      {selectedSummary && (
        <div className="detail-panel summary-panel team-member-detail">
          <div className="detail-header">
            <div>
              <span>선택 파트원</span>
              <div className="detail-header-title-row">
                <strong>{selectedSummary.member.name}</strong>
                {canManage && <button className="ghost compact" onClick={() => setNoteModalOpen(true)} type="button">
                  <StickyNote size={15} />
                  관리 메모
                  {selectedSummary.notes.length > 0 && <span className="memo-count">{selectedSummary.notes.length}</span>}
                </button>}
              </div>
              <p>{selectedSummary.member.email}</p>
            </div>
            <div className="detail-header-actions">
              <label className="sort-select">
                <SlidersHorizontal aria-hidden="true" size={14} />
                <select aria-label="담당 제품 정렬" value={productSortKey} onChange={(event) => setProductSortKey(event.target.value as ProductSortKey)}>
                  <option value="source">원본순</option>
                  <option value="name">제품명순</option>
                  <option value="company">위탁사명순</option>
                </select>
              </label>
              {canManage && <button className="ghost" onClick={() => setActiveTab('products')} type="button">
                배정 관리
              </button>}
            </div>
          </div>
          <div className="team-member-quad">
            <div>
              <h4>자사제품</h4>
              <Rows
                empty="자사제품 배정이 없습니다."
                rows={ownCompanyProducts.map((assignment) => ({
                  title: productName(assignment),
                  meta: productCompanyName(assignment) || '-',
                }))}
              />
            </div>
            <div>
              <h4>위탁제품</h4>
              <Rows
                empty="위탁제품 배정이 없습니다."
                rows={consignedProducts.map((assignment) => ({
                  title: productName(assignment),
                  meta: productCompanyName(assignment) || '-',
                }))}
              />
            </div>
            <div>
              <h4>업무</h4>
              <Rows
                empty="담당 업무가 없습니다."
                rows={selectedSummary.duties.map((assignment) => ({
                  title: assignment.duties?.name ?? assignment.duty_id,
                  meta: assignment.duties?.duty_major_categories?.name ?? '-',
                }))}
              />
            </div>
            <div>
              <h4>프로젝트</h4>
              <Rows
                empty="배정 프로젝트가 없습니다."
                rows={selectedSummary.projects.map((assignment) => ({
                  title: assignment.projects?.name ?? assignment.project_id,
                  meta: assignment.projects?.deadline ? `마감 ${formatDate(assignment.projects.deadline)}` : '마감 없음',
                  aside: assignment.projects?.status ? projectStatusLabels[assignment.projects.status] : undefined,
                }))}
              />
            </div>
          </div>
        </div>
      )}
      </div>

      {canManage && noteModalOpen && selectedSummary && (
        <div className="modal-backdrop" onMouseDown={closeNoteModal} role="presentation">
          <section
            aria-labelledby="team-note-modal-title"
            aria-modal="true"
            className="modal-card team-note-modal"
            onMouseDown={(event) => event.stopPropagation()}
            role="dialog"
          >
            <header className="modal-header">
              <div className="modal-mark" aria-hidden="true">
                <StickyNote size={18} />
              </div>
              <div>
                <span>관리 메모</span>
                <h2 id="team-note-modal-title">{selectedSummary.member.name}</h2>
              </div>
              <button aria-label="관리 메모 닫기" className="icon-button modal-close" onClick={closeNoteModal} type="button">
                <X size={18} />
              </button>
            </header>
            <form
              className="note-form team-note-form"
              onSubmit={(event) => {
                event.preventDefault()
                void addProfileNote()
              }}
            >
              <small>이 메모는 해당 파트원에게도 표시됩니다.</small>
              <textarea
                placeholder="배정 조정, 인수인계, 공유 메모"
                value={profileNote}
                onChange={(event) => setProfileNote(event.target.value)}
              />
              <button className="primary" disabled={!profileNote.trim()} type="submit">
                <Save size={16} />
                메모 저장
              </button>
            </form>
            <div className="note-list">
              {selectedSummary.notes.length === 0 && <p className="empty">저장된 메모가 없습니다.</p>}
              {selectedSummary.notes.map((note) => (
                <article key={note.id}>
                  <p>{note.note}</p>
                  <span>{formatDate(note.created_at)}</span>
                </article>
              ))}
            </div>
          </section>
        </div>
      )}
    </div>
  )
}
