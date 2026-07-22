import { supabase } from '../../lib/supabase'
import {
  assertMasterVersion,
  makeMasterCorrelationId,
  normalizeMasterReason,
} from '../validation/masterOcc'
import { translateMasterOccError } from './masterOccError'

export { assertMasterVersion, makeMasterCorrelationId, normalizeMasterReason }

type MasterDeleteRpc =
  | 'delete_allowed_user_if_current'
  | 'delete_duty_if_current'
  | 'delete_duty_major_category_if_current'

type MasterDeleteInput = {
  expectedUpdatedAt: string | null
  reason: string
}

export async function runMasterOccRpc<T>(
  rpc: string,
  args: Record<string, unknown>,
): Promise<T | null> {
  const { data, error } = await supabase!.rpc(rpc, args)
  throwMasterOccError(error)
  return data as T | null
}

export function throwMasterOccError(error: { message?: string } | null) {
  if (error) throw translateMasterOccError(error)
}

export async function deleteMasterIfCurrent(
  rpc: MasterDeleteRpc,
  id: string,
  input: MasterDeleteInput,
) {
  await runMasterOccRpc(rpc, {
    p_id: id,
    p_expected_updated_at: assertMasterVersion(input.expectedUpdatedAt),
    p_reason: normalizeMasterReason(input.reason),
    p_correlation_id: makeMasterCorrelationId(),
  })
}
