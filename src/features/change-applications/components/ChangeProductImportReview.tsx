import { AlertTriangle, CheckCircle2, Search, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Badge } from '../../../components/ui'
import type { ChangeScopeProduct } from '../selectors'
import type { ProductImportMatch } from '../productImport'

export type ChangeProductImportMode = 'add' | 'replace'

function ProductResolutionPicker({
  match,
  products,
  onSelect,
}: {
  match: ProductImportMatch
  products: ChangeScopeProduct[]
  onSelect: (productId: string | null) => void
}) {
  const [query, setQuery] = useState('')
  const visibleProducts = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase('ko')
    const candidates = new Set(match.candidateProductIds)
    return products
      .filter((product) => (
        !normalized
        || `${product.name} ${product.companyName ?? ''}`.toLocaleLowerCase('ko').includes(normalized)
      ))
      .sort((left, right) => (
        Number(candidates.has(right.id)) - Number(candidates.has(left.id))
        || (left.sortOrder ?? Number.MAX_SAFE_INTEGER) - (right.sortOrder ?? Number.MAX_SAFE_INTEGER)
        || left.name.localeCompare(right.name, 'ko')
      ))
      .slice(0, 100)
  }, [match.candidateProductIds, products, query])

  return (
    <div className="change-import-product-picker">
      <label>
        <Search size={14} />
        <input
          aria-label={`${match.rowNumber}행 제품 검색`}
          placeholder="제품명 검색"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </label>
      <select
        aria-label={`${match.rowNumber}행 매칭 제품`}
        value={match.productId ?? ''}
        onChange={(event) => onSelect(event.target.value || null)}
      >
        <option value="">제품을 선택하세요</option>
        {visibleProducts.map((product) => (
          <option key={product.id} value={product.id}>
            {product.name}{product.companyName ? ` · ${product.companyName}` : ''}
          </option>
        ))}
      </select>
    </div>
  )
}

export function ChangeProductImportReview({
  fileName,
  sheetName,
  matches,
  excludedRows,
  products,
  responsibilityNeededCount,
  mode,
  onModeChange,
  onResolve,
  onExclude,
  onRestore,
  onApply,
  onCancel,
}: {
  fileName: string
  sheetName: string | null
  matches: ProductImportMatch[]
  excludedRows: Set<number>
  products: ChangeScopeProduct[]
  responsibilityNeededCount: number
  mode: ChangeProductImportMode
  onModeChange: (mode: ChangeProductImportMode) => void
  onResolve: (rowNumber: number, productId: string | null) => void
  onExclude: (rowNumber: number) => void
  onRestore: (rowNumber: number) => void
  onApply: () => void
  onCancel: () => void
}) {
  const activeMatches = matches.filter((match) => !excludedRows.has(match.rowNumber))
  const excludedMatches = matches.filter((match) => excludedRows.has(match.rowNumber))
  const seenProductIds = new Set<string>()
  const duplicateMatches = activeMatches.filter((match) => {
    if (!match.productId) return false
    if (seenProductIds.has(match.productId)) return true
    seenProductIds.add(match.productId)
    return false
  })
  const duplicateRows = new Set(duplicateMatches.map((match) => match.rowNumber))
  const automaticMatches = activeMatches.filter(
    (match) => (match.status === 'exact' || match.status === 'normalized') && !duplicateRows.has(match.rowNumber),
  )
  const unresolvedMatches = activeMatches.filter((match) => !match.productId)
  const resolvedIds = new Set(activeMatches.flatMap((match) => match.productId ? [match.productId] : []))
  const canApply = resolvedIds.size > 0 && unresolvedMatches.length === 0
  const productById = new Map(products.map((product) => [product.id, product]))

  return (
    <section className="change-import-review" aria-label="Excel 제품 가져오기 검토">
      <header>
        <div>
          <span>Excel 검토</span>
          <strong>{fileName}</strong>
          <small>{sheetName ? `${sheetName} 시트 · ` : ''}${matches.length.toLocaleString('ko-KR')}개 행</small>
        </div>
        <button aria-label="Excel 검토 닫기" className="icon-button" onClick={onCancel} type="button"><X size={16} /></button>
      </header>

      <div className="change-import-summary" aria-live="polite">
        <article><span>전체 행</span><strong>{matches.length}</strong></article>
        <article data-tone="success"><span>자동 일치</span><strong>{automaticMatches.length}</strong></article>
        <article><span>중복</span><strong>{duplicateMatches.length}</strong></article>
        <article data-tone={unresolvedMatches.length > 0 ? 'warning' : 'success'}><span>제품 확인 필요</span><strong>{unresolvedMatches.length}</strong></article>
        <article data-tone={responsibilityNeededCount > 0 ? 'warning' : 'success'}><span>담당자 확인 필요</span><strong>{responsibilityNeededCount}</strong></article>
      </div>

      {unresolvedMatches.length > 0 && (
        <div className="change-import-issues">
          <div className="change-import-message">
            <AlertTriangle size={17} />
            <span><strong>자동으로 확정하지 못한 제품이 있습니다.</strong><small>제품을 검색해 연결하거나 이번 등록에서 제외해 주세요.</small></span>
          </div>
          {unresolvedMatches.map((match) => (
            <article key={match.rowNumber}>
              <div>
                <Badge>{match.rowNumber}행</Badge>
                <strong>{match.name}</strong>
                <small>{match.status === 'ambiguous' ? '보정 결과가 여러 제품과 일치합니다.' : '제품 마스터에서 일치 항목을 찾지 못했습니다.'}</small>
              </div>
              <ProductResolutionPicker match={match} products={products} onSelect={(productId) => onResolve(match.rowNumber, productId)} />
              <button className="ghost" onClick={() => onExclude(match.rowNumber)} type="button">제외</button>
            </article>
          ))}
        </div>
      )}

      {automaticMatches.length > 0 && (
        <details className="change-import-matched">
          <summary><CheckCircle2 size={15} /> 자동 일치 {automaticMatches.length}개 확인</summary>
          <div>
            {automaticMatches.map((match) => (
              <span key={match.rowNumber}>
                <small>{match.rowNumber}행 · {match.name}</small>
                <strong>{match.productId ? productById.get(match.productId)?.name : '-'}</strong>
                {match.status === 'normalized' && <Badge>표기 보정</Badge>}
              </span>
            ))}
          </div>
        </details>
      )}

      {duplicateMatches.length > 0 && (
        <p className="change-import-duplicate-note">
          중복 {duplicateMatches.length}개는 한 제품으로 합쳐집니다. ({duplicateMatches.map((match) => `${match.rowNumber}행`).join(', ')})
        </p>
      )}

      <fieldset className="change-import-mode">
        <legend>현재 선택에 반영하는 방법</legend>
        <label><input checked={mode === 'add'} name="change-import-mode" onChange={() => onModeChange('add')} type="radio" /> 기존 선택에 추가</label>
        <label><input checked={mode === 'replace'} name="change-import-mode" onChange={() => onModeChange('replace')} type="radio" /> Excel 목록으로 대체</label>
      </fieldset>

      {excludedMatches.length > 0 && (
        <details className="change-import-excluded">
          <summary>제외한 행 {excludedMatches.length}개 · 다시 포함할 수 있습니다.</summary>
          <div>
            {excludedMatches.map((match) => (
              <span key={match.rowNumber}>
                <small>{match.rowNumber}행 · {match.name}</small>
                <button className="ghost compact" onClick={() => onRestore(match.rowNumber)} type="button">다시 포함</button>
              </span>
            ))}
          </div>
        </details>
      )}
      <footer>
        <span>{resolvedIds.size.toLocaleString('ko-KR')}개 제품을 반영합니다.</span>
        <div>
          <button className="ghost" onClick={onCancel} type="button">취소</button>
          <button className="primary" disabled={!canApply} onClick={onApply} type="button">선택 제품에 반영</button>
        </div>
      </footer>
    </section>
  )
}
