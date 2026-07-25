import { createClient } from '@/lib/supabase/server'
import type { MemberHorsePrivilege } from './types'

export async function getHorsePrivileges(horseId: string, barnId: string): Promise<MemberHorsePrivilege[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('member_horse_privileges')
    .select()
    .eq('barn_id', barnId)
    .eq('horse_id', horseId)

  if (error) throw error
  return data
}

export async function grantHorsePrivilege(horseId: string, barnId: string, memberId: string): Promise<MemberHorsePrivilege> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('member_horse_privileges')
    .insert({ barn_id: barnId, horse_id: horseId, member_id: memberId })
    .select()
    .single()

  if (error) throw error
  return data
}

export async function updateHorsePrivilegeDocumentAccess(
  privilegeId: string,
  barnId: string,
  value: 'none' | 'read' | 'write'
): Promise<void> {
  const supabase = await createClient()
  const { error } = await supabase
    .from('member_horse_privileges')
    .update({ document_privileges: value })
    .eq('id', privilegeId)
    .eq('barn_id', barnId)
  if (error) throw error
}

export async function updateHorsePrivilegeLessonAccess(
  privilegeId: string,
  barnId: string,
  value: boolean
): Promise<void> {
  const supabase = await createClient()
  const { error } = await supabase
    .from('member_horse_privileges')
    .update({ lesson_read_privileges: value })
    .eq('id', privilegeId)
    .eq('barn_id', barnId)
  if (error) throw error
}

export async function setHorseOwner(horseId: string, barnId: string, memberId: string | null): Promise<void> {
  const supabase = await createClient()
  const { error } = await supabase.rpc('set_horse_owner', {
    p_horse_id: horseId,
    p_barn_id: barnId,
    p_member_id: memberId,
  })
  if (error) throw error
}

export async function revokeHorsePrivilege(privilegeId: string, barnId: string): Promise<void> {
  const supabase = await createClient()
  const { error } = await supabase.rpc('revoke_horse_privilege', {
    p_privilege_id: privilegeId,
    p_barn_id: barnId,
  })
  if (error) throw error
}
