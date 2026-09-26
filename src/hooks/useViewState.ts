import { useCallback, useEffect, useState } from 'react'

const PREFIX = 'sqa.view.'

function read<T>(key: string, initial: T, validate?: (value: unknown) => value is T): T {
  if (typeof window === 'undefined') return initial
  try {
    const raw = window.sessionStorage.getItem(PREFIX + key)
    if (raw == null) return initial
    const parsed: unknown = JSON.parse(raw)
    if (validate) return validate(parsed) ? parsed : initial
    return parsed as T
  } catch {
    return initial
  }
}

/**
 * 화면별 보기 상태(검색어·필터·정렬·선택 등)를 브라우저 세션 동안 기억한다.
 * 다른 메뉴에 다녀오거나 새로고침해도 보던 조건이 그대로 남는다(토스 체크리스트 CL-3).
 * key는 화면·용도를 함께 적는다. 예: 'reviews.leader.filters'
 * validate를 주면 저장된 값의 모양이 달라졌을 때(배포 후 구조 변경) 초기값으로 돌아간다.
 */
export function useViewState<T>(
  key: string,
  initial: T,
  validate?: (value: unknown) => value is T,
): [T, (value: T | ((previous: T) => T)) => void] {
  const [value, setValue] = useState<T>(() => read(key, initial, validate))

  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      window.sessionStorage.setItem(PREFIX + key, JSON.stringify(value))
    } catch {
      // 저장소를 쓸 수 없는 환경(사생활 보호 모드 등)에서는 기억하지 않을 뿐 동작은 같다.
    }
  }, [key, value])

  const update = useCallback((next: T | ((previous: T) => T)) => {
    setValue((previous) => (typeof next === 'function' ? (next as (previous: T) => T)(previous) : next))
  }, [])

  return [value, update]
}

/**
 * 로그아웃할 때 부른다. 같은 브라우저 탭을 다음 사람이 쓰면 앞사람의 검색어·필터가 보이지 않게 지운다.
 */
export function clearViewState() {
  if (typeof window === 'undefined') return
  try {
    const keys: string[] = []
    for (let index = 0; index < window.sessionStorage.length; index += 1) {
      const key = window.sessionStorage.key(index)
      if (key?.startsWith(PREFIX)) keys.push(key)
    }
    keys.forEach((key) => window.sessionStorage.removeItem(key))
  } catch {
    // 저장소를 쓸 수 없는 환경이면 지울 것도 없다.
  }
}
