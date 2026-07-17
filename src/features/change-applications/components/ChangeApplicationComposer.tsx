import { useMemo, useState } from 'react'
import { AlertTriangle, Check, ClipboardPlus, Search } from 'lucide-react'
import { Badge, Modal } from '../../../components/ui'
import { selectApplicationTaskContexts, selectChangeScopeProducts } from '../selectors'
import {
  changeActionKindLabels,
  changeApplicationSourceLabels,
  type ChangeApplicationInput,
} from '../types'
import type { AppData, ChangeActionKind, ChangeApplicationSource, Profile } from '../../../types'

type ComposerState = Omit<ChangeApplicationInput, 'tasks'>

function initialComposer(data: AppData, editingApplicationId: string | null) {
  const application = editingApplicationId
    ? data.changeApplications.find((item) => item.id === editingApplicationId)
    : null
  const actionItem = application
    ? data.changeActionItems
        .filter((item) => item.change_application_id === application.id)
        .sort((left, right) => left.sort_order - right.sort_order)[0]
    : null
  const contexts = application ? selectApplicationTaskContexts(data, application.id) : []
  const selected = Object.fromEntries(
    contexts
      .filter(({ task }) => task.status !== 'cancelled')
      .map(({ task }) => [task.product_id, task.assignee_id]),
  ) as Record<string, string | null>

  const form: ComposerState = {
    changeApplicationId: application?.id ?? null,
    expected_updated_at: application?.updated_at ?? null,
    change_number: application?.change_number ?? '',
    source: application?.source ?? 'official',
    title: application?.title ?? '',
    summary: application?.summary ?? '',
    source_url: application?.source_url ?? null,
    effective_date: application?.effective_date ?? '',
    action_kind: actionItem?.kind ?? 'product_standard',
    custom_kind_name: actionItem?.custom_kind_name ?? null,
    action_content: actionItem?.content ?? '',
    due_date: actionItem?.due_date ?? '',
  }
  return { form, selected, published: application?.status === 'published' }
}

export function ChangeApplicationComposer({
  data,
  profile,
  editingApplicationId,
  onClose,
  onSave,
  onOpenExisting,
}: {
  data: AppData
  profile: Profile
  editingApplicationId: string | null
  onClose: () => void
  onSave: (input: ChangeApplicationInput, publish: boolean) => Promise<boolean>
  onOpenExisting: (applicationId: string) => void
}) {
  const initial = initialComposer(data, editingApplicationId)
  const [form, setForm] = useState(initial.form)
  const [selected, setSelected] = useState<Record<string, string | null>>(initial.selected)
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('all')
  const [company, setCompany] = useState('all')
  const [assigneeFilter, setAssigneeFilter] = useState('all')

  const products = useMemo(() => selectChangeScopeProducts(data), [data])
  const companies = useMemo(
    () => [...new Set(products.map((product) => product.companyName).filter((value): value is string => Boolean(value)))].sort((a, b) => a.localeCompare(b, 'ko')),
    [products],
  )
  const visibleProducts = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    return products.filter((product) => {
      if (normalized && !`${product.name} ${product.companyName ?? ''}`.toLowerCase().includes(normalized)) return false
      if (category !== 'all' && product.category !== category) return false
      if (company !== 'all' && product.companyName !== company) return false
      if (assigneeFilter !== 'all' && !product.assignees.some((item) => item.id === assigneeFilter)) return false
      return true
    })
  }, [assigneeFilter, category, company, products, query])

  const selectedProductIds = Object.keys(selected)
  const unassignedCount = selectedProductIds.filter((productId) => !selected[productId]).length
  const multipleOwnerCount = selectedProductIds.filter((productId) => {
    const product = products.find((item) => item.id === productId)
    return product && product.assignees.length > 1 && !selected[productId]
  }).length
  const duplicate = data.changeApplications.find(
    (item) =>
      item.id !== editingApplicationId
      && Boolean(form.change_number.trim())
      && item.change_number.trim().toUpperCase() === form.change_number.trim().toUpperCase(),
  )
  const allVisibleSelected = visibleProducts.length > 0 && visibleProducts.every((product) => product.id in selected)

  const toggleProduct = (productId: string) => {
    setSelected((current) => {
      const next = { ...current }
      if (productId in next) {
        delete next[productId]
      } else {
        const product = products.find((item) => item.id === productId)
        next[productId] = product?.assignees.length === 1 ? product.assignees[0].id : null
      }
      return next
    })
  }

  const selectProducts = (ids: string[]) => {
    setSelected((current) => {
      const next = { ...current }
      for (const productId of ids) {
        if (productId in next) continue
        const product = products.find((item) => item.id === productId)
        next[productId] = product?.assignees.length === 1 ? product.assignees[0].id : null
      }
      return next
    })
  }

  const submit = async (publish: boolean) => {
    const ok = await onSave({
      ...form,
      source_url: form.source_url?.trim() || null,
      custom_kind_name: form.action_kind === 'other' ? form.custom_kind_name?.trim() || null : null,
      tasks: selectedProductIds.map((productId) => ({
        product_id: productId,
        assignee_id: selected[productId] || null,
      })),
    }, publish)
    if (ok) onClose()
  }

  const canSubmit = Boolean(
    form.title.trim()
    && form.summary.trim()
    && form.action_content.trim()
    && form.effective_date
    && form.due_date
    && selectedProductIds.length > 0
    && (form.source !== 'official' || form.change_number.trim())
    && (form.action_kind !== 'other' || form.custom_kind_name?.trim()),
  ) && !duplicate

  return (
    <Modal
      open
      onClose={onClose}
      title={editingApplicationId ? '변경 적용업무 수정' : '변경 적용업무 등록'}
      description="변경 공통정보는 한 번만 저장하고, 선택한 제품마다 실행 업무를 만듭니다."
      eyebrow={editingApplicationId ? '변경건 편집' : '신규 변경건'}
      icon={<ClipboardPlus size={18} />}
      className="change-compose-modal"
      closeLabel="변경 적용업무 등록 닫기"
    >
      <form
        className="change-compose-form"
        onSubmit={(event) => {
          event.preventDefault()
          if (canSubmit) void submit(true)
        }}
      >
        <div className="change-compose-body">
          <div className="change-compose-main">
            <section className="change-compose-section">
              <header><span>1</span><div><strong>변경정보</strong><small>공식 변경관리 원본과 연결되는 공통 정보</small></div></header>
              <div className="form-grid two">
                <label>
                  변경 출처
                  <select
                    aria-label="변경 출처"
                    value={form.source}
                    onChange={(event) => setForm({ ...form, source: event.target.value as ChangeApplicationSource })}
                  >
                    {Object.entries(changeApplicationSourceLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                </label>
                <label>
                  변경번호 {form.source === 'official' ? <span className="required">*</span> : <small>비우면 자동 생성</small>}
                  <input
                    aria-label="변경번호"
                    maxLength={100}
                    placeholder={form.source === 'official' ? 'CC-2026-014' : '자동 생성 가능'}
                    value={form.change_number}
                    onChange={(event) => setForm({ ...form, change_number: event.target.value })}
                  />
                </label>
                <label className="wide">
                  변경 제목 <span className="required">*</span>
                  <input aria-label="변경 제목" maxLength={200} placeholder="예: 원료 제조원 변경" value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} />
                </label>
                <label className="wide">
                  변경 요약 <span className="required">*</span>
                  <textarea aria-label="변경 요약" maxLength={5000} placeholder="변경 배경과 핵심 내용을 적어주세요." value={form.summary} onChange={(event) => setForm({ ...form, summary: event.target.value })} />
                </label>
                <label>
                  공식 문서 링크
                  <input aria-label="공식 문서 링크" inputMode="url" placeholder="https://..." value={form.source_url ?? ''} onChange={(event) => setForm({ ...form, source_url: event.target.value })} />
                </label>
                <label>
                  시행일 <span className="required">*</span>
                  <input aria-label="시행일" type="date" value={form.effective_date} onChange={(event) => setForm({ ...form, effective_date: event.target.value })} />
                </label>
              </div>
              {duplicate && (
                <button className="duplicate-warning" onClick={() => onOpenExisting(duplicate.id)} type="button">
                  <AlertTriangle size={16} />
                  <span><strong>{duplicate.change_number}는 이미 등록되어 있습니다.</strong><small>{duplicate.title} · 기존 변경건 열기</small></span>
                </button>
              )}
            </section>

            <section className="change-compose-section">
              <header><span>2</span><div><strong>적용 항목</strong><small>제품 담당자가 실제로 수행할 한 가지 조치</small></div></header>
              <div className="form-grid two">
                <label>
                  적용 구분
                  <select aria-label="적용 구분" value={form.action_kind} onChange={(event) => setForm({ ...form, action_kind: event.target.value as ChangeActionKind })}>
                    {Object.entries(changeActionKindLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                </label>
                {form.action_kind === 'other' && (
                  <label>
                    기타 항목명 <span className="required">*</span>
                    <input aria-label="기타 항목명" maxLength={100} placeholder="예: ERP, 관리대장" value={form.custom_kind_name ?? ''} onChange={(event) => setForm({ ...form, custom_kind_name: event.target.value })} />
                  </label>
                )}
                <label className="wide">
                  적용 내용 <span className="required">*</span>
                  <textarea aria-label="적용 내용" maxLength={5000} placeholder="담당자가 완료해야 하는 조치를 구체적으로 적어주세요." value={form.action_content} onChange={(event) => setForm({ ...form, action_content: event.target.value })} />
                </label>
                <label>
                  적용기한 <span className="required">*</span>
                  <input aria-label="적용기한" type="date" value={form.due_date} onChange={(event) => setForm({ ...form, due_date: event.target.value })} />
                </label>
              </div>
            </section>

            <section className="change-compose-section product-scope-section">
              <header><span>3</span><div><strong>적용제품과 책임자</strong><small>검색 결과 전체 선택과 제품별 단일 책임자 확인</small></div><Badge>{selectedProductIds.length}개 선택</Badge></header>
              <div className="scope-toolbar">
                <label className="scope-search"><Search size={15} /><input aria-label="제품명 검색" placeholder="제품명 또는 회사 검색" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
                <select aria-label="제품 구분" value={category} onChange={(event) => setCategory(event.target.value)}><option value="all">구분 전체</option><option value="자사">자사</option><option value="위탁">위탁</option></select>
                <select aria-label="회사" value={company} onChange={(event) => setCompany(event.target.value)}><option value="all">회사 전체</option>{companies.map((value) => <option key={value} value={value}>{value}</option>)}</select>
                <select aria-label="제품 담당자" value={assigneeFilter} onChange={(event) => setAssigneeFilter(event.target.value)}><option value="all">담당자 전체</option>{data.changeAssigneeOptions.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
              </div>
              <div className="scope-quick-actions">
                <button onClick={() => selectProducts(products.filter((product) => product.assignees.some((item) => item.id === profile.id)).map((product) => product.id))} type="button">내 담당제품</button>
                <button onClick={() => selectProducts(products.filter((product) => product.category === '자사').map((product) => product.id))} type="button">자사제품</button>
                <button onClick={() => selectProducts(products.filter((product) => product.category === '위탁').map((product) => product.id))} type="button">위탁제품</button>
                <button onClick={() => allVisibleSelected ? setSelected((current) => { const next = { ...current }; visibleProducts.forEach((product) => delete next[product.id]); return next }) : selectProducts(visibleProducts.map((product) => product.id))} type="button">
                  {allVisibleSelected ? '검색결과 선택 해제' : `검색결과 전체 ${visibleProducts.length}개 선택`}
                </button>
              </div>
              <div className="scope-list" role="list" aria-label="적용제품 선택 목록">
                {visibleProducts.map((product) => {
                  const isSelected = product.id in selected
                  const responsibilityOptions = product.assignees.length > 0
                    ? product.assignees
                    : data.changeAssigneeOptions
                  return (
                    <div className={isSelected ? 'scope-product selected' : 'scope-product'} key={product.id} role="listitem">
                      <button aria-pressed={isSelected} className="scope-product-toggle" onClick={() => toggleProduct(product.id)} type="button">
                        <span className="scope-check">{isSelected && <Check size={13} />}</span>
                        <span><strong>{product.name}</strong><small>{[product.category, product.companyName].filter(Boolean).join(' · ') || '구분 없음'}</small></span>
                      </button>
                      <span className="scope-current-owner">현재 {product.assignees.map((item) => item.name).join(', ') || '담당자 미지정'}</span>
                      {isSelected && (
                        <select aria-label={`${product.name} 적용 책임자`} value={selected[product.id] ?? ''} onChange={(event) => setSelected((current) => ({ ...current, [product.id]: event.target.value || null }))}>
                          <option value="">담당 미지정</option>
                          {responsibilityOptions.map((item) => <option key={item.id} value={item.id}>{item.name}{'role' in item && item.role === 'leader' ? ' (파트장)' : ''}</option>)}
                        </select>
                      )}
                    </div>
                  )
                })}
                {visibleProducts.length === 0 && <p className="scope-empty">조건에 맞는 제품이 없습니다.</p>}
              </div>
            </section>
          </div>

          <aside className="change-compose-preview">
            <span>등록 미리보기</span>
            <h3>{form.change_number.trim() || (form.source === 'official' ? '변경번호 미입력' : '번호 자동 생성')}</h3>
            <p>{form.title.trim() || '변경 제목을 입력하세요.'}</p>
            <dl>
              <div><dt>적용 항목</dt><dd>{changeActionKindLabels[form.action_kind]}{form.action_kind === 'other' && form.custom_kind_name ? ` · ${form.custom_kind_name}` : ''}</dd></div>
              <div><dt>적용제품</dt><dd>{selectedProductIds.length}개</dd></div>
              <div><dt>자동·지정 완료</dt><dd>{selectedProductIds.length - unassignedCount}개</dd></div>
              <div data-warning={unassignedCount > 0}><dt>담당 미지정</dt><dd>{unassignedCount}개</dd></div>
              <div data-warning={multipleOwnerCount > 0}><dt>복수 담당 확인</dt><dd>{multipleOwnerCount}개</dd></div>
              <div><dt>적용기한</dt><dd>{form.due_date || '-'}</dd></div>
            </dl>
            {unassignedCount > 0 && <p className="preview-warning"><AlertTriangle size={15} /> 담당 미지정 업무는 등록되며 파트장 큐에 즉시 표시됩니다.</p>}
            <p className="preview-note">등록 당시 책임자를 별도로 저장하므로 이후 제품 담당자가 바뀌어도 이력이 조용히 변경되지 않습니다.</p>
          </aside>
        </div>

        <footer className="modal-footer change-compose-footer">
          <span>한 번의 저장으로 변경건·적용 항목·제품별 업무를 함께 처리합니다.</span>
          <div>
            <button className="ghost" onClick={onClose} type="button">닫기</button>
            {!initial.published && <button className="ghost" disabled={!canSubmit} onClick={() => void submit(false)} type="button">초안 저장</button>}
            <button className="primary" disabled={!canSubmit} type="submit">{initial.published ? '변경내용 저장' : `${selectedProductIds.length}개 적용업무 등록`}</button>
          </div>
        </footer>
      </form>
    </Modal>
  )
}
