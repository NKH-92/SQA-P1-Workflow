import type { Role } from '../../types'
import type { RepositoryContext } from '../repositoryContext'
import type { AuditedDeleteInput } from '../contracts'
import { logAdminActivity } from './adminActivity'

export async function importInvites(
  ctx: RepositoryContext,
  rows: Array<{ email: string; name: string; role: Role }>,
): Promise<void> {
  const invites = rows.map((row) => ({ ...row, name: row.name.trim() }))
  await ctx.repositories.invites.importInvites(invites)
  await logAdminActivity(ctx, 'allowed_user', 'created', `계정 ${rows.length}개를 가져왔어요.`, null, {
    count: rows.length,
  })
}

export async function addAllowedUser(
  ctx: RepositoryContext,
  input: { email: string; name: string; role: Role },
): Promise<void> {
  await ctx.repositories.invites.addAllowedUser(input)
  await logAdminActivity(ctx, 'allowed_user', 'created', `${input.name}님 계정을 추가했어요.`, null, {
    email: input.email,
    role: input.role,
  })
}

export async function updateInvite(
  ctx: RepositoryContext,
  inviteId: string,
  payload: { email: string; name: string; role: Role; expectedUpdatedAt: string | null; reason: string },
): Promise<{ noop: boolean }> {
  const result = await ctx.repositories.invites.updateInvite(inviteId, payload)
  if (!result.noop) {
    await logAdminActivity(ctx, 'allowed_user', 'updated', '계정 정보를 수정했어요.', inviteId, payload)
  }
  return result
}

export async function toggleProfileActive(
  ctx: RepositoryContext,
  profileId: string,
  nextActive: boolean,
  input: { expectedUpdatedAt: string | null; reason: string },
): Promise<{ noop: boolean }> {
  const result = await ctx.repositories.invites.toggleProfileActive(profileId, nextActive, input)
  if (!result.noop) {
    await logAdminActivity(
      ctx,
      'allowed_user',
      nextActive ? 'activated' : 'deactivated',
      nextActive ? '계정을 활성화했어요.' : '계정을 비활성화했어요.',
      profileId,
      { is_active: nextActive },
    )
  }
  return result
}

export async function setProfileRole(
  ctx: RepositoryContext,
  profileId: string,
  role: Role,
  input: { expectedUpdatedAt: string | null; reason: string },
): Promise<{ noop: boolean }> {
  const result = await ctx.repositories.invites.setProfileRole(profileId, role, input)
  if (!result.noop) {
    await logAdminActivity(ctx, 'allowed_user', 'updated', '계정 역할을 바꿨어요.', profileId, { role })
  }
  return result
}

export async function deleteAllowedUser(ctx: RepositoryContext, id: string, input: AuditedDeleteInput): Promise<void> {
  const name = await ctx.repositories.invites.deleteAllowedUser(id, input)
  await logAdminActivity(ctx, 'allowed_user', 'deleted', `${name ?? '계정'} 계정을 목록에서 삭제했어요.`, id, {
    reason: input.reason.trim(),
  })
}
