import { createClient } from '@/lib/supabase/server'
import { getRiderEnrolledLessonIds, hydrateParticipants } from './lesson-participants'
import { getUserMembership } from './barn-memberships'
import type { Lesson, LessonDetail, LessonWithDetails, Role } from './types'

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
    ? 'rider_notes, cancellation_notes, cancelled_at, barn_memberships ( id, user_id, profile_id )'
    : 'rider_notes, private_notes, cancellation_notes, cancelled_at, barn_memberships ( id, user_id, profile_id )'
  const { data, error } = await supabase
    .from('lessons')
    .select(`
      *,
      lesson_horses ( horse_notes, exertion_level, horses ( id, name ) ),
      lesson_riders ( ${riderSelect} )
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
    barn_memberships: { id: string; user_id: string | null; profile_id: string } | null
  }

  // Resolve rider names via profile_id so managed members (user_id = null) get their name
  const riderProfileIds = [...new Set(
    (data.lesson_riders as RawLessonRider[])
      .map((lr) => lr.barn_memberships?.profile_id)
      .filter((id): id is string => id != null)
  )]

  const { data: riderProfilesData, error: riderProfilesError } = riderProfileIds.length
    ? await supabase.from('profiles').select('id, first_name, last_name').in('id', riderProfileIds)
    : { data: [] as { id: string; first_name: string; last_name: string }[], error: null }

  if (riderProfilesError) throw riderProfilesError

  const riderProfileMap = new Map((riderProfilesData ?? []).map((p) => [p.id, p]))

  // instructor_id is a barn_memberships.id — resolve via profile_id so a managed
  // (stub, user_id = null) trainer's name still resolves, mirroring rider resolution above
  let instructor_name: string | null = null
  let instructor_user_id: string | null = null
  if (data.instructor_id) {
    const { data: im, error: imError } = await supabase
      .from('barn_memberships').select('user_id, profile_id').eq('barn_id', barnId).eq('id', data.instructor_id).maybeSingle()
    if (imError) throw imError
    if (im) {
      instructor_user_id = im.user_id
      const { data: ip, error: ipError } = await supabase
        .from('profiles').select('first_name, last_name').eq('id', im.profile_id).maybeSingle()
      if (ipError) throw ipError
      if (ip) instructor_name = `${ip.first_name} ${ip.last_name}`
    }
  }

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
          name: lr.barn_memberships.profile_id && riderProfileMap.has(lr.barn_memberships.profile_id)
            ? `${riderProfileMap.get(lr.barn_memberships.profile_id)!.first_name} ${riderProfileMap.get(lr.barn_memberships.profile_id)!.last_name}`
            : lr.barn_memberships.id,
        }
      : null,
  })

  const base = {
    ...data,
    instructor_name,
    instructor_user_id,
    lesson_riders: (data.lesson_riders as RawLessonRider[]).map(normalizeLr) as NormalizedLr[],
  }

  if (role === 'rider') {
    return {
      ...base,
      lesson_riders: base.lesson_riders.map((lr: NormalizedLr) => ({
        ...lr,
        private_notes: null,
        rider_notes: lr.barn_membership?.user_id === userId ? lr.rider_notes : null,
        cancellation_notes: lr.barn_membership?.user_id === userId ? lr.cancellation_notes : null,
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

export async function updateLesson(
  lessonId: string,
  barnId: string,
  updates: Partial<Pick<Lesson, 'fee' | 'lesson_at' | 'jumping' | 'lesson_type' | 'payment_type' | 'tier_name'>>
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
