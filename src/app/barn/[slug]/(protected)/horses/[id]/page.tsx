import { notFound } from 'next/navigation'
import { requireMembership } from '@/lib/auth/guard'
import { getHorseById, getUpcomingLessonsForHorse } from '@/lib/db/horses'
import { getDocumentsWithUrls } from '@/lib/db/documents'
import { getSignedUrl } from '@/lib/db/document-storage'
import { resolveMemberNames } from '@/lib/db/member-names'
import { getActiveMembersWithProfiles } from '@/lib/db/barn-memberships'
import { getHorsePrivileges, getMyHorseDocumentPrivilege, getMyHorseLessonReadPrivilege } from '@/lib/db/member-horse-privileges'
import { HorseManagerForm } from './HorseManagerForm'
import { HorseNotesForm } from './HorseNotesForm'
import { HorseAccessSection } from './HorseAccessSection'
import { horseStatusBadge } from '../HorseCard'
import { ReminderDateCell } from '@/components/documents/ReminderDateCell'
import { ReminderDueBadge } from '@/components/documents/ReminderDueBadge'
import { Th, Td, TableActions } from '@/components/ui/Table'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { AccordionSection } from '@/components/ui/AccordionSection'
import { EmptyState } from '@/components/EmptyState'
import { formatBarnDateTime } from '@/lib/format-date'
import { RECORD_TYPE_LABELS } from '@/lib/document-record-types'
import { barnToday } from '@/lib/barn-timezone'
import {
  updateHorseAction,
  deleteHorseDocumentAction,
  updateHorseDocumentReminderDateAction,
  deleteHorsePhotoAction,
  grantHorseAccessAction,
  updateHorseAccessDocumentAction,
  updateHorseAccessLessonAction,
  revokeHorseAccessAction,
  setHorseOwnerAction,
  updateHorseNotesAction,
} from './actions'

/**
 * Stands in for the photo at the same footprint the real one occupies (#1390). The shared
 * `EmptyState` is the wrong shape here — its centred `py-12` column is taller than the header
 * row it would sit in — but the `aria-hidden` svg is the same placeholder affordance.
 */
function PhotoPlaceholder() {
  return (
    <div className="flex h-32 w-32 shrink-0 items-center justify-center rounded-md bg-zinc-100 dark:bg-zinc-800">
      <svg
        xmlns="http://www.w3.org/2000/svg"
        className="h-10 w-10 text-zinc-300 dark:text-zinc-600"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={1.5}
        aria-hidden="true"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909M18 9.75h.008v.008H18V9.75ZM3 19.5h18a1.5 1.5 0 0 0 1.5-1.5V6A1.5 1.5 0 0 0 21 4.5H3A1.5 1.5 0 0 0 1.5 6v12A1.5 1.5 0 0 0 3 19.5Z"
        />
      </svg>
    </div>
  )
}

export default async function HorseDetailPage({
  params,
}: {
  params: Promise<{ slug: string; id: string }>
}) {
  const { slug, id } = await params
  const { barn, membership } = await requireMembership(slug, ['manager', 'trainer', 'rider'])

  const horse = await getHorseById(id, barn.id)
  if (!horse) notFound()

  const role = membership.role

  const myDocumentPrivilege = role === 'rider' ? await getMyHorseDocumentPrivilege(horse.id, barn.id) : null
  const myLessonReadPrivilege = role === 'rider' ? await getMyHorseLessonReadPrivilege(horse.id, barn.id) : false

  const canSeeDocuments = role === 'manager' || role === 'trainer' || myDocumentPrivilege !== 'none'
  const canWriteDocuments = role === 'manager' || role === 'trainer' || myDocumentPrivilege === 'write'
  // Renamed from canSeeExhaustion in #1390: with the bar gone from this page, the lesson-read
  // privilege now gates Upcoming Lessons alone.
  const canSeeSchedule = role === 'manager' || role === 'trainer' || myLessonReadPrivilege
  const isManager = role === 'manager'
  const isOwner = horse.owning_member_id === membership.id
  const isPhotoLockedToOwner = horse.owning_member_id !== null && horse.photo_uploaded_by === horse.owning_member_id
  const canWritePhoto = isOwner || (isManager && !isPhotoLockedToOwner)
  const canWriteNotes = isManager || isOwner

  const docsWithUrls = canSeeDocuments ? await getDocumentsWithUrls('horse', horse.id, barn.id) : []
  const upcomingLessons = canSeeSchedule ? await getUpcomingLessonsForHorse(horse.id, barn.id, barn.timezone) : []
  const photoUrl = horse.photo_path ? await getSignedUrl(horse.photo_path) : null

  const ownerName = horse.owning_member_id
    ? (await resolveMemberNames([horse.owning_member_id], barn.id)).get(horse.owning_member_id) ?? null
    : null

  const allMembers = isManager
    ? [
        ...(await getActiveMembersWithProfiles(barn.id, 'manager')),
        ...(await getActiveMembersWithProfiles(barn.id, 'trainer')),
        ...(await getActiveMembersWithProfiles(barn.id, 'rider')),
      ].map((m) => ({ membershipId: m.membershipId, name: m.name }))
    : []

  const privileges = isManager ? await getHorsePrivileges(horse.id, barn.id) : []
  const privilegeNames = privileges.length > 0
    ? await resolveMemberNames(privileges.map((p) => p.member_id), barn.id)
    : new Map<string, string>()
  // #1286: the Access table renders one row per grant, and `getHorsePrivileges` can't order
  // them — `member_horse_privileges` carries only `member_id`, with the names resolved just
  // above. Alphabetical, matching `getHorsesByBarn`'s `ORDER BY h.name`.
  const grants = privileges
    .map((p) => ({
      id: p.id,
      memberId: p.member_id,
      name: privilegeNames.get(p.member_id) ?? p.member_id,
      documentPrivileges: p.document_privileges,
      lessonReadPrivileges: p.lesson_read_privileges,
    }))
    .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id))
  const grantedMemberIds = new Set(privileges.map((p) => p.member_id))
  const availableMembers = allMembers.filter((m) => !grantedMemberIds.has(m.membershipId))

  const boundUpdateAction = updateHorseAction.bind(null, slug, horse.id)
  const boundDeleteAction = deleteHorseDocumentAction.bind(null, slug, horse.id)
  const boundReminderDateAction = updateHorseDocumentReminderDateAction.bind(null, slug, horse.id)
  const boundDeletePhotoAction = horse.photo_path
    ? deleteHorsePhotoAction.bind(null, slug, horse.id)
    : null
  const boundGrantAccessAction = grantHorseAccessAction.bind(null, slug, horse.id)
  const boundUpdateAccessDocumentAction = updateHorseAccessDocumentAction.bind(null, slug, horse.id)
  const boundUpdateAccessLessonAction = updateHorseAccessLessonAction.bind(null, slug, horse.id)
  const boundRevokeAccessAction = revokeHorseAccessAction.bind(null, slug, horse.id)
  const boundSetHorseOwnerAction = setHorseOwnerAction.bind(null, slug, horse.id)
  const boundUpdateHorseNotesAction = updateHorseNotesAction.bind(null, slug, horse.id)
  const photoHref = `/barn/${slug}/documents/new?entity=horse&id=${horse.id}&type=photo`

  const hasNotes = horse.feed_notes !== null || horse.medication_notes !== null
  const usesBarnDefaults =
    horse.exhaustion_threshold_moderate === null && horse.exhaustion_threshold_high === null

  return (
    <main className="mx-auto max-w-3xl px-4 py-12">
      {/* Identity header (#1390) — always visible, above the accordions. It carries everything a
          visitor needs to know they're on the right horse's page: photo, name, status, owner. */}
      <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-start sm:gap-6">
        {photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- signed URL, not an optimizable static asset
          <img src={photoUrl} alt={horse.name} className="h-32 w-auto shrink-0 rounded-md" />
        ) : (
          <PhotoPlaceholder />
        )}

        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
              {horse.name}
            </h1>
            {horseStatusBadge(horse)}
          </div>

          {horse.registered_name && (
            <p className="text-sm text-zinc-500 dark:text-zinc-400">{horse.registered_name}</p>
          )}

          {!horse.is_available && horse.unavailability_reason && (
            <p className="text-sm text-zinc-600 dark:text-zinc-400">{horse.unavailability_reason}</p>
          )}

          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            {ownerName ? (
              <a
                href={`/barn/${slug}/members/${horse.owning_member_id}`}
                className="underline text-zinc-900 hover:text-zinc-600 dark:text-zinc-50 dark:hover:text-zinc-300"
              >
                {ownerName}
              </a>
            ) : (
              'No owner set'
            )}
          </p>

          {canWritePhoto && (
            <div className="mt-2 flex flex-wrap items-center gap-3">
              {photoUrl ? (
                <>
                  <Button href={photoHref} size="sm">Replace Photo</Button>
                  <form action={boundDeletePhotoAction!}>
                    <Button type="submit" variant="danger" size="sm">
                      Remove
                    </Button>
                  </form>
                </>
              ) : (
                <Button href={photoHref} size="sm">Set Photo</Button>
              )}
            </div>
          )}
        </div>
      </header>

      <AccordionSection
        title="Feed & Medication"
        hint={hasNotes ? undefined : 'not set'}
        defaultOpen
      >
        {canWriteNotes ? (
          <HorseNotesForm horse={horse} action={boundUpdateHorseNotesAction} />
        ) : hasNotes ? (
          <dl className="flex flex-col gap-4">
            {horse.feed_notes && (
              <div className="flex flex-col gap-1">
                <dt className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Feed Notes</dt>
                <dd className="text-sm text-zinc-900 dark:text-zinc-50">{horse.feed_notes}</dd>
              </div>
            )}
            {horse.medication_notes && (
              <div className="flex flex-col gap-1">
                <dt className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Medication Notes</dt>
                <dd className="text-sm text-zinc-900 dark:text-zinc-50">{horse.medication_notes}</dd>
              </div>
            )}
          </dl>
        ) : (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            No feed or medication notes have been recorded for this horse.
          </p>
        )}
      </AccordionSection>

      {canSeeSchedule && (
        <AccordionSection title="Upcoming Lessons" hint={String(upcomingLessons.length)}>
          {upcomingLessons.length > 0 ? (
            <ul className="flex flex-col gap-2">
              {upcomingLessons.map((l) => (
                <li key={l.id}>
                  <Card href={`/barn/${slug}/lessons/${l.id}`} className="p-4">
                    <span className="text-sm font-medium text-zinc-900 dark:text-zinc-50">
                      {formatBarnDateTime(l.lessonAt)}
                    </span>
                  </Card>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState heading="No upcoming lessons" subtext="Scheduled lessons for this horse will appear here." />
          )}
        </AccordionSection>
      )}

      {canSeeDocuments && (
        <AccordionSection
          title="Documents"
          hint={String(docsWithUrls.length)}
          headerExtra={
            canWriteDocuments
              ? <Button href={`/barn/${slug}/documents/new?entity=horse&id=${horse.id}`} size="sm">Add Document</Button>
              : undefined
          }
        >
          {docsWithUrls.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr>
                    <Th>Type</Th>
                    <Th>Notes</Th>
                    <Th>Link</Th>
                    <Th>Reminder Date</Th>
                    {role === 'manager' && <Th align="right">Actions</Th>}
                  </tr>
                </thead>
                <tbody>
                  {docsWithUrls.map(({ doc, signedUrl }) => (
                    <tr key={doc.id}>
                      <Td>{RECORD_TYPE_LABELS[doc.record_type]}</Td>
                      <Td tone="secondary">{doc.notes ?? '—'}</Td>
                      <Td>
                        <a
                          href={signedUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="underline text-zinc-900 hover:text-zinc-600 dark:text-zinc-50 dark:hover:text-zinc-300"
                        >
                          {doc.file_name}
                        </a>
                      </Td>
                      <Td tone="secondary">
                        <div className="flex items-center gap-2">
                          {role === 'manager' ? (
                            <ReminderDateCell docId={doc.id} initialValue={doc.reminder_date} action={boundReminderDateAction} />
                          ) : (
                            doc.reminder_date ?? '—'
                          )}
                          <ReminderDueBadge reminderDate={doc.reminder_date} today={barnToday(barn.timezone)} />
                        </div>
                      </Td>
                      {role === 'manager' && (
                        <TableActions>
                          <form action={boundDeleteAction.bind(null, doc.id, doc.storage_path)}>
                            <Button type="submit" variant="danger" size="sm">
                              Delete
                            </Button>
                          </form>
                        </TableActions>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState heading="No documents yet" subtext="Documents you upload will appear here." />
          )}
        </AccordionSection>
      )}

      {isManager && (
        <AccordionSection
          title="Access"
          hint={`${grants.length} member${grants.length === 1 ? '' : 's'}`}
        >
          <HorseAccessSection
            grants={grants}
            availableMembers={availableMembers}
            ownerMemberId={horse.owning_member_id}
            onGrant={boundGrantAccessAction}
            onUpdateDocument={boundUpdateAccessDocumentAction}
            onUpdateLesson={boundUpdateAccessLessonAction}
            onRevoke={boundRevokeAccessAction}
            onSetOwner={boundSetHorseOwnerAction}
          />
        </AccordionSection>
      )}

      {isManager && (
        <AccordionSection title="Horse Settings" hint={usesBarnDefaults ? 'barn defaults' : 'custom'}>
          <HorseManagerForm horse={horse} barn={barn} action={boundUpdateAction} />
        </AccordionSection>
      )}
    </main>
  )
}
