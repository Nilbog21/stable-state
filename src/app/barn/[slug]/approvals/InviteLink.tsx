'use client'

import { useState, useEffect } from 'react'

export default function InviteLink({ slug }: { slug: string }) {
  const [url, setUrl] = useState('')
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    setUrl(`${window.location.origin}/barn/${slug}/register`)
  }, [slug])

  async function handleCopy() {
    await navigator.clipboard.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <section className="mb-12">
      <h2 className="mb-4 text-lg font-semibold text-zinc-900 dark:text-zinc-50">
        Invite Link
      </h2>
      <div className="flex gap-2">
        <input
          type="text"
          readOnly
          value={url}
          className="flex-1 rounded border border-zinc-300 px-3 py-2 text-sm text-zinc-900 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-50"
        />
        <button
          type="button"
          onClick={handleCopy}
          className="rounded bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
        >
          {copied ? 'Copied!' : 'Copy'}
        </button>
      </div>
    </section>
  )
}
