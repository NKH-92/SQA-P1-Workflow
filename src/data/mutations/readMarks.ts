import type { RepositoryContext } from '../repositoryContext'
import type { ReadMarkSection } from '../../types'

/** 이 화면에서 지금 보이는 항목을 ‘확인함’으로 기록한다(홈 사무실 기물의 새 소식 알림이 꺼진다). */
export async function markSectionSeen(
  ctx: RepositoryContext,
  section: ReadMarkSection,
  keys: readonly string[],
): Promise<void> {
  return ctx.repositories.readMarks.markSectionSeen(section, keys)
}
