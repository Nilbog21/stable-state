import { notFound } from 'next/navigation'
import { requireMembership } from '@/lib/auth/guard'
import { getAgreementById, getChargesForAgreement, getAgreementStatusLabel } from '@/lib/db/agreements'
import { resolveMemberNames } from '@/lib/db/member-names'
import { resolveHorseNames } from '@/lib/db/horses'
import { Button } from '@/components/ui/Button'
import { ChargesTable } from './ChargesTable'
import { formatFee } from '@/lib/format-currency'

export default async function AgreementDetailPage({
  params,
}: {
  params: Promise<{ slug: string; id: string }>
}) {
  const { slug, id } = await params
  const { barn } = await requireMembership(slug, ['manager'])

  const agreement = await getAgreementById(id, barn.id)
  if (!agreement) notFound()

  const [charges, riderNames, horseNames] = await Promise.all([
    getChargesForAgreement(id, barn.id),
    resolveMemberNames([agreement.rider_id], barn.id),
    resolveHorseNames([agreement.horse_id], barn.id),
  ])

  const label = agreement.kind === 'lease' ? 'Lease' : 'Boarding'
  const cadenceLabel = agreement.cadence === 'monthly' ? 'Monthly' : 'One time'

  return (
    <main className="mx-auto max-w-3xl px-4 py-12">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
          {label} Detail
        </h1>
        <Button href={`/barn/${slug}/agreements/${id}/edit?kind=${agreement.kind}`} variant="secondary">
          Edit
        </Button>
      </div>

      <dl className="mt-6 grid grid-cols-2 gap-4 text-sm">
        <div>
          <dt className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Rider</dt>
          <dd className="text-zinc-900 dark:text-zinc-50">{riderNames.get(agreement.rider_id) ?? '—'}</dd>
        </div>
        <div>
          <dt className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Horse</dt>
          <dd className="text-zinc-900 dark:text-zinc-50">{horseNames.get(agreement.horse_id) ?? '—'}</dd>
        </div>
        <div>
          <dt className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Fee</dt>
          <dd className="text-zinc-900 dark:text-zinc-50">{formatFee(agreement.fee)}</dd>
        </div>
        <div>
          <dt className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Cadence</dt>
          <dd className="text-zinc-900 dark:text-zinc-50">{cadenceLabel}</dd>
        </div>
        <div>
          <dt className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Status</dt>
          <dd className="text-zinc-900 dark:text-zinc-50">{getAgreementStatusLabel(agreement)}</dd>
        </div>
      </dl>

      <ChargesTable charges={charges} barnSlug={slug} />
    </main>
  )
}
