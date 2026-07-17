import { notFound } from 'next/navigation'
import { readFileSync } from 'fs'
import path from 'path'
import ReactMarkdown from 'react-markdown'

export default async function TermsPage() {
  let content: string
  try {
    content = readFileSync(path.join(process.cwd(), 'TERMS_OF_SERVICE.md'), 'utf-8')
  } catch {
    return notFound()
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-12">
      <div className="prose prose-zinc max-w-none dark:prose-invert">
        <ReactMarkdown>{content}</ReactMarkdown>
      </div>
    </main>
  )
}
