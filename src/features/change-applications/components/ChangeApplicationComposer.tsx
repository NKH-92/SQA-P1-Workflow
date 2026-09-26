import { useId, useMemo, useState, type KeyboardEvent } from 'react'
import { AlertTriangle, Check, ChevronLeft, ChevronRight, ClipboardPlus, FileSpreadsheet, Search, Upload } from 'lucide-react'
import { Badge, DateQuickPicks, Modal, ModalCloseButton } from '../../../components/ui'
import { toUserMessage, UserFacingError } from '../../../lib/errors'
import { formatDate, formatDateTime } from '../../../lib/format'
import { selectApplicationTaskContexts, selectChangeScopeProducts } from '../selectors'
import { matchImportedProductNames, uniqueResolvedProductIds, type ProductImportMatch } from '../productImport'
import {
  changeActionKindLabels,
  changeApplicationSourceLabels,
  type ChangeApplicationInput,
} from '../types'
import {
  clearChangeComposerDraft,
  readChangeComposerDraft,
  writeChangeComposerDraft,
  type ChangeComposerForm,
} from '../composerDraft'
import type { AppData, ChangeActionKind, ChangeApplication, ChangeApplicationSource, Profile } from '../../../types'
import { ChangeProductImportReview, type ChangeProductImportMode } from './ChangeProductImportReview'

type ComposerState = ChangeComposerForm

type ProductImportReviewState = {
  fileName: string
  sheetName: string | null
  matches: ProductImportMatch[]
}

type InformationField =
  | 'change_number'
  | 'title'
  | 'summary'
  | 'effective_date'
  | 'custom_kind_name'
  | 'action_content'
  | 'due_date'

/** 화면에 놓인 순서. 오류가 여러 개면 첫 칸으로 포커스를 옮긴다. */
const INFORMATION_FIELD_ORDER: InformationField[] = [
  'change_number',
  'title',
  'summary',
  'effective_date',
  'custom_kind_name',
  'action_content',
  'due_date',
]

const DUE_DATE_QUICK_PICKS = [
  { label: '7일 후', days: 7 },
  { label: '14일 후', days: 14 },
  { label: '30일 후', days: 30 },
]

const emptyForm: ComposerState = {
  changeApplicationId: null,
  expected_updated_at: null,
  change_number: '',
  source: 'official',
  title: '',
  summary: '',
  source_url: null,
  effective_date: '',
  action_kind: 'product_standard',
  custom_kind_name: null,
  action_content: '',
  due_date: '',
}

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

  const form: ComposerState = application
    ? {
        changeApplicationId: application.id,
        expected_updated_at: application.updated_at,
        change_number: application.change_number,
        source: application.source,
        title: application.title,
        summary: application.summary,
        source_url: application.source_url,
        effective_date: application.effective_date ?? '',
        action_kind: actionItem?.kind ?? 'product_standard',
        custom_kind_name: actionItem?.custom_kind_name ?? null,
        action_content: actionItem?.content ?? '',
        due_date: actionItem?.due_date ?? '',
      }
    : emptyForm
  return { form, selected, application: application ?? null }
}

function snapshot(form: ComposerState, selected: Record<string, string | null>) {
  return JSON.stringify([form, Object.entries(selected).sort(([left], [right]) => left.localeCompare(right))])
}

function informationErrors(form: ComposerState, duplicate: ChangeApplication | undefined) {
  const errors: Partial<Record<InformationField, string>> = {}
  if (form.source === 'official' && !form.change_number.trim()) errors.change_number = '공식 변경번호를 입력해 주세요.'
  else if (duplicate) errors.change_number = `이미 등록된 변경번호예요(${duplicate.change_number}). 기존 공통변경을 확인해 주세요.`
  if (!form.title.trim()) errors.title = '변경 제목을 입력해 주세요.'
  if (!form.summary.trim()) errors.summary = '변경 요약을 입력해 주세요.'
  if (!form.effective_date) errors.effective_date = '시행일을 골라 주세요.'
  if (form.action_kind === 'other' && !form.custom_kind_name?.trim()) errors.custom_kind_name = '기타 항목명을 입력해 주세요.'
  if (!form.action_content.trim()) errors.action_content = '적용 내용을 입력해 주세요.'
  if (!form.due_date) errors.due_date = '적용 기한을 골라 주세요.'
  return errors
}

/** 검색 칸·날짜 칸에서 Enter를 눌러도 단계가 넘어가지 않게 한다. 단계 이동은 ‘다음’ 버튼으로만 한다. */
function preventImplicitSubmit(event: KeyboardEvent<HTMLFormElement>) {
  if (event.key !== 'Enter' || event.nativeEvent.isComposing) return
  const target = event.target as HTMLElement
  if (target instanceof HTMLInputElement && !['checkbox', 'radio', 'button', 'submit', 'file'].includes(target.type)) {
    event.preventDefault()
  }
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
  const idBase = useId()
  const fieldId = (field: InformationField) => `${idBase}-${field}`
  const errorId = (field: InformationField) => `${idBase}-${field}-error`
  const productsErrorId = `${idBase}-products-error`
  const [initial] = useState(() => {
    const base = initialComposer(data, editingApplicationId)
    if (editingApplicationId) return { ...base, restoredAt: null as string | null }
    const draft = readChangeComposerDraft(profile.id)
    if (!draft) return { ...base, restoredAt: null as string | null }
    const knownProductIds = new Set([
      ...data.changeProductScope.map((row) => row.product_id),
      ...data.products.map((product) => product.id),
    ])
    const selected = Object.fromEntries(
      Object.entries(draft.selected).filter(([productId]) => knownProductIds.has(productId)),
    )
    return { ...base, form: draft.form, selected, restoredAt: draft.saved_at }
  })
  const published = initial.application?.status === 'published'
  const [form, setForm] = useState(initial.form)
  const [selected, setSelected] = useState<Record<string, string | null>>(initial.selected)
  const [baseline, setBaseline] = useState(() => snapshot(initial.form, initial.selected))
  const [restoredAt, setRestoredAt] = useState(initial.restoredAt)
  const [localSavedAt, setLocalSavedAt] = useState<Date | null>(null)
  const [draftError, setDraftError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('all')
  const [company, setCompany] = useState('all')
  const [assigneeFilter, setAssigneeFilter] = useState('all')
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [showInformationErrors, setShowInformationErrors] = useState(false)
  const [titleOnlyError, setTitleOnlyError] = useState(false)
  const [showProductError, setShowProductError] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [importReview, setImportReview] = useState<ProductImportReviewState | null>(null)
  const [importMode, setImportMode] = useState<ChangeProductImportMode>('add')
  const [excludedImportRows, setExcludedImportRows] = useState<Set<number>>(new Set())
  const [importError, setImportError] = useState<string | null>(null)
  const [isImporting, setIsImporting] = useState(false)

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
  const importedProductIds = importReview
    ? uniqueResolvedProductIds(importReview.matches.filter((match) => !excludedImportRows.has(match.rowNumber)))
    : []
  const importResponsibilityNeededCount = importedProductIds.filter((productId) => {
    if (productId in selected && selected[productId] && activeAssigneeIds.has(selected[productId]!)) return false
    const product = products.find((item) => item.id === productId)
    return product?.assignees.filter((item) => activeAssigneeIds.has(item.id)).length !== 1
  }).length
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
  const currentInformationErrors = informationErrors(form, duplicate)
  const informationComplete = Object.keys(currentInformationErrors).length === 0
  const visibleErrors: Partial<Record<InformationField, string>> = showInformationErrors
    ? currentInformationErrors
    : titleOnlyError && currentInformationErrors.title
      ? { title: '제목을 입력하면 임시저장할 수 있어요.' }
      : {}
  const canSaveServerDraft = informationComplete && selectedProductIds.length > 0
  const canPublish = canSaveServerDraft && invalidResponsibilityCount === 0
  const dirty = snapshot(form, selected) !== baseline || importReview !== null

  const updateForm = (patch: Partial<ComposerState>) => {
    setForm((current) => ({ ...current, ...patch }))
    setLocalSavedAt(null)
    if (patch.title !== undefined && patch.title.trim()) setTitleOnlyError(false)
  }

  const updateSelected = (updater: (current: Record<string, string | null>) => Record<string, string | null>) => {
    setSelected(updater)
    setShowProductError(false)
    setLocalSavedAt(null)
  }

  const focusField = (field: InformationField) => {
    window.setTimeout(() => document.getElementById(fieldId(field))?.focus(), 0)
  }

  const fieldProps = (field: InformationField) => ({
    id: fieldId(field),
    'aria-invalid': visibleErrors[field] ? true : undefined,
    'aria-describedby': visibleErrors[field] ? errorId(field) : undefined,
  })

  const fieldError = (field: InformationField) => visibleErrors[field]
    ? <p className="field-error" id={errorId(field)}>{visibleErrors[field]}</p>
    : null

  const toggleProduct = (productId: string) => {
    updateSelected((current) => {
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
    updateSelected((current) => {
      const next = { ...current }
      for (const productId of ids) {
        if (productId in next) continue
        const product = products.find((item) => item.id === productId)
        next[productId] = product?.assignees.length === 1 ? product.assignees[0].id : null
      }
      return next
    })
  }

  const openProductImport = async (file: File) => {
    setImportError(null)
    setIsImporting(true)
    try {
      const { readChangeProductImportFile } = await import('../productImportFile')
      const result = await readChangeProductImportFile(file)
      if (result.rows.length === 0) throw new UserFacingError('파일에서 제품명을 찾지 못했어요. 제품명 열을 확인해 주세요.')
      setImportReview({
        fileName: result.fileName,
        sheetName: result.sheetName,
        matches: matchImportedProductNames(result.rows, products),
      })
      setExcludedImportRows(new Set())
      setImportMode('add')
    } catch (error) {
      setImportError(toUserMessage(error))
    } finally {
      setIsImporting(false)
    }
  }

  const resolveImportedProduct = (rowNumber: number, productId: string | null) => {
    setImportReview((current) => current ? {
      ...current,
      matches: current.matches.map((match) => match.rowNumber === rowNumber ? { ...match, productId } : match),
    } : null)
  }

  const applyImportedProducts = () => {
    if (!importReview) return
    const ids = uniqueResolvedProductIds(
      importReview.matches.filter((match) => !excludedImportRows.has(match.rowNumber)),
    )
    updateSelected((current) => {
      const next: Record<string, string | null> = importMode === 'replace' ? {} : { ...current }
      for (const productId of ids) {
        if (productId in current) {
          next[productId] = current[productId]
          continue
        }
        const product = products.find((item) => item.id === productId)
        const activeAssignees = product?.assignees.filter((item) => activeAssigneeIds.has(item.id)) ?? []
        next[productId] = activeAssignees.length === 1 ? activeAssignees[0].id : null
      }
      return next
    })
    setImportReview(null)
    setExcludedImportRows(new Set())
  }

  const submit = async (publish: boolean) => {
    if (publish && invalidResponsibilityCount > 0) return
    setSubmitting(true)
    const ok = await onSave({
      ...form,
      source_url: form.source_url?.trim() || null,
      custom_kind_name: form.action_kind === 'other' ? form.custom_kind_name?.trim() || null : null,
      tasks: selectedProductIds.map((productId) => ({
        product_id: productId,
        assignee_id: selected[productId] || null,
      })),
    }, publish)
    setSubmitting(false)
    if (!ok) return
    if (!editingApplicationId) clearChangeComposerDraft(profile.id)
    onClose()
  }

  const showFirstInformationError = () => {
    setShowInformationErrors(true)
    setStep(1)
    const first = INFORMATION_FIELD_ORDER.find((field) => currentInformationErrors[field])
    if (first) focusField(first)
  }

  const goNext = () => {
    if (step === 1) {
      if (!informationComplete) {
        showFirstInformationError()
        return
      }
      setStep(2)
      return
    }
    if (step === 2) {
      if (selectedProductIds.length === 0) {
        setShowProductError(true)
        window.setTimeout(() => document.getElementById(`${idBase}-product-search`)?.focus(), 0)
        return
      }
      setStep(3)
      return
    }
    if (canPublish) void submit(true)
  }

  /** 제목만 있어도 임시저장한다. 서버 초안 조건(변경 정보·제품)이 채워졌으면 서버에 초안으로 저장한다. */
  const saveDraft = () => {
    setDraftError(null)
    if (!form.title.trim()) {
      setTitleOnlyError(true)
      setStep(1)
      focusField('title')
      return
    }
    if (canSaveServerDraft) {
      void submit(false)
      return
    }
    if (editingApplicationId) {
      showFirstInformationError()
      return
    }
    const savedAt = writeChangeComposerDraft(profile.id, { form, selected })
    if (!savedAt) {
      setDraftError('이 브라우저에서는 임시저장을 쓸 수 없어요. 변경 정보와 제품을 모두 채우면 초안으로 저장할 수 있어요.')
      return
    }
    setBaseline(snapshot(form, selected))
    setLocalSavedAt(savedAt)
    setRestoredAt(null)
  }

  const startOver = () => {
    clearChangeComposerDraft(profile.id)
    setForm(emptyForm)
    setSelected({})
    setBaseline(snapshot(emptyForm, {}))
    setRestoredAt(null)
    setLocalSavedAt(null)
    setShowInformationErrors(false)
    setTitleOnlyError(false)
    setShowProductError(false)
    setStep(1)
    focusField('change_number')
  }

  const missingCount = Object.keys(currentInformationErrors).length
  const footerHint = (() => {
    if (draftError) return draftError
    if (localSavedAt) return `이 기기에 임시저장했어요 · ${formatDateTime(localSavedAt.toISOString())}`
    if (step === 1) {
      return showInformationErrors && missingCount > 0
        ? `확인할 항목이 ${missingCount}개 있어요. 칸 아래 안내를 봐 주세요.`
        : '변경 내용과 담당자가 할 조치를 입력해 주세요.'
    }
    if (step === 2) return `${selectedProductIds.length}개 제품 선택 · 담당자 확인 필요 ${invalidResponsibilityCount}개`
    return invalidResponsibilityCount > 0
      ? '모든 제품에 담당자를 정하면 배포할 수 있어요.'
      : published ? '저장하면 담당자 화면에 바로 반영돼요.' : '배포하면 각 제품 담당자의 미적용 목록에 바로 보여요.'
  })()

  const title = editingApplicationId ? '공통변경 수정' : '공통변경 등록'

  return (
    <Modal
      open
      onClose={onClose}
      title={title}
      description="변경 내용은 한 번만 입력하면 돼요. 선택한 제품마다 적용 업무를 만들어요."
      eyebrow={initial.application ? initial.application.change_number : undefined}
      icon={<ClipboardPlus size={18} />}
      className="change-compose-modal"
      closeLabel={`${title} 닫기`}
      dirty={dirty && !submitting}
    >
      <form
        aria-busy={submitting || undefined}
        className="change-compose-form"
        noValidate
        onKeyDown={preventImplicitSubmit}
        onSubmit={(event) => {
          event.preventDefault()
          if (!submitting) goNext()
        }}
      >
        <nav className="change-compose-steps" aria-label="공통변경 등록 단계">
          {([
            [1, '변경 정보'],
            [2, '제품·담당자'],
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
            {restoredAt && step === 1 && (
              <div className="change-compose-restored" role="status">
                <span>이 기기에 임시저장한 내용을 불러왔어요 · {formatDateTime(restoredAt)}</span>
                <button className="ghost compact" onClick={startOver} type="button">새로 쓰기</button>
              </div>
            )}
            <section className="change-compose-section" hidden={step !== 1}>
              <header><span>1</span><div><strong>변경 정보</strong><small>공식 변경관리 원본과 이어지는 공통 정보예요.</small></div></header>
              <div className="form-grid two">
                <label>
                  <span className="field-label">변경 출처</span>
                  <select
                    aria-label="변경 출처"
                    value={form.source}
                    onChange={(event) => updateForm({ source: event.target.value as ChangeApplicationSource })}
                  >
                    {Object.entries(changeApplicationSourceLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                </label>
                <label htmlFor={fieldId('change_number')}>
                  <span className="field-label">
                    변경번호 {form.source === 'official' ? <span aria-hidden="true" className="required">*</span> : <small>비워 두면 자동으로 만들어요</small>}
                  </span>
                  <input
                    {...fieldProps('change_number')}
                    aria-label="변경번호"
                    aria-required={form.source === 'official' || undefined}
                    maxLength={100}
                    placeholder={form.source === 'official' ? 'CC-2026-014' : '비워 두면 자동 생성'}
                    value={form.change_number}
                    onChange={(event) => updateForm({ change_number: event.target.value })}
                  />
                  {fieldError('change_number')}
                </label>
                <label className="wide" htmlFor={fieldId('title')}>
                  <span className="field-label">변경 제목 <span aria-hidden="true" className="required">*</span></span>
                  <input
                    {...fieldProps('title')}
                    aria-label="변경 제목"
                    aria-required="true"
                    maxLength={200}
                    placeholder="예: 원료 제조원 변경"
                    value={form.title}
                    onChange={(event) => updateForm({ title: event.target.value })}
                  />
                  {fieldError('title')}
                </label>
                <label className="wide" htmlFor={fieldId('summary')}>
                  <span className="field-label">변경 요약 <span aria-hidden="true" className="required">*</span></span>
                  <textarea
                    {...fieldProps('summary')}
                    aria-label="변경 요약"
                    aria-required="true"
                    maxLength={5000}
                    placeholder="변경 배경과 핵심 내용을 적어 주세요."
                    value={form.summary}
                    onChange={(event) => updateForm({ summary: event.target.value })}
                  />
                  {fieldError('summary')}
                </label>
                <label>
                  <span className="field-label">공식 문서 링크 <small>선택</small></span>
                  <input aria-label="공식 문서 링크" inputMode="url" placeholder="https://…" value={form.source_url ?? ''} onChange={(event) => updateForm({ source_url: event.target.value })} />
                </label>
                <label htmlFor={fieldId('effective_date')}>
                  <span className="field-label">시행일 <span aria-hidden="true" className="required">*</span></span>
                  <input
                    {...fieldProps('effective_date')}
                    aria-label="시행일"
                    aria-required="true"
                    type="date"
                    value={form.effective_date}
                    onChange={(event) => updateForm({ effective_date: event.target.value })}
                  />
                  {fieldError('effective_date')}
                </label>
              </div>
              {duplicate && (
                <button className="duplicate-warning" onClick={() => onOpenExisting(duplicate.id)} type="button">
                  <AlertTriangle size={16} />
                  <span><strong>이미 등록된 변경번호예요({duplicate.change_number})</strong><small>{duplicate.title} · 기존 공통변경 열기</small></span>
                </button>
              )}
            </section>

            <section className="change-compose-section" hidden={step !== 1}>
              <header><span>1</span><div><strong>적용 내용</strong><small>제품 담당자가 실제로 할 조치 한 가지를 적어 주세요.</small></div></header>
              <div className="form-grid two">
                <label>
                  <span className="field-label">적용 구분</span>
                  <select aria-label="적용 구분" value={form.action_kind} onChange={(event) => updateForm({ action_kind: event.target.value as ChangeActionKind })}>
                    {Object.entries(changeActionKindLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                </label>
                {form.action_kind === 'other' && (
                  <label htmlFor={fieldId('custom_kind_name')}>
                    <span className="field-label">기타 항목명 <span aria-hidden="true" className="required">*</span></span>
                    <input
                      {...fieldProps('custom_kind_name')}
                      aria-label="기타 항목명"
                      aria-required="true"
                      maxLength={100}
                      placeholder="예: ERP, 관리대장"
                      value={form.custom_kind_name ?? ''}
                      onChange={(event) => updateForm({ custom_kind_name: event.target.value })}
                    />
                    {fieldError('custom_kind_name')}
                  </label>
                )}
                <label className="wide" htmlFor={fieldId('action_content')}>
                  <span className="field-label">적용 내용 <span aria-hidden="true" className="required">*</span></span>
                  <textarea
                    {...fieldProps('action_content')}
                    aria-label="적용 내용"
                    aria-required="true"
                    maxLength={5000}
                    placeholder="담당자가 완료해야 하는 조치를 구체적으로 적어 주세요."
                    value={form.action_content}
                    onChange={(event) => updateForm({ action_content: event.target.value })}
                  />
                  {fieldError('action_content')}
                </label>
                <div className="change-compose-due">
                  <label htmlFor={fieldId('due_date')}>
                    <span className="field-label">적용 기한 <span aria-hidden="true" className="required">*</span></span>
                    <input
                      {...fieldProps('due_date')}
                      aria-label="적용 기한"
                      aria-required="true"
                      type="date"
                      value={form.due_date}
                      onChange={(event) => updateForm({ due_date: event.target.value })}
                    />
                  </label>
                  <DateQuickPicks
                    baseDate={form.effective_date || null}
                    caption={form.effective_date ? '시행일 기준' : '오늘 기준 · 시행일을 고르면 시행일 기준으로 바뀌어요'}
                    label="적용 기한 빠른 선택"
                    onSelect={(date) => updateForm({ due_date: date })}
                    options={DUE_DATE_QUICK_PICKS}
                    value={form.due_date}
                  />
                  {fieldError('due_date')}
                </div>
              </div>
            </section>

            <section className="change-compose-section product-scope-section" hidden={step !== 2}>
              <header><span>2</span><div><strong>적용 제품과 담당자</strong><small>제품마다 담당자 한 명을 정해 주세요.</small></div><Badge>{selectedProductIds.length}개 선택</Badge></header>
              {showProductError && selectedProductIds.length === 0 && (
                <p className="field-error" id={productsErrorId}>적용할 제품을 한 개 이상 골라 주세요.</p>
              )}
              {importError && <p className="change-import-error" role="alert"><AlertTriangle size={16} />{importError}</p>}
              {importReview ? (
                <ChangeProductImportReview
                  excludedRows={excludedImportRows}
                  fileName={importReview.fileName}
                  matches={importReview.matches}
                  mode={importMode}
                  products={products}
                  responsibilityNeededCount={importResponsibilityNeededCount}
                  sheetName={importReview.sheetName}
                  onApply={applyImportedProducts}
                  onCancel={() => { setImportReview(null); setExcludedImportRows(new Set()) }}
                  onExclude={(rowNumber) => setExcludedImportRows((current) => new Set(current).add(rowNumber))}
                  onModeChange={setImportMode}
                  onResolve={resolveImportedProduct}
                  onRestore={(rowNumber) => setExcludedImportRows((current) => {
                    const next = new Set(current)
                    next.delete(rowNumber)
                    return next
                  })}
                />
              ) : (
                <>
                  <div
                    className="change-import-entry"
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={(event) => {
                      event.preventDefault()
                      const file = event.dataTransfer.files[0]
                      if (file) void openProductImport(file)
                    }}
                  >
                    <FileSpreadsheet size={22} />
                    <span><strong>Excel로 제품 한 번에 고르기</strong><small>.xlsx 또는 .csv · 최대 1,000개 · 공백과 mg/밀리그램 같은 표기 차이는 자동으로 맞춰요</small></span>
                    <label className="ghost">
                      <Upload size={15} /> {isImporting ? '읽는 중…' : '파일 선택'}
                      <input
                        accept=".xlsx,.csv"
                        aria-label="적용 제품 Excel 파일 선택"
                        disabled={isImporting}
                        onChange={(event) => {
                          const file = event.target.files?.[0]
                          event.target.value = ''
                          if (file) void openProductImport(file)
                        }}
                        type="file"
                      />
                    </label>
                    <a className="ghost" download href="/change-application-products-template.xlsx">양식 받기</a>
                  </div>
                  <div className="scope-toolbar">
                    <label className="scope-search">
                      <Search size={15} />
                      <input
                        aria-describedby={showProductError && selectedProductIds.length === 0 ? productsErrorId : undefined}
                        aria-label="제품명 검색"
                        id={`${idBase}-product-search`}
                        placeholder="제품명 또는 회사 검색"
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                        onKeyDown={(event) => {
                          // Enter는 검색에만 쓴다. 단계는 넘어가지 않는다.
                          if (event.key === 'Enter') event.preventDefault()
                        }}
                      />
                    </label>
                    <select aria-label="제품 구분" value={category} onChange={(event) => setCategory(event.target.value)}><option value="all">구분 전체</option><option value="자사">자사</option><option value="위탁">위탁</option></select>
                    <select aria-label="회사" value={company} onChange={(event) => setCompany(event.target.value)}><option value="all">회사 전체</option>{companies.map((value) => <option key={value} value={value}>{value}</option>)}</select>
                    <select aria-label="제품 담당자" value={assigneeFilter} onChange={(event) => setAssigneeFilter(event.target.value)}><option value="all">담당자 전체</option>{data.changeAssigneeOptions.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
                  </div>
                  <div className="scope-quick-actions">
                    <button onClick={() => selectProducts(products.filter((product) => product.assignees.some((item) => item.id === profile.id)).map((product) => product.id))} type="button">내 담당 제품 선택</button>
                    <button onClick={() => selectProducts(products.filter((product) => product.category === '자사').map((product) => product.id))} type="button">자사제품 선택</button>
                    <button onClick={() => selectProducts(products.filter((product) => product.category === '위탁').map((product) => product.id))} type="button">위탁제품 선택</button>
                    <button onClick={() => allVisibleSelected ? updateSelected((current) => { const next = { ...current }; visibleProducts.forEach((product) => delete next[product.id]); return next }) : selectProducts(visibleProducts.map((product) => product.id))} type="button">
                      {allVisibleSelected ? '검색 결과 선택 해제' : `검색 결과 전체 ${visibleProducts.length}개 선택`}
                    </button>
                  </div>
                  <div className="scope-list" role="list" aria-label="적용 제품 선택 목록">
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
                          <span className="scope-current-owner">현재 {product.assignees.map((item) => item.name).join(', ') || '담당자 없음'}</span>
                          {isSelected && (
                            <select aria-label={`${product.name} 적용 담당자`} value={selected[product.id] ?? ''} onChange={(event) => updateSelected((current) => ({ ...current, [product.id]: event.target.value || null }))}>
                              <option value="">담당자 없음</option>
                              {responsibilityOptions.filter((item) => activeAssigneeIds.has(item.id)).map((item) => <option key={item.id} value={item.id}>{item.name}{'role' in item && item.role === 'leader' ? ' (파트장)' : ''}</option>)}
                            </select>
                          )}
                        </div>
                      )
                    })}
                    {visibleProducts.length === 0 && <p className="scope-empty">조건에 맞는 제품이 없어요. 검색어나 구분을 바꿔 보세요.</p>}
                  </div>
                </>
              )}
            </section>

            <section className="change-compose-section change-compose-review" hidden={step !== 3}>
              <header><span>3</span><div><strong>최종 검토·배포</strong><small>선택한 제품과 담당자를 마지막으로 확인해 주세요.</small></div></header>
              <div className="change-review-summary">
                <article><span>변경번호</span><strong>{form.change_number.trim() || '자동 생성'}</strong><small>{form.title}</small></article>
                <article><span>적용 제품</span><strong>{selectedProductIds.length}개</strong><small>적용 기한 {formatDate(form.due_date)}</small></article>
                <article data-warning={invalidResponsibilityCount > 0}><span>담당자 확인 필요</span><strong>{invalidResponsibilityCount}개</strong><small>{invalidResponsibilityCount > 0 ? '배포하기 전에 담당자를 정해 주세요.' : '모든 제품에 담당자를 정했어요'}</small></article>
              </div>
              <div className="change-review-assignees">
                <h3>담당자별 제품</h3>
                {data.changeAssigneeOptions.filter((assignee) => selectedProductIds.some((productId) => selected[productId] === assignee.id)).map((assignee) => {
                  const assignedProducts = selectedProductIds
                    .filter((productId) => selected[productId] === assignee.id)
                    .map((productId) => products.find((product) => product.id === productId)?.name)
                    .filter(Boolean)
                  return <div key={assignee.id}><strong>{assignee.name}</strong><span>{assignedProducts.join(', ')}</span><Badge>{assignedProducts.length}개</Badge></div>
                })}
                {invalidResponsibilityCount > 0 && <button className="duplicate-warning" onClick={() => setStep(2)} type="button"><AlertTriangle size={16} /><span><strong>담당자를 정해야 하는 제품 {invalidResponsibilityCount}개</strong><small>제품·담당자 단계로 돌아가 정해 주세요.</small></span></button>}
              </div>
            </section>
          </div>

          <aside className="change-compose-preview" hidden={step !== 3}>
            <span>배포 점검</span>
            <h3 data-code={form.change_number.trim() ? '' : undefined}>{form.change_number.trim() || (form.source === 'official' ? '변경번호를 입력해 주세요' : '번호는 자동으로 만들어요')}</h3>
            <p>{form.title.trim() || '제목을 아직 입력하지 않았어요.'}</p>
            <dl>
              <div><dt>적용 항목</dt><dd>{changeActionKindLabels[form.action_kind]}{form.action_kind === 'other' && form.custom_kind_name ? ` · ${form.custom_kind_name}` : ''}</dd></div>
              <div><dt>적용 제품</dt><dd>{selectedProductIds.length}개</dd></div>
              <div><dt>담당자 정함</dt><dd>{selectedProductIds.length - invalidResponsibilityCount}개</dd></div>
              <div data-warning={invalidResponsibilityCount > 0}><dt>담당자 확인 필요</dt><dd>{invalidResponsibilityCount}개</dd></div>
              <div><dt>적용 기한</dt><dd>{form.due_date ? formatDate(form.due_date) : '-'}</dd></div>
            </dl>
            {invalidResponsibilityCount > 0 && <p className="preview-warning"><AlertTriangle size={15} /> 모든 제품에 활성 담당자를 정하면 배포할 수 있어요.</p>}
            <p className="preview-note">담당자를 정하지 않아도 임시저장할 수 있어요. 배포하려면 모든 제품에 담당자가 한 명씩 있어야 해요.</p>
          </aside>
        </div>

        <footer className="modal-footer dialog-actions change-compose-footer">
          <p className="dialog-actions-hint" role={draftError ? 'alert' : undefined}>{footerHint}</p>
          <div>
            <ModalCloseButton onClose={onClose} />
            {!published && <button className="ghost" disabled={submitting} onClick={saveDraft} type="button">임시저장</button>}
            {step > 1 && <button className="ghost" onClick={() => setStep(step === 3 ? 2 : 1)} type="button"><ChevronLeft size={15} />이전</button>}
            {step < 3 ? (
              <button className="primary" disabled={submitting} type="submit">다음<ChevronRight size={15} /></button>
            ) : (
              <button className="primary" disabled={submitting || !canPublish} type="submit">
                {submitting ? '저장하는 중…' : published ? '변경 내용 저장하기' : `${selectedProductIds.length}개 제품에 배포하기`}
              </button>
            )}
          </div>
        </footer>
      </form>
    </Modal>
  )
}
