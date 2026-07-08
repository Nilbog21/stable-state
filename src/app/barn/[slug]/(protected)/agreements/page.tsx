import { requireMembership } from '@/lib/auth/guard'
import { getAgreementsByBarn, getAgreementStatusLabel } from '@/lib/db/agreements'
import { resolveMemberNames } from '@/lib/db/barn-memberships'
import { resolveHorseNames } from '@/lib/db/horses'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { EmptyState } from '@/components/EmptyState'
import type { AgreementKind } from '@/lib/db/types'

function formatFee(fee: number): string {
  return fee.toLocaleString('en-US', { style: 'currency', currency: 'USD' })
}

export default async function AgreementsPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ kind?: string }>
}) {
  const { slug } = await params
  const { barn } = await requireMembership(slug, ['manager'])

  const { kind: kindParam } = await searchParams
  const kind: AgreementKind = kindParam === 'board' ? 'board' : 'lease'
  const label = kind === 'lease' ? 'Lease' : 'Boarding'
  const title = kind === 'lease' ? 'Leases' : 'Boarding'
  const addHref = `/barn/${slug}/agreements/new?kind=${kind}`

  const agreements = await getAgreementsByBarn(barn.id, kind)
  const [riderNames, horseNames] = await Promise.all([
    resolveMemberNames(
      agreements.map((a) => a.rider_id),
      barn.id
    ),
    resolveHorseNames(
      agreements.map((a) => a.horse_id),
      barn.id
    ),
  ])

  return (
    <main className="mx-auto max-w-3xl px-4 py-12">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">{title}</h1>
        <Button href={addHref}>Add {label}</Button>
      </div>

      {agreements.length === 0 ? (
        <EmptyState
          heading={`No ${title.toLowerCase()} yet`}
          subtext={`${title} you create will appear here.`}
        />
      ) : (
        <div className="mt-6 flex flex-col gap-2">
          {agreements.map((a) => (
            <Card key={a.id} href={`/barn/${slug}/agreements/${a.id}`} className="p-4">
              <p className="font-medium text-zinc-900 dark:text-zinc-50">
                {riderNames.get(a.rider_id) ?? '—'}
              </p>
              <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                {horseNames.get(a.horse_id) ?? '—'}
              </p>
              <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                {formatFee(a.fee)} · {getAgreementStatusLabel(a)}
              </p>
            </Card>
          ))}
        </div>
      )}
    </main>
  )
}
