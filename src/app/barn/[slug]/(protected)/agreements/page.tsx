import { requireMembership } from '@/lib/auth/guard'
import { getAgreementsByBarn } from '@/lib/db/agreements'
import { resolveMemberNames } from '@/lib/db/barn-memberships'
import { resolveHorseNames } from '@/lib/db/horses'
import { Button } from '@/components/ui/Button'
import { Th, Td, TableActions } from '@/components/ui/Table'
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
        <table className="mt-6 w-full">
          <thead>
            <tr>
              <Th>Rider</Th>
              <Th>Horse</Th>
              <Th>Fee</Th>
              <Th>Status</Th>
              <Th />
            </tr>
          </thead>
          <tbody>
            {agreements.map((a) => (
              <tr key={a.id}>
                <Td>{riderNames.get(a.rider_id) ?? '—'}</Td>
                <Td>{horseNames.get(a.horse_id) ?? '—'}</Td>
                <Td>{formatFee(a.fee)}</Td>
                <Td tone="secondary">{a.is_active ? 'Active' : 'Ended'}</Td>
                <TableActions>
                  <Button href={`/barn/${slug}/agreements/${a.id}`} variant="ghost">
                    View
                  </Button>
                  <Button href={`/barn/${slug}/agreements/${a.id}/edit`} variant="ghost">
                    Edit
                  </Button>
                </TableActions>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  )
}
