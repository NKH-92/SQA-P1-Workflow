import { useEffect, useRef, useState, type ClipboardEvent, type DragEvent } from 'react'
import { Image as ImageIcon } from 'lucide-react'
import { DialogActions, Modal } from '../../../components/ui'
import { loadWeeklyMenu, publishWeeklyMenu, type WeeklyMenu } from '../../../data/repositories/weeklyMenuRepository'
import { inspectMenuImage, menuWeek, menuWeekLabel } from '../../../data/validation/weeklyMenu'
import { isPreviewMode } from '../../../lib/supabase'
import { imageDataUrl } from '../../../lib/imageDataUrl'
import type { Profile } from '../../../types'
import './WeeklyMenuDialog.css'

function message(error: unknown) {
  return error instanceof Error ? error.message : '사진을 처리하지 못했어요. 다시 시도해 주세요.'
}

function useImageUrl(image: Blob | null) {
  const [url, setUrl] = useState('')
  const [error, setError] = useState('')
  useEffect(() => {
    let alive = true
    setUrl('')
    setError('')
    if (!image) { setUrl(''); return }
    imageDataUrl(image).then((next) => { if (alive) setUrl(next) })
      .catch((cause: unknown) => { if (alive) setError(message(cause)) })
    return () => { alive = false }
  }, [image])
  return { url, error }
}

export function WeeklyMenuDialog({ profile, onClose }: { profile: Profile; onClose: () => void }) {
  const [week] = useState(menuWeek)
  const [menu, setMenu] = useState<WeeklyMenu | null>(null)
  const [draft, setDraft] = useState<File | null>(null)
  const [dimensions, setDimensions] = useState<{ width: number; height: number } | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [reload, setReload] = useState(0)
  const [zoom, setZoom] = useState(false)
  const [showUpload, setShowUpload] = useState(false)
  const selecting = useRef(0)
  const canUpload = profile.is_active !== false
  const { url, error: imageError } = useImageUrl(draft ?? menu?.image ?? null)

  useEffect(() => {
    let alive = true
    setLoading(true)
    setError('')
    loadWeeklyMenu(week).then((result) => {
      if (alive) setMenu(result)
    }).catch((cause: unknown) => {
      if (alive) setError(message(cause))
    }).finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [week, reload])

  useEffect(() => () => { selecting.current += 1 }, [])

  async function select(file?: File) {
    if (!file || busy || loading || !canUpload) return
    const revision = ++selecting.current
    setError('')
    setSuccess('')
    setBusy(true)
    try {
      const size = await inspectMenuImage(file)
      if (revision !== selecting.current) return
      setDraft(file)
      setDimensions(size)
      setZoom(false)
    } catch (cause) {
      if (revision === selecting.current) setError(message(cause))
    } finally {
      if (revision === selecting.current) setBusy(false)
    }
  }

  function paste(event: ClipboardEvent) {
    const file = Array.from(event.clipboardData.files).find((item) => item.type.startsWith('image/'))
    if (file) { event.preventDefault(); void select(file) }
  }

  function drop(event: DragEvent) {
    event.preventDefault()
    void select(event.dataTransfer.files[0])
  }

  async function publish() {
    if (!draft || busy) return
    setBusy(true)
    setError('')
    try {
      const saved = await publishWeeklyMenu(week, draft)
      setMenu(saved)
      setDraft(null)
      setDimensions(null)
      setShowUpload(false)
      setSuccess(isPreviewMode ? '이 브라우저에 메뉴를 저장했어요.' : '이번 주 메뉴를 모두에게 게시했어요.')
    } catch (cause) { setError(message(cause)) }
    finally { setBusy(false) }
  }

  return (
    <Modal open title="이번 주 메뉴" eyebrow="우리 회사 메뉴판" description={menuWeekLabel(week)} icon={<ImageIcon aria-hidden="true" size={18} />}
      className="office-meeting-dialog" closeLabel="메뉴판 닫기" onClose={() => { if (!busy) onClose() }} dirty={Boolean(draft)} onPaste={paste}>
      <div className="office-meeting-body weekly-menu-body" onDragOver={(event) => event.preventDefault()} onDrop={drop}>
        <p className="office-meeting-note">누구나 이번 주 메뉴 캡처를 올릴 수 있어요. 새 사진을 게시하면 기존 사진은 교체돼요.</p>
        {isPreviewMode && <p className="office-meeting-note">미리보기에서는 이 브라우저에만 저장돼요.</p>}
        {(error || imageError) && <p role="alert">{error || imageError}</p>}
        {success && <p role="status">{success}</p>}
        {loading ? <p role="status">이번 주 메뉴를 불러오는 중…</p> : url ? (
          <>
            <div className="office-meeting-options">
              <span>{draft ? '게시 전 미리보기' : '게시된 메뉴'}{dimensions ? ` · ${dimensions.width} × ${dimensions.height}` : ''}</span>
              <button type="button" className="ghost compact" aria-pressed={zoom} onClick={() => setZoom(!zoom)}>{zoom ? '전체 보기' : '확대 보기'}</button>
            </div>
            <div className="weekly-menu-image" data-zoom={zoom} tabIndex={0} role="region" aria-label="메뉴 사진, 확대하면 가로와 세로로 스크롤할 수 있어요">
              <img src={url} alt={`${menuWeekLabel(week)} 메뉴${draft ? ' 게시 전 미리보기' : ''}`} onError={() => setError('메뉴 사진을 표시하지 못했어요. 다시 불러오거나 다른 사진을 올려 주세요.')} />
            </div>
            <p className="office-meeting-note">원본 비율 그대로, 잘림 없이 보여요. 작은 글씨는 확대해서 확인해 주세요.</p>
          </>
        ) : !error && <p className="office-meeting-note">이번 주 메뉴를 기다리고 있어요</p>}
        {(!menu || draft || showUpload) && <div className="office-meeting-field weekly-menu-upload">
          <label htmlFor="weekly-menu-file">메뉴 사진 선택</label>
          <input id="weekly-menu-file" type="file" accept="image/png,image/jpeg,image/webp" disabled={busy || loading || !canUpload}
            onChange={(event) => { void select(event.target.files?.[0]); event.target.value = '' }} />
          <small>PNG · JPG · WebP / 최대 10MB · 끌어 놓기 또는 Ctrl+V로 붙여넣기도 가능해요.</small>
        </div>}
        <div className="office-meeting-options">
          <button type="button" className="ghost" disabled={busy || loading || Boolean(draft)} onClick={() => { setZoom(false); setReload(reload + 1) }}>다시 불러오기</button>
          {(draft || showUpload) && <button type="button" className="ghost" disabled={busy} onClick={() => { setDraft(null); setDimensions(null); setZoom(false); setShowUpload(false); setError('') }}>선택 취소</button>}
        </div>
      </div>
      <DialogActions onClose={() => { if (!busy) onClose() }} hint={draft ? '게시하면 기존 사진이 교체돼요. 메뉴 사진은 한 장만 보관해요.' : menu ? '새로운 메뉴가 나오면 사진을 바꿔 주세요.' : '메뉴표를 캡처해서 사진 파일로 올려 주세요.'}>
        {menu && !draft && !showUpload
          ? <button type="button" className="primary" disabled={busy || loading || !canUpload} onClick={() => { setShowUpload(true); setSuccess('') }}>메뉴 사진 바꾸기</button>
          : <button type="button" className="primary" aria-busy={busy || undefined} disabled={!draft || busy || !canUpload} onClick={() => void publish()}>{busy ? '사진 처리 중…' : '이번 주 메뉴로 게시'}</button>}
      </DialogActions>
    </Modal>
  )
}
