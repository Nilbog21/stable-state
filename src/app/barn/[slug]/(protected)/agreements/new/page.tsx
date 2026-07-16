import { requireMembership } from '@/lib/auth/guard'
import { getActiveMembersWithProfiles } from '@/lib/db/barn-memberships'
import { getHorsesByBarn } from '@/lib/db/horses'
import { getBarnDefaultBoardFee } from '@/lib/db/agreements'
import { createAgreementAction } from '../actions'
import { AgreementForm } from '../AgreementForm'
import type { AgreementKind } from '@/lib/db/types'

export default async function NewAgreementPage({
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

  const [riderMembers, horses, defaultBoardFee] = await Promise.all([
    getActiveMembersWithProfiles(barn.id, 'rider'),
    getHorsesByBarn(barn.id),
    kind === 'board' ? getBarnDefaultBoardFee(barn.id) : Promise.resolve(undefined),
  ])
  const riders = riderMembers.map((m) => ({ id: m.membershipId, name: m.name }))

  const save = createAgreementAction.bind(null, slug, kind)

  return (
    <main className="mx-auto max-w-md px-4 py-12">
      <h1 className="mb-8 text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
        Add {label}
      </h1>
      <AgreementForm
        mode="new"
        kind={kind}
        riders={riders}
        horses={horses}
        defaultStartDate={new Date().toISOString().slice(0, 10)}
        defaultBoardFee={defaultBoardFee}
        onSave={save}
      />
    </main>
  )
}
