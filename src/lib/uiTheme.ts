export type UiTheme = 'pixel' | 'classic'
export function isUiTheme(value: unknown): value is UiTheme {
  return value === 'pixel' || value === 'classic'
}
export function readUiTheme(userId: string): UiTheme | null {
  try {
    const value = window.localStorage.getItem(`sqa.ui-theme.${userId}`)
    return isUiTheme(value) ? value : null
  } catch { return null }
}
export function writeUiTheme(userId: string, theme: UiTheme) {
  try { window.localStorage.setItem(`sqa.ui-theme.${userId}`, theme) } catch { /* 이번 세션의 선택은 훅이 유지한다. */ }
}
