import type { RepositoryContext } from '../repositoryContext'

export async function addProfileNote(
  ctx: RepositoryContext,
  input: { profileId: string; note: string },
): Promise<void> {
  return ctx.repositories.team.addProfileNote(input)
}
