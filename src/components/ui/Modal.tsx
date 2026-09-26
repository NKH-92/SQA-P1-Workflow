import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react'
import { X } from 'lucide-react'
import { getFocusableElements, initialFocusTarget } from '../../hooks/dialogFocus'
import { ModalCloseContext, useModalCloseGuard, type ModalCloseGuard } from './modalContext'
import { useHistoryLayer } from '../../hooks/useHistoryLayer'

/** Open-modal stack (bottom → top). Only the topmost modal owns Escape. */
const openModalStack: symbol[] = []

export const DISCARD_PROMPT_MESSAGE = '작성 중인 내용이 있어요. 닫으면 입력한 내용이 사라져요.'

function isSafeFocusTarget(element: HTMLElement | null | undefined): element is HTMLElement {
  return Boolean(element) && typeof element!.focus === 'function' && document.contains(element!)
}

export function Modal({
  open,
  onClose,
  title,
  titleId,
  description,
  eyebrow,
  icon,
  closeLabel,
  className = 'master-modal',
  initialFocusRef,
  returnFocusRef,
  closeOnBackdrop = true,
  closeOnEscape = true,
  dirty = false,
  discardMessage = DISCARD_PROMPT_MESSAGE,
  children,
}: {
  open: boolean
  onClose: () => void
  title: string
  titleId?: string
  description?: string
  eyebrow?: string
  icon?: ReactNode
  closeLabel?: string
  className?: string
  initialFocusRef?: RefObject<HTMLElement>
  returnFocusRef?: RefObject<HTMLElement>
  closeOnBackdrop?: boolean
  closeOnEscape?: boolean
  /**
   * 입력한 내용이 있어 그냥 닫으면 잃어버리는 상태. true면 배경 클릭으로 닫히지 않고,
   * 닫기·Esc·뒤로가기에서 “작성 중인 내용이 있어요” 확인을 먼저 보여준다.
   */
  dirty?: boolean
  discardMessage?: string
  children: ReactNode
}) {
  const generatedTitleId = useId()
  const resolvedTitleId = titleId ?? generatedTitleId
  const descriptionId = useId()
  const discardId = useId()
  const dialogRef = useRef<HTMLElement>(null)
  const triggerRef = useRef<HTMLElement | null>(null)
  const keepWritingRef = useRef<HTMLButtonElement>(null)
  const stackIdRef = useRef(Symbol('modal'))
  const [confirmingDiscard, setConfirmingDiscard] = useState(false)
  const dirtyRef = useRef(dirty)
  const confirmingRef = useRef(confirmingDiscard)

  useEffect(() => {
    dirtyRef.current = dirty
    confirmingRef.current = confirmingDiscard
  })

  useEffect(() => {
    if (!open) setConfirmingDiscard(false)
  }, [open])

  useEffect(() => {
    if (confirmingDiscard) keepWritingRef.current?.focus()
  }, [confirmingDiscard])

  /** ‘버리고 닫기’를 골랐을 때 실행할 닫기. 창 아래 ‘닫기’ 버튼이 자기 onClose를 넘길 수 있다. */
  const pendingCloseRef = useRef<(() => void) | null>(null)

  /** 닫기 요청. 작성 중이면 확인을 띄우고 false를 돌려준다. */
  const requestClose = useCallback(() => {
    if (dirtyRef.current) {
      pendingCloseRef.current = null
      setConfirmingDiscard(true)
      return false
    }
    onClose()
    return true
  }, [onClose])

  const closeGuard = useMemo<ModalCloseGuard>(() => ({
    guardClose: (proceed) => {
      if (dirtyRef.current) {
        pendingCloseRef.current = proceed
        setConfirmingDiscard(true)
        return
      }
      proceed()
    },
  }), [])

  // 뒤로가기는 화면을 떠나기 전에 이 창부터 닫는다(작성 중이면 닫기 확인).
  useHistoryLayer(open, requestClose)

  // 작성 중에 새로고침하거나 탭을 닫으면 브라우저 기본 확인을 띄운다.
  useEffect(() => {
    if (!open || !dirty) return
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      // 오래된 브라우저는 returnValue를 채워야 확인을 띄운다.
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [open, dirty])

  useEffect(() => {
    if (!open) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [open])

  // Captures the trigger element at the start of this open lifecycle, then
  // restores focus in the cleanup so every close path is covered: an
  // `open -> false` prop transition, an Escape/backdrop/submit-triggered
  // `onClose`, or the caller unmounting the Modal outright (e.g.
  // `{dialog && <Modal .../>}`). Cleanup runs for all of these because React
  // always runs the previous effect's cleanup before re-running it or on
  // unmount, regardless of whether the component stays mounted.
  useEffect(() => {
    if (!open) return
    triggerRef.current = (document.activeElement as HTMLElement | null) ?? null
    return () => {
      // Intentionally read `.current` fresh at close time rather than a
      // setup-time snapshot: the caller owns this ref and it must reflect
      // whatever it currently points to when the modal actually closes.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      const explicitTarget = returnFocusRef?.current
      const target = isSafeFocusTarget(explicitTarget)
        ? explicitTarget
        : isSafeFocusTarget(triggerRef.current)
          ? triggerRef.current
          : null
      target?.focus()
      triggerRef.current = null
    }
  }, [open, returnFocusRef])

  useEffect(() => {
    if (!open) return
    const timer = window.setTimeout(() => {
      if (initialFocusRef?.current) {
        initialFocusRef.current.focus()
        return
      }
      const dialog = dialogRef.current
      if (!dialog) return
      // autoFocus 등으로 이미 창 안에 포커스가 있으면 빼앗지 않는다.
      if (dialog.contains(document.activeElement)) return
      initialFocusTarget(dialog)?.focus()
    }, 0)
    return () => window.clearTimeout(timer)
  }, [open, initialFocusRef])

  // Register in the open-modal stack so nested Escape only closes the topmost dialog.
  useEffect(() => {
    if (!open) return
    const id = stackIdRef.current
    openModalStack.push(id)
    return () => {
      const index = openModalStack.lastIndexOf(id)
      if (index >= 0) openModalStack.splice(index, 1)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      const isTopmost = openModalStack[openModalStack.length - 1] === stackIdRef.current
      if (!isTopmost) return
      // 한글 조합 중 Esc는 조합을 끝내는 키다. 창을 닫지 않는다.
      if (event.isComposing || event.keyCode === 229) return

      if (event.key === 'Escape' && closeOnEscape) {
        event.preventDefault()
        event.stopPropagation()
        if (confirmingRef.current) {
          setConfirmingDiscard(false)
          return
        }
        requestClose()
        return
      }
      if (event.key !== 'Tab' || !dialogRef.current) return
      const focusable = getFocusableElements(dialogRef.current)
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    // Capture phase so the topmost modal sees Escape before ancestors/siblings.
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [open, requestClose, closeOnEscape])

  if (!open) return null

  return (
    <div
      className="modal-backdrop"
      onMouseDown={() => {
        // 작성 중이면 바깥을 눌러도 닫지 않는다(텍스트를 끌어 선택하다 밖에서 놓는 경우 포함).
        if (closeOnBackdrop && !dirtyRef.current) onClose()
      }}
      role="presentation"
    >
      <section
        ref={dialogRef}
        aria-describedby={description ? descriptionId : undefined}
        aria-labelledby={resolvedTitleId}
        aria-modal="true"
        className={`modal-card ${className}`}
        onMouseDown={(event) => event.stopPropagation()}
        role="dialog"
      >
        <header className="modal-header">
          {icon && (
            <div className="modal-mark" aria-hidden="true">
              {icon}
            </div>
          )}
          <div>
            {eyebrow && <span>{eyebrow}</span>}
            <h2 id={resolvedTitleId}>{title}</h2>
            {description && (
              <p className="modal-description" id={descriptionId}>
                {description}
              </p>
            )}
          </div>
          <button
            aria-label={closeLabel ?? '닫기'}
            className="icon-button modal-close"
            onClick={() => requestClose()}
            type="button"
          >
            <X size={18} />
          </button>
        </header>
        {confirmingDiscard && (
          <div aria-labelledby={discardId} className="modal-discard" role="group">
            <p id={discardId}>{discardMessage}</p>
            <div className="modal-discard-actions">
              <button ref={keepWritingRef} className="ghost compact" onClick={() => setConfirmingDiscard(false)} type="button">
                계속 쓰기
              </button>
              <button
                className="danger compact"
                onClick={() => {
                  const proceed = pendingCloseRef.current ?? onClose
                  pendingCloseRef.current = null
                  setConfirmingDiscard(false)
                  proceed()
                }}
                type="button"
              >
                버리고 닫기
              </button>
            </div>
          </div>
        )}
        <ModalCloseContext.Provider value={closeGuard}>{children}</ModalCloseContext.Provider>
      </section>
    </div>
  )
}

/**
 * 창 아래 버튼 줄의 표준: 오른쪽 정렬, 왼쪽은 늘 ‘닫기’, 오른쪽은 동사로 끝나는 행동.
 * ‘취소’는 하던 작업을 취소한다는 뜻으로 읽힐 수 있어 쓰지 않는다(토스 UX 라이팅).
 */
export function DialogActions({
  onClose,
  closeLabel = '닫기',
  hint,
  children,
}: {
  onClose?: () => void
  closeLabel?: string
  /** 버튼 왼쪽에 두는 짧은 안내(예: 비활성 이유, 단축키) */
  hint?: ReactNode
  children: ReactNode
}) {
  return (
    <div className="modal-footer dialog-actions">
      {hint && <p className="dialog-actions-hint">{hint}</p>}
      <div>
        {onClose && <ModalCloseButton onClose={onClose}>{closeLabel}</ModalCloseButton>}
        {children}
      </div>
    </div>
  )
}

/**
 * 창 안의 ‘닫기’ 버튼. 작성 중(dirty)이면 “작성 중인 내용이 있어요” 확인을 먼저 띄운다.
 * 버튼 줄을 직접 만드는 창(여러 단계 작성 창 등)도 이 버튼을 써야 입력한 내용이 확인 없이 사라지지 않는다.
 */
export function ModalCloseButton({
  onClose,
  children = '닫기',
  className = 'ghost',
}: {
  onClose: () => void
  children?: ReactNode
  className?: string
}) {
  const guard = useModalCloseGuard()
  return (
    <button className={className} onClick={() => (guard ? guard.guardClose(onClose) : onClose())} type="button">
      {children}
    </button>
  )
}
