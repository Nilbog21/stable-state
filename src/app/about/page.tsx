import { readFileSync } from 'fs'
import path from 'path'
import Link from 'next/link'
import { parseLatestVersion } from '@/lib/changelog'

export const metadata = {
  title: 'About — Stable State',
}

function getCurrentVersion(): string | null {
  try {
    const content = readFileSync(path.join(process.cwd(), 'CHANGELOG.md'), 'utf-8')
    return parseLatestVersion(content)
  } catch {
    return null
  }
}

export default function AboutPage() {
  const version = getCurrentVersion()

  return (
    <main className="mx-auto max-w-3xl px-4 py-12">
      <div className="prose prose-zinc max-w-none dark:prose-invert">
        <h1>Stable State</h1>
        <p>
          Stable State is a multi-tenant lesson-tracking application for equestrian barns. Each
          barn manages its own horses, riders, and lesson records — barn managers oversee
          membership and finances, trainers book and submit lessons, and riders track their own
          lesson history.
        </p>
        <ul>
          <li>
            <Link href="/changelog">Changelog{version && ` — Version ${version}`}</Link>
          </li>
          <li>
            <Link href="/terms">Terms of Service</Link>
          </li>
          <li>
            <Link href="/privacy">Privacy Policy</Link>
          </li>
        </ul>
      </div>
    </main>
  )
}
