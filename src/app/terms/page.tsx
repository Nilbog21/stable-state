import { notFound } from 'next/navigation'
import { readFileSync } from 'fs'
import path from 'path'
import Link from 'next/link'
import { MarkdownDocument } from '@/components/MarkdownDocument'

export default async function TermsPage() {
  let content: string
  try {
    content = readFileSync(path.join(process.cwd(), 'TERMS_OF_SERVICE.md'), 'utf-8')
  } catch {
    return notFound()
  }

  return (
    <>
      <nav className="border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
        <Link
          href="/barns"
          className="text-sm font-medium text-zinc-700 dark:text-zinc-300 active:text-zinc-500"
        >
          ← Back
        </Link>
      </nav>
      <main className="mx-auto max-w-3xl px-4 py-12">
        <MarkdownDocument content={content} />
      </main>
    </>
  )
}
