import { notFound } from 'next/navigation'
import { readFileSync } from 'fs'
import path from 'path'
import ReactMarkdown from 'react-markdown'
import { getAuthenticatedUser } from '@/lib/db/auth'
import { getBarnBySlug } from '@/lib/db/barns'
import { getUserMembership } from '@/lib/db/barn-memberships'
import type { Role } from '@/lib/db/types'

const GUIDE_FILES: Record<Role, string> = {
  manager: 'USER_GUIDE_MANAGER.md',
  trainer: 'USER_GUIDE_TRAINER.md',
  rider: 'USER_GUIDE_RIDER.md',
}

export default async function GuidePage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params

  const barn = await getBarnBySlug(slug)
  if (!barn) notFound()

  const user = await getAuthenticatedUser()
  if (!user) notFound()

  const membership = await getUserMembership(user.id, barn.id)
  if (!membership || membership.status !== 'active') notFound()

  const content = readFileSync(
    path.join(process.cwd(), GUIDE_FILES[membership.role]),
    'utf-8'
  )

  return (
    <main className="mx-auto max-w-3xl px-4 py-12">
      <div className="prose prose-zinc max-w-none dark:prose-invert">
        <ReactMarkdown>{content}</ReactMarkdown>
      </div>
    </main>
  )
}
