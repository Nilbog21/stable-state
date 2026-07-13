import { notFound, redirect } from 'next/navigation'
import { getAuthenticatedUser } from '@/lib/db/auth'
import { getBarnBySlug } from '@/lib/db/barns'
import { getUserMembership, getMembershipByIdForBarn } from '@/lib/db/barn-memberships'
import { getProfileById } from '@/lib/db/profiles'
import { getDocuments } from '@/lib/db/documents'
import { getSignedUrl } from '@/lib/db/document-storage'
import { getActiveAgreementsForRider } from '@/lib/db/agreements'
import { resolveHorseNames } from '@/lib/db/horses'
import { Card } from '@/components/ui/Card'
import { ContactInfoForm } from './ContactInfoForm'
import { DeleteDocumentButton } from './DeleteDocumentButton'
import { ReminderDateCell } from '@/components/documents/ReminderDateCell'
import { ReminderDueBadge } from '@/components/documents/ReminderDueBadge'
import { Th, Td, TableActions } from '@/components/ui/Table'
import { EmptyState } from '@/components/EmptyState'
import { deleteDocumentAction, updateDocumentReminderDateAction, updateContactInfoAction, setCanInstructAction } from './actions'
import { Button } from '@/components/ui/Button'
import type { TrainerDocument, RiderDocument, Agreement, Profile, BarnMembership } from '@/lib/db/types'

const RECORD_TYPE_LABELS: Record<string, string> = {
  instructor_contract: 'Instructor Contract',
  liability_waiver: 'Liability Waiver',
  lease_agreement: 'Lease Agreement',
  boarding_contract: 'Boarding Contract',
  other: 'Other',
}

function formatFee(fee: number): string {
  return fee.toLocaleString('en-US', { style: 'currency', currency: 'USD' })
}

function ContactInfo({ profile }: { profile: Profile | null }) {
  return (
    <section className="mb-10">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
        Contact Info
      </h2>
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

function InstructorAccess({ slug, targetMembership }: { slug: string; targetMembership: BarnMembership }) {
  return (
    <section className="mb-8">
      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
        Instructor Access
      </h2>
      <form action={setCanInstructAction.bind(null, slug, targetMembership.id, !targetMembership.can_instruct)}>
        <p className="mb-2 text-sm text-zinc-700 dark:text-zinc-300">
          {targetMembership.can_instruct
            ? 'Can be assigned as an instructor.'
            : 'Cannot be assigned as an instructor.'}
        </p>
        <Button type="submit" variant={targetMembership.can_instruct ? 'danger' : 'primary'}>
          {targetMembership.can_instruct ? 'Revoke Instructor Access' : 'Grant Instructor Access'}
        </Button>
      </form>
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

  const barn = await getBarnBySlug(slug)
  if (!barn) notFound()

  const user = await getAuthenticatedUser()
  if (!user) redirect(`/barn/${slug}/login`)

  const callerMembership = await getUserMembership(user.id, barn.id)
  if (!callerMembership || callerMembership.status !== 'active') redirect(`/barn/${slug}/login`)

  const targetMembership = await getMembershipByIdForBarn(membership_id, barn.id)
  if (!targetMembership || targetMembership.barn_id !== barn.id) notFound()

  const isOwnPage = targetMembership.user_id === user.id
  const callerRole = callerMembership.role
  const targetRole = targetMembership.role

  // #779: any active barn member can now open this page, but Contact Info is unchanged —
  // it keeps the pre-#779 access rule (previously the page's own canAccess gate; nothing
  // else can reach it now that page access is broadened) since AC #5 leaves it untouched.
  const canViewContactInfo =
    callerRole === 'manager' ||
    (callerRole === 'trainer' && (isOwnPage || targetRole === 'rider')) ||
    (callerRole === 'rider' && isOwnPage)

  // Documents is the section that narrows under #779, not page access. canUpload's
  // "manager or self" scope already is that rule, so it also gates Documents visibility
  // below; keep them coupled rather than duplicating the same expression under a second name.
  const canUpload =
    callerRole === 'manager' ||
    (callerRole === 'trainer' && isOwnPage) ||
    (callerRole === 'rider' && isOwnPage)

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

  type DocWithUrl = { doc: TrainerDocument | RiderDocument; signedUrl: string }
  let docsWithUrls: DocWithUrl[] = []

  if (canUpload) {
    if (targetRole === 'rider') {
      const docs = await getDocuments('rider', targetMembership.id, barn.id)
      docsWithUrls = await Promise.all(
        docs.map(async (doc) => ({ doc, signedUrl: await getSignedUrl(doc.storage_path) }))
      )
    } else {
      const docs = await getDocuments('trainer', targetMembership.id, barn.id)
      docsWithUrls = await Promise.all(
        docs.map(async (doc) => ({ doc, signedUrl: await getSignedUrl(doc.storage_path) }))
      )
    }
  }

  const boundDelete = deleteDocumentAction.bind(null, slug, membership_id)
  const boundReminderDate = updateDocumentReminderDateAction.bind(null, slug, membership_id)
  const canEditReminderDate = callerRole === 'manager'
  const docEntity = targetRole === 'rider' ? 'rider' : 'trainer'
  const addDocumentHref = `/barn/${slug}/documents/new?entity=${docEntity}&id=${membership_id}`

  return (
    <main className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="mb-8 text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
        {displayName}
      </h1>

      {canViewAgreements && (
        <ActiveAgreements
          slug={slug}
          agreements={activeAgreements}
          horseNames={agreementHorseNames}
          linkable={callerRole === 'manager'}
        />
      )}

      {canViewContactInfo && (canEditContactInfo && targetProfile ? (
        <ContactInfoForm profile={targetProfile} action={boundUpdateContactInfo} />
      ) : (
        <ContactInfo profile={targetProfile} />
      ))}

      {canManageInstructorAccess && <InstructorAccess slug={slug} targetMembership={targetMembership} />}

      {canUpload && (
      <section className="mb-10">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Documents
          </h2>
          {canUpload && <Button href={addDocumentHref}>Add Document</Button>}
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
                      {canUpload && (
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
