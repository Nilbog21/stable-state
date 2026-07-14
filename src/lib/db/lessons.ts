import { createClient } from '@/lib/supabase/server'
import { getRiderEnrolledLessonIds, hydrateParticipants } from './lesson-participants'
import { getUserMembership, resolveMemberNames } from './barn-memberships'
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

export async function getLessonById(lessonId: string, barnId: string, role: Role, userId?: string): Promise<LessonDetail | null> {
  const supabase = await createClient()
  const riderSelect = role === 'rider'
    ? 'rider_notes, cancellation_notes, cancelled_at, barn_memberships ( id, user_id )'
    : 'rider_notes, private_notes, cancellation_notes, cancelled_at, barn_memberships ( id, user_id )'
  const { data, error } = await supabase
    .from('lessons')
    .select(`
      *,
      lesson_horses ( horse_notes, exertion_level, horses ( id, name, is_active, is_available ) ),
      lesson_riders ( ${riderSelect} ),
      instructor_membership:barn_memberships!lessons_barn_id_instructor_id_fkey ( user_id )
    `)
    .eq('id', lessonId)
    .eq('barn_id', barnId)
    .maybeSingle()

  if (error) throw error
  if (!data) return null

  type RawLessonRider = {
    rider_notes: string | null
    private_notes?: string | null
    cancellation_notes: string | null
    cancelled_at: string | null
    barn_memberships: { id: string; user_id: string | null } | null
  }

  const { instructor_membership, ...lessonData } = data as typeof data & {
    instructor_membership: { user_id: string | null } | null
  }

  const rawRiders = lessonData.lesson_riders as RawLessonRider[]
  const riderMembershipIds = rawRiders
    .map((lr) => lr.barn_memberships?.id)
    .filter((id): id is string => id != null)

  // instructor_id is itself a barn_memberships.id, so it's resolved by the same batched call
  const instructorId = lessonData.instructor_id
  const membershipMap = await resolveMemberNames(
    instructorId ? [...riderMembershipIds, instructorId] : riderMembershipIds,
    barnId,
    supabase
  )

  const instructor_name = instructorId ? membershipMap.get(instructorId) ?? null : null
  const instructor_user_id = instructor_membership?.user_id ?? null

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
    barn_membership: lr.barn_memberships
      ? {
          id: lr.barn_memberships.id,
          user_id: lr.barn_memberships.user_id,
          name: membershipMap.get(lr.barn_memberships.id) ?? lr.barn_memberships.id,
        }
      : null,
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
        rider_notes: lr.barn_membership?.user_id === userId ? lr.rider_notes : null,
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
