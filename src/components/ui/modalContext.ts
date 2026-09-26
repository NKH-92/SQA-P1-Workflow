import { createContext, useContext } from 'react'

export type ModalCloseGuard = {
  /**
   * 창 안의 ‘닫기’ 버튼이 부른다. 작성 중(dirty)이면 “작성 중인 내용이 있어요” 확인을 먼저 보여주고,
   * 사용자가 ‘버리고 닫기’를 고르면 proceed를 실행한다. 작성 중이 아니면 바로 proceed를 실행한다.
   */
  guardClose: (proceed: () => void) => void
}

export const ModalCloseContext = createContext<ModalCloseGuard | null>(null)

/** Modal 안에서만 값이 있다. 창 밖의 폼이면 null. */
export function useModalCloseGuard() {
  return useContext(ModalCloseContext)
}
