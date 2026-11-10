import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Download, Printer } from 'lucide-react'
import { FormGrid, Modal } from '../../../components/ui'
import { businessDateKey } from '../../../lib/businessTime'
import { downloadCsv } from '../../../lib/csv'
import type { DutyReportRow } from './dutyRows'

export type DutyReportTarget = {
  kind: 'print' | 'csv'
  all: DutyReportRow[]
  filtered: DutyReportRow[]
}

function DutyReport({ title, date, scope, rows }: {
  title: string; date: string; scope: string; rows: DutyReportRow[]
}) {
  return (
    <article className="duty-report-sheet">
      <header>
        <h2>{title}</h2>
        <p>기준일 {date} (KST) · {scope} · 업무 {rows.length}건</p>
      </header>
      <table aria-label="보고용 업무분장표">
        <colgroup>
          <col className="duty-report-category" />
          <col className="duty-report-name" />
          <col className="duty-report-owner" />
          <col />
        </colgroup>
        <thead>
          <tr>{['대분류', '업무명', '담당자', '비고'].map((label) => <th key={label} scope="col">{label}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((row, index) => <tr key={index}>
            <td>{row.대분류}</td>
            <th scope="row">{row.업무명}</th>
            <td>{row.담당자}</td>
            <td>{row.비고 || '—'}</td>
          </tr>)}
        </tbody>
      </table>
    </article>
  )
}

export function DutyReportDialog({ target, onClose, returnFocusRef }: {
  target: DutyReportTarget; onClose: () => void; returnFocusRef: React.RefObject<HTMLElement>
}) {
  const [scope, setScope] = useState<'all' | 'filtered'>('all')
  const [title, setTitle] = useState('SQA P1 업무분장표')
  const [date] = useState(() => businessDateKey(new Date()))
  const [layout, setLayout] = useState<'normal' | 'compact' | 'multiple'>('normal')
  const measureRef = useRef<HTMLDivElement>(null)
  const rows = target[scope]
  const isPrint = target.kind === 'print'
  const report = <DutyReport
    date={date}
    rows={rows}
    scope={scope === 'all' ? '전체 업무' : '현재 검색·필터 결과'}
    title={title.trim() || 'SQA P1 업무분장표'}
  />

  useEffect(() => {
    const output = measureRef.current
    if (!isPrint || !output) return
    let mounted = true
    const measure = () => {
      if (!mounted) return
      const sheet = output.querySelector<HTMLElement>('.duty-report-sheet')
      const limit = output.querySelector<HTMLElement>('.duty-report-page-height')?.offsetHeight
      if (!sheet || !limit) return
      output.dataset.compact = 'false'
      let measured: typeof layout = 'normal'
      if (sheet.offsetHeight > limit) {
        output.dataset.compact = 'true'
        measured = sheet.offsetHeight <= limit ? 'compact' : 'multiple'
        if (measured === 'multiple') output.dataset.compact = 'false'
      }
      const headHeight = sheet.querySelector('thead')?.offsetHeight ?? 0
      for (const row of sheet.querySelectorAll('tbody tr')) {
        row.toggleAttribute('data-split-row', measured === 'multiple' && row.getBoundingClientRect().height + headHeight > limit)
      }
      setLayout(measured)
    }
    measure()
    void document.fonts?.ready.then(measure)
    return () => { mounted = false }
  }, [isPrint, rows, title])

  const submit = () => {
    if (!rows.length) return
    if (isPrint) window.print()
    else {
      downloadCsv('업무분장표-' + date + '.csv', rows)
      onClose()
    }
  }
  const icon = isPrint ? <Printer size={18} /> : <Download size={18} />

  return (
    <Modal
      open
      className={isPrint ? 'duty-report-dialog' : undefined}
      title={isPrint ? '업무분장표 인쇄 미리보기' : '업무분장 CSV 내려받기'}
      description={isPrint ? 'A4 세로 · 브라우저 인쇄 창에서 프린터 또는 PDF 저장을 선택하세요.' : undefined}
      icon={icon}
      onClose={onClose}
      returnFocusRef={returnFocusRef}
    >
      <FormGrid
        fields={
          <>
            <label className={isPrint ? undefined : 'wide'}>
              {isPrint ? '출력 범위' : '내려받을 범위'}
              <select value={scope} onChange={(event) => setScope(event.target.value === 'filtered' ? 'filtered' : 'all')}>
                <option value="all">전체 업무 ({target.all.length}건)</option>
                <option value="filtered">현재 검색·필터 결과 ({target.filtered.length}건)</option>
              </select>
            </label>
            {isPrint && <label>
              보고서 제목
              <input value={title} maxLength={120} onChange={(event) => setTitle(event.target.value)} />
            </label>}
            {isPrint && rows.length > 0 && <>
              <p className="wide duty-report-layout-note" role="status">
                {layout === 'multiple' ? '내용을 읽기 좋은 크기로 여러 페이지에 출력해요.' : 'A4 한 페이지에 맞춰 출력해요.'}
              </p>
              <div className="wide duty-report-preview" data-compact={layout === 'compact'}>
                {report}
              </div>
            </>}
          </>
        }
        disabled={rows.length === 0}
        disabledReason="이 범위에 포함된 업무가 없어요."
        onSubmit={submit}
        onCancel={onClose}
        submitLabel={isPrint ? '인쇄 / PDF 저장' : 'CSV 내려받기'}
      />
      {isPrint && rows.length > 0 && createPortal(
        <div className="duty-report-output" data-compact={layout === 'compact'} ref={measureRef}>
          <div className="duty-report-page-height" />
          {report}
        </div>,
        document.body,
      )}
    </Modal>
  )
}
