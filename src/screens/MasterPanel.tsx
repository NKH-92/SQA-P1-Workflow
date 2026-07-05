import { useEffect, useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import { Badge, FormGrid, IconAction, Section } from '../components/ui'
import type { AppData, Profile, Role } from '../types'
import type { AdminDeleteTable, MasterTabId, TabId } from '../app/types'
import { downloadCsv } from '../lib/csv'
import {
  addAllowedUser as addAllowedUserMutation,
  addDuty as addDutyMutation,
  addProduct as addProductMutation,
  assignDuty as assignDutyMutation,
  assignProduct as assignProductMutation,
  createRepositoryContext,
  deleteMasterRow,
  importInvites as importInvitesMutation,
  importProducts as importProductsMutation,
  toggleProfileActive as toggleProfileActiveMutation,
  updateDuty as updateDutyMutation,
  updateInvite as updateInviteMutation,
  updateProduct as updateProductMutation,
} from '../data'
import { roleLabels } from '../lib/format'
import { deleteWarnings } from '../app/constants'
import { parseCsvRows, parseInviteImportRows, parseProductImportRows } from '../lib/csvImport'
import {
  ClipboardList,
  Download,
  Package,
  Pencil,
  Save,
  Search,
  Trash2,
  Upload,
  Users,
} from 'lucide-react'

export function MasterPanel({
  profile,
  data,
  mutate,
  setData,
  masterView,
  setActiveTab,
}: {
  profile: Profile
  data: AppData
  mutate: (operation: () => Promise<void>, success: string) => Promise<void>
  setData: Dispatch<SetStateAction<AppData>>
  masterView: MasterTabId
  setActiveTab: (tab: TabId, entityId?: string) => void
}) {
  const [allowedForm, setAllowedForm] = useState({ email: '', name: '', role: 'member' as Role })
  const [productForm, setProductForm] = useState({ name: '', code: '' })
  const [dutyForm, setDutyForm] = useState({ name: '' })
  const [productAssignment, setProductAssignment] = useState({ user_id: '', product_id: '', status: '' })
  const [dutyAssignment, setDutyAssignment] = useState({ user_id: '', duty_id: '' })
  const [adminSearch, setAdminSearch] = useState('')
  const [pendingDelete, setPendingDelete] = useState<{ table: AdminDeleteTable; id: string } | null>(null)
  const [focusMemberId, setFocusMemberId] = useState(data.profiles.find((member) => member.role === 'member')?.id ?? '')
  const [productEdits, setProductEdits] = useState<Record<string, { name: string; code: string }>>({})
  const [dutyEdits, setDutyEdits] = useState<Record<string, { name: string }>>({})
  const [inviteEdits, setInviteEdits] = useState<Record<string, { email: string; name: string; role: Role }>>({})

  const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

  const memberOptions = data.profiles.filter((member) => member.role === 'member')
  const focusedMember = data.profiles.find((member) => member.id === focusMemberId) ?? memberOptions[0]
  const query = adminSearch.trim().toLowerCase()
  const matchesAdminSearch = (...values: Array<string | null | undefined>) =>
    !query || values.filter(Boolean).join(' ').toLowerCase().includes(query)
  const filteredAllowedUsers = data.allowedUsers.filter((item) => matchesAdminSearch(item.name, item.email, roleLabels[item.role]))
  const filteredProducts = data.products.filter((item) => matchesAdminSearch(item.name, item.code))
  const filteredDuties = data.duties.filter((item) => matchesAdminSearch(item.name))
  const focusedProductAssignments = focusedMember
    ? data.productAssignments.filter((assignment) => assignment.user_id === focusedMember.id)
    : []
  const focusedDutyAssignments = focusedMember
    ? data.dutyAssignments.filter((assignment) => assignment.user_id === focusedMember.id)
    : []
  const unassignedProducts = data.products.filter(
    (product) => !data.productAssignments.some((assignment) => assignment.product_id === product.id),
  )
  const unassignedDuties = data.duties.filter((duty) => !data.dutyAssignments.some((assignment) => assignment.duty_id === duty.id))
  const viewMeta: Record<MasterTabId, { title: string; eyebrow: string; note: string }> = {
    products: {
      title: '제품 마스터',
      eyebrow: 'Master / Products',
      note: `등록 ${data.products.length}개 · 미배정 ${unassignedProducts.length}개`,
    },
    duties: {
      title: '업무 카테고리',
      eyebrow: 'Master / Work Categories',
      note: `등록 ${data.duties.length}개 · 미배정 ${unassignedDuties.length}개`,
    },
    invites: {
      title: '초대 관리',
      eyebrow: 'Master / Invitations',
      note: `초대 ${data.allowedUsers.length}명 · 파트원 ${memberOptions.length}명`,
    },
  }

  useEffect(() => {
    if (!memberOptions.length) return
    if (!memberOptions.some((member) => member.id === focusMemberId)) {
      setFocusMemberId(memberOptions[0].id)
    }
  }, [focusMemberId, memberOptions])

  useEffect(() => {
    setPendingDelete(null)
  }, [adminSearch, masterView])

  const exportAdminCsv = () =>
    downloadCsv('master-data.csv', [
      ...data.allowedUsers.map((item) => ({
        type: 'invite',
        name: item.name,
        email: item.email,
        role: roleLabels[item.role],
      })),
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
      })),
    ])

  const importProductsCsv = (file: File) =>
    mutate(async () => {
      const rows = parseProductImportRows(parseCsvRows(await file.text()))
      if (rows.length === 0) throw new Error('가져올 제품 데이터가 없습니다.')
      const existingNames = new Set(data.products.map((item) => item.name.trim().toLowerCase()))
      const incoming = rows.filter((row) => !existingNames.has(row.name.trim().toLowerCase()))
      if (incoming.length === 0) throw new Error('이미 등록된 제품만 포함되어 있습니다.')
      await importProductsMutation(createRepositoryContext(profile, data, setData), incoming)
    }, '제품 CSV 가져오기를 완료했습니다.')

  const importInvitesCsv = (file: File) =>
    mutate(async () => {
      const rows = parseInviteImportRows(parseCsvRows(await file.text()))
      if (rows.length === 0) throw new Error('가져올 초대 데이터가 없습니다.')
      const existingEmails = new Set(data.allowedUsers.map((item) => item.email.toLowerCase()))
      const incoming = rows.filter((row) => {
        if (!EMAIL_PATTERN.test(row.email)) return false
        return !existingEmails.has(row.email)
      })
      if (incoming.length === 0) throw new Error('유효한 신규 초대가 없습니다.')
      await importInvitesMutation(createRepositoryContext(profile, data, setData), incoming)
    }, '초대 CSV 가져오기를 완료했습니다.')

  const addAllowedUser = () =>
    mutate(async () => {
      const email = allowedForm.email.trim().toLowerCase()
      if (!EMAIL_PATTERN.test(email)) {
        throw new Error('올바른 이메일 형식을 입력해 주세요.')
      }
      if (data.allowedUsers.some((item) => item.email.toLowerCase() === email)) {
        throw new Error('이미 초대 목록에 등록된 이메일입니다.')
      }
      await addAllowedUserMutation(createRepositoryContext(profile, data, setData), {
        email,
        name: allowedForm.name,
        role: allowedForm.role,
      })
      setAllowedForm({ email: '', name: '', role: 'member' })
    }, '초대 정보를 등록했습니다.')

  const addProduct = () =>
    mutate(async () => {
      if (data.products.some((item) => item.name.trim() === productForm.name.trim())) {
        throw new Error('이미 등록된 제품명입니다.')
      }
      await addProductMutation(createRepositoryContext(profile, data, setData), productForm)
      setProductForm({ name: '', code: '' })
    }, '제품을 등록했습니다.')

  const addDuty = () =>
    mutate(async () => {
      if (data.duties.some((item) => item.name.trim() === dutyForm.name.trim())) {
        throw new Error('이미 등록된 업무명입니다.')
      }
      await addDutyMutation(createRepositoryContext(profile, data, setData), dutyForm.name)
      setDutyForm({ name: '' })
    }, '업무 카테고리를 등록했습니다.')

  const assignProduct = () =>
    mutate(async () => {
      const selectedUserId = productAssignment.user_id || focusedMember?.id
      if (!selectedUserId) return
      if (
        data.productAssignments.some(
          (assignment) => assignment.user_id === selectedUserId && assignment.product_id === productAssignment.product_id,
        )
      ) {
        throw new Error('이미 해당 파트원에게 배정된 제품입니다.')
      }
      await assignProductMutation(createRepositoryContext(profile, data, setData), {
        userId: selectedUserId,
        productId: productAssignment.product_id,
        status: productAssignment.status,
      })
      setProductAssignment({ user_id: selectedUserId, product_id: '', status: '' })
    }, '담당 제품을 배정했습니다.')

  const assignDuty = () =>
    mutate(async () => {
      const selectedUserId = dutyAssignment.user_id || focusedMember?.id
      if (!selectedUserId) return
      await assignDutyMutation(createRepositoryContext(profile, data, setData), {
        userId: selectedUserId,
        dutyId: dutyAssignment.duty_id,
      })
      setDutyAssignment({ user_id: selectedUserId, duty_id: '' })
    }, '담당 업무를 배정했습니다.')

  const saveProductEdit = (productId: string) =>
    mutate(async () => {
      const edit = productEdits[productId]
      if (!edit?.name.trim()) return
      if (data.products.some((item) => item.id !== productId && item.name.trim() === edit.name.trim())) {
        throw new Error('이미 등록된 제품명입니다.')
      }
      await updateProductMutation(createRepositoryContext(profile, data, setData), productId, {
        name: edit.name.trim(),
        code: edit.code.trim() || null,
      })
      setProductEdits((current) => {
        const next = { ...current }
        delete next[productId]
        return next
      })
    }, '제품 정보를 수정했습니다.')

  const saveDutyEdit = (dutyId: string) =>
    mutate(async () => {
      const edit = dutyEdits[dutyId]
      if (!edit?.name.trim()) return
      if (data.duties.some((item) => item.id !== dutyId && item.name.trim() === edit.name.trim())) {
        throw new Error('이미 등록된 업무명입니다.')
      }
      await updateDutyMutation(createRepositoryContext(profile, data, setData), dutyId, edit.name.trim())
      setDutyEdits((current) => {
        const next = { ...current }
        delete next[dutyId]
        return next
      })
    }, '업무 카테고리를 수정했습니다.')

  const saveInviteEdit = (inviteId: string) =>
    mutate(async () => {
      const edit = inviteEdits[inviteId]
      if (!edit?.name.trim() || !edit.email.trim()) return
      const email = edit.email.trim().toLowerCase()
      if (!EMAIL_PATTERN.test(email)) {
        throw new Error('올바른 이메일 형식을 입력해 주세요.')
      }
      if (data.allowedUsers.some((item) => item.id !== inviteId && item.email.toLowerCase() === email)) {
        throw new Error('이미 초대 목록에 등록된 이메일입니다.')
      }
      await updateInviteMutation(createRepositoryContext(profile, data, setData), inviteId, {
        email,
        name: edit.name.trim(),
        role: edit.role,
      })
      setInviteEdits((current) => {
        const next = { ...current }
        delete next[inviteId]
        return next
      })
    }, '초대 정보를 수정했습니다.')

  const toggleProfileActive = (email: string, nextActive: boolean) =>
    mutate(async () => {
      const memberProfile = data.profiles.find((item) => item.email.toLowerCase() === email.toLowerCase())
      if (!memberProfile) throw new Error('아직 가입하지 않은 사용자입니다. Supabase에서 계정을 만든 뒤 비활성화할 수 있습니다.')
      await toggleProfileActiveMutation(createRepositoryContext(profile, data, setData), memberProfile.id, nextActive)
    }, nextActive ? '계정을 활성화했습니다.' : '계정을 비활성화했습니다.')

  const deleteRow = (table: AdminDeleteTable, id: string, label: string) =>
    mutate(async () => {
      await deleteMasterRow(createRepositoryContext(profile, data, setData), table, id)
      setPendingDelete(null)
    }, `${label} 삭제했습니다.`)

  const deleteAction = (table: AdminDeleteTable, id: string, label: string, itemName: string, warning?: string) => {
    const selected = pendingDelete?.table === table && pendingDelete.id === id
    if (!selected) {
      return (
        <IconAction title={`${label} 삭제`} onClick={() => setPendingDelete({ table, id })}>
          <Trash2 size={16} />
        </IconAction>
      )
    }

    return (
      <div className="delete-confirm" title={warning ?? deleteWarnings[table]}>
        <button className="danger compact" onClick={() => void deleteRow(table, id, label)} type="button">
          삭제 확인
        </button>
        <button className="ghost compact" onClick={() => setPendingDelete(null)} type="button">
          취소
        </button>
        <span className="sr-only">{itemName}</span>
      </div>
    )
  }

  const masterTabs: Array<{ id: MasterTabId; label: string }> = [
    { id: 'products', label: '제품' },
    { id: 'duties', label: '업무 카테고리' },
    { id: 'invites', label: '초대 관리' },
  ]

  return (
    <div className="stack">
      <div className="page-intro master-page-heading">
        <span>{viewMeta[masterView].eyebrow}</span>
        <h1>{viewMeta[masterView].title}</h1>
        <p>{viewMeta[masterView].note}</p>
      </div>
      <div className="admin-header master-header">
        <div className="subnav master-tabs">
          {masterTabs.map((tab) => (
            <button
              className={masterView === tab.id ? 'selected' : ''}
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              type="button"
            >
              {tab.label}
            </button>
          ))}
        </div>
        <label className="search-field">
          <Search size={16} />
          <input
            placeholder="이름, 제품, 업무 검색"
            value={adminSearch}
            onChange={(event) => setAdminSearch(event.target.value)}
          />
        </label>
        <button className="ghost" onClick={exportAdminCsv} type="button">
          <Download size={16} />
          CSV
        </button>
        {(masterView === 'products' || masterView === 'invites') && (
          <label className="ghost file-import-btn">
            <Upload size={16} />
            가져오기
            <input
              accept=".csv,text/csv"
              hidden
              onChange={(event) => {
                const file = event.target.files?.[0]
                if (!file) return
                if (masterView === 'products') void importProductsCsv(file)
                else void importInvitesCsv(file)
                event.target.value = ''
              }}
              type="file"
            />
          </label>
        )}
      </div>

      {masterView === 'products' && (
        <>
          <div className="grid two">
            <Section title="제품 등록" icon={<Package size={18} />}>
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
                disabled={!productForm.name.trim()}
                submitLabel="제품 추가"
              />
            </Section>
            <Section title="제품 배정" icon={<Users size={18} />}>
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
          </div>
          <div className="master-grid">
            {filteredProducts.map((product) => {
              const assignments = data.productAssignments.filter((assignment) => assignment.product_id === product.id)
              const edit = productEdits[product.id]
              return (
                <article className="master-card" key={product.id}>
                  {edit ? (
                    <div className="project-edit-form">
                      <label>
                        제품명
                        <input value={edit.name} onChange={(event) => setProductEdits({ ...productEdits, [product.id]: { ...edit, name: event.target.value } })} />
                      </label>
                      <label>
                        제품코드
                        <input value={edit.code} onChange={(event) => setProductEdits({ ...productEdits, [product.id]: { ...edit, code: event.target.value } })} />
                      </label>
                      <div className="inline-actions">
                        <button className="primary compact" disabled={!edit.name.trim()} onClick={() => void saveProductEdit(product.id)} type="button">
                          <Save size={16} />
                          저장
                        </button>
                        <button className="ghost compact" onClick={() => setProductEdits((current) => { const next = { ...current }; delete next[product.id]; return next })} type="button">
                          취소
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="master-card-head">
                        <span className="code-mark">{(product.code ?? product.name).slice(0, 3).toUpperCase()}</span>
                        <div>
                          <h3>{product.name}</h3>
                          <p>{product.code ?? '코드 없음'}</p>
                        </div>
                        <div className="group-actions">
                          <button
                            className="ghost compact"
                            onClick={() => setProductEdits({ ...productEdits, [product.id]: { name: product.name, code: product.code ?? '' } })}
                            title="제품 수정"
                            type="button"
                          >
                            <Pencil size={16} />
                          </button>
                          {deleteAction(
                            'products',
                            product.id,
                            '제품',
                            product.name,
                            assignments.length > 0 ? `배정 ${assignments.length}건이 함께 삭제됩니다.` : deleteWarnings.products,
                          )}
                        </div>
                      </div>
                      <div className="pill-row">
                        {assignments.map((assignment) => (
                          <span key={assignment.id}>{assignment.profiles?.name ?? assignment.user_id}</span>
                        ))}
                        {assignments.length === 0 && <span>배정 필요</span>}
                      </div>
                    </>
                  )}
                </article>
              )
            })}
          </div>
        </>
      )}

      {masterView === 'duties' && (
        <>
          <div className="grid two">
            <Section title="업무 카테고리 등록" icon={<ClipboardList size={18} />}>
              <FormGrid
                fields={
                  <label>
                    업무명
                    <input value={dutyForm.name} onChange={(event) => setDutyForm({ ...dutyForm, name: event.target.value })} />
                  </label>
                }
                onSubmit={addDuty}
                disabled={!dutyForm.name.trim()}
                submitLabel="업무 추가"
              />
            </Section>
            <Section title="업무 배정" icon={<Users size={18} />}>
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
          <div className="master-grid">
            {filteredDuties.map((duty) => {
              const assignments = data.dutyAssignments.filter((assignment) => assignment.duty_id === duty.id)
              const edit = dutyEdits[duty.id]
              return (
                <article className="master-card" key={duty.id}>
                  {edit ? (
                    <div className="project-edit-form">
                      <label>
                        업무명
                        <input value={edit.name} onChange={(event) => setDutyEdits({ ...dutyEdits, [duty.id]: { name: event.target.value } })} />
                      </label>
                      <div className="inline-actions">
                        <button className="primary compact" disabled={!edit.name.trim()} onClick={() => void saveDutyEdit(duty.id)} type="button">
                          <Save size={16} />
                          저장
                        </button>
                        <button className="ghost compact" onClick={() => setDutyEdits((current) => { const next = { ...current }; delete next[duty.id]; return next })} type="button">
                          취소
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="master-card-head">
                        <span className="code-mark">{duty.name.slice(0, 1)}</span>
                        <div>
                          <h3>{duty.name}</h3>
                          <p>담당 {assignments.length}명</p>
                        </div>
                        <div className="group-actions">
                          <button className="ghost compact" onClick={() => setDutyEdits({ ...dutyEdits, [duty.id]: { name: duty.name } })} title="업무 수정" type="button">
                            <Pencil size={16} />
                          </button>
                          {deleteAction('duties', duty.id, '업무', duty.name)}
                        </div>
                      </div>
                      <div className="pill-row">
                        {assignments.map((assignment) => (
                          <span key={assignment.id}>{assignment.profiles?.name ?? assignment.user_id}</span>
                        ))}
                        {assignments.length === 0 && <span>배정 필요</span>}
                      </div>
                    </>
                  )}
                </article>
              )
            })}
          </div>
        </>
      )}

      {masterView === 'invites' && (
        <>
          <Section title="초대 대상 등록" icon={<Users size={18} />}>
            <FormGrid
              fields={
                <>
                  <label>
                    이메일
                    <input type="email" value={allowedForm.email} onChange={(event) => setAllowedForm({ ...allowedForm, email: event.target.value })} />
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
              disabled={!allowedForm.email.trim() || !allowedForm.name.trim()}
              submitLabel="초대 등록"
            />
          </Section>
          <div className="master-grid">
            {filteredAllowedUsers.map((item) => {
              const edit = inviteEdits[item.id]
              const linkedProfile = data.profiles.find((profile) => profile.email.toLowerCase() === item.email.toLowerCase())
              const isActive = linkedProfile?.is_active !== false
              return (
                <article className="master-card" key={item.id}>
                  {edit ? (
                    <div className="project-edit-form">
                      <label>
                        이메일
                        <input type="email" value={edit.email} onChange={(event) => setInviteEdits({ ...inviteEdits, [item.id]: { ...edit, email: event.target.value } })} />
                      </label>
                      <label>
                        이름
                        <input value={edit.name} onChange={(event) => setInviteEdits({ ...inviteEdits, [item.id]: { ...edit, name: event.target.value } })} />
                      </label>
                      <label>
                        역할
                        <select value={edit.role} onChange={(event) => setInviteEdits({ ...inviteEdits, [item.id]: { ...edit, role: event.target.value as Role } })}>
                          <option value="member">파트원</option>
                          <option value="leader">파트장</option>
                        </select>
                      </label>
                      <div className="inline-actions">
                        <button className="primary compact" disabled={!edit.name.trim() || !edit.email.trim()} onClick={() => void saveInviteEdit(item.id)} type="button">
                          <Save size={16} />
                          저장
                        </button>
                        <button className="ghost compact" onClick={() => setInviteEdits((current) => { const next = { ...current }; delete next[item.id]; return next })} type="button">
                          취소
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="master-card-head">
                        <span className="code-mark">{item.name.slice(0, 1)}</span>
                        <div>
                          <h3>{item.name}</h3>
                          <p>{item.email}</p>
                        </div>
                        <div className="group-actions">
                          <button
                            className="ghost compact"
                            onClick={() => setInviteEdits({ ...inviteEdits, [item.id]: { email: item.email, name: item.name, role: item.role } })}
                            title="초대 수정"
                            type="button"
                          >
                            <Pencil size={16} />
                          </button>
                          {deleteAction('allowed_users', item.id, '초대', item.email)}
                        </div>
                      </div>
                      <div className="inline-actions">
                        <Badge status={linkedProfile ? (isActive ? 'approved' : 'rejected') : 'pending'}>
                          {linkedProfile ? (isActive ? '활성' : '비활성') : '미가입'}
                        </Badge>
                        {linkedProfile && (
                          <button
                            className="ghost compact"
                            onClick={() => void toggleProfileActive(item.email, !isActive)}
                            type="button"
                          >
                            {isActive ? '비활성화' : '활성화'}
                          </button>
                        )}
                      </div>
                      <Badge>{roleLabels[item.role]}</Badge>
                    </>
                  )}
                </article>
              )
            })}
          </div>
        </>
      )}

      {focusedMember && masterView !== 'invites' && (
        <Section title="선택 파트원 배정 현황" icon={<Users size={18} />}>
          <div className="board-controls">
            <label>
              파트원
              <select value={focusedMember.id} onChange={(event) => setFocusMemberId(event.target.value)}>
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
            </div>
          </div>
        </Section>
      )}
    </div>
  )
}

