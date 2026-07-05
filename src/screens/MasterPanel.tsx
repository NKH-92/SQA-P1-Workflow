import { useEffect, useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import { Badge, FormGrid, IconAction } from '../components/ui'
import type { AppData, Duty, DutyMajorCategory, ProductCategory, Profile, Role } from '../types'
import type { AdminDeleteTable, MasterTabId, TabId } from '../app/types'
import { downloadCsv } from '../lib/csv'
import { buildProductAllocationCsvRows } from '../lib/productAllocationCsv'
import {
  addAllowedUser as addAllowedUserMutation,
  addDuty as addDutyMutation,
  addDutyMajorCategory as addDutyMajorCategoryMutation,
  addProduct as addProductMutation,
  assignDuty as assignDutyMutation,
  assignProduct as assignProductMutation,
  createRepositoryContext,
  deleteMasterRow,
  importInvites as importInvitesMutation,
  importProducts as importProductsMutation,
  toggleProfileActive as toggleProfileActiveMutation,
  updateDuty as updateDutyMutation,
  updateDutyMajorCategory as updateDutyMajorCategoryMutation,
  updateInvite as updateInviteMutation,
  updateProduct as updateProductMutation,
} from '../data'
import { roleLabels } from '../lib/format'
import { deleteWarnings } from '../app/constants'
import { canReceiveAssignment } from '../domain/permissions'
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
  X,
} from 'lucide-react'

export function MasterPanel({
  profile,
  data,
  mutate,
  setData,
  masterView,
}: {
  profile: Profile
  data: AppData
  mutate: (operation: () => Promise<void>, success: string) => Promise<void>
  setData: Dispatch<SetStateAction<AppData>>
  masterView: MasterTabId
  setActiveTab: (tab: TabId, entityId?: string) => void
}) {
  const [allowedForm, setAllowedForm] = useState({ email: '', name: '', role: 'member' as Role })
  const [productForm, setProductForm] = useState({ name: '', category: '자사' as ProductCategory, companyName: '자사' })
  const [dutyForm, setDutyForm] = useState({ major_category_id: '', name: '' })
  const [majorCategoryForm, setMajorCategoryForm] = useState({ name: '' })
  const [productAssignment, setProductAssignment] = useState({ user_id: '', product_id: '' })
  const [dutyAssignment, setDutyAssignment] = useState({ user_id: '', duty_id: '' })
  const [adminSearch, setAdminSearch] = useState('')
  const [pendingDelete, setPendingDelete] = useState<{ table: AdminDeleteTable; id: string } | null>(null)
  const [pendingProfileToggle, setPendingProfileToggle] = useState<{ email: string; nextActive: boolean } | null>(null)
  const [productEdits, setProductEdits] = useState<Record<string, { name: string; category: ProductCategory | string; companyName: string }>>({})
  const [dutyEdits, setDutyEdits] = useState<Record<string, { major_category_id: string; name: string }>>({})
  const [majorCategoryEdits, setMajorCategoryEdits] = useState<Record<string, { name: string }>>({})
  const [inviteEdits, setInviteEdits] = useState<Record<string, { email: string; name: string; role: Role }>>({})
  const [productRegisterOpen, setProductRegisterOpen] = useState(false)
  const [productAssignOpen, setProductAssignOpen] = useState(false)
  const [dutyRegisterOpen, setDutyRegisterOpen] = useState(false)
  const [dutyAssignOpen, setDutyAssignOpen] = useState(false)
  const [majorCategoryRegisterOpen, setMajorCategoryRegisterOpen] = useState(false)
  const [inviteRegisterOpen, setInviteRegisterOpen] = useState(false)

  const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

  const memberOptions = data.profiles.filter(canReceiveAssignment)
  const query = adminSearch.trim().toLowerCase()
  const matchesAdminSearch = (...values: Array<string | null | undefined>) =>
    !query || values.filter(Boolean).join(' ').toLowerCase().includes(query)
  const filteredAllowedUsers = data.allowedUsers.filter((item) => matchesAdminSearch(item.name, item.email, roleLabels[item.role]))
  const filteredProducts = data.products.filter((item) => matchesAdminSearch(item.name, item.category, item.company_name))
  const filteredDuties = data.duties.filter((item) =>
    matchesAdminSearch(item.name, item.duty_major_categories?.name, data.dutyMajorCategories.find((category) => category.id === item.major_category_id)?.name),
  )
  const compareMajorCategories = (left: DutyMajorCategory, right: DutyMajorCategory) => {
    const leftOrder = left.sort_order ?? Number.MAX_SAFE_INTEGER
    const rightOrder = right.sort_order ?? Number.MAX_SAFE_INTEGER
    return leftOrder - rightOrder || left.name.localeCompare(right.name, 'ko-KR', { numeric: true, sensitivity: 'base' })
  }
  const compareDuties = (left: Duty, right: Duty) => {
    const leftOrder = left.sort_order ?? Number.MAX_SAFE_INTEGER
    const rightOrder = right.sort_order ?? Number.MAX_SAFE_INTEGER
    return leftOrder - rightOrder || left.name.localeCompare(right.name, 'ko-KR', { numeric: true, sensitivity: 'base' })
  }
  const filteredMajorCategories = data.dutyMajorCategories
    .filter((category) => {
      if (!query) return true
      if (matchesAdminSearch(category.name)) return true
      return data.duties.some((duty) => duty.major_category_id === category.id && filteredDuties.some((item) => item.id === duty.id))
    })
    .sort(compareMajorCategories)
  const dutyTableGroups = filteredMajorCategories.map((category) => ({
    category,
    duties: data.duties
      .filter((duty) => duty.major_category_id === category.id)
      .filter((duty) => !query || matchesAdminSearch(category.name) || filteredDuties.some((item) => item.id === duty.id))
      .sort(compareDuties),
  }))
  const compareMasterProducts = (left: AppData['products'][number], right: AppData['products'][number]) => {
    const leftOrder = left.sort_order ?? Number.MAX_SAFE_INTEGER
    const rightOrder = right.sort_order ?? Number.MAX_SAFE_INTEGER
    return leftOrder - rightOrder || left.name.localeCompare(right.name, 'ko-KR', { numeric: true, sensitivity: 'base' })
  }
  const ownCompanyProducts = filteredProducts
    .filter((product) => (product.category ?? '자사') !== '위탁')
    .sort(compareMasterProducts)
  const consignedProducts = filteredProducts
    .filter((product) => product.category === '위탁')
    .sort(compareMasterProducts)
  const unassignedProducts = data.products.filter(
    (product) => !data.productAssignments.some((assignment) => assignment.product_id === product.id),
  )
  const unassignedDuties = data.duties.filter(
    (duty) => !duty.assignee_label && !data.dutyAssignments.some((assignment) => assignment.duty_id === duty.id),
  )
  const viewMeta: Record<MasterTabId, { title: string; eyebrow: string; note: string }> = {
    products: {
      title: '제품 마스터',
      eyebrow: 'Master / Products',
      note: `등록 ${data.products.length}개 · 미배정 ${unassignedProducts.length}개`,
    },
    duties: {
      title: '업무 카테고리',
      eyebrow: 'Master / Work Categories',
      note: `대분류 ${data.dutyMajorCategories.length}개 · 업무 ${data.duties.length}개 · 미배정 ${unassignedDuties.length}개`,
    },
    invites: {
      title: '초대 관리',
      eyebrow: 'Master / Invitations',
      note: `초대 ${data.allowedUsers.length}명 · 파트원 ${memberOptions.length}명`,
    },
  }

  useEffect(() => {
    setPendingDelete(null)
  }, [adminSearch, masterView])

  const exportAdminCsv = () => {
    if (masterView === 'products') {
      downloadCsv('product-allocations.csv', buildProductAllocationCsvRows(data))
      return
    }

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
      })),
      ...data.dutyAssignments.map((assignment) => ({
        type: 'duty',
        member: assignment.profiles?.name ?? assignment.user_id,
        email: assignment.profiles?.email ?? '',
        target: assignment.duties?.name ?? assignment.duty_id,
      })),
    ])
  }

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
    }, '초대 정보를 등록했습니다.').then(() => setInviteRegisterOpen(false))

  const addProduct = () =>
    mutate(async () => {
      if (data.products.some((item) => item.name.trim() === productForm.name.trim())) {
        throw new Error('이미 등록된 제품명입니다.')
      }
      await addProductMutation(createRepositoryContext(profile, data, setData), productForm)
      setProductForm({ name: '', category: '자사', companyName: '자사' })
    }, '제품을 등록했습니다.').then(() => setProductRegisterOpen(false))

  const addMajorCategory = () =>
    mutate(async () => {
      const name = majorCategoryForm.name.trim()
      if (data.dutyMajorCategories.some((item) => item.name.trim() === name)) {
        throw new Error('이미 등록된 대분류입니다.')
      }
      await addDutyMajorCategoryMutation(createRepositoryContext(profile, data, setData), { name })
      setMajorCategoryForm({ name: '' })
    }, '대분류를 등록했습니다.').then(() => setMajorCategoryRegisterOpen(false))

  const addDuty = () =>
    mutate(async () => {
      if (!dutyForm.major_category_id) {
        throw new Error('대분류를 선택해 주세요.')
      }
      if (
        data.duties.some(
          (item) =>
            item.major_category_id === dutyForm.major_category_id && item.name.trim() === dutyForm.name.trim(),
        )
      ) {
        throw new Error('같은 대분류에 이미 등록된 업무명입니다.')
      }
      await addDutyMutation(createRepositoryContext(profile, data, setData), {
        majorCategoryId: dutyForm.major_category_id,
        name: dutyForm.name,
      })
      setDutyForm({ major_category_id: dutyForm.major_category_id, name: '' })
    }, '업무 카테고리를 등록했습니다.').then(() => setDutyRegisterOpen(false))

  const assignProduct = () =>
    mutate(async () => {
      if (!productAssignment.user_id) return
      if (
        data.productAssignments.some(
          (assignment) => assignment.user_id === productAssignment.user_id && assignment.product_id === productAssignment.product_id,
        )
      ) {
        throw new Error('이미 해당 파트원에게 배정된 제품입니다.')
      }
      await assignProductMutation(createRepositoryContext(profile, data, setData), {
        userId: productAssignment.user_id,
        productId: productAssignment.product_id,
      })
      setProductAssignment({ user_id: productAssignment.user_id, product_id: '' })
    }, '담당 제품을 배정했습니다.').then(() => setProductAssignOpen(false))

  const assignDuty = () =>
    mutate(async () => {
      if (!dutyAssignment.user_id) return
      await assignDutyMutation(createRepositoryContext(profile, data, setData), {
        userId: dutyAssignment.user_id,
        dutyId: dutyAssignment.duty_id,
      })
      setDutyAssignment({ user_id: dutyAssignment.user_id, duty_id: '' })
    }, '담당 업무를 배정했습니다.').then(() => setDutyAssignOpen(false))

  const saveProductEdit = (productId: string) =>
    mutate(async () => {
      const edit = productEdits[productId]
      if (!edit?.name.trim()) return
      if (data.products.some((item) => item.id !== productId && item.name.trim() === edit.name.trim())) {
        throw new Error('이미 등록된 제품명입니다.')
      }
      await updateProductMutation(createRepositoryContext(profile, data, setData), productId, {
        name: edit.name.trim(),
        category: edit.category || '자사',
        company_name: edit.companyName.trim() || (edit.category === '자사' ? '자사' : ''),
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
      if (!edit?.name.trim() || !edit.major_category_id) return
      if (
        data.duties.some(
          (item) =>
            item.id !== dutyId &&
            item.major_category_id === edit.major_category_id &&
            item.name.trim() === edit.name.trim(),
        )
      ) {
        throw new Error('같은 대분류에 이미 등록된 업무명입니다.')
      }
      await updateDutyMutation(createRepositoryContext(profile, data, setData), dutyId, {
        name: edit.name.trim(),
        major_category_id: edit.major_category_id,
      })
      setDutyEdits((current) => {
        const next = { ...current }
        delete next[dutyId]
        return next
      })
    }, '업무 카테고리를 수정했습니다.')

  const saveMajorCategoryEdit = (majorCategoryId: string) =>
    mutate(async () => {
      const edit = majorCategoryEdits[majorCategoryId]
      if (!edit?.name.trim()) return
      if (data.dutyMajorCategories.some((item) => item.id !== majorCategoryId && item.name.trim() === edit.name.trim())) {
        throw new Error('이미 등록된 대분류입니다.')
      }
      await updateDutyMajorCategoryMutation(createRepositoryContext(profile, data, setData), majorCategoryId, {
        name: edit.name.trim(),
      })
      setMajorCategoryEdits((current) => {
        const next = { ...current }
        delete next[majorCategoryId]
        return next
      })
    }, '대분류를 수정했습니다.')

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
      setPendingProfileToggle(null)
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
      <div className="delete-confirm expanded">
        <p className="draft-notice">{warning ?? deleteWarnings[table]}</p>
        <p>
          <strong>{itemName}</strong>
        </p>
        <div className="inline-actions">
          <button className="danger compact" onClick={() => void deleteRow(table, id, label)} type="button">
            삭제 확인
          </button>
          <button className="ghost compact" onClick={() => setPendingDelete(null)} type="button">
            취소
          </button>
        </div>
      </div>
    )
  }

  const renderProductMasterCard = (product: AppData['products'][number]) => {
    const assignments = data.productAssignments.filter((assignment) => assignment.product_id === product.id)
    const edit = productEdits[product.id]
    return (
      <article className={assignments.length === 0 ? 'master-card unassigned' : 'master-card'} key={product.id}>
        {edit ? (
          <div className="project-edit-form">
            <label>
              제품명
              <input value={edit.name} onChange={(event) => setProductEdits({ ...productEdits, [product.id]: { ...edit, name: event.target.value } })} />
            </label>
            <label>
              구분
              <select
                value={edit.category}
                onChange={(event) => {
                  const category = event.target.value as ProductCategory
                  setProductEdits({
                    ...productEdits,
                    [product.id]: {
                      ...edit,
                      category,
                      companyName: category === '자사' ? '자사' : edit.companyName === '자사' ? '' : edit.companyName,
                    },
                  })
                }}
              >
                <option value="자사">자사</option>
                <option value="위탁">위탁</option>
              </select>
            </label>
            <label>
              위탁사명
              <input value={edit.companyName} onChange={(event) => setProductEdits({ ...productEdits, [product.id]: { ...edit, companyName: event.target.value } })} />
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
              <div>
                <h3>{product.name}</h3>
                <p>{product.category ?? '자사'} · {product.company_name ?? '회사명 없음'}</p>
              </div>
              <div className="group-actions">
                <button
                  className="ghost compact"
                  onClick={() =>
                    setProductEdits({
                      ...productEdits,
                      [product.id]: {
                        name: product.name,
                        category: product.category ?? '자사',
                        companyName: product.company_name ?? (product.category === '자사' ? '자사' : ''),
                      },
                    })
                  }
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
              {assignments.length === 0 && <span className="pill-warn">배정 필요</span>}
            </div>
          </>
        )}
      </article>
    )
  }

  return (
    <div className="stack">
      <div className="page-intro master-page-heading">
        <span>{viewMeta[masterView].eyebrow}</span>
        <h1>{viewMeta[masterView].title}</h1>
        <p>{viewMeta[masterView].note}</p>
      </div>
      <div className="admin-header master-header">
        {masterView === 'products' && (
          <div className="master-header-actions">
            <button className="primary" onClick={() => setProductRegisterOpen(true)} type="button">
              <Package size={16} />
              제품 등록
            </button>
            <button className="ghost" onClick={() => setProductAssignOpen(true)} type="button">
              <Users size={16} />
              제품 배정
            </button>
          </div>
        )}
        {masterView === 'duties' && (
          <div className="master-header-actions">
            <button className="ghost" onClick={() => setMajorCategoryRegisterOpen(true)} type="button">
              <ClipboardList size={16} />
              대분류 등록
            </button>
            <button
              className="primary"
              onClick={() => {
                setDutyForm((current) => ({
                  ...current,
                  major_category_id: current.major_category_id || data.dutyMajorCategories[0]?.id || '',
                }))
                setDutyRegisterOpen(true)
              }}
              type="button"
            >
              <ClipboardList size={16} />
              업무 등록
            </button>
            <button className="ghost" onClick={() => setDutyAssignOpen(true)} type="button">
              <Users size={16} />
              업무 배정
            </button>
          </div>
        )}
        {masterView === 'invites' && (
          <div className="master-header-actions">
            <button className="primary" onClick={() => setInviteRegisterOpen(true)} type="button">
              <Users size={16} />
              초대 등록
            </button>
          </div>
        )}
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
          <div className="master-product-split">
            <section className="master-product-column">
              <header className="master-product-column-head">
                <h3>자사제품</h3>
                <span>{ownCompanyProducts.length}개</span>
              </header>
              <div className="master-product-list">
                {ownCompanyProducts.map((product) => renderProductMasterCard(product))}
                {ownCompanyProducts.length === 0 && <p className="empty">자사제품이 없습니다.</p>}
              </div>
            </section>
            <section className="master-product-column">
              <header className="master-product-column-head">
                <h3>위탁제품</h3>
                <span>{consignedProducts.length}개</span>
              </header>
              <div className="master-product-list">
                {consignedProducts.map((product) => renderProductMasterCard(product))}
                {consignedProducts.length === 0 && <p className="empty">위탁제품이 없습니다.</p>}
              </div>
            </section>
          </div>
        </>
      )}

      {masterView === 'duties' && (
        <div className="duty-master-table-wrap">
          <table className="duty-master-table">
            <thead>
              <tr>
                <th scope="col">대분류</th>
                <th scope="col">업무</th>
                <th scope="col">담당</th>
                <th scope="col">비고</th>
                <th scope="col">관리</th>
              </tr>
            </thead>
            <tbody>
              {dutyTableGroups.map(({ category, duties: categoryDuties }) => {
                const majorEdit = majorCategoryEdits[category.id]
                const categoryDutyCount = data.duties.filter((duty) => duty.major_category_id === category.id).length
                if (categoryDuties.length === 0) {
                  return (
                    <tr key={category.id}>
                      <td className="major-category-cell">
                        {majorEdit ? (
                          <div className="table-inline-form">
                            <input
                              value={majorEdit.name}
                              onChange={(event) =>
                                setMajorCategoryEdits({ ...majorCategoryEdits, [category.id]: { name: event.target.value } })
                              }
                            />
                            <div className="inline-actions">
                              <button className="primary compact" disabled={!majorEdit.name.trim()} onClick={() => void saveMajorCategoryEdit(category.id)} type="button">
                                <Save size={16} />
                              </button>
                              <button className="ghost compact" onClick={() => setMajorCategoryEdits((current) => { const next = { ...current }; delete next[category.id]; return next })} type="button">
                                취소
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="major-category-cell-content">
                            <strong>{category.name}</strong>
                            <div className="group-actions">
                              <button className="ghost compact" onClick={() => setMajorCategoryEdits({ ...majorCategoryEdits, [category.id]: { name: category.name } })} title="대분류 수정" type="button">
                                <Pencil size={16} />
                              </button>
                              {categoryDutyCount === 0 &&
                                deleteAction('duty_major_categories', category.id, '대분류', category.name, deleteWarnings.duty_major_categories)}
                            </div>
                          </div>
                        )}
                      </td>
                      <td colSpan={4} className="duty-empty-cell">
                        등록된 업무 없음
                      </td>
                    </tr>
                  )
                }

                return categoryDuties.map((duty, index) => {
                  const assignments = data.dutyAssignments.filter((assignment) => assignment.duty_id === duty.id)
                  const edit = dutyEdits[duty.id]
                  const isUnassigned = assignments.length === 0 && !duty.assignee_label
                  return (
                    <tr className={isUnassigned ? 'unassigned-row' : undefined} key={duty.id}>
                      {index === 0 && (
                        <td className="major-category-cell" rowSpan={categoryDuties.length}>
                          {majorEdit ? (
                            <div className="table-inline-form">
                              <input
                                value={majorEdit.name}
                                onChange={(event) =>
                                  setMajorCategoryEdits({ ...majorCategoryEdits, [category.id]: { name: event.target.value } })
                                }
                              />
                              <div className="inline-actions">
                                <button className="primary compact" disabled={!majorEdit.name.trim()} onClick={() => void saveMajorCategoryEdit(category.id)} type="button">
                                  <Save size={16} />
                                </button>
                                <button className="ghost compact" onClick={() => setMajorCategoryEdits((current) => { const next = { ...current }; delete next[category.id]; return next })} type="button">
                                  취소
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div className="major-category-cell-content">
                              <strong>{category.name}</strong>
                              <div className="group-actions">
                                <button className="ghost compact" onClick={() => setMajorCategoryEdits({ ...majorCategoryEdits, [category.id]: { name: category.name } })} title="대분류 수정" type="button">
                                  <Pencil size={16} />
                                </button>
                                {categoryDutyCount === 0 &&
                                  deleteAction('duty_major_categories', category.id, '대분류', category.name, deleteWarnings.duty_major_categories)}
                              </div>
                            </div>
                          )}
                        </td>
                      )}
                      <td>
                        {edit ? (
                          <div className="table-inline-form">
                            <select
                              value={edit.major_category_id}
                              onChange={(event) =>
                                setDutyEdits({ ...dutyEdits, [duty.id]: { ...edit, major_category_id: event.target.value } })
                              }
                            >
                              {data.dutyMajorCategories.map((item) => (
                                <option key={item.id} value={item.id}>
                                  {item.name}
                                </option>
                              ))}
                            </select>
                            <input
                              value={edit.name}
                              onChange={(event) => setDutyEdits({ ...dutyEdits, [duty.id]: { ...edit, name: event.target.value } })}
                            />
                            <div className="inline-actions">
                              <button className="primary compact" disabled={!edit.name.trim()} onClick={() => void saveDutyEdit(duty.id)} type="button">
                                <Save size={16} />
                              </button>
                              <button className="ghost compact" onClick={() => setDutyEdits((current) => { const next = { ...current }; delete next[duty.id]; return next })} type="button">
                                취소
                              </button>
                            </div>
                          </div>
                        ) : (
                          duty.name
                        )}
                      </td>
                      <td>
                        <div className="pill-row compact">
                          {assignments.map((assignment) => (
                            <span key={assignment.id}>{assignment.profiles?.name ?? assignment.user_id}</span>
                          ))}
                          {assignments.length === 0 && duty.assignee_label && <span>{duty.assignee_label}</span>}
                          {isUnassigned && <span className="pill-warn">배정 필요</span>}
                        </div>
                      </td>
                      <td>{duty.notes || '-'}</td>
                      <td>
                        {!edit && (
                          <div className="group-actions">
                            <button
                              className="ghost compact"
                              onClick={() =>
                                setDutyEdits({
                                  ...dutyEdits,
                                  [duty.id]: { name: duty.name, major_category_id: duty.major_category_id },
                                })
                              }
                              title="업무 수정"
                              type="button"
                            >
                              <Pencil size={16} />
                            </button>
                            {deleteAction('duties', duty.id, '업무', duty.name)}
                          </div>
                        )}
                      </td>
                    </tr>
                  )
                })
              })}
            </tbody>
          </table>
          {dutyTableGroups.length === 0 && <p className="empty">등록된 대분류가 없습니다. 먼저 대분류를 등록해 주세요.</p>}
        </div>
      )}

      {masterView === 'invites' && (
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
                          {deleteAction('allowed_users', item.id, '초대', item.email, deleteWarnings.allowed_users)}
                        </div>
                      </div>
                      <div className="inline-actions">
                        <Badge status={linkedProfile ? (isActive ? 'approved' : 'rejected') : 'pending'}>
                          {linkedProfile ? (isActive ? '활성' : '비활성') : '미가입'}
                        </Badge>
                        {linkedProfile &&
                          (pendingProfileToggle?.email === item.email ? (
                            <div className="delete-confirm expanded">
                              <p className="draft-notice">
                                {pendingProfileToggle.nextActive
                                  ? '활성화하면 이 사용자가 다시 앱 데이터에 접근할 수 있습니다.'
                                  : '비활성화하면 이 사용자는 로그인 후 앱 데이터에 접근할 수 없습니다. 기존 배정은 유지됩니다.'}
                              </p>
                              <div className="inline-actions">
                                <button
                                  className="danger compact"
                                  onClick={() => void toggleProfileActive(item.email, pendingProfileToggle.nextActive)}
                                  type="button"
                                >
                                  {pendingProfileToggle.nextActive ? '활성화 확인' : '비활성화 확인'}
                                </button>
                                <button className="ghost compact" onClick={() => setPendingProfileToggle(null)} type="button">
                                  취소
                                </button>
                              </div>
                            </div>
                          ) : (
                            <button
                              className="ghost compact"
                              onClick={() => setPendingProfileToggle({ email: item.email, nextActive: !isActive })}
                              type="button"
                            >
                              {isActive ? '비활성화' : '활성화'}
                            </button>
                          ))}
                      </div>
                      <Badge>{roleLabels[item.role]}</Badge>
                    </>
                  )}
                </article>
              )
            })}
          {filteredAllowedUsers.length === 0 && <p className="empty">등록된 초대 대상이 없습니다.</p>}
        </div>
      )}

      {productRegisterOpen && (
        <div className="modal-backdrop" onMouseDown={() => setProductRegisterOpen(false)} role="presentation">
          <section
            aria-labelledby="product-register-title"
            aria-modal="true"
            className="modal-card master-modal"
            onMouseDown={(event) => event.stopPropagation()}
            role="dialog"
          >
            <header className="modal-header">
              <div className="modal-mark" aria-hidden="true">
                <Package size={18} />
              </div>
              <div>
                <span>제품 마스터</span>
                <h2 id="product-register-title">제품 등록</h2>
              </div>
              <button aria-label="제품 등록 닫기" className="icon-button modal-close" onClick={() => setProductRegisterOpen(false)} type="button">
                <X size={18} />
              </button>
            </header>
            <FormGrid
              fields={
                <>
                  <label>
                    제품명
                    <input value={productForm.name} onChange={(event) => setProductForm({ ...productForm, name: event.target.value })} />
                  </label>
                  <label>
                    구분
                    <select
                      value={productForm.category}
                      onChange={(event) => {
                        const category = event.target.value as ProductCategory
                        setProductForm({
                          ...productForm,
                          category,
                          companyName: category === '자사' ? '자사' : productForm.companyName === '자사' ? '' : productForm.companyName,
                        })
                      }}
                    >
                      <option value="자사">자사</option>
                      <option value="위탁">위탁</option>
                    </select>
                  </label>
                  <label>
                    위탁사명
                    <input value={productForm.companyName} onChange={(event) => setProductForm({ ...productForm, companyName: event.target.value })} />
                  </label>
                </>
              }
              onSubmit={addProduct}
              disabled={!productForm.name.trim()}
              submitLabel="제품 추가"
            />
          </section>
        </div>
      )}

      {productAssignOpen && (
        <div className="modal-backdrop" onMouseDown={() => setProductAssignOpen(false)} role="presentation">
          <section
            aria-labelledby="product-assign-title"
            aria-modal="true"
            className="modal-card master-modal"
            onMouseDown={(event) => event.stopPropagation()}
            role="dialog"
          >
            <header className="modal-header">
              <div className="modal-mark" aria-hidden="true">
                <Users size={18} />
              </div>
              <div>
                <span>제품 마스터</span>
                <h2 id="product-assign-title">제품 배정</h2>
              </div>
              <button aria-label="제품 배정 닫기" className="icon-button modal-close" onClick={() => setProductAssignOpen(false)} type="button">
                <X size={18} />
              </button>
            </header>
            <FormGrid
              fields={
                <>
                  <label>
                    파트원
                    <select
                      value={productAssignment.user_id}
                      onChange={(event) => setProductAssignment({ ...productAssignment, user_id: event.target.value })}
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
                </>
              }
              onSubmit={assignProduct}
              disabled={!productAssignment.user_id || !productAssignment.product_id}
              submitLabel="제품 배정"
            />
          </section>
        </div>
      )}

      {majorCategoryRegisterOpen && (
        <div className="modal-backdrop" onMouseDown={() => setMajorCategoryRegisterOpen(false)} role="presentation">
          <section
            aria-labelledby="major-category-register-title"
            aria-modal="true"
            className="modal-card master-modal"
            onMouseDown={(event) => event.stopPropagation()}
            role="dialog"
          >
            <header className="modal-header">
              <div className="modal-mark" aria-hidden="true">
                <ClipboardList size={18} />
              </div>
              <div>
                <span>업무 마스터</span>
                <h2 id="major-category-register-title">대분류 등록</h2>
              </div>
              <button aria-label="대분류 등록 닫기" className="icon-button modal-close" onClick={() => setMajorCategoryRegisterOpen(false)} type="button">
                <X size={18} />
              </button>
            </header>
            <FormGrid
              fields={
                <label>
                  대분류명
                  <input value={majorCategoryForm.name} onChange={(event) => setMajorCategoryForm({ name: event.target.value })} />
                </label>
              }
              onSubmit={addMajorCategory}
              disabled={!majorCategoryForm.name.trim()}
              submitLabel="대분류 추가"
            />
          </section>
        </div>
      )}

      {dutyRegisterOpen && (
        <div className="modal-backdrop" onMouseDown={() => setDutyRegisterOpen(false)} role="presentation">
          <section
            aria-labelledby="duty-register-title"
            aria-modal="true"
            className="modal-card master-modal"
            onMouseDown={(event) => event.stopPropagation()}
            role="dialog"
          >
            <header className="modal-header">
              <div className="modal-mark" aria-hidden="true">
                <ClipboardList size={18} />
              </div>
              <div>
                <span>업무 마스터</span>
                <h2 id="duty-register-title">업무 등록</h2>
              </div>
              <button aria-label="업무 등록 닫기" className="icon-button modal-close" onClick={() => setDutyRegisterOpen(false)} type="button">
                <X size={18} />
              </button>
            </header>
            <FormGrid
              fields={
                <>
                  <label>
                    대분류
                    <select
                      value={dutyForm.major_category_id}
                      onChange={(event) => setDutyForm({ ...dutyForm, major_category_id: event.target.value })}
                    >
                      <option value="">선택</option>
                      {data.dutyMajorCategories.map((category) => (
                        <option key={category.id} value={category.id}>
                          {category.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    업무명
                    <input value={dutyForm.name} onChange={(event) => setDutyForm({ ...dutyForm, name: event.target.value })} />
                  </label>
                </>
              }
              onSubmit={addDuty}
              disabled={!dutyForm.major_category_id || !dutyForm.name.trim()}
              submitLabel="업무 추가"
            />
          </section>
        </div>
      )}

      {dutyAssignOpen && (
        <div className="modal-backdrop" onMouseDown={() => setDutyAssignOpen(false)} role="presentation">
          <section
            aria-labelledby="duty-assign-title"
            aria-modal="true"
            className="modal-card master-modal"
            onMouseDown={(event) => event.stopPropagation()}
            role="dialog"
          >
            <header className="modal-header">
              <div className="modal-mark" aria-hidden="true">
                <Users size={18} />
              </div>
              <div>
                <span>업무 마스터</span>
                <h2 id="duty-assign-title">업무 배정</h2>
              </div>
              <button aria-label="업무 배정 닫기" className="icon-button modal-close" onClick={() => setDutyAssignOpen(false)} type="button">
                <X size={18} />
              </button>
            </header>
            <FormGrid
              fields={
                <>
                  <label>
                    파트원
                    <select
                      value={dutyAssignment.user_id}
                      onChange={(event) => setDutyAssignment({ ...dutyAssignment, user_id: event.target.value })}
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
                      {dutyTableGroups.map(({ category, duties: categoryDuties }) => (
                        <optgroup key={category.id} label={category.name}>
                          {categoryDuties.map((duty) => (
                            <option key={duty.id} value={duty.id}>
                              {duty.name}
                            </option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                  </label>
                </>
              }
              onSubmit={assignDuty}
              disabled={!dutyAssignment.user_id || !dutyAssignment.duty_id}
              submitLabel="업무 배정"
            />
          </section>
        </div>
      )}

      {inviteRegisterOpen && (
        <div className="modal-backdrop" onMouseDown={() => setInviteRegisterOpen(false)} role="presentation">
          <section
            aria-labelledby="invite-register-title"
            aria-modal="true"
            className="modal-card master-modal"
            onMouseDown={(event) => event.stopPropagation()}
            role="dialog"
          >
            <header className="modal-header">
              <div className="modal-mark" aria-hidden="true">
                <Users size={18} />
              </div>
              <div>
                <span>초대 관리</span>
                <h2 id="invite-register-title">초대 대상 등록</h2>
              </div>
              <button aria-label="초대 등록 닫기" className="icon-button modal-close" onClick={() => setInviteRegisterOpen(false)} type="button">
                <X size={18} />
              </button>
            </header>
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
          </section>
        </div>
      )}
    </div>
  )
}

