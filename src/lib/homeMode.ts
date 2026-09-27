/**
 * 홈 화면 방식. office는 전체 화면 도트 사무실(게임 화면처럼 위 메뉴와 ‘오늘 할 일’ 창),
 * classic은 기존 화면(왼쪽 메뉴·할 일 목록·사무실 카드)이다.
 * 사람마다 이 브라우저에 기억하고, 고른 적이 없으면 화면 폭으로 정한다.
 */
export type HomeMode = 'office' | 'classic'

const STORAGE_PREFIX = 'sqa.home-mode.'
/** 이 폭 이하(휴대폰)에서는 할 일 목록이 먼저 보이도록 기존 화면을 기본으로 둔다. */
export const PHONE_MAX_WIDTH = 640

export function isHomeMode(value: unknown): value is HomeMode {
  return value === 'office' || value === 'classic'
}

export function defaultHomeMode(viewportWidth: number): HomeMode {
  return viewportWidth <= PHONE_MAX_WIDTH ? 'classic' : 'office'
}

export function readHomeMode(userId: string): HomeMode | null {
  try {
    const value = window.localStorage.getItem(`${STORAGE_PREFIX}${userId}`)
    return isHomeMode(value) ? value : null
  } catch {
    return null
  }
}

export function writeHomeMode(userId: string, mode: HomeMode) {
  try {
    window.localStorage.setItem(`${STORAGE_PREFIX}${userId}`, mode)
  } catch {
    // 저장소를 쓸 수 없으면 이번 화면에서만 바꾼다.
  }
}
