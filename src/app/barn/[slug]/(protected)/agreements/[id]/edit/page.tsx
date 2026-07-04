import { notFound } from 'next/navigation'
import { requireMembership } from '@/lib/auth/guard'
import { getAgreementById } from '@/lib/db/agreements'
import { resolveMemberNames } from '@/lib/db/barn-memberships'
import { resolveHorseNames } from '@/lib/db/horses'
import { updateAgreementAction, endAgreementAction } from '../../actions'
import { AgreementForm } from '../../AgreementForm'
import { EndAgreementButton } from '../../EndAgreementButton'

export default async function EditAgreementPage({
  params,
}: {
  params: Promise<{ slug: string; id: string }>
}) {
  const { slug, id } = await params
  const { barn } = await requireMembership(slug, ['manager'])

  const agreement = await getAgreementById(id, barn.id)
  if (!agreement) notFound()

  const [riderNames, horseNames] = await Promise.all([
    resolveMemberNames([agreement.rider_id], barn.id),
    resolveHorseNames([agreement.horse_id], barn.id),
  ])

  const save = updateAgreementAction.bind(null, slug, id)
  const end = endAgreementAction.bind(null, slug, id)
  const label = agreement.kind === 'lease' ? 'Lease' : 'Boarding'

  return (
    <main className="mx-auto max-w-md px-4 py-12">
      <h1 className="mb-8 text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
        Edit {label}
      </h1>
      <AgreementForm
        mode="edit"
        kind={agreement.kind}
        initialAgreement={agreement}
        riderName={riderNames.get(agreement.rider_id) ?? '—'}
        horseName={horseNames.get(agreement.horse_id) ?? '—'}
        onSave={save}
      />
      {agreement.is_active && (
        <div className="mt-6">
          <EndAgreementButton action={end} />
        </div>
      )}
    </main>
  )
}
