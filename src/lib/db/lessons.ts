import { createClient } from '@/lib/supabase/server'
import { getRiderEnrolledLessonIds, hydrateParticipants } from './lesson-participants'
import { getMembershipByIdForBarn, getUserMembership, resolveMemberNames } from './barn-memberships'
import { getProfileById } from './profiles'
import type { Lesson, LessonDetail, LessonWithDetails, PaymentType, Role } from './types'

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
    return hydrateParticipants(supabase, lessons ?? [], barnId)
  }

  const { data: lessons, error: lessonsError } = await supabase
    .from('lessons')
    .select('*')
    .eq('barn_id', barnId)
    .order('lesson_at', { ascending: false })
  if (lessonsError) throw lessonsError
  return hydrateParticipants(supabase, lessons, barnId)
}

export async function getLessonById(lessonId: string, barnId: string, role: Role, callerMembershipId?: string): Promise<LessonDetail | null> {
  const supabase = await createClient()
  const riderSelect = role === 'rider'
    ? 'rider_id, rider_notes, cancellation_notes, cancelled_at, barn_memberships ( user_id )'
    : 'rider_id, rider_notes, private_notes, cancellation_notes, cancelled_at, barn_memberships ( user_id )'
  const { data, error } = await supabase
    .from('lessons')
    .select(`
      *,
      lesson_horses ( horse_notes, exertion_level, horses ( id, name, is_active, is_available, unavailability_reason ) ),
      lesson_riders ( ${riderSelect} )
    `)
    .eq('id', lessonId)
    .eq('barn_id', barnId)
    .maybeSingle()

  if (error) throw error
  if (!data) return null

  type RawLessonRider = {
    rider_id: string
    rider_notes: string | null
    private_notes?: string | null
    cancellation_notes: string | null
    cancelled_at: string | null
    barn_memberships: { user_id: string | null } | null
  }

  const lessonData = data

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

  type NormalizedLr = {
    rider_notes: string | null
    private_notes: string | null
    cancellation_notes: string | null
    cancelled_at: string | null
    barn_membership: { id: string; user_id: string | null; name: string } | null
  }

  const normalizeLr = (lr: RawLessonRider): NormalizedLr => ({
    rider_notes: lr.rider_notes,
    private_notes: (lr as { private_notes?: string | null }).private_notes ?? null,
    cancellation_notes: lr.cancellation_notes ?? null,
    cancelled_at: lr.cancelled_at ?? null,
    barn_membership: {
      id: lr.rider_id,
      user_id: lr.barn_memberships?.user_id ?? null,
      name: membershipMap.get(lr.rider_id) ?? lr.rider_id,
    },
  })

  const base = {
    ...lessonData,
    instructor_name,
    instructor_user_id,
    lesson_riders: rawRiders.map(normalizeLr) as NormalizedLr[],
  }

  if (role === 'rider') {
    return {
      ...base,
      lesson_riders: base.lesson_riders.map((lr: NormalizedLr) => ({
        ...lr,
        private_notes: null,
        // Anchored to the caller's own membership ID (a plain, always-present column) rather
        // than the RLS-gated barn_memberships embed's user_id, so masking doesn't depend on
        // barn_memberships_read_own continuing to cover the caller's own row.
        rider_notes: lr.barn_membership?.id === callerMembershipId ? lr.rider_notes : null,
      })),
    } as LessonDetail
  }
  return base as LessonDetail
}

export async function cancelLesson(lessonId: string, barnId: string, notes?: string | null, isLate = false): Promise<void> {
  const supabase = await createClient()
  const updates: { cancelled_at: string; cancellation_notes: string | null; fee?: number; payment_type?: null } = {
    cancelled_at: new Date().toISOString(),
    cancellation_notes: notes ?? null,
  }
  if (!isLate) {
    updates.fee = 0
    updates.payment_type = null
  }
  const { error } = await supabase
    .from('lessons')
    .update(updates)
    .eq('id', lessonId)
    .eq('barn_id', barnId)

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
  updates: Partial<Pick<Lesson, 'fee' | 'lesson_at' | 'jumping' | 'lesson_type' | 'payment_type' | 'tier_name' | 'cancellation_notes'>>
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

export async function getUpcomingLessons(
  barnId: string,
  from: string,
  to: string,
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
      .gte('lesson_at', from)
      .lt('lesson_at', to)
      .order('lesson_at', { ascending: true })
    if (lessonsError) throw lessonsError
    return hydrateParticipants(supabase, lessons ?? [], barnId)
  }

  const callerMembership = await getUserMembership(userId, barnId)
  if (!callerMembership) return []

  const { data: lessons, error: lessonsError } = await supabase
    .from('lessons')
    .select('*')
    .eq('barn_id', barnId)
    .eq('instructor_id', callerMembership.id)
    .gte('lesson_at', from)
    .lt('lesson_at', to)
    .order('lesson_at', { ascending: true })
  if (lessonsError) throw lessonsError
  return hydrateParticipants(supabase, lessons, barnId)
}
