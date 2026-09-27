import type { ReadMarkSection, SectionReadMark } from '../../types'

export const READ_MARK_SECTIONS: readonly ReadMarkSection[] = ['announcements', 'projects', 'change-applications']
/** public.mark_section_seen이 받는 id 개수 상한(section_read_marks_keys_check와 같다). */
export const READ_MARK_KEY_LIMIT = 500

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function isReadMarkSection(value: unknown): value is ReadMarkSection {
  return typeof value === 'string' && (READ_MARK_SECTIONS as readonly string[]).includes(value)
}

/** 서버에 보낼 id: 중복을 빼고 uuid 모양만 남겨 상한까지 자른다(순서는 유지). */
export function readMarkKeysForServer(keys: readonly string[]): string[] {
  return [...new Set(keys.filter((key) => UUID_PATTERN.test(key)))].slice(0, READ_MARK_KEY_LIMIT)
}

/** 한 화면의 기록을 바꿔 끼운다. 다른 사람·다른 화면 기록은 그대로 둔다. */
export function upsertSectionReadMark(marks: readonly SectionReadMark[], next: SectionReadMark): SectionReadMark[] {
  return [
    ...marks.filter((mark) => !(mark.user_id === next.user_id && mark.section === next.section)),
    next,
  ]
}

function parseMark(value: unknown): SectionReadMark | null {
  if (!value || typeof value !== 'object') return null
  const row = value as Record<string, unknown>
  if (typeof row.user_id !== 'string' || !isReadMarkSection(row.section) || typeof row.seen_at !== 'string') return null
  if (!Array.isArray(row.seen_keys) || !row.seen_keys.every((key) => typeof key === 'string')) return null
  return { user_id: row.user_id, section: row.section, seen_keys: [...row.seen_keys], seen_at: row.seen_at }
}

/** get_section_read_marks 응답을 확인한다. 모양이 다르면 null(불러오기 실패와 같게 다룬다). */
export function parseSectionReadMarks(value: unknown): SectionReadMark[] | null {
  if (!Array.isArray(value)) return null
  const marks = value.map(parseMark)
  return marks.every((mark): mark is SectionReadMark => mark !== null) ? marks : null
}
