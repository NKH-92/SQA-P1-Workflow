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
  await logAdminActivity(ctx, 'allowed_user', 'created', `${rows.length}개 초대를 가져왔습니다.`, null, {
    count: rows.length,
  })
}

export async function addAllowedUser(
  ctx: RepositoryContext,
  input: { email: string; name: string; role: Role },
): Promise<void> {
  await ctx.repositories.invites.addAllowedUser(input)
  await logAdminActivity(ctx, 'allowed_user', 'created', `${input.name} 초대를 추가했습니다.`, null, {
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
    await logAdminActivity(ctx, 'allowed_user', 'updated', '초대 정보를 수정했습니다.', inviteId, payload)
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
      nextActive ? '사용자를 활성화했습니다.' : '사용자를 비활성화했습니다.',
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
    await logAdminActivity(ctx, 'allowed_user', 'updated', '사용자 역할을 변경했습니다.', profileId, { role })
  }
  return result
}

export async function deleteAllowedUser(ctx: RepositoryContext, id: string, input: AuditedDeleteInput): Promise<void> {
  const name = await ctx.repositories.invites.deleteAllowedUser(id, input)
  await logAdminActivity(ctx, 'allowed_user', 'deleted', `${name ?? '초대'} 사용자를 삭제했습니다.`, id, {
    reason: input.reason.trim(),
  })
}
