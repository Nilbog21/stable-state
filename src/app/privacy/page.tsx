import { readFileSync } from 'fs'
import path from 'path'
import ReactMarkdown from 'react-markdown'

export const metadata = {
  title: 'Privacy Policy — Stable State',
}

export default function PrivacyPage() {
  const content = readFileSync(path.join(process.cwd(), 'PRIVACY_POLICY.md'), 'utf-8')

  return (
    <main className="mx-auto max-w-3xl px-4 py-12">
      <div className="prose prose-zinc max-w-none dark:prose-invert">
        <ReactMarkdown>{content}</ReactMarkdown>
      </div>
    </main>
  )
}
