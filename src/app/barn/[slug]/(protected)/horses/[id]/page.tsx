import { notFound } from 'next/navigation'
import { requireMembership } from '@/lib/auth/guard'
import { getHorseById, getHorseProjectedExhaustion, resolveExhaustionThresholds, getUpcomingLessonsForHorse } from '@/lib/db/horses'
import { getDocumentsWithUrls } from '@/lib/db/documents'
import { getSignedUrl } from '@/lib/db/document-storage'
import { resolveMemberNames } from '@/lib/db/member-names'
import { getActiveMembersWithProfiles } from '@/lib/db/barn-memberships'
import { getHorsePrivileges, getMyHorseDocumentPrivilege, getMyHorseLessonReadPrivilege } from '@/lib/db/member-horse-privileges'
import { HorseManagerForm } from './HorseManagerForm'
import { HorseNotesForm } from './HorseNotesForm'
import { HorseAccessSection } from './HorseAccessSection'
import { ReminderDateCell } from '@/components/documents/ReminderDateCell'
import { ReminderDueBadge } from '@/components/documents/ReminderDueBadge'
import { Th, Td, TableActions } from '@/components/ui/Table'
import { Button } from '@/components/ui/Button'
import { Card, cardBaseClass } from '@/components/ui/Card'
import { EmptyState } from '@/components/EmptyState'
import { ExhaustionBar } from '@/components/ExhaustionBar'
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
  const canSeeExhaustion = role === 'manager' || role === 'trainer' || myLessonReadPrivilege
  const isManager = role === 'manager'
  const isOwner = horse.owning_member_id === membership.id
  const isPhotoLockedToOwner = horse.owning_member_id !== null && horse.photo_uploaded_by === horse.owning_member_id
  const canWritePhoto = isOwner || (isManager && !isPhotoLockedToOwner)

  const docsWithUrls = canSeeDocuments ? await getDocumentsWithUrls('horse', horse.id, barn.id) : []
  const exhaustionThresholds = canSeeExhaustion ? resolveExhaustionThresholds(horse, barn) : null
  const exhaustionRows = canSeeExhaustion ? await getHorseProjectedExhaustion(horse.id, barn.id, new Date(), barn.timezone) : []
  const upcomingLessons = canSeeExhaustion ? await getUpcomingLessonsForHorse(horse.id, barn.id, barn.timezone) : []
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
    .sort((a, b) => a.name.localeCompare(b.name))
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

  return (
    <main className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="mb-6 text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
        {horse.name}
      </h1>

      {ownerName && (
        <p className="mb-6 text-sm text-zinc-600 dark:text-zinc-400">
          Owner:{' '}
          <a
            href={`/barn/${slug}/members/${horse.owning_member_id}`}
            className="underline text-zinc-900 hover:text-zinc-600 dark:text-zinc-50 dark:hover:text-zinc-300"
          >
            {ownerName}
          </a>
        </p>
      )}

      <section className="mb-10">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Photo
          </h2>
          {canWritePhoto && (
            photoUrl ? (
              <div className="flex items-center gap-3">
                <Button href={photoHref} size="sm">Replace Photo</Button>
                <form action={boundDeletePhotoAction!}>
                  <Button type="submit" variant="danger" size="sm">
                    Remove
                  </Button>
                </form>
              </div>
            ) : (
              <Button href={photoHref} size="sm">Set Photo</Button>
            )
          )}
        </div>
        {photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- signed URL, not an optimizable static asset
          <img src={photoUrl} alt={horse.name} className="h-48 w-auto rounded-md" />
        ) : (
          <EmptyState heading="No photo yet" subtext="A photo helps riders identify this horse at a glance." />
        )}
      </section>

      {role !== 'manager' && (
        <dl className="divide-y divide-zinc-200 dark:divide-zinc-800">
          <div className="flex flex-col gap-1 py-4">
            <dt className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Status</dt>
            <dd className="text-sm text-zinc-900 dark:text-zinc-50">
              {horse.is_available ? 'Available' : 'Unavailable'}
            </dd>
          </div>

          {horse.registered_name && (
            <div className="flex flex-col gap-1 py-4">
              <dt className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Registered Name</dt>
              <dd className="text-sm text-zinc-900 dark:text-zinc-50">{horse.registered_name}</dd>
            </div>
          )}

          {!horse.is_available && horse.unavailability_reason && (
            <div className="flex flex-col gap-1 py-4">
              <dt className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Reason</dt>
              <dd className="text-sm text-zinc-900 dark:text-zinc-50">{horse.unavailability_reason}</dd>
            </div>
          )}

          {!isOwner && horse.feed_notes && (
            <div className="flex flex-col gap-1 py-4">
              <dt className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Feed Notes</dt>
              <dd className="text-sm text-zinc-900 dark:text-zinc-50">{horse.feed_notes}</dd>
            </div>
          )}

          {!isOwner && horse.medication_notes && (
            <div className="flex flex-col gap-1 py-4">
              <dt className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Medication Notes</dt>
              <dd className="text-sm text-zinc-900 dark:text-zinc-50">{horse.medication_notes}</dd>
            </div>
          )}
        </dl>
      )}

      {role !== 'manager' && isOwner && (
        <section className="mt-6">
          <HorseNotesForm horse={horse} action={boundUpdateHorseNotesAction} />
        </section>
      )}

      {role === 'manager' && (
        <section className="mt-6">
          <HorseManagerForm horse={horse} barn={barn} action={boundUpdateAction} />
        </section>
      )}

      {role === 'manager' && (
        <section className="mt-10">
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
        </section>
      )}

      {canSeeExhaustion && exhaustionThresholds && (
        <section className="mt-10">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Exhaustion
          </h2>
          <ExhaustionBar existingRows={exhaustionRows} thresholds={exhaustionThresholds} />
        </section>
      )}

      {canSeeDocuments && (
        <section className="mt-10">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              Documents
            </h2>
            {canWriteDocuments && (
              <Button href={`/barn/${slug}/documents/new?entity=horse&id=${horse.id}`}>Add Document</Button>
            )}
          </div>
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
        </section>
      )}

      {canSeeExhaustion && (
        <section className="mt-10">
          <details className={`relative ${cardBaseClass}`}>
            <summary className="flex min-h-11 cursor-pointer items-center px-4 py-3">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                Upcoming Lessons
              </h2>
            </summary>
            <div className="border-t border-zinc-200 px-4 py-4 dark:border-zinc-700">
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
            </div>
          </details>
        </section>
      )}
    </main>
  )
}
