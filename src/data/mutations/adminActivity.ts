import { recordActivityLog } from '../activityLog'
import type { RepositoryContext } from '../repositoryContext'

export async function logAdminActivity(
  ctx: RepositoryContext,
  entityType: Parameters<typeof recordActivityLog>[1]['entityType'],
  action: string,
  summary: string,
  entityId: string | null = null,
  metadata: Record<string, unknown> = {},
) {
  await recordActivityLog(ctx.repositories.activityLogs, {
    actor: ctx.profile,
    entityType,
    entityId,
    action,
    summary,
    metadata,
  })
}
