import { notFound } from 'next/navigation'
import { getBarnBySlug } from '@/lib/db/barns'

export default async function BarnPendingPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const barn = await getBarnBySlug(slug)

  if (!barn) {
    notFound()
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-white dark:bg-black">
      <h1 className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
        Approval pending
      </h1>
      <p className="max-w-sm text-center text-zinc-500 dark:text-zinc-400">
        Your request to join <strong className="text-zinc-900 dark:text-zinc-50">{barn.name}</strong> is
        pending approval by a manager. You will gain access once approved.
      </p>
    </main>
  )
}
