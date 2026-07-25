import { createClient } from '@/lib/supabase/server'
import { getRiderEnrolledLessonIds, hydrateParticipants } from './lesson-participants'
import { getMembershipByIdForBarn } from './barn-memberships'
import { resolveMemberNames } from './member-names'
import { getProfileById } from './profiles'
import type { Lesson, LessonDetail, LessonWithDetails, PaymentType, Role } from './types'

// #885: lessons.payment_type is no longer written by any RPC — the transactions
// ledger (kind='lesson_fee') is the source of truth. get_lesson_payment_info relays
// it back scoped to whatever lessons the caller can already see.
async function fetchPaymentTypes(
  supabase: Awaited<ReturnType<typeof createClient>>,
  lessonIds: string[],
  barnId: string
): Promise<Map<string, PaymentType | null>> {
  if (!lessonIds.length) return new Map()
  const { data, error } = await supabase.rpc('get_lesson_payment_info', {
    p_lesson_ids: lessonIds,
    p_barn_id: barnId,
  })
  if (error) throw error
  return new Map((data ?? []).map((row: { lesson_id: string; payment_type: PaymentType | null }) => [row.lesson_id, row.payment_type]))
}

// exertion_level has no column-level GRANT restriction on lesson_horses for
// authenticated (#937 review follow-up), so it can't be trimmed from the select
// string per role -- a rider's own session could still read it directly via
// PostgREST. get_lesson_horse_exertion_levels is a SECURITY DEFINER RPC that's
// the only way to read it now, at both the app layer and via a direct call --
// manager/trainer see every row; a rider sees a row only for a horse they hold
// lesson_read_privileges for (#999; get_horse_exertion_summary, barn-wide, stays
// manager/trainer-only).
async function fetchExertionLevels(
  supabase: Awaited<ReturnType<typeof createClient>>,
  lessonId: string,
  barnId: string
): Promise<Map<string, number>> {
  const { data, error } = await supabase.rpc('get_lesson_horse_exertion_levels', {
    p_lesson_id: lessonId,
    p_barn_id: barnId,
  })
  if (error) throw error
  return new Map((data ?? []).map((row: { horse_id: string; exertion_level: number }) => [row.horse_id, row.exertion_level]))
}

// rider_notes/private_notes have the same RLS gap #937 fixed for exertion_level:
// lesson_riders' row-level SELECT policies don't restrict columns, so trimming
// private_notes out of the select string per role (the pre-#999 fix) only closed
// the app's own code path -- a caller with row visibility could still read every
// rider's notes directly via PostgREST. get_lesson_rider_notes is the only way to
// read either column now: manager/trainer get every row's real values; any other
// caller with lesson visibility (enrolled or privileged rider) gets their own row's
// rider_notes and NULL for everyone else's, private_notes always NULL.
async function fetchRiderNotes(
  supabase: Awaited<ReturnType<typeof createClient>>,
  lessonId: string,
  barnId: string
): Promise<Map<string, { rider_notes: string | null; private_notes: string | null }>> {
  const { data, error } = await supabase.rpc('get_lesson_rider_notes', {
    p_lesson_id: lessonId,
    p_barn_id: barnId,
  })
  if (error) throw error
  return new Map(
    (data ?? []).map((row: { rider_id: string; rider_notes: string | null; private_notes: string | null }) => [
      row.rider_id,
      { rider_notes: row.rider_notes, private_notes: row.private_notes },
    ])
  )
}

export async function createLesson({
  barnId,
  instructorId,
  fee,
  lessonAt,
}: {
  barnId: string
  instructorId: string | null
  fee: number
  lessonAt: string
}): Promise<Lesson> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('lessons')
    .insert({ barn_id: barnId, instructor_id: instructorId, fee, lesson_at: lessonAt })
    .select()
    .single()

  if (error) throw error
  return data
}

async function overlayPaymentTypes(
  supabase: Awaited<ReturnType<typeof createClient>>,
  lessons: LessonWithDetails[],
  barnId: string
): Promise<LessonWithDetails[]> {
  const paymentMap = await fetchPaymentTypes(supabase, lessons.map((l) => l.id), barnId)
  return lessons.map((l) => ({ ...l, payment_type: paymentMap.get(l.id) ?? null }))
}

export async function getLessonsByBarn(
  barnId: string,
  userId: string,
  role: 'manager' | 'trainer' | 'rider'
): Promise<LessonWithDetails[]> {
  const supabase = await createClient()

  if (role === 'rider') {
    const lessonIds = await getRiderEnrolledLessonIds(barnId, userId)
    if (!lessonIds.length) return []

    const { data: lessons, error: lessonsError } = await supabase
      .from('lessons')
      .select('*')
      .in('id', lessonIds)
      .eq('barn_id', barnId)
      .order('lesson_at', { ascending: false })
    if (lessonsError) throw lessonsError
    const withDetails = await hydrateParticipants(supabase, lessons ?? [], barnId)
    return overlayPaymentTypes(supabase, withDetails, barnId)
  }

  const { data: lessons, error: lessonsError } = await supabase
    .from('lessons')
    .select('*')
    .eq('barn_id', barnId)
    .order('lesson_at', { ascending: false })
  if (lessonsError) throw lessonsError
  const withDetails = await hydrateParticipants(supabase, lessons, barnId)
  return overlayPaymentTypes(supabase, withDetails, barnId)
}

// Hydrates a set of getScheduleForRange lesson ids into display data. No role param -- RLS
// still applies to this query independently, and the id list itself is already role-scoped
// by the caller (scopeScheduleItemsForRole + getScheduleForRange).
export async function getLessonsByIds(barnId: string, ids: string[]): Promise<LessonWithDetails[]> {
  if (!ids.length) return []
  const supabase = await createClient()
  const { data: lessons, error } = await supabase
    .from('lessons')
    .select('*')
    .eq('barn_id', barnId)
    .in('id', ids)
  if (error) throw error
  return hydrateParticipants(supabase, lessons ?? [], barnId)
}

export async function getLessonById(lessonId: string, barnId: string, _role: Role): Promise<LessonDetail | null> {
  const supabase = await createClient()
  // exertion_level and rider_notes/private_notes are never selected here directly for
  // any role -- both are merged in separately via fetchExertionLevels/fetchRiderNotes
  // above, the only column-safe way to read them (see those functions' comments for why).
  const riderSelect = 'rider_id, cancellation_notes, cancelled_at, barn_memberships ( user_id )'
  const horseSelect = 'horse_notes, horses ( id, name, is_active, is_available, unavailability_reason )'
  const { data, error } = await supabase
    .from('lessons')
    .select(`
      *,
      lesson_horses ( ${horseSelect} ),
      lesson_riders ( ${riderSelect} )
    `)
    .eq('id', lessonId)
    .eq('barn_id', barnId)
    .maybeSingle()

  if (error) throw error
  if (!data) return null

  type RawLessonHorse = {
    horse_notes: string | null
    horses: { id: string; name: string; is_active?: boolean; is_available?: boolean; unavailability_reason?: string | null } | null
  }

  type RawLessonRider = {
    rider_id: string
    cancellation_notes: string | null
    cancelled_at: string | null
    barn_memberships: { user_id: string | null } | null
  }

  const lessonData = data

  const rawHorses = lessonData.lesson_horses as RawLessonHorse[]
  // #999: get_lesson_horse_exertion_levels now filters rows by privilege at the DB
  // layer (manager/trainer see everything, a rider sees only a horse they hold
  // lesson_read_privileges for), so this no longer needs its own role branch.
  const exertionByHorseId = await fetchExertionLevels(supabase, lessonId, barnId)
  const lesson_horses = rawHorses.map((lh) => ({
    ...lh,
    exertion_level: lh.horses ? exertionByHorseId.get(lh.horses.id) : undefined,
  }))

  const rawRiders = lessonData.lesson_riders as RawLessonRider[]
  // rider_id is a plain lesson_riders column, unlike the nested barn_memberships embed —
  // PostgREST enforces barn_memberships RLS on that embed independently, which returns null
  // for a co-rider's row when the caller is a rider (only barn_memberships_read_own applies).
  const riderMembershipIds = rawRiders.map((lr) => lr.rider_id)

  // instructor_id is itself a barn_memberships.id. Same RLS gap as the rider embed above —
  // resolved via getMembershipByIdForBarn's direct-query + RPC fallback instead of a nested
  // instructor embed, in one shot that yields both user_id and profile_id — kept out of the
  // resolveMemberNames batch below so a rider caller doesn't trigger the same
  // get_active_barn_member_summaries RPC fallback twice for the same instructor.
  const instructorId = lessonData.instructor_id
  const instructorMembership = instructorId ? await getMembershipByIdForBarn(instructorId, barnId, supabase) : null
  const instructor_user_id = instructorMembership?.user_id ?? null
  const instructorProfile = instructorMembership ? await getProfileById(instructorMembership.profile_id) : null
  const instructor_name = instructorMembership
    ? (instructorProfile ? `${instructorProfile.first_name} ${instructorProfile.last_name}` : instructorId)
    : null

  const membershipMap = await resolveMemberNames(riderMembershipIds, barnId, supabase)
  // #999 review follow-up: get_lesson_rider_notes now does the manager/trainer-vs-own-row
  // filtering at the DB layer (same as fetchExertionLevels above), so normalizeLr just
  // reads its result straight through rather than branching on role/callerMembershipId itself.
  const riderNotesById = await fetchRiderNotes(supabase, lessonId, barnId)

  type NormalizedLr = {
    rider_notes: string | null
    private_notes: string | null
    cancellation_notes: string | null
    cancelled_at: string | null
    barn_membership: { id: string; user_id: string | null; name: string } | null
  }

  const normalizeLr = (lr: RawLessonRider): NormalizedLr => ({
    rider_notes: riderNotesById.get(lr.rider_id)?.rider_notes ?? null,
    private_notes: riderNotesById.get(lr.rider_id)?.private_notes ?? null,
    cancellation_notes: lr.cancellation_notes ?? null,
    cancelled_at: lr.cancelled_at ?? null,
    barn_membership: {
      id: lr.rider_id,
      user_id: lr.barn_memberships?.user_id ?? null,
      name: membershipMap.get(lr.rider_id) ?? lr.rider_id,
    },
  })

  const paymentMap = await fetchPaymentTypes(supabase, [lessonId], barnId)

  return {
    ...lessonData,
    lesson_horses,
    payment_type: paymentMap.get(lessonId) ?? null,
    instructor_name,
    instructor_user_id,
    lesson_riders: rawRiders.map(normalizeLr) as NormalizedLr[],
  } as LessonDetail
}

export async function cancelLesson(lessonId: string, barnId: string, notes?: string | null, isLate = false): Promise<void> {
  const supabase = await createClient()
  const { error } = await supabase.rpc('cancel_lesson_with_transactions', {
    p_lesson_id: lessonId,
    p_barn_id: barnId,
    p_notes: notes ?? null,
    p_is_late: isLate,
  })

  if (error) throw error
}

export async function deleteLesson(lessonId: string, barnId: string, deleteCollectedTransactions = false): Promise<void> {
  const supabase = await createClient()
  const { error } = await supabase.rpc('delete_lesson_with_transactions', {
    p_lesson_id: lessonId,
    p_barn_id: barnId,
    p_delete_collected: deleteCollectedTransactions,
  })

  if (error) throw error
}

export async function collectLessonPayment(lessonId: string, barnId: string, paymentType: PaymentType | null): Promise<void> {
  const supabase = await createClient()
  const { error } = await supabase.rpc('collect_lesson_payment', {
    p_lesson_id: lessonId,
    p_barn_id: barnId,
    p_payment_type: paymentType,
  })

  if (error) throw error
}

export async function updateLesson(
  lessonId: string,
  barnId: string,
  updates: Partial<Pick<Lesson, 'fee' | 'lesson_at' | 'jumping' | 'lesson_type' | 'tier_name' | 'cancellation_notes'>>
): Promise<Lesson> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('lessons')
    .update(updates)
    .eq('id', lessonId)
    .eq('barn_id', barnId)
    .select()
    .single()

  if (error) throw error
  if (!data) throw new Error('lesson not found')
  return data
}

