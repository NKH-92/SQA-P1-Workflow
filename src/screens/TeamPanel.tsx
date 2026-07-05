import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import { Badge, FormGrid, IconAction, Kpi, Rows, Section } from '../components/ui'
import type { AppData, Profile } from '../types'
import type { TabId } from '../app/types'
import { downloadCsv } from '../lib/csv'
import { addProfileNote as addProfileNoteMutation, createRepositoryContext } from '../data'
import { formatDate, projectStatusLabels, roleLabels } from '../lib/format'
import { useTeamSummaries } from '../hooks/useTeamSummaries'
import {
  Bell,
  BriefcaseBusiness,
  CalendarClock,
  Check,
  ClipboardList,
  Download,
  FolderKanban,
  ListFilter,
  LogOut,
  Menu,
  MessageSquare,
  Package,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  Search,
  Send,
  ShieldCheck,
  StickyNote,
  Trash2,
  Upload,
  Users,
  X,
} from 'lucide-react'

export function TeamPanel({
  profile,
  data,
  mutate,
  setData,
  setActiveTab,
}: {
  profile: Profile
  data: AppData
  mutate: (operation: () => Promise<void>, success: string) => Promise<void>
  setData: Dispatch<SetStateAction<AppData>>
  setActiveTab: (tab: TabId, entityId?: string) => void
}) {
  const { teamMembers, teamSummaries } = useTeamSummaries(data)
  const [memberSearch, setMemberSearch] = useState('')
  const [selectedMemberId, setSelectedMemberId] = useState(teamMembers[0]?.id ?? '')
  const [profileNote, setProfileNote] = useState('')

  useEffect(() => {
    if (!teamSummaries.length) return
    if (!teamSummaries.some((summary) => summary.member.id === selectedMemberId)) {
      setSelectedMemberId(teamSummaries[0].member.id)
    }
  }, [selectedMemberId, teamSummaries])

  const filteredSummaries = teamSummaries.filter((summary) => {
    const query = memberSearch.trim().toLowerCase()
    if (!query) return true
    const target = [
      summary.member.name,
      summary.member.email,
      ...summary.products.map((assignment) => `${assignment.products?.name ?? assignment.product_id} ${assignment.products?.code ?? ''}`),
      ...summary.duties.map((assignment) => assignment.duties?.name ?? assignment.duty_id),
      ...summary.projects.map((assignment) => assignment.projects?.name ?? assignment.project_id),
    ]
      .join(' ')
      .toLowerCase()
    return target.includes(query)
  })
  const selectedSummary = teamSummaries.find((summary) => summary.member.id === selectedMemberId) ?? teamSummaries[0]

  const exportTeamCsv = () =>
    downloadCsv(
      'team-dashboard.csv',
      teamSummaries.map((summary) => ({
        member: summary.member.name,
        email: summary.member.email,
        products: summary.products.map((assignment) => assignment.products?.name ?? assignment.product_id).join('; '),
        duties: summary.duties.map((assignment) => assignment.duties?.name ?? assignment.duty_id).join('; '),
        projects: summary.projects.map((assignment) => assignment.projects?.name ?? assignment.project_id).join('; '),
        notes: summary.notes.map((note) => note.note).join('; '),
      })),
    )

  const addProfileNote = () =>
    mutate(async () => {
      if (!selectedSummary || !profileNote.trim()) return
      await addProfileNoteMutation(createRepositoryContext(profile, data, setData), {
        profileId: selectedSummary.member.id,
        note: profileNote.trim(),
      })
      setProfileNote('')
    }, '파트원 관리 메모를 저장했습니다.')

  return (
    <div className="stack">
      <div className="page-intro">
        <span>Team</span>
        <h1>파트원</h1>
        <p>
          담당 제품, 정기 업무, 프로젝트 상태를 <strong>{teamMembers.length}명</strong> 기준으로 봅니다.
        </p>
      </div>
      <div className="section-toolbar">
        <label className="search-field">
          <Search size={16} />
          <input
            placeholder="이름, 제품, 업무, 프로젝트 검색"
            value={memberSearch}
            onChange={(event) => setMemberSearch(event.target.value)}
          />
        </label>
        <button className="ghost" onClick={exportTeamCsv} type="button">
          <Download size={16} />
          CSV
        </button>
        <button className="primary" onClick={() => setActiveTab('products')} type="button">
          <Package size={16} />
          배정 관리
        </button>
      </div>
      <div className="v2-team-grid">
        {filteredSummaries.map((summary) => {
          const selected = selectedSummary?.member.id === summary.member.id
          const openReviews = summary.reviews.filter((request) => request.status === 'pending' || request.status === 'in_review')
          return (
            <button
              className={selected ? 'v2-team-card selected' : 'v2-team-card'}
              key={summary.member.id}
              onClick={() => setSelectedMemberId(summary.member.id)}
              type="button"
            >
              <div className="v2-team-head">
                <span className="avatar-mark">{summary.member.name.slice(0, 1)}</span>
                <span>
                  <strong>{summary.member.name}</strong>
                  <small>{summary.member.email}</small>
                </span>
                <Badge>{roleLabels[summary.member.role]}</Badge>
              </div>
              <div className="metric-strip">
                <span>제품 <strong>{summary.products.length}</strong></span>
                <span>업무 <strong>{summary.duties.length}</strong></span>
                <span>과제 <strong>{summary.projects.length}</strong></span>
                <span>대기 <strong>{openReviews.length}</strong></span>
              </div>
              <div className="pill-row">
                {summary.products.slice(0, 3).map((assignment) => (
                  <span key={assignment.id}>{assignment.products?.name ?? assignment.product_id}</span>
                ))}
                {summary.products.length === 0 && <span>제품 배정 필요</span>}
              </div>
              {summary.notes[0] && <p className="leader-note">{summary.notes[0].note}</p>}
            </button>
          )
        })}
      </div>
      {filteredSummaries.length === 0 && <p className="empty">검색 조건에 맞는 파트원이 없습니다.</p>}

      {selectedSummary && (
        <div className="detail-layout">
          <div className="detail-panel summary-panel">
            <div className="detail-header">
              <div>
                <span>선택 파트원</span>
                <strong>{selectedSummary.member.name}</strong>
                <p>{selectedSummary.member.email}</p>
              </div>
              <button className="ghost" onClick={() => setActiveTab('products')} type="button">
                배정 관리
              </button>
            </div>
            <div className="detail-columns">
              <div>
                <h3>제품</h3>
                <Rows
                  empty="담당 제품이 없습니다."
                  rows={selectedSummary.products.map((assignment) => ({
                    title: assignment.products?.name ?? assignment.product_id,
                    meta: assignment.status ?? assignment.products?.code ?? '-',
                  }))}
                />
              </div>
              <div>
                <h3>업무</h3>
                <Rows
                  empty="담당 업무가 없습니다."
                  rows={selectedSummary.duties.map((assignment) => ({
                    title: assignment.duties?.name ?? assignment.duty_id,
                    meta: '정기 담당',
                  }))}
                />
              </div>
              <div>
                <h3>프로젝트</h3>
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
          <div className="detail-panel note-panel">
            <div className="detail-header compact">
              <div>
                <span>관리 메모</span>
                <strong>{selectedSummary.notes.length}건</strong>
              </div>
              <StickyNote size={18} />
            </div>
            <form
              className="note-form"
              onSubmit={(event) => {
                event.preventDefault()
                void addProfileNote()
              }}
            >
              <textarea
                placeholder="배정 조정, 인수인계, 리스크 메모"
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
          </div>
        </div>
      )}
    </div>
  )
}

