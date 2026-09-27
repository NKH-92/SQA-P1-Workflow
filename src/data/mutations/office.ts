import type { RepositoryContext } from '../repositoryContext'
import type { OfficeSeatInput } from '../validation/officeSeats'

/** 사무실 자리 배치 전체를 한 번에 바꾼다(파트장 전용). 바뀐 게 없으면 changed가 false다. */
export async function replaceOfficeSeats(
  ctx: RepositoryContext,
  input: { seats: OfficeSeatInput[]; expectedRevision: string | null },
): Promise<{ changed: boolean }> {
  return ctx.repositories.office.replaceOfficeSeats(input)
}
