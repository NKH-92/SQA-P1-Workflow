export const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
const FIELD = 'input:not([type="hidden"]):not([disabled]), textarea:not([disabled]), select:not([disabled])'

export function getFocusableElements(container: HTMLElement) {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (element) => !element.hasAttribute('disabled') && element.tabIndex !== -1,
  )
}

/**
 * 창을 열었을 때 처음 포커스할 곳: [autofocus] → 첫 입력 칸 → 닫기(X)를 뺀 첫 버튼 → 닫기.
 * 창을 열자마자 입력을 시작할 수 있어야 하고, 확인 창에서는 안전한 ‘닫기’가 먼저 잡힌다.
 */
export function initialFocusTarget(dialog: HTMLElement) {
  const preferred = dialog.querySelector<HTMLElement>('[autofocus], [data-autofocus]')
  if (preferred) return preferred
  const field = dialog.querySelector<HTMLElement>(FIELD)
  if (field) return field
  const focusable = getFocusableElements(dialog)
  return focusable.find((element) => !element.classList.contains('modal-close')) ?? focusable[0] ?? null
}
