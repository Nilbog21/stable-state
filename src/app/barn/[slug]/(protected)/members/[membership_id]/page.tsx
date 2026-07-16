import { notFound } from 'next/navigation'
import { requireMembership } from '@/lib/auth/guard'
import { getMembershipByIdForBarn } from '@/lib/db/barn-memberships'
import { getProfileById } from '@/lib/db/profiles'
import { getDocumentsWithUrls } from '@/lib/db/documents'
import { getActiveAgreementsForRider } from '@/lib/db/agreements'
import { resolveHorseNames } from '@/lib/db/horses'
import { canManage } from '@/lib/document-target'
import { Card } from '@/components/ui/Card'
import { ContactInfoForm } from './ContactInfoForm'
import { DeleteDocumentButton } from './DeleteDocumentButton'
import { ManageMemberSection } from './ManageMemberSection'
import { InstructorAccess } from './InstructorAccess'
import { RemoveMemberButton } from './RemoveMemberButton'
import { ReminderDateCell } from '@/components/documents/ReminderDateCell'
import { ReminderDueBadge } from '@/components/documents/ReminderDueBadge'
import { Th, Td, TableActions } from '@/components/ui/Table'
import { EmptyState } from '@/components/EmptyState'
import { deleteDocumentAction, updateDocumentReminderDateAction, updateContactInfoAction, setCanInstructAction, revokeInviteTokenAction, removeMemberAction } from './actions'
import { Button } from '@/components/ui/Button'
import type { TrainerDocument, RiderDocument, Agreement, Profile } from '@/lib/db/types'
import { formatFee } from '@/lib/format-currency'
import { RECORD_TYPE_LABELS } from '@/lib/document-record-types'

function ContactInfo({
  profile,
  slug,
  isOwnPage,
}: {
  profile: Profile | null
  slug: string
  isOwnPage: boolean
}) {
  return (
    <section className="mb-10">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          Contact Info
        </h2>
        {isOwnPage && (
          <Button variant="ghost" href={`/profile?barn=${slug}`}>
            Edit
          </Button>
        )}
      </div>
      <dl className="space-y-1 text-sm text-zinc-700 dark:text-zinc-300">
        <div>
          <dt className="inline text-zinc-500 dark:text-zinc-400">Phone: </dt>
          <dd className="inline">{profile?.phone ?? '—'}</dd>
        </div>
        <div>
          <dt className="inline text-zinc-500 dark:text-zinc-400">Emergency Contact Name: </dt>
          <dd className="inline">{profile?.emergency_contact_name ?? '—'}</dd>
        </div>
        <div>
          <dt className="inline text-zinc-500 dark:text-zinc-400">Emergency Contact Phone: </dt>
          <dd className="inline">{profile?.emergency_contact_phone ?? '—'}</dd>
        </div>
      </dl>
    </section>
  )
}

const AGREEMENT_KIND_LABELS: Record<Agreement['kind'], string> = {
  lease: 'Lease',
  board: 'Boarding',
}

function ActiveAgreements({
  slug,
  agreements,
  horseNames,
  linkable,
}: {
  slug: string
  agreements: Agreement[]
  horseNames: Map<string, string>
  linkable: boolean
}) {
  return (
    <section className="mb-8">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
        Active Agreements
      </h2>
      {agreements.length > 0 ? (
        <div className="flex flex-col gap-2">
          {agreements.map((agreement) => (
            <Card
              key={agreement.id}
              href={linkable ? `/barn/${slug}/agreements/${agreement.id}` : undefined}
              className="p-3"
            >
              <p className="text-sm text-zinc-700 dark:text-zinc-300">
                {AGREEMENT_KIND_LABELS[agreement.kind]} · {horseNames.get(agreement.horse_id) ?? '—'} ·{' '}
                {formatFee(agreement.fee)}
                {agreement.cadence === 'monthly' ? '/month' : ''}
              </p>
            </Card>
          ))}
        </div>
      ) : (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">No active agreements</p>
      )}
    </section>
  )
}

export default async function MemberDetailPage({
  params,
}: {
  params: Promise<{ slug: string; membership_id: string }>
}) {
  const { slug, membership_id } = await params

  const { user, barn, membership: callerMembership } = await requireMembership(slug, [
    'manager',
    'trainer',
    'rider',
  ])

  const targetMembership = await getMembershipByIdForBarn(membership_id, barn.id)
  if (!targetMembership || targetMembership.barn_id !== barn.id) notFound()

  const isOwnPage = targetMembership.user_id === user.id
  const callerRole = callerMembership.role
  const targetRole = targetMembership.role

  // Documents keeps a narrower "manager or self" gate (canViewDocuments) even though page access
  // and Contact Info (#863) are both open to any active barn member. #864: viewing and managing
  // (upload/delete) diverge for a self-viewing rider, so they're two booleans now instead of one
  // shared canUpload.
  const canViewDocuments =
    callerRole === 'manager' ||
    (callerRole === 'trainer' && isOwnPage) ||
    (callerRole === 'rider' && isOwnPage)
  const canManageDocuments = canManage(callerRole, isOwnPage)

  // agreements RLS only grants SELECT to the barn manager and the rider themself —
  // a trainer's query would be silently filtered to zero rows, showing a false "no agreements" status
  const canViewAgreements = targetRole === 'rider' && (callerRole === 'manager' || isOwnPage)

  let activeAgreements: Agreement[] = []
  let agreementHorseNames = new Map<string, string>()
  if (canViewAgreements) {
    activeAgreements = await getActiveAgreementsForRider(barn.id, targetMembership.id)
    agreementHorseNames = await resolveHorseNames(
      activeAgreements.map((a) => a.horse_id),
      barn.id
    )
  }

  const targetProfile = await getProfileById(targetMembership.profile_id)
  const displayName = targetProfile
    ? `${targetProfile.first_name} ${targetProfile.last_name}`
    : targetMembership.id

  const canEditContactInfo = callerRole === 'manager' && targetProfile?.is_managed === true
  const boundUpdateContactInfo = updateContactInfoAction.bind(null, slug, membership_id)

  const canManageInstructorAccess =
    callerRole === 'manager' && (targetRole === 'manager' || targetRole === 'trainer')

  const canRemoveMember =
    callerRole === 'manager' && targetMembership.user_id !== user.id && targetRole !== 'manager'

  const canManageInvite =
    callerRole === 'manager' && targetProfile?.is_managed === true && targetMembership.invite_token !== null

  type DocWithUrl = { doc: TrainerDocument | RiderDocument; signedUrl: string }
  let docsWithUrls: DocWithUrl[] = []

  if (canViewDocuments) {
    if (targetRole === 'rider') {
      docsWithUrls = await getDocumentsWithUrls('rider', targetMembership.id, barn.id)
    } else {
      docsWithUrls = await getDocumentsWithUrls('trainer', targetMembership.id, barn.id)
    }
  }

  const boundDelete = deleteDocumentAction.bind(null, slug, membership_id)
  const boundReminderDate = updateDocumentReminderDateAction.bind(null, slug, membership_id)
  const canEditReminderDate = callerRole === 'manager'
  const docEntity = targetRole === 'rider' ? 'rider' : 'trainer'
  const addDocumentHref = `/barn/${slug}/documents/new?entity=${docEntity}&id=${membership_id}`

  return (
    <main className="mx-auto max-w-3xl px-4 py-12">
      <div className="mb-8 flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
          {displayName}
        </h1>
        {canRemoveMember && (
          <RemoveMemberButton action={removeMemberAction.bind(null, slug, membership_id)} name={displayName} />
        )}
      </div>

      {canManageInvite && targetMembership.invite_token !== null && (
        <ManageMemberSection
          barnSlug={slug}
          inviteToken={targetMembership.invite_token}
          revokeAction={revokeInviteTokenAction.bind(null, slug, membership_id)}
        />
      )}

      {canViewAgreements && (
        <ActiveAgreements
          slug={slug}
          agreements={activeAgreements}
          horseNames={agreementHorseNames}
          linkable={callerRole === 'manager'}
        />
      )}

      {/* #863: any active barn member can view any other's Contact Info — page access above is already the gate */}
      {canEditContactInfo && targetProfile ? (
        <ContactInfoForm profile={targetProfile} action={boundUpdateContactInfo} />
      ) : (
        <ContactInfo profile={targetProfile} slug={slug} isOwnPage={isOwnPage} />
      )}

      {canManageInstructorAccess && (
        <InstructorAccess
          name={displayName}
          canInstruct={targetMembership.can_instruct}
          action={setCanInstructAction.bind(null, slug, targetMembership.id, !targetMembership.can_instruct)}
        />
      )}

      {canViewDocuments && (
      <section className="mb-10">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Documents
          </h2>
          {canManageDocuments && <Button href={addDocumentHref}>Add Document</Button>}
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
                  <Th align="right">Actions</Th>
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
                        {canEditReminderDate ? (
                          <ReminderDateCell docId={doc.id} initialValue={doc.reminder_date} action={boundReminderDate} />
                        ) : (
                          doc.reminder_date ?? '—'
                        )}
                        <ReminderDueBadge reminderDate={doc.reminder_date} />
                      </div>
                    </Td>
                    <TableActions>
                      {canManageDocuments && (
                        <DeleteDocumentButton docId={doc.id} storagePath={doc.storage_path} action={boundDelete} />
                      )}
                    </TableActions>
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
    </main>
  )
}
