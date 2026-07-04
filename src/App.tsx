import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  BriefcaseBusiness,
  CalendarClock,
  Check,
  ClipboardList,
  Download,
  FolderKanban,
  ListFilter,
  LogOut,
  Menu,
  Package,
  Plus,
  RefreshCw,
  Save,
  Search,
  Send,
  ShieldCheck,
  StickyNote,
  Trash2,
  Users,
  X,
} from 'lucide-react'
import { createPreviewData, previewLeader as demoLeader, previewMember as demoMember } from './demoData'
import { hasSupabaseConfig, supabase } from './lib/supabase'
import { formatDate, makeId, projectStatusLabels, reviewStatusLabels, roleLabels } from './lib/format'
import { canManageTeamData } from './domain/permissions'
import type {
  AllowedUser,
  AppData,
  Duty,
  DutyAssignment,
  Product,
  ProductAssignment,
  Profile,
  Project,
  ProjectAssignment,
  ProjectStatus,
  ReviewFeedback,
  ReviewRequest,
  ReviewStatus,
  Role,
} from './types'

type TabId = 'dashboard' | 'reviews' | 'projects' | 'admin' | 'operations'

const PASSWORD_MIN_LENGTH = 8
const TEMP_PASSWORD_MIN_LENGTH = 4

const emptyData: AppData = {
  profiles: [],
  allowedUsers: [],
  products: [],
  duties: [],
  productAssignments: [],
  dutyAssignments: [],
  reviewRequests: [],
  projects: [],
  projectAssignments: [],
  profileNotes: [],
}

function csvCell(value: unknown) {
  const text = value == null ? '' : String(value)
  const safeText = /^[\s]*[=+\-@]/.test(text) ? `'${text}` : text
  return `"${safeText.replace(/"/g, '""')}"`
}

function normalizeHttpUrl(value?: string | null) {
  const text = value?.trim()
  if (!text) return null

  try {
    const url = new URL(text)
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : null
  } catch {
    return null
  }
}

function downloadCsv(filename: string, rows: Array<Record<string, unknown>>) {
  if (typeof document === 'undefined') return
  const headers = Array.from(rows.reduce((keys, row) => {
    Object.keys(row).forEach((key) => keys.add(key))
    return keys
  }, new Set<string>()))
  const body = rows.map((row) => headers.map((header) => csvCell(row[header])).join(','))
  const csv = `\uFEFF${headers.join(',')}\n${body.join('\n')}`
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

function App() {
  const [activeTab, setActiveTab] = useState<TabId>('dashboard')
  const [profile, setProfile] = useState<Profile | null>(hasSupabaseConfig ? null : demoLeader)
  const [data, setData] = useState<AppData>(() => (hasSupabaseConfig ? emptyData : createPreviewData()))
  const [loading, setLoading] = useState(hasSupabaseConfig)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [authReady, setAuthReady] = useState(!hasSupabaseConfig)

  const leaderMode = canManageTeamData(profile)
  const pendingCount = data.reviewRequests.filter((r) => r.status === 'pending').length

  useEffect(() => {
    if (!message) return
    const timer = setTimeout(() => setMessage(null), 3500)
    return () => clearTimeout(timer)
  }, [message])

  const refreshData = useCallback(
    async () => {
      if (!supabase) return
      setLoading(true)
      try {
        const [
          profilesResult,
          allowedUsersResult,
          productsResult,
          dutiesResult,
          productAssignmentsResult,
          dutyAssignmentsResult,
          reviewRequestsResult,
          projectsResult,
          projectAssignmentsResult,
          profileNotesResult,
        ] = await Promise.all([
          supabase.from('profiles').select('*').order('name'),
          supabase.from('allowed_users').select('*').order('created_at', { ascending: false }),
          supabase.from('products').select('*').order('name'),
          supabase.from('duties').select('*').order('name'),
          supabase
            .from('product_assignments')
            .select('*, profiles(name,email), products(name,code)')
            .order('created_at', { ascending: false }),
          supabase
            .from('duty_assignments')
            .select('*, profiles(name,email), duties(name)')
            .order('created_at', { ascending: false }),
          supabase
            .from('review_requests')
            .select('*, profiles(name,email), review_feedback(*, profiles(name))')
            .order('created_at', { ascending: false }),
          supabase.from('projects').select('*').order('created_at', { ascending: false }),
          supabase
            .from('project_assignments')
            .select('*, profiles(name,email), projects(name,description,deadline,status)')
            .order('created_at', { ascending: false }),
          supabase.from('profile_notes').select('*').order('created_at', { ascending: false }),
        ])

        const results = [
          profilesResult,
          allowedUsersResult,
          productsResult,
          dutiesResult,
          productAssignmentsResult,
          dutyAssignmentsResult,
          reviewRequestsResult,
          projectsResult,
          projectAssignmentsResult,
          profileNotesResult,
        ]
        const failed = results.find((result) => result.error)
        if (failed?.error) throw failed.error

        setData({
          profiles: (profilesResult.data ?? []) as Profile[],
          allowedUsers: (allowedUsersResult.data ?? []) as AllowedUser[],
          products: (productsResult.data ?? []) as Product[],
          duties: (dutiesResult.data ?? []) as Duty[],
          productAssignments: (productAssignmentsResult.data ?? []) as ProductAssignment[],
          dutyAssignments: (dutyAssignmentsResult.data ?? []) as DutyAssignment[],
          reviewRequests: (reviewRequestsResult.data ?? []) as ReviewRequest[],
          projects: (projectsResult.data ?? []) as Project[],
          projectAssignments: (projectAssignmentsResult.data ?? []) as ProjectAssignment[],
          profileNotes: (profileNotesResult.data ?? []) as AppData['profileNotes'],
        })
      } catch (error) {
        setMessage(error instanceof Error ? error.message : '데이터를 불러오지 못했습니다.')
      } finally {
        setLoading(false)
      }
    },
    [],
  )

  useEffect(() => {
    const client = supabase
    if (!client) return

    const loadSession = async () => {
      const { data: sessionData } = await client.auth.getSession()
      const user = sessionData.session?.user
      if (!user) {
        setProfile(null)
        setAuthReady(true)
        setLoading(false)
        return
      }

      const { data: profileRow, error } = await client.from('profiles').select('*').eq('id', user.id).maybeSingle()
      if (error) {
        setMessage(error.message)
        setProfile(null)
      } else {
        setProfile(profileRow as Profile | null)
        if (profileRow) await refreshData()
      }
      setAuthReady(true)
      setLoading(false)
    }

    void loadSession()
    const {
      data: { subscription },
    } = client.auth.onAuthStateChange((_event, session) => {
      if (!session?.user) {
        setProfile(null)
        setData(emptyData)
        return
      }
      void client
        .from('profiles')
        .select('*')
        .eq('id', session.user.id)
        .maybeSingle()
        .then(async ({ data: profileRow }) => {
          setProfile(profileRow as Profile | null)
          if (profileRow) await refreshData()
        })
    })

    return () => subscription.unsubscribe()
  }, [refreshData])

  const mutate = async (operation: () => Promise<void>, success: string) => {
    setSaving(true)
    setMessage(null)
    try {
      await operation()
      if (supabase) await refreshData()
      setMessage(success)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '작업을 완료하지 못했습니다.')
    } finally {
      setSaving(false)
    }
  }

  const signOut = async () => {
    if (supabase) await supabase.auth.signOut()
    setProfile(hasSupabaseConfig ? null : demoLeader)
    setData(hasSupabaseConfig ? emptyData : createPreviewData())
    setActiveTab('dashboard')
  }

  if (!authReady || loading) {
    return <LoadingScreen />
  }

  if (!profile && hasSupabaseConfig) {
    return <AuthPanel />
  }

  if (!profile) {
    return <BlockedProfile />
  }

  if (hasSupabaseConfig && profile.must_change_password) {
    return (
      <PasswordChangePanel
        profile={profile}
        onComplete={(updatedProfile) => {
          setProfile(updatedProfile)
          setMessage('비밀번호가 변경되었습니다. 다음 로그인부터 새 비밀번호를 사용하세요.')
          void refreshData()
        }}
        onSignOut={() => void signOut()}
      />
    )
  }

  return (
    <Shell
      activeTab={activeTab}
      setActiveTab={setActiveTab}
      profile={profile}
      leaderMode={leaderMode}
      message={message}
      saving={saving}
      pendingCount={pendingCount}
      onRefresh={() => void refreshData()}
      onSignOut={() => void signOut()}
      onPreviewRoleChange={
        hasSupabaseConfig
          ? undefined
          : (role) => {
              setProfile(role === 'leader' ? demoLeader : demoMember)
              setActiveTab('dashboard')
            }
      }
    >
      {activeTab === 'dashboard' && (
        <Dashboard profile={profile} data={data} mutate={mutate} setData={setData} setActiveTab={setActiveTab} />
      )}
      {activeTab === 'reviews' && <ReviewsPanel profile={profile} data={data} mutate={mutate} setData={setData} />}
      {activeTab === 'projects' && <ProjectsPanel profile={profile} data={data} mutate={mutate} setData={setData} />}
      {activeTab === 'admin' && leaderMode && <AdminPanel profile={profile} data={data} mutate={mutate} setData={setData} />}
      {activeTab === 'operations' && <OperationsGuide />}
    </Shell>
  )
}

function LoadingScreen() {
  return (
    <main className="center-screen">
      <RefreshCw className="spin" size={28} />
      <p>파트 업무관리 시스템을 불러오는 중입니다.</p>
    </main>
  )
}

function AuthPanel() {
  const [mode, setMode] = useState<'signIn' | 'signUp'>('signIn')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [notice, setNotice] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const passwordMinLength = mode === 'signIn' ? TEMP_PASSWORD_MIN_LENGTH : PASSWORD_MIN_LENGTH

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!supabase) return
    setPending(true)
    setNotice(null)
    const result =
      mode === 'signIn'
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({ email, password })
    setPending(false)
    if (result.error) {
      setNotice(result.error.message)
      return
    }
    setNotice(
      mode === 'signUp'
        ? '가입 요청이 접수되었습니다. 허용 이메일인 경우 확인 후 사용할 수 있습니다.'
        : '로그인했습니다.',
    )
  }

  return (
    <main className="auth-layout">
      <section className="auth-copy">
        <ShieldCheck size={40} />
        <h1>파트 업무관리 시스템</h1>
        <p>우리 팀의 업무 배정, 검토 요청, 프로젝트 현황을 한 곳에서 관리하세요.</p>
        <ul>
          <li>팀 전체의 담당제품·업무를 한눈에 확인</li>
          <li>검토 요청과 피드백을 빠르게 주고받기</li>
          <li>프로젝트 배정과 마감 현황 실시간 관리</li>
        </ul>
      </section>
      <form className="auth-form" onSubmit={submit}>
        <div>
          <h2>{mode === 'signIn' ? '로그인' : '초대 이메일로 가입'}</h2>
          <p>파트장이 등록한 이메일만 프로필이 생성됩니다.</p>
        </div>
        <label>
          이메일
          <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
        </label>
        <label>
          비밀번호
          <input
            type="password"
            value={password}
            minLength={passwordMinLength}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
        </label>
        {notice && <p className="notice">{notice}</p>}
        <button className="primary" disabled={pending} type="submit">
          <Send size={16} />
          {mode === 'signIn' ? '로그인' : '가입 요청'}
        </button>
        <button className="ghost" type="button" onClick={() => setMode(mode === 'signIn' ? 'signUp' : 'signIn')}>
          {mode === 'signIn' ? '가입 화면으로 전환' : '로그인 화면으로 전환'}
        </button>
      </form>
    </main>
  )
}

interface PasswordChangePanelProps {
  profile: Profile
  onComplete: (profile: Profile) => void
  onSignOut: () => void
}

function PasswordChangePanel({ profile, onComplete, onSignOut }: PasswordChangePanelProps) {
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [notice, setNotice] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!supabase) return

    if (password.length < PASSWORD_MIN_LENGTH) {
      setNotice(`새 비밀번호는 ${PASSWORD_MIN_LENGTH}자 이상이어야 합니다.`)
      return
    }
    if (password === '1234') {
      setNotice('임시 비밀번호 1234는 다시 사용할 수 없습니다.')
      return
    }
    if (password !== confirmation) {
      setNotice('비밀번호 확인이 일치하지 않습니다.')
      return
    }

    setPending(true)
    setNotice(null)
    const { error: passwordError } = await supabase.auth.updateUser({ password })
    if (passwordError) {
      setPending(false)
      setNotice(passwordError.message)
      return
    }

    const { data: updatedProfile, error: profileError } = await supabase.rpc('mark_password_changed')
    setPending(false)
    if (profileError) {
      setNotice(profileError.message)
      return
    }

    onComplete((updatedProfile as Profile | null) ?? { ...profile, must_change_password: false })
  }

  return (
    <main className="auth-layout">
      <section className="auth-copy">
        <ShieldCheck size={40} />
        <h1>비밀번호 변경 필요</h1>
        <p>{profile.name} 계정은 임시 비밀번호를 사용 중입니다. 업무 화면을 열기 전에 개인 비밀번호를 설정하세요.</p>
        <ul>
          <li>8자 이상으로 설정하세요.</li>
          <li>임시 비밀번호는 다시 사용할 수 없습니다.</li>
          <li>다음 로그인부터 새 비밀번호를 사용하세요.</li>
        </ul>
      </section>
      <form className="auth-form" onSubmit={submit}>
        <div>
          <h2>개인 비밀번호 설정</h2>
          <p>{profile.email}</p>
        </div>
        <label>
          새 비밀번호
          <input
            type="password"
            value={password}
            minLength={PASSWORD_MIN_LENGTH}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
        </label>
        <label>
          새 비밀번호 확인
          <input
            type="password"
            value={confirmation}
            minLength={PASSWORD_MIN_LENGTH}
            onChange={(event) => setConfirmation(event.target.value)}
            required
          />
        </label>
        {notice && <p className="notice">{notice}</p>}
        <button className="primary" disabled={pending} type="submit">
          <Save size={16} />
          {pending ? '저장 중...' : '비밀번호 변경'}
        </button>
        <button className="ghost" disabled={pending} type="button" onClick={onSignOut}>
          <LogOut size={16} />
          로그아웃
        </button>
      </form>
    </main>
  )
}

function BlockedProfile() {
  return (
    <main className="center-screen">
      <ShieldCheck size={32} />
      <h1>프로필이 아직 생성되지 않았습니다.</h1>
      <p>파트장이 `allowed_users`에 이메일을 등록한 뒤 다시 가입하거나 로그인해 주세요.</p>
    </main>
  )
}

function Shell({
  activeTab,
  setActiveTab,
  profile,
  leaderMode,
  message,
  saving,
  pendingCount,
  onRefresh,
  onSignOut,
  onPreviewRoleChange,
  children,
}: {
  activeTab: TabId
  setActiveTab: (tab: TabId) => void
  profile: Profile
  leaderMode: boolean
  message: string | null
  saving: boolean
  pendingCount: number
  onRefresh: () => void
  onSignOut: () => void
  onPreviewRoleChange?: (role: Role) => void
  children: React.ReactNode
}) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const tabs: Array<{ id: TabId; label: string; icon: React.ReactNode; leaderOnly?: boolean }> = [
    { id: 'dashboard', label: '대시보드', icon: <ClipboardList size={18} /> },
    { id: 'reviews', label: '검토요청', icon: <Check size={18} /> },
    { id: 'projects', label: '배정 업무', icon: <FolderKanban size={18} /> },
    { id: 'admin', label: '기초데이터', icon: <Users size={18} />, leaderOnly: true },
    { id: 'operations', label: '운영 기준', icon: <ShieldCheck size={18} /> },
  ]
  const tabDescriptions: Record<TabId, string> = {
    dashboard: leaderMode ? `파트장 권한 · 대기 검토 ${pendingCount}건` : `${profile.name}님의 배정 현황`,
    reviews: leaderMode ? `대기 검토 ${pendingCount}건` : '내가 올린 검토 요청',
    projects: leaderMode ? '프로젝트 배정과 마감 현황' : '내게 배정된 프로젝트',
    admin: '초대, 제품, 업무, 배정 데이터',
    operations: '배포와 보안 운영 기준',
  }
  const activeTabLabel = tabs.find((tab) => tab.id === activeTab)?.label

  return (
    <div className="app-shell">
      <div className={`overlay${sidebarOpen ? ' visible' : ''}`} onClick={() => setSidebarOpen(false)} />
      <aside className={`sidebar${sidebarOpen ? ' open' : ''}`}>
        <div className="sidebar-top">
          <div className="brand">
            <BriefcaseBusiness size={28} />
            <div>
              <strong>파트 업무관리</strong>
              <span>MVP</span>
            </div>
          </div>
          <button className="sidebar-close" onClick={() => setSidebarOpen(false)} type="button">
            <X size={20} />
          </button>
        </div>
        <nav>
          {tabs
            .filter((tab) => !tab.leaderOnly || leaderMode)
            .map((tab) => (
              <button
                className={activeTab === tab.id ? 'nav-item active' : 'nav-item'}
                key={tab.id}
                onClick={() => {
                  setActiveTab(tab.id)
                  setSidebarOpen(false)
                }}
                type="button"
              >
                {tab.icon}
                {tab.label}
                {tab.id === 'reviews' && pendingCount > 0 && <span className="nav-badge">{pendingCount}</span>}
              </button>
            ))}
        </nav>
        <div className="sidebar-footer">
          <span>{roleLabels[profile.role]}</span>
          <strong>{profile.name}</strong>
          <small>{profile.email}</small>
          {onPreviewRoleChange && (
            <div className="segmented">
              <button
                className={profile.role === 'leader' ? 'selected' : ''}
                onClick={() => onPreviewRoleChange('leader')}
                type="button"
              >
                파트장
              </button>
              <button
                className={profile.role === 'member' ? 'selected' : ''}
                onClick={() => onPreviewRoleChange('member')}
                type="button"
              >
                파트원
              </button>
            </div>
          )}
        </div>
      </aside>
      <main className="content">
        <header className="topbar">
          <div className="topbar-left">
            <button className="hamburger" onClick={() => setSidebarOpen(true)} type="button">
              <Menu size={22} />
            </button>
            <div>
              <h1>{activeTabLabel}</h1>
              <p>{tabDescriptions[activeTab]}</p>
            </div>
          </div>
          <div className="topbar-actions">
            {message && <span className="toast">{message}</span>}
            {saving && <span className="saving">저장 중</span>}
            <button className="icon-button" title="새로고침" onClick={onRefresh} type="button">
              <RefreshCw size={18} />
            </button>
            <button className="icon-button" title="로그아웃" onClick={onSignOut} type="button">
              <LogOut size={18} />
            </button>
          </div>
        </header>
        {children}
      </main>
    </div>
  )
}

function Dashboard({
  profile,
  data,
  mutate,
  setData,
  setActiveTab,
}: {
  profile: Profile
  data: AppData
  mutate: (operation: () => Promise<void>, success: string) => Promise<void>
  setData: React.Dispatch<React.SetStateAction<AppData>>
  setActiveTab: (tab: TabId) => void
}) {
  const ownProducts = data.productAssignments.filter((assignment) => assignment.user_id === profile.id)
  const ownDuties = data.dutyAssignments.filter((assignment) => assignment.user_id === profile.id)
  const ownProjects = data.projectAssignments.filter((assignment) => assignment.user_id === profile.id)
  const ownReviews = data.reviewRequests.filter((request) => request.requester_id === profile.id)
  const ownNotes = data.profileNotes.filter((note) => note.profile_id === profile.id)
  const pendingReviews = data.reviewRequests.filter((request) => request.status === 'pending')
  const teamMembers = data.profiles.filter((item) => item.role === 'member')
  const [memberSearch, setMemberSearch] = useState('')
  const [selectedMemberId, setSelectedMemberId] = useState(teamMembers[0]?.id ?? '')
  const [profileNote, setProfileNote] = useState('')

  const productAssignmentIds = new Set(data.productAssignments.map((assignment) => assignment.product_id))
  const unassignedProducts = data.products.filter((product) => !productAssignmentIds.has(product.id))
  const membersWithAssignmentGaps = teamMembers.filter(
    (member) =>
      !data.productAssignments.some((assignment) => assignment.user_id === member.id) ||
      !data.dutyAssignments.some((assignment) => assignment.user_id === member.id),
  )
  const dueSoonProjects = data.projectAssignments.filter((assignment) => {
    const deadline = assignment.projects?.deadline ?? data.projects.find((project) => project.id === assignment.project_id)?.deadline
    const status = assignment.projects?.status ?? data.projects.find((project) => project.id === assignment.project_id)?.status
    if (!deadline || status === 'done') return false
    const daysUntil = Math.ceil((Date.parse(deadline) - Date.now()) / 86400000)
    return daysUntil >= 0 && daysUntil <= 14
  })

  const teamSummaries = useMemo(
    () =>
      teamMembers.map((member) => {
        const products = data.productAssignments.filter((assignment) => assignment.user_id === member.id)
        const duties = data.dutyAssignments.filter((assignment) => assignment.user_id === member.id)
        const projects = data.projectAssignments.filter((assignment) => assignment.user_id === member.id)
        const reviews = data.reviewRequests.filter((request) => request.requester_id === member.id)
        const notes = data.profileNotes.filter((note) => note.profile_id === member.id)
        return { member, products, duties, projects, reviews, notes }
      }),
    [data.dutyAssignments, data.productAssignments, data.profileNotes, data.projectAssignments, data.reviewRequests, teamMembers],
  )

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
      const note = profileNote.trim()
      if (supabase) {
        const { error } = await supabase.from('profile_notes').insert({
          profile_id: selectedSummary.member.id,
          leader_id: profile.id,
          note,
        })
        if (error) throw error
      } else {
        setData((current) => ({
          ...current,
          profileNotes: [
            {
              id: makeId('profile-note'),
              profile_id: selectedSummary.member.id,
              leader_id: profile.id,
              note,
              created_at: new Date().toISOString(),
            },
            ...current.profileNotes,
          ],
        }))
      }
      setProfileNote('')
    }, '파트원 관리 메모를 남겼습니다.')

  if (profile.role === 'member') {
    return (
      <div className="stack">
        <div className="member-overview">
          <div>
            <span>{profile.name}</span>
            <strong>내 업무 현황</strong>
            <p>{ownProjects.length > 0 ? `진행 프로젝트 ${ownProjects.length}건` : '배정된 프로젝트 없음'}</p>
          </div>
          <div className="overview-metrics">
            <Badge>제품 {ownProducts.length}</Badge>
            <Badge>업무 {ownDuties.length}</Badge>
            <Badge>검토 {ownReviews.length}</Badge>
            <Badge>메모 {ownNotes.length}</Badge>
          </div>
        </div>
        <div className="grid two">
          <Section title="담당제품" icon={<Package size={18} />}>
            <Rows
              empty="담당제품이 없습니다."
              rows={ownProducts.map((assignment) => ({
                title: assignment.products?.name ?? assignment.product_id,
                meta: assignment.products?.code ?? '제품코드 없음',
                aside: assignment.status ?? '-',
              }))}
            />
          </Section>
          <Section title="담당업무" icon={<ClipboardList size={18} />}>
            <Rows
              empty="담당업무가 없습니다."
              rows={ownDuties.map((assignment) => ({
                title: assignment.duties?.name ?? assignment.duty_id,
                meta: '사전 정의 업무',
              }))}
            />
          </Section>
          <Section title="배정 프로젝트" icon={<FolderKanban size={18} />}>
            <Rows
              empty="배정 프로젝트가 없습니다."
              rows={ownProjects.map((assignment) => ({
                title: assignment.projects?.name ?? assignment.project_id,
                meta: assignment.projects?.deadline ? `마감 ${formatDate(assignment.projects.deadline)}` : '마감일 없음',
                aside: assignment.projects?.status ? projectStatusLabels[assignment.projects.status] : '-',
              }))}
            />
          </Section>
          <Section title="내 검토요청" icon={<Check size={18} />}>
            <Rows
              empty="검토요청이 없습니다."
              rows={ownReviews.map((request) => ({
                title: request.title,
                meta: formatDate(request.created_at),
                aside: reviewStatusLabels[request.status],
              }))}
            />
          </Section>
          <Section title="파트장 메모" icon={<StickyNote size={18} />}>
            <Rows
              empty="공유된 관리 메모가 없습니다."
              rows={ownNotes.map((note) => ({
                title: note.note,
                meta: formatDate(note.created_at),
              }))}
            />
          </Section>
        </div>
      </div>
    )
  }

  return (
    <div className="stack">
      <div className="kpi-grid">
        <Kpi label="파트원" value={teamMembers.length} icon={<Users size={20} />} />
        <Kpi label="제품 배정" value={data.productAssignments.length} icon={<Package size={20} />} />
        <Kpi label="대기 검토" value={pendingReviews.length} icon={<Check size={20} />} />
        <Kpi label="프로젝트 배정" value={data.projectAssignments.length} icon={<FolderKanban size={20} />} />
      </div>
      <div className="action-grid">
        <button className="action-card" onClick={() => setActiveTab('reviews')} type="button">
          <Check size={20} />
          <span>검토 대기</span>
          <strong>{pendingReviews.length}건</strong>
        </button>
        <button className="action-card" onClick={() => setActiveTab('projects')} type="button">
          <CalendarClock size={20} />
          <span>14일 내 마감</span>
          <strong>{dueSoonProjects.length}건</strong>
        </button>
        <button className="action-card" onClick={() => setActiveTab('admin')} type="button">
          <Package size={20} />
          <span>제품 미배정</span>
          <strong>{unassignedProducts.length}개</strong>
        </button>
        <button className="action-card" onClick={() => setActiveTab('admin')} type="button">
          <ListFilter size={20} />
          <span>배정 누락</span>
          <strong>{membersWithAssignmentGaps.length}명</strong>
        </button>
      </div>
      <div className="priority-strip">
        <div>
          <span>우선 확인</span>
          <strong>{pendingReviews.length + dueSoonProjects.length + unassignedProducts.length + membersWithAssignmentGaps.length}</strong>
        </div>
        <ul>
          <li className={pendingReviews.length > 0 ? 'attention' : ''}>검토 대기 {pendingReviews.length}건</li>
          <li className={dueSoonProjects.length > 0 ? 'warning' : ''}>14일 내 마감 {dueSoonProjects.length}건</li>
          <li className={unassignedProducts.length > 0 ? 'attention' : ''}>미배정 제품 {unassignedProducts.length}개</li>
          <li className={membersWithAssignmentGaps.length > 0 ? 'warning' : ''}>
            배정 누락 {membersWithAssignmentGaps.length}명
          </li>
        </ul>
      </div>
      <Section title="팀 대시보드" icon={<Users size={18} />}>
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
        </div>
        <div className="member-grid">
          {filteredSummaries.map(({ member, products, duties }) => {
            const selected = selectedSummary?.member.id === member.id
            return (
              <button
                className={selected ? 'member-tile selected' : 'member-tile'}
                key={member.id}
                onClick={() => setSelectedMemberId(member.id)}
                type="button"
              >
                <div className="member-header">
                  <div>
                    <strong>{member.name}</strong>
                    <p>{member.email}</p>
                  </div>
                  <span>{roleLabels[member.role]}</span>
                </div>
                <div className="member-assignment-group">
                  <div className="member-assignment-heading">
                    <strong>제품 리스트</strong>
                    <span>{products.length}개</span>
                  </div>
                  <ul className="member-assignment-list">
                    {products.map((assignment) => (
                      <li key={assignment.id}>
                        <span>{assignment.products?.name ?? assignment.product_id}</span>
                        <small>{assignment.products?.code ?? '제품코드 없음'}</small>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="member-assignment-group">
                  <div className="member-assignment-heading">
                    <strong>업무 리스트</strong>
                    <span>{duties.length}개</span>
                  </div>
                  <ul className="member-assignment-list compact">
                    {duties.map((assignment) => (
                      <li key={assignment.id}>
                        <span>{assignment.duties?.name ?? assignment.duty_id}</span>
                      </li>
                    ))}
                  </ul>
                </div>
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
                <button className="ghost" onClick={() => setActiveTab('admin')} type="button">
                  배정 관리
                </button>
              </div>
              <div className="chip-row">
                <Badge>제품 {selectedSummary.products.length}</Badge>
                <Badge>업무 {selectedSummary.duties.length}</Badge>
                <Badge>프로젝트 {selectedSummary.projects.length}</Badge>
                <Badge>검토 {selectedSummary.reviews.length}</Badge>
              </div>
              <div className="detail-columns">
                <div>
                  <h3>제품</h3>
                  {selectedSummary.products.length === 0 ? (
                    <p className="empty compact">담당제품 없음</p>
                  ) : (
                    <ul className="detail-list">
                      {selectedSummary.products.map((assignment) => (
                        <li key={assignment.id}>
                          <strong>{assignment.products?.name ?? assignment.product_id}</strong>
                          <span>{assignment.status ?? assignment.products?.code ?? '-'}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div>
                  <h3>업무</h3>
                  {selectedSummary.duties.length === 0 ? (
                    <p className="empty compact">담당업무 없음</p>
                  ) : (
                    <ul className="detail-list">
                      {selectedSummary.duties.map((assignment) => (
                        <li key={assignment.id}>
                          <strong>{assignment.duties?.name ?? assignment.duty_id}</strong>
                          <span>정기 담당</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div>
                  <h3>프로젝트</h3>
                  {selectedSummary.projects.length === 0 ? (
                    <p className="empty compact">배정 프로젝트 없음</p>
                  ) : (
                    <ul className="detail-list">
                      {selectedSummary.projects.map((assignment) => (
                        <li key={assignment.id}>
                          <strong>{assignment.projects?.name ?? assignment.project_id}</strong>
                          <span>
                            {assignment.projects?.deadline ? `마감 ${formatDate(assignment.projects.deadline)}` : '마감일 없음'}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
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
                  placeholder="배정 조정, 인수인계, 리스크 등 파트장 메모"
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
      </Section>
    </div>
  )
}

function ReviewsPanel({
  profile,
  data,
  mutate,
  setData,
}: {
  profile: Profile
  data: AppData
  mutate: (operation: () => Promise<void>, success: string) => Promise<void>
  setData: React.Dispatch<React.SetStateAction<AppData>>
}) {
  const [form, setForm] = useState({ title: '', description: '', attachment_url: '' })
  const [feedback, setFeedback] = useState<Record<string, string>>({})
  const visibleReviewRequests =
    profile.role === 'leader' ? data.reviewRequests : data.reviewRequests.filter((request) => request.requester_id === profile.id)

  const createReview = () =>
    mutate(async () => {
      const attachmentUrl = normalizeHttpUrl(form.attachment_url)
      if (form.attachment_url.trim() && !attachmentUrl) {
        throw new Error('첨부 링크는 http 또는 https URL만 사용할 수 있습니다.')
      }
      if (supabase) {
        const { error } = await supabase.from('review_requests').insert({
          requester_id: profile.id,
          title: form.title,
          description: form.description,
          attachment_url: attachmentUrl,
          status: 'pending',
        })
        if (error) throw error
      } else {
        setData((current) => ({
          ...current,
          reviewRequests: [
            {
              id: makeId('review'),
              requester_id: profile.id,
              title: form.title,
              description: form.description,
              attachment_url: attachmentUrl,
              status: 'pending',
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
              profiles: { name: profile.name, email: profile.email },
              review_feedback: [],
            },
            ...current.reviewRequests,
          ],
        }))
      }
      setForm({ title: '', description: '', attachment_url: '' })
    }, '검토요청을 등록했습니다.')

  const updateStatus = (id: string, status: ReviewStatus) =>
    mutate(async () => {
      if (supabase) {
        const { error } = await supabase.from('review_requests').update({ status }).eq('id', id)
        if (error) throw error
      } else {
        setData((current) => ({
          ...current,
          reviewRequests: current.reviewRequests.map((request) =>
            request.id === id ? { ...request, status, updated_at: new Date().toISOString() } : request,
          ),
        }))
      }
    }, '검토요청 상태를 변경했습니다.')

  const addFeedback = (requestId: string) =>
    mutate(async () => {
      const comment = feedback[requestId]?.trim()
      if (!comment) return
      if (supabase) {
        const { error } = await supabase.from('review_feedback').insert({
          review_request_id: requestId,
          leader_id: profile.id,
          comment,
        })
        if (error) throw error
      } else {
        const item: ReviewFeedback = {
          id: makeId('feedback'),
          review_request_id: requestId,
          leader_id: profile.id,
          comment,
          created_at: new Date().toISOString(),
          profiles: { name: profile.name },
        }
        setData((current) => ({
          ...current,
          reviewRequests: current.reviewRequests.map((request) =>
            request.id === requestId
              ? { ...request, review_feedback: [...(request.review_feedback ?? []), item] }
              : request,
          ),
        }))
      }
      setFeedback((current) => ({ ...current, [requestId]: '' }))
    }, '피드백을 남겼습니다.')

  return (
    <div className="stack">
      {profile.role === 'member' && (
        <Section title="검토요청 작성" icon={<Send size={18} />}>
          <FormGrid
            fields={
              <>
                <label>
                  제목
                  <input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} />
                </label>
                <label>
                  첨부 링크
                  <input
                    placeholder="https://"
                    value={form.attachment_url}
                    onChange={(event) => setForm({ ...form, attachment_url: event.target.value })}
                  />
                </label>
                <label className="wide">
                  설명
                  <textarea
                    value={form.description}
                    onChange={(event) => setForm({ ...form, description: event.target.value })}
                  />
                </label>
              </>
            }
            onSubmit={createReview}
            disabled={!form.title || !form.description}
            submitLabel="요청 등록"
          />
        </Section>
      )}
      <Section title={profile.role === 'leader' ? '전체 검토요청' : '내 검토요청'} icon={<Check size={18} />}>
        <div className="request-list">
          {visibleReviewRequests.length === 0 && <p className="empty">검토요청이 없습니다.</p>}
          {visibleReviewRequests.map((request) => (
            <ReviewRequestItem
              addFeedback={addFeedback}
              feedback={feedback}
              key={request.id}
              profile={profile}
              request={request}
              setFeedback={setFeedback}
              updateStatus={updateStatus}
            />
          ))}
        </div>
      </Section>
    </div>
  )
}

function ReviewRequestItem({
  addFeedback,
  feedback,
  profile,
  request,
  setFeedback,
  updateStatus,
}: {
  addFeedback: (requestId: string) => void
  feedback: Record<string, string>
  profile: Profile
  request: ReviewRequest
  setFeedback: React.Dispatch<React.SetStateAction<Record<string, string>>>
  updateStatus: (id: string, status: ReviewStatus) => void
}) {
  const attachmentUrl = normalizeHttpUrl(request.attachment_url)

  return (
    <article className="request-item">
      <div className="request-main">
        <div>
          <strong>{request.title}</strong>
          <span>
            {request.profiles?.name ?? '요청자'} · {formatDate(request.created_at)}
          </span>
        </div>
        {profile.role === 'leader' ? (
          <select value={request.status} onChange={(event) => void updateStatus(request.id, event.target.value as ReviewStatus)}>
            {Object.entries(reviewStatusLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        ) : (
          <Badge status={request.status}>{reviewStatusLabels[request.status]}</Badge>
        )}
      </div>
      <p>{request.description}</p>
      {attachmentUrl && (
        <a href={attachmentUrl} target="_blank" rel="noreferrer">
          첨부 링크 열기
        </a>
      )}
      <div className="feedback-list">
        {(request.review_feedback ?? []).map((item) => (
          <div className="feedback" key={item.id}>
            <span>{item.profiles?.name ?? '파트장'} · {formatDate(item.created_at)}</span>
            <p>{item.comment}</p>
          </div>
        ))}
      </div>
      {profile.role === 'leader' && (
        <div className="inline-form">
          <input
            placeholder="피드백 작성"
            value={feedback[request.id] ?? ''}
            onChange={(event) => setFeedback({ ...feedback, [request.id]: event.target.value })}
          />
          <button className="primary compact" onClick={() => void addFeedback(request.id)} type="button">
            <Save size={16} />
            저장
          </button>
        </div>
      )}
    </article>
  )
}

function ProjectsPanel({
  profile,
  data,
  mutate,
  setData,
}: {
  profile: Profile
  data: AppData
  mutate: (operation: () => Promise<void>, success: string) => Promise<void>
  setData: React.Dispatch<React.SetStateAction<AppData>>
}) {
  const [projectForm, setProjectForm] = useState({ name: '', description: '', deadline: '', status: 'planned' as ProjectStatus })
  const [assignmentForm, setAssignmentForm] = useState({ project_id: '', user_id: '', notes: '' })
  const [projectQuery, setProjectQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | ProjectStatus>('all')
  const [viewMode, setViewMode] = useState<'project' | 'member'>('project')
  const leaderMode = profile.role === 'leader'
  const visibleProjectAssignments = leaderMode
    ? data.projectAssignments
    : data.projectAssignments.filter((assignment) => assignment.user_id === profile.id)

  const filteredProjectAssignments = visibleProjectAssignments.filter((assignment) => {
    const project = assignment.projects ?? data.projects.find((item) => item.id === assignment.project_id)
    const member = assignment.profiles ?? data.profiles.find((item) => item.id === assignment.user_id)
    const status = project?.status
    if (statusFilter !== 'all' && status !== statusFilter) return false
    const query = projectQuery.trim().toLowerCase()
    if (!query) return true
    return [
      project?.name,
      project?.description,
      project?.deadline,
      status ? projectStatusLabels[status] : '',
      member?.name,
      member?.email,
      assignment.notes,
    ]
      .join(' ')
      .toLowerCase()
      .includes(query)
  })

  const projectGroups = data.projects
    .filter((project) => leaderMode || filteredProjectAssignments.some((assignment) => assignment.project_id === project.id))
    .filter((project) => statusFilter === 'all' || project.status === statusFilter)
    .map((project) => ({
      project,
      assignments: filteredProjectAssignments.filter((assignment) => assignment.project_id === project.id),
    }))
    .filter((group) => {
      const query = projectQuery.trim().toLowerCase()
      if (!query) return leaderMode || group.assignments.length > 0
      const target = [
        group.project.name,
        group.project.description,
        group.project.deadline,
        projectStatusLabels[group.project.status],
        ...group.assignments.flatMap((assignment) => [
          assignment.profiles?.name,
          assignment.profiles?.email,
          assignment.notes,
        ]),
      ]
        .join(' ')
        .toLowerCase()
      return target.includes(query) && (leaderMode || group.assignments.length > 0)
    })

  const memberGroups = (leaderMode ? data.profiles.filter((member) => member.role === 'member') : [profile])
    .map((member) => ({
      member,
      assignments: filteredProjectAssignments.filter((assignment) => assignment.user_id === member.id),
    }))
    .filter((group) => group.assignments.length > 0)

  const exportProjectCsv = () =>
    downloadCsv(
      'project-assignments.csv',
      filteredProjectAssignments.map((assignment) => {
        const project = assignment.projects ?? data.projects.find((item) => item.id === assignment.project_id)
        const member = assignment.profiles ?? data.profiles.find((item) => item.id === assignment.user_id)
        return {
          project: project?.name ?? assignment.project_id,
          status: project?.status ? projectStatusLabels[project.status] : '',
          deadline: project?.deadline ?? '',
          member: member?.name ?? assignment.user_id,
          email: member?.email ?? '',
          notes: assignment.notes ?? '',
        }
      }),
    )

  const createProject = () =>
    mutate(async () => {
      if (supabase) {
        const { error } = await supabase.from('projects').insert({
          name: projectForm.name,
          description: projectForm.description,
          deadline: projectForm.deadline || null,
          status: projectForm.status,
          created_by: profile.id,
        })
        if (error) throw error
      } else {
        setData((current) => ({
          ...current,
          projects: [
            {
              id: makeId('project'),
              name: projectForm.name,
              description: projectForm.description,
              deadline: projectForm.deadline || null,
              status: projectForm.status,
              created_by: profile.id,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            },
            ...current.projects,
          ],
        }))
      }
      setProjectForm({ name: '', description: '', deadline: '', status: 'planned' })
    }, '프로젝트를 생성했습니다.')

  const assignProject = () =>
    mutate(async () => {
      if (supabase) {
        const { error } = await supabase.from('project_assignments').insert({
          project_id: assignmentForm.project_id,
          user_id: assignmentForm.user_id,
          notes: assignmentForm.notes || null,
        })
        if (error) throw error
      } else {
        const project = data.projects.find((item) => item.id === assignmentForm.project_id)
        const member = data.profiles.find((item) => item.id === assignmentForm.user_id)
        setData((current) => ({
          ...current,
          projectAssignments: [
            {
              id: makeId('project-assignment'),
              project_id: assignmentForm.project_id,
              user_id: assignmentForm.user_id,
              notes: assignmentForm.notes || null,
              created_at: new Date().toISOString(),
              profiles: member ? { name: member.name, email: member.email } : null,
              projects: project
                ? { name: project.name, description: project.description, deadline: project.deadline, status: project.status }
                : null,
            },
            ...current.projectAssignments,
          ],
        }))
      }
      setAssignmentForm({ project_id: '', user_id: '', notes: '' })
    }, '프로젝트를 배정했습니다.')

  return (
    <div className="stack">
      {leaderMode && (
        <div className="grid two">
          <Section title="프로젝트 생성" icon={<FolderKanban size={18} />}>
            <FormGrid
              fields={
                <>
                  <label>
                    이름
                    <input value={projectForm.name} onChange={(event) => setProjectForm({ ...projectForm, name: event.target.value })} />
                  </label>
                  <label>
                    마감일
                    <input type="date" value={projectForm.deadline} onChange={(event) => setProjectForm({ ...projectForm, deadline: event.target.value })} />
                  </label>
                  <label>
                    상태
                    <select value={projectForm.status} onChange={(event) => setProjectForm({ ...projectForm, status: event.target.value as ProjectStatus })}>
                      {Object.entries(projectStatusLabels).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="wide">
                    설명
                    <textarea value={projectForm.description} onChange={(event) => setProjectForm({ ...projectForm, description: event.target.value })} />
                  </label>
                </>
              }
              onSubmit={createProject}
              disabled={!projectForm.name}
              submitLabel="프로젝트 생성"
            />
          </Section>
          <Section title="프로젝트 배정" icon={<Users size={18} />}>
            <FormGrid
              fields={
                <>
                  <label>
                    프로젝트
                    <select value={assignmentForm.project_id} onChange={(event) => setAssignmentForm({ ...assignmentForm, project_id: event.target.value })}>
                      <option value="">선택</option>
                      {data.projects.map((project) => (
                        <option key={project.id} value={project.id}>
                          {project.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    파트원
                    <select value={assignmentForm.user_id} onChange={(event) => setAssignmentForm({ ...assignmentForm, user_id: event.target.value })}>
                      <option value="">선택</option>
                      {data.profiles.map((member) => (
                        <option key={member.id} value={member.id}>
                          {member.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="wide">
                    메모
                    <input value={assignmentForm.notes} onChange={(event) => setAssignmentForm({ ...assignmentForm, notes: event.target.value })} />
                  </label>
                </>
              }
              onSubmit={assignProject}
              disabled={!assignmentForm.project_id || !assignmentForm.user_id}
              submitLabel="배정"
            />
          </Section>
        </div>
      )}
      <Section title={leaderMode ? '프로젝트별 배정 현황' : '내 배정 업무'} icon={<BriefcaseBusiness size={18} />}>
        <div className="section-toolbar">
          <label className="search-field">
            <Search size={16} />
            <input
              placeholder="프로젝트, 파트원, 메모 검색"
              value={projectQuery}
              onChange={(event) => setProjectQuery(event.target.value)}
            />
          </label>
          <select className="compact-select" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as 'all' | ProjectStatus)}>
            <option value="all">전체 상태</option>
            {Object.entries(projectStatusLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <div className="view-switch">
            <button className={viewMode === 'project' ? 'selected' : ''} onClick={() => setViewMode('project')} type="button">
              프로젝트별
            </button>
            <button className={viewMode === 'member' ? 'selected' : ''} onClick={() => setViewMode('member')} type="button">
              사람별
            </button>
          </div>
          <button className="ghost" onClick={exportProjectCsv} type="button">
            <Download size={16} />
            CSV
          </button>
        </div>
        {viewMode === 'project' ? (
          <div className="group-list">
            {projectGroups.length === 0 && <p className="empty">조건에 맞는 프로젝트가 없습니다.</p>}
            {projectGroups.map(({ project, assignments }) => (
              <article className="group-card" key={project.id}>
                <div className="group-header">
                  <div>
                    <strong>{project.name}</strong>
                    <span>{project.description || '설명 없음'}</span>
                  </div>
                  <Badge status={project.status}>{projectStatusLabels[project.status]}</Badge>
                </div>
                <Rows
                  empty="아직 배정된 파트원이 없습니다."
                  rows={assignments.map((assignment) => ({
                    title: assignment.profiles?.name ?? assignment.user_id,
                    meta: `${project.deadline ? `마감 ${formatDate(project.deadline)}` : '마감일 없음'}${
                      assignment.notes ? ` · ${assignment.notes}` : ''
                    }`,
                  }))}
                />
              </article>
            ))}
          </div>
        ) : (
          <div className="group-list">
            {memberGroups.length === 0 && <p className="empty">조건에 맞는 파트원 배정이 없습니다.</p>}
            {memberGroups.map(({ member, assignments }) => (
              <article className="group-card" key={member.id}>
                <div className="group-header">
                  <div>
                    <strong>{member.name}</strong>
                    <span>{member.email}</span>
                  </div>
                  <Badge>{assignments.length}건</Badge>
                </div>
                <Rows
                  empty="배정 프로젝트가 없습니다."
                  rows={assignments.map((assignment) => {
                    const project = assignment.projects ?? data.projects.find((item) => item.id === assignment.project_id)
                    return {
                      title: project?.name ?? assignment.project_id,
                      meta: `${project?.deadline ? `마감 ${formatDate(project.deadline)}` : '마감일 없음'}${
                        assignment.notes ? ` · ${assignment.notes}` : ''
                      }`,
                      aside: project?.status ? projectStatusLabels[project.status] : undefined,
                    }
                  })}
                />
              </article>
            ))}
          </div>
        )}
      </Section>
    </div>
  )
}

function AdminPanel({
  profile,
  data,
  mutate,
  setData,
}: {
  profile: Profile
  data: AppData
  mutate: (operation: () => Promise<void>, success: string) => Promise<void>
  setData: React.Dispatch<React.SetStateAction<AppData>>
}) {
  const [allowedForm, setAllowedForm] = useState({ email: '', name: '', role: 'member' as Role })
  const [productForm, setProductForm] = useState({ name: '', code: '' })
  const [dutyForm, setDutyForm] = useState({ name: '' })
  const [productAssignment, setProductAssignment] = useState({ user_id: '', product_id: '', status: '' })
  const [dutyAssignment, setDutyAssignment] = useState({ user_id: '', duty_id: '' })
  const [adminView, setAdminView] = useState<'register' | 'assign' | 'inventory'>('register')
  const [adminSearch, setAdminSearch] = useState('')
  const [focusMemberId, setFocusMemberId] = useState(data.profiles.find((member) => member.role === 'member')?.id ?? '')

  const memberOptions = data.profiles.filter((member) => member.role === 'member')
  const focusedMember = data.profiles.find((member) => member.id === focusMemberId) ?? memberOptions[0]
  const query = adminSearch.trim().toLowerCase()
  const matchesAdminSearch = (...values: Array<string | null | undefined>) =>
    !query || values.filter(Boolean).join(' ').toLowerCase().includes(query)
  const filteredAllowedUsers = data.allowedUsers.filter((item) => matchesAdminSearch(item.name, item.email, roleLabels[item.role]))
  const filteredProducts = data.products.filter((item) => matchesAdminSearch(item.name, item.code))
  const filteredDuties = data.duties.filter((item) => matchesAdminSearch(item.name))
  const filteredProductAssignments = data.productAssignments.filter((item) =>
    matchesAdminSearch(item.products?.name, item.products?.code, item.profiles?.name, item.profiles?.email, item.status),
  )
  const filteredDutyAssignments = data.dutyAssignments.filter((item) =>
    matchesAdminSearch(item.duties?.name, item.profiles?.name, item.profiles?.email),
  )
  const focusedProductAssignments = focusedMember
    ? data.productAssignments.filter((assignment) => assignment.user_id === focusedMember.id)
    : []
  const focusedDutyAssignments = focusedMember
    ? data.dutyAssignments.filter((assignment) => assignment.user_id === focusedMember.id)
    : []
  const focusedProjectAssignments = focusedMember
    ? data.projectAssignments.filter((assignment) => assignment.user_id === focusedMember.id)
    : []
  const unassignedProducts = data.products.filter(
    (product) => !data.productAssignments.some((assignment) => assignment.product_id === product.id),
  )
  const unassignedDuties = data.duties.filter((duty) => !data.dutyAssignments.some((assignment) => assignment.duty_id === duty.id))

  useEffect(() => {
    if (!memberOptions.length) return
    if (!memberOptions.some((member) => member.id === focusMemberId)) {
      setFocusMemberId(memberOptions[0].id)
    }
  }, [focusMemberId, memberOptions])

  const exportAdminCsv = () =>
    downloadCsv('admin-assignments.csv', [
      ...data.productAssignments.map((assignment) => ({
        type: 'product',
        member: assignment.profiles?.name ?? assignment.user_id,
        email: assignment.profiles?.email ?? '',
        target: assignment.products?.name ?? assignment.product_id,
        code: assignment.products?.code ?? '',
        status: assignment.status ?? '',
      })),
      ...data.dutyAssignments.map((assignment) => ({
        type: 'duty',
        member: assignment.profiles?.name ?? assignment.user_id,
        email: assignment.profiles?.email ?? '',
        target: assignment.duties?.name ?? assignment.duty_id,
        code: '',
        status: '',
      })),
    ])

  const addAllowedUser = () =>
    mutate(async () => {
      if (supabase) {
        const { error } = await supabase.from('allowed_users').insert({
          email: allowedForm.email,
          name: allowedForm.name,
          role: allowedForm.role,
          created_by: profile.id,
        })
        if (error) throw error
      } else {
        setData((current) => ({
          ...current,
          allowedUsers: [{ id: makeId('allowed'), ...allowedForm, created_at: new Date().toISOString() }, ...current.allowedUsers],
          profiles: [
            { id: makeId('profile'), email: allowedForm.email, name: allowedForm.name, role: allowedForm.role },
            ...current.profiles,
          ],
        }))
      }
      setAllowedForm({ email: '', name: '', role: 'member' })
    }, '사용자 초대 정보를 등록했습니다.')

  const addProduct = () =>
    mutate(async () => {
      if (supabase) {
        const { error } = await supabase.from('products').insert({ name: productForm.name, code: productForm.code || null })
        if (error) throw error
      } else {
        setData((current) => ({
          ...current,
          products: [{ id: makeId('product'), name: productForm.name, code: productForm.code || null }, ...current.products],
        }))
      }
      setProductForm({ name: '', code: '' })
    }, '제품을 등록했습니다.')

  const addDuty = () =>
    mutate(async () => {
      if (supabase) {
        const { error } = await supabase.from('duties').insert({ name: dutyForm.name })
        if (error) throw error
      } else {
        setData((current) => ({
          ...current,
          duties: [{ id: makeId('duty'), name: dutyForm.name }, ...current.duties],
        }))
      }
      setDutyForm({ name: '' })
    }, '담당업무를 등록했습니다.')

  const assignProduct = () =>
    mutate(async () => {
      const selectedUserId = productAssignment.user_id || focusedMember?.id
      if (!selectedUserId) return
      if (supabase) {
        const { error } = await supabase.from('product_assignments').insert({
          user_id: selectedUserId,
          product_id: productAssignment.product_id,
          status: productAssignment.status || null,
        })
        if (error) throw error
      } else {
        const member = data.profiles.find((item) => item.id === selectedUserId)
        const product = data.products.find((item) => item.id === productAssignment.product_id)
        setData((current) => ({
          ...current,
          productAssignments: [
            {
              id: makeId('product-assignment'),
              user_id: selectedUserId,
              product_id: productAssignment.product_id,
              status: productAssignment.status || null,
              profiles: member ? { name: member.name, email: member.email } : null,
              products: product ? { name: product.name, code: product.code } : null,
            },
            ...current.productAssignments,
          ],
        }))
      }
      setProductAssignment({ user_id: selectedUserId, product_id: '', status: '' })
    }, '담당제품을 배정했습니다.')

  const assignDuty = () =>
    mutate(async () => {
      const selectedUserId = dutyAssignment.user_id || focusedMember?.id
      if (!selectedUserId) return
      if (supabase) {
        const { error } = await supabase.from('duty_assignments').insert({ ...dutyAssignment, user_id: selectedUserId })
        if (error) throw error
      } else {
        const member = data.profiles.find((item) => item.id === selectedUserId)
        const duty = data.duties.find((item) => item.id === dutyAssignment.duty_id)
        setData((current) => ({
          ...current,
          dutyAssignments: [
            {
              id: makeId('duty-assignment'),
              user_id: selectedUserId,
              duty_id: dutyAssignment.duty_id,
              profiles: member ? { name: member.name, email: member.email } : null,
              duties: duty ? { name: duty.name } : null,
            },
            ...current.dutyAssignments,
          ],
        }))
      }
      setDutyAssignment({ user_id: selectedUserId, duty_id: '' })
    }, '담당업무를 배정했습니다.')

  const deleteRow = (table: string, id: string, label: string) =>
    mutate(async () => {
      if (supabase) {
        const { error } = await supabase.from(table).delete().eq('id', id)
        if (error) throw error
      } else {
        setData((current) => ({
          ...current,
          allowedUsers: table === 'allowed_users' ? current.allowedUsers.filter((item) => item.id !== id) : current.allowedUsers,
          products: table === 'products' ? current.products.filter((item) => item.id !== id) : current.products,
          duties: table === 'duties' ? current.duties.filter((item) => item.id !== id) : current.duties,
          productAssignments:
            table === 'product_assignments' ? current.productAssignments.filter((item) => item.id !== id) : current.productAssignments,
          dutyAssignments:
            table === 'duty_assignments' ? current.dutyAssignments.filter((item) => item.id !== id) : current.dutyAssignments,
        }))
      }
    }, `${label} 삭제했습니다.`)

  return (
    <div className="stack">
      <div className="admin-header">
        <div className="subnav">
          <button className={adminView === 'register' ? 'selected' : ''} onClick={() => setAdminView('register')} type="button">
            등록
          </button>
          <button className={adminView === 'assign' ? 'selected' : ''} onClick={() => setAdminView('assign')} type="button">
            배정
          </button>
          <button className={adminView === 'inventory' ? 'selected' : ''} onClick={() => setAdminView('inventory')} type="button">
            현황
          </button>
        </div>
        <label className="search-field">
          <Search size={16} />
          <input placeholder="이름, 제품, 업무 검색" value={adminSearch} onChange={(event) => setAdminSearch(event.target.value)} />
        </label>
        <button className="ghost" onClick={exportAdminCsv} type="button">
          <Download size={16} />
          CSV
        </button>
      </div>

      {adminView === 'register' && (
        <div className="grid three">
          <Section title="초대 사용자" icon={<Users size={18} />}>
            <FormGrid
              fields={
                <>
                  <label>
                    이메일
                    <input value={allowedForm.email} onChange={(event) => setAllowedForm({ ...allowedForm, email: event.target.value })} />
                  </label>
                  <label>
                    이름
                    <input value={allowedForm.name} onChange={(event) => setAllowedForm({ ...allowedForm, name: event.target.value })} />
                  </label>
                  <label>
                    역할
                    <select value={allowedForm.role} onChange={(event) => setAllowedForm({ ...allowedForm, role: event.target.value as Role })}>
                      <option value="member">파트원</option>
                      <option value="leader">파트장</option>
                    </select>
                  </label>
                </>
              }
              onSubmit={addAllowedUser}
              disabled={!allowedForm.email || !allowedForm.name}
              submitLabel="초대 등록"
            />
          </Section>
          <Section title="제품 마스터" icon={<Package size={18} />}>
            <FormGrid
              fields={
                <>
                  <label>
                    제품명
                    <input value={productForm.name} onChange={(event) => setProductForm({ ...productForm, name: event.target.value })} />
                  </label>
                  <label>
                    제품코드
                    <input value={productForm.code} onChange={(event) => setProductForm({ ...productForm, code: event.target.value })} />
                  </label>
                </>
              }
              onSubmit={addProduct}
              disabled={!productForm.name}
              submitLabel="제품 추가"
            />
          </Section>
          <Section title="업무 카테고리" icon={<ClipboardList size={18} />}>
            <FormGrid
              fields={
                <label>
                  업무명
                  <input value={dutyForm.name} onChange={(event) => setDutyForm({ ...dutyForm, name: event.target.value })} />
                </label>
              }
              onSubmit={addDuty}
              disabled={!dutyForm.name}
              submitLabel="업무 추가"
            />
          </Section>
        </div>
      )}

      {adminView === 'assign' && (
        <>
          <Section title="파트원 배정판" icon={<Users size={18} />}>
            {focusedMember ? (
              <div className="assignment-board">
                <div className="board-controls">
                  <label>
                    파트원
                    <select
                      value={focusedMember.id}
                      onChange={(event) => {
                        const userId = event.target.value
                        setFocusMemberId(userId)
                        setProductAssignment({ ...productAssignment, user_id: userId })
                        setDutyAssignment({ ...dutyAssignment, user_id: userId })
                      }}
                    >
                      {memberOptions.map((member) => (
                        <option key={member.id} value={member.id}>
                          {member.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="chip-row">
                    <Badge>제품 {focusedProductAssignments.length}</Badge>
                    <Badge>업무 {focusedDutyAssignments.length}</Badge>
                    <Badge>프로젝트 {focusedProjectAssignments.length}</Badge>
                  </div>
                </div>
                <div className="mini-columns">
                  <div>
                    <h3>담당제품</h3>
                    <Rows
                      empty="제품 배정이 없습니다."
                      rows={focusedProductAssignments.map((item) => ({
                        title: item.products?.name ?? item.product_id,
                        meta: item.products?.code ?? '코드 없음',
                        aside: item.status ?? '-',
                        action: (
                          <IconAction title="제품 배정 삭제" onClick={() => void deleteRow('product_assignments', item.id, '제품 배정')}>
                            <Trash2 size={16} />
                          </IconAction>
                        ),
                      }))}
                    />
                  </div>
                  <div>
                    <h3>담당업무</h3>
                    <Rows
                      empty="업무 배정이 없습니다."
                      rows={focusedDutyAssignments.map((item) => ({
                        title: item.duties?.name ?? item.duty_id,
                        meta: '정기 담당',
                        action: (
                          <IconAction title="업무 배정 삭제" onClick={() => void deleteRow('duty_assignments', item.id, '업무 배정')}>
                            <Trash2 size={16} />
                          </IconAction>
                        ),
                      }))}
                    />
                  </div>
                  <div>
                    <h3>배정 프로젝트</h3>
                    <Rows
                      empty="프로젝트 배정이 없습니다."
                      rows={focusedProjectAssignments.map((item) => ({
                        title: item.projects?.name ?? item.project_id,
                        meta: item.projects?.deadline ? `마감 ${formatDate(item.projects.deadline)}` : '마감일 없음',
                        aside: item.projects?.status ? projectStatusLabels[item.projects.status] : undefined,
                      }))}
                    />
                  </div>
                </div>
              </div>
            ) : (
              <p className="empty">등록된 파트원이 없습니다.</p>
            )}
          </Section>

          <div className="grid two">
            <Section title="담당제품 배정" icon={<Package size={18} />}>
              <FormGrid
                fields={
                  <>
                    <label>
                      파트원
                      <select
                        value={productAssignment.user_id || focusedMember?.id || ''}
                        onChange={(event) => {
                          setProductAssignment({ ...productAssignment, user_id: event.target.value })
                          setFocusMemberId(event.target.value)
                        }}
                      >
                        <option value="">선택</option>
                        {memberOptions.map((member) => (
                          <option key={member.id} value={member.id}>
                            {member.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      제품
                      <select value={productAssignment.product_id} onChange={(event) => setProductAssignment({ ...productAssignment, product_id: event.target.value })}>
                        <option value="">선택</option>
                        {data.products.map((product) => (
                          <option key={product.id} value={product.id}>
                            {product.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      상태
                      <input value={productAssignment.status} onChange={(event) => setProductAssignment({ ...productAssignment, status: event.target.value })} />
                    </label>
                  </>
                }
                onSubmit={assignProduct}
                disabled={!(productAssignment.user_id || focusedMember?.id) || !productAssignment.product_id}
                submitLabel="제품 배정"
              />
            </Section>
            <Section title="담당업무 배정" icon={<ClipboardList size={18} />}>
              <FormGrid
                fields={
                  <>
                    <label>
                      파트원
                      <select
                        value={dutyAssignment.user_id || focusedMember?.id || ''}
                        onChange={(event) => {
                          setDutyAssignment({ ...dutyAssignment, user_id: event.target.value })
                          setFocusMemberId(event.target.value)
                        }}
                      >
                        <option value="">선택</option>
                        {memberOptions.map((member) => (
                          <option key={member.id} value={member.id}>
                            {member.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      업무
                      <select value={dutyAssignment.duty_id} onChange={(event) => setDutyAssignment({ ...dutyAssignment, duty_id: event.target.value })}>
                        <option value="">선택</option>
                        {data.duties.map((duty) => (
                          <option key={duty.id} value={duty.id}>
                            {duty.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  </>
                }
                onSubmit={assignDuty}
                disabled={!(dutyAssignment.user_id || focusedMember?.id) || !dutyAssignment.duty_id}
                submitLabel="업무 배정"
              />
            </Section>
          </div>
        </>
      )}

      {adminView === 'inventory' && (
        <>
          <div className="kpi-grid">
            <Kpi label="초대" value={filteredAllowedUsers.length} icon={<Users size={20} />} />
            <Kpi label="제품" value={filteredProducts.length} icon={<Package size={20} />} />
            <Kpi label="업무" value={filteredDuties.length} icon={<ClipboardList size={20} />} />
            <Kpi label="미배정" value={unassignedProducts.length + unassignedDuties.length} icon={<ListFilter size={20} />} />
          </div>
          <div className="grid three">
            <Section title="초대 목록" icon={<Users size={18} />}>
              <Rows
                empty="등록된 초대 사용자가 없습니다."
                rows={filteredAllowedUsers.map((item) => ({
                  title: item.name,
                  meta: item.email,
                  aside: roleLabels[item.role],
                  action: (
                    <IconAction title="초대 삭제" onClick={() => void deleteRow('allowed_users', item.id, '초대')}>
                      <Trash2 size={16} />
                    </IconAction>
                  ),
                }))}
              />
            </Section>
            <Section title="제품 목록" icon={<Package size={18} />}>
              <Rows
                empty="제품이 없습니다."
                rows={filteredProducts.map((item) => ({
                  title: item.name,
                  meta: item.code ?? '코드 없음',
                  action: (
                    <IconAction title="제품 삭제" onClick={() => void deleteRow('products', item.id, '제품')}>
                      <Trash2 size={16} />
                    </IconAction>
                  ),
                }))}
              />
            </Section>
            <Section title="업무 목록" icon={<ClipboardList size={18} />}>
              <Rows
                empty="업무가 없습니다."
                rows={filteredDuties.map((item) => ({
                  title: item.name,
                  meta: '카테고리',
                  action: (
                    <IconAction title="업무 삭제" onClick={() => void deleteRow('duties', item.id, '업무')}>
                      <Trash2 size={16} />
                    </IconAction>
                  ),
                }))}
              />
            </Section>
          </div>
          <div className="grid two">
            <Section title="담당제품 현황" icon={<Package size={18} />}>
              <Rows
                empty="제품 배정이 없습니다."
                rows={filteredProductAssignments.map((item) => ({
                  title: item.products?.name ?? item.product_id,
                  meta: item.profiles?.name ?? item.user_id,
                  aside: item.status ?? '-',
                  action: (
                    <IconAction title="제품 배정 삭제" onClick={() => void deleteRow('product_assignments', item.id, '제품 배정')}>
                      <Trash2 size={16} />
                    </IconAction>
                  ),
                }))}
              />
            </Section>
            <Section title="담당업무 현황" icon={<ClipboardList size={18} />}>
              <Rows
                empty="업무 배정이 없습니다."
                rows={filteredDutyAssignments.map((item) => ({
                  title: item.duties?.name ?? item.duty_id,
                  meta: item.profiles?.name ?? item.user_id,
                  action: (
                    <IconAction title="업무 배정 삭제" onClick={() => void deleteRow('duty_assignments', item.id, '업무 배정')}>
                      <Trash2 size={16} />
                    </IconAction>
                  ),
                }))}
              />
            </Section>
          </div>
        </>
      )}
    </div>
  )
}

function OperationsGuide() {
  return (
    <div className="grid two">
      <Section title="운영 전 보안 기준" icon={<ShieldCheck size={18} />}>
        <ul className="check-list">
          <li>Cloudflare Pages에는 `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`만 등록합니다.</li>
          <li>Supabase service role key는 브라우저 번들에 포함하지 않습니다.</li>
          <li>운영 전 Cloudflare Access로 공개 URL 접근을 팀 사용자로 제한합니다.</li>
          <li>앱 내부 leader/member 권한은 Supabase RLS 정책을 기준으로 검증합니다.</li>
        </ul>
      </Section>
      <Section title="무료에서 유료 전환 기준" icon={<BriefcaseBusiness size={18} />}>
        <ul className="check-list">
          <li>실제 업무에서 매일 사용하거나 장애 시 업무 지연이 발생하면 Supabase Pro를 검토합니다.</li>
          <li>DB가 350-400MB에 접근하면 500MB read-only 리스크 전에 전환합니다.</li>
          <li>백업, 복구, 운영 안정성, 다중 관리자 관리가 필요해지면 전환합니다.</li>
          <li>Cloudflare Pages는 정적 SPA 기준 Free를 유지합니다.</li>
        </ul>
      </Section>
    </div>
  )
}

function Section({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="section">
      <header>
        <div>
          {icon}
          <h2>{title}</h2>
        </div>
      </header>
      {children}
    </section>
  )
}

function FormGrid({
  fields,
  submitLabel,
  disabled,
  onSubmit,
}: {
  fields: React.ReactNode
  submitLabel: string
  disabled: boolean
  onSubmit: () => void
}) {
  return (
    <form
      className="form-grid"
      onSubmit={(event) => {
        event.preventDefault()
        void onSubmit()
      }}
    >
      {fields}
      <button className="primary wide" disabled={disabled} type="submit">
        <Plus size={16} />
        {submitLabel}
      </button>
    </form>
  )
}

function Kpi({ label, value, icon }: { label: string; value: number; icon?: React.ReactNode }) {
  return (
    <div className="kpi">
      {icon && <div className="kpi-icon">{icon}</div>}
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

function Badge({ children, status }: { children: React.ReactNode; status?: string }) {
  return <span className="badge" data-status={status}>{children}</span>
}

function Rows({
  rows,
  empty,
}: {
  rows: Array<{ title: string; meta: string; aside?: string; action?: React.ReactNode }>
  empty: string
}) {
  if (rows.length === 0) return <p className="empty">{empty}</p>
  return (
    <div className="rows">
      {rows.map((row, index) => (
        <div className="row" key={`${row.title}-${index}`}>
          <div>
            <strong>{row.title}</strong>
            <span>{row.meta}</span>
          </div>
          <div className="row-side">
            {row.aside && <Badge>{row.aside}</Badge>}
            {row.action}
          </div>
        </div>
      ))}
    </div>
  )
}

function IconAction({ title, onClick, children }: { title: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button className="icon-button small" title={title} onClick={onClick} type="button">
      {children}
    </button>
  )
}

export default App
