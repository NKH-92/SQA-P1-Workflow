import { useMemo, useState } from 'react'
import { AlertTriangle, Check, ChevronLeft, ChevronRight, ClipboardPlus, Search } from 'lucide-react'
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
  const [step, setStep] = useState<1 | 2 | 3>(1)

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
  const activeAssigneeIds = new Set(
    data.profiles.filter((item) => item.is_active !== false).map((item) => item.id),
  )
  const invalidResponsibilityCount = selectedProductIds.filter(
    (productId) => !selected[productId] || !activeAssigneeIds.has(selected[productId]!),
  ).length
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
    if (publish && invalidResponsibilityCount > 0) return
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

  const canContinueInformation = Boolean(
    form.title.trim()
    && form.summary.trim()
    && form.action_content.trim()
    && form.effective_date
    && form.due_date
    && (form.source !== 'official' || form.change_number.trim())
    && (form.action_kind !== 'other' || form.custom_kind_name?.trim()),
  ) && !duplicate
  const canSaveDraft = canContinueInformation && selectedProductIds.length > 0
  const canPublish = canSaveDraft && invalidResponsibilityCount === 0

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
          if (step === 1 && canContinueInformation) {
            setStep(2)
            return
          }
          if (step === 2 && selectedProductIds.length > 0) {
            setStep(3)
            return
          }
          if (step === 3 && canPublish) void submit(true)
        }}
      >
        <nav className="change-compose-steps" aria-label="공통변경 등록 단계">
          {([
            [1, '변경 정보'],
            [2, '제품·책임자'],
            [3, '최종 검토·배포'],
          ] as const).map(([value, label]) => (
            <button
              aria-current={step === value ? 'step' : undefined}
              className={step === value ? 'current' : step > value ? 'complete' : ''}
              disabled={value > step}
              key={value}
              onClick={() => setStep(value)}
              type="button"
            >
              <span>{step > value ? <Check size={13} /> : value}</span>{label}
            </button>
          ))}
        </nav>
        <div className="change-compose-body" data-step={step}>
          <div className="change-compose-main">
            <section className="change-compose-section" hidden={step !== 1}>
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

            <section className="change-compose-section" hidden={step !== 1}>
              <header><span>1</span><div><strong>적용 내용</strong><small>제품 담당자가 실제로 수행할 한 가지 조치</small></div></header>
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

            <section className="change-compose-section product-scope-section" hidden={step !== 2}>
              <header><span>2</span><div><strong>적용제품과 책임자</strong><small>제품마다 활성 책임자 한 명을 선택합니다.</small></div><Badge>{selectedProductIds.length}개 선택</Badge></header>
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
                          {responsibilityOptions.filter((item) => activeAssigneeIds.has(item.id)).map((item) => <option key={item.id} value={item.id}>{item.name}{'role' in item && item.role === 'leader' ? ' (파트장)' : ''}</option>)}
                        </select>
                      )}
                    </div>
                  )
                })}
                {visibleProducts.length === 0 && <p className="scope-empty">조건에 맞는 제품이 없습니다.</p>}
              </div>
            </section>

            <section className="change-compose-section change-compose-review" hidden={step !== 3}>
              <header><span>3</span><div><strong>최종 검토·배포</strong><small>선택 범위와 책임자 배정을 마지막으로 확인합니다.</small></div></header>
              <div className="change-review-summary">
                <article><span>변경번호</span><strong>{form.change_number.trim() || '자동 생성'}</strong><small>{form.title}</small></article>
                <article><span>적용제품</span><strong>{selectedProductIds.length}개</strong><small>적용기한 {form.due_date}</small></article>
                <article data-warning={invalidResponsibilityCount > 0}><span>책임자 확인 필요</span><strong>{invalidResponsibilityCount}개</strong><small>{invalidResponsibilityCount > 0 ? '배포 전에 책임자를 지정하세요.' : '모든 제품에 활성 책임자 지정 완료'}</small></article>
              </div>
              <div className="change-review-assignees">
                <h4>책임자별 제품</h4>
                {data.changeAssigneeOptions.filter((assignee) => selectedProductIds.some((productId) => selected[productId] === assignee.id)).map((assignee) => {
                  const assignedProducts = selectedProductIds
                    .filter((productId) => selected[productId] === assignee.id)
                    .map((productId) => products.find((product) => product.id === productId)?.name)
                    .filter(Boolean)
                  return <div key={assignee.id}><strong>{assignee.name}</strong><span>{assignedProducts.join(', ')}</span><Badge>{assignedProducts.length}개</Badge></div>
                })}
                {invalidResponsibilityCount > 0 && <button className="duplicate-warning" onClick={() => setStep(2)} type="button"><AlertTriangle size={16} /><span><strong>책임자 확인이 필요한 제품 {invalidResponsibilityCount}개</strong><small>제품·책임자 단계로 돌아가 수정하세요.</small></span></button>}
              </div>
            </section>
          </div>

          <aside className="change-compose-preview" hidden={step !== 3}>
            <span>배포 점검</span>
            <h3>{form.change_number.trim() || (form.source === 'official' ? '변경번호 미입력' : '번호 자동 생성')}</h3>
            <p>{form.title.trim() || '변경 제목을 입력하세요.'}</p>
            <dl>
              <div><dt>적용 항목</dt><dd>{changeActionKindLabels[form.action_kind]}{form.action_kind === 'other' && form.custom_kind_name ? ` · ${form.custom_kind_name}` : ''}</dd></div>
              <div><dt>적용제품</dt><dd>{selectedProductIds.length}개</dd></div>
              <div><dt>책임자 지정 완료</dt><dd>{selectedProductIds.length - invalidResponsibilityCount}개</dd></div>
              <div data-warning={invalidResponsibilityCount > 0}><dt>책임자 확인 필요</dt><dd>{invalidResponsibilityCount}개</dd></div>
              <div><dt>적용기한</dt><dd>{form.due_date || '-'}</dd></div>
            </dl>
            {invalidResponsibilityCount > 0 && <p className="preview-warning"><AlertTriangle size={15} /> 담당 미지정 또는 비활성 책임자가 있으면 배포할 수 없습니다.</p>}
            <p className="preview-note">초안은 미지정 상태로 저장할 수 있지만 배포 시 모든 제품에 활성 책임자 한 명이 필요합니다.</p>
          </aside>
        </div>

        <footer className="modal-footer change-compose-footer">
          <span>{step === 1 ? '변경 내용과 담당자가 수행할 조치를 입력합니다.' : step === 2 ? `${selectedProductIds.length}개 제품 선택 · 책임자 확인 필요 ${invalidResponsibilityCount}개` : '배포 후 각 제품 책임자의 내 미적용 목록에 표시됩니다.'}</span>
          <div>
            <button className="ghost" onClick={onClose} type="button">닫기</button>
            {!initial.published && <button className="ghost" disabled={!canSaveDraft} onClick={() => void submit(false)} type="button">초안 저장</button>}
            {step > 1 && <button className="ghost" onClick={() => setStep(step === 3 ? 2 : 1)} type="button"><ChevronLeft size={15} />이전</button>}
            {step < 3 ? (
              <button className="primary" disabled={step === 1 ? !canContinueInformation : selectedProductIds.length === 0} type="submit">다음<ChevronRight size={15} /></button>
            ) : (
              <button className="primary" disabled={!canPublish} type="submit">{initial.published ? '변경내용 저장' : `${selectedProductIds.length}개 제품에 배포`}</button>
            )}
          </div>
        </footer>
      </form>
    </Modal>
  )
}
